# Lot REA 1b — brouillons de récupération

## Autorisation, base et résultat

Rza « Continue », Discord1558447158800420917, prolonge le programme REA autorisé (commits/push/PR réversibles). Branche `feature/local-project-recovery` depuis `72fc45702a9e60b160600ea0f175099463a5e9f4` / PR58. PR distincte empilée sur fix/dependency-audit. Aucun merge, cloud, compte, migration du projet V1 ni production.

Résultat : autosauvegarde locale du document canonique sale, séparée de la bibliothèque ; reprise explicite au démarrage et sur demande, via workflow.startNew et ses gardes de remplacement. Ne jamais annoncer un brouillon sauvé avant transaction complète. Ce lot est **1b** dans le plan REA (la récupération appelée précédemment lot2 dans les résumés) ; l'import fluide reste le lot2.

## Politique de données et multi-onglets

- Base IndexedDB séparée `cookie-cutter-designer-recovery`, version1, store drafts keyPath draftId. Aucune ouverture/upgrade du store projects par le recovery.
- Enveloppe stricte {format:'cookie-cutter-designer-recovery', version:1, draftId, savedAt, document}. Document validé/reconstruit par parseDesignDocumentV1. Identifiant UUID, date ISO valide ; refus des versions futures/clefs inconnues et données corrompues, pas de suppression automatique.
- **Un identifiant de brouillon neuf par époque de session et par instance App**. UUID aléatoire, jamais localStorage/sessionStorage partagé ou hérité lors d'une duplication d'onglet. Deux onglets, même projet : deux brouillons, aucune résolution collaborative/LWW implicite.
- Éditions dans la même époque : même brouillon, écritures débouncées750ms, sérialisées ; passage vers un autre projet conserve le dernier snapshot sale accepté de l'ancien projet sous son identifiant distinct. Ne pas le laisser écrire dans le nouvel emplacement.
- Reprise = lire/valider puis workflow.startNew(snapshot). Ne supprime ni ne modifie le brouillon source, potentiellement utilisé par un autre onglet ; pas de claim automatique ou modification d'une session étrangère. Les copies restent listées tant qu'on ne les supprime pas explicitement.
- Suppression d'un brouillon uniquement après confirmation explicite, **comparaison atomique du snapshot/enveloppe attendu** dans une transaction IndexedDB readwrite : si un onglet l'a actualisé entre liste et confirmation, refuser et rafraîchir. Aucune suppression globale/pruning silencieux.
- Après sauvegarde explicite, la suppression du brouillon propre à l'époque courante n'est permise que si sa dernière version correspond exactement au snapshot sauvegardé ; une édition intervenue pendant la sauvegarde reste récupérable. Simplification sûre autorisée : garder les brouillons après sauvegarde et l'expliquer, plutôt qu'introduire une purge incertaine.
- Batch non représentable : suspendre les nouvelles captures, préserver les brouillons déjà confirmés ; pas de mesh/undo/raster original dans l'enveloppe. Historique réinitialisé par la session native à la reprise.
- Crash, fermeture forcée ou arrêt avant transaction complète : pas de garantie du dernier geste. flush sur visibilité hidden/pagehide = best effort, pas de promesse d'écriture transactionnelle à unload. dispose draine les écritures acceptées dans les tests/unmount normal.

## Topologie d'implémentation

1. **Fondations + contrôleur**, propriétaire lane recovery-core : créer uniquement src/lib/projects/projectRecovery.ts, projectRecoveryStorage.ts et leurs tests dans src/lib/projects/__tests__/. Interfaces injectables ; aucun App/UI/workflow/session/manifest/lockfile existant modifié. Exposer une API explicite au parent pour observer(document, epoch, dirty, available), flush(), list(), get/read, deleteExpected(record), dispose(), et état readable. Se reporter aux types réellement lus, expliciter tout ajustement nécessaire.
2. Rejeu parent + conformité fondations, puis qualité indépendante, avant intégration.
3. **Intégration et UI**, propriétaire parent/lane dédiée après contrats vérifiés : App.svelte et nouveau RecoveryPanel.svelte/tests. Observer session et workflow avec validité synchrone/source ; les gardes workflow.startNew et ask existants restent propriétaires du remplacement. Raccorder après creation du workflow/runtime. Panel visible au démarrage même sans document ; bouton refresh/reprendre/supprimer, erreurs/retry, statut autosave distinct du Saved locally. Confirmation clavier/modal existant, restore race/lifetime protégés.
4. Rejeu full + check + smoke + build + audit ; vrai Chromium IndexedDB : créer/éditer/attendre-confirmation/reload/reprendre, bibliothèque intacte, deux onglets indépendants, reprise annulée, suppression mise à jour concurremment refusée, panne de stockage visible/export explicite conservé. Deux revues séparées conformité puis qualité avant commit/publication.

## Tests obligatoires des fondations

RED réel avant implémentation ; typecheck ciblé/global après. Codec strict version/inconnues/date/id/document/mutation ; stockage valide lecture/écriture, corruption et erreurs, transaction-confirmation native à prouver au navigateur ; retry open/close.

Contrôleur : debounce coalescing, serialisation deferred writes, A→B pendant write, flush changement d'époque avant debounce, success/error stale ne modifiant pas B, réentrant callbacks/dispose, dirty=false initial sans write, storage failure/retry et cancellation timer ; indépendance deux contrôleurs et mêmes IDs projet. Les valeurs comparées dans les tests doivent être copies indépendantes.

Pour tout test/build : TMP isolé helper workspace-tmp.py (échec/vide=arrêt), GOMAXPROCS=2 UV_THREADPOOL_SIZE=2 ; Vitest threads maxWorkers1 fileParallelismfalse. Une seule lane de validation lourde à la fois. Pas d'installation ou modification de dépendances.

## Livraison et limites

Commits cohérents fondations puis intégration/documentation, fichiers explicitement indexés et message anglais impératif annoncés avant commit. PR en brouillon sur #58, remote/head vérifiés ; Quality dispatch sur head exact car base non-main. Main et projets enregistrés inchangés. Fermer PR avant fusion ou revert ciblé après GO merge, jamais force-push ou suppression de données.

État initial : branche créée, plan détaillé ; fondations non implémentées. Baseline héritée de72fc457 : 830 tests/55 fichiers, audit0 connu, CI Quality38049362573 réussie. Ne pas déclarer le recovery fini à partir de cette baseline.

## Livraison vérifiée après cette baseline

Fondationsfc757b1 et intégrationc3d9fba publiées dans **PR59 brouillon** sur #58. Global parent915/59, check0/0, smoke3, buildOK, audit0 connu ; core et UI chacune conformitéPASS puis qualitéAPPROVED sur leurs octets committés. Chromiumréel11 étapes, source/données/reload/multi-onglets/conflict/delete/quota/retry/backup/Saveproject exercés ; preuves et limites dans `docs/LOCAL_PROJECT_RECOVERY_VALIDATION.md`.

Politique effectivement retenue : les brouillons restent après Save project, aucune purge automatique. App raccordée au contrôleur, reprise via workflow.startNew, suppression atomique expected, listenersbest-effort et drainage avantclose. Aucun cloud/compte/schemaV1 modifié. CI à lire sur head final après le checkpoint documentaire ; aucune fusion/déploiement. Lot1b livré en PR, pas en production ; prochain lot2 import fluide séparé.
