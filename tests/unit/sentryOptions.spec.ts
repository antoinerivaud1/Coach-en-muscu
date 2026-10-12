import { test, expect } from "@playwright/test";
import { sentryEnvironment } from "@/lib/sentry/options";

// CM-89 (PR 3) : environnement Sentry de l'app native. Tests purs.

const KEYS = ["NEXT_PUBLIC_BUILD_TARGET", "NEXT_PUBLIC_VERCEL_ENV", "VERCEL_ENV"] as const;

test.describe("sentryEnvironment (CM-89 PR 3)", () => {
  const saved: Record<string, string | undefined> = {};
  test.beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  test.afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("build natif : « native », même si un environnement Vercel traîne", () => {
    process.env.NEXT_PUBLIC_BUILD_TARGET = "native";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    expect(sentryEnvironment()).toBe("native");
  });

  test("build web : environnement Vercel, inchangé", () => {
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    expect(sentryEnvironment()).toBe("preview");
  });
});
