import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  DUO_READ_ERROR_MESSAGE,
  duoIdFromRow,
  libraryTarget,
  readDuoId,
} from "@/lib/duoMembership";
import { ensurePersonalProgram, PERSONAL_PROGRAM_NAME } from "@/lib/queries/programs";

// CM-86 (correctif C3) : « solo » n'est jamais confondu avec une lecture en
// échec. Client Supabase simulé : aucun réseau.

const ME = "44444444-4444-4444-4444-444444444444";
const DUO = "33333333-3333-3333-3333-333333333333";

type Outcome = { data: unknown; error: { message: string } | null } | Error;

/**
 * Faux client : toute chaîne de requête (`from().select().eq()…`) se résout
 * avec `read` ; un `insert(...)` est enregistré et se résout avec `write`.
 * Une `Error` comme résultat simule une exception (réseau coupé).
 */
function fakeSupabase(read: Outcome, write: Outcome = { data: { id: "new" }, error: null }) {
  const inserts: unknown[] = [];
  const chain = (outcome: () => Outcome): unknown =>
    new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") {
          const o = outcome();
          return o instanceof Error
            ? (_res: unknown, rej: (e: unknown) => void) => rej(o)
            : (res: (v: unknown) => void) => res(o);
        }
        if (prop === "insert") {
          return (row: unknown) => {
            inserts.push(row);
            return chain(() => write);
          };
        }
        return () => chain(outcome);
      },
    });
  const client = { from: () => chain(() => read) } as unknown as SupabaseClient<Database>;
  return { client, inserts };
}

test.describe("duoIdFromRow / libraryTarget (C3)", () => {
  test("solo avéré, duo, erreur", () => {
    expect(duoIdFromRow({ data: null, error: null })).toEqual({ ok: true, duoId: null });
    expect(duoIdFromRow({ data: { duo_id: DUO }, error: null })).toEqual({ ok: true, duoId: DUO });
    expect(duoIdFromRow({ data: null, error: { message: "fetch failed" } })).toEqual({
      ok: false,
      error: "fetch failed",
    });
  });

  test("une erreur ne mène JAMAIS à la bibliothèque perso", () => {
    expect(libraryTarget({ ok: true, duoId: null })).toEqual({ kind: "personal" });
    expect(libraryTarget({ ok: true, duoId: DUO })).toEqual({ kind: "shared", duoId: DUO });
    expect(libraryTarget({ ok: false, error: "fetch failed" })).toEqual({
      kind: "error",
      error: DUO_READ_ERROR_MESSAGE,
    });
  });
});

test.describe("readDuoId avec lecture simulée (C3)", () => {
  test("membre du duo", async () => {
    const { client } = fakeSupabase({ data: { duo_id: DUO }, error: null });
    expect(await readDuoId(client, ME)).toEqual({ ok: true, duoId: DUO });
  });

  test("solo", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    expect(await readDuoId(client, ME)).toEqual({ ok: true, duoId: null });
  });

  test("erreur PostgREST : pas « solo »", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "timeout" } });
    const r = await readDuoId(client, ME);
    expect(r.ok).toBe(false);
    expect(libraryTarget(r).kind).toBe("error");
  });

  test("exception réseau : pas « solo »", async () => {
    const { client } = fakeSupabase(new Error("fetch failed"));
    const r = await readDuoId(client, ME);
    expect(r).toEqual({ ok: false, error: "fetch failed" });
    expect(libraryTarget(r).kind).toBe("error");
  });
});

test.describe("ensurePersonalProgram : jamais de création à l'aveugle (C3)", () => {
  test("lecture en échec : refus, aucun insert", async () => {
    const { client, inserts } = fakeSupabase({ data: null, error: { message: "timeout" } });
    const r = await ensurePersonalProgram(client, ME);
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  test("exception réseau : refus, aucun insert", async () => {
    const { client, inserts } = fakeSupabase(new Error("fetch failed"));
    const r = await ensurePersonalProgram(client, ME);
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  test("programme existant : réutilisé, aucun insert", async () => {
    const { client, inserts } = fakeSupabase({ data: [{ id: "prog-1" }], error: null });
    expect(await ensurePersonalProgram(client, ME)).toEqual({ ok: true, programId: "prog-1" });
    expect(inserts).toHaveLength(0);
  });

  test("aucun programme : créé à mon nom, hors duo", async () => {
    const { client, inserts } = fakeSupabase({ data: [], error: null });
    expect(await ensurePersonalProgram(client, ME)).toEqual({ ok: true, programId: "new" });
    expect(inserts).toEqual([{ name: PERSONAL_PROGRAM_NAME, owner_profile_id: ME, duo_id: null }]);
  });
});
