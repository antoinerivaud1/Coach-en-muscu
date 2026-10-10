"use client";

import { useActionState, useState } from "react";
import { saveOnboardingProfile, type IdentityFormState } from "@/lib/actions/identity";
import { isMemberColor, DEFAULT_MEMBER_COLOR, type MemberColor } from "@/lib/members";
import { DEFAULT_WEEKLY_GOAL, FIRST_NAME_MAX_LENGTH, parseWeeklyGoal } from "@/lib/onboarding";
import MemberAvatar from "./MemberAvatar";
import ColorPicker from "./ColorPicker";
import GoalStepper from "./GoalStepper";

/**
 * CM-86 : étape « Comment on t'appelle ? » (maquette 3) : prénom, avatar
 * (initiale sur fond de couleur, pas d'upload dans ce ticket), couleur parmi
 * 6, objectif hebdo de 1 à 7 (3 par défaut).
 */
export default function ProfileStepForm({
  initialName,
  initialColor,
  initialGoal,
}: {
  initialName: string;
  initialColor: string;
  initialGoal: number;
}) {
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(
    saveOnboardingProfile,
    {},
  );
  const [name, setName] = useState(state.values?.displayName ?? initialName);
  const [color, setColor] = useState<MemberColor>(
    isMemberColor(initialColor) ? initialColor : DEFAULT_MEMBER_COLOR,
  );
  const [goal, setGoal] = useState(parseWeeklyGoal(initialGoal) ?? DEFAULT_WEEKLY_GOAL);
  const nameError = state.fieldErrors?.displayName;

  return (
    <form action={action} className="flex flex-1 flex-col" noValidate>
      <input type="hidden" name="accent_color" value={color} />
      <input type="hidden" name="weekly_goal" value={goal} />

      <div className="mt-6 flex items-center gap-4">
        <MemberAvatar name={name} color={color} size={76} />
        <p className="text-sm leading-snug text-[#A4A4AE]">
          Ton initiale, dans ta couleur.
        </p>
      </div>

      <label className="mt-6 flex flex-col gap-2">
        <span className="text-[15px] font-semibold text-[#A4A4AE]">Prénom</span>
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
          className={`h-[54px] rounded-[14px] border bg-surface px-4 text-base text-fg placeholder-fg-muted focus:border-energy focus:outline-none ${
            nameError ? "border-red-400/60" : "border-white/10"
          }`}
        />
        {nameError && (
          <span id="prenom-error" className="text-sm font-semibold text-red-400">
            {nameError}
          </span>
        )}
      </label>

      <div className="mt-6 flex flex-col gap-2.5">
        <span id="couleur-label" className="text-[15px] font-semibold text-[#A4A4AE]">
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
        <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="submit"
        disabled={pending}
        className="mt-8 h-14 w-full rounded-2xl bg-energy text-base font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Continuer"}
      </button>
    </form>
  );
}
