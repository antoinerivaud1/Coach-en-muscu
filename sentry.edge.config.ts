// CM-95 : Sentry côté edge (middleware).
import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions } from "@/lib/sentry/options";

Sentry.init(baseSentryOptions);
