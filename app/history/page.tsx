import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getHistory } from "@/lib/queries/sessions";
import type { HistorySessionRow } from "@/lib/queries/sessions";
import { formatDateLong } from "@/lib/utils/training";
import BottomNav from "@/components/BottomNav";

type ProfileRow = {
  id: string;
  display_name: string;
  color_role: "toi" | "elle";
};

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: accessibleIds } = await supabase
    .rpc("accessible_profile_ids")
    .returns<string[]>();
  const ids = accessibleIds ?? [user.id];

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, display_name, color_role")
    .in("id", ids)
    .returns<ProfileRow[]>();
  const profiles: Record<string, ProfileRow> = {};
  for (const p of profilesData ?? []) profiles[p.id] = p;

  const { data: historyData } = await getHistory(supabase, ids);
  const sessions = ((historyData ?? []) as HistorySessionRow[]).filter(
    (s) => s.session_sets.length > 0,
  );

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Historique</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {sessions.length} séance{sessions.length > 1 ? "s" : ""} enregistrée
          {sessions.length > 1 ? "s" : ""}
        </p>

        {sessions.length === 0 ? (
          <div className="mt-6 rounded-xl bg-zinc-900 p-6 text-center">
            <p className="text-zinc-300">Aucune séance pour l&apos;instant</p>
            <p className="mt-1 text-sm text-zinc-500">
              Lance une séance depuis un de tes programmes.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block rounded-lg bg-toi px-5 py-2.5 font-semibold text-white"
            >
              Voir mes programmes
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((s) => {
              const profile = profiles[s.profile_id];
              const isElle = profile?.color_role === "elle";
              return (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}`}
                    className="block rounded-xl bg-zinc-900 p-4 transition-colors hover:bg-zinc-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {s.program_days?.name ?? "Séance"}
                      </span>
                      {profile && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isElle
                              ? "bg-elle/20 text-elle"
                              : "bg-toi/20 text-toi"
                          }`}
                        >
                          {profile.display_name}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
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
