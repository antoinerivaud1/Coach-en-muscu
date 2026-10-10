import { test, expect } from "@playwright/test";
import {
  DEFAULT_MEMBER_COLOR,
  MEMBER_COLORS,
  isMemberColor,
  memberAccent,
} from "@/lib/members";

// Tests unitaires purs (CM-86 socle) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test.describe("MEMBER_COLORS (CM-86)", () => {
  test("les 6 couleurs validées, dans l'ordre, avec leur libellé", () => {
    expect(MEMBER_COLORS.map((c) => [c.value, c.label])).toEqual([
      ["#2FE6FF", "Cyan"],
      ["#FF4F7E", "Rose"],
      ["#FF8A3D", "Orange"],
      ["#A78BFA", "Violet"],
      ["#5B8CFF", "Bleu"],
      ["#FFD23F", "Jaune"],
    ]);
  });

  test("la couleur par défaut est le cyan (défaut de la colonne)", () => {
    expect(DEFAULT_MEMBER_COLOR).toBe("#2FE6FF");
  });
});

test.describe("isMemberColor (CM-86)", () => {
  test("accepte chacune des 6 couleurs", () => {
    for (const c of MEMBER_COLORS) expect(isMemberColor(c.value)).toBe(true);
  });

  test("refuse une couleur hors palette, une casse différente et les non-chaînes", () => {
    expect(isMemberColor("#000000")).toBe(false);
    expect(isMemberColor("#2fe6ff")).toBe(false);
    expect(isMemberColor("2FE6FF")).toBe(false);
    expect(isMemberColor("")).toBe(false);
    expect(isMemberColor(null)).toBe(false);
    expect(isMemberColor(undefined)).toBe(false);
    expect(isMemberColor(42)).toBe(false);
  });
});

test.describe("memberAccent (CM-86)", () => {
  test("renvoie accent_color quand elle est valide, quel que soit color_role", () => {
    expect(memberAccent({ accent_color: "#A78BFA", color_role: "toi" })).toBe("#A78BFA");
    expect(memberAccent({ accent_color: "#FFD23F", color_role: "elle" })).toBe("#FFD23F");
    expect(memberAccent({ accent_color: "#2FE6FF", color_role: "elle" })).toBe("#2FE6FF");
  });

  test("repli sur color_role si accent_color est absente ou invalide", () => {
    expect(memberAccent({ color_role: "elle" })).toBe("#FF4F7E");
    expect(memberAccent({ accent_color: null, color_role: "elle" })).toBe("#FF4F7E");
    expect(memberAccent({ accent_color: "#123456", color_role: "elle" })).toBe("#FF4F7E");
    expect(memberAccent({ accent_color: "#123456", color_role: "toi" })).toBe("#2FE6FF");
  });

  test("cyan sans aucune information", () => {
    expect(memberAccent({})).toBe("#2FE6FF");
    expect(memberAccent({ accent_color: null, color_role: null })).toBe("#2FE6FF");
  });
});
