# Analyse fonctionnelle — Cookiecad Designer V6

> Date d’observation : 2026-07-23
> Cible : <https://app.cookiecad.com/>
> Objet : benchmark fonctionnel pour `cookie-cutter-designer`, sans reproduction de code, d’identité visuelle ou de contenu propriétaire.

> Le produit cible est une application personnelle : les tarifs, comptes et marqueurs Premium de Cookiecad servent uniquement à identifier les fonctionnalités concurrentes. Aucun abonnement, paiement, paywall, backend ou stockage cloud n’est à reproduire.

## 1. Méthode et limites

Cette analyse combine :

- l’exploration sans compte de Cookiecad Designer V6 ;
- les exemples publics préconfigurés ;
- les notes de version V6 ;
- la documentation publique officielle ;
- la page publique Cookiecad Premium ;
- l’inspection des réglages sérialisés dans les liens de partage publics.

Les statuts utilisés sont :

- **observé** : présent dans l’interface publique ;
- **confirmé** : décrit par une source officielle ;
- **Premium** : marqué par l’étoile Premium ou explicitement listé sur la page Premium ;
- **inconnu** : le produit existe, mais son niveau d’offre actuel n’est pas confirmé.

Aucun compte, abonnement, essai, paiement ou contournement de contrôle d’accès n’a été utilisé. Les calculs géométriques internes et la qualité réelle des fichiers générés n’ont pas été audités.

## 2. Sources officielles

| Source | URL |
|---|---|
| Designer V6 | <https://app.cookiecad.com/> |
| Notes de version V6 | <https://app.cookiecad.com/whats-new> |
| Offre Premium | <https://app.cookiecad.com/premium> |
| Documentation Designer | <https://docs.cookiecad.com/cookiecad-designer/> |
| Vue d’ensemble | <https://docs.cookiecad.com/cookiecad-designer/features-overview/> |
| Anciennes notes de version | <https://docs.cookiecad.com/cookiecad-designer/whats-new/> |

## 3. Positionnement produit

Cookiecad transforme une image ou un dessin en outil imprimable en 3D. Le produit vise les pâtissiers, créateurs en pâte polymère, céramistes et utilisateurs d’imprimantes 3D ne maîtrisant pas la CAO.

La promesse centrale est un flux court :

1. importer ou choisir une forme ;
2. choisir le type d’objet ;
3. modifier des paramètres métier ;
4. inspecter le résultat en 3D ;
5. télécharger, partager ou conserver le projet.

## 4. Navigation et structure

Navigation principale observée :

- **Designer** ;
- **My Library** ;
- **Docs** ;
- **Shop Filament** ;
- **Community** ;
- thème système/clair/sombre ;
- connexion ;
- indication de version V6.

Dans le Designer :

- bandeau Premium ;
- sélecteur « Thing to make » ;
- recherche de réglages ;
- profil de paramètres ;
- réglages regroupés en accordéons ;
- onglets **3D Preview** et **Edit Image** ;
- téléchargement et options d’export ;
- nouveau fichier, partage, édition CADit et ajout à la bibliothèque.

## 5. Entrées et préparation de l’image

### 5.1 Sources acceptées

- PNG ;
- JPG/JPEG ;
- WebP ;
- SVG ;
- glisser-déposer ;
- sélection de fichier ;
- collage depuis le presse-papiers avec `Ctrl/Cmd+V` ;
- formes et designs d’exemple.

### 5.2 Édition intégrée

V6 annonce un éditeur de croquis CADit intégré :

- édition du dessin dans le Designer ;
- autosauvegarde toutes les deux minutes ;
- restauration de l’original ;
- partage et fork des croquis édités.

### 5.3 Traitement des contours

Trois intentions métier sont distinguées :

- **Imprint** pour conserver les traits et créer des détails ;
- **Edge Trace** pour tracer les contours d’une région pleine ;
- **Outline** pour ne conserver que l’enveloppe extérieure.

V6 ajoute notamment :

- affichage de plusieurs formes détectées ;
- marge réglable pour `Outline All` ;
- contour circulaire plus ajusté ;
- option « inner edges only » ;
- erreurs d’import explicites et possibilité de réessayer.

## 6. Catalogue des objets

| Type | Statut public observé | Finalité |
|---|---|---|
| Cutter | Free | Découpe d’un contour |
| Imprint Cutter | Free | Découpe et impression de détails |
| Sandwich Cutter | Premium | Découpe et scellement de sandwich |
| Cake Pop Mold | Premium | Moule, poussoir et plateau éventuel |
| Cake Topper | Premium | Décoration avec image, texte et pics |
| Stencil | Premium | Plaque ajourée répétée |
| Cutter + Stamp | Premium | Paire cutter/tampon séparée et ajustée |
| Stamp | Premium | Tampon autonome |
| Cutter Set | Premium | Série proportionnelle d’un même dessin |
| Practice Cookie | Premium | Support d’entraînement décoratif |
| Multi Cutter | Premium | Répétition en lignes et colonnes |

Cette classification reflète les étoiles visibles dans le sélecteur V6 sans compte. La page Premium publique, plus ancienne sur certains points, ne décrit pas nécessairement tout le catalogue V6.

## 7. Réglages communs

### 7.1 Taille

- unité globale : mm ou pouces ;
- taille finale ;
- dimension pilote : largeur, hauteur ou côté le plus long ;
- taille utilisateur sérialisée dans le lien de partage.

### 7.2 Lame

- profondeur de lame ;
- épaisseur ;
- deuxième lame extérieure de support ;
- profondeur et épaisseur de la deuxième lame ;
- lame symétrique centrée sur le tracé ;
- pointe affinée avec largeur et hauteur de chanfrein ;
- bord supérieur arrondi ;
- lame Fondant avec taper intérieur ;
- largeur du taper Fondant.

### 7.3 Base et poignée

- hauteur et largeur de base ;
- poignée rectangulaire ou ronde ;
- poignée symétrique ;
- barres centrales multiples ;
- angle, position et largeur des barres ;
- option de barre pleine.

### 7.4 Imprint et Stamp

- profondeur par rapport à la lame ;
- largeur de base d’imprint ;
- courbe plate, arrondie ou chanfreinée ;
- cible de la courbe : trous, régions pleines ou les deux ;
- amplitude et inset de la courbe ;
- inversion emboss/deboss ;
- suppression du contour extérieur ;
- contours intérieurs seulement ;
- miroir ;
- tolérance entre cutter et tampon ;
- épaisseur du dos et hauteur du relief.

### 7.5 Texte et plaque nominative

Texte de paroi :

- police ;
- contenu ;
- taille et interligne ;
- extrusion ;
- position ;
- ajout au tampon.

Plaque nominative :

- texte et police ;
- backing rectangulaire ou offset suivant le texte ;
- padding horizontal et vertical ;
- épaisseur et chevauchement ;
- hauteur du texte ;
- position ;
- destination cutter, tampon ou les deux.

### 7.6 Apparence et expérimental

- matériaux d’aperçu ;
- lignes de maillage ;
- miroir ;
- résolution ;
- simplification ;
- offset intérieur/extérieur ;
- épaisseur minimale forcée ;
- options de triangulation et de diagnostic internes.

## 8. Fonctions spécialisées

### 8.1 Cutter + Stamp et Stamp Grip

- paire de solides séparés ;
- jeu d’assemblage configurable ;
- poignée séparée ;
- connexion filetée ou logement collé/biseauté ;
- socket ajouté au dos du tampon ;
- placement automatique ou manuel ;
- position X/Y ;
- profondeur et diamètre du socket ;
- clearance ;
- hauteur, diamètre et arrondi inférieur de la poignée ;
- résolution circulaire.

### 8.2 Multi Cutter et Cutter Set

Multi Cutter :

- lignes ;
- colonnes ;
- espacement ;
- répétition du même outil.

Cutter Set :

- plusieurs tailles proportionnelles issues du même dessin ;
- export ou téléchargement d’un ensemble cohérent.

### 8.3 Stencil

- taille du motif ;
- grille rectangulaire ou diagonale ;
- lignes et colonnes ;
- espacement et marge ;
- taille par grille ou dimensions extérieures ;
- épaisseur du support ;
- détails intérieurs optionnels ;
- barres de connexion des îlots ;
- optimisation des régions répétées.

### 8.4 Sandwich Cutter

- forme, taille, espacement et profondeur des dents ;
- largeur de scellement ;
- jeu entre tampon de bord et cutter ;
- dents arrondies et rayon ;
- offset extérieur du tampon ;
- tampon complémentaire optionnel.

### 8.5 Cake Pop Mold

- moule rempli avec trou de poussoir ;
- poussoir monobloc ou deux pièces ;
- face outline ou imprint ;
- plaque arrière ;
- clearance du poussoir ;
- clearance du passage de bâton ;
- plateau optionnel ;
- rotation, marge, épaisseur, profondeur d’encastrement et clearance du plateau ;
- rangement des pièces pour l’impression.

### 8.6 Cake Topper

- image seule, texte seul ou combinaison ;
- relief d’image ;
- backing connectant les détails fins ;
- offset du backing ;
- hauteurs de base, texte et image ;
- message multi-ligne ;
- police, taille, interligne et position ;
- pic : longueur, largeur et position ;
- plaque nominative et courbes de profondeur réutilisées.

## 9. Aperçu, partage et exports

### 9.1 Aperçu

- aperçu 3D orbital ;
- rotation au-delà des vues haut/bas ;
- zoom automatique sur toutes les pièces ;
- rendu à la demande pour limiter l’énergie ;
- fallback WebGL1 ;
- matériau d’aperçu type slicer ;
- affichage optionnel des lignes.

### 9.2 Partage et persistance

- URL contenant les réglages ;
- liens courts pour les utilisateurs connectés ;
- partage de design ;
- bibliothèque privée ;
- profils de réglages ;
- stockage des images et STL ;
- organisation des favoris.

### 9.3 Exports

- STL ;
- 3MF ;
- PDF du contour ;
- téléchargement STL soumis à la création d’un compte gratuit selon la documentation ;
- ajout à My Library soumis à connexion.

## 10. Offre Premium Cookiecad — benchmark hors périmètre produit

### 10.1 Tarifs observés

| Offre | Prix | Essai affiché |
|---|---:|---|
| Mensuel | 14,99 USD/mois | 3 semaines |
| Annuel | 150 USD/an, soit 12,50 USD/mois | 3 semaines |
| Essai sans paiement | gratuit | 2 semaines, sans carte |

La coexistence de deux durées d’essai sur la même page doit être considérée comme une ambiguïté de contenu, pas comme une règle métier à reproduire.

### 10.2 Périmètre explicitement listé

- Cutter + Stamp séparés ;
- bibliothèque privée ;
- profils de réglages ;
- réglages expérimentaux ;
- épaississement des détails intérieurs ;
- barre centrale pleine ;
- inversion emboss/deboss ;
- direction des offsets ;
- résolution ;
- Cutter Sets ;
- stockage des STL.

## 11. Forces UX observées

- vocabulaire métier plutôt que vocabulaire CAO ;
- nombreux exemples prêts à modifier ;
- réglages progressifs en accordéons ;
- recherche transversale ;
- changement de type sans quitter le flux ;
- partage par lien ;
- paramètres sérialisés ;
- séparation nette entre aperçu et édition 2D ;
- presets de profil ;
- découverte claire de Premium.

## 12. Faiblesses et risques observés

- densité importante de réglages ;
- certains contrôles avancés sont difficiles à comprendre sans aide ;
- statut Free/Premium incohérent entre la page Premium ancienne et le catalogue V6 ;
- deux promesses d’essai différentes sur la même page ;
- une URL complète de partage peut devenir très longue ;
- la présence d’un paramètre de triangulation « debug » expose une complexité interne ;
- la documentation publique ne couvre pas toutes les nouveautés V6 ;
- la qualité topologique et l’orientation fabrication des exports ne sont pas garanties publiquement avec le niveau de détail du dépôt local.

## 13. Leçons pour notre produit personnel

À reprendre comme principes :

- catalogue métier explicite ;
- exemples complets ;
- profils ;
- recherche de réglages ;
- édition 2D intégrée ;
- partage de projets ;
- modes spécialisés avec paramètres dédiés.

À différencier :

- validation géométrique visible et bloquante ;
- dimensions finales mesurées ;
- orientation fabrication garantie ;
- diagnostics d’épaisseur ;
- fonctionnement local-first sans compte obligatoire ;
- toutes les fonctionnalités disponibles localement, sans niveaux Free/Premium ;
- projets, presets et bibliothèque stockés dans le navigateur et exportables en fichiers ;
- formats ouverts et projets exportables ;
- aucune fonctionnalité fictive de slicing ou G-code.

## 14. Conclusion

Cookiecad V6 constitue un benchmark fonctionnel large, surtout pour les objets spécialisés et l’expérience guidée. `cookie-cutter-designer` possède déjà une meilleure fondation de validation print-ready, mais doit remplacer son modèle binaire Cutter/Stamp par un catalogue extensible de recettes métier et intégrer ses composants avancés dans des flux cohérents.

## 15. Idées produit complémentaires non attribuées à Cookiecad

Les éléments suivants proviennent d’une proposition externe transmise par le propriétaire du projet. Ils enrichissent l’idéation, mais n’ont pas été observés ni confirmés comme fonctionnalités de Cookiecad V6 :

- outil plume avec points d’angle et poignées de Bézier ;
- primitives rectangle, ellipse, polygone régulier et étoile ;
- grille configurable et aimantation à la grille, aux points et aux axes ;
- transformations numériques : translation, rotation, échelle et miroir ;
- calques 2D avec visibilité, verrouillage et ordre ;
- texte converti en chemins, avec conservation d’une source éditable ;
- export STL séparé par rôle pour les recettes multi-pièces ;
- export SVG du contour 2D ;
- capture d’image du viewport ;
- fonctionnement PWA hors ligne ;
- test de performance du canvas sur des documents allant jusqu’à 10 000 points.

Ces idées sont évaluées dans le PRD selon leur valeur pour une application personnelle. Elles ne justifient ni changement de stack, ni backend, ni compte, ni paiement. Les propositions DXF, G-code, supports d’impression, cutters articulés, collaboration temps réel et marketplace restent hors périmètre tant qu’un besoin personnel vérifié ne les justifie pas.
