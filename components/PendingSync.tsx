"use client";

import { useEffect, useState } from "react";
import { finishSession } from "@/app/sessions/[id]/actions";
import { getPending, setPending } from "@/lib/pendingSessions";

export default function PendingSync() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const items = getPending();
      if (items.length === 0) {
        setCount(0);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setCount(items.length);
        return;
      }
      const remaining = [];
      for (const it of items) {
        try {
          const r = await finishSession(it);
          if (!r.success) remaining.push(it);
        } catch {
          remaining.push(it);
        }
      }
      if (cancelled) return;
      setPending(remaining);
      setCount(remaining.length);
    }

    sync();
    window.addEventListener("online", sync);
    return () => {
      cancelled = true;
      window.removeEventListener("online", sync);
    };
  }, []);

  if (count === 0) return null;
  return (
    <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-amber-950">
      {count} séance{count > 1 ? "s" : ""} à synchroniser…
    </div>
  );
}
