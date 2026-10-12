import { test, expect } from "@playwright/test";
import { buildInitialSets } from "@/lib/data/sessionDetail";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import {
  deleteSessionSet,
  isTransportError,
  OfflineError,
  upsertSessionSet,
} from "@/lib/data/sessionWrites";
import type { BrowserSupabase } from "@/lib/supabase/client";
import type { SessionExercise } from "@/lib/utils/sessionExercises";
import type { SessionSetRow } from "@/lib/queries/sessions";

// CM-88 (PR 6) : parties pures de la couche data de l'écran de séance.

test.describe("isTransportError", () => {
  test("erreur réseau de supabase-js (code vide) : transport", () => {
    const fetchFailed = { code: "", message: "TypeError: Failed to fetch" };
    const noCode: { code?: string; message: string } = { message: "Load failed" };
    expect(isTransportError(fetchFailed)).toBe(true);
    expect(isTransportError(noCode)).toBe(true);
  });
  test("erreur Postgres ou PostgREST (code présent) : pas transport", () => {
    expect(isTransportError({ code: "42501" })).toBe(false);
    expect(isTransportError({ code: "PGRST116" })).toBe(false);
  });
  test("pas d'erreur : pas transport", () => {
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });
});

const exercise = (id: string, targetSets = 3): SessionExercise => ({
  exerciseId: id,
  name: id,
  muscleGroup: "pecs",
  targetSets,
  targetRepsMin: 8,
  targetRepsMax: 10,
  restSeconds: 90,
  source: "program",
} as SessionExercise);

const row = (exerciseId: string, setIndex: number, weight: number, reps: number): SessionSetRow => ({
  id: `${exerciseId}-${setIndex}`,
  exercise_id: exerciseId,
  set_index: setIndex,
  weight_kg: weight,
  reps,
  is_warmup: false,
  created_at: "2026-10-12T10:00:00Z",
});

test.describe("buildInitialSets", () => {
  test("séance en cours reprise : séries écrites, puis une ligne héritée, puis des vides", () => {
    const out = buildInitialSets([exercise("a", 3)], [row("a", 1, 60, 8)], {}, true);
    expect(out.a).toEqual([
      { id: "a-1", setIndex: 1, weight: "60", reps: "8", isWarmup: false },
      { id: null, setIndex: null, weight: "60", reps: "8", isWarmup: false },
      { id: null, setIndex: null, weight: "", reps: "", isWarmup: false },
    ]);
  });

  test("« Modifier » d'une séance terminée : exactement ses séries", () => {
    const out = buildInitialSets([exercise("a", 4)], [row("a", 2, 50, 6), row("a", 1, 40, 8)], {}, false);
    expect(out.a?.map((s) => s.id)).toEqual(["a-1", "a-2"]);
  });

  test("exercice pas encore commencé : au moins une ligne", () => {
    const out = buildInitialSets([exercise("b", 0)], [], {}, true);
    expect(out.b).toHaveLength(1);
  });
});

// ---- Classement refus définitif / rejouable (CM-59 B), faux client ----


/** Requête PostgREST factice : toute méthode se chaîne, `await` rend `result`. */
function chain(result: unknown): unknown {
  const target = () => undefined;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(result);
      }
      return () => chain(result);
    },
  });
}

type FakeOptions = {
  /** Jetons rendus par `getSession`, appel après appel (le dernier se répète). */
  tokens: (string | null)[];
  userId?: string;
  authError?: unknown;
  write: { data?: unknown; error?: unknown };
  /** Lecture de la séance pour le contrôle d'appartenance. */
  owner?: string | null;
};

function fakeClient(o: FakeOptions): BrowserSupabase {
  let call = 0;
  return {
    auth: {
      getSession: async () => {
        const token = o.tokens[Math.min(call, o.tokens.length - 1)] ?? null;
        call += 1;
        return {
          data: { session: token ? { access_token: token, user: { id: o.userId ?? "me" } } : null },
          error: o.authError ?? null,
        };
      },
    },
    from: (table: string) => {
      if (table === "sessions") {
        return chain({ data: o.owner ? { id: "s1", profile_id: o.owner } : null, error: null });
      }
      return chain({ data: o.write.data ?? null, error: o.write.error ?? null });
    },
  } as unknown as BrowserSupabase;
}

const SET = {
  id: "set-1",
  sessionId: "s1",
  exerciseId: "ex-1",
  setIndex: 1,
  weightKg: 60,
  reps: 8,
  isWarmup: false,
  rpe: null,
};
const DENIED = { code: "42501", message: "new row violates row-level security policy" };

test.describe("upsertSessionSet : classement des échecs", () => {
  test("écriture acceptée", async () => {
    const r = await upsertSessionSet(fakeClient({ tokens: ["t1"], write: {} }), SET);
    expect(r).toEqual({ ok: true });
  });
  test("sans session : expirée, rejouable", async () => {
    const r = await upsertSessionSet(fakeClient({ tokens: [null], write: {} }), SET);
    expect(r).toMatchObject({ ok: false, expired: true });
  });
  test("jeton à rafraîchir hors ligne : lève (rejoué par la file)", async () => {
    const client = fakeClient({
      tokens: [null],
      authError: new AuthRetryableFetchError("Failed to fetch", 0),
      write: {},
    });
    await expect(upsertSessionSet(client, SET)).rejects.toBeInstanceOf(OfflineError);
  });
  test("42501 sur la séance d'un autre, même jeton : refus définitif", async () => {
    const client = fakeClient({ tokens: ["t1"], owner: "someone-else", write: { error: DENIED } });
    expect(await upsertSessionSet(client, SET)).toMatchObject({ ok: false, refused: true });
  });
  test("42501 sur une séance introuvable, même jeton : refus définitif", async () => {
    const client = fakeClient({ tokens: ["t1"], owner: null, write: { error: DENIED } });
    expect(await upsertSessionSet(client, SET)).toMatchObject({ ok: false, refused: true });
  });
  test("42501 alors que le jeton a changé pendant la requête : rejouable", async () => {
    const client = fakeClient({ tokens: ["t1", "t1", "t2"], owner: null, write: { error: DENIED } });
    const r = await upsertSessionSet(client, SET);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("refused");
  });
  test("42501 sur MA séance (grant, jeton anonyme) : rejouable", async () => {
    const client = fakeClient({ tokens: ["t1"], owner: "me", write: { error: DENIED } });
    const r = await upsertSessionSet(client, SET);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("refused");
  });
  test("jeton refusé par PostgREST : expirée", async () => {
    const client = fakeClient({ tokens: ["t1"], write: { error: { code: "PGRST303", message: "JWT expired" } } });
    expect(await upsertSessionSet(client, SET)).toMatchObject({ ok: false, expired: true });
  });
  test("coupure réseau (code vide) : rejouable", async () => {
    const client = fakeClient({ tokens: ["t1"], write: { error: { code: "", message: "TypeError: Failed to fetch" } } });
    const r = await upsertSessionSet(client, SET);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("refused");
    expect(r).not.toHaveProperty("expired");
  });
});

test.describe("deleteSessionSet : classement des échecs", () => {
  test("0 ligne, même jeton : refus définitif (déjà supprimée ou pas à moi)", async () => {
    const client = fakeClient({ tokens: ["t1"], write: { data: [] } });
    expect(await deleteSessionSet(client, { id: "set-1", sessionId: "s1" })).toMatchObject({
      ok: false,
      refused: true,
    });
  });
  test("0 ligne, session perdue pendant la requête : expirée", async () => {
    const client = fakeClient({ tokens: ["t1", null], write: { data: [] } });
    expect(await deleteSessionSet(client, { id: "set-1", sessionId: "s1" })).toMatchObject({
      ok: false,
      expired: true,
    });
  });
  test("sans séance : refus définitif (jamais rejoué sans fin)", async () => {
    const client = fakeClient({ tokens: ["t1"], write: { data: [] } });
    expect(await deleteSessionSet(client, { id: "set-1", sessionId: "" })).toMatchObject({
      ok: false,
      refused: true,
    });
  });
  test("une ligne supprimée : ok", async () => {
    const client = fakeClient({ tokens: ["t1"], write: { data: [{ id: "set-1" }] } });
    expect(await deleteSessionSet(client, { id: "set-1", sessionId: "s1" })).toEqual({ ok: true });
  });
});
