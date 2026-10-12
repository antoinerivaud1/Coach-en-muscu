import { test, expect } from "@playwright/test";
import { inviteJoinPath } from "@/lib/duo";
import { PROD_WEB_ORIGIN, normalizeOrigin, publicSiteOrigin, resolveSiteOrigin } from "@/lib/siteUrl";

// CM-89 (PR 4) : origine publique des liens partagés (invitation duo). Dans
// l'app native, l'origine de la page est `capacitor://localhost`.

test.describe("Origine publique du site (CM-89 (PR 4))", () => {
  test("normalizeOrigin : origine seule, sans chemin ni « / » final", () => {
    expect(normalizeOrigin("https://coach.exemple.fr/")).toBe("https://coach.exemple.fr");
    expect(normalizeOrigin("  https://coach.exemple.fr/duo?x=1  ")).toBe("https://coach.exemple.fr");
    expect(normalizeOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  test("normalizeOrigin : vide, invalide ou autre protocole ignorés", () => {
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("   ")).toBeNull();
    expect(normalizeOrigin("pas une url")).toBeNull();
    expect(normalizeOrigin("capacitor://localhost")).toBeNull();
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
  });

  test("NEXT_PUBLIC_SITE_URL l'emporte, web comme natif", () => {
    const configured = "https://coach.exemple.fr/";
    expect(resolveSiteOrigin({ configured, native: false, currentOrigin: "https://preview.vercel.app" })).toBe(
      "https://coach.exemple.fr",
    );
    expect(resolveSiteOrigin({ configured, native: true, currentOrigin: "capacitor://localhost" })).toBe(
      "https://coach.exemple.fr",
    );
  });

  test("natif sans variable : site de prod, jamais capacitor://localhost", () => {
    expect(resolveSiteOrigin({ native: true, currentOrigin: "capacitor://localhost" })).toBe(PROD_WEB_ORIGIN);
    expect(resolveSiteOrigin({ configured: "invalide", native: true, currentOrigin: "capacitor://localhost" })).toBe(
      PROD_WEB_ORIGIN,
    );
  });

  test("web sans variable : origine de la page, comme avant", () => {
    expect(resolveSiteOrigin({ native: false, currentOrigin: "http://localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveSiteOrigin({ native: false, currentOrigin: null })).toBe(PROD_WEB_ORIGIN);
  });

  test("lien d'invitation : origine https et chemin d'invitation", () => {
    const url = `${resolveSiteOrigin({ native: true, currentOrigin: "capacitor://localhost" })}${inviteJoinPath("K7QM4P")}`;
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toContain("K7QM4P");
  });

  test("publicSiteOrigin hors navigateur (Node) : origine http(s) valide", () => {
    expect(normalizeOrigin(publicSiteOrigin())).toBe(publicSiteOrigin());
  });
});
