// CM-95 : Sentry dans le navigateur (et dans la WebView Capacitor, qui charge le site).
// Pas de Session Replay, pas de tracing : erreurs uniquement.
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
