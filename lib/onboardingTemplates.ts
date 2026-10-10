/**
 * CM-86 : modèles de séances proposés à l'onboarding (« Par quoi tu
 * commences ? »). Un tap ajoute toutes les séances du modèle à la
 * bibliothèque PERSO de l'utilisateur.
 *
 * Les exercices sont désignés par leur NOM d'exercice système (catalogue
 * commun, `duo_id` et `owner_profile_id` null) et résolus en base au moment de
 * l'ajout : les uuid du catalogue prod ne sont pas tous connus du code, les
 * noms si (ce sont les clés de `EXERCISE_GUIDES`). Un nom introuvable est
 * ignoré à l'ajout plutôt que de bloquer l'utilisateur.
 *
 * Module pur, testé dans tests/unit/onboardingTemplates.spec.ts : chaque nom
 * existe dans le catalogue système, et chaque séance garde assez d'exercices
 * présents dans supabase/seed.sql pour la CI.
 */

import { exerciseKey } from "@/lib/exerciseKey";

export type TemplateExercise = {
  /** Nom exact de l'exercice système. */
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};

export type TemplateSeance = {
  name: string;
  exercises: readonly TemplateExercise[];
};

export type SeanceTemplate = {
  id: "ppl" | "haut-bas" | "full-body";
  /** Titre de la carte. */
  label: string;
  seances: readonly TemplateSeance[];
};

// Prescriptions : polyarticulaire lourd, polyarticulaire secondaire, isolation.
const heavy = (name: string): TemplateExercise => ({
  name,
  sets: 4,
  repsMin: 6,
  repsMax: 8,
  restSeconds: 150,
});
const main = (name: string): TemplateExercise => ({
  name,
  sets: 3,
  repsMin: 8,
  repsMax: 12,
  restSeconds: 90,
});
const iso = (name: string): TemplateExercise => ({
  name,
  sets: 3,
  repsMin: 10,
  repsMax: 15,
  restSeconds: 60,
});

export const SEANCE_TEMPLATES: readonly SeanceTemplate[] = [
  {
    id: "ppl",
    label: "Push · Pull · Jambes",
    seances: [
      {
        name: "Push",
        exercises: [
          heavy("Développé couché barre"),
          main("Développé incliné haltères"),
          main("Développé militaire barre"),
          iso("Élévations latérales haltères"),
          main("Dips"),
          iso("Extension corde poulie"),
        ],
      },
      {
        name: "Pull",
        exercises: [
          main("Tirage vertical poulie"),
          heavy("Rowing barre"),
          main("Tirage horizontal poulie"),
          iso("Face pull"),
          iso("Curl haltères"),
          iso("Curl marteau"),
        ],
      },
      {
        name: "Jambes",
        exercises: [
          heavy("Squat barre"),
          main("Soulevé de terre roumain"),
          main("Presse à cuisses"),
          main("Hip thrust"),
          iso("Leg curl assis"),
          iso("Mollets debout"),
        ],
      },
    ],
  },
  {
    id: "haut-bas",
    label: "Haut · Bas",
    seances: [
      {
        name: "Haut du corps",
        exercises: [
          heavy("Développé couché barre"),
          main("Tirage vertical poulie"),
          main("Développé militaire barre"),
          main("Rowing barre"),
          iso("Curl haltères"),
          iso("Extension corde poulie"),
        ],
      },
      {
        name: "Bas du corps",
        exercises: [
          heavy("Squat barre"),
          main("Soulevé de terre roumain"),
          main("Hip thrust"),
          main("Fentes haltères"),
          iso("Leg curl assis"),
          iso("Mollets debout"),
        ],
      },
    ],
  },
  {
    id: "full-body",
    label: "Full body",
    seances: [
      {
        name: "Corps entier",
        exercises: [
          heavy("Squat barre"),
          main("Développé couché barre"),
          main("Rowing barre"),
          main("Développé militaire barre"),
          main("Soulevé de terre roumain"),
          main("Tirage vertical poulie"),
          iso("Planche"),
        ],
      },
    ],
  },
];

export function findTemplate(id: unknown): SeanceTemplate | null {
  return SEANCE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** « 3 séances · 6 exercices chacune », « 1 séance · 7 exercices ». */
export function templateMeta(template: SeanceTemplate): string {
  const n = template.seances.length;
  const counts = template.seances.map((s) => s.exercises.length);
  const same = counts.every((c) => c === counts[0]);
  const seances = `${n} séance${n > 1 ? "s" : ""}`;
  if (n === 1) {
    const c = counts[0] ?? 0;
    return `${seances} · ${c} exercice${c > 1 ? "s" : ""}`;
  }
  if (same) {
    const c = counts[0] ?? 0;
    return `${seances} · ${c} exercice${c > 1 ? "s" : ""} chacune`;
  }
  return seances;
}

/**
 * Nom libre pour une séance du modèle : si « Push » est déjà pris dans la
 * bibliothèque, « Push 2 », puis « Push 3 »… (comparaison insensible à la
 * casse et aux accents : au moins aussi stricte que `validateSeanceName`).
 */
export function uniqueSeanceName(base: string, taken: readonly string[]): string {
  const keys = new Set(taken.map((n) => exerciseKey(n)));
  if (!keys.has(exerciseKey(base))) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} ${i}`;
    if (!keys.has(exerciseKey(candidate))) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/**
 * Durée indicative d'une séance, en minutes arrondies à 5 : chaque série
 * compte ~45 s d'effort plus le repos prévu, plus 5 min de mise en route.
 */
export function estimateSeanceMinutes(
  exercises: readonly { target_sets: number; rest_seconds: number }[],
): number {
  if (exercises.length === 0) return 0;
  const seconds = exercises.reduce(
    (sum, e) => sum + Math.max(0, e.target_sets) * (45 + Math.max(0, e.rest_seconds)),
    300,
  );
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}
