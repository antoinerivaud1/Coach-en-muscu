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
import OfflineBanner from "@/components/OfflineBanner";
import ProgressView from "./ProgressView";
import ProgressHeader from "./ProgressHeader";
import StatsSummary from "./StatsSummary";
import { memberCss } from "@/lib/members";

/**
 * Progrès › Courbes (CM-117, ex-Stats). CM-88 : lu dans le navigateur, sous RLS. Le
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

  // CM-90 (PR 3) : erreur seulement sans données (sinon bandeau « Hors ligne »).
  if (auth.error || (progress.error && !progress.data)) {
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

  if (auth.isPending || !progress.data) return <ProgressLoading />;

  return (
    <ProgressBody
      data={progress.data}
      notice={<OfflineBanner sources={[progress]} className="mt-3" />}
    />
  );
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
        <ProgressHeader view="curves" />
        {children}
      </div>
      <BottomNav />
    </main>
  );
}

function ProgressBody({ data, notice }: { data: ProgressData; notice: ReactNode }) {
  const { members, selectedProfileId, color } = data;

  return (
    <Frame color={color}>
      {notice}
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
                style={active ? { background: memberCss(m.color) } : undefined}
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
