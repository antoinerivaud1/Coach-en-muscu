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
npx cap add ios
npx cap add android
npx cap sync
```

## Lancer / builder
```bash
# iOS : ouvre Xcode, choisir un device/simulateur, Run
npm run cap:ios
# Android : ouvre Android Studio, Run
npm run cap:android
# Après tout changement de config/plugins :
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
- Les dossiers `ios/` et `android/` sont générés par `cap add` sur ta machine ; tu peux les committer ensuite si tu veux les versionner.
