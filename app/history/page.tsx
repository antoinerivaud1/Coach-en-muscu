import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getMemberProfiles } from "@/lib/profile";
import { showsComparison, toMembers, type Member } from "@/lib/duo";
import { getHistory } from "@/lib/queries/sessions";
import type { HistorySessionRow } from "@/lib/queries/sessions";
import { formatDateLong } from "@/lib/utils/training";
import BottomNav from "@/components/BottomNav";

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

export default async function HistoryPage() {
  const profileId = await requireProfileId("/history");
  const supabase = await createClient();

  // CM-87 : moi, plus mon partenaire en duo actif ; prénom et couleur de
  // chacun. Sans duo, aucun nom affiché (rien à comparer).
  const { profiles } = await getMemberProfiles(supabase, profileId);
  const members = toMembers(profiles, profileId);
  const ids = members.map((m) => m.id);
  const byId: Record<string, Member> = {};
  for (const m of members) byId[m.id] = m;
  const showNames = showsComparison(members);

  // `getHistory` ne renvoie que des séances TERMINÉES (CM-83) : une séance en
  // cours n'apparaît donc plus ici avec un compteur de séries qui bouge. Le
  // filtre restant écarte les séances terminées à vide, qui n'ont rien à
  // montrer.
  const { data: historyData } = await getHistory(supabase, ids);
  const sessions = ((historyData ?? []) as HistorySessionRow[]).filter(
    (s) => s.session_sets.length > 0,
  );

  return (
    <main className="min-h-screen p-4 pb-28">
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
      <BottomNav />
    </main>
  );
}
