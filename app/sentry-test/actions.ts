"use server";

// CM-95 : server action qui plante exprès, pour vérifier la remontée Sentry côté serveur.
export async function throwServerActionError(): Promise<void> {
  if (process.env.SENTRY_TEST_PAGE !== "1") return;
  throw new Error("CM-95 : erreur volontaire côté server action");
}
