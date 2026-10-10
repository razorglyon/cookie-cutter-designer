# PRD — Cookie Cutter Designer nouvelle génération

**Statut :** prêt pour découpage technique
**Audience :** Codex, développeur, reviewer produit
**Produit :** application personnelle et locale de conception d’outils alimentaires imprimables en 3D
**Stack contrainte :** Svelte 5, TypeScript strict, Three.js, Web Workers, pnpm

**Contrainte de périmètre :** aucun compte, abonnement, paiement, paywall, backend métier ou bibliothèque cloud. Les fonctionnalités marquées Premium chez Cookiecad sont étudiées uniquement comme capacités fonctionnelles à proposer localement.

## 1. Résumé exécutif

Cookie Cutter Designer transforme une image, un dessin ou une forme en un ou plusieurs outils imprimables : cutter, tampon, pochoir et variantes spécialisées.

La refactorisation doit faire évoluer l’application d’un modèle monolithique `cutter | stamp` vers un système extensible de **documents**, **recettes métier** et **artefacts validés**, sans perdre les garanties print-ready existantes.

La proposition de valeur différenciante est :

> Concevoir rapidement un outil personnalisé, comprendre ses dimensions et risques, puis exporter un fichier réellement validé pour la fabrication — sans compte obligatoire.

## 2. Problème

Les utilisateurs non experts en CAO veulent passer d’un visuel à un objet imprimable sans :

- redessiner manuellement la géométrie ;
- comprendre les opérations booléennes ;
- gérer les axes et unités ;
- découvrir après impression que le modèle est ouvert ou déconnecté ;
- multiplier les logiciels pour des variantes fréquentes.

Le dépôt actuel possède une géométrie robuste, mais :

- le modèle de paramètres ne représente que Cutter et Stamp ;
- `App.svelte` orchestre trop de responsabilités ;
- de nombreux composants avancés ne forment pas des parcours cohérents ;
- il n’existe pas de format de projet portable et versionné ;
- les modes spécialisés ne peuvent pas être ajoutés proprement.

## 3. Objectifs

### 3.1 Objectifs produit

- Réduire le temps entre import et premier aperçu exploitable à moins de 30 secondes sur un visuel simple.
- Permettre de créer Cutter, Stamp, Imprint Cutter, Cutter + Stamp, Multi Cutter et Stencil dans le socle P1.
- Afficher dimensions finales, validité et avertissements avant export.
- Conserver un fonctionnement local-first sans inscription.
- Permettre de sauvegarder et reprendre un projet.
- Rendre chaque fonction annoncée réellement exécutable et testée.

### 3.2 Objectifs techniques

- Remplacer le `mode` binaire par un registry de recettes extensible.
- Extraire l’orchestration de génération hors de `App.svelte`.
- Conserver TypeScript strict et les validations actuelles.
- Préserver les budgets de bundle.
- Garantir l’annulation, le rejet des résultats obsolètes et la libération mémoire.
- Versionner les documents et migrations.

## 4. Non-objectifs

- Génération de G-code.
- Estimation fiable du temps d’impression.
- Slicer intégré.
- Compte utilisateur, authentification ou gestion de session.
- Abonnement, paiement, essai commercial, paywall ou gestion de droits.
- Backend métier, hébergement de projets ou bibliothèque cloud.
- Marketplace de modèles.
- Copie de l’interface, du contenu ou du code de Cookiecad.
- Réparation silencieuse de géométries ambiguës.
- Promesse d’une détection exhaustive des auto-intersections avant implémentation dédiée.

## 5. Personas

### 5.1 Créateur occasionnel

- possède une imprimante ou utilise un service d’impression ;
- part d’une image ;
- veut un STL rapidement ;
- a besoin de valeurs recommandées et d’erreurs compréhensibles.

### 5.2 Pâtissier ou artisan

- crée régulièrement des séries ;
- utilise dimensions et tolérances précises ;
- veut Cutter + Stamp, Multi Cutter, texte et presets ;
- doit retrouver ses projets.

### 5.3 Maker avancé

- comprend les paramètres géométriques ;
- veut inspecter épaisseur, couches et topologie ;
- exporte STL, OBJ et 3MF ;
- préfère un format de projet portable.

## 6. Principes UX

1. **Progressive disclosure** : les contrôles essentiels sont visibles ; les options avancées sont repliées.
2. **Résultat mesuré** : afficher les dimensions du solide final, pas seulement les paramètres demandés.
3. **Erreurs actionnables** : chaque rejet indique le problème, sa localisation si possible et une correction.
4. **Pas de faux succès** : aucun export si la validation obligatoire échoue.
5. **Local-first** : le navigateur reste utilisable sans compte ni backend.
6. **Annulable** : les opérations longues peuvent être remplacées ou annulées.
7. **Mobile consultable** : édition complexe prioritairement desktop, mais réglages, aperçu et export utilisables sur mobile.

## 7. Modèle de domaine cible

```ts
export type DesignKind =
  | 'cutter'
  | 'imprint-cutter'
  | 'stamp'
  | 'cutter-and-stamp'
  | 'multi-cutter'
  | 'cutter-set'
  | 'stencil'
  | 'sandwich-cutter'
  | 'cake-topper'
  | 'cake-pop-mold'
  | 'practice-cookie';

export interface DesignDocumentV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: DesignKind;
  source: DesignSource;
  sketch: SketchDocument;
  parameters: DesignParametersByKind[DesignKind];
  viewport: ViewportPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedArtifact {
  id: string;
  role: 'primary' | 'cutter' | 'stamp' | 'handle' | 'tray' | 'set-item';
  object: THREE.Object3D;
  dimensionsMm: { width: number; depth: number; height: number };
  validation: GeometryValidationReport;
}
```

Chaque recette doit fournir :

```ts
export interface GenerationRecipe<K extends DesignKind> {
  kind: K;
  defaults(): DesignParametersByKind[K];
  validate(params: DesignParametersByKind[K]): ParameterValidationResult;
  generate(input: GenerationInput<K>, signal: AbortSignal): Promise<GeneratedArtifact[]>;
}
```

## 8. Parcours principal

1. L’utilisateur démarre un projet vide ou un exemple.
2. Il importe une source ou choisit une forme.
3. L’application nettoie/vectorise et présente les contours détectés.
4. L’utilisateur corrige éventuellement le dessin dans l’éditeur 2D.
5. Il choisit une recette métier.
6. Les paramètres par défaut génèrent un premier résultat.
7. Les modifications relancent une génération debounced et annulable.
8. L’application mesure et valide chaque artefact.
9. L’utilisateur inspecte l’aperçu, la heatmap ou les couches.
10. Il sauvegarde le projet ou exporte un ou plusieurs fichiers.

## 9. Exigences fonctionnelles

### FR-001 — Création de projet

- Créer un projet vide, depuis un exemple ou depuis un fichier.
- Demander confirmation avant de remplacer un projet modifié.
- Affecter un identifiant local et un nom éditable.

**Acceptation**

- Étant donné un projet modifié, quand l’utilisateur demande un nouveau projet, alors l’ancien reste intact jusqu’à confirmation.

### FR-002 — Import

Formats P0/P1 : SVG, PNG, JPG/JPEG, WebP.

- sélection, drag & drop et collage ;
- limites explicites de taille, dimensions et pixels ;
- validation MIME et extension ;
- SVG nettoyé sans scripts, événements ni ressources distantes ;
- raster vectorisé dans un Worker ;
- progression, annulation et erreurs structurées.

**Acceptation**

- Un fichier dépassant une limite est refusé avant vectorisation.
- Deux imports rapides ne peuvent pas publier le résultat du premier après le second.
- Un SVG contenant un script ne l’exécute jamais.

### FR-003 — Document de dessin 2D

- contours fermés, trous et îlots ;
- outil plume pour segments droits et courbes de Bézier ;
- primitives rectangle, cercle/ellipse, polygone régulier et étoile ;
- sélection, déplacement, duplication et suppression ;
- édition de points, conversion angle/courbe et poignées de Bézier ;
- transformations : translation, rotation, échelle, miroir et conservation optionnelle des proportions ;
- grille configurable ;
- aimantation activable à la grille, aux points, aux axes et aux centres ;
- calques avec renommage, visibilité, verrouillage et ordre ;
- undo/redo ;
- snapshot original restaurable ;
- opérations booléennes explicites ;
- détection des chemins ouverts et auto-intersections 2D.

**Acceptation**

- Désactiver l’aimantation restitue les coordonnées libres sans modifier les points existants.
- Une transformation numérique et son annulation restaurent exactement les coordonnées précédentes.
- Un calque verrouillé ne peut pas être modifié par un geste ou un raccourci.
- Les primitives sont convertibles en chemins éditables sans changement visuel perceptible.

### FR-004 — Catalogue de recettes

- afficher les recettes disponibles avec description et niveau de maturité ;
- filtrer les réglages selon la recette ;
- empêcher les combinaisons incompatibles ;
- permettre une migration explicite lors du changement de recette.

Aucune recette ne doit apparaître comme stable si elle ne possède pas tests et export vérifié.

### FR-005 — Cutter

Paramètres requis :

- taille cible et dimension pilote ;
- épaisseur de paroi ;
- hauteur de coupe et hauteur totale ;
- taper ;
- poignée activée, style et hauteur ;
- plateau cible.

P1/P2 : seconde lame, pointe biseautée, profil Fondant, symétrie, barres centrales.

Le résultat doit être un solide fermé et connecté, sauf ensemble explicitement multi-pièces.

### FR-006 — Stamp

- relief ;
- base commune obligatoire ;
- poignée optionnelle ;
- trous conservés ;
- îlots connectés par la base ;
- emboss/deboss ;
- hauteur du dos et du relief.

### FR-007 — Imprint Cutter

- cutter extérieur ;
- reliefs intérieurs ;
- profondeur depuis la pointe de lame ;
- profondeur zéro autorisée pour convertir un détail en découpe ;
- courbe plate, chanfreinée ou arrondie ;
- base des reliefs configurable.

### FR-008 — Cutter + Stamp

- produire au minimum deux artefacts : cutter et tampon ;
- dimensions coordonnées ;
- tolérance positive configurable ;
- miroir correct du tampon ;
- validation indépendante de chaque pièce ;
- export séparé et export groupé 3MF.

### FR-009 — Multi Cutter

- lignes, colonnes, espacement X/Y ;
- connexion structurelle configurable ;
- disposition mesurée sur plateau ;
- limites de nombre d’instances et triangles ;
- génération atomique.

### FR-010 — Cutter Set

- liste de tailles ;
- proportions conservées ;
- noms et ordre déterministes ;
- export groupé ;
- refus si une taille devient non imprimable.

### FR-011 — Stencil

- répétition rectangulaire ou diagonale ;
- taille du motif, grille ou dimensions extérieures ;
- marge et épaisseur ;
- conservation optionnelle des détails ;
- ponts de connexion des îlots ;
- résultat monocoque sauf option documentée.

### FR-012 — Sandwich Cutter

- cutter extérieur ;
- bande de scellement ;
- dents de forme, taille, espacement et profondeur réglables ;
- tampon complémentaire optionnel ;
- aucun angle ou détail inférieur aux seuils imprimables configurés.

### FR-013 — Cake Topper

- image, texte ou combinaison ;
- backing connectant les détails ;
- base et relief ;
- un ou plusieurs pics ;
- texte multi-ligne ;
- validation de la jonction backing/pics.

### FR-014 — Cake Pop Mold

P3 uniquement :

- moule, poussoir et plateau éventuel ;
- clearance par pièce ;
- poussoir monobloc ou multi-pièces ;
- packing sans collision ;
- tests physiques requis avant statut stable.

### FR-015 — Texte

- texte de paroi, relief et plaque nominative ;
- polices embarquées ou importées légalement ;
- prévisualisation ;
- source textuelle conservée tant que la conversion n’est pas finalisée ;
- conversion déterministe en chemins pour la génération et l’export ;
- backing rectangulaire ou offset ;
- position et extrusion ;
- détection des glyphes non supportés.

### FR-016 — Presets

- presets système immuables ;
- presets utilisateur locaux ;
- création, duplication, renommage, suppression ;
- presets versionnés par recette ;
- migration ou refus explicite si incompatibles.

### FR-017 — Historique

- undo/redo des paramètres et du dessin ;
- regroupement des mouvements continus ;
- historique borné ;
- restauration sans relancer des générations obsolètes.

### FR-018 — Aperçu 3D

- orbite, pan, zoom et fit ;
- grille et axes optionnels ;
- dimensions ;
- sélection des artefacts ;
- matériaux ;
- heatmap ;
- aperçu de couches clairement étiqueté « inspection, pas slicing » ;
- libération de toutes les ressources remplacées.

### FR-019 — Validation

Contrôles obligatoires existants à préserver :

- coordonnées finies ;
- triangles non dégénérés ;
- arêtes ouvertes et non-manifold ;
- composants connectés ;
- orientation des faces adjacentes ;
- volume signé ;
- dimensions et pose fabrication.

Chaque rapport contient code, sévérité, message utilisateur et détails techniques.

### FR-020 — Export

- STL binaire ;
- OBJ ;
- 3MF réel ;
- P2 : PDF/SVG du contour ;
- noms de fichiers déterministes ;
- Z-up et `Z = 0` ;
- millimètres ;
- export bloqué sur erreur ;
- multi-pièces séparées ou groupées sans fusion accidentelle ;
- STL individuel par rôle (`cutter`, `stamp`, `handle`, `tray`) ;
- P2 : capture PNG du viewport sans modifier la scène.

### FR-021 — Projet portable

- sauvegarde JSON versionnée ;
- import du projet ;
- inclusion optionnelle de la source ;
- checksum des ressources ;
- migration de schéma ;
- aucun objet Three.js sérialisé.

### FR-022 — Bibliothèque locale

- projets récents ;
- recherche et tags ;
- duplication ;
- export/suppression ;
- IndexedDB avec quotas et erreurs visibles ;
- aucune synchronisation cloud ;
- aucun compte requis ;
- export JSON disponible pour sauvegarder ou déplacer manuellement les projets.

### FR-023 — Transmission locale d’un projet

P2 :

- export d’un fichier projet partageable ;
- import du fichier sur un autre appareil ;
- option de produire une URL locale sérialisée uniquement si elle reste sous une limite sûre ;
- aucune source ou donnée envoyée vers un serveur ;
- aucun lien court ou stockage distant.

### FR-024 — IA optionnelle

- désactivée par défaut ;
- clé jamais stockée dans le projet ;
- avertissement avant envoi d’image ;
- dans cette application personnelle, une éventuelle clé utilisateur reste dans le stockage local du navigateur ;
- aucun backend n’est ajouté pour l’IA dans le périmètre actuel ;
- le cœur fonctionne sans IA.

### FR-025 — PWA hors ligne

P2 :

- manifeste installable ;
- cache uniquement des ressources statiques versionnées ;
- démarrage et ouverture des projets locaux sans réseau après une première visite réussie ;
- aucune mise en cache opaque des appels IA ;
- notification explicite lorsqu’une nouvelle version est prête ;
- stratégie de mise à jour empêchant le mélange de chunks de versions différentes.

## 10. États et erreurs

États minimaux :

```ts
type PipelineStatus =
  | 'idle'
  | 'reading-source'
  | 'vectorizing'
  | 'generating'
  | 'validating'
  | 'ready'
  | 'cancelled'
  | 'error';
```

Une erreur ne doit jamais effacer le dernier résultat valide. L’interface montre que les paramètres courants n’ont pas encore produit un résultat exportable.

## 11. Exigences non fonctionnelles

### Performance

- premier chunk JavaScript : maximum 200 KiB compressé selon la règle Vite existante ;
- chunk asynchrone : maximum 600 KiB ;
- génération simple interactive : cible inférieure à 500 ms sur machine de référence ;
- opération supérieure à 250 ms : indicateur d’activité ;
- raster et opérations lourdes : Worker lorsque possible ;
- aucun rendu continu si la scène est immobile.
- l’éditeur 2D reste interactif sur une fixture de 10 000 points ; la cible et le protocole de mesure doivent être documentés avant de fixer un seuil FPS bloquant.

### Fiabilité

- génération déterministe à paramètres identiques ;
- aucune publication de résultat obsolète ;
- rollback complet d’un batch ;
- aucune fuite de géométrie, matériau, texture ou Worker.

### Sécurité

- nettoyage SVG strict ;
- aucune utilisation de `{@html}` avec une source non fiable ;
- limites de ressources avant décodage ;
- aucune clé ou donnée sensible dans URL, logs ou projet ;
- CSP compatible avec un déploiement statique ;
- dépendances auditées.

### Confidentialité

- traitement local obligatoire hors appel IA explicitement déclenché par l’utilisateur ;
- aucune télémétrie ;
- aucun compte, identifiant utilisateur ou stockage distant ;
- suppression locale réelle des projets.

### Accessibilité

- navigation clavier ;
- focus visible ;
- labels et unités annoncés ;
- cibles tactiles d’au moins 44 px ;
- erreurs avec `role="alert"` ;
- heatmap accompagnée de valeurs textuelles ;
- contraste WCAG AA.

### Compatibilité

- dernières versions stables de Chrome, Firefox, Safari et Edge ;
- desktop complet ;
- mobile : import, réglages, aperçu et export ;
- message explicite si WebGL indisponible.

## 12. Mesures de succès

- taux d’import aboutissant à un premier modèle valide ;
- temps médian import → modèle ;
- taux d’exports bloqués et catégories d’erreurs ;
- taux de projets repris avec succès ;
- mémoire après 20 changements de modèle ;
- régressions du corpus ;
- taux de réussite d’import des fichiers de projet anciens.

Aucune télémétrie ne doit être ajoutée sans décision séparée de confidentialité.

## 13. Priorisation

### P0 — Refactorisation

- modèle de document ;
- registry de recettes ;
- Cutter/Stamp migrés ;
- orchestrateur ;
- validation et exports inchangés ;
- format de projet ;
- tests de non-régression.

### P1 — Produit utilisable avancé

- Imprint Cutter ;
- Cutter + Stamp ;
- Multi Cutter ;
- Stencil ;
- éditeur 2D ;
- WebP et collage ;
- presets ;
- bibliothèque locale.

### P2 — Extension

- profils de lame ;
- center bars ;
- texte/name plates ;
- grips ;
- Sandwich Cutter ;
- Cake Topper ;
- PDF/SVG du contour et fichier projet transmissible.
- PWA hors ligne.
- Capture PNG du viewport.

### P3 — Validation physique nécessaire

- Cake Pop Mold ;
- Practice Cookie ;

Les comptes, abonnements, paiements, paywalls et services cloud restent hors périmètre, y compris après P3.

## 14. Definition of Done globale

Une fonctionnalité est terminée uniquement si :

- le type et son schéma sont stricts ;
- les valeurs par défaut sont explicites ;
- les paramètres invalides sont rejetés ;
- les tests unitaires et d’intégration couvrent succès, limites et annulation ;
- le modèle final passe la validation ;
- les exports sont vérifiés ;
- les ressources sont libérées ;
- l’interface est accessible et responsive ;
- la documentation utilisateur est mise à jour ;
- aucun secret ni service distant implicite n’est introduit.
