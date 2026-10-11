"use client";

// CM-88 (PR 7) : actions du duo lancées depuis le navigateur
// (hooks/data/useDuoActions.ts), plus de server action.
import { useCreateInvitation, useRevokeInvitation } from "@/hooks/data/useDuoActions";

/** CM-87 : « Inviter mon partenaire » (crée l'invitation puis l'affiche). */
export function InviteButton() {
  const { run, pending, error } = useCreateInvitation();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) run();
      }}
      className="flex flex-col gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className="flex h-[52px] items-center justify-center rounded-2xl bg-energy text-[17px] font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? "Création…" : "Inviter mon partenaire"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * CM-87 : « Annuler l'invitation ». `then` : écran à ouvrir ensuite
 * (`/profile` depuis l'écran de partage) ; sans, on reste sur le Profil.
 */
export function RevokeInvitationButton({ then }: { then?: string }) {
  const { run, pending, error } = useRevokeInvitation(then);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) run();
      }}
      className="flex flex-col items-center"
    >
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 px-3 text-base font-bold text-[#FF6B6B] disabled:opacity-60"
      >
        {pending ? "Annulation…" : "Annuler l'invitation"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
