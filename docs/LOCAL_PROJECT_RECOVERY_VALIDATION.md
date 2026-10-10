# Validation — brouillons de récupération locaux (REA lot 1b)

## Livraison et périmètre

Date : 2026-10-10. Dépôt razorglyon/cookie-cutter-designer, clone /workspace/cookie-cutter-designer. Branche feature/local-project-recovery, **PR #59 brouillon**, base fix/dependency-audit / #58. Programme REA et Continue1558447158800420917 autorisent commits/push/PR ; **aucun merge ou déploiement sans GO merge**.

- Fondations : `fc757b1140a20feda926ee348e6173b3493808d0`, add isolated local recovery drafts.
- App/UI : `c3d9fbacb4f30fe22da947011112538fa01d8d26`, connect recovery drafts to the app workflow.
- Le checkpoint documentaire suivant ne change aucun octet de source, tests, manifeste, lockfile ou configuration.
- Base produit #57 et correctif sécurité #58 restent séparés, ouverts, non fusionnés ; aucune fermeture des PR Dependabot.

## Contrat livré

Base IndexedDB distincte cookie-cutter-designer-recovery, version1, store drafts ; enveloppe format/version/draftIdUUID/savedAt/documentV1 stricte, détachée, gelée et revalidée à lecture/écriture. Pas de modification du schéma des projets nommés.

Un UUID neuf par instance/époque, même projet dans plusieurs onglets = brouillons indépendants. Debounce750ms, queue sérialisée, confirmation seulement après completion transactionnelle. Les snapshots de l'ancien projet gardent leur emplacement et ne remplacent pas le statut du nouveau.

Reprise explicite via workflow.startNew et garde save/discard/cancel : capture avant première attente, version affichée vérifiée, éditions/imports/changements de session/unmount invalidant une reprise tardive. Pas d'autorécupération, pas de suppression du brouillon source. Suppression confirmée via comparaison atomique dans une transaction ; conflit visible et refresh si un autre onglet actualise la version.

Brouillons **conservés après Save project**, supprimables explicitement. Erreurs/retry et statut autosave distincts de Saved locally ; export .ccd.json utilisable comme backup. Flush pagehide/visibilityhidden best effort, drainage au démontage normal.

## Provenance des contrôles

- TDD fondations : RED réel puis52 ciblés verts ; rejeu parent global882/57 et check0/0 avant commit.
- Conformité core deleg_908eab2c PASS ; qualité deleg_10d31ca1 APPROVED. Digest4 trié UTF-8+NUL+octets+NUL : `2fc266d643616285fed2513f3e46f445ec07d5dbe2a0352d120adf16b604b2ec`, identique aux octets committés.
- TDD intégration : RED proposition initiale, puis73 ciblés verts incluant App.local-projects et App.export-validity, sans modification des tests voisins.
- **Global parent : 915 tests / 59 fichiers**, check0 erreur/0 warning, smoke exports3, build réussi, pnpm audit au seuil moderate0 avis connus. TMP isolé, threadsVitest1 et validations sérialisées. Warning chunkThree.js>600kB préexistant.
- Conformité UI deleg_cfc14922 PASS ; qualité deleg_8fddb9ad APPROVED. Digest4 : `7cb502cea7a816d2b4831244319a8ac20fdb28005df83eba3df8177648f7c1f6`, vérifié et identique au commitc3d9fba. Revues lecture seule, pas des replays runtime supplémentaires.

## Chromium réel — observation ponctuelle hors dépôt

Script : /workspace/reports/local-project-recovery-browser.mjs. Rapport : commands/native-recovery-1791636402629/report.json sous TMP du dépôt. Serveur Vite127.0.0.1:4325, contexte navigateur neuf, données de recette jetables ; viewport1365x900 puis375x812. Capture de l'application réelle, pas montage alternatif de composants ni donnée native simulée. Seule la panne quota est injectée intentionnellement dans put du store recovery ; le reste passe par les vraies UI et transactions IndexedDB.

**11 étapes réussies :**
1. Création/sauvegarde nommée puis édition : brouillon confirmé égal au JSON exporté, bibliothèque inchangée.
2. Reload propose le brouillon sans ouvrir automatiquement un document.
3. Reprise explicite exacte avec génération, dirty, brouillon source et projet enregistré préservés.
4. Deux onglets éditent le même ID projet avec UUID de brouillons différents ; ancien brouillon conservé.
5. Reprise pendant dirty : Cancel natif conserve document et brouillon.
6. Autre onglet actualise pendant confirmation delete : transaction comparative refuse le snapshot obsolète.
7. Delete Cancel conserve ; confirmé supprime uniquement le brouillon choisi et rend le focus.
8. Quota recovery-only injecté : erreur visible, backupJSON disponible, bibliothèque intacte.
9. Après restauration de put natif, retry confirme le dernier snapshot accepté.
10. Save project explicite modifie le projet nommé sans purger le brouillon.
11. Desktop puis largeur375 : captures inspectées, aucun overflow horizontal global.

Errors/consoleErrors/failedRequests vides. HEADfc757b1 et digest11 des sources/tests/manifeste/lock/config `fcf331130e40dc2e33148ae48621eb942395dbf8a8362eb8e3f279eb10b3a2d6` identiques avant/après. Les mêmes octets ont été comparés aux blobs du commitc3d9fba avant publication. Le SHA de collecte n'est donc pas présenté comme le SHA committé à ce moment ; l'égalité des contenus est démontrée séparément.

## Limites et suite

Le browser harness/rapport/captures restent hors dépôt et non intégrés à la CI. Les captures montrent des portions visibles/scrollées du panneau, pas tous les contrôles simultanément. Pas de certification lecteur d'écran, responsive global, application déployée ou impression physique. Le chrono exact750ms n'est pas mesuré par les tests App/UI (couvert au niveau core), et unmount pendant le prompt de reprise n'est pas un cas App explicite : les tests distinguent lecture retardée et prompt delete.

Aucune garantie du dernier geste avant crash/fermeture forcée ou transaction terminée. Aucun undo/raster original après reload ajouté au formatV1. Pas de purge automatique, claim collaboratif ou LWW multi-onglets.

La CI finale doit être lue sur le head exact de #59, dispatch Quality seulement car base non-main ; les résultats locaux ne la rendent pas implicitement verte. Aucun Deploy lancé. Après autorisation de fusion seulement, rollback via PR de revert ; ne pas supprimer les bases utilisateur. Prochain lot fonctionnel : import fluide, lot2, branche/PR distincte.
