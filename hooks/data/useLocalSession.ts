"use client";

import { useEffect, useState } from "react";
import { hasPendingClosure } from "@/lib/pendingSessions";
import { QUEUE_CHANGED_EVENT, queueStore, whenQueuesReady } from "@/lib/offline/queueStore";
import { latestLocalSession, type LocalSession } from "@/lib/offline/sessionCache";

/**
 * CM-90 (PR 4) : séance en cours gardée sur ce téléphone (la plus récente de
 * ce compte), relue après la restauration des files (iPhone) et à chaque
 * changement de file. Les séances déjà closes hors ligne sont exclues.
 */
export function useLocalSession(profileId: string | null): LocalSession | null {
  const [local, setLocal] = useState<LocalSession | null>(null);

  useEffect(() => {
    if (!profileId) {
      setLocal(null);
      return;
    }
    let active = true;
    const read = () => {
      if (!active) return;
      const store = queueStore();
      setLocal(latestLocalSession(store, profileId, (id) => hasPendingClosure(id, store)));
    };
    void whenQueuesReady().then(read);
    window.addEventListener(QUEUE_CHANGED_EVENT, read);
    return () => {
      active = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, read);
    };
  }, [profileId]);

  return local;
}
