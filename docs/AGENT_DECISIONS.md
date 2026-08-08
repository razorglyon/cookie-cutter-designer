# Décisions techniques pour les sessions Hermes

Ce document porte les décisions durables auparavant accumulées dans `AGENT_CONTEXT.md`. Git conserve l'historique des étapes et le contexte court conserve uniquement l'état nécessaire à la reprise.

## Domaine et persistance

- L'unité logique est le millimètre. STL ne stocke pas l'unité ; les coordonnées restent exprimées en mm.
- La scène Three.js est Y-up. Les exports de fabrication sont Z-up et posés à `Z = 0`.
- `DesignDocument.kind` est l'unique discriminant métier ; `parameters.mode` reste un champ de compatibilité V1.
- Un kind futur reste `never` tant que son contrat et son pipeline n'existent pas.
- Toute évolution incompatible du schéma persistant exige une nouvelle version et une migration explicite.
- `targetSize` remplace l'ancien facteur abstrait `scale`; la migration historique convertit `scale: 1` en 75 mm.
- Les données IndexedDB repassent par `parseDesignDocumentV1`; une corruption échoue explicitement.
- Une ouverture IndexedDB rejetée est retirée du cache afin que l'appel suivant puisse réessayer sans boucle automatique.
- Le codec projet reste pur : APIs `File`, téléchargement et UI appartiennent aux adaptateurs.
- La migration legacy utilise une factory UUID injectable afin d'éviter les collisions et rester testable.
- Le store document valide avant publication, reconstruit des copies défensives et gèle profondément les snapshots persistants.

## Génération et ownership Three.js

- Avant un retour réussi, la recette possède son `Object3D`; après retour, le caller le possède.
- Toute erreur ou annulation après génération impose un disposal unique avant propagation de l'erreur.
- `GeneratedArtifact` contient des objets runtime et ne doit jamais être sérialisé.
- Les rôles d'artefact restent corrélés au `DesignKind` au niveau TypeScript.
- Une promesse de recette rejetée est retirée du cache avec garde d'identité afin de permettre un retry ultérieur sans boucle.
- Le registry reste local et lazy ; il ne doit importer statiquement ni JSCAD ni les générateurs lourds.
- L'orchestrateur publie le nouveau snapshot avant le disposal du résultat remplacé ; un échec conserve le dernier résultat valide.
- Toute mutation engagée porte une révision monotone : une réentrée plus récente gagne.
- Les callbacks synchrones de barrière ou de disposal peuvent rappeler `clear()` ou `dispose()` sans cycle : l'opération réentrante démarre, mais le callback ne bloque pas son propre drainage.
- Le batch ne publie rien avant réussite complète et détruit tous les artefacts partiels sur échec ou annulation.
- Au démontage d'un Batch, vider d'abord le store et les références UI, puis disposer les ressources Three.js possédées.

## Géométrie et exports

- Toujours valider l'objet source puis sa copie transformée pour la fabrication.
- Le validateur compte les composants par adjacence de triangles, pas par nombre de meshes.
- Il ne garantit pas une détection exhaustive des auto-intersections triangle-triangle.
- Un détail plus petit que les offsets de paroi peut changer la topologie : refuser plutôt que lisser silencieusement.
- Stamp impose une base commune et une coque finale unique.
- `repairBooleanCapTriangles` doit rester fail-closed : ne pas élargir ses seuils pour masquer une géométrie invalide.
- La heatmap est une métadonnée viewer-only ; l'export STL l'ignore.
- Un 3MF est un package OPC/ZIP, jamais un XML renommé.
- Préserver exactement `byteOffset` et `byteLength` du `DataView` STL.
- L'aperçu de couches n'est ni un slicer ni une estimation de temps ; ne produire aucun faux G-code.

## Sécurité, UI et performances

- Un SVG importé suit une allowlist géométrique ; ne pas assouplir silencieusement cette frontière.
- Examiner tout nouvel usage de `{@html}` avec une donnée non fiable.
- La clé Gemini reste locale au navigateur et ne doit jamais être committée ou réaffichée.
- Les erreurs de champ utilisent `aria-describedby`, `aria-invalid` et une annonce évitant les doublons.
- Les sections de paramètres utilisent les éléments natifs `<details>/<summary>`, des cibles d'au moins 44 px et `:focus-visible`.
- JSCAD, Stamp et les panneaux optionnels restent chargés par `import()` afin de protéger le bundle initial.
- Le raster est décodé sur Canvas/UI ; ImageTracer s'exécute dans un Worker annulable et borné à 16 MP.

## Environnement et livraison

- Sous `pids.max=256`, `ERR_INSUFFICIENT_RESOURCES` peut provenir de la saturation Chromium plutôt que du code lazy.
- Tailscale reste hors du repo. Le script de preview doit nettoyer Serve à l'arrêt.
- L'allowlist Vite reste bornée à l'hôte privé attendu ; ne pas utiliser `allowedHosts: true`.
- Protection de `main`, vérifiée via l'API GitHub le 2026-08-08 : check strict `validate`, historique linéaire, force-push et suppression interdits.
