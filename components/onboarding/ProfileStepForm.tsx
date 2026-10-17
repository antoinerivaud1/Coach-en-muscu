"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { updateIdentity, type IdentityWriteResult } from "@/lib/data/profile";
import { withNext } from "@/lib/auth/core";
import { isMemberColor, DEFAULT_MEMBER_COLOR, type MemberColor } from "@/lib/members";
import {
  DEFAULT_WEEKLY_GOAL,
  FIRST_NAME_MAX_LENGTH,
  parseWeeklyGoal,
  type IdentityFieldErrors,
} from "@/lib/onboarding";
import MemberAvatar from "./MemberAvatar";
import ColorPicker from "./ColorPicker";
import GoalStepper from "./GoalStepper";

/**
 * CM-86 : étape « Comment on t'appelle ? » (maquette 3) : prénom, avatar
 * (initiale sur fond de couleur, pas d'upload dans ce ticket), couleur parmi
 * 6, objectif hebdo de 1 à 7 (3 par défaut).
 *
 * CM-88 (PR 7) : écrit depuis le navigateur, même validation et même
 * écriture que la section « Mon profil » (`updateIdentity`,
 * lib/data/profile.ts : couleur du partenaire de duo refusée). Identité en
 * cache relue AVANT de passer à l'étape 3, qui affiche le prénom.
 */
export default function ProfileStepForm({
  profileId,
  initialName,
  initialColor,
  initialGoal,
  next = "",
}: {
  profileId: string;
  initialName: string;
  initialColor: string;
  initialGoal: number;
  /** CM-103 : destination finale conservée (lien d'invitation). */
  next?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (values: { displayName: string; accentColor: string; weeklyGoal: string }) =>
      updateIdentity(getSupabaseBrowserClient(), profileId, values),
    onSuccess: async (result: IdentityWriteResult) => {
      if (!result.ok) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.identity(profileId) });
      router.push(withNext("/onboarding/seances", next));
    },
  });
  // Après un succès, le bouton reste occupé jusqu'au changement d'écran.
  const pending = save.isPending || save.data?.ok === true;
  const state: { error?: string; fieldErrors?: IdentityFieldErrors } =
    save.data && !save.data.ok ? save.data : {};
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<MemberColor>(
    isMemberColor(initialColor) ? initialColor : DEFAULT_MEMBER_COLOR,
  );
  const [goal, setGoal] = useState(parseWeeklyGoal(initialGoal) ?? DEFAULT_WEEKLY_GOAL);
  const nameError = state.fieldErrors?.displayName;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    save.mutate({ displayName: name, accentColor: color, weeklyGoal: String(goal) });
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>

      <div className="mt-6 flex items-center gap-4">
        <MemberAvatar name={name} color={color} size={76} />
        <p className="text-sm leading-snug text-fg-muted">
          Ton initiale, dans ta couleur.
        </p>
      </div>

      <label className="mt-6 flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-fg-muted">Prénom</span>
        <input
          name="display_name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          autoCapitalize="words"
          maxLength={FIRST_NAME_MAX_LENGTH}
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "prenom-error" : undefined}
          className={`h-[54px] rounded-[14px] border bg-surface px-4 text-base text-fg placeholder-fg-muted focus:border-accent focus:outline-none ${
            nameError ? "border-danger/60" : "border-fg/10"
          }`}
        />
        {nameError && (
          <span id="prenom-error" className="text-sm font-semibold text-danger">
            {nameError}
          </span>
        )}
      </label>

      <div className="mt-6 flex flex-col gap-2.5">
        <span id="couleur-label" className="text-[15px] font-semibold text-fg-muted">
          Ta couleur
        </span>
        <ColorPicker value={color} onChange={setColor} labelId="couleur-label" />
        <span className="text-sm leading-snug text-fg-muted">
          Elle marque tes séances, tes stats et, plus tard, ta place dans un duo.
        </span>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-bold text-fg">Objectif par semaine</span>
          <span className="text-xs text-fg-muted">Modifiable dans ton profil</span>
        </div>
        <GoalStepper value={goal} onChange={setGoal} />
      </div>

      {state.error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger-soft">
          {state.error}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="submit"
        disabled={pending}
        className="mt-8 h-14 w-full rounded-2xl bg-energy text-base font-extrabold text-energy-fg disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Continuer"}
      </button>
    </form>
  );
}
