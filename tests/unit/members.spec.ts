import { test, expect } from "@playwright/test";
import {
  DEFAULT_MEMBER_COLOR,
  MEMBER_COLORS,
  deName,
  initialPickerColor,
  isMemberColor,
  memberAccent,
  memberColorLabel,
  partnerColorConflict,
  sessionExerciseLabel,
  takenPartnerColor,
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

test.describe("memberAccent (CM-86, CM-103 : sans color_role)", () => {
  test("renvoie accent_color quand elle est valide", () => {
    expect(memberAccent({ accent_color: "#A78BFA" })).toBe("#A78BFA");
    expect(memberAccent({ accent_color: "#FFD23F" })).toBe("#FFD23F");
    expect(memberAccent({ accent_color: "#FF4F7E" })).toBe("#FF4F7E");
  });

  test("repli sur DEFAULT_MEMBER_COLOR si accent_color est absente ou invalide", () => {
    expect(memberAccent({})).toBe(DEFAULT_MEMBER_COLOR);
    expect(memberAccent({ accent_color: null })).toBe(DEFAULT_MEMBER_COLOR);
    expect(memberAccent({ accent_color: "" })).toBe(DEFAULT_MEMBER_COLOR);
    expect(memberAccent({ accent_color: "#123456" })).toBe(DEFAULT_MEMBER_COLOR);
  });

  test("un ancien color_role qui traînerait sur l'objet est ignoré", () => {
    const legacy = { accent_color: null, color_role: "elle" } as { accent_color: null };
    expect(memberAccent(legacy)).toBe("#2FE6FF");
  });
});

test.describe("memberColorLabel (CM-103)", () => {
  test("libellé de la palette, vide sinon", () => {
    expect(memberColorLabel("#FF4F7E")).toBe("Rose");
    expect(memberColorLabel("#000000")).toBe("");
    expect(memberColorLabel(null)).toBe("");
  });
});

test.describe("deName (CM-103)", () => {
  test("élision devant voyelle ou h, apostrophe typographique", () => {
    expect(deName("Lina")).toBe("de Lina");
    expect(deName("Antoine")).toBe("d\u2019Antoine");
    expect(deName("Élodie")).toBe("d\u2019Élodie");
    expect(deName("Hugo")).toBe("d\u2019Hugo");
    expect(deName("  Théo ")).toBe("de Théo");
  });

  test("prénom vide : « de ton partenaire »", () => {
    expect(deName("")).toBe("de ton partenaire");
    expect(deName(null)).toBe("de ton partenaire");
  });
});

test.describe("Couleur unique dans le duo (CM-103)", () => {
  const lina = { name: "Lina", color: "#FF4F7E" };

  test("la couleur du partenaire est refusée, avec son prénom", () => {
    expect(partnerColorConflict("#FF4F7E", lina)).toBe(
      "C\u2019est la couleur de Lina\u00a0: choisis-en une autre.",
    );
    expect(partnerColorConflict("#FF4F7E", { name: "Antoine", color: "#FF4F7E" })).toContain(
      "d\u2019Antoine",
    );
  });

  test("toute autre couleur est acceptée", () => {
    for (const c of MEMBER_COLORS) {
      if (c.value === lina.color) continue;
      expect(partnerColorConflict(c.value, lina)).toBeNull();
    }
  });

  test("solo ou partenaire illisible : aucune restriction", () => {
    for (const c of MEMBER_COLORS) {
      expect(partnerColorConflict(c.value, null)).toBeNull();
      expect(partnerColorConflict(c.value, undefined)).toBeNull();
      expect(partnerColorConflict(c.value, { name: "", color: "" })).toBeNull();
    }
    expect(takenPartnerColor({ name: "X", color: "#123456" })).toBeNull();
    expect(takenPartnerColor(lina)).toBe("#FF4F7E");
  });

  test("couleur de départ du sélecteur : jamais celle du partenaire", () => {
    expect(initialPickerColor("#A78BFA", lina)).toBe("#A78BFA");
    expect(initialPickerColor("#FF4F7E", lina)).toBe("#2FE6FF");
    expect(initialPickerColor("#2FE6FF", { name: "Théo", color: "#2FE6FF" })).toBe("#FF4F7E");
    expect(initialPickerColor(null, { name: "Théo", color: "#2FE6FF" })).toBe("#FF4F7E");
    expect(initialPickerColor("#FF4F7E", null)).toBe("#FF4F7E");
  });
});

test.describe("sessionExerciseLabel (CM-103)", () => {
  test("nom lu : affiché tel quel", () => {
    expect(sessionExerciseLabel("Squat barre", { isMine: false, name: "Lina" })).toBe("Squat barre");
  });

  test("exercice illisible sur la séance du partenaire : « Exercice personnel de <prénom> »", () => {
    expect(sessionExerciseLabel(undefined, { isMine: false, name: "Lina" })).toBe(
      "Exercice personnel de Lina",
    );
    expect(sessionExerciseLabel("", { isMine: false, name: "Antoine" })).toBe(
      "Exercice personnel d\u2019Antoine",
    );
    expect(sessionExerciseLabel(null, { isMine: false, name: "" })).toBe(
      "Exercice personnel de ton partenaire",
    );
  });

  test("sur ma propre séance : « Exercice » (repli inchangé)", () => {
    expect(sessionExerciseLabel(undefined, { isMine: true, name: "Théo" })).toBe("Exercice");
  });
});
