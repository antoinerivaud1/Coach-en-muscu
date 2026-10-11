// CM-95 : Sentry côté serveur Node (server components, server actions, route handlers).
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);
