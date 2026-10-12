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
 * Garde-fou de CHAQUE spec native, vérifié après chaque test. Le serveur
 * statique ne doit masquer aucun appel serveur :
 * - aucune requête vers `vercel.app` (critère de fin de CM-89) ni vers le
 *   tunnel Sentry `/monitoring` (web seulement) ;
 * - aucune réponse de la même origine en erreur (>= 400 : fichier absent
 *   de l'export, 405 pour un POST qu'un serveur aurait accepté) ;
 * - aucune requête de la même origine qui ne soit pas un chargement de
 *   document et que le routeur ait servie par `index.html` faute de fichier
 *   (`X-Native-Fallback`) : un appel serveur (API, server action) passerait
 *   sinon pour un succès.
 * À appeler en tête de fichier.
 */
export function guardNativeRequests(): void {
  const requests: string[] = [];
  const problems: string[] = [];
  test.beforeEach(({ page, baseURL }) => {
    requests.length = 0;
    problems.length = 0;
    const origin = new URL(baseURL ?? "http://localhost:4300").origin;
    page.on("request", (request) => requests.push(request.url()));
    page.on("response", (response) => {
      const request = response.request();
      let url: URL;
      try {
        url = new URL(response.url());
      } catch {
        return;
      }
      if (url.origin !== origin) return;
      const label = `${request.method()} ${url.pathname}${url.search}`;
      if (response.status() >= 400) problems.push(`${response.status()} ${label}`);
      const isDocument = request.isNavigationRequest() && request.resourceType() === "document";
      if (response.headers()["x-native-fallback"] === "1" && !isDocument) {
        problems.push(`servi par index.html (repli) : ${label}`);
      }
    });
  });
  test.afterEach(() => {
    expect(requests.filter(isVercelHost), "requêtes vers vercel.app").toEqual([]);
    expect(
      requests.filter((url) => url.startsWith("http") && new URL(url).pathname.startsWith("/monitoring")),
      "envois au tunnel Sentry",
    ).toEqual([]);
    expect(problems, "requêtes de la même origine refusées ou servies par le repli").toEqual([]);
  });
}
