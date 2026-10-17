"use client";

import { useOnline } from "@/hooks/useOnline";
import { OnlineOnlyHint } from "@/components/OfflineBanner";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { updateIdentity, type IdentityWriteResult } from "@/lib/data/profile";
import {
  deName,
  initialPickerColor,
  isMemberColor,
  memberColorLabel,
  takenPartnerColor,
  DEFAULT_MEMBER_COLOR,
  type MemberColor,
  type PartnerColor,
} from "@/lib/members";
import { DEFAULT_WEEKLY_GOAL, FIRST_NAME_MAX_LENGTH, parseWeeklyGoal } from "@/lib/onboarding";
import ColorPicker from "@/components/onboarding/ColorPicker";
import GoalStepper from "@/components/onboarding/GoalStepper";
import { memberCss } from "@/lib/members";

type FormState = {
  error?: string;
  fieldErrors?: Extract<IdentityWriteResult, { ok: false }>["fieldErrors"];
  /** Vrai après un enregistrement réussi. */
  saved?: boolean;
};

/** Résultat du dernier envoi, sous la forme qu'affiche le formulaire. */
function formState(result: IdentityWriteResult | undefined, error: Error | null): FormState {
  if (error) return { error: error.message };
  if (!result) return {};
  return result.ok ? { saved: true } : { error: result.error, fieldErrors: result.fieldErrors };
}

/**
 * CM-86 : section « Mon profil » de la page Profil : prénom, couleur de
 * membre et objectif hebdo. Lecture en lignes (maquette 6), « Modifier »
 * ouvre l'édition sur place (même action que l'onboarding).
 *
 * CM-103 : en duo, la couleur du partenaire est grisée et non sélectionnable
 * (« Couleur de Lina ») ; l'écriture la refuse aussi. Solo : aucune
 * restriction.
 *
 * CM-88 : écriture depuis le navigateur (`updateIdentity`, lib/data/profile.ts),
 * sous RLS. Le formulaire est relu tel quel à l'envoi (champs cachés compris).
 * Après succès, les données du profil sont relues avant de refermer
 * l'édition : prénom, couleur et objectif s'affichent à jour partout.
 */
export default function IdentitySection({
  profileId,
  displayName,
  accentColor,
  weeklyGoal,
  partner = null,
}: {
  profileId: string;
  displayName: string;
  accentColor: string;
  weeklyGoal: number;
  /** Partenaire de duo actif (prénom, couleur), null en solo. */
  partner?: PartnerColor | null;
}) {
  // CM-90 (PR 3) : action en ligne seulement, désactivée hors ligne.
  const online = useOnline();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: { displayName: string; accentColor: string; weeklyGoal: string }) =>
      updateIdentity(getSupabaseBrowserClient(), profileId, values),
    onSuccess: async (result) => {
      if (!result.ok) return;
      // Remplace `revalidatePath` : relecture avant de refermer l'édition.
      await queryClient.invalidateQueries({ queryKey: queryKeys.all(profileId) });
      setEditing(false);
    },
  });
  const pending = save.isPending;
  const state = formState(save.data, save.error);
  const savedColor: MemberColor = isMemberColor(accentColor) ? accentColor : DEFAULT_MEMBER_COLOR;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const takenColor = takenPartnerColor(partner);
  const taken = takenColor
    ? { color: takenColor, label: `couleur ${deName(partner?.name)}` }
    : null;
  const [color, setColor] = useState<MemberColor>(initialPickerColor(accentColor, partner));
  const [goal, setGoal] = useState(parseWeeklyGoal(weeklyGoal) ?? DEFAULT_WEEKLY_GOAL);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = new FormData(e.currentTarget);
    save.mutate({
      displayName: String(form.get("display_name") ?? ""),
      accentColor: String(form.get("accent_color") ?? ""),
      weeklyGoal: String(form.get("weekly_goal") ?? ""),
    });
  }

  const colorLabel = memberColorLabel(savedColor);
  const nameError = state.fieldErrors?.displayName;
  const colorError = state.fieldErrors?.accentColor;

  function cancel() {
    setName(displayName);
    setColor(initialPickerColor(accentColor, partner));
    setGoal(parseWeeklyGoal(weeklyGoal) ?? DEFAULT_WEEKLY_GOAL);
    setEditing(false);
  }

  return (
    <section aria-labelledby="mon-profil" className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 id="mon-profil" className="text-[13px] font-bold uppercase tracking-[0.03em] text-fg-muted">
          Mon profil
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center px-1 text-base font-bold text-accent"
          >
            Modifier
          </button>
        )}
      </div>

      {!editing ? (
        <div className="flex flex-col rounded-[20px] border border-line bg-surface">
          {[
            { label: "Prénom", value: displayName },
            {
              label: "Ma couleur",
              value: (
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-4 w-4 rounded-full" style={{ background: savedColor }} />
                  {colorLabel}
                </span>
              ),
            },
            {
              label: "Objectif par semaine",
              value: `${weeklyGoal} séance${weeklyGoal > 1 ? "s" : ""}`,
            },
          ].map((row, i) => (
            <div
              key={row.label}
              className={`flex min-h-14 items-center justify-between gap-3 px-4 ${i > 0 ? "border-t border-fg/[0.06]" : ""}`}
            >
              <span className="text-base font-semibold text-fg">{row.label}</span>
              <span className="min-w-0 truncate text-base text-fg-muted">{row.value}</span>
            </div>
          ))}
          {state.saved && (
            <p role="status" className="border-t border-fg/[0.06] px-4 py-3 text-sm font-semibold text-accent">
              Profil enregistré.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-4" noValidate>
          <input type="hidden" name="accent_color" value={color} />
          <input type="hidden" name="weekly_goal" value={goal} />

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-fg-muted">Prénom</span>
            <input
              name="display_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={FIRST_NAME_MAX_LENGTH}
              required
              aria-invalid={nameError ? true : undefined}
              className={`h-[54px] rounded-[14px] border bg-surface2 px-4 text-base text-fg focus:border-accent focus:outline-none ${
                nameError ? "border-danger/60" : "border-fg/10"
              }`}
            />
            {nameError && <span className="text-sm font-semibold text-danger">{nameError}</span>}
          </label>

          <div className="flex flex-col gap-2.5">
            <span id="profil-couleur" className="text-[15px] font-semibold text-fg-muted">
              Ma couleur
            </span>
            <ColorPicker
              value={color}
              onChange={setColor}
              labelId="profil-couleur"
              taken={taken}
              describedBy={taken ? "profil-couleur-prise" : undefined}
            />
            {taken && partner && (
              <p id="profil-couleur-prise" className="flex items-center gap-2 text-[15px] leading-snug text-fg-muted">
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none rounded-full"
                  style={{ background: memberCss(taken.color), filter: "grayscale(1) brightness(0.5)" }}
                />
                <span>
                  <span className="font-semibold text-fg">Couleur {deName(partner.name)}</span>
                  &nbsp;: dans un duo, chacun garde la sienne.
                </span>
              </p>
            )}
            {colorError && (
              <span role="alert" className="text-sm font-semibold text-danger">
                {colorError}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-bold text-fg">Objectif par semaine</span>
            <GoalStepper value={goal} onChange={setGoal} />
          </div>

          {state.error && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger-soft">
              {state.error}
            </p>
          )}

          <OnlineOnlyHint />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              className="h-12 flex-1 rounded-2xl bg-surface2 text-base font-semibold text-fg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending || !online}
              className="h-12 flex-1 rounded-2xl bg-energy text-base font-extrabold text-energy-fg disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
