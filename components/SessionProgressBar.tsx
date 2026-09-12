"use client";

/**
 * Hauteur du bloc, en pixels. Fixée et exportée : la barre est épinglée en
 * `fixed`, donc l'écran de séance a besoin de la valeur exacte pour réserver
 * la place en haut du flux et pour caler l'IntersectionObserver du timer.
 */
export const SESSION_PROGRESS_BAR_HEIGHT = 30;

/** Épaisseur du liseré de progression. */
const LINE_HEIGHT = 3;

type Props = {
  /** Séries validées, échauffement inclus. */
  done: number;
  /** Séries prévues sur l'ensemble de la séance. */
  total: number;
  /** Exercices dont il reste au moins une série à valider. */
  exercisesRemaining: number;
};

function remainingLabel(count: number): string {
  return count > 1
    ? `${count} exercices restants`
    : `${count} exercice restant`;
}

/**
 * Barre de progression de séance (CM-67) : séries faites / prévues, toujours
 * visible pendant le scroll. Affichage pur — aucun état, aucun effet : la
 * source de vérité reste l'état de `SessionLogger`.
 */
export default function SessionProgressBar({
  done,
  total,
  exercisesRemaining,
}: Props) {
  const percent =
    total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  const isComplete = total > 0 && done >= total && exercisesRemaining === 0;
  const label = `${done} / ${total} ${total > 1 ? "séries" : "série"} · ${
    isComplete ? "Terminé" : remainingLabel(exercisesRemaining)
  }`;

  return (
    <div
      className="mx-auto max-w-lg px-5 pt-0.5"
      style={{ height: SESSION_PROGRESS_BAR_HEIGHT }}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={label}
        aria-label="Progression de la séance"
        className="w-full overflow-hidden rounded-full bg-white/10"
        style={{ height: LINE_HEIGHT }}
      >
        <div
          className="h-full bg-energy transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        className={`mt-[3px] truncate text-xs leading-4 ${
          isComplete ? "text-energy" : "text-fg-muted"
        }`}
      >
        {label}
      </p>
    </div>
  );
}
