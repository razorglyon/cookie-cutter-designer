# Quick Start Guide - Cookie Cutter Designer

## Installation & Lancement

```bash
# 1. Installer les dépendances
pnpm install

# 2. Lancer le serveur de développement
pnpm run dev

# 3. Ouvrir dans votre navigateur
# http://localhost:5173/
```

## Utilisation Rapide

### Option 1 : Test avec le Cercle
1. Cliquer sur **"Or Try a Test Circle"**
2. Ajuster les paramètres dans le panneau de gauche
3. Voir la prévisualisation 3D en temps réel
4. Cliquer sur **"Download STL File"** pour exporter

### Option 2 : Upload d'un Fichier
1. Glisser-déposer un fichier SVG/PNG/JPG
2. Ou cliquer pour parcourir vos fichiers
3. L'application vectorisera automatiquement les images raster
4. Ajuster les paramètres selon vos besoins
5. Exporter le fichier STL

## Paramètres Recommandés

### Pour un Emporte-Pièce Standard
- **Épaisseur des parois** : 1.0mm
- **Hauteur de coupe** : 12mm
- **Hauteur totale** : 20mm
- **Angle de dépouille** : 7°
- **Poignée** : Round (ronde)

### Pour un Emporte-Pièce Fin et Délicat
- **Épaisseur des parois** : 0.8mm
- **Hauteur de coupe** : 10mm
- **Hauteur totale** : 15mm
- **Angle de dépouille** : 5°
- **Poignée** : Flat (plate)

### Pour un Emporte-Pièce Robuste
- **Épaisseur des parois** : 1.2mm
- **Hauteur de coupe** : 15mm
- **Hauteur totale** : 25mm
- **Angle de dépouille** : 10°
- **Poignée** : Rectangular (rectangulaire)

## Conseils d'Impression 3D

### Matériau
- **PLA naturel** (non coloré) pour contact alimentaire
- Température : 200-210°C
- Plateau : 50-60°C

### Paramètres de Slicing
```
Hauteur de couche : 0.2mm
Infill : 20%
Périmètres : 2-3
Vitesse : 40-50mm/s
Orientation : Pointe de coupe vers le haut (imprimez à l'envers)
Supports : Non nécessaires
```

### Test Avant Utilisation
1. Imprimer un test avec de la pâte à modeler
2. Vérifier la solidité des parois
3. Tester le découpage avec de la vraie pâte
4. Ajuster les paramètres si nécessaire

## Résolution de Problèmes

### L'emporte-pièce est trop fragile
→ Augmenter l'épaisseur des parois à 1.2mm
→ Augmenter le nombre de périmètres à 3

### Le découpage n'est pas net
→ Augmenter la hauteur de coupe
→ Augmenter l'angle de dépouille à 8-10°

### La pâte colle à l'emporte-pièce
→ Augmenter l'angle de dépouille
→ Utiliser de la farine sur la pâte

### Le fichier STL est trop gros
→ Réduire l'échelle de votre design
→ Simplifier les détails de votre image

## Formats de Fichiers Supportés

| Format | Type | Recommandation |
|--------|------|----------------|
| SVG | Vectoriel | ⭐ Meilleur qualité |
| PNG | Raster | ✓ Bon (sera vectorisé) |
| JPG | Raster | ✓ Bon (sera vectorisé) |

## Limites

- Taille maximale de fichier : 10MB
- Résolution d'image recommandée : 500-2000px
- Formes complexes peuvent nécessiter simplification
- Détails < 1mm peuvent ne pas être imprimables

## Astuces Pro

1. **Images simples fonctionnent mieux** : Silhouettes nettes donnent de meilleurs résultats
2. **Testez d'abord** : Utilisez le cercle de test pour valider vos paramètres d'impression
3. **Évitez les détails fins** : Les petits détails < 1mm ne seront pas bien imprimés
4. **Utilisez la vectorisation** : Les PNG/JPG avec bon contraste donnent d'excellents résultats
5. **Vérifiez les warnings** : L'application vous avertit des problèmes potentiels

## Support

Des problèmes ? Des questions ?
- Ouvrir une issue sur GitHub
- Vérifier les warnings dans le panneau de droite
- Consulter le README.md pour plus de détails

---

Bon design ! 🍪
