# Validation du rendu et du zoom du viewer

## Périmètre qualifié

Branche `fix/viewer-shading-zoom`, issue de `origin/main` vérifié au commit `61c14edc8e070de10833248a135c215e2cfba139`. La qualification ci-dessous précède la publication ; ses empreintes de sources ont été revérifiées avant commit. Le statut de fusion et de déploiement est à relire dans GitHub, pas à déduire de ce rapport. La preview Cloudflare existante n’a pas été remplacée par la qualification locale.

La géométrie de fabrication et les formats de projet sont inchangés. Le viewer construit une copie indépendante des buffers, avec normales lissées sur les courbes et séparées aux arêtes franches. Les positions et l’ordre des triangles restent identiques. Les matériaux métier sont partagés en lecture seule ; la carte d’épaisseur possède ses propres clones et lit les mesures de la géométrie source. La sélection conserve le lien avec la pièce source pour les anciens viewers éditables.

Le zoom dispose de limites relatives à la taille, d’un plan de clipping rapproché adapté, d’un zoom vers le pointeur et de boutons +/− nommés, accessibles au clavier et d’au moins 44 px. Le bouton Ajuster la vue rétablit le cadrage.

## Preuves réellement obtenues

Rapport complet : `/workspace/reports/viewer-shading-zoom-v69081tb/`.

| Vérification | Résultat |
|---|---|
| TDD sur le viewer réel monté avec renderer de test | 5 assertions RED avant correction ; GREEN après correction |
| Tests ciblés : rendu, ressources, viewport, heatmap, gardes d’export | 31/31 |
| Suite complète | 1 249/1 249, 95 fichiers |
| Typecheck Svelte/TypeScript | 0 erreur, 0 avertissement |
| Smoke exports | 4/4 |
| Build de production et budgets | réussis |
| Corpus cercle/ellipse/œuf | 24/24 contrôles ; 24 STL identiques octet pour octet à la référence pré-correction |
| Chromium réel desktop | cercle et œuf × emporte-pièce/Relief/Creux à 75 mm ; exports avant/après zoom et heatmap identiques |
| Chromium mobile simulé, 390×844 | cercle × emporte-pièce/Relief/Creux ; boutons, clavier, heatmap et exports identiques |
| Thème sombre mobile | bascule par le bouton réel ; classe `dark-mode` et fond de scène `111827` contrôlés |
| Zoom natif desktop | rapprochement au-delà de l’ancienne limite, cible réellement observée via les appels des contrôles |
| Ressources | clones libérés sans disposer les sources ; serveur et navigateur de qualification arrêtés |

Les exports du corpus portent sur tampons 10/75/200 mm et emporte-pièces 75/200 mm, sans poignée, avec plateau de qualification suffisamment grand. Ils ne valident pas de nouveaux paramètres ou contours hors de ce corpus.

### Traçabilité et tentatives

`runtime-inputs.json` rattache les captures au HEAD de base, aux sources locales non commitées et à un build isolé dont chaque fichier est hashé. Les fichiers servis utilisés par Chromium ont été comparés à ce build, et les empreintes des sources ont été contrôlées après les gates. Ne pas présenter ces captures comme celles du commit publié.

Le premier runner a utilisé trop peu d’événements de molette pour atteindre la distance attendue. Le second a terminé les six cas desktop, mais échoué plus tard sur la sonde mobile : elle repliait le panneau d’export pendant son ouverture automatique. Les preuves de ces tentatives sont conservées. Les six cas desktop ont été relus individuellement avec leurs hashes ; la recette mobile séparée, corrigée pour attendre l’état ARIA du panneau, s’est terminée avec succès. Un premier essai de thème utilisait la mauvaise classe et n’a pas été retenu : le thème sombre a ensuite été vérifié par le contrôle réel. Aucune modification produit n’a servi à masquer ces erreurs de sonde.

## Limites

- Pas de nouvelle impression physique : l’absence d’impact de cette correction sur la fabrication est prouvée par l’identité des fichiers STL, pas par un essai matériel.
- Pas d’iPhone/Safari réel, de nouvelle qualification Firefox/WebKit ni de lecteur d’écran. Le mobile et les cibles tactiles sont simulés en Chromium.
- Les courbes restent les mêmes approximations polygonales : aucune résolution de contour augmentée ni simplification cachée. Le lissage concerne l’éclairage seulement.
- L’image originale de Rza était inaccessible dans le sandbox ; la correction traite le défaut reproduit, sans prétendre identifier son pixel exact.

## Reprise

Préserver `AGENT_CONTEXT.md`, maintenu localement et exclu du commit. Rza a autorisé le commit et la fusion de ce lot ; la publication passe par une PR et les contrôles du HEAD exact. Toute actualisation distincte de la preview Cloudflare exige le GO applicable. Message : `fix viewer lighting and detail zoom without changing exports`.
