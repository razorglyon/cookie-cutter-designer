# Validation locale — profils simples de paroi (lot 6)

## État qualifié

Validation du **11 octobre 2026**, sur `feature/simple-wall-profiles`, dans le clone `cookie-cutter-designer`. Base Git : `c98e63855e7263aba2dc7de151b03daad251c24b`, squash de la PR #69. Le snapshot de qualification était **local, non commité et non publié** : ce SHA identifie la base, pas un commit contenant les profils. Rza a ensuite autorisé le **commit local uniquement** le 11 octobre 2026 ; le commit de livraison se relit avec `git log -1` sur cette branche. Aucun accord de publication.

L’ancienne branche `feature/manual-island-bridges` est conservée à `23759cd1dcb1a58ef283e69c0120fa69bc00b3f6`, sans rebase ni suppression. La modification locale préalable de `AGENT_CONTEXT.md` a été conservée intégralement au changement de branche, puis enrichie. Les états historiques de la feuille de route ne remplacent pas ce contexte vérifié.

## Contrat de cette première tranche

| Profil | `wallThickness` | `taperAngle` |
|---|---:|---:|
| Fin | 0,8 mm | 5° |
| Standard | 1 mm | 7° |
| Robuste | 1,5 mm | 10° |

- Le catalogue immuable est dans `src/lib/domain/wallProfiles.ts`.
- `CutterSection.svelte` applique les deux valeurs ensemble via `updateParams`, le port existant vers la session. Le document courant reste propriétaire des paramètres ; les stores legacy ne deviennent pas une seconde référence persistante.
- Le choix actif est dérivé de l’égalité exacte de l’épaisseur et de l’angle. Hors catalogue, le statut affiche **Personnalisé**. Un clic sur le profil déjà actif ne crée pas de modification.
- Les valeurs restent ajustables. Les libellés et valeurs accessibles des contrôles montrent les valeurs physiques actuelles, sans arrondir les décimales d’un ancien projet.
- Taille, hauteurs, poignée, identité, source, sketch et ponts ne sont pas remplacés par le profil. Le choix constitue une seule étape Undo/Redo.
- Aucun identifiant de profil sauvegardé, nouveau schéma, migration ou nouvelle géométrie socle/paroi/tranchant. Les projets V1 restent V1 ; les projets avec ponts restent V2.
- Ce sont des réglages indicatifs, **sans certification de solidité ni de sécurité alimentaire**. Les gardes géométriques existantes continuent de s’appliquer.

## TDD et contrôles automatiques

Les tests des profils ont été exécutés en échec avant l’implémentation, puis au vert. Une régression dédiée reproduit l’arrondi trompeur d’une valeur personnalisée (`0.85 mm`), avant sa correction. Le runner Chromium a également reproduit la fragmentation du mot `Standard` ; la correction CSS est limitée aux libellés des nouveaux boutons. Après correction, chaque nom tient sur une ligne dans les états capturés.

Les tests UI/session couvrent application atomique, absence d’application au montage, état dérivé, personnalisation, absence du groupe en mode Stamp, notice, fidélité des valeurs et round-trip V1/V2. Les tests App utilisent réellement session, historique, recette et sérialisation STL ; seul le viewer GPU est simulé et le stockage y est en mémoire. **Ce stockage simulé n’est pas présenté comme une preuve IndexedDB** : la persistance est vérifiée séparément dans Chromium.

Après le dernier changement applicatif :

| Contrôle | Résultat |
|---|---|
| Profils et voisins : paramètres, App, historique, export, recettes, codec, session, ponts | 191 tests réussis, 11 fichiers |
| `pnpm check` | 0 erreur, 0 avertissement |
| Suite complète | 1 096 tests réussis, 79 fichiers |
| Smoke export | 3 tests réussis |
| `pnpm build` | Réussi |
| Budget JS entrée | 175 103 octets / 204 800 autorisés (200 KiB) |
| Plus gros autre chunk, `three-vendor` | 561 528 octets / 614 400 autorisés (600 KiB) |
| Inventaire du budget | 35 fichiers JS, aucune violation |
| `pnpm audit --audit-level=moderate` | Aucune vulnérabilité connue signalée |

Les budgets portent sur les fichiers JS UTF-8 finaux non compressés, après la transformation preload de Vite. Ils ne prouvent pas une baisse du transfert total.

### Commandes réellement exécutées

À la racine Git, avec le TMP isolé du dépôt et un parallélisme limité :

```sh
REPO_TMP=$(python3 /workspace/.hermes-tools/workspace-tmp.py --repo "$PWD" --purpose commands --path-only) || exit 1
test -n "$REPO_TMP" || exit 1
export TMPDIR="$REPO_TMP" GOMAXPROCS=2 UV_THREADPOOL_SIZE=2

pnpm exec vitest run src/__tests__/App.wall-profiles.test.ts src/__tests__/App.history-session.test.ts src/__tests__/App.export-validity.test.ts src/lib/components/parameters src/lib/generation/recipes src/lib/projects/__tests__/bridgesRoundTrip.test.ts src/lib/projects/__tests__/projectCodec.test.ts src/lib/projects/__tests__/projectSessionIntegration.test.ts src/lib/sketch/__tests__/bridgeCommands.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm check
pnpm test:run --pool=threads --maxWorkers=1 --fileParallelism=false
pnpm test:smoke --pool=threads --fileParallelism=false
pnpm build
pnpm audit --audit-level=moderate
git diff --check
```

Smoke et benchmark ont été ajustés pour respecter `TMPDIR` avec `tmpdir()` ; leurs artefacts restent dans le TMP isolé, pas dans un chemin `/tmp` codé en dur. Aucun changement de dépendances applicatives.

## Parcours Chromium réel

Le runner sert deux builds statiques en localhost : baseline archivée depuis `origin/main` vérifié puis reconstruite dans le TMP, et `dist` contenant le travail local. Il compare en HTTP les **54 fichiers HTML/assets de chacun** à leurs octets locaux. Les captures ne sont donc pas attribuées au seul SHA de base : le rapport enregistre aussi branche, statut Git et empreintes de toutes les sources `src/` avant/après, strictement identiques pendant la recette.

Parcours effectivement exercés :

1. Un V1 créé/exporté par la baseline est ouvert dans la nouvelle version sans édition : JSON et STL strictement inchangés.
2. **Fin → Standard → Robuste**, sur V1 puis sur V2 avec un pont créé dans l’éditeur réel : valeurs exportées exactes, source/sketch/ponts préservés et trois STL distincts.
3. Undo/Redo : JSON restauré exactement, une étape par sélection.
4. Personnalisation au clavier : épaisseur 1,4 mm et hauteur ajustée ; statut Personnalisé.
5. Sauvegarde IndexedDB, rechargement complet, réouverture et nouveaux exports : JSON et STL strictement identiques aux versions enregistrées, en V1 et V2.
6. V2 mobile : sélection tactile de Standard, sauvegarde/rechargement/réouverture, pont inchangé et JSON/STL identiques.
7. Activation clavier d’un profil avec focus visible (outline 3 px), thèmes clair/sombre, desktop 1365×900 et mobile 375×812 ; document sans débordement horizontal. Cibles des boutons mesurées à 97×61 px sur le parcours mobile.
8. Mesure des sommets des STL binaires : dimensions conformes au badge de l’aperçu, dans sa précision d’affichage de 0,1 mm ; hauteur et position Z vérifiées. Ce contrôle ne remplace pas une métrologie physique.

Aucune erreur console ni requête échouée dans le rapport final. Sources inchangées pendant la recette. Les serveurs des parcours ont été arrêtés et leurs ports contrôlés fermés.

## Preuves et essais intermédiaires

Les preuves brutes restent hors dépôt sous `/workspace/reports` :

- Gates finales : `wall-profiles-{targeted,check,tests,smoke,build}-post-ui.log`.
- Budgets finaux : `wall-profiles-budgets-post-ui.json`.
- Audit final : `wall-profiles-audit-post-ui.log`.
- Parcours complet : `wall-profiles-browser-1791725360750/report.json`, JSON, STL et captures associés ; runner `wall-profiles-smoke.mjs`.
- Libellés après correction : `wall-profiles-labels-1791725349336/report.json` ; runner `wall-profiles-labels.mjs`.
- Comparatif visible final : `wall-profiles-framing-1791726291148/report.json`, avant contrôle de paroi et après Robuste sélectionné, desktop/mobile ; runner `wall-profiles-framing.mjs`. Ce rapport vérifie la position dans le viewport et l’absence d’occultation aux bords supérieur/inférieur avec `elementFromPoint`, ainsi que les empreintes de build et l’absence de mutation.

Les premiers cadrages du panneau entier ou alignés en début de panneau étaient partiellement coupés/recouverts par la barre Undo/Redo. Même lorsqu’un premier rapport de cadrage indiquait PASS sur ses seules dimensions, l’inspection visuelle montrait cette occultation : ces images ne sont **pas** retenues comme comparatif final. Le cadrage centré a été revérifié et inspecté ; aucun CSS applicatif n’a été modifié pour fabriquer la preuve.

La chaîne de revalidation post-correction a dépassé la limite de l’appel terminal (420 s). Ce statut d’outil n’est pas une réussite de commande. Les journaux ont ensuite été relus individuellement, les processus inventoriés, et le runner navigateur a terminé avec son rapport PASS et ses ports fermés. Aucun résultat n’a été déduit du timeout seul.

Deux premiers essais du test App ont échoué (délai, puis comparaison d’identité mémoire). Le délai du test a été borné à 30 s ; l’orchestrateur valide/clone légitimement le document, donc le contrat testé est l’égalité complète du contenu, pas la même instance mémoire. Les succès ci-dessus sont ceux des exécutions finales après ces corrections.

## Contrôle du diff final

Dernier fetch de qualification, avant commit : `HEAD == origin/main`, base inchangée ; ancienne branche du lot 5 inchangée, index Git vide et aucune PR ouverte. Revue locale contre cette base, y compris les nouveaux fichiers : conformité au périmètre et qualité examinées, aucun constat bloquant retenu. Les **217 empreintes des fichiers `src/`** sont identiques à celles du rapport navigateur final ; les dernières modifications sont documentaires uniquement. Les 35 budgets JS ont été recalculés depuis `dist`, les liens documentaires locaux vérifiés et le whitespace contrôlé aussi dans les fichiers non suivis. Le mode strict TypeScript est confirmé après résolution de l’héritage `@tsconfig/svelte`, pas par lecture du JSON brut.

Contrôle reproductible hors dépôt : `/workspace/reports/wall-profiles-final-review.py` ; sortie finale `/workspace/reports/wall-profiles-final-review.log`. À cette étape de qualification, neuf fichiers modifiés/nouveaux étaient locaux, aucun fichier indexé. Le GO limité au commit local est enregistré dans ce dossier de validation et dans `AGENT_CONTEXT.md` avant indexation.

Précommit du 11 octobre 2026 : `pnpm check` relancé avec 0 erreur/0 avertissement ; `pnpm exec vitest run src/lib/components/parameters/__tests__/WallProfiles.test.ts src/__tests__/App.wall-profiles.test.ts --pool=threads --maxWorkers=1 --fileParallelism=false` : **13/13 tests réussis**, 2 fichiers. Même TMP isolé ; logs `wall-profiles-precommit-{check,tests}.log`. La suite complète et le navigateur n’ont pas été relancés à cette étape : leurs preuves restent liées aux mêmes 217 empreintes applicatives, vérifiées avant commit.

## Limites et prochaine décision

- Chromium uniquement, toucher émulé : pas d’essai sur téléphone physique, Safari, Firefox ou lecteur d’écran.
- Pas de slicer, imprimante, mesure de rigidité, essai de matériau ou qualification alimentaire.
- Les nouveaux parcours profils/V2 portent sur un pont simple. Les chaînes et états intermédiaires restent couverts par les tests historiques relancés, pas par un nouveau parcours navigateur profils-chaîne.
- Les profils ne garantissent pas qu’un SVG arbitraire génère un modèle valide ; un refus des gardes existantes reste possible.
- Aucun test de performance sur très gros SVG ni test de zoom/texte à 200 % dans ce lot.
- Commit local de cette première tranche autorisé le 11 octobre 2026. Aucun push, PR, merge, CI distante du lot 6 ou déploiement effectué ni autorisé. La version publiée n’a pas changé.

Avant toute publication : accord explicite de Rza et nouvelle vérification du snapshot à publier. Socle/paroi/tranchant indépendants et multi-cutter restent hors périmètre.
