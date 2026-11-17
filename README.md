# Ma classe — prototype

Application web (PWA) pour l'appel, le suivi des oublis / travaux non faits, la saisie détaillée des points et les plans de classe.
Fonctionne sur iPad (Safari) et ordinateur (Safari / Chrome), hors connexion une fois installée.

## Mise en ligne (GitHub Pages)
1. Crée un dépôt, copie **tout le contenu de ce dossier** à la racine, active GitHub Pages (branche `main`, dossier `/`).
2. Ouvre l'adresse `https://<compte>.github.io/<dépôt>/` sur l'iPad (Safari) → Partager → **Sur l'écran d'accueil**.
   Utilise l'application depuis l'icône (et non depuis un onglet Safari) : le stockage y est mieux protégé.

## Sauvegarde / Google Drive
Réglages → « Exporter une sauvegarde » : iPad → feuille de partage → Enregistrer dans Fichiers → Google Drive.
« Restaurer » rouvre ce fichier (le sélecteur de fichiers de l'iPad propose Drive). Les photos sont incluses.

## Structure
- `js/store.js` données + sauvegarde (IndexedDB) · `js/logic.js` calculs (notes, compétences, suivi)
- `js/views/*` écrans · `vendor/` bibliothèques embarquées (Preact + htm, SheetJS) · `sw.js` mode hors connexion
