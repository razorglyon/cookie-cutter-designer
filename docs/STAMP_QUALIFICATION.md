# Qualification Stamp — géométrie validée localement

## Verdict courant

**Cœur 10 mm sans poignée corrigé dans les deux modes, validation locale du 2026-10-13.** Les deux anciennes assertions positives passent désormais ; le corpus et la suite complète sont verts. Aucun seuil de dégénérescence abaissé, aucun contour simplifié, aucun format V1–V3 changé.

Branche `fix/stamp-qualification`, issue du commit local vérifié `319d8cd`, remote `razorglyon/cookie-cutter-designer`. Le correctif complète l’extension précédemment non commitée. Aucun push, PR, fusion, déploiement ni lot B–E. La géométrie et Chromium sont qualifiés sur les cas ci-dessous ; **Firefox/WebKit et l’impression physique restent des réserves distinctes**.

## Cause et correctif du cœur miniature

Les contours étaient corrects. Sur le cœur échantillonné à 48 segments par courbe, Earcut choisissait près de la pointe de minuscules oreilles : une facette avait une aire double d’environ 3,32e-6 mm². Le validateur final la rejetait selon son seuil existant, puis signalait une surface ouverte après exclusion des triangles dégénérés de son analyse. Ce signal ne devait pas être masqué par un seuil plus faible ou un remplissage.

`stampBodyGeometry.ts` conserve la triangulation antérieure lorsqu’elle produit des triangles sûrs. Sinon :

- un capot sans trou essaie un éventail vers un sommet **intérieur** ;
- un capot avec un trou cherche une bande triangulée qui consomme chaque arête des deux contours ; des points d’appui **intérieurs** permettent de raccorder les deux côtés d’une pointe concave sans créer une petite oreille ;
- chaque remplacement doit avoir des triangles positifs au même seuil, la totalité des arêtes originales avec la bonne orientation, des arêtes intérieures appariées et l’aire attendue. À défaut, il est refusé.

Les points d’appui ne modifient ni les bords ni le SVG. Aucun rééchantillonnage, retrait ou déplacement d’un sommet de contour, ni rebouchage de la cavité. Le maillage final et le STL restent soumis aux validateurs inchangés. Les recherches sont bornées en états et en essais.

## Contrat démontré — RED puis GREEN

Preuves fraîches : `/workspace/reports/stamp-qualification-heart10-msx6cikz/`. Copie des changements et de la note avant reprise dans `before/` ; diagnostic exploratoire archivé hors de `src`.

- `red-heart10.log` : les **deux** anciens tests positifs échouent avant patch, pour triangles dégénérés/surface ouverte.
- `red-cap-contract.log` : deux tests de contrat du générateur planaire échouent avant patch pour la même cause.
- `stampBodyGeometry.test.ts` exerce ensuite **16 variantes** : Relief/Creux, quatre débuts cycliques et les deux sens de parcours. Pour chacune : **288 arêtes du dessin conservées**, aire des capots, volume analytique, coque unique et chaque triangle au-dessus du seuil.
- Les deux tests originaux ne sont ni ignorés, ni transformés en rejets attendus. Les empreintes historiques restent vertes ; les **16 STL précédemment réussis** du corpus sont identiques octet par octet après correctif.

## Résultats réellement obtenus

Toutes les commandes lourdes reçoivent le TMP isolé validé par `/workspace/.hermes-tools/workspace-tmp.py`. `GOMAXPROCS=2`, `UV_THREADPOOL_SIZE=2`, Vitest un worker sans parallélisme de fichiers ; journaux, commandes, timeouts et empreintes conservés.

| Gate | Résultat final |
|---|---|
| Tests ciblés géométrie/recette/App | **86/86**, 5 fichiers |
| Corpus étendu | **20/20**, dont les deux cœurs 10 mm |
| Suite complète | **1 241/1 241**, 93 fichiers, 0 échec ; 333,73 s côté lanceur |
| Typecheck | **0 erreur, 0 avertissement** |
| Build / budgets existants | **Réussis** |
| Smoke export | **4/4** |
| PrusaSlicer | **20/20 fichiers découpés** |
| Chromium desktop et viewport mobile | **Réussi**, deux modes 10 mm, aperçu/sauvegarde/réouverture/STL |
| Axe automatisé | **0 violation détectée** sur les deux états audités ; 25 règles passées desktop, 24 mobile |

`qualification-inputs.json` rattache le résultat à **236 empreintes source** et à l’inventaire du build. Elles sont identiques aux sources avant/après navigateur et à la collecte finale ; les assets servis sont comparés au build. Les mises à jour documentaires et l’en-tête de note postérieurs ne changent pas ces sources.

Les anciennes preuves `/workspace/reports/stamp-qualification-85bcwu8c/` restent consultables, mais leurs **1 223 succès / 2 échecs** ne sont plus le verdict courant. Les échecs de sondes et essais retirés restent des diagnostics, jamais comptés comme réussites.

## STL et slicing réellement vérifiés

La collecte fraîche comprend **18 STL du corpus** et **2 téléchargements Chromium 10 mm**, soit **20 fichiers**. PrusaSlicer 2.9.2 reconnaît chacun comme manifold et constitué d’une pièce ; découpage terminé, G-code non vide, extrusion réelle, couches ordonnées et hauteur finale contrôlés. Aucune réparation annoncée dans les journaux ; ce n’est pas une affirmation d’absence de toute normalisation interne du slicer.

Chaque STL du cœur 10 mm contient **1 174 triangles**, **58 784 octets**, des arêtes partagées deux fois avec orientations opposées, une coque connectée et un volume signé positif. Le plus petit carré de norme du produit vectoriel vaut environ **1,87e-6**, pour le seuil inchangé **1e-10**. Le contrôle porte sur les coordonnées effectivement sérialisées, pas seulement sur la représentation JSCAD.

| Mode, sans poignée | Dimensions du STL | Couches à 0,2 mm | Volume |
|---|---|---|---|
| Relief, profondeur 2 mm | 10 × 10 × 6 mm | **30**, dernière Z=6 mm | ≈488,8876 mm³ |
| Creux, profondeur 3 mm | 10 × 10 × 4 mm | **20**, dernière Z=4 mm | ≈266,6686 mm³ |

Le fond creux est à 1 mm, contrôlé par raycast et par les plans du STL. Les aires et volumes correspondent au même contour Float32, avec toutes ses arêtes, et non à une version simplifiée.

Rapports `slicing-corpus.json`, `sliced-extra/results.json` et `verified-results.json`. Les empreintes des STL effectivement lus par le slicer et de leurs G-codes sont relues.

Profil hypothétique de qualification : lit 1 200 × 1 200 mm pour les grandes tailles du corpus, buse 0,4 mm, filament 1,75 mm, couches 0,2 mm, trois périmètres, cinq couches pleines dessus/dessous et remplissage 15 %. **G-codes de contrôle, pas prêts pour l’imprimante de Rza** : imprimante, matériau, calibration, supports, adhérence et tolérances matérielles inconnus. Aucune impression physique effectuée.

Les essais antérieurs supplémentaires à 0,1 mm et avec poignée restent dans le rapport du run précédent ; ils ne sont pas présentés comme des slicings réexécutés dans ce run. Les tests géométriques/recette/App correspondants passent de nouveau dans la suite complète.

## Parcours Chromium frais — deux modes 10 mm

Rapport `browser-UOFovg/browser-result.json` dans le répertoire de preuves fraîches. Desktop **1 365 × 900**, viewport mobile **390 × 844** ; captures inspectées. Pas d’essai sur téléphone réel.

- Forme Heart réelle de la bibliothèque, taille 10 mm saisie dans le champ numérique, choix « Sans poignée », Relief à 2 mm puis sélection Creux à 3 mm au clavier.
- Aperçu WebGL réel, contrôles sélectionnés et absence de débordement ; téléchargements binaires des deux modèles.
- Sauvegarde, vraie lecture IndexedDB, rechargement complet et réouverture explicite pour le Creux ; puis sauvegarde/rechargement/réouverture également pour le Relief. **JSON exact et STL identique après reprise dans chaque mode**.
- SHA-256 Relief : `a742d8c49d48149038adad6ae18871702aee4448dfc318bc16305815ed3baa63`.
- SHA-256 Creux : `a819cc63ff3a55530501688cda0152bc72213cda444da18e86b96a5902b9a2f1`.
- Les deux téléchargements sont également identiques aux STL de génération directe. Bascules entre modes sans export du mesh précédent.
- **56 assets** servis comparés au build ; aucune erreur de page, serveur et navigateur arrêtés.
- Une première sonde de taille a échoué car elle utilisait Home comme pour un slider. Le champ réel est numérique avec événement change : le runner a été corrigé en saisie puis Tab, sans changement produit.

Les audits axe sont automatisés et limités à ces états : ils ne certifient pas une accessibilité complète ni un essai avec lecteur d’écran humain.

## Compatibilité et limites conservées

- Corps planaires sans poignée uniquement ; les raccordements de poignée ne sont pas devinés. Un résultat non validable reste refusé.
- Les formats V1/V2/V3, paramètres legacy, codecs, session, UI, manifeste et lockfile sont inchangés par cette extension. `geometryRoute` reste une indication volatile Three.js, pas un champ persisté.
- Cercle et cœur dans les deux modes à **10 / 200 / 1 000 mm**, contour ondulé 512 sommets, convexe 1 000 sommets et motif à 25 trous : tous les cas du corpus passent. Gardes >2 Mio, paths et points conservées.
- Pas de qualification de tous les SVG autorisés, des poignées aux tailles extrêmes, des plafonds de 10 000/50 000 points ou de leurs performances maximales.
- Les notes longues de Limace/Sangsue restent hors périmètre ; le contrôle global des notes peut donc rester rouge, indépendamment de la suite applicative verte.

## Firefox/WebKit — réserve indépendante, non levée

Les tentatives précédentes restent inchangées : Firefox 146.0.1 ouvre une page HTML headless mais la sonde WebGL2 renvoie false ; WebKit 26.0 échoue à créer une page. Xvfb/proot isolés échouent avec `execve(.../Xvfb): Permission denied`. La cause centrale exacte n’est pas affirmée.

**Parcours Firefox/WebKit non qualifiés, non réessayés dans ce correctif géométrique.** Carte `t_2742c31d` assignée à `default`, bloquée avant modification centrale. Aucune autorisation d’installation système, modification Docker/Hermes, redémarrage ou publication n’en découle. Safari/iPhone réel et lecteur d’écran restent non testés.

## Reprise et Git

- Branche **`fix/stamp-qualification`**, base **`319d8cd882e9940de7afd72a1233c8fde8062dc3`**, remote attendu vérifié. Le commit local de correction, une fois créé, est identifiable par Git et `final-state.json` dans le répertoire de preuves fraîches.
- Validations rattachées au contenu source, pas au seul SHA de la base. Avant commit, fichiers et message annoncés ; pas de publication autorisée.
- Texte préexistant d’`AGENT_CONTEXT.md` préservé intégralement, sauf l’en-tête de reprise géré par l’agent ; note exclue du commit, index vide en fin de livraison. Aucun stash/reset destructeur.
