"use client";

import { useOnline } from "@/hooks/useOnline";
import { useEffect, useId, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { closeDeletedAccountSession, deleteMyAccount } from "@/lib/data/account";
import {
  ACCOUNT_DELETED_PATH,
  DELETE_CONFIRMATION_WORD,
  isDeleteConfirmation,
} from "@/lib/accountDeletion";
import { unsyncedLocalCount } from "@/lib/localQueues";
import ExportButton from "@/components/profile/ExportButton";
import { memberCss } from "@/lib/members";

export type DeleteAccountDuo =
  | { kind: "solo" }
  | { kind: "pending" }
  | { kind: "duo"; partnerName: string; partnerColor: string }
  /** Lecture du duo en échec : le partenaire éventuel n'est pas nommé. */
  | { kind: "unknown" };

type Item = { keep: boolean; text: React.ReactNode };

function Mark({ keep }: { keep: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-px flex h-6 w-6 flex-none items-center justify-center rounded-lg ${
        keep ? "bg-energy/[0.12] text-accent" : "bg-danger/[0.14] text-danger"
      }`}
    >
      {keep ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className="h-[15px] w-[15px]">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      )}
    </span>
  );
}

function ItemList({ items, label }: { items: Item[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3">
          <Mark keep={it.keep} />
          <span className="sr-only">{it.keep ? "Conservé\u00a0: " : "Supprimé\u00a0: "}</span>
          <span className="text-balance text-base leading-snug text-fg-soft">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * CM-60 : « Supprimer mon compte » et sa feuille de confirmation en deux
 * temps (pas de `window.confirm`, inerte en PWA iOS, CM-70) :
 * 1. ce qui est supprimé, ce que garde le partenaire, lien vers l'export ;
 * 2. saisie de « SUPPRIMER » pour activer le bouton.
 * En cas d'échec, le message s'affiche ici et rien n'est présenté comme
 * supprimé.
 *
 * CM-88 : suppression depuis le navigateur (RPC `delete_my_account` sous la
 * session de l'utilisateur), puis session fermée sur cet appareil et page
 * « Compte supprimé » par rechargement complet (cache du navigateur vidé).
 * `onDeleted` est appelé AVANT la fermeture de session : l'écran Profil cesse
 * alors de suivre la session, sinon il renverrait vers /login.
 */
export default function DeleteAccountSheet({
  duo,
  profileId,
  onDeleted,
}: {
  duo: DeleteAccountDuo;
  profileId: string;
  onDeleted?: () => void;
}) {
  // CM-90 (PR 3) : action en ligne seulement, désactivée hors ligne.
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [word, setWord] = useState("");
  const [unsynced, setUnsynced] = useState(0);
  const [state, setState] = useState<{ error?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const confirmation = String(new FormData(e.currentTarget).get("confirmation") ?? "");
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const result = await deleteMyAccount(supabase, confirmation);
    if (!result.ok) {
      setState({ error: result.error });
      setPending(false);
      return;
    }
    onDeleted?.();
    await closeDeletedAccountSession(supabase);
    window.location.assign(ACCOUNT_DELETED_PATH);
  }
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = isDeleteConfirmation(word);

  useEffect(() => {
    if (!open) return;
    setUnsynced(unsyncedLocalCount());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  useEffect(() => {
    if (open && step === 2) inputRef.current?.focus();
  }, [open, step]);

  function openSheet() {
    setStep(1);
    setWord("");
    setOpen(true);
  }

  function close() {
    if (!pending) setOpen(false);
  }

  const partner = duo.kind === "duo" ? duo : null;
  const partnerName = partner ? (
    <span className="font-bold" style={{ color: partner.partnerColor ? memberCss(partner.partnerColor) : undefined }}>
      {partner.partnerName}
    </span>
  ) : null;

  const deleted: Item[] = [
    { keep: false, text: "Ton compte et ton profil\u00a0: email, prénom, couleur, objectif." },
    { keep: false, text: "Toutes tes séances et tes séries, donc tes stats et tes records." },
    { keep: false, text: "Tes séances types perso et tes exercices perso." },
  ];
  if (duo.kind === "pending") {
    deleted.push({ keep: false, text: "Ton invitation en attente, qui ne pourra plus servir." });
  }
  if (unsynced > 0) {
    deleted.push({
      keep: false,
      text: `${unsynced} élément${unsynced > 1 ? "s" : ""} pas encore enregistré${
        unsynced > 1 ? "s" : ""
      }, sur ce téléphone.`,
    });
  }
  const kept: Item[] = partner
    ? [
        { keep: true, text: <>{partnerName} garde toutes ses séances, ses séries et ses records.</> },
        {
          keep: true,
          text: (
            <>
              «&nbsp;Nos séances&nbsp;» restent à {partnerName}&nbsp;: elles deviennent sa
              bibliothèque, avec les exercices du duo.
            </>
          ),
        },
        { keep: false, text: <>Votre duo prend fin.</> },
      ]
    : duo.kind === "unknown"
      ? [
          {
            keep: true,
            text: (
              <>
                Si tu es en duo, ton partenaire garde ses séances, ses séries et «&nbsp;Nos
                séances&nbsp;».
              </>
            ),
          },
        ]
      : [];

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        disabled={!online}
        className="flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-fg/20 disabled:opacity-50"
      >
        <span className="flex-1">
          <span className="block font-extrabold text-danger">Supprimer mon compte</span>
          <span className="mt-0.5 block text-xs font-semibold text-fg-muted">
            Compte et données effacés, définitivement
          </span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-fg-muted" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-fg/[0.08] bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3"
          >
            <span className="h-[5px] w-10 flex-none self-center rounded-full bg-edge" aria-hidden />
            <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.03em] text-fg-muted">
              Étape {step} sur 2
            </p>

            {step === 1 ? (
              <>
                <h2 id={titleId} className="mt-1.5 text-balance text-2xl font-black leading-tight tracking-tight text-fg">
                  Supprimer ton compte&nbsp;?
                </h2>
                <p id={descId} className="mt-2 text-balance text-base leading-snug text-fg-muted">
                  C&apos;est définitif&nbsp;: rien ne pourra être récupéré.
                </p>
                <div className="mt-5">
                  <ItemList items={deleted} label="Ce qui est supprimé" />
                </div>
                {kept.length > 0 && (
                  <div className="mt-5 border-t border-line pt-5">
                    <ItemList items={kept} label="Ce que garde ton partenaire" />
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-3 rounded-[18px] border border-line bg-surface2 p-4">
                  <p className="text-balance text-base leading-snug text-fg">
                    Garde une copie de tes séances et de tes séries avant de partir.
                  </p>
                  <ExportButton variant="sheet" profileId={profileId} />
                </div>

                <p className="mt-4 text-balance text-sm leading-snug text-fg-muted">
                  Un abonnement Premium se résilie à part, dans les réglages de ton identifiant
                  Apple&nbsp;: supprimer le compte ne l&apos;arrête pas.
                </p>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="mt-6 h-[54px] w-full flex-none rounded-2xl bg-danger text-[17px] font-extrabold text-ink"
                >
                  Continuer
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="mt-2 h-12 flex-none rounded-xl text-[17px] font-bold text-fg"
                >
                  Annuler
                </button>
              </>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col">
                <h2 id={titleId} className="mt-1.5 text-balance text-2xl font-black leading-tight tracking-tight text-fg">
                  Confirme la suppression
                </h2>
                <p id={descId} className="mt-2 text-balance text-base leading-snug text-fg-muted">
                  Pour supprimer définitivement ton compte et tes données, écris
                  «&nbsp;{DELETE_CONFIRMATION_WORD}&nbsp;» ci-dessous.
                </p>
                <label htmlFor={inputId} className="mt-5 text-sm font-bold text-fg">
                  Mot de confirmation
                </label>
                <input
                  ref={inputRef}
                  id={inputId}
                  name="confirmation"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  disabled={pending}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  aria-invalid={Boolean(state.error)}
                  className={`mt-2 h-14 rounded-2xl bg-ink px-4 font-oswald text-[26px] font-bold uppercase tracking-[0.08em] text-fg outline-none disabled:opacity-60 ${
                    confirmed ? "border-[1.5px] border-danger" : "border border-fg/15 focus:border-fg/40"
                  }`}
                />
                {state.error && (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-base text-danger-soft"
                  >
                    {state.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!confirmed || pending}
                  className="mt-6 h-[54px] w-full rounded-2xl bg-danger text-[17px] font-extrabold text-ink disabled:bg-surface2 disabled:text-fg-muted"
                >
                  {pending ? "Suppression…" : "Supprimer définitivement"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={pending}
                  className="mt-2 h-12 rounded-xl text-[17px] font-bold text-fg disabled:opacity-60"
                >
                  Retour
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
