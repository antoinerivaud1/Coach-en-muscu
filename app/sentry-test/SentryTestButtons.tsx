"use client";

import { useState, useTransition } from "react";
import { throwServerActionError } from "./actions";

export default function SentryTestButtons() {
  const [crash, setCrash] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (crash) throw new Error("CM-95 : erreur volontaire côté client");

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="w-full rounded-2xl bg-energy py-4 text-[18px] font-extrabold text-ink disabled:opacity-50" onClick={() => setCrash(true)}>
        Planter côté client
      </button>
      <button
        type="button"
        className="w-full rounded-2xl bg-energy py-4 text-[18px] font-extrabold text-ink disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await throwServerActionError();
              setStatus("Aucune erreur levée (SENTRY_TEST_PAGE absent côté serveur ?)");
            } catch {
              setStatus("Erreur serveur levée : elle doit apparaître dans Sentry.");
            }
          })
        }
      >
        Planter une server action
      </button>
      {status ? <p className="text-base text-fg-muted">{status}</p> : null}
    </div>
  );
}
