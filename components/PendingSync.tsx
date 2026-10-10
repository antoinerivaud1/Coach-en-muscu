"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { finishSession } from "@/app/sessions/[id]/actions";
import type { FinishSessionInput } from "@/app/sessions/[id]/actions";
import {
  addRefusedSessions,
  getPending,
  getRefusedSessions,
  setPending,
} from "@/lib/pendingSessions";
import { isPublicPath } from "@/lib/auth/publicPaths";

/**
 * CM-59 B : pas de rejeu sans session possible : `/login` et les pages
 * publiques (légal, support) n'appellent jamais la server action.
 */
function isSyncablePath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/login" || pathname.startsWith("/login/")) return false;
  return !isPublicPath(pathname);
}

export default function PendingSync() {
  const pathname = usePathname();
  const syncable = isSyncablePath(pathname);
  const [count, setCount] = useState(0);
  const [refused, setRefused] = useState(0);

  useEffect(() => {
    if (!syncable) return;
    let cancelled = false;

    async function sync() {
      setRefused(getRefusedSessions().length);
      const items = getPending();
      if (items.length === 0) {
        setCount(0);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setCount(items.length);
        return;
      }
      const remaining: FinishSessionInput[] = [];
      const setAside: FinishSessionInput[] = [];
      for (const it of items) {
        try {
          const r = await finishSession(it);
          // CM-59 B : refus définitif (séance introuvable ou pas à toi) : mis
          // de côté (`cm_refused_sessions`), jamais jeté. Tout le reste
          // (42501, session expirée, réseau) est rejoué plus tard.
          if (!r.ok && r.refused) setAside.push(it);
          else if (!r.ok) remaining.push(it);
        } catch {
          remaining.push(it);
        }
      }
      if (cancelled) return;
      addRefusedSessions(setAside);
      setPending(remaining);
      setCount(remaining.length);
      setRefused(getRefusedSessions().length);
    }

    sync();
    window.addEventListener("online", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
    };
  }, [syncable]);

  if (!syncable || (count === 0 && refused === 0)) return null;
  return (
    <div className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 flex-col items-center gap-1">
      {count > 0 && (
        <div className="rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-amber-950">
          {count} séance{count > 1 ? "s" : ""} à synchroniser…
        </div>
      )}
      {refused > 0 && (
        <div role="status" className="rounded-full bg-surface2/95 px-3 py-1 text-xs font-medium text-fg-muted">
          {refused} séance{refused > 1 ? "s n'ont" : " n'a"} pas pu être enregistrée
          {refused > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
