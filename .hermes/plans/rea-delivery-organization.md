# Organisation des livraisons — plan REA complet

## Autorisation actuelle

Rza a autorisé l’ensemble du plan, commits et PR compris, dans son message Discord `1558257545167114381`. Cette autorisation remplace la limite au lot 1 et l’interdiction de push précédente pour ce chantier uniquement. Aucune fusion ni mise en production sans « GO merge » ; ne pas modifier les règles de protection ni les workflows de déploiement pour contourner cette limite.

## Identité et état

- Dépôt exact : `razorglyon/cookie-cutter-designer` ; clone stable `/workspace/cookie-cutter-designer`.
- Compte global `gh` : `bot-rza`, permission READ constatée pour ce dépôt.
- Compte `razorglyon` déjà enregistré : identité et permission push/admin vérifiées par API avec sélection limitée à la commande, sans changer le compte global. Utiliser ce compte explicitement pour les publications de ce dépôt ; ne jamais afficher ou stocker de token dans le dépôt.
- Branche en cours : `feature/local-project-recovery`, depuis #58/head72fc457. Lot1 #57 intégré au source141b774 ; correctif sécurité #58 séparé ; recovery lot1b sourcec3d9fba publié dans **#59 brouillon**. Conformité PASS et qualité APPROVED, 915 tests et11 étapes Chromium recovery réussis. Provenance : `docs/LOCAL_PROJECT_RECOVERY_VALIDATION.md`. CI à relire sur le dernier head exact ; aucune fusion ou production.
- PR existante de fondations : #41, `feature/design-domain-foundation` → `main`. Ne pas la fusionner ni remplacer son travail. Les PR Dependabot ouvertes sont hors périmètre.

## Topologie prévue

Une branche et une PR par lot, empilées si les prérequis ne sont pas fusionnés :

1. Lot1 **#57**, `feature/local-project-workflow` → `feature/design-domain-foundation` : projets locaux/UI/intégration livrés en brouillon, pas en production.
2. Intercalaire sécurité **#58**, `fix/dependency-audit` → `feature/local-project-workflow` : audit12→0 avis connus, sans modification applicative ; autorisation distincte. PR43/47 restent ouvertes, pas de fermeture automatique.
3. Recovery **#59**, `feature/local-project-recovery` → `fix/dependency-audit` : brouillon séparé et politique multi-onglets, validés et publiés en brouillon. Les branches futures listées ci-dessous restent proposées, pas réalisées.
4. `feature/unified-image-import` → branche lot 1b : collage, WebP, écran de départ.
5. `feature/document-sketch-editor` → branche lot 2 : atelier courant et historique.
6. `feature/tracing-presets` → branche lot 3 : presets dessin/photo et données raster disponibles seulement si vraiment conservées.
7. `feature/manual-connectors` → branche lot 4 : ponts persistants, format/migration évolutifs non destructeurs.
8. `feature/cutter-wall-profiles` → branche lot 5 : presets de paramètres existants puis zones indépendantes uniquement si vérifiées.
9. `feature/multi-cutter-layout` → branche lot 6 : copies, espacement, encombrement et connexions testées. Le GO complet couvre désormais ce lot auparavant optionnel.

Les noms des branches aval sont proposés : vérifier leur disponibilité avant création. Exécution séquentielle sur le clone ; pas de deux workers écrivant le même fichier ou la même branche. Une PR empilée compare uniquement au lot précédent pour conserver une revue lisible. PR draft tant que ses dépendances/validations ne sont pas prêtes. Ne pas rebasing/force-push pour retarget automatiquement ; demander un arbitrage si les branches divergent.

## Commits

- Commits cohérents et anglais impératif : document/session, workflow, UI, intégration/tests, documentation.
- Avant chaque commit : présenter fichiers et message prévu ; le GO global autorise ces commits sans redemander chaque fois.
- Indexer explicitement les fichiers du lot, vérifier diff indexé et secrets ; jamais `git add -A` indiscriminé.
- Conserver les fondations et le commit local préexistant ; pas de reset, clean, suppression de branche ou stash destructeur.

## PR et réversibilité

Chaque body cite ses commits, la PR prérequise, les changements métier, les validations réellement exécutées, les limites et la marche arrière :

- Avant fusion : fermer la PR suffit à ne pas livrer son code ; aucune suppression de données nécessaire.
- Après fusion : `git revert` des commits/merge appropriés dans une branche de rollback, tests puis PR de retour arrière. Pas de reset/force-push sur une branche publiée.
- Données : aucune migration destructrice ni écrasement silencieux. Export portable disponible avant changements de schéma. Nouveaux formats rejettent les versions futures ; documenter les données qui exigent la version récente et ne pas prétendre qu’un ancien binaire les relit.
- Les PR dépendantes ne doivent pas être fusionnées si leur parent est annulé. La procédure de retour arrière liste les dépendances à retirer dans l’ordre inverse.

## Gates par lot

1. Tests RED/GREEN des nouveaux comportements.
2. Revue conformité, corrections, puis revue qualité.
3. Vérification intégrée : tests complets, check, smoke exports, build ; navigateur réel sur le parcours utilisateur.
4. Résumé des fichiers/commits ; commit ; remote exact et identité vérifiés ; push puis PR.
5. Relire SHA distant et PR head/base/body, vérifier checks de l’exact head. Une CI échouée reste une limite, pas une livraison validée.
6. Aucun merge automatique. L’aperçu validé par Rza ne donne pas un GO merge implicite.

## Réserves non escamotables

- Le parcours local du lot 1 est intégré et validé localement ; cela ne signifie ni CI distante verte, ni fusion, ni production. PR #57 reste brouillon, dépendante de #41 ; l'ancien échec d'audit doit rester visible.
- Les essais physiques restent une validation humaine pour rigidité et découpe ; on peut implémenter/tester la géométrie, pas inventer une impression.
- Ne pas introduire comptes, paiement, cloud ou assets/code du concurrent.
- Le plan principal reste `.hermes/plans/2026-10-09_214154-rea-product-improvements.md`; ce document remplace seulement ses anciennes limites d’autorisation et fixe la stratégie Git/PR.
