import { test, expect } from "@playwright/test";
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  THEME_BACKGROUND,
  THEME_BOOT_SCRIPT,
  appearanceLabel,
  inDarkWindow,
  minutesOf,
  parseAppearance,
  resolveTheme,
  type Appearance,
} from "@/lib/appearance";

// CM-116 : réglage Apparence (Automatique, Clair, Sombre, Selon l'heure).
// Lancer : npm run test:unit

const at = (h: number, m = 0) => new Date(2026, 9, 17, h, m);
const time = (darkFrom = "19:00", lightFrom = "07:00"): Appearance => ({ mode: "time", darkFrom, lightFrom });

test.describe("parseAppearance", () => {
  test("rien ou illisible : réglage par défaut (Automatique, 19 h à 7 h)", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("pas du json")).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE).toEqual({ mode: "auto", darkFrom: "19:00", lightFrom: "07:00" });
  });

  test("garde un réglage valide, remplace champ par champ ce qui est invalide", () => {
    expect(parseAppearance(JSON.stringify({ mode: "time", darkFrom: "20:30", lightFrom: "06:15" }))).toEqual({
      mode: "time",
      darkFrom: "20:30",
      lightFrom: "06:15",
    });
    expect(parseAppearance(JSON.stringify({ mode: "nuit", darkFrom: "25:00", lightFrom: 7 }))).toEqual(DEFAULT_APPEARANCE);
  });
});

test.describe("minutesOf", () => {
  test("lit HH:MM, refuse le reste", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("19:30")).toBe(1170);
    expect(minutesOf("24:00")).toBeNull();
    expect(minutesOf("7:00")).toBeNull();
  });
});

test.describe("resolveTheme", () => {
  test("Automatique suit l'appareil", () => {
    expect(resolveTheme(DEFAULT_APPEARANCE, at(12), true)).toBe("dark");
    expect(resolveTheme(DEFAULT_APPEARANCE, at(12), false)).toBe("light");
  });

  test("Clair et Sombre ignorent l'appareil et l'heure", () => {
    expect(resolveTheme({ ...DEFAULT_APPEARANCE, mode: "light" }, at(23), true)).toBe("light");
    expect(resolveTheme({ ...DEFAULT_APPEARANCE, mode: "dark" }, at(12), false)).toBe("dark");
  });

  test("Selon l'heure : plage qui traverse minuit (19 h à 7 h)", () => {
    expect(resolveTheme(time(), at(18, 59), true)).toBe("light");
    expect(resolveTheme(time(), at(19, 0), false)).toBe("dark");
    expect(resolveTheme(time(), at(2), false)).toBe("dark");
    expect(resolveTheme(time(), at(6, 59), false)).toBe("dark");
    expect(resolveTheme(time(), at(7, 0), true)).toBe("light");
  });

  test("Selon l'heure : plage dans la même journée, et plage vide", () => {
    expect(inDarkWindow(time("13:00", "15:00"), at(14))).toBe(true);
    expect(inDarkWindow(time("13:00", "15:00"), at(15))).toBe(false);
    expect(inDarkWindow(time("08:00", "08:00"), at(8))).toBe(false);
  });
});

test.describe("appearanceLabel", () => {
  test("libellés de la ligne Profil", () => {
    expect(appearanceLabel(DEFAULT_APPEARANCE)).toBe("Automatique");
    expect(appearanceLabel({ ...DEFAULT_APPEARANCE, mode: "dark" })).toBe("Sombre");
    expect(appearanceLabel(time())).toBe("Sombre de 19 h à 7 h");
    expect(appearanceLabel(time("20:30", "06:00"))).toBe("Sombre de 20 h 30 à 6 h");
  });
});

/**
 * Exécute le script de <head> dans un faux navigateur et rend le thème posé et
 * la couleur de barre d'état.
 */
function runBootScript(stored: string | null, systemDark: boolean, now: Date) {
  const attrs: Record<string, string> = {};
  const metaAttrs: Record<string, string> = { content: "", media: "x" };
  const meta = {
    setAttribute: (k: string, v: string) => (metaAttrs[k] = v),
    removeAttribute: (k: string) => delete metaAttrs[k],
  };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(now.getTime());
      else super(...(args as [number]));
    }
  }
  const window = {
    localStorage: { getItem: (k: string) => (k === APPEARANCE_KEY ? stored : null) },
    matchMedia: () => ({ matches: systemDark }),
  };
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
    querySelectorAll: () => [meta],
  };
  new Function("window", "document", "Date", THEME_BOOT_SCRIPT)(window, document, FakeDate);
  return { theme: attrs["data-theme"], color: metaAttrs.content, media: metaAttrs.media };
}

test.describe("THEME_BOOT_SCRIPT", () => {
  const cases: [string | null, boolean, Date][] = [
    [null, true, at(12)],
    [null, false, at(12)],
    [JSON.stringify({ mode: "light" }), true, at(23)],
    [JSON.stringify({ mode: "dark" }), false, at(9)],
    [JSON.stringify({ mode: "time" }), false, at(21)],
    [JSON.stringify({ mode: "time" }), true, at(10)],
    [JSON.stringify({ mode: "time", darkFrom: "13:00", lightFrom: "15:00" }), false, at(14)],
    ["{cassé", true, at(10)],
  ];

  test("donne le même thème que resolveTheme, et la couleur de fond du thème", () => {
    for (const [stored, systemDark, now] of cases) {
      const expected = resolveTheme(parseAppearance(stored), now, systemDark);
      const got = runBootScript(stored, systemDark, now);
      expect(got.theme, `${stored} / ${systemDark} / ${now.toTimeString()}`).toBe(expected);
      expect(got.color).toBe(THEME_BACKGROUND[expected]);
    }
  });
});
