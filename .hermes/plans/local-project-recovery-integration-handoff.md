# Recovery — raccordement App après validation des fondations

État : handoff initial conservé ci-dessous, **désormais implémenté** au sourcec3d9fba dans PR59 brouillon sur #58. ConformitéPASS, qualitéAPPROVED, global915 tests et11 étapesChromium réussis ; provenance/limites : `docs/LOCAL_PROJECT_RECOVERY_VALIDATION.md`. Base72fc457 ; branchefeature/local-project-recovery ; aucune fusion autorisée. Les instructions ci-dessous sont le plan historique, pas une affirmation que chacun de ses cas attendus a un test explicite.

## Points de raccordement réellement lus

- App.svelte246–291 : props projectSession/projectStorage, session native, ask/choose et workflow, captureTransitionValidity sourceRevision+epoch+alive.
- App292–353 : intégration native, abonnement historique/session ; placer l'observation recovery après le workflow et préserver son ordre de synchronisation. Ne pas observer un snapshot queued ancien : comparer document === session.getDocument() et relire epoch/dirty courants.
- App521 : un batch externe rend unavailableReason non-null ; suspendre les captures tant que la représentation canonique est indisponible, conserver les données déjà acceptées.
- App591–615 : unmount invalide alive et ferme session/workflow/génération. Détacher abonnements/listeners recovery puis dispose/flush-drain du contrôleur et close du stockage recovery distinct ; aucun callback tardif ne doit refaire apparaître statut/modal/session. Ne pas mélanger close recovery et projectStorage.
- App859–864 : ProjectManager/LocalProjectLibrary dans catégorie projects, inaccessible au démarrage sans clic. La proposition de recovery doit aussi être visible depuis l'accueil ; éviter un panel permanent intrusif vide. Une seule instance de panel (pas doublée par catégorie), status distinct du Saved locally.
- App619–624 : dialogue existant modal clavier/inertness ; réutiliser ask pour suppression, pas window.confirm.

## API / intégration attendue après résultat vérifié

Les signatures exactes seront celles de la lane core réellement reçue et relue ; ne pas inventer des imports avant son retour. Ajouter une prop storage recovery injectable pour tests App, sans modifier les props existantes ou transformer les tests legacy en faux runtime.

Créer un panel RecoveryPanel.svelte (nouveau) + tests composants, et App.recovery.test.ts (nouveau). Un propriétaire unique App et panel. English UI conforme au reste de l'app ; échanges Rza en FR.

## Garde obligatoire de reprise

1. Au clic, verrouiller synchroniquement l'action, capturer lifetime, séquence, sourceRevision, epoch et identité du document courant **avant le premier await**, notamment storage.get.
2. Lire/revalider le brouillon. Si sa version diffère de l'enveloppe affichée, proposer refresh/refuser une reprise obsolète plutôt qu'adopter silencieusement un autre snapshot. Ne pas effacer le brouillon source.
3. Vérifier captures après await : une édition dans la même époque, un import commencé, un batch ou un unmount doit annuler la reprise tardive.
4. Appeler workflow.startNew(document) : cette API possède la confirmation du dirty, le save/discard/cancel et la garde finale. Aucun session.replace direct ni baseline bricolée.
5. Succès : ouvrir paramètres/aperçu du document canonique repris ; dirty true, Save project explicitement nécessaire. Garder source/sketch/params/viewport/id. Ne pas reprendre undo, runtime mesh, image raster absente de V1 ou catalogue depuis le brouillon.
6. Échec/annulation : session, historique, génération, bibliothèque et brouillon inchangés ; erreur/retry accessibles. Un échec natif de stockage ne doit pas casser export .ccd.json du workflow existant.

Suppression : confirmation mentionnant le nom et le timestamp ; deleteExpected de l'enveloppe affichée, pas get+delete sans transaction. Si autre onglet actualise, refus visible puis refresh. Double-clic/unmount/séquence protégés. Pas de suppression automatique après sauvegarde explicite dans cette V1.

## Matrice de recette App et navigateur

- Aucun brouillon : accueil actuel utilisable ; chargement/retry n'invente pas succès.
- Brouillon initial valide : proposition affichée mais session reste null jusqu'au clic.
- Reprise : paramètres/sketch/viewport exacts dans session/génération/JSON ; projet enregistré inchangé, dirty true.
- Dirty courant + Cancel : identités document/epoch/histoire/mesh/brouillon inchangées.
- Lire A lentement puis modifier/ouvrir B/importer : A ne remplace pas B à sa résolution.
- Sauvegarde de projet courant : bibliothèque seule mise à jour par action explicite ; brouillon conservé, texte clair.
- Édition puis attendre autosave confirmée, reload dans même origin : brouillon proposé, reprise explicite et export réel conforme.
- Deux pages même contexte navigateur/même projet : deux draftId UUID différents, edits indépendants, reprise par copie n'efface pas l'autre.
- Update concurrent pendant confirmation delete : transaction refuse l'enveloppe obsolète ; aucune perte.
- Quota/open/transaction failure : statut d'erreur recovery distinct, retry, export backup toujours disponible.
- pagehide/visibilityhidden : flush best effort seulement ; tests deferred ne promettent pas écriture complète avant fermeture forcée.
- Unmount : timers/abonnements/listeners retirés, écritures acceptées drainées, aucune publication ultérieure.

Établir RED puis GREEN sur les tests App/composants. Full tests/check/smoke/build/audit sérialisés avec TMP isolé ; vrai Chromium après les replays et avant publication. Recette réelle hors dépôt avec provenance, pas résultats synthétisés. Conformité puis qualité indépendante requises.
