import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { LEGAL, LEGAL_TODO, TODO_PREFIX, collectTodos, formatPrice, isTodo } from "@/lib/legal";
import { LICENSES } from "@/lib/licenses";
import { frenchTypo } from "@/lib/typo";

// CM-93 : config juridique, typographie et licences.

test.describe("LEGAL_TODO (CM-93)", () => {
  test("liste chaque champ « À COMPLÉTER », avec son chemin", () => {
    const todos = collectTodos({ a: "ok", b: `${TODO_PREFIX}x`, c: [{ d: `${TODO_PREFIX}y` }], n: 3 }, "X");
    expect(todos).toEqual([
      { path: "X.b", label: "x" },
      { path: "X.c[0].d", label: "y" },
    ]);
  });

  test("les champs inconnus de l'éditeur sont signalés", () => {
    const paths = LEGAL_TODO.map((t) => t.path);
    expect(paths).toContain("LEGAL.editor.siret");
    expect(paths).toContain("LEGAL.editor.email");
    expect(paths).not.toContain("LEGAL.editor.name");
  });

  test("isTodo", () => {
    expect(isTodo(`${TODO_PREFIX}siret`)).toBe(true);
    expect(isTodo("Antoine Rivaud")).toBe(false);
    expect(isTodo(42)).toBe(false);
  });
});

test.describe("formatPrice (CM-93)", () => {
  test("virgule décimale et espace insécable avant €", () => {
    expect(formatPrice(399)).toBe("3,99 €");
    expect(formatPrice(2499)).toBe("24,99 €");
    expect(formatPrice(LEGAL.pricing.monthlyCents)).toMatch(/^\d+,\d{2} €$/);
  });
});

test.describe("frenchTypo (CM-93)", () => {
  test("espaces insécables avant la ponctuation haute et dans les guillemets", () => {
    expect(frenchTypo("Note : ok ; oui ? non !")).toBe("Note : ok ; oui ? non !");
    expect(frenchTypo("« Annuler »")).toBe("« Annuler »");
  });

  test("nombre et unité insécables, URL intactes", () => {
    expect(frenchTypo("3,99 € par mois, 24 heures, 7 jours")).toBe(
      "3,99 € par mois, 24 heures, 7 jours",
    );
    expect(frenchTypo("https://www.cnil.fr")).toBe("https://www.cnil.fr");
  });

  test("apostrophe typographique entre deux lettres", () => {
    expect(frenchTypo("l'éditeur d'app")).toBe("l\u2019éditeur d\u2019app");
  });
});

test.describe("Licences (CM-93)", () => {
  test("react-body-highlighter : texte identique au fichier LICENSE installé", () => {
    const installed = readFileSync(
      join(process.cwd(), "node_modules/react-body-highlighter/LICENSE"),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();
    const shown = LICENSES.find((l) => l.id === "react-body-highlighter");
    expect(shown?.text).toBe(installed);
  });

  test("polices sous SIL OFL 1.1", () => {
    for (const id of ["archivo", "oswald"]) {
      const l = LICENSES.find((x) => x.id === id);
      expect(l?.text).toContain("SIL OPEN FONT LICENSE Version 1.1");
    }
  });
});
