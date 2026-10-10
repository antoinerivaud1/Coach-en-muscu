// CM-60 : export des données du compte (RGPD, droit d'accès et portabilité).
// Mise en forme pure (CSV, JSON, nom de fichier), sans import Next ni
// Supabase : testée dans tests/unit/accountExport.spec.ts. La lecture des
// données est dans lib/queries/accountExport.ts.

import { createZip } from "./zip";

export type ExportSet = {
  id: string;
  set_index: number;
  weight_kg: number | string;
  reps: number;
  rpe: number | string | null;
  is_warmup: boolean;
  created_at: string;
  exercise_id: string;
  exercise_name: string | null;
};

export type ExportSession = {
  id: string;
  performed_at: string;
  duration_seconds: number | null;
  feedback: string | null;
  notes: string | null;
  created_at: string;
  seance_name: string | null;
  sets: ExportSet[];
};

export type ExportSeanceExercise = {
  order_index: number;
  exercise_id: string;
  exercise_name: string | null;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  notes: string | null;
};

export type ExportProgram = {
  id: string;
  name: string;
  created_at: string;
  days: { id: string; name: string; order_index: number; exercises: ExportSeanceExercise[] }[];
};

export type ExportExercise = {
  id: string;
  name: string;
  muscle_group: string;
  is_compound: boolean;
  created_at: string;
};

export type ExportProfile = {
  display_name: string;
  accent_color: string;
  weekly_goal: number;
  avatar_url: string | null;
  created_at: string;
  onboarded_at: string | null;
};

export type AccountExportData = {
  email: string | null;
  profile: ExportProfile | null;
  programs: ExportProgram[];
  sessions: ExportSession[];
  exercises: ExportExercise[];
};

const TZ = "Europe/Paris";

function parisParts(iso: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** « 2026-10-02 12:00 », heure de Paris. */
export function formatExportDateTime(iso: string): string {
  const p = parisParts(iso);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Nom du fichier : coach-en-muscu-export-AAAA-MM-JJ (date de Paris). */
export function exportFileBaseName(now: Date): string {
  const p = parisParts(now.toISOString());
  return `coach-en-muscu-export-${p.year}-${p.month}-${p.day}`;
}

/**
 * Séries dans l'ordre de la séance : exercices dans l'ordre où ils ont été
 * commencés, puis numéro de série.
 */
export function orderSets<T extends Pick<ExportSet, "exercise_id" | "set_index" | "created_at">>(
  sets: readonly T[],
): T[] {
  const byTime = [...sets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const rank = new Map<string, number>();
  for (const x of byTime) if (!rank.has(x.exercise_id)) rank.set(x.exercise_id, rank.size);
  return byTime.sort(
    (a, b) => rank.get(a.exercise_id)! - rank.get(b.exercise_id)! || a.set_index - b.set_index,
  );
}

// ---- CSV ------------------------------------------------------------------------

/**
 * Séparateur « ; » et décimales à la virgule : le fichier s'ouvre tel quel
 * dans Excel, Numbers ou Google Sheets réglés en français.
 */
export const CSV_SEPARATOR = ";";

/** Nombre au format français : 72.5 → « 72,5 », 70 → « 70 ». */
export function formatCsvNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/**
 * Champ texte CSV (RFC 4180) : entre guillemets s'il contient un
 * séparateur, une virgule, un guillemet ou un saut de ligne, guillemets
 * doublés. Un texte qui commence par = + - @ (formule de tableur) est
 * préfixé d'une apostrophe : ouvrir l'export n'exécute jamais rien.
 */
export function csvField(value: string | null | undefined): string {
  let s = value ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;,"\r\n]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const CSV_HEADER = [
  "Date",
  "Séance type",
  "Exercice",
  "Série",
  "Poids (kg)",
  "Répétitions",
  "Échauffement",
] as const;

/**
 * Une ligne par série, séances dans l'ordre chronologique, séries dans
 * l'ordre de la séance (`orderSets`). BOM UTF-8 (accents dans Excel),
 * fins de ligne CRLF.
 */
export function buildSetsCsv(sessions: readonly ExportSession[]): string {
  const lines = [CSV_HEADER.map(csvField).join(CSV_SEPARATOR)];
  const ordered = [...sessions].sort((a, b) => a.performed_at.localeCompare(b.performed_at));
  for (const s of ordered) {
    for (const set of orderSets(s.sets)) {
      lines.push(
        [
          csvField(formatExportDateTime(s.performed_at)),
          csvField(s.seance_name ?? "Sans séance type"),
          csvField(set.exercise_name ?? "Exercice indisponible"),
          String(set.set_index),
          formatCsvNumber(set.weight_kg),
          String(set.reps),
          set.is_warmup ? "oui" : "non",
        ].join(CSV_SEPARATOR),
      );
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ---- JSON -----------------------------------------------------------------------

const num = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

/** Export complet, clés en français, une seule personne (la connectée). */
export function buildExportJson(data: AccountExportData, generatedAt: Date): string {
  const payload = {
    format: "coach-en-muscu-export",
    version: 1,
    genere_le: generatedAt.toISOString(),
    compte: { email: data.email },
    profil: data.profile && {
      prenom: data.profile.display_name,
      couleur: data.profile.accent_color,
      objectif_seances_par_semaine: data.profile.weekly_goal,
      photo: data.profile.avatar_url,
      cree_le: data.profile.created_at,
      onboarding_termine_le: data.profile.onboarded_at,
    },
    seances_types: data.programs.flatMap((p) =>
      [...p.days]
        .sort((a, b) => a.order_index - b.order_index)
        .map((d) => ({
          id: d.id,
          nom: d.name,
          bibliotheque: p.name,
          exercices: [...d.exercises]
            .sort((a, b) => a.order_index - b.order_index)
            .map((e) => ({
              exercice_id: e.exercise_id,
              exercice: e.exercise_name,
              series: e.target_sets,
              repetitions_min: e.target_reps_min,
              repetitions_max: e.target_reps_max,
              repos_secondes: e.rest_seconds,
              notes: e.notes,
            })),
        })),
    ),
    seances: [...data.sessions]
      .sort((a, b) => a.performed_at.localeCompare(b.performed_at))
      .map((s) => ({
        id: s.id,
        date: s.performed_at,
        seance_type: s.seance_name,
        duree_secondes: s.duration_seconds,
        terminee: s.duration_seconds !== null,
        ressenti: s.feedback,
        notes: s.notes,
        series: orderSets(s.sets).map((x) => ({
            id: x.id,
            exercice_id: x.exercise_id,
            exercice: x.exercise_name,
            numero: x.set_index,
            poids_kg: num(x.weight_kg),
            repetitions: x.reps,
            rpe: num(x.rpe),
            echauffement: x.is_warmup,
            enregistree_le: x.created_at,
          })),
      })),
    exercices_perso: data.exercises.map((e) => ({
      id: e.id,
      nom: e.name,
      groupe_musculaire: e.muscle_group,
      polyarticulaire: e.is_compound,
      cree_le: e.created_at,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// ---- Archive ----------------------------------------------------------------------

/** `/profile?export=echec` : l'export a échoué, message dans « Mes données ». */
export const EXPORT_FAILED = "echec";

export const EXPORT_CSV_NAME = "seances-et-series.csv";
export const EXPORT_JSON_NAME = "donnees-completes.json";

/**
 * Heure de Paris « posée » en UTC : les dates des fichiers d'un ZIP n'ont pas
 * de fuseau, les décompresseurs les affichent telles quelles.
 */
function parisWallClock(now: Date): Date {
  const p = parisParts(now.toISOString());
  return new Date(
    Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, now.getUTCSeconds()),
  );
}

/** ZIP de l'export : le CSV (tableur) et le JSON (tout le reste). */
export function buildExportZip(data: AccountExportData, now: Date): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  return createZip(
    [
      { name: EXPORT_CSV_NAME, data: enc.encode(buildSetsCsv(data.sessions)) },
      { name: EXPORT_JSON_NAME, data: enc.encode(buildExportJson(data, now)) },
    ],
    parisWallClock(now),
  );
}
