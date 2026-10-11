// CM-95 : options Sentry communes au navigateur, au serveur Node et à l'edge.
//
// Règles :
// - Sans DSN (dev local, CI, previews non configurées), Sentry est entièrement
//   désactivé : `enabled: false`, aucun envoi, rien ne casse.
// - Erreurs uniquement : pas de tracing (tracesSampleRate 0), pas de Session Replay.
// - Pas de données personnelles : sendDefaultPii false, et `scrubEvent` retire
//   l'utilisateur, les cookies, les en-têtes et la query string avant envoi.
import type { ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development"
  );
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  // L'IP n'est jamais envoyée par le SDK, mais Sentry la déduit à la réception :
  // le réglage « Prevent Storing of IP Addresses » du projet Sentry doit être actif.
  delete event.user;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  return event;
}

export const baseSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: sentryEnvironment(),
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};
