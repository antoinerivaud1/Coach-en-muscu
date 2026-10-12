import { test, expect, type APIResponse, type Page, type Response } from "@playwright/test";

/**
 * CM-89 (PR 3) : outils des smoke tests de l'export natif (`capacitor/www`
 * servi par scripts/serve-native.mjs, qui imite le routeur iOS de la PR 4).
 */

/** Fichier de `capacitor/www` réellement servi (en-tête de serve-native). */
export function servedFile(response: Response | APIResponse | null): string | undefined {
  return response?.headers()["x-native-file"];
}

/** Documents chargés par la page (chargements complets) : `[chemin, fichier servi]`. */
export function trackDocuments(page: Page): Array<[string, string | undefined]> {
  const documents: Array<[string, string | undefined]> = [];
  page.on("response", (response) => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents.push([new URL(response.url()).pathname, servedFile(response)]);
    }
  });
  return documents;
}

function isVercelHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/**
 * Critère de fin de CM-89 : la coque ne charge AUCUN domaine `vercel.app`.
 * Aucun envoi non plus vers le tunnel Sentry `/monitoring` (web seulement).
 * À appeler en tête de fichier : vérifié après chaque test.
 */
export function forbidServerRequests(): void {
  const requests: string[] = [];
  test.beforeEach(({ page }) => {
    requests.length = 0;
    page.on("request", (request) => requests.push(request.url()));
  });
  test.afterEach(() => {
    expect(requests.filter(isVercelHost), "requêtes vers vercel.app").toEqual([]);
    expect(
      requests.filter((url) => url.startsWith("http") && new URL(url).pathname.startsWith("/monitoring")),
      "envois au tunnel Sentry",
    ).toEqual([]);
  });
}
