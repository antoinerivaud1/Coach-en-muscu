"use client";

import { useActionState } from "react";
import {
  createInvitation,
  revokeInvitation,
  type DuoActionState,
} from "@/lib/actions/duo";

/** CM-87 : « Inviter mon partenaire » (crée l'invitation puis l'affiche). */
export function InviteButton() {
  const [state, action, pending] = useActionState<DuoActionState, FormData>(
    createInvitation,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="flex h-[52px] items-center justify-center rounded-2xl bg-energy text-[17px] font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? "Création…" : "Inviter mon partenaire"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** CM-87 : « Annuler l'invitation ». */
export function RevokeInvitationButton() {
  const [state, action, pending] = useActionState<DuoActionState, FormData>(
    revokeInvitation,
    {},
  );
  return (
    <form action={action} className="flex flex-col items-center">
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 px-3 text-base font-bold text-[#FF6B6B] disabled:opacity-60"
      >
        {pending ? "Annulation…" : "Annuler l'invitation"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
