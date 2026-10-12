// CM-89 (PR 4) : stockage de la session Supabase selon la plateforme.
// Logique pure (aucun import Capacitor ni Supabase) : le plugin Preferences et
// `document` sont injectés, ce qui permet de tout tester en Node
// (tests/unit/nativeSession.spec.ts). Le choix de la plateforme est fait dans
// lib/supabase/client.ts.

import { sessionCookieNames } from "@/lib/accountDeletion";
import { hasSupabaseAuthCookie } from "./auth-config";

/**
 * Sous-ensemble du plugin `@capacitor/preferences` utilisé ici. Injecté pour
 * les tests ; dans l'app, c'est `Preferences` lui-même.
 */
export type PreferencesLike = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
};

/** Forme attendue par l'option `auth.storage` de supabase-js (`SupportedStorage`). */
export type AsyncAuthStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * Adaptateur supabase-js → Capacitor Preferences (UserDefaults sur iOS).
 * Pourquoi pas les cookies : l'app native est servie en `capacitor://localhost`,
 * un schéma personnalisé dont WKWebView gère mal les cookies (persistance non
 * garantie entre deux lancements). Pourquoi pas `localStorage` : stockage du
 * site web, que le système peut purger. Preferences survit aux redémarrages et
 * aux mises à jour de l'app.
 * Les erreurs du plugin remontent telles quelles : supabase-js les traite
 * comme une lecture impossible (écran « Réessayer »), jamais comme une
 * déconnexion.
 */
export function createPreferencesStorage(prefs: PreferencesLike): AsyncAuthStorage {
  return {
    async getItem(key) {
      const { value } = await prefs.get({ key });
      return value ?? null;
    },
    async setItem(key, value) {
      await prefs.set({ key, value });
    },
    async removeItem(key) {
      await prefs.remove({ key });
    },
  };
}

/**
 * Clé de session Supabase dans Preferences : `sb-<ref>-auth-token` (clé par
 * défaut de supabase-js) et ses annexes (`-code-verifier`, `-user`). Même
 * motif que les cookies de session du web.
 */
export function isSessionStorageKey(key: string): boolean {
  return hasSupabaseAuthCookie([key]);
}

/**
 * Natif : efface la session de cet appareil dans Preferences, sans réseau.
 * Les autres clés (réglages d'autres plugins) sont gardées. Renvoie les clés
 * effacées.
 */
export async function clearPreferencesSession(prefs: PreferencesLike): Promise<string[]> {
  const { keys } = await prefs.keys();
  const removed = keys.filter(isSessionStorageKey);
  await Promise.all(removed.map((key) => prefs.remove({ key })));
  return removed;
}

/**
 * Lance un effacement de session sans jamais bloquer ni lever : rend la main
 * dès qu'il a fini, échoué, ou au bout de `timeoutMs`. Un appel Preferences
 * qui ne répond plus (pont natif bloqué) ne doit pas figer la déconnexion ni
 * la suppression du compte. Renvoie `false` si l'effacement n'a pas abouti.
 */
export async function clearSessionBounded(
  clearSession: () => unknown,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(clearSession)
        .then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Web : efface les cookies de session (`sb-…-auth-token*`, lisibles en JS
 * depuis CM-88, morceaux `.0`, `.1` compris). Comportement inchangé depuis
 * CM-88, déplacé ici pour être partagé par la déconnexion et la suppression
 * du compte. Renvoie les noms effacés.
 */
export function clearSessionCookies(doc: { cookie: string }): string[] {
  const names = sessionCookieNames(doc.cookie);
  for (const name of names) {
    doc.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  return names;
}
