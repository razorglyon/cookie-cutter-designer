<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import FileUpload from './lib/components/ui/FileUpload.svelte';
  import TracingPresetPicker from './lib/components/ui/TracingPresetPicker.svelte';
  import type { PhotoTraceResult } from './lib/import/photoImport';
  import { validateImageFile } from './lib/import/imageValidation';
  import { DEFAULT_TRACING_PRESET, TRACING_PRESETS, type TracingPresetId } from './lib/import/tracingPresets';

  import { importImage, clipboardImageFiles, isEditablePasteTarget, selectSingleImage } from './lib/import/imageImport';
  import ParameterPanel from './lib/components/ui/ParameterPanel.svelte';
  import ThreeViewer from './lib/components/viewer/ThreeViewer.svelte';
  import ShapeLibrary from './lib/components/ui/ShapeLibrary.svelte';
  import HistoryPanel from './lib/components/ui/HistoryPanel.svelte';

  import {
    uploadedFile,
    model,
    isProcessing,
    error,
    params,
    setParams,
    updateParams,
    publishGenerationState,
    generationState
  } from './lib/stores/cookieCutterStore';
  import ProjectManager from './lib/components/ui/ProjectManager.svelte';
  import RecoveryPanel from './lib/components/ui/RecoveryPanel.svelte';
  import { createProjectRecovery } from './lib/projects/projectRecovery';
  import { canonicalProjectRecoverySnapshot, createIndexedDbProjectRecoveryStorage, type ProjectRecoveryStorage, type ProjectRecoveryEnvelope } from './lib/projects/projectRecoveryStorage';
  import { encodeProject } from './lib/projects/projectCodec';
  import LocalProjectLibrary from './lib/components/library/LocalProjectLibrary.svelte';
  import ProjectConfirmDialog from './lib/components/ui/ProjectConfirmDialog.svelte';
  import { createDesignSessionStore, type DesignSessionStore } from './lib/stores/designSessionStore';
  import { createIndexedDbProjectStorage, type ProjectStorage } from './lib/projects/projectStorage';
  import { createProjectWorkflow } from './lib/projects/projectWorkflow';
  import { createProjectSessionIntegration, assertRepresentable } from './lib/projects/projectSessionIntegration';
  import { createDesignDocument } from './lib/projects/createDesignDocument';
  import { documentParametersToLegacy, legacyParametersToDocument } from './lib/stores/legacyDocumentAdapter';
  import type { DesignDocument, ViewportPreferences, DesignSource } from './lib/domain/designDocument';
  import { historyStore } from './lib/stores/historyStore';
  import {
    cleanSVG,
    terminateImageProcessor
  } from './lib/utils/imageProcessor';
  import { exportToSTL, estimateSTLSize, formatFileSize } from './lib/utils/stlExporter';
  import { applyMaterialToMesh, type MaterialPreset } from './lib/utils/materialManager';
  import type { SavedDesign } from './lib/utils/cloudGallery';
  import { disposeObject3D } from './lib/utils/disposeThree';
  import { createGenerationOrchestrator } from './lib/generation/generationOrchestrator';
  import { RecipeRegistry } from './lib/generation/recipeRegistry';
  import {
    isGenerationPending,
    type GenerationResult,
    type GenerationState
  } from './lib/generation/generationState';
  import type { CookieCutterParams } from './lib/types/CookieCutter';
  import type { Mesh, Group } from 'three';
  import * as THREE from 'three';

  type ModelObject = Mesh | Group;
  type ModelDimensions = Readonly<{ width: number; depth: number; height: number }>;
  type Category =
    | 'projects'
    | 'upload'
    | 'params'
    | 'shapes'
    | 'advanced'
    | 'ai'
    | 'gallery'
    | 'materials'
    | 'preview'
    | 'batch'
    | 'export';

  let currentMesh: ModelObject | null = null;
  let fileName = '';
  let svgCache: string | null = null;
  let sourceRevision = 0;
  let restoringHistory: { key: string; epoch: number } | null = null;
  let activeCategory: Category = 'upload';
  // Presentation only: session still owns the document, history and generation.
  let mobileView3D = false;
  let mobileCreateMenu = false;
  let mobileWorkshop: 'sketch' | 'bridges' | 'more' = 'sketch';
  let panelContent: HTMLDivElement;
  function selectMobileCategory(category: Category): void {
    mobileCreateMenu = false;
    mobileView3D = false;
    activeCategory = category;
    void tick().then(() => { if (alive && panelContent) panelContent.scrollTop = 0; });
  }
  function openMobileCreate(): void {
    mobileView3D = false;
    mobileCreateMenu = true;
  }
  function showMobile3D(): void {
    mobileCreateMenu = false;
    mobileView3D = true;
  }
  let StartScreen: typeof import('./lib/components/ui/StartScreen.svelte').default | null = null;
  let startScreenError: string | null = null;
  onMount(() => {
    void import('./lib/components/ui/StartScreen.svelte').then(module => {
      if (alive) StartScreen = module.default;
    }).catch(cause => {
      if (alive) startScreenError = String(cause);
    });
  });
  let darkMode = false;
  let vectorizationController: AbortController | null = null;
  let importPending = false;
  let tracingPreset: TracingPresetId = DEFAULT_TRACING_PRESET;
  let pendingPreset: TracingPresetId = DEFAULT_TRACING_PRESET;
  type PhotoDraft = { file: File; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; epoch: number; revision: number; snapshot: DesignDocument | null; kind: 'import' | 'retrace' };
  let photoDraft: PhotoDraft | null = null;
  let PhotoImportReview: typeof import('./lib/components/ui/PhotoImportReview.svelte').default | null = null;
  let photoReviewError: string | null = null;
  // Original bytes are session-only, never added to the V1 document/codec.
  let sessionRaster: { file: File; epoch: number } | null = null;
  let retracingSnapshot: ReturnType<typeof session.getDocument> = null;
  let importError: string | null = null;
  const THEME_STORAGE_KEY = 'cookie-cutter-theme';
  let publishedGenerationResult: GenerationResult | null = null;
  let scheduledProjectEpoch = -1;
  const generatedMeshEpochs = new WeakMap<THREE.Object3D, number>();
  let externalExport: { mesh: ModelObject; params: Readonly<CookieCutterParams> | undefined; current: () => boolean } | null = null;

  function geometryKey(document: DesignDocument): string {
    // Match the integration's semantic generation key, not name/timestamps/view.
    return JSON.stringify([document.kind, document.sketch, document.parameters, document.schemaVersion !== 1 ? document.bridges : [], document.schemaVersion === 3 ? document.layout : null]);
  }

  function captureGeometryExport(): { mesh: ModelObject; params: Readonly<CookieCutterParams> | undefined; filename: string } | null {
    if (!alive || !currentMesh) return null;
    if (unavailableReason !== null) {
      // External batches own a separate publication/context proof; never fall
      // back to the retained single-design preview or mutable legacy parameters.
      if (!externalExport || externalExport.mesh !== currentMesh || !externalExport.current()) return null;
      return { mesh: currentMesh, params: externalExport.params, filename: fileName };
    }
    const document = session.getDocument();
    const state = generationOrchestrator.getState();
    if (!document || state.phase !== 'ready'
      || state.result.artifacts[0].object !== currentMesh
      || generatedMeshEpochs.get(currentMesh) !== session.getSessionEpoch()
      || geometryKey(state.result.document) !== geometryKey(document)) return null;
    try {
      return { mesh: currentMesh, params: documentParametersToLegacy(document), filename: document.source.fileName };
    } catch { return null; }
  }

  let geometryExportAvailable = false;
  // DOM state is advisory: every handler also queries the synchronous owner.
  $: {
    // Explicit dependencies: the live query intentionally reads owner state,
    // not potentially stale child props or an earlier derived snapshot.
    void $session; void $generationState; void currentMesh;
    void unavailableReason; void externalExport; void sourceRevision;
    geometryExportAvailable = captureGeometryExport() !== null;
  }
  $: geometryExportReason = geometryExportAvailable ? null : 'Générez le modèle actuel avant d’exporter sa géométrie.';
  const pendingExternalDisposals = new Set<ModelObject>();
  const pendingBatchObjects = new Set<ModelObject>();
  const disposedExternalObjects = new WeakSet<THREE.Object3D>();

  const recipeRegistry = new RecipeRegistry();
  recipeRegistry.register('cutter', async () =>
    (await import('./lib/generation/recipes/cutterRecipe')).cutterRecipe
  );
  recipeRegistry.register('multi-cutter', async () =>
    (await import('./lib/generation/recipes/multiCutterRecipe')).multiCutterRecipe
  );
  recipeRegistry.register('stamp', async () =>
    (await import('./lib/generation/recipes/stampRecipe')).stampRecipe
  );

  const generationOrchestrator = createGenerationOrchestrator({
    registry: recipeRegistry,
    debounceMs: 300,
    onStateChange: handleGenerationStateChange,
    afterResultChange: completeGenerationPublication
  });
  publishGenerationState(generationOrchestrator.getState());

  function applyTheme(nextDarkMode: boolean): void {
    darkMode = nextDarkMode;
    document.documentElement.classList.toggle('dark-mode', darkMode);
  }

  function measureModel(object: THREE.Object3D): ModelDimensions {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    return { width: size.x, depth: size.z, height: size.y };
  }

  function toggleDarkMode() {
    applyTheme(!darkMode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Theme persistence is optional when storage is unavailable.
    }
  }

  onMount(() => {
    let prefersDark = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;

    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === 'dark' || savedTheme === 'light') {
        prefersDark = savedTheme === 'dark';
      }
    } catch {
      // Fall back to the operating-system preference.
    }

    applyTheme(prefersDark);
  });

  function isModelObject(object: THREE.Object3D): object is ModelObject {
    return object instanceof THREE.Mesh || object instanceof THREE.Group;
  }

  function disposeExternalObject(object: ModelObject): void {
    if (disposedExternalObjects.has(object)) return;
    disposedExternalObjects.add(object);
    disposeObject3D(object);
  }

  function handleGenerationStateChange(state: GenerationState): void {
    const object = state.result?.artifacts[0].object;
    if (state.phase === 'ready' && object && !generatedMeshEpochs.has(object)) {
      generatedMeshEpochs.set(object, scheduledProjectEpoch);
    }
    publishGenerationState(state);
    $isProcessing = isGenerationPending(state);
    $error = state.error?.message ?? null;

    if (state.result === publishedGenerationResult) return;

    const previousMesh = currentMesh;
    const previousGeneratedObject = publishedGenerationResult?.artifacts[0].object ?? null;
    const nextObject = state.result?.artifacts[0].object ?? null;
    const nextMesh = nextObject !== null && isModelObject(nextObject) ? nextObject : null;

    publishedGenerationResult = state.result;
    currentMesh = nextMesh;
    $model = nextMesh && state.result
      ? {
          mesh: nextMesh,
          paths: [],
          params: { ...state.result.document.parameters }
        }
      : null;

    if (nextObject !== null && nextMesh === null) {
      $error = 'Le résultat généré ne peut pas être affiché dans le viewer.';
    }

    if (
      previousMesh
      && previousMesh !== previousGeneratedObject
      && previousMesh !== nextMesh
    ) {
      pendingExternalDisposals.add(previousMesh);
    }
  }

  async function completeGenerationPublication(): Promise<void> {
    const externalObjects = [...pendingExternalDisposals];
    pendingExternalDisposals.clear();
    await tick();
    for (const object of externalObjects) disposeExternalObject(object);
  }

  function cancelPendingGeneration(): void {
    generationOrchestrator.cancel();
  }

  async function replaceCurrentMesh(
    next: ModelObject,
    generationParams: Readonly<CookieCutterParams>
  ): Promise<void> {
    const previous = currentMesh;
    currentMesh = next;
    $model = {
      mesh: next,
      paths: [],
      params: { ...generationParams }
    };

    await tick();
    if (previous && previous !== next) disposeExternalObject(previous);
  }

  // Injectable edges; App remains the owner of generation and external meshes.
  export let projectSession: DesignSessionStore = createDesignSessionStore();
  export let projectStorage: ProjectStorage = createIndexedDbProjectStorage();
  export let projectRecoveryStorage: ProjectRecoveryStorage = createIndexedDbProjectRecoveryStorage();
  const session = projectSession;
  $: if (mobileWorkshop === 'bridges' && $session?.kind !== 'cutter' && $session?.kind !== 'multi-cutter') {
    mobileWorkshop = 'sketch';
  }
  let alive = true;
  let unavailableReason: string | null = null;
  // Series edits remain available when the current document has no valid geometry yet.
  $: batchAvailable = Boolean($model) || (unavailableReason === null && ($session?.kind === 'cutter' || $session?.kind === 'multi-cutter'));
  let viewport: ViewportPreferences = { showGrid: true, showAxes: false, showWallThickness: false };
  type Confirmation = { title: string; description: string; choices: readonly { id: string; label: string; destructive?: boolean }[]; resolve: (choice: string) => void };
  let confirmation: Confirmation | null = null;
  let recoveryTransitionValidity: (() => boolean) | null = null;
  function ask(title: string, description: string, choices: Confirmation['choices']): Promise<string> {
    confirmation?.resolve('cancel');
    if (!alive) return Promise.resolve('cancel');
    return new Promise(resolve => { confirmation = { title, description, choices, resolve }; });
  }
  function choose(request: Confirmation, choice: string): void {
    if (confirmation !== request) return;
    confirmation = null;
    request.resolve(choice);
  }
  const workflow = createProjectWorkflow({
    session, storage: projectStorage, assertRepresentable,
    createId: () => crypto.randomUUID(),
    captureTransitionValidity: () => {
      // A competing project transition owns the source immediately, not only
      // after its asynchronous read/dirty confirmation has completed.
      if (vectorizationController !== null || photoDraft !== null) cancelImageImport();
      const revision = sourceRevision;
      const epoch = session.getSessionEpoch();
      const recoveryValidity = recoveryTransitionValidity;
      return () => alive && revision === sourceRevision && epoch === session.getSessionEpoch()
        && (recoveryValidity === null || recoveryValidity());
    },
    confirmDiscard: async document => {
      const revision = sourceRevision;
      const epoch = session.getSessionEpoch();
      const choice = await ask('Modifications non enregistrées', `Enregistrer les modifications de ${document.name} avant de continuer ?`, [
        { id: 'cancel', label: 'Annuler' }, { id: 'save', label: 'Enregistrer et continuer' },
        { id: 'discard', label: 'Ignorer les modifications', destructive: true }
      ]);
      if (!alive || revision !== sourceRevision || epoch !== session.getSessionEpoch()) return 'cancel';
      // An external batch has no representable document to save.
      return choice === 'save' && unavailableReason === null ? 'save' : choice === 'discard' ? 'discard' : 'cancel';
    },
    confirmCollision: async incoming => {
      const choice = await ask('Projet déjà présent', `Importer ${incoming.name} comme copie ou remplacer le projet existant ?`, [
        { id: 'cancel', label: 'Annuler' }, { id: 'copy', label: 'Importer une copie' },
        { id: 'replace', label: 'Remplacer le projet', destructive: true }
      ]);
      return choice === 'copy' ? 'copy' : choice === 'replace' ? 'replace' : 'cancel';
    }
  });
  const integration = createProjectSessionIntegration({
    session, generation: {
      cancel: () => generationOrchestrator.cancel(),
      schedule: document => {
        if (unavailableReason === null) {
          scheduledProjectEpoch = session.getSessionEpoch();
          generationOrchestrator.schedule(document);
        }
      }
    },
    legacy: {
      params: { subscribe: run => params.subscribe(value => { if (unavailableReason === null) run(value); }) },
      setParams
    },
    invalidateSource: () => {
      cancelImageImport();
      importError = null;
      unavailableReason = null;
      externalExport = null;
      $uploadedFile = null;
      sessionRaster = null;
      if (session.getDocument() === null) {
        const external = currentMesh;
        currentMesh = null;
        $model = null;
        if (external && external !== publishedGenerationResult?.artifacts[0].object) {
          void tick().then(() => disposeExternalObject(external));
        }
        void generationOrchestrator.clear().catch(cause => { if (alive) $error = String(cause); });
      }
    },
    clearHistory: () => historyStore.clear(),
    projectViewport: value => { viewport = value ?? { showGrid: true, showAxes: false, showWallThickness: false }; },
    onParameterError: cause => { if (cause) $error = cause instanceof Error ? cause.message : String(cause); },
    onIntegrationError: cause => { $error = cause instanceof Error ? cause.message : String(cause); }
  });
  let historyKey = '';
  // Observe synchronously, after workflow and integration exist. UI effects alone
  // can miss the last accepted document when destruction precedes Svelte's flush.
  const recovery = createProjectRecovery(projectRecoveryStorage);
  let recoveryBusy = false;
  let recoveryActionSequence = 0;
  let recoveryActionError: string | null = null;
  // Keep the panel and refresh focus target mounted after its final draft is deleted.
  let recoveryPanelVisible = false;
  $: if (activeCategory === 'projects' || $recovery.drafts.length || $recovery.pending || $recovery.saving || $recovery.savedAt || $recovery.error || $recovery.listError || recoveryActionError) recoveryPanelVisible = true;
  let observedRecovery: { document: DesignDocument | null; epoch: number; dirty: boolean; available: boolean } | null = null;
  function observeRecovery(): void {
    if (!alive) return;
    const document = session.getDocument();
    const epoch = session.getSessionEpoch();
    const state = workflow.getState();
    // A queued workflow notification can predate a reentrant session edit.
    // Require its dirty baseline to agree with the live canonical document.
    const dirty = document !== null && (state.savedSnapshot === null || encodeProject(document) !== state.savedSnapshot);
    if (state.disposed || state.sessionEpoch !== epoch || state.dirty !== dirty
      || document !== session.getDocument() || epoch !== session.getSessionEpoch()
      || state !== workflow.getState()) return;
    const available = unavailableReason === null;
    if (observedRecovery?.document === document && observedRecovery.epoch === epoch
      && observedRecovery.dirty === dirty && observedRecovery.available === available) return;
    observedRecovery = { document, epoch, dirty, available };
    recovery.observe(document, epoch, dirty, available);
  }
  const unsubscribeRecoveryWorkflow = workflow.subscribe(state => {
    if (state === workflow.getState()) observeRecovery();
  });
  const unsubscribeRecoverySession = session.subscribe(document => {
    if (document === session.getDocument()) observeRecovery();
  });
  function recoveryWorkflowBusy(): boolean {
    const state = workflow.getState();
    return state.disposed || state.saving || state.pending !== null;
  }
  async function refreshRecovery(): Promise<void> {
    if (!alive) return;
    await recovery.refresh();
  }
  async function flushRecovery(): Promise<void> {
    if (!alive) return;
    await recovery.flush();
    if (alive) await recovery.refresh();
  }
  async function resumeRecovery(expected: ProjectRecoveryEnvelope): Promise<void> {
    if (!alive || recoveryBusy || recoveryWorkflowBusy()) return;
    cancelImageImport();
    importError = null;
    recoveryBusy = true;
    const sequence = ++recoveryActionSequence;
    const revision = sourceRevision, epoch = session.getSessionEpoch(), document = session.getDocument();
    const owned = () => alive && sequence === recoveryActionSequence;
    const current = () => owned() && revision === sourceRevision && epoch === session.getSessionEpoch() && document === session.getDocument();
    recoveryActionError = null;
    try {
      const snapshot = canonicalProjectRecoverySnapshot(expected);
      const record = await projectRecoveryStorage.get(expected.draftId);
      if (!current() || recoveryWorkflowBusy()) return;
      if (!record || canonicalProjectRecoverySnapshot(record) !== snapshot) {
        recoveryActionError = 'Ce brouillon de récupération a changé ou n’est plus disponible. Actualisez puis choisissez la version affichée.';
        await recovery.refresh(); return;
      }
      // Transfer the pre-read context to the workflow's final replacement guard.
      // Its intentional new epoch must not be checked against the old context.
      recoveryTransitionValidity = current;
      let completion: Promise<boolean>;
      try { completion = workflow.startNew(record.document); }
      finally { recoveryTransitionValidity = null; }
      const accepted = await completion;
      if (owned() && accepted) activeCategory = 'params';
    } catch (cause) {
      if (current()) recoveryActionError = `Impossible de reprendre le brouillon : ${cause instanceof Error ? cause.message : 'stockage indisponible'}. Actualisez puis réessayez.`;
    } finally {
      if (owned()) recoveryBusy = false;
    }
  }
  async function deleteRecovery(expected: ProjectRecoveryEnvelope): Promise<void> {
    if (!alive || recoveryBusy || recoveryWorkflowBusy()) return;
    recoveryBusy = true;
    const sequence = ++recoveryActionSequence;
    const current = () => alive && sequence === recoveryActionSequence;
    recoveryActionError = null;
    try {
      // Detached exact expected version, never reread/upgrade while prompting.
      const snapshot = JSON.parse(canonicalProjectRecoverySnapshot(expected)) as ProjectRecoveryEnvelope;
      const choice = await ask('Supprimer ce brouillon de récupération ?', `Supprimer ${snapshot.document.name}, enregistré le ${snapshot.savedAt}, de ce navigateur ?`, [
        { id: 'cancel', label: 'Annuler' }, { id: 'delete', label: 'Supprimer le brouillon', destructive: true }
      ]);
      if (!current() || choice !== 'delete' || recoveryWorkflowBusy()) return;
      await projectRecoveryStorage.deleteExpected(snapshot);
      if (!current()) return;
      await recovery.refresh();
      if (!current()) return;
      recoveryBusy = false;
      await tick();
      if (current()) document.querySelector<HTMLButtonElement>('button[data-recovery-refresh]')?.focus();
    } catch (cause) {
      if (current()) {
        recoveryActionError = `Impossible de supprimer le brouillon : ${cause instanceof Error ? cause.message : 'stockage indisponible'}. Actualisez puis réessayez.`;
        await recovery.refresh();
      }
    } finally {
      if (current()) recoveryBusy = false;
    }
  }
  onMount(() => {
    void recovery.list();
    const flush = () => { if (alive) void recovery.flush(); };
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', hidden);
    };
  });
  const unsubscribeSession = session.subscribe(document => {
    // Svelte can deliver an older queued snapshot after an observer edits/replaces.
    if (document !== session.getDocument()) return;
    if (retracingSnapshot !== null && document !== retracingSnapshot) cancelImageImport();
    svgCache = document?.sketch.svg ?? null;
    fileName = document?.source.fileName ?? '';
    if (!document) { activeCategory = 'upload'; mobileView3D = false; mobileCreateMenu = false; historyKey = ''; return; }
    // All persistent edits (including rename, viewport, updatedAt and sketch
    // revision) are undoable. Never restore an older geometry snapshot over
    // newer metadata that was silently left outside the history scope.
    // Domain-valid but unrepresentable inputs must not throw out of a store
    // subscriber and poison subsequent synchronous session notifications.
    let historyParams: Readonly<CookieCutterParams>;
    try { historyParams = documentParametersToLegacy(document); }
    catch { return; }
    const key = JSON.stringify(document);
    const epoch = session.getSessionEpoch();
    const isRestoredSnapshot = restoringHistory?.epoch === epoch && restoringHistory.key === key;
    if (!isRestoredSnapshot && (historyStore.getLength() === 0 || historyKey !== key)) {
      historyStore.pushState({
        params: historyParams, svgData: document.sketch.svg,
        document, sessionEpoch: session.getSessionEpoch(), description: 'Dessin modifié'
      });
    }
    historyKey = key;
  });

  async function publishSvg(svg: string, nextFileName: string, nextParams: CookieCutterParams = $params, source?: DesignSource, rasterFile?: File): Promise<boolean> {
    if (!alive) return false;
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    try {
      const parameterDocument = legacyParametersToDocument(nextParams);
      const candidate = createDesignDocument({
        name: nextFileName.replace(/\.[^/.]+$/, '') || 'Untitled design',
        kind: parameterDocument.kind,
        source: source ?? { type: 'svg', fileName: nextFileName, svg }
      });
      const accepted = await workflow.startNew({ ...candidate, parameters: parameterDocument.parameters });
      if (alive && accepted && rasterFile && session.getDocument()?.id === candidate.id
        && JSON.stringify(session.getDocument()?.source) === JSON.stringify(candidate.source)) {
        sessionRaster = { file: rasterFile, epoch: session.getSessionEpoch() };
      }
      if (alive && accepted) { $error = null; mobileView3D = false; mobileCreateMenu = false; activeCategory = 'params'; }
      return alive && accepted;
    } catch (cause) {
      if (alive && revision === sourceRevision && epoch === session.getSessionEpoch()) {
        $error = cause instanceof Error ? cause.message : 'Impossible de charger le dessin';
        $isProcessing = false;
      }
      return false;
    }
  }

  function cancelImageImport(): void {
    sourceRevision += 1;
    photoDraft = null;
    photoReviewError = null;
    vectorizationController?.abort();
    vectorizationController = null;
    importPending = false;
    retracingSnapshot = null;
  }

  function rejectImageImport(message: string): void {
    cancelImageImport();
    importError = message;
  }

  function handlePaste(event: ClipboardEvent): void {
    if (!alive || event.defaultPrevented || isEditablePasteTarget(event.target) || !event.clipboardData) return;
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) return; // Never interpret text, HTML or SVG clipboard strings.
    event.preventDefault();
    try {
      const file = selectSingleImage(files);
      if (file) void handleFileUpload(new CustomEvent('upload', { detail: file }));
    } catch (cause) {
      rejectImageImport(cause instanceof Error ? cause.message : 'Impossible de lire l’image du presse-papiers.');
    }
  }

  async function loadPhotoReview(): Promise<void> {
    photoReviewError = null;
    try {
      const module = await import('./lib/components/ui/PhotoImportReview.svelte');
      if (alive) PhotoImportReview = module.default;
    } catch (cause) {
      if (alive && photoDraft) photoReviewError = cause instanceof Error ? cause.message : 'Impossible de charger la préparation photo.';
    }
  }

  function stagePhoto(file: File, kind: PhotoDraft['kind']): boolean {
    const mimeType = validateImageFile(file);
    if (mimeType === 'image/svg+xml') return false;
    mobileView3D = false;
    mobileCreateMenu = false;
    activeCategory = 'upload';
    photoDraft = { file, mimeType, kind, epoch: session.getSessionEpoch(), revision: sourceRevision, snapshot: session.getDocument() };
    if (!PhotoImportReview) void loadPhotoReview();
    return true;
  }

  $: if (photoDraft && ($session !== photoDraft.snapshot || session.getSessionEpoch() !== photoDraft.epoch)) {
    cancelImageImport();
  }

  async function applyPreparedPhoto(detail: { file: File; result: PhotoTraceResult }): Promise<void> {
    const draft = photoDraft;
    if (!alive || !draft || detail.file !== draft.file || !detail.result.diagnostics.canApply
      || draft.revision !== sourceRevision || draft.epoch !== session.getSessionEpoch()
      || draft.snapshot !== session.getDocument()) return;
    try {
      const svg = detail.result.svg;
      if (draft.kind === 'retrace') {
        const snapshot = draft.snapshot;
        if (!snapshot || snapshot.source.type !== 'raster') return;
        assertRepresentable({ ...snapshot, sketch: { ...snapshot.sketch, svg } });
        photoDraft = null;
        session.updateSketch(svg);
      } else {
        photoDraft = null;
        await publishSvg(svg, draft.file.name, $params, { type: 'raster', fileName: draft.file.name, mimeType: draft.mimeType, vectorizedSvg: svg }, draft.file);
      }
      await tick();
      document.querySelector<HTMLElement>('button[aria-current="page"]')?.focus();
    } catch (cause) {
      if (alive && draft.epoch === session.getSessionEpoch()) importError = cause instanceof Error ? cause.message : 'Impossible d’appliquer le contour photo.';
    }
  }

  async function cancelPhotoReview(): Promise<void> {
    cancelImageImport();
    await tick();
    document.querySelector<HTMLElement>('select[aria-label="Vectorization preset"]')?.focus();
  }

  async function handleFileUpload(event: CustomEvent<File>) {
    const file = event.detail;
    cancelImageImport();
    if (tracingPreset === 'photo') {
      try {
        importError = null;
        if (stagePhoto(file, 'import')) return;
      } catch (cause) {
        importError = cause instanceof Error ? cause.message : 'Photo invalide.';
        return;
      }
    }
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    const controller = new AbortController();
    vectorizationController = controller;
    importError = null;
    $error = null;
    importPending = true;
    const preset = tracingPreset;
    pendingPreset = preset;
    const current = () => alive && !controller.signal.aborted && revision === sourceRevision && epoch === session.getSessionEpoch();
    // Keep all operation data local until the guarded session replacement.
    try {
      const { svg, source } = await importImage(file, controller.signal, preset);
      if (!current()) return;
      importPending = false; // The dirty-document dialog now owns cancellation.
      vectorizationController = null;
      await publishSvg(svg, file.name, $params, source, source.type === 'raster' ? file : undefined);
    } catch (cause) {
      if (current()) importError = cause instanceof Error ? cause.message : 'Impossible de traiter le fichier';
    } finally {
      if (vectorizationController === controller) {
        vectorizationController = null;
        importPending = false;
      }
    }
  }

  async function revectorizeCurrentImage(): Promise<void> {
    const raster = sessionRaster;
    const snapshot = session.getDocument();
    if (!raster || !snapshot || snapshot.source.type !== 'raster' || raster.epoch !== session.getSessionEpoch()) return;
    cancelImageImport();
    if (tracingPreset === 'photo') {
      importError = null;
      stagePhoto(raster.file, 'retrace');
      return;
    }
    const revision = sourceRevision;
    const controller = new AbortController();
    const preset = tracingPreset;
    pendingPreset = preset;
    vectorizationController = controller;
    retracingSnapshot = snapshot;
    importPending = true;
    importError = null;
    const current = () => alive && !controller.signal.aborted && revision === sourceRevision
      && raster.epoch === session.getSessionEpoch() && snapshot === session.getDocument();
    try {
      const { svg } = await importImage(raster.file, controller.signal, preset);
      if (!current()) return;
      // Validate the same representability boundary as other sketch commands.
      assertRepresentable({ ...snapshot, sketch: { ...snapshot.sketch, svg } });
      if (!current()) return;
      retracingSnapshot = null;
      session.updateSketch(svg); // One undoable edit, never replace source or identity.
    } catch (cause) {
      if (current()) importError = cause instanceof Error ? cause.message : 'Impossible de revectoriser l’image';
    } finally {
      if (vectorizationController === controller) {
        vectorizationController = null;
        retracingSnapshot = null;
        importPending = false;
      }
    }
  }

  function handleExport() {
    const snapshot = captureGeometryExport();
    if (!snapshot) return;

    try {
      const filename = `${fileName.replace(/\.[^/.]+$/, '') || 'cookie-cutter'}.stl`;
      exportToSTL(snapshot.mesh, filename, { binary: true });
      $error = null;
    } catch (exportError) {
      console.error('Error exporting STL:', exportError);
      $error = exportError instanceof Error ? exportError.message : 'Impossible d’exporter le STL';
    }
  }

  function handleShapeSelect(shape: string | { svg: string; name: string }): void {
    const svg = typeof shape === 'string' ? shape : shape.svg;
    const fileBaseName = typeof shape === 'string'
      ? 'generated-shape'
      : shape.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    cancelImageImport();
    importError = null;
    try {
      void publishSvg(cleanSVG(svg), `${fileBaseName || 'library-shape'}.svg`);
    } catch (shapeError) {
      $error = shapeError instanceof Error ? shapeError.message : 'Impossible de traiter la forme';
      $isProcessing = false;
    }
  }

  function loadTestModel() {
    const circleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="20" fill="black"/>
    </svg>`;

    cancelImageImport();
    importError = null;
    void publishSvg(circleSvg, 'test-circle.svg');
  }

  $: estimatedSize = currentMesh
    ? formatFileSize(estimateSTLSize(currentMesh, true))
    : null;
  $: modelDimensions = currentMesh ? measureModel(currentMesh) : null;

  function restoreHistory(state: ReturnType<typeof historyStore.undo>): void {
    if (!state?.document || state.sessionEpoch !== session.getSessionEpoch() || unavailableReason) return;
    // Suppress only this restoration, not edits/replacements made by observers.
    restoringHistory = { key: JSON.stringify(state.document), epoch: state.sessionEpoch };
    try {
      session.restoreHistory(state.document, state.sessionEpoch);
    } catch (cause) { $error = cause instanceof Error ? cause.message : String(cause); }
    finally { restoringHistory = null; }
  }
  function handleUndo(): void { if (unavailableReason === null) restoreHistory(historyStore.undo()); }
  function handleRedo(): void { if (unavailableReason === null) restoreHistory(historyStore.redo()); }

  function handleMaterialChange(
    event: CustomEvent<{ meshName: string; material: MaterialPreset }>
  ) {
    if (!currentMesh) return;

    const { material } = event.detail;
    currentMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) applyMaterialToMesh(child, material);
    });
  }

  function handleLoadFromGallery(event: CustomEvent<SavedDesign>) {
    try {
      const design = event.detail;
      const nextSvg = cleanSVG(design.svgData);

      cancelImageImport();
      importError = null;
      void publishSvg(nextSvg, `${design.metadata.name}.svg`, design.params);
    } catch (galleryError) {
      console.error('Error loading design:', galleryError);
      $error = galleryError instanceof Error
        ? galleryError.message
        : 'Impossible de charger le dessin';
      $isProcessing = false;
    }
  }

  function captureBatchOperationValidity(): () => boolean {
    // Reserve at producer start, never date an old result as a new source request.
    cancelImageImport();
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    const geometry = () => {
      const document = session.getDocument();
      return JSON.stringify([document?.kind, document?.sketch, document?.parameters, document && document.schemaVersion !== 1 ? document.bridges : [], document?.schemaVersion === 3 ? document.layout : null]);
    };
    const key = geometry();
    return () => alive && revision === sourceRevision
      && epoch === session.getSessionEpoch() && key === geometry();
  }

  async function acceptBatch(batch: THREE.Group, validity: () => boolean, metadata?: Readonly<CookieCutterParams>): Promise<void> {
    const batchParams = metadata ? Object.freeze({ ...metadata }) : undefined;
    // Model-store params serve display only for heterogeneous/legacy batches.
    // Unknown export metadata MUST remain absent, never inferred from current UI.
    const displayParams = batchParams ?? Object.freeze({ ...$params });
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    const localCurrent = () => alive && revision === sourceRevision && epoch === session.getSessionEpoch();
    const current = () => {
      if (!localCurrent()) return false;
      try { return validity() === true && localCurrent(); }
      catch { return false; }
    };
    // From synchronous handoff until publication App owns this unpublished result,
    // including teardown while clear() is still draining.
    pendingBatchObjects.add(batch);
    let published = false;
    try {
      if (!current()) return;
      await generationOrchestrator.clear();
      if (!current()) return;
      await replaceCurrentMesh(batch, displayParams);
      if (!current()) return;
      externalExport = { mesh: batch, params: batchParams, current };
      fileName = 'batch-production.stl';
      unavailableReason = 'Un aperçu de série ne peut pas être enregistré ou exporté comme projet V1. Créez ou ouvrez un projet compatible.';
      observeRecovery();
      $isProcessing = false;
      published = true;
    } catch (cause) {
      if (current()) $error = cause instanceof Error ? cause.message : 'Impossible de créer la série.';
    } finally {
      pendingBatchObjects.delete(batch);
      if (!published || !current()) {
        // A newer session may be scheduled but not ready yet. Detach only our own
        // external preview before disposing; never clear/cancel the newer generation.
        if (currentMesh === batch) { currentMesh = null; $model = null; await tick(); }
        disposeExternalObject(batch);
      }
    }
  }

  function handleBatchCreated(event: CustomEvent<THREE.Group>): void {
    // Compatibility for legacy synchronous event producers. Real BatchMode uses
    // the contextual handoff below and captures before its first producer await.
    void acceptBatch(event.detail, captureBatchOperationValidity());
  }
  function handleContextualBatchCreated(batch: THREE.Group, validity: () => boolean, metadata?: Readonly<CookieCutterParams>): void {
    void acceptBatch(batch, validity, metadata);
  }

  // V1 preview geometry is never edited by runtime delete events. There is no
  // deletion listener: even stale/programmatic events cannot dispose owner assets.

  function captureAIOperationValidity(): () => boolean {
    cancelImageImport();
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    const geometry = () => {
      const document = session.getDocument();
      return JSON.stringify([document?.kind, document?.sketch, document?.parameters, document && document.schemaVersion !== 1 ? document.bridges : [], document?.schemaVersion === 3 ? document.layout : null]);
    };
    const key = geometry();
    return () => alive && revision === sourceRevision
      && epoch === session.getSessionEpoch() && key === geometry();
  }
  function acceptsAIHandoff(validity: () => boolean): boolean {
    const revision = sourceRevision;
    const epoch = session.getSessionEpoch();
    const local = () => alive && revision === sourceRevision && epoch === session.getSessionEpoch();
    if (!local()) return false;
    try { return validity() === true && local(); } catch { return false; }
  }
  function handleContextualAISVG(svg: string, validity: () => boolean): void {
    // Validate the producer context BEFORE reserving the new source request.
    // Once transferred, publishSvg/workflow own the replacement context: the
    // source revision changed by this handoff must not invalidate its own import.
    if (acceptsAIHandoff(validity)) handleShapeSelect(svg);
  }
  function handleContextualAIImage(blob: Blob, validity: () => boolean): void {
    if (acceptsAIHandoff(validity)) handleAIProcessedImage(new CustomEvent('processedImage', { detail: blob }));
  }

  function handleAIProcessedImage(event: CustomEvent<Blob>): void {
    const file = new File([event.detail], 'ai-processed.png', { type: 'image/png' });
    void handleFileUpload(new CustomEvent('upload', { detail: file }));
  }
  function requestNewDesign(): void { cancelImageImport(); importError = null; void workflow.startNew(); }
  async function confirmDelete(document: DesignDocument): Promise<boolean> {
    return await ask('Supprimer le projet local', `Supprimer ${document.name} de ce navigateur ?`, [
      { id: 'cancel', label: 'Annuler' }, { id: 'delete', label: 'Supprimer le projet', destructive: true }
    ]) === 'delete';
  }
  function changeViewport(value: ViewportPreferences): void {
    if (alive && session.getDocument() && unavailableReason === null) session.updateViewport(value);
  }

  onDestroy(() => {
    alive = false;
    recoveryActionSequence += 1;
    unsubscribeRecoveryWorkflow();
    unsubscribeRecoverySession();
    // Recovery owns only its separate storage; close after all accepted writes.
    void recovery.dispose().then(() => projectRecoveryStorage.close()).catch(cause => console.error('Recovery cleanup failed:', cause));
    confirmation?.resolve('cancel');
    confirmation = null;
    integration.dispose();
    unsubscribeSession();
    const workflowDisposal = workflow.dispose();
    sourceRevision += 1;
    vectorizationController?.abort();
    terminateImageProcessor();
    const generatedObject = publishedGenerationResult?.artifacts[0].object ?? null;
    const externalObjects = new Set<ModelObject>([...pendingExternalDisposals, ...pendingBatchObjects]);
    pendingBatchObjects.clear();
    if (currentMesh && currentMesh !== generatedObject) externalObjects.add(currentMesh);
    pendingExternalDisposals.clear();
    currentMesh = null;
    $model = null;
    $isProcessing = false;
    const generationDisposal = generationOrchestrator.dispose();
    void (async () => {
      await tick();
      for (const object of externalObjects) disposeExternalObject(object);
      await generationDisposal;
      await workflowDisposal;
    })().catch(cause => console.error('Project cleanup failed:', cause));
  });
</script>

<svelte:window on:paste={handlePaste} />

{#if confirmation}
  {#key confirmation}
    {@const request = confirmation}
    <ProjectConfirmDialog title={request.title} description={request.description} choices={request.choices}
      onChoose={choice => choose(request, choice)} />
  {/key}
{/if}

<main>
  <!-- Modern Header with Gradient -->
  <header class="modern-header">
    <div class="header-content">
      <div class="logo-section">
        <span class="logo-icon">🍪</span>
        <div class="logo-text">
          <h1>Cookie Cutter Designer</h1>
          <p class="tagline">Créez des emporte-pièces imprimables en 3D</p>
        </div>
      </div>
      <div class="header-actions">
        {#if $model}
          <span class="current-file">{fileName}</span>
        {/if}
          <button
            class="btn btn-outline btn-sm"
            on:click={requestNewDesign}
            title="Créer un nouveau dessin"
            aria-label="Créer un nouveau dessin"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M12 3v18"/>
            </svg>
            <span class="new-design-label">Nouveau dessin</span>
          </button>
        <button
          class="btn btn-outline btn-sm btn-icon"
          on:click={toggleDarkMode}
          title={darkMode ? 'Activer le thème clair' : 'Activer le thème sombre'}
          aria-label={darkMode ? 'Activer le thème clair' : 'Activer le thème sombre'}
          aria-pressed={darkMode}
        >
          {#if darkMode}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          {/if}
        </button>
      </div>
    </div>
  </header>

  <div class="app-layout" class:mobile-viewing={mobileView3D} class:mobile-choosing={mobileCreateMenu}
    class:mobile-workshop-sketch={mobileWorkshop === 'sketch'} class:mobile-workshop-bridges={mobileWorkshop === 'bridges'}
    class:mobile-workshop-more={mobileWorkshop === 'more'}>
    <!-- Mini Sidebar with Category Icons -->
    <aside class="mini-sidebar">
      <nav class="category-nav" aria-label="Outils de création">
        <button class="category-btn" class:active={activeCategory === 'projects'}
          on:click={() => activeCategory = 'projects'} aria-label="Projets locaux" title="Projets locaux"
          aria-current={activeCategory === 'projects' ? 'page' : undefined}>📁<span class="nav-label">Projets locaux</span></button>
        <button
          class="category-btn"
          class:active={activeCategory === 'upload'}
          on:click={() => activeCategory = 'upload'}
          title="Importer"
          aria-label="Importer un dessin"
          aria-current={activeCategory === 'upload' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Importer</span>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'params'}
            on:click={() => activeCategory = 'params'}
            title="Réglages"
            aria-label="Réglages"
            aria-current={activeCategory === 'params' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Réglages</span>
          </button>
        {/if}

        <button
          class="category-btn"
          class:active={activeCategory === 'shapes'}
          on:click={() => activeCategory = 'shapes'}
          title="Bibliothèque de formes"
          aria-label="Bibliothèque de formes"
          aria-current={activeCategory === 'shapes' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Bibliothèque de formes</span>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'advanced'}
          on:click={() => activeCategory = 'advanced'}
          title="Création avancée"
          aria-label="Création avancée"
          aria-current={activeCategory === 'advanced' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v20M2 12h20"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Création avancée</span>
        </button>

        <button
          class="category-btn ai-btn"
          class:active={activeCategory === 'ai'}
          on:click={() => activeCategory = 'ai'}
          title="Outils IA (Gemini)"
          aria-label="Outils IA (Gemini)"
          aria-current={activeCategory === 'ai' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
            <circle cx="9" cy="16" r="1"/>
            <circle cx="15" cy="16" r="1"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Outils IA</span>
        </button>

        <button
          class="category-btn"
          class:active={activeCategory === 'gallery'}
          on:click={() => activeCategory = 'gallery'}
          title="Galerie locale"
          aria-label="Galerie locale"
          aria-current={activeCategory === 'gallery' ? 'page' : undefined}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="nav-label" aria-hidden="true">Galerie locale</span>
        </button>

        {#if $model}
          <button
            class="category-btn"
            class:active={activeCategory === 'materials'}
            on:click={() => activeCategory = 'materials'}
            title="Matériaux"
            aria-label="Matériaux et optimisation"
            aria-current={activeCategory === 'materials' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Matériaux</span>
          </button>

          <button
            class="category-btn"
            class:active={activeCategory === 'preview'}
            on:click={() => activeCategory = 'preview'}
            title="Aperçu"
            aria-label="Aperçu d’impression"
            aria-current={activeCategory === 'preview' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Aperçu</span>
          </button>

        {/if}
        {#if batchAvailable}
          <button
            class="category-btn"
            class:active={activeCategory === 'batch'}
            on:click={() => activeCategory = 'batch'}
            title="Batch"
            aria-label="Production en série"
            aria-current={activeCategory === 'batch' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 16h6v6M8 8H2V2"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Série</span>
          </button>
        {/if}
        {#if $model}

          <button
            class="category-btn"
            class:active={activeCategory === 'export'}
            on:click={() => activeCategory = 'export'}
            title="Export"
            aria-label="Exporter le dessin"
            aria-current={activeCategory === 'export' ? 'page' : undefined}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span class="nav-label" aria-hidden="true">Export</span>
          </button>
        {/if}
      </nav>
    </aside>

    <!-- Content Panel -->
    <div class="content-panel">
      {#if importError || $error}
        <div class="alert alert-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>Erreur</strong>
            <p>{importError ?? $error}</p>
          </div>
        </div>
      {/if}

      {#if mobileCreateMenu}
        <section class="mobile-create-menu" aria-label="Outils de création">
          <h2>Créer un Cutter</h2>
          <p>Choisissez une étape. Vous pourrez revenir aux réglages et à l’aperçu 3D à tout moment.</p>
          <button type="button" on:click={() => selectMobileCategory('upload')}>Importer une image</button>
          <button type="button" on:click={() => selectMobileCategory('shapes')}>Choisir une forme</button>
          <button type="button" on:click={() => selectMobileCategory('advanced')}>Atelier 2D et ponts</button>
          {#if batchAvailable}<button type="button" on:click={() => selectMobileCategory('batch')}>Série de Cutters</button>{/if}
          <h3>Autres outils</h3>
          <button type="button" on:click={() => selectMobileCategory('ai')}>Outils IA</button>
          <button type="button" on:click={() => selectMobileCategory('gallery')}>Galerie</button>
          {#if $model}
            <button type="button" on:click={() => selectMobileCategory('materials')}>Matériaux et optimisation</button>
            <button type="button" on:click={() => selectMobileCategory('preview')}>Préparation impression</button>
          {/if}
        </section>
      {/if}
      <div class="panel-content" class:mobile-start={!$session && activeCategory === 'upload' && photoDraft === null && !importPending} bind:this={panelContent}>
        {#if importPending}
          <div class="image-import-progress">
            <p role="status" aria-live="polite">Importation de l’image… {TRACING_PRESETS.find(option => option.id === pendingPreset)?.label}</p>
            <button type="button" class="btn" on:click={cancelImageImport}>Annuler l’importation</button>
          </div>
        {/if}
        {#if activeCategory === 'upload' || activeCategory === 'advanced'}
          <div class="tracing-tools" class:advanced-tracing={activeCategory === 'advanced'}>
          <TracingPresetPicker bind:preset={tracingPreset} disabled={importPending || photoDraft !== null} />
          {#if photoDraft}
            {#key photoDraft}
              {#if PhotoImportReview}
                <svelte:component this={PhotoImportReview} file={photoDraft.file} on:apply={event => void applyPreparedPhoto(event.detail)} on:cancel={cancelPhotoReview} />
              {:else}
                <p role="status">Chargement de la préparation photo…</p>
                {#if photoReviewError}<p role="alert">{photoReviewError}</p><button type="button" class="btn" on:click={loadPhotoReview}>Réessayer la préparation photo</button>{/if}
                <button type="button" class="btn" on:click={cancelPhotoReview}>Annuler la préparation photo</button>
              {/if}
            {/key}
          {/if}
          {#if $session?.source.type === 'raster'}
            {#if sessionRaster && sessionRaster.epoch === session.getSessionEpoch()}
              <p>Revectoriser remplace les corrections du dessin ; Annuler permet de les retrouver.</p>
              <button type="button" class="btn" disabled={importPending || photoDraft !== null} on:click={revectorizeCurrentImage}>Revectoriser l’image actuelle</button>
            {:else}
              <p>Réimportez l’image originale pour changer de préréglage : les pixels raster ne sont pas sauvegardés dans le projet V1. Le dessin sauvegardé reste disponible.</p>
            {/if}
          {/if}
          </div>
        {/if}
        {#if activeCategory === 'projects'}
          <ProjectManager {session} {workflow} {unavailableReason} />
          <LocalProjectLibrary {workflow} onConfirmDelete={confirmDelete} />
        {:else if activeCategory === 'upload'}
          {#if $session === null}
            {#if StartScreen}
              <svelte:component this={StartScreen} on:upload={handleFileUpload} on:reject={e => rejectImageImport(e.detail)}
                on:shapes={() => selectMobileCategory('shapes')} on:projects={() => selectMobileCategory('projects')} />
            {:else}
              {#if startScreenError}
                <p role="alert">Impossible de charger l’écran d’accueil : {startScreenError}</p>
              {/if}
              <FileUpload on:upload={handleFileUpload} on:reject={e => rejectImageImport(e.detail)} />
            {/if}
          {:else}
            <FileUpload on:upload={handleFileUpload} on:reject={e => rejectImageImport(e.detail)} />
          {/if}
          {#if !$model}
            <div class="quick-start">
              <button class="btn-quick" on:click={loadTestModel}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Essayer un cercle de test
              </button>
            </div>
          {/if}

        {:else if activeCategory === 'params' && $model}
          <HistoryPanel on:undo={handleUndo} on:redo={handleRedo} />
          <ParameterPanel />

        {:else if activeCategory === 'params'}
          <div class="feature-header"><h2>Réglages</h2><p>Importez une image ou choisissez une forme pour générer un Cutter et accéder à ses réglages.</p></div>

        {:else if activeCategory === 'shapes'}
          <ShapeLibrary on:selectShape={(e) => handleShapeSelect(e.detail)} />

        {:else if activeCategory === 'advanced'}
          <header class="feature-header advanced-header">
            <h2>Création avancée</h2>
            <p>Créez ou combinez des formes avant de les appliquer au modèle 3D.</p>
          </header>
          <nav class="mobile-workshop-nav" aria-label="Atelier mobile">
            <button type="button" aria-current={mobileWorkshop === 'sketch' ? 'page' : undefined} on:click={() => mobileWorkshop = 'sketch'}>Atelier 2D</button>
            {#if unavailableReason === null && ($session?.kind === 'cutter' || $session?.kind === 'multi-cutter')}
              <button type="button" aria-current={mobileWorkshop === 'bridges' ? 'page' : undefined} on:click={() => mobileWorkshop = 'bridges'}>Ponts</button>
            {/if}
            <button type="button" aria-current={mobileWorkshop === 'more' ? 'page' : undefined} on:click={() => mobileWorkshop = 'more'}>Autres</button>
          </nav>
          <div class="advanced-ai">
          {#await import('./lib/components/ui/AIImageProcessor.svelte')}
            <div class="panel-loading" role="status">Chargement du traitement d’image…</div>
          {:then component}
            <component.default captureOperationValidity={captureAIOperationValidity} onProcessedImage={handleContextualAIImage} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger le traitement d’image.</div>
          {/await}
          </div>
          <HistoryPanel on:undo={handleUndo} on:redo={handleRedo} />
          <div class="advanced-sketch">
          {#await import('./lib/components/ui/SketchWorkspace.svelte')}
            <div class="panel-loading" role="status">Chargement de l’atelier 2D…</div>
          {:then component}
            {#if unavailableReason === null}
              {#key $session?.id}
                <component.default {session} />
              {/key}
            {:else}
              <p role="status">Ouvrez un projet pour modifier son dessin.</p>
            {/if}
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger l’atelier 2D.</div>
          {/await}
          </div>
          <div class="advanced-bridges">
          {#if unavailableReason === null && ($session?.kind === 'cutter' || $session?.kind === 'multi-cutter')}
            {#await import('./lib/components/ui/BridgeWorkspace.svelte')}
              <div class="panel-loading" role="status">Chargement de l’éditeur de ponts…</div>
            {:then component}
              {#key $session?.id}<component.default {session} />{/key}
            {:catch}
              <div class="panel-load-error" role="alert">Impossible de charger l’éditeur de ponts.</div>
            {/await}
          {/if}
          </div>
          <div class="advanced-extra">
          {#await import('./lib/components/ui/PatternGenerator.svelte')}
            <div class="panel-loading" role="status">Chargement du générateur de motifs…</div>
          {:then component}
            <component.default on:patternCreated={(e) => handleShapeSelect(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger le générateur de motifs.</div>
          {/await}
          {#await import('./lib/components/ui/BooleanOperations.svelte')}
            <div class="panel-loading" role="status">Chargement des opérations booléennes…</div>
          {:then component}
            <component.default on:shapeCreated={(e) => handleShapeSelect(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger les opérations booléennes.</div>
          {/await}
          </div>

        {:else if activeCategory === 'ai'}
          <header class="feature-header">
            <h2>Outils IA</h2>
            <p>Connectez Gemini pour obtenir de l’aide sur le dessin actuel.</p>
          </header>
          {#await import('./lib/components/ui/GeminiAPIConfig.svelte')}
            <div class="panel-loading" role="status">Chargement de la configuration Gemini…</div>
          {:then component}
            <component.default />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger la configuration Gemini.</div>
          {/await}
          {#await import('./lib/components/ui/AIAssistant.svelte')}
            <div class="panel-loading" role="status">Chargement de l’assistant IA…</div>
          {:then component}
            <component.default
              params={$params}
              svgContent={svgCache}
              captureOperationValidity={captureAIOperationValidity}
              onOptimizedSVG={handleContextualAISVG}
            />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger l’assistant IA.</div>
          {/await}

        {:else if activeCategory === 'gallery'}
          {#await import('./lib/components/ui/CloudGallery.svelte')}
            <div class="panel-loading" role="status">Chargement de la galerie locale…</div>
          {:then component}
            <component.default
              currentSvg={svgCache}
              currentParams={$params}
              on:loadDesign={handleLoadFromGallery}
            />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger la galerie locale.</div>
          {/await}

        {:else if activeCategory === 'materials' && $model}
          {#await import('./lib/components/ui/MaterialManager.svelte')}
            <div class="panel-loading" role="status">Chargement des matériaux…</div>
          {:then component}
            <component.default on:materialChanged={handleMaterialChange} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger les matériaux.</div>
          {/await}
          {#await import('./lib/components/ui/OptimizationPanel.svelte')}
            <div class="panel-loading" role="status">Chargement des outils d’optimisation…</div>
          {:then component}
            <component.default on:applyFix={(e) => updateParams(e.detail)} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger les outils d’optimisation.</div>
          {/await}
          {#await import('./lib/components/ui/CollisionDetector.svelte')}
            <div class="panel-loading" role="status">Chargement du détecteur de collisions…</div>
          {:then component}
            <component.default mesh={currentMesh} buildPlateSize={$params.buildPlateSize} allowPositionFix={false} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger le détecteur de collisions.</div>
          {/await}

        {:else if activeCategory === 'preview' && $model}
          {#await import('./lib/components/ui/SlicePreview.svelte')}
            <div class="panel-loading" role="status">Chargement de l’aperçu des couches…</div>
          {:then component}
            <component.default mesh={currentMesh} layerHeight={0.2} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger l’aperçu des couches.</div>
          {/await}
          {#await import('./lib/components/ui/PrintabilityInfo.svelte')}
            <div class="panel-loading" role="status">Chargement des informations d’impression…</div>
          {:then component}
            <component.default />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger les informations d’impression.</div>
          {/await}

        {:else if activeCategory === 'batch' && batchAvailable}
          {#await import('./lib/components/ui/BatchMode.svelte')}
            <div class="panel-loading" role="status">Chargement du mode série…</div>
          {:then component}
            <component.default
              currentSvg={svgCache}
              currentParams={$params}
              buildPlateSize={$params.buildPlateSize}
              currentDocument={$session}
              onUpdateSeries={layout => { if (alive && unavailableReason === null) session.updateSeries(layout); }}
              onSingleCutter={() => { if (alive && unavailableReason === null) session.changeKind('cutter'); }}
              captureOperationValidity={captureBatchOperationValidity}
              onBatchCreated={handleContextualBatchCreated}
              on:batchCreated={handleBatchCreated}
            />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger le mode série.</div>
          {/await}

        {:else if activeCategory === 'export' && $model}
          {#await import('./lib/components/ui/AdvancedExport.svelte')}
            <div class="panel-loading" role="status">Chargement des outils d’export…</div>
          {:then component}
            <component.default mesh={currentMesh} filename={fileName} params={$params}
              captureExport={captureGeometryExport} unavailableReason={geometryExportReason} />
          {:catch}
            <div class="panel-load-error" role="alert">Impossible de charger les outils d’export.</div>
          {/await}
        {:else if activeCategory === 'export'}
          <div class="feature-header"><h2>Export</h2><p>Importez ou ouvrez un projet pour exporter son fichier. Si une série ne peut pas être générée, corrigez sa disposition dans Créer → Série de Cutters.</p></div>
        {/if}
        {#if recoveryPanelVisible}
          <div class="recovery-area" class:mobile-recovery-away={activeCategory !== 'projects'}>
          <RecoveryPanel {recovery} busy={recoveryBusy || $workflow.disposed || $workflow.saving || $workflow.pending !== null}
            actionError={recoveryActionError} onRefresh={refreshRecovery} onFlush={flushRecovery}
            onResume={resumeRecovery} onDelete={deleteRecovery} />
          {#if activeCategory !== 'projects' && $workflow.error}<p role="alert">{$workflow.error.message}</p>{/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- 3D Viewer Panel -->
    <div class="viewer-panel">
      {#if $isProcessing}
        <div class="loading-state">
          <div class="modern-spinner"></div>
          <p class="loading-text">Génération du dessin en cours…</p>
        </div>
      {:else if currentMesh}
        <ThreeViewer
          mesh={currentMesh}
          buildPlateSize={$params.buildPlateSize}
          {viewport}
          onViewportChange={changeViewport}
          allowObjectDeletion={false}
        />
        {#if modelDimensions}
          <div class="dimension-badge" aria-label="Dimensions du modèle final">
            <strong>Dimensions finales</strong>
            <span>
              {modelDimensions.width.toFixed(1)} × {modelDimensions.depth.toFixed(1)} × {modelDimensions.height.toFixed(1)} mm
            </span>
            <small>largeur × profondeur × hauteur</small>
          </div>
        {/if}
      {:else}
        <div class="empty-state">
          <div class="empty-icon">
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>
          <h3>Aucun modèle chargé</h3>
          <p>Importez un dessin ou choisissez une forme pour commencer.</p>
          <button type="button" class="empty-create" on:click={openMobileCreate}>Choisir une méthode de création</button>
        </div>
      {/if}
    </div>
    <nav class="mobile-sections" aria-label="Sections mobiles">
      <button type="button" aria-current={!mobileView3D && !mobileCreateMenu && activeCategory === 'projects' ? 'page' : undefined} on:click={() => selectMobileCategory('projects')}>Projet</button>
      <button type="button" aria-current={!mobileView3D && (mobileCreateMenu || !['projects', 'params', 'export'].includes(activeCategory)) ? 'page' : undefined} on:click={openMobileCreate}>Créer</button>
      <button type="button" aria-current={!mobileView3D && !mobileCreateMenu && activeCategory === 'params' ? 'page' : undefined} on:click={() => selectMobileCategory('params')}>Régler</button>
      <button type="button" aria-current={mobileView3D ? 'page' : undefined} on:click={showMobile3D}>3D</button>
      <button type="button" aria-current={!mobileView3D && !mobileCreateMenu && activeCategory === 'export' ? 'page' : undefined} on:click={() => selectMobileCategory('export')}>Export</button>
    </nav>
  </div>
</main>

<style>
  /* ============================================
     GLOBAL OVERRIDES
     ============================================ */
  :global(html) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  :global(#app) {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  /* ============================================
     MAIN LAYOUT
     ============================================ */
  main {
    height: 100%;
    height: 100dvh;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface-app);
    flex: 1;
  }

  /* ============================================
     HEADER - MODERN DESIGN
     ============================================ */
  .modern-header {
    background: linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-700) 100%);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-sticky);
    flex-shrink: 0;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-4);
    max-width: 100%;
    min-width: 0;
    height: 48px;
  }

  .logo-section {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    min-width: 0;
  }

  .logo-text {
    min-width: 0;
  }

  .logo-icon {
    font-size: 1.75rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  .logo-text h1 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: white;
    line-height: 1.2;
  }

  .tagline {
    margin: 0;
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.85);
    font-weight: var(--font-weight-normal);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-4);
  }

  .current-file {
    color: rgba(255, 255, 255, 0.95);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-sm {
    height: 2rem;
    padding: 0 var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  .btn-outline {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(10px);
  }

  .btn-outline:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.5);
  }

  .btn-icon {
    min-width: 2rem;
    padding: 0 var(--spacing-2);
  }

  .btn-icon svg {
    margin: 0;
  }

  /* ============================================
     APP LAYOUT - 3 COLUMN LAYOUT (Mini Sidebar + Content + Viewer)
     ============================================ */
  .app-layout {
    display: grid;
    grid-template-columns: 60px 420px 1fr;
    flex: 1;
    overflow: hidden;
    background: var(--surface-app);
    gap: 0;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* ============================================
     MINI SIDEBAR WITH CATEGORY ICONS
     ============================================ */
  .mini-sidebar {
    background: var(--surface-sidebar);
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border-strong);
    z-index: var(--z-sticky);
    min-width: 0;
  }

  .category-nav {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2) 0;
    gap: var(--spacing-1);
    min-width: 0;
  }

  .category-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 52px;
    padding: var(--spacing-2);
    border: none;
    background: transparent;
    color: var(--text-on-sidebar);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
  }

  .category-btn svg {
    transition: all var(--transition-fast);
  }

  .nav-label {
    position: absolute;
    left: calc(100% + var(--spacing-2));
    top: 50%;
    z-index: var(--z-tooltip);
    padding: var(--spacing-1) var(--spacing-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    color: var(--text-primary);
    box-shadow: var(--shadow-md);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    line-height: 1.4;
    opacity: 0;
    pointer-events: none;
    transform: translate(-4px, -50%);
    transition: opacity var(--transition-fast), transform var(--transition-fast);
    white-space: nowrap;
  }

  .category-btn:hover .nav-label,
  .category-btn:focus-visible .nav-label {
    opacity: 1;
    transform: translate(0, -50%);
  }

  .category-btn:hover {
    background: var(--surface-sidebar-hover);
    color: var(--color-primary-400);
  }

  .category-btn:hover svg {
    transform: scale(1.15);
  }

  .category-btn.active {
    background: var(--surface-sidebar-active);
    color: var(--color-primary-400);
  }

  /* AI Button Special Styling */
  .category-btn.ai-btn:hover {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%);
    color: #a78bfa;
  }

  .category-btn.ai-btn.active {
    background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
    color: #a78bfa;
  }

  .category-btn.ai-btn.active::before {
    background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  }

  .category-btn.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 60%;
    background: var(--color-primary-500);
    border-radius: 0 var(--radius-full) var(--radius-full) 0;
  }
  .mobile-sections,
  .mobile-create-menu,
  .mobile-workshop-nav,
  .empty-create { display: none; }
  .advanced-ai,
  .advanced-sketch,
  .advanced-bridges,
  .advanced-extra,
  .recovery-area,
  .tracing-tools { min-width: 0; flex-shrink: 0; }
  .advanced-extra { display: flex; flex-direction: column; gap: var(--spacing-3); }

  /* ============================================
     CONTENT PANEL
     ============================================ */
  .content-panel {
    background: var(--surface-panel);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border-default);
    min-width: 0;
    width: 100%;
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    min-width: 0;
    overscroll-behavior: contain;
  }

  /* Keep tracing controls above the upload dropzone when this flex panel scrolls. */
  .panel-content > :global(*) {
    flex-shrink: 0;
  }

  .feature-header {
    padding: var(--spacing-4);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-card);
    box-shadow: var(--shadow-sm);
  }

  .feature-header h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    line-height: var(--line-height-tight);
  }

  .feature-header p {
    margin: var(--spacing-1) 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .panel-loading,
  .panel-load-error {
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    color: var(--text-muted);
    font-size: var(--font-size-sm);
  }

  .panel-load-error {
    border-color: var(--color-error);
    color: var(--color-error);
  }

  /* ============================================
     ALERT MESSAGES
     ============================================ */
  .alert {
    display: flex;
    align-items: flex-start;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    margin-bottom: var(--spacing-2);
    border-radius: var(--radius-lg);
    animation: slideDown var(--transition-base);
  }

  .alert-error {
    background: #fef2f2;
    border-left: 4px solid var(--color-error);
    color: #991b1b;
  }

  .alert svg {
    flex-shrink: 0;
    color: var(--color-error);
  }

  .alert strong {
    display: block;
    margin-bottom: var(--spacing-1);
    font-weight: var(--font-weight-semibold);
  }

  .alert p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  /* ============================================
     QUICK START SECTION
     ============================================ */
  .quick-start {
    padding: var(--spacing-3);
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-default);
  }

  .btn-quick {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-primary-600);
    color: white;
    border: 1px solid var(--color-primary-600);
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-quick:hover {
    background: var(--color-primary-700);
    color: white;
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }

  .btn-quick svg {
    transition: transform var(--transition-fast);
  }

  .btn-quick:hover svg {
    transform: rotate(360deg);
  }

  /* ============================================
     3D VIEWER PANEL
     ============================================ */
  .viewer-panel {
    background: linear-gradient(135deg, var(--surface-viewer-start) 0%, var(--surface-viewer-end) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .dimension-badge {
    position: absolute;
    right: var(--spacing-4);
    bottom: var(--spacing-4);
    z-index: var(--z-sticky);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    color: var(--text-primary);
    box-shadow: var(--shadow-md);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    max-width: calc(100% - 2 * var(--spacing-4));
  }

  .dimension-badge span {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .dimension-badge small {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  /* ============================================
     LOADING STATE
     ============================================ */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-6);
  }

  .modern-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--color-gray-200);
    border-top-color: var(--color-primary-600);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    margin: 0;
    color: var(--color-gray-600);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
  }

  /* ============================================
     EMPTY STATE
     ============================================ */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--spacing-12);
    color: var(--text-muted);
  }

  .empty-icon {
    margin-bottom: var(--spacing-6);
    opacity: 0.3;
  }

  .empty-state h3 {
    margin: 0 0 var(--spacing-2);
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--text-muted);
  }

  /* ============================================
     RESPONSIVE DESIGN
     ============================================ */
  @media (max-width: 1440px) {
    .app-layout {
      grid-template-columns: 60px 340px 1fr;
    }
  }

  @media (max-width: 1024px) {
    .app-layout {
      grid-template-columns: 60px 300px 1fr;
    }

    .panel-content {
      padding: var(--spacing-2);
      gap: var(--spacing-2);
    }
  }

  @media (max-width: 768px) {
    .app-layout {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .mini-sidebar {
      display: none;
    }

    .content-panel, .viewer-panel {
      grid-column: 1;
      grid-row: 1;
      min-height: 0;
    }

    .app-layout:not(.mobile-viewing) .viewer-panel,
    .app-layout.mobile-viewing .content-panel,
    .app-layout.mobile-choosing .panel-content,
    .mobile-recovery-away { display: none; }

    .mobile-sections {
      grid-column: 1;
      grid-row: 2;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      min-width: 0;
      padding: 4px max(4px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(4px, env(safe-area-inset-left));
      border-top: 1px solid var(--border-strong);
      background: var(--surface-sidebar);
      z-index: var(--z-sticky);
    }

    .mobile-sections button {
      min-width: 0;
      min-height: 52px;
      padding: 4px 0;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-on-sidebar);
      font-size: clamp(12px, .75rem, 16px);
      font-weight: var(--font-weight-semibold);
      line-height: 1.2;
      cursor: pointer;
    }

    .mobile-sections button[aria-current='page'] {
      background: var(--surface-sidebar-active);
      color: var(--color-primary-400);
      box-shadow: inset 0 3px var(--color-primary-500);
    }

    .mobile-sections button:focus-visible,
    .mobile-create-menu button:focus-visible,
    .mobile-workshop-nav button:focus-visible {
      outline: 2px solid var(--color-primary-500);
      outline-offset: -2px;
    }

    .content-panel {
      max-height: none;
      border-right: none;
      border-bottom: none;
    }

    .panel-content {
      min-height: 0;
      padding-bottom: max(var(--spacing-3), env(safe-area-inset-bottom));
      scroll-padding-top: var(--spacing-3);
    }

    .app-layout :global(input[type='number']),
    .app-layout :global(input[type='text']),
    .app-layout :global(select),
    .app-layout :global(textarea) { font-size: max(16px, 1rem, 1em); }

    .mobile-create-menu {
      display: flex;
      flex: 1;
      min-height: 0;
      flex-direction: column;
      gap: var(--spacing-3);
      overflow-y: auto;
      padding: var(--spacing-4);
    }

    .mobile-create-menu h2, .mobile-create-menu h3, .mobile-create-menu p { margin: 0; }
    .mobile-create-menu p { color: var(--text-muted); line-height: 1.4; }
    .mobile-create-menu h3 { margin-top: var(--spacing-2); font-size: var(--font-size-base); }
    .mobile-create-menu button {
      min-height: 48px;
      padding: var(--spacing-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-card);
      color: var(--text-primary);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .mobile-workshop-nav {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-1);
    }
    .mobile-workshop-nav button {
      min-width: 0;
      min-height: 44px;
      padding: var(--spacing-1);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-card);
      color: var(--text-primary);
      font-size: clamp(12px, .75rem, 16px);
      cursor: pointer;
    }
    .mobile-workshop-nav button[aria-current='page'] {
      background: var(--surface-callout);
      border-color: var(--color-primary-500);
    }
    .app-layout:not(.mobile-workshop-sketch) .advanced-sketch,
    .app-layout:not(.mobile-workshop-bridges) .advanced-bridges,
    .app-layout:not(.mobile-workshop-more) .advanced-ai,
    .app-layout:not(.mobile-workshop-more) .advanced-extra,
    .app-layout:not(.mobile-workshop-more) .advanced-tracing { display: none; }
    .advanced-header { display: none; }
    .empty-create {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      margin-top: var(--spacing-3);
      padding: var(--spacing-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-md);
      background: var(--surface-elevated);
      color: var(--text-primary);
    }

    .viewer-panel {
      min-height: 0;
    }

    .header-content {
      height: auto;
      min-height: 56px;
      gap: var(--spacing-2);
      padding-top: var(--spacing-1);
      padding-right: max(var(--spacing-3), env(safe-area-inset-right));
      padding-bottom: var(--spacing-1);
      padding-left: max(var(--spacing-3), env(safe-area-inset-left));
    }

    .logo-section {
      flex: 1;
      overflow: hidden;
    }

    .logo-icon {
      flex-shrink: 0;
      font-size: 1.5rem;
    }

    .logo-text {
      overflow: hidden;
    }

    .logo-text h1 {
      overflow: hidden;
      font-size: var(--font-size-sm);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tagline {
      display: none;
    }

    .current-file {
      display: none;
    }

    .header-actions {
      flex-shrink: 0;
      gap: var(--spacing-2);
    }

    .btn-sm {
      min-width: 44px;
      height: 44px;
      padding: 0 var(--spacing-2);
      font-size: 0.75rem;
    }

    .dimension-badge {
      right: var(--spacing-2);
      bottom: var(--spacing-2);
      left: var(--spacing-2);
      width: max-content;
      max-width: calc(100% - 2 * var(--spacing-2));
      padding: var(--spacing-2);
    }

    .dimension-badge span,
    .dimension-badge small {
      white-space: normal;
    }
  }

  @media (max-width: 768px) and (max-height: 650px) {
    .panel-content {
      padding: var(--spacing-1) var(--spacing-2);
      gap: var(--spacing-1);
    }

    .quick-start {
      padding: var(--spacing-1);
    }
  }

  @media (min-width: 500px) and (max-width: 768px) and (max-height: 480px) {
    .panel-content.mobile-start {
      display: grid;
      grid-template-columns: minmax(0, 40%) minmax(0, 60%);
      align-content: start;
      align-items: start;
      gap: var(--spacing-2);
    }
    .panel-content.mobile-start .tracing-tools { grid-column: 1; grid-row: 1 / span 2; }
    .panel-content.mobile-start > :global(.start-screen),
    .panel-content.mobile-start > :global(.upload-container),
    .panel-content.mobile-start > .quick-start { grid-column: 2; }
  }

  @media (max-width: 480px) {
    .new-design-label {
      display: none;
    }

    .logo-text h1 {
      font-size: var(--font-size-xs);
    }

    .panel-content {
      padding: var(--spacing-2);
    }
  }
</style>
