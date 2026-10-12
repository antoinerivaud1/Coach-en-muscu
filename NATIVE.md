# Coach en Muscu — App native (Capacitor)

Phase 5 (privé) : l'app native est une coque Capacitor qui charge l'app Next.js
hébergée sur Vercel (`server.url` dans `capacitor.config.ts`). Pas de réécriture.
Le bundle autonome (sans dépendre de Vercel) viendra en Phase 6 (auth + RLS + data client).

## Prérequis (sur le Mac d'Antoine)
- Xcode (iOS) + un compte Apple Developer (99 $/an) — ticket P5-4 / CM-46
- Android Studio (Android) + compte Google Play Developer (25 $ une fois) — P5-5 / CM-47
- Node 18+ et le repo cloné

## Première initialisation (une seule fois)
```bash
npm install
# Génère les projets natifs (créent les dossiers ios/ et android/)
npx cap add ios      # déjà fait (CM-43) : ios/ est versionné, ne pas relancer
npx cap add android  # pas encore fait (CM-47)
npx cap sync
```

## Lancer / builder

### iOS
Testé pour CM-43 avec Xcode 26.6, CocoaPods 1.17.0 (`brew install cocoapods`),
Node 24, simulateur **iPhone 17 (iOS 26.5)**.

`ios/` est versionné, mais `ios/App/Pods/`, `ios/App/App/public/`,
`ios/App/App/capacitor.config.json` et `ios/capacitor-cordova-ios-plugins/` ne le
sont pas (gitignore de Capacitor + `.gitignore` racine). Après un clone, ou après
un changement de `capacitor.config.ts` / plugins, les régénérer :
```bash
npm ci
npx cap sync ios   # copie capacitor/www + capacitor.config.json, puis pod install
                   # (capacitor/www absent : placeholder, voir « Cible native »)
# si pod install échoue (Apple Silicon, specs périmées) :
cd ios/App && pod install --repo-update
```

Depuis Xcode : `npm run cap:ios` (ouvre `ios/App/App.xcworkspace`), choisir un
simulateur iPhone, ▶︎.

En ligne de commande, sans ouvrir Xcode :
```bash
xcrun simctl list devices available | grep iPhone   # choisir un simulateur

xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/DerivedData build CODE_SIGNING_ALLOWED=NO

xcrun simctl boot "iPhone 17" || true
open -a Simulator
xcrun simctl install booted ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted com.antoinerivaud.coachenmuscu
xcrun simctl io booted screenshot /tmp/capture.png
```
Écran blanc ou erreur réseau : vérifier `server.url`, puis lire les logs
`xcrun simctl spawn booted log stream --predicate 'subsystem contains "com.antoinerivaud"' --level debug`.

### Android
```bash
# Ouvre Android Studio, Run (projet android/ pas encore généré : CM-47)
npm run cap:android
```

### Après tout changement de config/plugins
```bash
npm run cap:sync
```

## Mise à jour de l'app
Comme on charge `server.url`, le contenu se met à jour automatiquement à chaque
déploiement Vercel : pas besoin de re-livrer un build natif pour un changement
d'écran. On ne reconstruit le natif que pour : config Capacitor, plugins, icône,
splash, ou montée de version pour les stores.

## Reste à câbler (tickets)
- Icône + splash + status bar : P5-2 / CM-44 (assets dans les projets natifs)
- Notifications locales natives (timer de repos) : P5-3 / CM-45 (`@capacitor/local-notifications`)
- Signing + TestFlight (iOS) : P5-4 / CM-46
- Signing + distribution interne (Android) : P5-5 / CM-47

## Notes
- `appId` : `com.antoinerivaud.coachenmuscu` (modifiable avant le premier `cap add`).
- URL de prod actuelle : https://v0-gym-workout-tracker-silk.vercel.app (à garder synchro dans `capacitor.config.ts`).
- `ios/` est généré et versionné (CM-43) ; `android/` sera généré et versionné avec CM-47.

## Icône & splash (CM-44)
Les sources sont dans `assets/` (icône encre + haltère vert acide, splash). Pour
(re)générer les sources : `python3 scripts/gen-icons.py`. Pour les injecter dans
les projets natifs (après `cap add`) :
```bash
npm run assets:gen   # = npx capacitor-assets generate
npx cap sync
```

## Cible native : bundle embarqué (CM-89 PR 3)

Deux cibles de build, un seul code (next.config.mjs) :
- **web** (`npm run build`, Vercel) : inchangée (middleware, redirections des
  anciennes adresses, tunnel Sentry `/monitoring`, `/sentry-test`).
- **native** (`npm run build:native`) : `BUILD_TARGET=native`, export statique
  (`output: "export"`, `trailingSlash: false`), sans middleware, sans
  `redirects()`, Sentry sans tunnel (envoi direct) et avec l'environnement
  `native` (`NEXT_PUBLIC_BUILD_TARGET`, lib/sentry/options.ts).

```bash
npm run build:native                       # out/ -> capacitor/www (liste les pages)
npm run serve:native -- --port 4300        # serveur statique « routeur iOS »
E2E_NATIVE_BASE_URL=http://localhost:4300 npm run test:native
npm run test:scripts                       # règles pures (routeur, placeholder, contrôles)
```
`build:native` contrôle l'export (`out/`) AVANT de toucher à
`capacitor/www` : pages attendues, charge RSC (`<page>.txt`) de chaque page,
aucune page web seulement (`sentry-test`, `monitoring`, `api/`), aucune
source map, aucune référence à `vercel.app`. Un seul problème : échec, et
`capacitor/www` reste intact (export laissé dans `out/`). Sinon `www` est
remplacé par échange de dossiers (`capacitor/.www-next`, `.www-old`), jamais
vidé ni à moitié remplacé.

`build:native` réécrit `.next` (avec un export, Next garde toujours `.next`
pour le build : un `distDir` dédié deviendrait le dossier d'export) :
relancer `npm run build` avant un `npm start` web. Les variables
`NEXT_PUBLIC_*` sont gravées au build (prod : celles de `.env.local`).

### Fichiers web seulement : suffixe `.web`
Un export statique refuse le middleware, les route handlers et les pages
dynamiques. Ces fichiers portent le suffixe `.web` : `middleware.web.ts`,
`app/sentry-test/page.web.tsx`. Le build web déclare les extensions
`web.tsx` / `web.ts` (`pageExtensions`), le build natif non : Next (et le
plugin Sentry) les ignorent. Rien n'est déplacé sur le disque, donc rien à
restaurer si un build échoue ou est interrompu.

Règle : toute nouvelle page doit rester statique (pas de `cookies()`,
`headers()`, `force-dynamic`, segment `[id]`) ; un fichier qui a VRAIMENT
besoin du serveur web (route handler, page dynamique) se nomme `*.web.ts(x)`.
Une route de métadonnées (`app/manifest.ts`) doit déclarer
`dynamic = "force-static"`. `npm run build:native` échoue sinon : la CI le
lance à chaque PR (job e2e).

### `capacitor/www` : généré, ignoré par git
Le placeholder versionné est `capacitor/placeholder/index.html`. Le hook
Capacitor `capacitor:copy:before` (package.json,
`scripts/native-placeholder.mjs`, décision `placeholderAction`) :
- avec `server.url` (jusqu'à la PR 4) : copie le placeholder si
  `capacitor/www` n'a pas d'`index.html`. Sur un clone neuf, `npx cap sync`
  fonctionne et le dossier `ios/App/App/public` (référencé par le projet
  Xcode) existe ;
- sans `server.url` (PR 4) et sans l'app (dossier absent ou placeholder
  seul) : erreur « lance d'abord npm run build:native », code de sortie 1,
  et suppression de `capacitor/www` (rien d'autre). Capacitor ignore le code
  de sortie des hooks et `cap sync` continue après un échec de copie : c'est
  la suppression qui bloque. Capacitor vide alors `ios/App/App/public` puis
  échoue à copier, et le build Xcode échoue au lieu de livrer une app vide.

### Adresses : règles du routeur iOS (à reproduire en Swift, PR 4)
Le serveur de fichiers de Capacitor iOS renvoie `index.html` pour toute
adresse sans extension. Le routeur personnalisé de la PR 4 doit suivre
exactement `resolveNativeFile` (scripts/lib/native-rules.mjs), utilisée par
`scripts/serve-native.mjs` et testée par `npm run test:scripts` et
`tests/native/routes.spec.ts` :
1. chemin avec extension (`/_next/static/…js`, `/dashboard.txt`,
   `/icons/…png`) : le fichier tel quel, 404 s'il manque (jamais
   `index.html`) ;
2. chemin sans extension : `<chemin>.html` s'il existe, sinon
   `<chemin>/index.html` s'il existe, sinon `/index.html` (repli) ;
3. la query (`?id=`, `?code=`, `?_rsc=`) et le `/` final sont ignorés pour
   choisir le fichier ; `..` est refusé.

L'ordre compte : `duo/rejoindre.html` et le dossier `duo/rejoindre/`
coexistent (idem `onboarding`, `seances`). Les navigations client lisent
`<page>.txt` (charge utile RSC), servis par la règle 1.

Le serveur de test ne masque aucun appel serveur : GET et HEAD seulement
(405 sinon), en-têtes `X-Native-File` (fichier servi) et
`X-Native-Fallback: 1` (repli de la règle 2).

Pages générées : `index`, `404`, `login`, `welcome`, `signup`, `dashboard`,
`history`, `progress`, `profile`, `guide`, `credits`, `support`,
`compte-supprime`, `onboarding`, `onboarding/seances`, `seances`,
`seances/new`, `seances/edit`, `sessions/view`, `duo/inviter`,
`duo/rejoindre`, `duo/rejoindre/confirmer`, `legal/cgu`,
`legal/confidentialite`, `legal/mentions` (`.html` chacune), plus
`manifest.webmanifest`, `public/` et `_next/`.

### Smoke tests (CI)
Projet Playwright `native` (`tests/native/`), jamais lancé par
`npm run test:e2e`. Dans le job e2e, après les e2e web : build natif sur la
stack Supabase locale, serveur statique sur le port 4300, puis : `/login`
servi par `login.html` ; connexion avec le compte du seed jusqu'à
`/dashboard` (rechargement complet servi par `dashboard.html`) ; passage au
Carnet par l'onglet sans nouveau document (charge RSC en 200) ;
rechargement de `/history` et de `/sessions/view?id=` (le bon écran, pas la
racine). Après chaque test : aucune requête vers `vercel.app` ni vers
`/monitoring`, aucune réponse de la même origine en erreur (>= 400), aucune
requête de la même origine (hors document) servie par le repli.
