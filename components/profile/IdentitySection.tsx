"use client";

import { useActionState, useEffect, useState } from "react";
import { updateIdentity, type IdentityFormState } from "@/lib/actions/identity";
import { MEMBER_COLORS, isMemberColor, DEFAULT_MEMBER_COLOR, type MemberColor } from "@/lib/members";
import { DEFAULT_WEEKLY_GOAL, FIRST_NAME_MAX_LENGTH, parseWeeklyGoal } from "@/lib/onboarding";
import ColorPicker from "@/components/onboarding/ColorPicker";
import GoalStepper from "@/components/onboarding/GoalStepper";

/**
 * CM-86 : section « Mon profil » de la page Profil : prénom, couleur de
 * membre et objectif hebdo. Lecture en lignes (maquette 6), « Modifier »
 * ouvre l'édition sur place (même action que l'onboarding).
 */
export default function IdentitySection({
  displayName,
  accentColor,
  weeklyGoal,
}: {
  displayName: string;
  accentColor: string;
  weeklyGoal: number;
}) {
  const [state, action, pending] = useActionState<IdentityFormState, FormData>(
    updateIdentity,
    {},
  );
  const savedColor: MemberColor = isMemberColor(accentColor) ? accentColor : DEFAULT_MEMBER_COLOR;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [color, setColor] = useState<MemberColor>(savedColor);
  const [goal, setGoal] = useState(parseWeeklyGoal(weeklyGoal) ?? DEFAULT_WEEKLY_GOAL);

  useEffect(() => {
    if (state.saved) setEditing(false);
  }, [state]);

  const colorLabel = MEMBER_COLORS.find((c) => c.value === savedColor)?.label ?? "";
  const nameError = state.fieldErrors?.displayName;

  function cancel() {
    setName(displayName);
    setColor(savedColor);
    setGoal(parseWeeklyGoal(weeklyGoal) ?? DEFAULT_WEEKLY_GOAL);
    setEditing(false);
  }

  return (
    <section aria-labelledby="mon-profil" className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 id="mon-profil" className="text-[13px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
          Mon profil
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center px-1 text-base font-bold text-energy"
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
              className={`flex min-h-14 items-center justify-between gap-3 px-4 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
            >
              <span className="text-base font-semibold text-fg">{row.label}</span>
              <span className="min-w-0 truncate text-base text-fg-muted">{row.value}</span>
            </div>
          ))}
          {state.saved && (
            <p role="status" className="border-t border-white/[0.06] px-4 py-3 text-sm font-semibold text-energy">
              Profil enregistré.
            </p>
          )}
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-4" noValidate>
          <input type="hidden" name="accent_color" value={color} />
          <input type="hidden" name="weekly_goal" value={goal} />

          <label className="flex flex-col gap-2">
            <span className="text-[15px] font-semibold text-[#A4A4AE]">Prénom</span>
            <input
              name="display_name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={FIRST_NAME_MAX_LENGTH}
              required
              aria-invalid={nameError ? true : undefined}
              className={`h-[54px] rounded-[14px] border bg-surface2 px-4 text-base text-fg focus:border-energy focus:outline-none ${
                nameError ? "border-red-400/60" : "border-white/10"
              }`}
            />
            {nameError && <span className="text-sm font-semibold text-red-400">{nameError}</span>}
          </label>

          <div className="flex flex-col gap-2.5">
            <span id="profil-couleur" className="text-[15px] font-semibold text-[#A4A4AE]">
              Ma couleur
            </span>
            <ColorPicker value={color} onChange={setColor} labelId="profil-couleur" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-bold text-fg">Objectif par semaine</span>
            <GoalStepper value={goal} onChange={setGoal} />
          </div>

          {state.error && (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-300">
              {state.error}
            </p>
          )}

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
              disabled={pending}
              className="h-12 flex-1 rounded-2xl bg-energy text-base font-extrabold text-ink disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
