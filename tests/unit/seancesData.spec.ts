import { test, expect } from "@playwright/test";
import {
  SEANCE_NOT_FOUND,
  seanceRpcErrorMessage,
  shareNameTakenMessage,
  shareSeance,
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

// CM-104 : raccourci « Partager avec … » (RPC set_seance_shared, p_shared = true).
test.describe("shareSeance", () => {
  type RpcCall = { fn: string; args: unknown };
  function fakeClient(
    response: { error: { message: string; code?: string } | null } | Error,
    status: "moved" | "unchanged" = "moved",
  ) {
    const calls: RpcCall[] = [];
    const client = {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        if (response instanceof Error) throw response;
        return { data: response.error ? null : [{ status, day_id: "d1" }], ...response };
      },
    };
    // Seule `rpc` est utilisée par shareSeance.
    return { client: client as unknown as Parameters<typeof shareSeance>[0], calls };
  }

  test("appelle set_seance_shared avec p_shared = true", async () => {
    const { client, calls } = fakeClient({ error: null });
    expect(await shareSeance(client, "d1", "Pec")).toEqual({ ok: true });
    expect(calls).toEqual([{ fn: "set_seance_shared", args: { p_day_id: "d1", p_shared: true } }]);
  });

  test("nom déjà pris dans « Nos séances » : renvoi vers Modifier, nom repris", async () => {
    const { client } = fakeClient({ error: { message: "cm87:name_taken" } });
    const result = await shareSeance(client, "d1", "Pec");
    expect(result).toEqual({ ok: false, error: shareNameTakenMessage("Pec") });
    expect(shareNameTakenMessage("Pec")).toContain("« Pec » existe déjà dans « Nos séances »");
    expect(shareNameTakenMessage("Pec")).toContain("Modifier");
  });

  test("déjà partagée ailleurs (unchanged) : succès, la relecture la place", async () => {
    const { client } = fakeClient({ error: null }, "unchanged");
    expect(await shareSeance(client, "d1", "Pec")).toEqual({ ok: true });
  });

  test("le partenaire a quitté le duo entre-temps : écran périmé", async () => {
    for (const message of ["cm87:no_partner", "cm87:not_in_duo"]) {
      const { client } = fakeClient({ error: { message } });
      expect(await shareSeance(client, "d1", "Pec")).toEqual({ ok: false, error: STALE_DUO_MESSAGE });
    }
  });

  test("réseau coupé : échec affichable, jamais d'exception", async () => {
    const { client } = fakeClient(new Error("Failed to fetch"));
    expect(await shareSeance(client, "d1", "Pec")).toEqual({ ok: false, error: "Failed to fetch" });
  });
});
