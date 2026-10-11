"use client";

import { useActionState } from "react";
import {
  createInvitation,
  revokeInvitation,
  type DuoActionState,
} from "@/lib/actions/duo";
import { useRefreshAfterDuoAction } from "@/hooks/data/useDuoState";

/**
 * CM-88 : une action du duo qui réussit se termine par `redirect()` : sa
 * promesse est alors rejetée avec l'erreur de redirection, que Next traite.
 * Le cache du navigateur est rafraîchi à ce moment-là
 * (`useRefreshAfterDuoAction`), puis l'erreur est relancée telle quelle. Une
 * erreur renvoyée (`{ error }`) ne touche à rien : le message reste affiché.
 */
export function useDuoAction<A extends unknown[]>(
  action: (...args: A) => Promise<DuoActionState>,
): (...args: A) => Promise<DuoActionState> {
  const refresh = useRefreshAfterDuoAction();
  return async (...args: A) => {
    try {
      return await action(...args);
    } catch (e) {
      refresh();
      throw e;
    }
  };
}

/** CM-87 : « Inviter mon partenaire » (crée l'invitation puis l'affiche). */
export function InviteButton() {
  const [state, action, pending] = useActionState<DuoActionState, FormData>(
    useDuoAction(createInvitation),
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
    useDuoAction(revokeInvitation),
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