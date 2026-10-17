"use client";

import { useRouter } from "next/navigation";

/**
 * Bouton retour iOS (CM-116) : chevron + écran précédent, dans une capsule en
 * verre. Revient en arrière dans l'historique s'il y en a un, sinon va à
 * `fallback`.
 */
export default function BackButton({
  fallback = "/dashboard",
  label = "Retour",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="glass inline-flex h-11 items-center gap-0.5 rounded-full pl-1.5 pr-3.5 text-[17px] text-accent"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
