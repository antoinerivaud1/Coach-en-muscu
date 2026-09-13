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
