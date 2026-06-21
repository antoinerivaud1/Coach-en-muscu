"use client";

import { useRouter } from "next/navigation";

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
      className="flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
    >
      <span aria-hidden>←</span> {label}
    </button>
  );
}
