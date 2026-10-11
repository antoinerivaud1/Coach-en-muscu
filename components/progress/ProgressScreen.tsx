"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memberStyle, showsComparison } from "@/lib/duo";
import type { ProgressData } from "@/lib/data/progress";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useProgress } from "@/hooks/data/useProgress";
import BottomNav from "@/components/BottomNav";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import ProgressView from "./ProgressView";
import StatsSummary from "./StatsSummary";

/**
 * Stats (progression). CM-88 : lu dans le navigateur, sous RLS. Le
 * `?profile=` (onglet du partenaire, duo actif seulement) est lu par
 * `useSearchParams`, sous `<Suspense>` pour que la route reste statique.
 */
export default function ProgressScreen() {
  return (
    <Suspense fallback={<ProgressLoading />}>
      <ProgressContent />
    </Suspense>
  );
}

function ProgressContent() {
  const requested = useSearchParams().get("profile");
  // Même retour qu'avant CM-88 : `/progress`, sans le `?profile=`.
  const auth = useRequireProfileId("/progress");
  const progress = useProgress(auth.profileId, requested);

  if (auth.error || progress.error) {
    return (
      <Frame>
        <div className="mt-6">
          <ScreenError
            onRetry={() => void (auth.error ? auth.refetch() : progress.refetch())}
          />
        </div>
      </Frame>
    );
  }

  if (auth.isPending || progress.isPending) return <ProgressLoading />;

  return <ProgressBody data={progress.data} />;
}

function ProgressLoading() {
  return (
    <Frame>
      <div className="mt-6">
        <ScreenSkeleton label="Chargement de tes statistiques" />
      </div>
    </Frame>
  );
}

function Frame({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <main
      className="min-h-[100dvh] p-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]"
      style={color ? memberStyle(color) : undefined}
    >
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-black tracking-tight">Progression</h1>
        {children}
      </div>
      <BottomNav />
    </main>
  );
}

function ProgressBody({ data }: { data: ProgressData }) {
  const { members, selectedProfileId, color } = data;

  return (
    <Frame color={color}>
      {showsComparison(members) && (
        <div className="mt-3 flex gap-2">
          {members.map((m) => {
            const active = m.id === selectedProfileId;
            return (
              <Link
                key={m.id}
                href={`/progress?profile=${m.id}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${
                  active ? "text-ink" : "bg-surface2 text-fg-muted"
                }`}
                style={active ? { background: m.color } : undefined}
              >
                {m.name}
              </Link>
            );
          })}
        </div>
      )}

      {data.hasSets && <StatsSummary stats={data.stats} color={color} />}

      {/* `key` : l'exercice choisi repart du premier quand on change de membre. */}
      <ProgressView key={selectedProfileId} series={data.series} color={color} />
    </Frame>
  );
}
