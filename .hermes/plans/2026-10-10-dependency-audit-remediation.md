# Lot séparé — audit des dépendances

## Autorisation et base

GO de Rza « Oui », message Discord `1558438205903212658`, pour un lot de correction de dépendances avant la récupération automatique. Branche `fix/dependency-audit` depuis `317ea35d1e3bda1fadcc894301400303812a348e`, parent PR #57. Commits et PR séparés dans le programme autorisé ; aucun merge, déploiement, baisse de seuil ou réglage GitHub distant.

## Baseline réellement mesurée

- Node 22.23.1 / pnpm 10.33.4 ; clone propre, base locale = distante.
- `pnpm audit --json` : 12 alertes, 0 critical / 5 high / 6 moderate / 1 low.
- Familles : Vitest + mocker 4.1.10 (2 alertes) ; devalue 5.8.2 sous Svelte (7) ; PostCSS 8.5.21 sous Vite, nanoid 3.3.16 et source-map-js 1.2.1 (3).
- Base produit validée sur `141b774` : 830 tests, check0/0, smoke3, buildOK ; native Chromium13 étapes. CI Quality du head documentaire317ea35 échoue à l'audit, run38044892881.

## Réutilisation des PR ouvertes

- PR #47, head exact `2bd47a8c1ec8d6e0a2fb70c716e54c17114a75c4` : mise à jour Vitest4.1.11. Installation frozen et audit rejoués dans `/workspace/cookie-cutter-designer-security-pr47` détaché, propre : 10 alertes restantes, les deux Vitest/mocker disparaissent. Réutiliser son patch package/lockfile plutôt que réinventer une autre version ; attribuer ce correctif dans la nouvelle PR. Ne pas fermer/fusionner cette PR sans arbitrage humain.
- PR #43 : Svelte5.56.8 et svelte-check4.7.4, devalue5.9.0 ; insuffisant pour les avis actuels exigeant devalue5.9.3. Ne pas importer sa mise à jour non nécessaire.
- Les autres PR Dependabot ne portent pas les familles signalées ; ne pas mélanger leurs mises à jour.

## Correctif compatible ciblé

1. Réutiliser le patch exact de #47 (package.json + pnpm-lock.yaml), après vérification d'application.
2. Rafraîchir seulement les transitives devalue, postcss, nanoid, source-map-js dans les contraintes des parents existants. Premiers correctifs : devalue5.9.3, PostCSS8.5.23, nanoid3.3.18, source-map-js1.2.2. Pas d'override, force, changement de registre ou migration majeure.
3. Inspecter le diff complet et les sources/integrities du lockfile. Aucune modification de src, configuration de tests, CI ou fonctionnalités.
4. Si les contraintes ne permettent pas ces correctifs, arrêter et proposer séparément la migration nécessaire, sans la faire implicitement.

## Exposition et sources

Les chemins observés sont des dépendances de Svelte, du bundler et du runner. Ce constat ne démontre pas une exploitation de l'application : examiner les imports et les conditions des avis, et ne pas déclarer le navigateur exploitable par le seul compteur.

Sources primaires consultées, GitHub Advisory Database :
- GHSA-82fw-gwwq-j7x9 : Vitest/mocker4.1.11 ; lecture de fichiers via certains plugins de serveur de développement.
- GHSA-j22f-vq7h-c4qm : devalue5.9.3 ; sérialisation des buffers partagés, notamment côté SSR Node.
- GHSA-fxqj-rqcc-2cmp : PostCSS8.5.23 ; sourceMappingURL non fiable avec from absent.
- GHSA-2v37-7h3g-55p8 : nanoid3.3.18 ; taille0 sur générateurs personnalisés.
- GHSA-68fv-2mgg-jv7q : source-map-js1.2.2 ; offsets de sections non fiables.

## Vérification et livraison

- TMP isolé obligatoire ; GOMAXPROCS=2, UV_THREADPOOL_SIZE=2, validations sérialisées à un worker.
- Installation frozen, audit JSON avant/après avec identifiants et chemins, audit au seuil moderate sans exception.
- Tests complets, check, smoke exports, build et recette native existante ; comparer les sources à la base.
- Revue indépendante du manifeste/lockfile et de la traçabilité avant commit.
- Commit correctif `fix dependency audit vulnerabilities`, documentation séparée si utile ; PR empilée sur #57. Vérifier remote/head exact et lancer seulement Quality si la base empilée ne déclenche pas automatiquement la CI.
- Rollback : fermer la PR avant merge ; après GO merge explicite, branche et PR de revert du correctif. Ne pas supprimer les données utilisateur ni force-push.

Critère de sortie : audit sans alertes connues retournées par le registre, installation reproductible et contrôles métier verts. Audit zéro ne signifie pas absence universelle de vulnérabilités ; aucune déclaration de CI verte sans lecture du run de l'exact head publié.

## Résultats obtenus avant revue indépendante

- Patch de #47 appliqué après git apply --check ; rafraîchissement ciblé de quatre transitives. Versions retenues compatibles : Vitest4.1.11, devalue5.9.4, PostCSS8.5.29, nanoid3.3.20, source-map-js1.2.2. Les utilitaires transitifs Vitest es-module-lexer, tinyexec, tinyrainbow sont également actualisés ; les documenter plutôt que cacher leur diff.
- Seuls package.json/pnpm-lock.yaml changent pour le correctif : aucune source, CI ou config de tests. Packages inchangés : métadonnées/resolutions identiques ; nouveaux packages : SRIsha512 présent. Pas de source de tarball nouvelle ni override.
- Installation frozen, audit au seuil moderate zéro, JSON après zéro avis connus ; 830 tests/55 fichiers, check0/0, smoke3 et buildOK (warning Three.js déjà connu). Commandes réellement exécutées, aucun seuil abaissé.
- Chromium13 étapes réussi : commands/native-app-1791631667132/report.json hors dépôt, observation ponctuelle non archivée dans le dépôt. Essais1791631552457 et1791631607029 échoués après reload Vite de réoptimisation (fflate/OBJExporter puis imagetracer, confirmé par server.log) ; conservés et non comptés comme succès. Le parcours réussi est un nouveau run intégral, pas un résultat reconstruit.
- Extraction web indisponible dans ce backend ; avis primaires consultés directement via gh api /advisories/GHSA-… et métadonnées du registre via pnpm view. Aucun exploit applicatif démontré.
- Revue indépendante **APPROVED**, snapshot4 fichiers avant/après `7ed4a10230a80ece8e9a6aa7ef2ee9bc1f9fb8ac2fea8182662267872e4fd931`. Commit technique exact `0dfc24f6c6c9cdb1138536bf5591d7342db1dc84`, octets identiques au snapshot validé. Publication vérifiée : **PR #58 brouillon** empilée sur #57.
- **Quality38049190650 réussi sur head exact0dfc24f**, toutes les étapes install/audit/check/test/build vertes. Dispatch explicite de quality.yml seulement ; aucun Deploy. GitGuardian pass, mais gh pr checks n'affiche pas le Quality dispatché : lire le run exact, ne pas supposer une protection de branche satisfaite.
- Checkpoint documentaire après publication : AGENT_CONTEXT et ce plan seuls actualisés ; sources, manifeste et lockfile restent identiques au commit technique. Toute CI sur un head documentaire ultérieur doit être vérifiée séparément.
- PR #57/head317ea35 conserve son run38044892881 en échec ; intégrer #58 dans la branche de #57 uniquement sur GO merge explicite, puis relancer sa CI. Aucune fusion, production ni fermeture des PR43/47. Reprise produit : lot2 recovery/autosauvegarde sur une branche séparée, sans altérer ce correctif.
