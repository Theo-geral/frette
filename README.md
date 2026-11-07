# Frette — apprendre la guitare

Web app installable (PWA) qui écoute ta guitare par le micro du téléphone.

- **Accorder** : accordeur 6 cordes, détection automatique de la corde, note de référence au toucher.
- **Notes** : 9 exercices en première position (cordes à vide, chaque corde, gamme de Do, révision).
- **Accords** : Em, Am, C, G, D, E, A, Dm avec diagramme, doigtés et reconnaissance ; mode enchaînement.
- **Morceaux** : 4 mélodies du domaine public qui défilent façon tablature, vitesse 50/75/100 %, mode « Attendre ma note ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `style.css` | Apparence |
| `core.js` | Logique pure : détection de hauteur (YIN), accords (chromagramme), exercices, morceaux |
| `app.js` | Moteur micro et écrans |
| `sw.js` | Fonctionnement hors ligne (incrémente `VERSION` après chaque modification) |
| `manifest.webmanifest`, `*.png` | Installation sur l'écran d'accueil |

## Mettre l'appli sur ton téléphone (GitHub Pages, gratuit)

Le micro n'est accessible qu'en **HTTPS**, d'où cet hébergement.

1. Crée un compte sur github.com puis un dépôt public, par exemple `frette`.
2. Dans le dépôt : **Add file → Upload files**, glisse tout le contenu du dossier, puis **Commit**.
3. **Settings → Pages** : Source « Deploy from a branch », branche `main`, dossier `/ (root)`, **Save**.
4. Après une minute, l'appli est en ligne sur `https://<ton-pseudo>.github.io/frette/`.
5. Sur Android, ouvre cette adresse dans Chrome, menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).

## Tester sur ton PC

`python -m http.server 8000` dans le dossier, puis `http://localhost:8000` dans Chrome (localhost est autorisé pour le micro).

## Passer en APK plus tard

Deux options, une fois l'appli en ligne :

- **Bubblewrap / PWABuilder (le plus simple)** : sur pwabuilder.com, colle l'adresse GitHub Pages et génère un paquet Android (Trusted Web Activity). Tu obtiens un `.apk` installable directement.
- **Capacitor** : embarque les fichiers dans une vraie appli Android (fonctionne sans internet, accès natif possible). Demande Android Studio.

## Conseils d'utilisation

- Pose le téléphone à 30–50 cm de la rosace, dans une pièce calme.
- Commence par l'accordeur, puis « Les 6 cordes à vide ».
- Pour les morceaux, garde « Attendre ma note » coché et la vitesse à 50 % au début.
