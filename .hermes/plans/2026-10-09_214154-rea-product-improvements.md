# Cookie Cutter Designer — plan d’amélioration après REA

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Livrer un parcours local fiable : importer ou créer, modifier, régler, sauvegarder, reprendre et exporter un outil dont l’aperçu correspond au document courant.

**Architecture:** Le `DesignDocument` versionné devient la référence persistante. Les stores legacy restent des adaptateurs temporaires pour les composants existants ; l’orchestrateur produit les objets Three.js sans les stocker dans les fichiers projet. Réutiliser codec, validation, IndexedDB et recettes existants ; ne pas créer un second système de projets.

**Tech Stack:** Svelte 5, TypeScript strict, Vite, Three.js, Vitest/happy-dom, IndexedDB, pnpm ; Node >=22.12.

---

## Statut et autorisations

**Mise à jour de livraison, 2026-10-10 :** le GO Discord `1558257545167114381` a depuis autorisé l'ensemble du plan avec commits/push/PR organisés ; aucune fusion ni production sans « GO merge ». Les règles de la phase de planification ci-dessous sont historiques. Lot 1 intégré au commit source `141b774`, conformité PASS, qualité APPROVED, 830 tests et gates locales verts, recette Chromium réussie. Détails : `docs/LOCAL_PROJECT_WORKFLOW_VALIDATION.md`. PR #57 brouillon empilée sur #41 ; publication/CI à vérifier sur le head exact. Lots suivants pas encore réalisés. Organisation actuelle : `.hermes/plans/rea-delivery-organization.md`.

- Ce document est un plan, pas une implémentation ni une autorisation de publication.
- Seul ce fichier est créé pendant la planification. Aucun changement applicatif, commit, push, PR ou déploiement.
- Découper en lots vérifiables. Détailler les lots ultérieurs à partir du code réellement livré, pas coder toute la feuille de route d’un coup.
- Avant chaque commit : présenter les fichiers et le message anglais. Push seulement sur demande explicite ; fusion seulement sur « GO merge ».

## Baseline observée

- Clone : `/workspace/cookie-cutter-designer` ; remote : `https://github.com/razorglyon/cookie-cutter-designer.git`.
- Branche : `feature/design-domain-foundation`, HEAD `399d762`, propre avant ce plan, un commit local en avance sur son upstream.
- `AGENT_CONTEXT.md` mentionne encore `a8da1be` comme dernier commit : corriger cette information pendant l’implémentation, pas pendant ce tour de planification.
- Domaine V1, validation, migration V0, codec, IndexedDB, store document et orchestrateur existent.
- `src/App.svelte:132–172` reconstruit un document pour la génération ; la source est déclarée SVG, le nom dérivé du fichier et les préférences de vue recréées avec des valeurs fixes.
- `publishSvg` crée une nouvelle identité à chaque publication ; il ne faut pas l’utiliser tel quel pour restaurer un projet existant ou modifier son dessin.
- `ProjectManager.svelte` est un ancien composant : nom local non relié au domaine et import par `JSON.parse(...) as ProjectData`. Le remplacer par des actions passant par le codec validant.
- `historyStore.ts` porte actuellement paramètres + SVG, pas tout le document ; son historique doit être réinitialisé lors d’un changement de projet.
- V1 ne sauvegarde pas le raster original : seulement sa vectorisation et ses métadonnées. Ne pas promettre une revectorisation après réouverture sans évolution du format.
- Baseline de 425 tests mentionnée dans le contexte : historique, non rejouée pendant la planification.

### Rapport au plan existant

`docs/product/CODEX_IMPLEMENTATION_PLAN.md` prévoit déjà catalogue, import, atelier, multi-cutter et bibliothèque. Le présent plan ne lance pas un chantier parallèle : il propose d’avancer la bibliothèque locale et l’intégration du document avant le catalogue et les nouvelles recettes. Mettre à jour les deux documents lors du premier lot pour qu’ils ne se contredisent pas.

### Ce que REA a apporté

Rapports hors dépôt :
- `/workspace/reports/cookiecuttercreator-comparison-2026-10-09.md`
- `/workspace/reports/cookiecuttercreator-rea-findings.md`

REA a vérifié l’ouverture de l’atelier et ses contrôles. Ses exports statiques suggèrent préréglages de vectorisation, état versionné, ponts et multi-cutter, sans valider leurs résultats géométriques. Ces observations orientent les besoins ; elles ne constituent ni une spécification copiée ni une preuve de parité. Ne pas intégrer les scripts, illustrations, textes ou catalogue capturés.

## Feuille de route et dépendances

### Lot 1 — Projet local reprenable (priorité immédiate)

**Résultat :** nommer, enregistrer, lister, ouvrir, supprimer avec confirmation, exporter/importer `.ccd.json`, signaler les modifications non enregistrées et les erreurs.

**Limite volontaire :** enregistrement explicite d’abord. Pas d’autosauvegarde silencieuse ni de récupération garantie après crash dans ce premier lot. L’historique undo ne traverse pas un rechargement.

**Pourquoi :** le socle existe déjà ; chaque futur outil devra pouvoir conserver son travail avant d’être utile.

### Lot 1b — Brouillon de récupération (après validation du lot 1)

- Ajouter une autosauvegarde de brouillon séparée des projets nommés.
- Débouncer et sérialiser les écritures ; aucun succès affiché avant confirmation transactionnelle.
- Au démarrage, proposer de reprendre le brouillon ; ne pas écraser silencieusement le projet courant.
- Tester fermeture/rechargement, échec de stockage, projet changé pendant une écriture et plusieurs onglets.
- Concevoir alors la politique multi-onglets : pas de résolution collaborative ou last-write-wins silencieux.

### Lot 2 — Import fluide et démarrage clair

**Dépendance :** lot 1.

Fichiers existants : `src/lib/components/ui/FileUpload.svelte`, `src/lib/utils/imageProcessor.ts`, `src/lib/utils/imageWorkerProtocol.ts`, `src/lib/utils/workerManager.ts`, `src/App.svelte`.

Fichiers proposés : `src/lib/import/imageImport.ts`, `src/lib/import/__tests__/imageImport.test.ts`, `src/lib/components/ui/StartScreen.svelte`.

- Mutualiser fichier, drag-and-drop et collage dans le même pipeline validé.
- Ajouter WebP seulement après un test réel de décodage/vectorisation.
- Ne jamais détourner le collage dans input, textarea ou contenteditable.
- Entrées : Importer, Formes, Reprendre un projet. Dessiner seulement quand le lot 3 est livré.
- Un import invalide ou annulé ne remplace pas le projet courant.

**Acceptation :** fichier et collage du même visuel produisent des contours équivalents ; limites et annulation conservées ; écran utilisable au clavier et sur téléphone.

### Lot 3 — Atelier 2D minimal relié au dessin courant

**Dépendances :** lots 1 et 2.

Fichiers existants : `src/lib/components/ui/PathEditor.svelte`, `src/lib/components/ui/BezierEditor.svelte`, `src/lib/utils/pathOperations.ts`, `src/lib/stores/designDocumentStore.ts`, `src/lib/stores/historyStore.ts`.

Fichiers proposés : `src/lib/sketch/sketchCommands.ts`, `src/lib/sketch/__tests__/sketchCommands.test.ts`, `src/lib/components/ui/SketchWorkspace.svelte`.

- Choisir un seul chemin d’édition ; ne pas raccorder deux modèles de contours concurrents.
- Initialiser à partir de `document.sketch.svg`, pas d’un preset sans lien avec l’import.
- Déplacer/ajouter/supprimer un point, fermer un contour, miroir et rotation ; undo/redo cohérents.
- Préserver `source` ; les éditions changent `sketch` et sa révision.
- Génération réactive et annulable ; aperçu et export refusent un résultat obsolète.
- Pinceau, texte et calques avancés restent hors première tranche.

**Acceptation :** importer → modifier un contour → générer → annuler/rétablir → sauvegarder → recharger ; source initiale inchangée et dessin corrigé conservé.

### Lot 4 — Préréglages de vectorisation

**Dépendance :** lot 2 ; intégrer à l’atelier après lot 3.

Fichiers existants : `src/lib/utils/imageProcessor.ts`, `src/lib/utils/imageWorkerProtocol.ts`, `src/workers/` ; identifier le worker exact lors du détail du lot.

Fichiers proposés : `src/lib/import/tracingPresets.ts`, `src/lib/import/__tests__/tracingPresets.test.ts`.

- Commencer par deux préréglages explicites : dessin contrasté et photo.
- Mesurer leur effet sur nos fixtures : trous, détails fins, bruit, durée et nombre de points.
- Pas de sélection automatique opaque au départ ; afficher le choix actif.
- Appliquer les préréglages à un nouvel import ou au raster encore disponible en session. Pour revectoriser un projet rechargé, décider d’un stockage raster versionné ou demander de réimporter l’image ; ne pas inventer la donnée absente de V1.

**Acceptation :** résultats reproductibles sur corpus original, annulation préservée et aucun blocage de l’UI.

### Lot 5 — Ponts manuels pour les îlots

**Dépendance :** lot 3.

Fichiers existants : `src/lib/domain/designDocument.ts`, `src/lib/domain/documentValidation.ts`, `src/lib/projects/projectCodec.ts`, `src/lib/utils/geometryValidation.ts`, `src/lib/generation/recipes/cutterRecipe.ts`.

Fichiers proposés : `src/lib/domain/migrations/v1ToV2.ts`, `src/lib/geometry/connectors.ts`, `src/lib/geometry/__tests__/connectors.test.ts`, `src/lib/components/ui/ConnectorEditor.svelte`.

- Définir et versionner les ponts persistants avant l’UI ; V2 est une proposition à préciser lors du lot, pas un schéma déjà livré.
- Ajouter, déplacer et supprimer un pont avec undo/redo.
- Valider largeur, intersections et absence d’éléments détachés dans le résultat final.
- Enregistrer/réouvrir les ponts sans changer leur placement.
- Suggestions automatiques seulement dans une tranche suivante, visibles et confirmées.

**Acceptation :** fixture avec îlot devenu connecté, pont supprimable, trou voulu préservé, géométrie valide et anciennes sauvegardes migrées sans changement de forme.

### Lot 6 — Profils simples de paroi

**Dépendance :** lot 1 ; contrôle des interactions avec lot 5 s’il est livré.

Fichiers existants : `src/lib/domain/designParameters.ts`, `src/lib/components/parameters/CutterSection.svelte`, `src/lib/utils/cutterGeometry.ts`, `src/lib/generation/recipes/cutterRecipe.ts`.

- D’abord proposer Fin / Standard / Robuste comme combinaisons de paramètres existants, avec valeurs visibles en mm, sans inventer un nouveau découpage géométrique.
- Ensuite seulement étudier socle/paroi/tranchant indépendants ; évolution de schéma et migrations si nécessaires.
- Ne pas annoncer une sécurité alimentaire ou qualité mécanique certifiée.

**Acceptation :** dimensions et paramètres conformes à l’aperçu/export ; non-régression des anciens projets ; impression physique avant promesse de rigidité.

### Lot 7 — Multi-emporte-pièces (optionnel)

**Dépendances :** document et recette adaptés, validation des lots précédents pertinents.

- Reprendre la tâche Multi Cutter existante au lieu de créer un mode doublon.
- Copies, espacement, encombrement du plateau, puis connexions si justifiées.
- Aucun démarrage automatique : le besoin doit être confirmé par Rza après livraison du parcours principal.

## Lot 1 — plan d’implémentation détaillé

### Contrats à respecter

1. `DesignDocument | null` pour une session vide ; ne pas fabriquer un faux SVG uniquement pour initialiser un store.
2. Un document actif conserve son `id` et `createdAt` lors des modifications. Un nouvel import volontaire crée une nouvelle identité après validation et confirmation éventuelle.
3. `source` contient l’import initial ; `sketch.svg` contient l’état courant ; une modification ne confond pas les deux.
4. La sauvegarde persiste le document, jamais `Mesh`, `Group`, matériaux GPU ou résultats runtime.
5. Ouvrir/importer : lire et valider complètement avant de remplacer la session ; invalider les opérations antérieures et reconstruire l’aperçu depuis le document chargé.
6. Comparer un snapshot sauvegardé au document actuel pour l’état modifié ; ne pas utiliser seulement `updatedAt` comme numéro de révision, deux mutations pouvant partager un horodatage.
7. Une sauvegarde d’un snapshot ancien terminant après une modification n’affiche pas « tout enregistré ».
8. Le document exportable doit représenter l’état montré. Les chemins legacy qui remplacent directement le mesh sans document représentable doivent être adaptés ou explicitement déclarés non sauvegardables ; pas de promesse de conservation pour des outils non migrés.
9. Stockage par navigateur et origine : preview et production ne partagent pas IndexedDB. Expliquer que l’export fichier est la sauvegarde portable.
10. Les erreurs de projet sont séparées des erreurs de génération ; éviter qu’une nouvelle génération efface un échec d’enregistrement.

### Préparation — baseline sans effacer le travail existant

- Lire `AGENTS.md` s’il existe et les décisions techniques.
- Faire `git fetch origin`, comparer HEAD/upstream et main. Pas de pull/rebase silencieux en présence du commit local non poussé.
- Base proposée : HEAD actuel `399d762`, puis branche `feature/local-project-workflow` ; si cette base a divergé, demander l’arbitrage avant changement.
- Ne pas revenir à `origin/main` : cela abandonnerait les fondations dont ce plan dépend.
- Rejouer tests, check, smoke et build, conserver les résultats réels ; la baseline historique n’est pas une validation.

### Tâche 1 — fixtures et construction de document

**Créer :** `src/lib/projects/__tests__/projectFixtures.ts`, `src/lib/projects/createDesignDocument.ts`, `src/lib/projects/__tests__/createDesignDocument.test.ts`.

- Écrire un test rouge : import SVG et raster normalisés, identité/horloge injectées, paramètres typés Cutter/Stamp, source distincte du sketch.
- Exécuter le test ciblé, constater l’échec attendu.
- Implémenter un constructeur passant par `parseDesignDocumentV1`, réutilisant les defaults existants ; pas de nouveau validateur parallèle.
- Rejouer au vert ; ajouter le cas SVG dangereux rejeté sans session créée.

### Tâche 2 — session document et restauration atomique

**Créer :** `src/lib/stores/designSessionStore.ts`, `src/lib/stores/__tests__/designSessionStore.test.ts`.
**Réutiliser :** `src/lib/stores/designDocumentStore.ts`.

- Test rouge : une session vide devient active ; `replace` valide conserve identité, nom, source, paramètres et viewport ; document invalide laisse la session inchangée.
- Tester qu’une édition du sketch ne recrée pas l’identité et préserve la source.
- Implémenter l’enveloppe de session autour du store existant ; ne pas recopier ses mutations typées.
- Rejouer au vert. Ajouter un garde de session pour invalider les publications asynchrones d’un projet précédent.

### Tâche 3 — adaptateur legacy borné

**Créer :** `src/lib/stores/legacyDocumentAdapter.ts`, `src/lib/stores/__tests__/legacyDocumentAdapter.test.ts`.
**Modifier ensuite :** `src/lib/stores/cookieCutterStore.ts` seulement où nécessaire.

- Tester rouge la conversion des paramètres vers/depuis le document pour Cutter et Stamp, la conservation des valeurs, l’absence de boucle et le refus d’un mode non implémenté.
- Implémenter des conversions pures et une synchronisation dont la direction est explicite : commandes UI vers document, projection document vers consommateurs legacy.
- Un seul propriétaire des paramètres persistants ; pas deux subscriptions bidirectionnelles non gardées.
- Rejouer au vert et les tests `cookieCutterStore.generation.test.ts` existants.

### Tâche 4 — contrôleur des actions projet

**Créer :** `src/lib/projects/projectWorkflow.ts`, `src/lib/projects/__tests__/projectWorkflow.test.ts`.
**Réutiliser :** `projectStorage.ts` et `projectCodec.ts`.

- Définir un contrôleur injectant `ProjectStorage` et la session ; état observable pour opération en cours, erreur et dernier snapshot enregistré.
- Tests rouges : enregistrer snapshot courant, ouvrir un projet manquant, ouvrir un projet valide, suppression, échec de transaction et modifications durant `save`.
- Implémenter une séquence d’écriture par session ; ne pas laisser une ancienne réponse modifier le statut du nouveau projet.
- Au vert, vérifier qu’un échec conserve le brouillon en mémoire et laisse possible l’export fichier.
- Ne pas réécrire IndexedDB : corriger son module uniquement si un nouveau test reproduit un défaut réel.

Exemple de test de contrat à adapter aux signatures livrées :

```ts
it('conserve les modifications effectuées pendant une sauvegarde', async () => {
  const save = workflow.save();
  session.rename('Version suivante');
  releasePendingWrite();
  await save;
  expect(workflow.getState().dirty).toBe(true);
  expect(session.getDocument()?.name).toBe('Version suivante');
});
```

`workflow`, `session` et `releasePendingWrite` sont des fixtures proposées pour le test, pas des API déjà existantes.

### Tâche 5 — import/export de fichier portable

**Créer :** `src/lib/projects/projectFiles.ts`, `src/lib/projects/__tests__/projectFiles.test.ts`.
**Réutiliser :** `encodeProject`, `decodeProject`.

- Tests rouges : round-trip `.ccd.json`, JSON invalide, version future, ancien format migré avec warnings, nom de fichier sûr.
- Fixer une limite explicite de fichier avant `File.text()` ; point de départ proposé 10 Mio, à vérifier contre nos fixtures. Définir la constante et tester la frontière, sans limite arbitraire implicite dans l’UI.
- Valider avant tout remplacement ; n’insérer aucun contenu importé avec `innerHTML`.
- Télécharger via Blob et object URL, puis révoquer l’URL ; tester le nettoyage.
- Pour un ID importé déjà présent, demander remplacer ou ouvrir une copie ; aucune écriture automatique à l’import.
- Rejouer au vert. Le fichier projet et le STL doivent rester deux actions distinctes.

### Tâche 6 — interface Projet et bibliothèque locale

**Modifier :** `src/lib/components/ui/ProjectManager.svelte`.
**Créer :** `src/lib/components/library/LocalProjectLibrary.svelte`, `src/lib/components/ui/__tests__/ProjectManager.test.ts`, `src/lib/components/library/__tests__/LocalProjectLibrary.test.ts`.

- Tests rouges happy-dom avec `mount/unmount`, comme `ParameterPanel.test.ts` : nom lié au document, enregistrer/exporter/importer, état vide, liste triée, ouvrir, suppression confirmée/annulée.
- L’UI appelle le contrôleur ; elle ne décode pas par cast `ProjectData` et ne possède pas un deuxième nom de projet.
- Erreurs visibles avec `role="alert"`, statut de sauvegarde avec `role="status"`, boutons désactivés lorsque l’opération correspondante est en cours.
- Ajouter confirmation de remplacement si document modifié : Enregistrer / Abandonner / Annuler. Si Enregistrer échoue, ne pas poursuivre le remplacement.
- Distinguer erreur de chargement de bibliothèque et bibliothèque vide ; un projet corrompu ne doit pas être présenté comme absent. La politique actuelle de `list()` rejette toute liste contenant un document invalide : afficher l’échec, ne pas supprimer les données ni cacher ce cas.
- Rejouer au vert ; tester accès clavier et focus après fermeture du dialogue.

### Tâche 7 — raccordement de l’application et des préférences

**Modifier :** `src/App.svelte`, `src/lib/components/ui/ParameterPanel.svelte`, `src/lib/components/viewer/ThreeViewer.svelte` si nécessaire pour les contrôles de viewport.
**Créer :** `src/lib/projects/__tests__/projectSessionIntegration.test.ts`.

- Tests rouges d’intégration : le document restauré, et non un document reconstruit avec defaults, est fourni à l’orchestrateur.
- Instancier storage/session/workflow au niveau application ; brancher panneau Projet et bibliothèque locale.
- Remplacer `createGenerationDocument` par un snapshot du document actif ; ne jamais sauvegarder le dernier résultat généré à la place du dernier état édité.
- Import initial et édition SVG deviennent deux commandes distinctes. Identifier les handlers legacy qui modifient le modèle directement, les couvrir ou bloquer la sauvegarde avec une explication si leur état ne rentre pas dans V1.
- Lors d’une ouverture : invalider la vectorisation précédente, annuler la génération, remplacer le document validé en une transition, réinitialiser historique, projeter paramètres/vue, relancer une génération.
- Les valeurs `showGrid/showAxes/showWallThickness` restaurées sont effectivement utilisées par le viewer ; ne pas seulement les conserver dans JSON.
- Au démontage : désabonner, invalider les callbacks et fermer le stockage après les opérations nécessaires ; conserver les règles de disposal Three.js.
- Rejouer au vert les tests d’orchestrateur et de disposal ; scénario A lent puis ouverture B : A ne réapparaît jamais.

### Tâche 8 — historique borné au projet et protection des changements

**Modifier :** `src/lib/stores/historyStore.ts`, `src/App.svelte`.
**Créer :** `src/lib/stores/__tests__/historyStore.projectBoundary.test.ts`.

- Tests rouges : ouvrir B après A vide l’historique A ; annuler ne peut pas revenir à A ; restaurer un état ne pousse pas des doublons réactifs.
- Undo/redo met à jour le document actif, pas seulement `svgCache` et les paramètres legacy ; préserver identité/source et recalculer dirty.
- Protéger Nouveau/import/ouvrir avec la confirmation du contrôleur. Ajouter un avertissement navigateur `beforeunload` uniquement lorsqu’il existe des changements non enregistrés, sans le présenter comme fiable sur mobile.
- Rejouer au vert ; export fichier reste disponible en cas d’IndexedDB indisponible.

### Tâche 9 — validation réelle et documentation

**Modifier :** `README.md`, `AGENT_CONTEXT.md`, `docs/product/FEATURE_GAP_MATRIX.md`, `docs/product/CODEX_IMPLEMENTATION_PLAN.md`.

- Exécuter le pipeline ci-dessous et conserver sorties réelles.
- Tester IndexedDB dans Chromium : les tests à backend mémoire ne prouvent pas la persistance après rechargement.
- Scénario : importer SVG → nommer → changer paramètres/vue → enregistrer → recharger complètement → ouvrir → comparer → exporter JSON → importer → comparer → exporter STL et valider.
- Répéter sur Stamp et une image raster ; vérifier avertissement sur la non-conservation du raster original.
- Cas d’erreur : import corrompu, stockage indisponible, modification durant sauvegarde, opération ancienne après changement de projet et confirmation annulée.
- Documenter le stockage local par origine, les exports portables, les limites V1 et l’absence d’autosauvegarde dans ce lot.
- Avant commit, présenter les fichiers et messages ; commits cohérents proposés : `connect design session to generation`, `add local project workflow`, `add project library and file exchange`, `document local project persistence`.
- Aucun push sans demande ; proposer ensuite une PR et un aperçu si le workflow du dépôt le permet, sans supposer Firebase.

## Commandes de vérification prévues (non exécutées pendant ce plan)

Depuis la racine du dépôt :

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1

TMPDIR="$REPO_TMP" pnpm exec vitest run src/lib/projects src/lib/stores --pool=threads --maxWorkers=1 --fileParallelism=false
TMPDIR="$REPO_TMP" pnpm exec vitest run src/lib/components --pool=threads --maxWorkers=1 --fileParallelism=false
TMPDIR="$REPO_TMP" pnpm exec vitest run --pool=threads --maxWorkers=1 --fileParallelism=false
TMPDIR="$REPO_TMP" pnpm run check
TMPDIR="$REPO_TMP" pnpm run test:smoke
GOMAXPROCS=2 UV_THREADPOOL_SIZE=2 TMPDIR="$REPO_TMP" pnpm run build
```

Pour chaque tâche : écrire le test → exécuter le fichier précis avec Vitest → constater l’échec lié au comportement manquant → implémenter au minimum → rejouer au vert → revue conformité et qualité. Aucun total de tests prédit.

## Critères de fin du lot 1

- Identité, nom, source initiale, sketch courant, paramètres et préférences de vue survivent à sauvegarde/rechargement.
- Aperçu reconstruit depuis ce même document ; export STL n’utilise pas un résultat d’une ancienne session.
- Fichier projet round-trip avec validation stricte et warnings de migration visibles.
- Erreurs et changements non enregistrés visibles ; aucune perte silencieuse lors d’ouverture/import.
- Historique borné au projet ; callbacks asynchrones anciens inoffensifs.
- IndexedDB testé dans un vrai navigateur, pas seulement via backend mémoire.
- Tests, check, smoke et build réellement réussis ou blocage explicitement documenté ; un blocage n’autorise pas à déclarer la livraison validée.
- Aucun cloud/compte/paiement ajouté. Aucun code concurrent recopié.

## Risques et arbitrages retenus

- **Deux sources de vérité :** risque majeur du bridge legacy ; limiter l’adaptateur, documenter la direction, tester les boucles et valeurs restaurées.
- **Persistance navigateur :** peut être supprimée ou indisponible ; export fichier nécessaire, pas de promesse de sauvegarde définitive.
- **Plusieurs onglets :** pas de synchronisation collaborative au lot 1 ; prévenir les écritures concurrentes détectables et détailler la politique au lot 1b.
- **Données raster absentes :** ne pas prétendre revectoriser le fichier original à partir du SVG seul.
- **Outils avancés legacy :** ne pas afficher « enregistré » si leur résultat n’est pas représenté dans le document.
- **Géométrie :** ponts et zones indépendantes demandent tests de migration/topologie et essais physiques, hors lot 1.
- **Périmètre :** priorité au parcours utile, pas à la parité de catalogue avec le concurrent.

## Prochaine autorisation

Demander le GO pour implémenter **le lot 1 uniquement**, sur branche dédiée, sans publication. Les autres lots restent une feuille de route ; ils recevront un détail actualisé et une validation avant exécution.
