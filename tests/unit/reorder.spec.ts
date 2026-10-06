import { test, expect } from "@playwright/test";
import { moveItem, moveItemByKey, withOrderIndex } from "@/lib/utils/reorder";

// Tests unitaires purs (CM-71) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

const LIST: string[] = ["Développé couché", "Rowing barre", "Squat"];

test.describe("moveItem (CM-71)", () => {
  test("monte un élément d'un cran", () => {
    expect(moveItem(LIST, 2, "up")).toEqual([
      "Développé couché",
      "Squat",
      "Rowing barre",
    ]);
  });

  test("descend un élément d'un cran", () => {
    expect(moveItem(LIST, 0, "down")).toEqual([
      "Rowing barre",
      "Développé couché",
      "Squat",
    ]);
  });

  test("ne mute jamais la liste d'origine", () => {
    const source = [...LIST];
    moveItem(source, 1, "up");
    expect(source).toEqual([...LIST]);
  });

  test("en butée : renvoie la même référence (premier vers le haut, dernier vers le bas)", () => {
    expect(moveItem(LIST, 0, "up")).toBe(LIST);
    expect(moveItem(LIST, LIST.length - 1, "down")).toBe(LIST);
  });

  test("index invalide : renvoie la même référence", () => {
    for (const from of [-1, LIST.length, 1.5, Number.NaN]) {
      expect(moveItem(LIST, from, "up")).toBe(LIST);
      expect(moveItem(LIST, from, "down")).toBe(LIST);
    }
  });

  test("liste vide ou à un seul élément : rien ne bouge", () => {
    const empty: string[] = [];
    expect(moveItem(empty, 0, "down")).toBe(empty);
    const single = ["Squat"];
    expect(moveItem(single, 0, "up")).toBe(single);
    expect(moveItem(single, 0, "down")).toBe(single);
  });

  test("descendre puis remonter revient à l'ordre initial", () => {
    expect(moveItem(moveItem(LIST, 0, "down"), 1, "up")).toEqual([...LIST]);
  });
});

test.describe("moveItemByKey (CM-71)", () => {
  const exercises = [
    { exerciseId: "a", name: "Développé couché" },
    { exerciseId: "b", name: "Rowing barre" },
    { exerciseId: "c", name: "Squat" },
  ];
  const key = (e: { exerciseId: string }) => e.exerciseId;

  test("déplace l'élément désigné par sa clé", () => {
    expect(moveItemByKey(exercises, key, "c", "up").map(key)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("deux taps rapides sur le même exercice le déplacent de deux crans", () => {
    const once = moveItemByKey(exercises, key, "a", "down");
    const twice = moveItemByKey(once, key, "a", "down");
    expect(twice.map(key)).toEqual(["b", "c", "a"]);
  });

  test("clé inconnue : renvoie la même référence", () => {
    expect(moveItemByKey(exercises, key, "z", "up")).toBe(exercises);
  });
});

test.describe("withOrderIndex (CM-71)", () => {
  test("numérote de 0 à n-1 dans l'ordre de la liste", () => {
    const reordered = moveItem(LIST, 2, "up").map((name) => ({ name }));
    expect(withOrderIndex(reordered)).toEqual([
      { name: "Développé couché", order_index: 0 },
      { name: "Squat", order_index: 1 },
      { name: "Rowing barre", order_index: 2 },
    ]);
  });

  test("écrase un order_index existant (trous ou doublons hérités)", () => {
    const legacy = [
      { id: "x", order_index: 0 },
      { id: "y", order_index: 0 },
      { id: "z", order_index: 7 },
    ];
    expect(withOrderIndex(legacy).map((r) => r.order_index)).toEqual([0, 1, 2]);
  });

  test("liste vide : tableau vide", () => {
    expect(withOrderIndex([])).toEqual([]);
  });
});
