"use client";

import Link from "next/link";
import { showsComparison, toMembers, type Member } from "@/lib/duo";
import type { HistoryData } from "@/lib/data/sessions";
import { formatDateLong } from "@/lib/utils/training";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useHistory } from "@/hooks/data/useHistory";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

/**
 * Carnet (historique des séances). CM-88 : lu dans le navigateur, sous RLS
 * (mes séances, plus celles de mon partenaire en duo actif).
 */
export default function HistoryScreen() {
  const auth = useRequireProfileId("/history");
  const history = useHistory(auth.profileId);

  if (auth.error || history.error) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Historique</h1>
        <div className="mt-6">
          <ScreenError
            onRetry={() => void (auth.error ? auth.refetch() : history.refetch())}
          />
        </div>
      </div>
    );
  }

  if (auth.isPending || history.isPending) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Historique</h1>
        <div className="mt-6">
          <ScreenSkeleton label="Chargement de l'historique" />
        </div>
      </div>
    );
  }

  return <HistoryList data={history.data} profileId={auth.profileId!} />;
}

function HistoryList({ data, profileId }: { data: HistoryData; profileId: string }) {
  // CM-87 : sans duo, aucun nom affiché (rien à comparer).
  const members = toMembers(data.profiles, profileId);
  const byId: Record<string, Member> = {};
  for (const m of members) byId[m.id] = m;
  const showNames = showsComparison(members);
  const { sessions } = data;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Historique</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {sessions.length} séance{sessions.length > 1 ? "s" : ""} enregistrée
        {sessions.length > 1 ? "s" : ""}
      </p>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-xl bg-surface p-6 text-center">
          <p className="text-fg">Aucune séance pour l&apos;instant</p>
          <p className="mt-1 text-sm text-fg-muted">
            Lance une séance depuis l&apos;accueil.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block rounded-xl bg-energy px-5 py-2.5 font-extrabold text-ink"
          >
            Voir mes séances
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {sessions.map((s) => {
            const member = showNames ? byId[s.profile_id] : undefined;
            return (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-xl bg-surface p-4 transition-colors hover:bg-surface2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {s.program_days?.name ?? "Séance"}
                    </span>
                    {member && (
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{ color: member.color, background: `${member.color}33` }}
                      >
                        {member.name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {formatDateLong(s.performed_at)} ·{" "}
                    {s.session_sets.length} série
                    {s.session_sets.length > 1 ? "s" : ""}
                    {s.feedback
                      ? ` · ${FEEDBACK_LABELS[s.feedback] ?? s.feedback}`
                      : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
