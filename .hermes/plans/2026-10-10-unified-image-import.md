# REA lot 2 — unified image import

## Baseline et portée

Branche `feature/unified-image-import`, créée depuis recovery `1f3afd0dd928fc31a0f68cfec51db087aee21d56`. Clone propre et upstream identique après fetch ; ls-remote confirme ce SHA recovery. Jeton GitHub de cette session invalide, compte razorglyon non enregistré : PR/CI non relus, publication bloquée jusqu'au rétablissement. Pas de merge/déploiement.

## Problème et décision UI

Permettre de commencer un document local sans devoir comprendre les outils avancés. Parcours : démarrage → import/formes/projets → validation → confirmation si dirty → session canonique → génération → sauvegarde/export. Refus ou annulation conservent le document.

Variantes : (A) simple texte dans la zone d'import, conserve une navigation peu explicite ; (B) écran modal bloquant, gêne récupération et accès direct ; (C) section de démarrage intégrée avec trois actions, retenue pour réutiliser la navigation et rester réversible. Pas de nouvel écran Dessiner avant lot 3.

Contraintes : C1 document canonique unique (tests App et export JSON réel) ; C2 collage non intercepté dans input/textarea/contenteditable (tests événements et navigateur) ; C3 limites 10 Mio/8192 px/16 MP conservées (tests frontières) ; C4 clavier et mobile (montage isolé StartScreen puis Chromium 375 px) ; C5 WebP décodé/vectorisé réellement et fichier/collage équivalents (Chromium, pas stubs) ; C6 invalidation source/epoch/lifetime et remplacement annulé sans perte (tests différés). Pas de backend/compte/cloud ajouté, format projet V1 inchangé, raster original non persisté.

## Propriété et tâches séquentielles

Un seul implémenteur propriétaire de src/lib/import/imageImport.ts, ses tests, FileUpload.svelte/tests, StartScreen.svelte/tests, App.svelte et tests import App. Pas de modification de domaine, stockage, worker ou dépendances sans anomalie démontrée. Le parent possède plan/docs/contexte, revue intégrée, gates globales, Chromium, commits et publication.

1. Tests comportementaux RED, helper validation/normalisation partagé + pipeline SVG/raster existant. MIME/extension explicitement normalisés sans cast aveugle. Refuser un MIME non supporté même avec extension trompeuse. Contrôles avant lecture/décodage.
2. FileUpload transmet les fichiers au propriétaire App ; sélection/dépôt/collage utilisent le même pipeline. Erreurs visibles, sélection du même fichier possible ; traitement et annulation explicites. Collage image uniquement, pas texte/SVG HTML implicite.
3. StartScreen isolé via tests de montage, trois entrées réutilisant import/formes/projets ; raccordement App sans deuxième session. Import actif annulable, erreurs n'effacent pas le document. Garde tardive et nettoyage au démontage.
4. Parent rejoue voisins et global sérialisés, puis revues conformité et qualité lecture seule, corrections et nouvelle revue si besoin.
5. Chromium réel avec fixtures jetables : entrée clavier, PNG fichier/dépôt/collage, WebP fichier, refus corrompu, Cancel dirty, collage editable ignoré, export/reload et mobile. Captures avant/après et limites documentées.
6. Docs/contexte, commits anglais annoncés avant indexation explicite. PR draft empilée sur #59 et rollback par revert sans supprimer de données ; CI sur HEAD final exact. Si authentification bloquée, conserver commits locaux et déclarer livraison non publiée/non certifiée CI.

## Validation

TMP généré par workspace-tmp.py (fail-closed), GOMAXPROCS=2 UV_THREADPOOL_SIZE=2. pnpm exec vitest run --pool=threads --maxWorkers=1 --fileParallelism=false ; pnpm check ; smoke exports ; pnpm build ; pnpm audit --audit-level=moderate. Tous sérialisés. Aucun serveur/navigateur persistant après recette.
