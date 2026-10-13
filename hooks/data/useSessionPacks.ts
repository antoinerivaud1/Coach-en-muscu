"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchDayPack } from "@/lib/data/sessionDetail";
import { queueStore, whenQueuesReady } from "@/lib/offline/queueStore";
import { packSavedAt, prunePacks, savePack } from "@/lib/offline/sessionCache";

/** Un pack plus récent que ça n'est pas relu à chaque passage sur l'accueil. */
export const PACK_MAX_AGE_MS = 5 * 60 * 1000;

/** Laisse l'accueil s'afficher avant de préparer les packs. */
const START_DELAY_MS = 1500;

/**
 * CM-90 (PR 2) : prépare en arrière-plan, depuis l'accueil connecté, un
 * « pack séance » par séance type (lib/offline/sessionCache.ts) : de quoi
 * démarrer chacune hors ligne, avec sa « dernière fois » et son catalogue.
 *
 * Opportuniste et discret : une séance type à la fois, packs de moins de
 * 5 min sautés, arrêt au premier échec réseau (l'ancien pack reste). Les
 * packs des séances types disparues sont retirés.
 */
export function useRefreshSessionPacks(profileId: string | null, dayIds: readonly string[] | null) {
  const key = dayIds ? dayIds.join(",") : null;

  useEffect(() => {
    if (!profileId || key === null) return;
    const ids = key === "" ? [] : key.split(",");
    let cancelled = false;

    const timer = setTimeout(async () => {
      await whenQueuesReady();
      if (cancelled) return;
      const store = queueStore();
      prunePacks(store, profileId, ids);
      const supabase = getSupabaseBrowserClient();
      for (const dayId of ids) {
        if (cancelled) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) return;
        if (Date.now() - packSavedAt(store, profileId, dayId) < PACK_MAX_AGE_MS) continue;
        try {
          const pack = await fetchDayPack(supabase, profileId, dayId, new Date());
          if (cancelled) return;
          if (pack) savePack(store, profileId, dayId, pack, Date.now());
        } catch {
          return;
        }
      }
    }, START_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [profileId, key]);
}
