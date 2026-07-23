# Matrice d’écarts — Cookiecad V6 et Cookie Cutter Designer

> Référence produit : `COOKIE_CUTTER_DESIGNER_PRD.md`
> Benchmark : `COOKIECAD_V6_ANALYSIS.md`

## Légende

- **Solide** : implémenté, intégré et couvert par tests significatifs.
- **Partiel** : code ou UI présent, mais flux incomplet ou garanties insuffisantes.
- **Absent** : aucune implémentation produit vérifiée.
- **P0** : socle nécessaire à la refactorisation.
- **P1** : parité métier prioritaire.
- **P2** : extension après stabilisation.
- **P3** : option commerciale ou exploratoire.

## 1. Socle et qualité d’impression

| Capacité | Cookiecad V6 | Dépôt actuel | État | Priorité | Décision |
|---|---|---|---|---|---|
| Dimensions physiques | Oui | Oui, mesurées en mm | Solide | P0 | Conserver |
| Largeur/hauteur/côté long | Oui | Oui | Solide | P0 | Conserver |
| Validation topologique | Non documentée en détail | Arêtes, composants, orientation, volume | Solide | P0 | Avantage produit |
| Orientation slicer Z-up | Non documentée | Oui | Solide | P0 | Conserver |
| Pose sur Z=0 | Non documentée | Oui | Solide | P0 | Conserver |
| Heatmap d’épaisseur | Non observée | Oui | Solide | P1 | Conserver |
| Auto-intersections exhaustives | Non documenté | Non | Absent | P2 | Étudier, ne pas promettre |
| G-code | Non | Non | Solide | P0 | Rester hors périmètre |

## 2. Import et préparation

| Capacité | Cookiecad V6 | Dépôt actuel | État | Priorité | Cible |
|---|---|---|---|---|---|
| SVG | Oui | Oui | Solide | P0 | Conserver |
| PNG/JPG | Oui | Oui, Worker | Solide | P0 | Conserver |
| WebP | Oui | Non documenté/accepté | Absent | P1 | Ajouter au décodage |
| Coller presse-papiers | Oui | Non | Absent | P1 | Ajouter |
| Drag & drop | Oui | Oui | Solide | P0 | Conserver |
| Erreurs structurées | Oui | Oui | Solide | P0 | Uniformiser |
| Annulation traitement | Oui/non documenté | Oui | Solide | P0 | Conserver |
| Rejet résultats obsolètes | Non documenté | Oui | Solide | P0 | Conserver |
| Éditeur 2D intégré | Oui | Composants Path/Bezier présents | Partiel | P1 | Intégrer sur un document 2D commun |
| Restore original | Oui | Historique partiel | Partiel | P1 | Snapshot source immuable |
| Autosauvegarde | Oui | Non | Absent | P2 | Local-first |

## 3. Modes métier

| Mode | Cookiecad V6 | Dépôt actuel | État | Priorité |
|---|---|---|---|---|
| Cutter | Oui | Oui | Solide | P0 |
| Stamp | Premium | Oui | Solide côté géométrie | P0 |
| Imprint Cutter | Oui | Pas de recette dédiée | Partiel | P1 |
| Cutter + Stamp | Premium | Générateurs séparés, pas de paire | Partiel | P1 |
| Multi Cutter | Premium | Batch générique | Partiel | P1 |
| Cutter Set | Premium | Non | Absent | P2 |
| Stencil | Premium | Pattern/Layer partiels | Partiel | P1 |
| Sandwich Cutter | Premium | Non | Absent | P2 |
| Cake Topper | Premium | Texte/pattern partiels | Partiel | P2 |
| Cake Pop Mold | Premium | Non | Absent | P3 |
| Practice Cookie | Premium | Non | Absent | P3 |

## 4. Paramètres de Cutter

| Paramètre | Cookiecad | Dépôt | État | Priorité |
|---|---|---|---|---|
| Épaisseur de paroi | Oui | Oui | Solide | P0 |
| Hauteur de coupe | Oui | Oui | Solide | P0 |
| Hauteur totale | Oui | Oui | Solide | P0 |
| Taper | Oui | Oui | Solide | P0 |
| Deuxième lame | Oui | Non | Absent | P1 |
| Pointe biseautée | Oui | Taper global seulement | Partiel | P1 |
| Bord arrondi | Oui | Non | Absent | P2 |
| Lame Fondant | Oui | Non | Absent | P2 |
| Lame symétrique | Oui | Non | Absent | P2 |
| Handle styles | Oui | Oui, plusieurs styles | Solide | P0 |
| Handle symétrique | Oui | Non explicite | Absent | P2 |
| Barres centrales multiples | Oui | Non intégré | Absent | P1 |
| Texte de paroi | Oui | `TextEmbosser` non intégré | Partiel | P2 |
| Name plate | Oui | Non intégrée | Absent | P2 |

## 5. Stamp et Imprint

| Capacité | Cookiecad | Dépôt | État | Priorité |
|---|---|---|---|---|
| Relief + base commune | Oui | Oui | Solide | P0 |
| Îlots connectés | Oui | Oui via base | Solide | P0 |
| Trous conservés | Oui | Oui | Solide | P0 |
| Profondeur | Oui | Oui | Solide | P0 |
| Emboss/deboss | Oui Premium | Pas de distinction produit | Absent | P1 |
| Courbes de profondeur | Oui | Non | Absent | P1 |
| Base d’imprint configurable | Oui | Base Stamp fixe | Partiel | P1 |
| Tolérance Cutter/Stamp | Oui | Non | Absent | P1 |
| Grip séparé | Oui | Non | Absent | P2 |
| Filetage/socket | Oui | Non | Absent | P2 |
| Texte sur Stamp | Oui | Composant partiel | Partiel | P2 |

## 6. Édition et opérations 2D

| Capacité | Dépôt actuel | État | Action |
|---|---|---|---|
| Path editor | Composant existant | Partiel | Brancher au document source |
| Bezier editor | Composant existant | Partiel | Fusionner avec Path editor |
| Outil plume | Non intégré comme flux principal | Partiel | Ajouter segments et Bézier |
| Primitives 2D | ShapeLibrary différente d’un éditeur | Partiel | Rectangle, ellipse, polygone, étoile |
| Grille et snapping | Non vérifiés | Absent | Grille, points, axes et centres |
| Transformations numériques | Non vérifiées | Absent | Rotation, échelle, miroir, translation |
| Calques 2D | Composant existant | Partiel | Visibilité, verrouillage et ordre |
| Boolean operations | Utilitaire/composant existant | Partiel | Définir garanties et tests |
| Pattern generator | Existant | Partiel | Réutiliser pour Stencil/Multi |
| Layer manager | Existant | Partiel | Définir modèle de calques |
| Collision detector | Existant | Partiel | Intégrer aux diagnostics |
| Text embosser | Existant | Partiel | Unifier texte 2D/3D |
| AI image tools | Existant, clé client | Risqué | Isoler derrière capability |

Le problème principal n’est pas l’absence de composants, mais l’absence d’un **document de conception commun** et de recettes métier orchestrant ces composants.

## 7. Aperçu et diagnostics

| Capacité | Cookiecad | Dépôt | État | Priorité |
|---|---|---|---|---|
| Orbite 3D | Oui | Oui | Solide | P0 |
| Fit automatique | Oui | Oui/à vérifier | Partiel | P1 |
| Lignes de maillage | Oui | Oui/à vérifier | Partiel | P2 |
| Matériaux | Oui | Oui | Solide | P2 |
| Dimensions finales | Non relevé | Oui | Solide | P0 |
| Printability | Non détaillé | Oui | Solide | P0 |
| Heatmap | Non relevé | Oui | Solide | P1 |
| Aperçu de couches | Non relevé | Oui | Solide | P2 |
| Suppression d’objet | Non relevé | Oui | Solide | P2 |

## 8. Exports

| Format/fonction | Cookiecad | Dépôt | État | Priorité |
|---|---|---|---|---|
| STL binaire | Oui | Oui validé | Solide | P0 |
| 3MF | Oui | Oui, vrai OPC/ZIP | Solide | P0 |
| OBJ | Non relevé | Oui | Solide | P2 |
| PDF contour | Oui | Non | Absent | P2 |
| Ensemble multi-pièces | Oui | Groupe exportable partiel | Partiel | P1 |
| Taille estimée | Non relevé | Oui | Solide | P2 |
| Export bloqué si invalide | Non documenté | Oui | Solide | P0 |
| Projet source portable | URL/bibliothèque | Non | Absent | P1 |
| SVG contour | Oui chez Cookiecad/P2 cible | Non | Absent | P2 |
| Capture viewport | Idée complémentaire | Non | Absent | P2 |
| PWA hors ligne | Idée complémentaire | Non | Absent | P2 |

## 9. Persistance et transmission locale

| Capacité | Cookiecad | Dépôt | État | Priorité |
|---|---|---|---|---|
| Undo/redo | Éditeur | Oui | Solide/à durcir | P0 |
| Projet local | Bibliothèque cloud | ProjectManager partiel | Partiel | P1 |
| Profils paramètres | Premium | Non | Absent | P1 |
| Fichier projet partageable | URL côté Cookiecad | Non | Absent | P1 |
| Bibliothèque locale | Cloud chez Cookiecad | CloudGallery partielle | Partiel | P1 |
| Export/import projet JSON | Non relevé | Non | Absent | P1 |

Décision : format de projet local versionné, IndexedDB et presets. Les comptes, paiements, abonnements, paywalls, backends métier et bibliothèques cloud sont hors périmètre de cette application personnelle.

## 10. Architecture

| Sujet | État actuel | Écart | Priorité |
|---|---|---|---|
| Modèle de paramètres | Interface monolithique Cutter/Stamp | Ne supporte pas 11 recettes | P0 |
| Orchestration | `App.svelte` très chargé | Responsabilités mélangées | P0 |
| Pipeline | Générateurs séparés | Pas de registry uniforme | P0 |
| Composants avancés | Nombreux, intégration variable | Risque de façade fonctionnelle | P0 |
| Worker raster | Solide | À conserver | P0 |
| Lazy loading | Stamp et panneaux | À généraliser | P0 |
| Tests | 216 tests annoncés | Bon socle | P0 |
| Budgets bundle | En place | À préserver | P0 |

## 11. Roadmap recommandée

### P0 — Refactorisation sans régression

1. Introduire `DesignDocument`, `DesignKind` et `GenerationRecipe`.
2. Extraire l’orchestrateur de `App.svelte`.
3. Adapter Cutter et Stamp à un registry de recettes.
4. Versionner le format de projet.
5. Conserver les validations, exports et budgets actuels.

### P1 — Parité métier utile

1. Imprint Cutter.
2. Cutter + Stamp avec tolérance.
3. Multi Cutter déterministe.
4. Stencil.
5. Éditeur 2D intégré.
6. Presets de paramètres.
7. WebP et collage presse-papiers.
8. Export/import projet.

### P2 — Différenciation avancée

1. Profils de lame.
2. Barres centrales.
3. Texte et name plates.
4. Grips/socket.
5. Sandwich Cutter.
6. Cake Topper.
7. PDF contour et fichier projet transmissible.
8. Grille, snapping, transformations et calques finalisés.
9. PWA hors ligne et capture du viewport.

### P3 — Après validation physique

1. Cake Pop Mold.
2. Practice Cookie.

Il n’existe aucune phase de monétisation ou de cloud dans cette roadmap.

## 12. Critères de sortie de la refactorisation

- Cutter et Stamp produisent les mêmes résultats sur le corpus existant.
- `App.svelte` ne contient plus les détails des algorithmes de génération.
- Chaque mode possède schéma, valeurs par défaut, validation et recette.
- Aucun panneau ne s’affiche sans implémentation réelle et testée.
- STL/OBJ/3MF restent Z-up, posés à zéro et bloqués si invalides.
- Les 216 tests historiques restent verts, complétés par des tests de migration.
- Le bundle initial reste sous 200 KiB et les chunks asynchrones sous 600 KiB.
