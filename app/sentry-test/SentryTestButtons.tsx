"use client";

import { useState } from "react";

// CM-88 (PR 8) : plus de bouton « Planter une server action », l'app n'en a
// plus aucune. Les erreurs serveur restantes (middleware, redirection de `/`)
// remontent par l'instrumentation Sentry du serveur et de l'edge.

export default function SentryTestButtons() {
  const [crash, setCrash] = useState(false);

  if (crash) throw new Error("CM-95 : erreur volontaire côté client");

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="w-full rounded-2xl bg-energy py-4 text-[18px] font-extrabold text-energy-fg disabled:opacity-50" onClick={() => setCrash(true)}>
        Planter côté client
      </button>
    </div>
  );
}
