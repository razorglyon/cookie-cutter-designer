# Invariants de cookie-cutter-designer

Référence durable complémentaire à `AGENT_CONTEXT.md`. Les résultats de livraison datés restent dans les documents de validation et Git. Les anciennes notes intégrales sont conservées dans le commit applicatif `5c74083baec230788468fa70c9bada5c1caecda3` et dans sa fusion ; ce fichier conserve les décisions utiles à la suite, pas leurs anciens statuts.

## Document, édition et ressources

- Document V1 canonique : source SVG originale distincte de sketch ; identité, nom, paramètres et préférences conservés. Raster original non persisté, undo non durable après reload.
- Atelier dans Advanced Creation : `SketchWorkspace.svelte` + `sketchCommands.ts`, lecture du sketch courant et mutation via session.updateSketch. Déplacement souris/tactile/clavier/coordonnées ; add/delete/close sur contour linéaire unique ; miroir horizontal/rotation 90° centrés viewBox. M/L/C/Q/Z et contrôles conservés, sans polygonisation. Primitives/transform/styles/commandes non prises en charge conservés et signalés en lecture seule. Pas de pinceau/texte/calques/snapping/plume complète/restaurer-original dédié.
- Drag local jusqu’au release, un commit gardé par snapshot exact + epoch. Escape/pointercancel/blur/perte capture annulent ; navigation/remplacement/history invalident le brouillon. Historique et génération existants réutilisés ; autres outils legacy non déclarés migrés.
- `.ccd.json` strict, limite 10 Mio ; validation avant remplacement. Annuler préserve le document ; drainer écritures acceptées avant fermeture stockage.
- Récupération IndexedDB séparée, reprise explicite ; bibliothèque modifiée uniquement explicitement ; brouillons par onglet/époque, pas de collaboration implicite.
- Gardes lifetime/source/epoch jusqu’à publication. Export geometry exige mesh/epoch/ready/document cohérents ; JSON indépendant. Ownership/disposal Three.js conservés. Batch externe non sauvegardable V1.
- Loft raster : chemin legacy conservé pour cardinalités égales ; fusion périmétrique monotone pour cardinalités différentes sans rééchantillonnage. Changements du nombre de composants refusés ; validateurs et fixtures historiques inchangés par l’atelier.
- Budgets finaux UTF-8 après preload Vite : 200 KiB entry, 600 KiB chunks ; découpage runtime/addons ≠ baisse garantie du transfert total.

## Import photographique

- `photoSettings.ts` : seuil null=auto ; polarité dark/light ; crop normalisé ; minComponentArea0 et fillHolesfalse par défaut. Aucun choix destructif implicite.
- `photoProcessing.ts` : segmentation luminance/alpha, diagnostics/topologie ; Worker `photoProcessor.worker.ts` : décodage, budgets, ImageTracer noir uniquement et contrôle des trous. `photoImport.ts` : Worker propriétaire par requête, timeout/abort/cleanup.
- App stage un brouillon gardé par document/snapshot/epoch/sourceRevision ; `PhotoImportReview` prépare sans mutation puis applique explicitement. Retrace conserve source/id/nom/paramètres, réutilise l’historique canonique. Raster et réglages restent volatiles, pas de schéma V2.
- Fixtures photographiques attribuées coins/coffee/chelsea dans `src/lib/import/__tests__/fixtures/photos/`. Test Node déterministe et vrai décodage Chromium complémentaires ; aucun détour cloud.

## Profils de paroi

- `domain/wallProfiles.ts` définit Fin (0,8 mm / 5°), Standard (1 mm / 7°), Robuste (1,5 mm / 10°). `CutterSection.svelte` applique uniquement `wallThickness` + `taperAngle` via une mise à jour atomique du port UI existant ; le document de session reste propriétaire des données. Taille, hauteurs, poignée, sketch/source et ponts conservés. Choix actif calculé par égalité exacte des deux valeurs ; sinon Personnalisé. Aucun identifiant de profil persisté, nouveau schéma, migration ou nouveau découpage géométrique. Les contrôles gardent leurs bornes/pas et affichent maintenant aussi les valeurs fractionnaires historiques sans arrondi trompeur.

## Série de Cutters

- V3 = source unique homogène, paramètres communs, ponts et disposition (`copies`, `columns`, `spacingMm`). Aucun mesh sérialisé. V1/V2 inchangés hors utilisation de la série ; une ancienne application refuse V3 comme version future.
- Retour au Cutter unique sans perte : V2 s’il y a des ponts, sinon V1. Taille, profils, poignées et ponts restent ceux de la source commune.
- Copies 1–24, colonnes 1–copies, espace 0,5–40 mm, total 500 000 triangles ; plateau mesuré depuis la géométrie complète poignée comprise. Le garde de triangles ne constitue pas une mesure de performance maximale.
- Le Cutter source doit être complet/connecté. Chaque copie possède ses géométries et matériaux ; le prototype est libéré. Annulation ou erreur n’exposent pas de série partielle.
- Une disposition impossible reste sauvegardable/exportable en JSON, mais pas en géométrie. Batch doit rester accessible sans mesh après réouverture pour réparer ; ne pas corriger le document implicitement.
- Ouvrir/saisir Batch ne modifie pas le projet ; Créer/Appliquer publie une modification atomique dans l’historique. Le Batch libre historique est explicitement non enregistrable.
- Hors lot : monobloc, connexions entre copies, dessins/tailles différents, Stamp, placement libre/optimiseur avancé, socle/paroi/tranchant indépendants.

## Artefacts temporaires et exécution

- Smoke et benchmark allouent chacun un répertoire privé unique par `mkdtempSync(join(tmpdir(), prefix))`, donc respectent toujours TMPDIR. Suppression de la suppression/réutilisation du chemin smoke partagé ; artefacts conservés pour inspection, chemins exacts publiés via stdout. README adapté aux chemins non stables.

- Toujours fournir le TMP isolé de la racine Git via `/workspace/.hermes-tools/workspace-tmp.py`. Échec du helper ou sortie vide : bloquer la commande. Sérialiser les gates ; smoke et benchmark fixent déjà maxWorkers.
- Avant Chromium, vérifier les ressources réelles ; le runner possède son navigateur/serveur localhost et les arrête dans `finally`. Après timeout, arrêter uniquement ses propres enfants et conserver les journaux échoués. Reprendre les contrôles manquants sur les mêmes empreintes, sans compter une interruption comme un succès.
- La comparaison HTTP de l’artefact prouve la version servie, pas un essai sur téléphone, lecteur d’écran, slicer ou imprimante. Les recettes navigateur restent limitées à leurs corpus réellement exercés.

## Publication

- Compte `razorglyon` par commande, selon `/workspace/AGENTS.md` ; jamais `gh auth switch/login` ni édition de `hosts.yml`.
- GO distinct selon la portée commit/push/PR/ready/fusion/déploiement ; ne pas transformer un ancien GO en autorisation d’un nouveau lot. Jamais de bypass, suppression de branche ou force-push implicites.
- Vérifier protections, base, HEAD et contrôles du SHA exact. Distinguer analyse CodeQL et verdict externe. Sur le squash, exiger les workflows attendus selon leurs déclencheurs, sans prétendre que les contrôles externes de PR ont été réexécutés.
- Après squash, prouver l’égalité des arbres et préserver l’ancienne branche. Pour le chantier suivant, créer une branche depuis `origin/main` vérifié ; la divergence des SHA ne prouve pas un lot non livré.
- Pour Pages, vérifier déploiement/SHA, paquet réellement uploadé et tous ses fichiers publics. `.nojekyll` vide peut être une métadonnée de packaging absente du paquet, uniquement après preuve ; aucune exclusion générale des fichiers cachés.
