# Coach en Muscu : app native (Capacitor)

Phase 7 / CM-89 : l'app native embarque l'export statique de l'app Next.js
(`npm run build:native` vers `capacitor/www`, PR 3), servi par Capacitor en
`capacitor://localhost`. Plus de `server.url` : l'app ne charge plus rien depuis
Vercel, seule Supabase est appelée (clé anon, sous RLS). Historique : en Phase 5,
la coque chargeait l'app hébergée sur Vercel.

Côté natif (CM-89, PR 4) :
- Session Supabase dans **Capacitor Preferences** (UserDefaults), pas en cookies
  (`lib/supabase/client.ts`, `lib/supabase/nativeSession.ts`). Le web garde ses
  cookies, inchangé.
- **Routeur iOS dédié** (`ios/App/App/StaticExportRouter.swift`, branché par
  `AppViewController.swift` et `Main.storyboard`) : sert `<chemin>.html` (ou
  `<chemin>/index.html`) pour chaque écran. Le routeur par défaut de Capacitor
  renverrait `index.html` (l'accueil) à chaque rechargement complet.

## Prérequis (sur le Mac d'Antoine)
- Xcode (iOS) + un compte Apple Developer (99 $/an) : ticket P5-4 / CM-46
- Android Studio (Android) + compte Google Play Developer (25 $ une fois) : P5-5 / CM-47
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
npm run build:native   # export statique vers capacitor/www (variables NEXT_PUBLIC_* de prod)
npx cap sync ios       # copie capacitor/www + capacitor.config.json, puis pod install
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
Écran blanc : vérifier que `capacitor/www` contient bien l'export (`index.html`,
`dashboard.html`, `_next/`…) et qu'il a été copié (`npx cap sync ios`), puis lire
les logs
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

## Bloc B sur le Mac (CM-89, PR 3 + PR 4)
À faire une fois les PR 3 (export natif) et PR 4 (session native + routeur iOS)
fusionnées sur `main`.

1. **Installer** : `git pull`, puis `npm ci`.
2. **Exporter** avec les variables de PROD (gravées au build, rien n'est lu à
   l'exécution) :
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon> \
   NEXT_PUBLIC_SENTRY_DSN=<dsn, optionnel> \
   NEXT_PUBLIC_SITE_URL=https://v0-gym-workout-tracker-silk.vercel.app \
   npm run build:native
   ```
   `NEXT_PUBLIC_SITE_URL` : origine des liens d'invitation partagés depuis l'app
   (`lib/siteUrl.ts`). Sans elle, l'app retombe sur le site de prod codé en dur
   (`PROD_WEB_ORIGIN`), jamais sur `capacitor://localhost`.
   Vérifier `capacitor/www/dashboard.html`, `capacitor/www/sessions/view.html` (ou
   `dashboard/index.html` si l'export utilise `trailingSlash`).
3. **Synchroniser** : `npx cap sync ios`. Installe le pod `CapacitorPreferences`
   (nouveau) et met à jour `ios/App/Podfile.lock` : **committer ce
   Podfile.lock**. Sans `pod install`, Xcode refuse de builder (« The sandbox is
   not in sync with the Podfile.lock »).
4. **Ouvrir Xcode** (`npm run cap:ios`). Vérifier que `AppViewController.swift`
   et `StaticExportRouter.swift` apparaissent dans le groupe `App` et dans la
   cible `App` (Build Phases > Compile Sources), et que la scène de
   `Main.storyboard` a pour classe `AppViewController`, module `App`.
5. **Simulateur, puis iPhone réel** (Product > Run). Au lancement, la console
   Xcode ne doit pas afficher « Unable to find application directory ».

### Tests à faire (simulateur puis appareil)
- [ ] **Connexion** : email + mot de passe, arrivée sur le tableau de bord (et
      non sur l'accueil : preuve que le routeur sert `dashboard.html`).
- [ ] **Tableau de bord** : données affichées, navigation vers Historique,
      Progrès, Profil.
- [ ] **Séance complète** : démarrer, saisir des séries, notification de fin de
      repos écran verrouillé, terminer, puis ouvrir la séance depuis
      l'historique (`/sessions/view?id=…`).
- [ ] **Déconnexion** : retour sur `/login`. Tuer l'app (balayage) et la
      relancer : elle doit rester déconnectée.
- [ ] **Relance connectée** : se reconnecter, tuer l'app, relancer : la session
      est conservée (tableau de bord direct, sans `/login`).
- [ ] **Mode avion** : app tuée, mode avion, relance. Attendu : `/login` (sans
      session) ou le tableau de bord / un écran d'erreur avec « Réessayer » (avec
      session), jamais un écran blanc.
- [ ] **Aucune requête vers vercel.app** : Safari > Développement > [simulateur
      ou iPhone] > Inspecteur web, onglet Réseau. Seuls `capacitor://localhost`
      et `<ref>.supabase.co` (et Sentry si DSN) doivent apparaître.
- [ ] **Suppression du compte** (compte de test uniquement) : page « Compte
      supprimé », puis relance de l'app : déconnectée.
- [ ] **Lien d'invitation duo** ouvert dans l'app : la session reste ouverte.
- [ ] **Partage d'invitation** depuis l'app : le lien commence par
      `https://` (site web), jamais par `capacitor://localhost`.

### À savoir pour la mise à jour
Les utilisateurs de la version Phase 5 (app chargée depuis Vercel) devront se
reconnecter UNE fois après la mise à jour : leur session était dans les cookies
du site, l'app embarquée la lit désormais dans Preferences. Rien n'est perdu
côté données.

## Mise à jour de l'app
Depuis CM-89, le contenu est EMBARQUÉ : un déploiement Vercel ne change plus
l'app native. Tout changement d'écran demande un nouvel export
(`npm run build:native`), `npx cap sync ios` et un nouveau build (TestFlight /
App Store). Le site web, lui, continue de se mettre à jour à chaque déploiement.

## Reste à câbler (tickets)
- Icône + splash + status bar : P5-2 / CM-44 (assets dans les projets natifs)
- Notifications locales natives (timer de repos) : P5-3 / CM-45 (`@capacitor/local-notifications`)
- Signing + TestFlight (iOS) : P5-4 / CM-46
- Signing + distribution interne (Android) : P5-5 / CM-47
- Keychain au lieu de Preferences avant soumission App Store (session chiffrée)
- Podfile.lock à committer après cap sync sur le Mac (pod CapacitorPreferences)

## Notes
- `appId` : `com.antoinerivaud.coachenmuscu` (modifiable avant le premier `cap add`).
- URL de prod du site web : https://v0-gym-workout-tracker-silk.vercel.app (plus
  utilisée par l'app native depuis CM-89).
- `ios/` est généré et versionné (CM-43) ; `android/` sera généré et versionné avec CM-47.
- Android (CM-47) : le routeur iOS n'a pas d'équivalent ici. Le serveur local
  de Capacitor Android devra lui aussi servir `<chemin>.html` (à traiter avec CM-47).

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
