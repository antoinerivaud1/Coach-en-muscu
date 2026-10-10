"use client";

import { WEEKLY_GOAL_MAX, WEEKLY_GOAL_MIN, clampWeeklyGoal } from "@/lib/onboarding";

/** CM-86 : objectif hebdo, boutons − / + de 44 px, de 1 à 7. */
export default function GoalStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (goal: number) => void;
}) {
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-xl bg-surface2 text-[22px] text-fg disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Une séance de moins"
        disabled={value <= WEEKLY_GOAL_MIN}
        onClick={() => onChange(clampWeeklyGoal(value - 1))}
        className={btn}
      >
        −
      </button>
      <output
        aria-live="polite"
        aria-label={`${value} séance${value > 1 ? "s" : ""} par semaine`}
        className="w-10 text-center font-oswald text-[26px] font-bold text-fg"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label="Une séance de plus"
        disabled={value >= WEEKLY_GOAL_MAX}
        onClick={() => onChange(clampWeeklyGoal(value + 1))}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
