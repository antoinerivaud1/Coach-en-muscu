import { test, expect } from "@playwright/test";
import { closeDeletedAccountSession } from "@/lib/data/account";
import { signOutLocal } from "@/lib/data/auth";
import {
  clearPreferencesSession,
  clearSessionBounded,
  clearSessionCookies,
  createPreferencesStorage,
  isSessionStorageKey,
  type PreferencesLike,
} from "@/lib/supabase/nativeSession";

// CM-89 (PR 4) : session de l'app native dans Capacitor Preferences.
// Le plugin est remplacé par un faux en mémoire (même contrat asynchrone).

function fakePreferences(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const calls: string[] = [];
  const prefs: PreferencesLike = {
    async get({ key }) {
      calls.push(`get:${key}`);
      return { value: store.has(key) ? store.get(key)! : null };
    },
    async set({ key, value }) {
      calls.push(`set:${key}`);
      store.set(key, value);
    },
    async remove({ key }) {
      calls.push(`remove:${key}`);
      store.delete(key);
    },
    async keys() {
      return { keys: [...store.keys()] };
    },
  };
  return { prefs, store, calls };
}

const KEY = "sb-drmmgwchoowggpsppilo-auth-token";

test.describe("Adaptateur de stockage Preferences (CM-89 (PR 4))", () => {
  test("lecture : valeur enregistrée, sinon null (jamais undefined)", async () => {
    const { prefs } = fakePreferences({ [KEY]: '{"access_token":"a"}' });
    const storage = createPreferencesStorage(prefs);
    expect(await storage.getItem(KEY)).toBe('{"access_token":"a"}');
    expect(await storage.getItem("absente")).toBeNull();
  });

  test("écriture puis effacement passent par le plugin", async () => {
    const { prefs, store, calls } = fakePreferences();
    const storage = createPreferencesStorage(prefs);
    await storage.setItem(KEY, "session");
    expect(store.get(KEY)).toBe("session");
    await storage.removeItem(KEY);
    expect(store.has(KEY)).toBe(false);
    expect(calls).toEqual([`set:${KEY}`, `remove:${KEY}`]);
  });

  test("une erreur du plugin remonte (jamais prise pour « pas de session »)", async () => {
    const prefs: PreferencesLike = {
      get: async () => Promise.reject(new Error("bridge")),
      set: async () => Promise.reject(new Error("bridge")),
      remove: async () => Promise.reject(new Error("bridge")),
      keys: async () => ({ keys: [] }),
    };
    const storage = createPreferencesStorage(prefs);
    await expect(storage.getItem(KEY)).rejects.toThrow("bridge");
    await expect(storage.setItem(KEY, "x")).rejects.toThrow("bridge");
  });

  test("clés de session : jeton, verifier et utilisateur ; rien d'autre", () => {
    expect(isSessionStorageKey(KEY)).toBe(true);
    expect(isSessionStorageKey(`${KEY}-code-verifier`)).toBe(true);
    expect(isSessionStorageKey(`${KEY}-user`)).toBe(true);
    expect(isSessionStorageKey("cm_onboarded")).toBe(false);
    expect(isSessionStorageKey("sb-autre-chose")).toBe(false);
  });

  test("effacement natif : clés de session retirées, les autres gardées", async () => {
    const { prefs, store } = fakePreferences({
      [KEY]: "session",
      [`${KEY}-code-verifier`]: "v",
      "reglage-plugin": "garde",
    });
    const removed = await clearPreferencesSession(prefs);
    expect(removed.sort()).toEqual([KEY, `${KEY}-code-verifier`].sort());
    expect([...store.keys()]).toEqual(["reglage-plugin"]);
  });

  test("effacement natif sans session : aucun appel de suppression", async () => {
    const { prefs, calls } = fakePreferences({ "reglage-plugin": "garde" });
    expect(await clearPreferencesSession(prefs)).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("effacement web : cookies de session seulement (comportement CM-88)", () => {
    const writes: string[] = [];
    const doc = {
      get cookie() {
        return "sb-abc-auth-token.0=a; theme=x; sb-abc-auth-token.1=b";
      },
      set cookie(v: string) {
        writes.push(v);
      },
    };
    expect(clearSessionCookies(doc)).toEqual(["sb-abc-auth-token.0", "sb-abc-auth-token.1"]);
    expect(writes).toEqual([
      "sb-abc-auth-token.0=; Path=/; Max-Age=0; SameSite=Lax",
      "sb-abc-auth-token.1=; Path=/; Max-Age=0; SameSite=Lax",
    ]);
  });
});

test.describe("Déconnexion et suppression dans l'app native (CM-89 (PR 4))", () => {
  test("déconnexion en échec : la session Preferences est effacée", async () => {
    const { prefs, store } = fakePreferences({ [KEY]: "session", autre: "x" });
    const supabase = {
      auth: { signOut: async () => ({ error: { name: "AuthRetryableFetchError" } }) },
    } as unknown as Parameters<typeof signOutLocal>[0];
    expect(await signOutLocal(supabase, () => clearPreferencesSession(prefs))).toBe(true);
    expect([...store.keys()]).toEqual(["autre"]);
  });

  test("compte supprimé : Preferences vidé AVANT signOut, même bloqué", async () => {
    const { prefs, store } = fakePreferences({ [KEY]: "session" });
    let keysAtSignOut: string[] | null = null;
    const supabase = {
      auth: {
        signOut: () => {
          keysAtSignOut = [...store.keys()];
          return new Promise<never>(() => {}); // ne répond jamais
        },
      },
    } as unknown as Parameters<typeof closeDeletedAccountSession>[0];
    await closeDeletedAccountSession(supabase, () => clearPreferencesSession(prefs), 50);
    expect(keysAtSignOut).toEqual([]);
    expect(store.size).toBe(0);
  });

  test("effacement borné : fini, en erreur ou bloqué, jamais d'exception", async () => {
    expect(await clearSessionBounded(() => undefined, 50)).toBe(true);
    expect(await clearSessionBounded(async () => {}, 50)).toBe(true);
    expect(
      await clearSessionBounded(() => {
        throw new Error("bridge");
      }, 50),
    ).toBe(false);
    const started = Date.now();
    expect(await clearSessionBounded(() => new Promise(() => {}), 20)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test("déconnexion : Preferences bloqué, la déconnexion aboutit quand même", async () => {
    const supabase = {
      auth: { signOut: async () => ({ error: { name: "AuthRetryableFetchError" } }) },
    } as unknown as Parameters<typeof signOutLocal>[0];
    const started = Date.now();
    expect(await signOutLocal(supabase, () => new Promise(() => {}), 20)).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  test("compte supprimé : Preferences bloqué, signOut appelé et départ non bloqué", async () => {
    let signOutCalled = false;
    const supabase = {
      auth: {
        signOut: async () => {
          signOutCalled = true;
          return { error: null };
        },
      },
    } as unknown as Parameters<typeof closeDeletedAccountSession>[0];
    const started = Date.now();
    await closeDeletedAccountSession(supabase, () => new Promise(() => {}), 20);
    expect(signOutCalled).toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
