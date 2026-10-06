import { test, expect } from "@playwright/test";
import {
  applySetCorrection,
  parseDirectValue,
  parseSetValues,
  stepFieldValue,
  type EditableRow,
} from "@/lib/utils/setEdit";

// Tests unitaires purs (CM-63, CM-72) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

type Row = EditableRow & { setIndex: number | null };

function done(id: string, setIndex: number, weight: string, reps: string): Row {
  return { id, setIndex, weight, reps, isWarmup: false, touched: true };
}

function upcoming(weight = "", reps = "", touched = false): Row {
  return { id: null, setIndex: null, weight, reps, isWarmup: false, touched };
}

// ----- Steppers et pavé numérique (CM-63) -----

test("stepper poids : pas de 2,5 kg, virgule acceptée, jamais négatif", () => {
  expect(stepFieldValue("20", "weight", 2.5)).toBe("22.5");
  expect(stepFieldValue("22,5", "weight", 1)).toBe("23.5");
  expect(stepFieldValue("1", "weight", -2.5)).toBe("0");
  expect(stepFieldValue("", "weight", 1)).toBe("1");
});

test("stepper reps : entier, jamais négatif", () => {
  expect(stepFieldValue("8", "reps", 1)).toBe("9");
  expect(stepFieldValue("0", "reps", -1)).toBe("0");
});

test("pavé numérique : poids vide accepté, reps vides refusées", () => {
  expect(parseDirectValue("weight", " 42,5 ")).toBe("42.5");
  expect(parseDirectValue("weight", "")).toBe("");
  expect(parseDirectValue("weight", "abc")).toBeNull();
  expect(parseDirectValue("weight", "-5")).toBeNull();
  expect(parseDirectValue("reps", "10")).toBe("10");
  expect(parseDirectValue("reps", "")).toBeNull();
});

test("contrôle avant écriture : reps obligatoires, poids vide = 0 kg", () => {
  expect(parseSetValues("", "8")).toEqual({ ok: true, weightKg: 0, reps: 8 });
  expect(parseSetValues("22,5", "8")).toEqual({
    ok: true,
    weightKg: 22.5,
    reps: 8,
  });
  expect(parseSetValues("20", "0").ok).toBe(false);
  expect(parseSetValues("20", "").ok).toBe(false);
});

// ----- Correction d'une série validée (CM-72) -----

test("CM-72 : la correction modifie la série en place, même id, même index", () => {
  const rows = [done("a", 1, "60", "8"), done("b", 2, "60", "8"), upcoming()];
  const out = applySetCorrection(rows, "a", {
    weight: "62.5",
    reps: "6",
    isWarmup: false,
  });
  expect(out).toHaveLength(3);
  expect(out[0]).toEqual({
    id: "a",
    setIndex: 1,
    weight: "62.5",
    reps: "6",
    isWarmup: false,
    touched: true,
  });
  // La série suivante est validée : elle ne bouge pas.
  expect(out[1]).toEqual(rows[1]);
  expect(out[2]).toEqual(rows[2]);
  // Pas de mutation de l'état d'origine.
  expect(rows[0]!.weight).toBe("60");
});

test("CM-72 + CM-68 : la série active pré-remplie suit la correction", () => {
  // Série 1 validée à 60 × 8, série 2 pré-remplie par la cascade.
  const rows = [done("a", 1, "60", "8"), upcoming("60", "8"), upcoming()];
  const out = applySetCorrection(rows, "a", {
    weight: "70",
    reps: "5",
    isWarmup: false,
  });
  expect(out[1]).toEqual(upcoming("70", "5"));
  // Seule la série suivante immédiate est concernée, comme en CM-68.
  expect(out[2]).toEqual(upcoming());
});

test("CM-72 : une série active déjà touchée n'est jamais écrasée", () => {
  const rows = [done("a", 1, "60", "8"), upcoming("65", "6", true)];
  const out = applySetCorrection(rows, "a", {
    weight: "70",
    reps: "5",
    isWarmup: false,
  });
  expect(out[1]).toEqual(rows[1]);
});

test("CM-72 : un échauffement corrigé ne propage pas vers la série suivante", () => {
  const rows = [done("a", 1, "20", "12"), upcoming("20", "12")];
  const out = applySetCorrection(rows, "a", {
    weight: "30",
    reps: "10",
    isWarmup: true,
  });
  expect(out[0]!.isWarmup).toBe(true);
  expect(out[1]).toEqual(rows[1]);
});

test("CM-72 : un id inconnu laisse les séries intactes", () => {
  const rows = [done("a", 1, "60", "8"), upcoming()];
  const out = applySetCorrection(rows, "zzz", {
    weight: "70",
    reps: "5",
    isWarmup: false,
  });
  expect(out).toBe(rows);
});
