// Saisie et correction d'une série en séance (CM-63, CM-72) — logique pure,
// sans React ni I/O.
//
// Les mêmes règles servent à la série active et à la correction d'une série
// déjà validée : steppers, pavé numérique, contrôle avant écriture. La fusion
// d'une correction dans l'état de l'écran vit aussi ici, avec la cascade CM-68
// vers la série suivante.

import { resolvePrefill } from "@/lib/utils/prefill";
import { formatWeight } from "@/lib/utils/training";

export type SetField = "weight" | "reps";

/** Valeurs saisissables d'une série, telles qu'affichées (chaînes). */
export type SetDraft = { weight: string; reps: string; isWarmup: boolean };

/** Ligne de série de l'écran de séance, réduite à ce que la correction lit. */
export type EditableRow = {
  id: string | null;
  weight: string;
  reps: string;
  isWarmup: boolean;
  touched: boolean;
};

/**
 * Nouvelle valeur d'un champ après un appui sur un stepper (CM-63). La saisie
 * directe peut contenir une virgule (22,5) : on normalise. Jamais négatif.
 */
export function stepFieldValue(
  current: string,
  field: SetField,
  delta: number,
): string {
  const raw = Number(String(current).replace(",", "."));
  const base = Number.isFinite(raw) ? raw : 0;
  const next = Math.max(0, base + delta);
  return field === "weight" ? formatWeight(next) : String(Math.round(next));
}

/**
 * Valeur retenue après une saisie au pavé numérique (CM-63), `null` si la
 * saisie est rejetée (valeur précédente conservée). Un poids vide est accepté
 * (poids du corps), des reps vides non.
 */
export function parseDirectValue(field: SetField, raw: string): string | null {
  const trimmed = raw.trim();
  if (field === "weight") {
    if (trimmed === "") return "";
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    return formatWeight(n);
  }
  if (trimmed === "") return null;
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(n);
}

export type ParsedSet =
  | { ok: true; weightKg: number; reps: number }
  | { ok: false; error: string };

/**
 * Contrôle d'une série avant écriture, identique pour une validation et une
 * correction : reps > 0 obligatoires, poids vide = 0 kg.
 */
export function parseSetValues(weight: string, reps: string): ParsedSet {
  const r = parseInt(reps, 10);
  if (!(r > 0)) {
    return {
      ok: false,
      error: "Renseigne les répétitions avant de valider la série.",
    };
  }
  const w = weight === "" ? 0 : Number(weight.replace(",", "."));
  if (!Number.isFinite(w) || w < 0) return { ok: false, error: "Poids invalide." };
  return { ok: true, weightKg: w, reps: r };
}

/**
 * Applique la correction d'une série déjà validée (CM-72), repérée par son id.
 *
 * La ligne garde son id et sa place : la base est mise à jour en place, rien
 * n'est supprimé ni recréé. Si la série suivante est encore un simple
 * pré-remplissage (ni validée, ni touchée), elle suit la correction, comme la
 * cascade CM-68 l'aurait fait avec les bonnes valeurs dès le départ. Une
 * valeur saisie à la main n'est jamais écrasée, et un échauffement ne propage
 * jamais vers une série effective.
 *
 * Rend le tableau d'origine si l'id ne désigne aucune série validée.
 */
export function applySetCorrection<T extends EditableRow>(
  rows: T[],
  id: string,
  draft: SetDraft,
): T[] {
  const index = rows.findIndex((r) => r.id === id);
  const row = rows[index];
  if (!row) return rows;

  const out = [...rows];
  out[index] = {
    ...row,
    weight: draft.weight,
    reps: draft.reps,
    isWarmup: draft.isWarmup,
    touched: true,
  };

  const next = out[index + 1];
  if (next && next.id === null && !draft.isWarmup) {
    const resolved = resolvePrefill({
      touched: next.touched,
      current: { weight: next.weight, reps: next.reps },
      previousEffectiveSet: { weight: draft.weight, reps: draft.reps },
      isFirstSet: false,
      firstSetSuggestion: null,
    });
    // Comme en CM-68 : la série cible n'est jamais marquée touched.
    out[index + 1] = { ...next, weight: resolved.weight, reps: resolved.reps };
  }
  return out;
}
