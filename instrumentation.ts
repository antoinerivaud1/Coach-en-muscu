// CM-95 : point d'entrée Next pour initialiser Sentry selon le runtime.
// `onRequestError` remonte les erreurs des server components, server actions et
// route handlers (Next 15).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
