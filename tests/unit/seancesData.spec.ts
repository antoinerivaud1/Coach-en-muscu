import { test, expect } from "@playwright/test";
import {
  SEANCE_NOT_FOUND,
  seanceRpcErrorMessage,
  validateSeanceExercises,
} from "@/lib/data/seances";
import { STALE_DUO_MESSAGE } from "@/lib/duo";
import { REFUSED_MESSAGE } from "@/lib/supabase/rlsErrors";
import type { SeanceDraftExercise } from "@/lib/utils/seances";

// CM-88 (PR 5) : traduction des erreurs des RPC de séances types et
// validation avant l'appel (lib/data/seances.ts).

test.describe("seanceRpcErrorMessage", () => {
  test("codes cm88 traduits en français", () => {
    expect(seanceRpcErrorMessage({ message: "cm88:seance_not_found" })).toBe(SEANCE_NOT_FOUND);
    expect(seanceRpcErrorMessage({ message: "cm88:stale_duo" })).toBe(STALE_DUO_MESSAGE);
    expect(seanceRpcErrorMessage({ message: "cm88:refused" })).toBe(REFUSED_MESSAGE);
    expect(seanceRpcErrorMessage({ message: "cm88:exercise_not_in_catalog" })).toBe(
      "Un exercice de la séance n'existe pas dans ton catalogue",
    );
  });

  test("nom déjà pris : le nom est repris dans le message", () => {
    expect(seanceRpcErrorMessage({ message: "cm88:name_taken" }, { name: "Push" })).toBe(
      "« Push » existe déjà dans tes séances",
    );
  });

  test("suppression refusée : nom et nombre de séances réalisées (détail de l'erreur)", () => {
    expect(
      seanceRpcErrorMessage({ message: "cm88:seance_has_history", details: "2" }, { name: "Push" }),
    ).toBe(
      "Impossible de supprimer « Push » : 2 séances déjà réalisées y sont rattachées. " +
        "La supprimer détacherait cet historique. Renomme-la ou vide-la de ses exercices.",
    );
    expect(
      seanceRpcErrorMessage({ message: "cm88:seance_has_history", details: "1" }, { name: "Push" }),
    ).toContain("1 séance déjà réalisée y est rattachée");
  });

  test("erreurs du duo (set_seance_shared) : messages de lib/duo", () => {
    expect(seanceRpcErrorMessage({ message: "cm87:name_taken" })).toBe(
      "Une séance porte déjà ce nom de l'autre côté : renomme-la d'abord.",
    );
  });

  test("refus RLS générique, autre erreur telle quelle", () => {
    expect(seanceRpcErrorMessage({ code: "42501", message: "permission denied" })).toBe(REFUSED_MESSAGE);
    expect(seanceRpcErrorMessage({ message: "Failed to fetch" })).toBe("Failed to fetch");
  });
});

const ex = (patch: Partial<SeanceDraftExercise> = {}): SeanceDraftExercise => ({
  exerciseId: "e1",
  name: "Développé couché",
  muscleGroup: "chest",
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  ...patch,
});

test.describe("validateSeanceExercises", () => {
  test("brouillon valide", () => {
    expect(validateSeanceExercises([ex(), ex({ exerciseId: "e2" })])).toEqual({ ok: true });
  });

  test("refus nommés, mêmes textes que l'ancienne server action", () => {
    expect(validateSeanceExercises([])).toEqual({
      ok: false,
      error: "Ajoute au moins un exercice à cette séance",
    });
    expect(validateSeanceExercises([ex(), ex()])).toEqual({
      ok: false,
      error: "« Développé couché » est en double dans la séance",
    });
    expect(validateSeanceExercises([ex({ targetSets: 11 })]).ok).toBe(false);
    expect(validateSeanceExercises([ex({ targetRepsMin: 12, targetRepsMax: 8 })])).toEqual({
      ok: false,
      error: "« Développé couché » : le minimum de répétitions dépasse le maximum",
    });
    expect(validateSeanceExercises([ex({ restSeconds: 601 })]).ok).toBe(false);
  });
});
