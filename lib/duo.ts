/**
 * CM-87 : duo optionnel, logique pure (aucun import serveur ni Supabase),
 * testée dans tests/unit/duo.spec.ts.
 *
 * - code d'invitation : 6 caractères, alphabet sans 0, O, 1 ni I (même
 *   alphabet que `cm87_new_code()` en base) ;
 * - erreurs des RPC (`cm87:<code>`) traduites en français ;
 * - membres affichés : prénom et couleur (`memberAccent`), jamais
 *   « Toi » / « Elle » ni `color_role` ;
 * - règles d'affichage solo / duo.
 */

import type { CSSProperties } from "react";
import { memberAccent, type MemberColor } from "@/lib/members";
import type { LibraryTarget } from "@/lib/duoMembership";

// ---- Code d'invitation ---------------------------------------------------------

export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
/** Durée de validité d'une invitation (défaut de la colonne en base). */
export const INVITE_VALIDITY_DAYS = 7;

/**
 * Saisie → code normalisé : capitales, sans espaces ni tirets, caractères
 * hors alphabet retirés, coupé à 6. « k7q m4p » donne « K7QM4P ».
 */
export function normalizeInviteCode(raw: string | null | undefined): string {
  const upper = (raw ?? "").toUpperCase();
  let out = "";
  for (const ch of upper) {
    if (INVITE_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === INVITE_CODE_LENGTH) break;
  }
  return out;
}

/** Vrai si `code` est exactement un code complet (6 caractères de l'alphabet). */
export function isValidInviteCode(code: string | null | undefined): code is string {
  if (typeof code !== "string" || code.length !== INVITE_CODE_LENGTH) return false;
  for (const ch of code) if (!INVITE_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Chemin du lien d'invitation (le code y est pré-rempli). */
export function inviteJoinPath(code: string): string {
  return `/duo/rejoindre?code=${encodeURIComponent(code)}`;
}

/** Date d'expiration lisible : « jusqu'au 14 octobre ». */
export function formatInviteExpiry(expiresAt: string | Date): string {
  const d = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
  }).format(d);
}

// ---- Erreurs des RPC -----------------------------------------------------------

export type DuoErrorCode =
  | "not_authenticated"
  | "duo_full"
  | "invitation_invalid"
  | "invitation_expired"
  | "invitation_self"
  | "already_in_duo"
  | "color_conflict"
  | "color_invalid"
  | "not_in_duo"
  | "no_partner"
  | "seance_not_found"
  | "name_taken";

const DUO_ERROR_MESSAGES: Record<DuoErrorCode, string> = {
  not_authenticated: "Ta session a expiré. Reconnecte-toi.",
  duo_full: "Ce duo est déjà complet.",
  invitation_invalid: "Ce code n'existe pas ou n'est plus valable.",
  invitation_expired: "Ce code a expiré. Demande une nouvelle invitation.",
  invitation_self: "C'est ton propre code : envoie-le à ton partenaire.",
  already_in_duo: "Tu es déjà en duo. Quitte-le avant d'en rejoindre un autre.",
  color_conflict: "Ton partenaire a déjà cette couleur : choisis-en une autre.",
  color_invalid: "Choisis une des 6 couleurs.",
  not_in_duo: "Tu n'es dans aucun duo.",
  no_partner: "Ton partenaire n'a pas encore rejoint le duo.",
  seance_not_found: "Séance introuvable",
  name_taken: "Une séance porte déjà ce nom de l'autre côté : renomme-la d'abord.",
};

/** Code `cm87:<code>` extrait d'un message d'erreur PostgreSQL, sinon null. */
export function duoErrorCode(message: string | null | undefined): DuoErrorCode | null {
  const m = /cm87:([a-z_]+)/.exec(message ?? "");
  const code = m?.[1];
  return code && code in DUO_ERROR_MESSAGES ? (code as DuoErrorCode) : null;
}

/** Message en français pour une erreur de RPC (détail technique jamais montré). */
export function duoErrorMessage(message: string | null | undefined): string {
  const code = duoErrorCode(message);
  return code ? DUO_ERROR_MESSAGES[code] : "Une erreur est survenue. Réessaie dans un instant.";
}

// ---- Appartenance au duo -----------------------------------------------------------

export type DuoMembership = {
  duoId: string;
  partnerId: string;
  /** Arrivée du second membre : « en duo depuis le … ». */
  since: string;
};

/**
 * Duo ACTIF à partir des membres lus : il faut un partenaire. Seul dans son
 * duo (invitation en attente) = solo (null).
 */
export function activeMembership(
  profileId: string,
  duoId: string,
  members: { profile_id: string; joined_at: string }[],
): DuoMembership | null {
  const partner = members.find((m) => m.profile_id !== profileId);
  if (!partner) return null;
  const since = members.map((m) => m.joined_at).sort().at(-1)!;
  return { duoId, partnerId: partner.profile_id, since };
}

// ---- Membres -------------------------------------------------------------------

export type MemberProfile = {
  id: string;
  display_name: string;
  accent_color?: string | null;
};

export type Member = {
  id: string;
  name: string;
  color: MemberColor;
  isMe: boolean;
};

/**
 * Membres affichés (moi d'abord, puis le partenaire) : prénom et couleur de
 * membre. Un prénom vide devient « Moi » / « Partenaire » pour ne jamais
 * afficher une ligne sans nom.
 */
export function toMembers(profiles: MemberProfile[], meId: string): Member[] {
  return [...profiles]
    .sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
    .map((p) => ({
      id: p.id,
      name: p.display_name?.trim() || (p.id === meId ? "Moi" : "Partenaire"),
      color: memberAccent({ accent_color: p.accent_color }),
      isMe: p.id === meId,
    }));
}

/**
 * Comparaison entre membres (strip de semaine, « Duo · séries », onglets de
 * Stats, nom sur l'historique) : seulement à deux. Un utilisateur sans duo ne
 * voit aucune section de comparaison.
 */
export function showsComparison(members: readonly unknown[]): boolean {
  return members.length >= 2;
}

/**
 * Canaux RGB d'une couleur `#RRGGBB` (« 47 230 255 »), pour la variable CSS
 * `--member-rgb` qui alimente les classes Tailwind `member` (opacités
 * comprises : `bg-member/15`).
 */
export function hexToRgbChannels(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "47 230 255";
  return [m[1], m[2], m[3]].map((h) => parseInt(h!, 16)).join(" ");
}

/** Style à poser sur un conteneur pour que `*-member` prenne cette couleur. */
export function memberStyle(color: string): CSSProperties {
  return { "--member-rgb": hexToRgbChannels(color) } as CSSProperties;
}

// ---- Bibliothèque ---------------------------------------------------------------

export type SeanceTarget = "duo" | "perso";

/** Le choix de la page ne correspond plus à l'état réel (page périmée). */
export const STALE_DUO_MESSAGE =
  "Ton duo a changé entre-temps. Recharge la page puis réessaie.";

/**
 * Où va une NOUVELLE séance type, à partir de la lecture du duo
 * (`libraryTarget(readDuoId(…))`) et du choix « Pour moi / Pour nous deux » :
 * - duo illisible : refus (jamais de séance rangée en perso par erreur) ;
 * - sans partenaire : perso, et refus si un choix est envoyé (il n'est montré
 *   qu'en duo : la page est périmée) ;
 * - en duo : « Pour nous deux » par défaut.
 */
export function seanceDestination(
  library: LibraryTarget,
  requested: SeanceTarget | null | undefined,
): { ok: true; target: SeanceTarget } | { ok: false; error: string } {
  if (library.kind === "error") return { ok: false, error: library.error };
  if (library.kind === "personal") {
    return requested ? { ok: false, error: STALE_DUO_MESSAGE } : { ok: true, target: "perso" };
  }
  return { ok: true, target: requested === "perso" ? "perso" : "duo" };
}

export type ShareDecision =
  | { kind: "none" }
  | { kind: "toggle"; shared: boolean }
  | { kind: "stale" }
  | { kind: "error" };

/**
 * « Partager avec … » / « Garder pour moi » à l'édition (C2) : on ne bascule
 * que si l'utilisateur a CHANGÉ le choix affiché (`initial` → `requested`),
 * et seulement après avoir relu l'état réel côté serveur (`actual`, null si
 * la lecture a échoué) :
 * - pas de changement demandé : rien ;
 * - lecture en échec : refus, rien n'est basculé ;
 * - déjà du bon côté : rien ;
 * - état réel différent de celui affiché : page périmée, refus.
 */
export function shareDecision(
  initial: SeanceTarget | null | undefined,
  requested: SeanceTarget | null | undefined,
  actual: SeanceTarget | null,
): ShareDecision {
  if (!initial || !requested || initial === requested) return { kind: "none" };
  if (actual === null) return { kind: "error" };
  if (actual === requested) return { kind: "none" };
  if (actual !== initial) return { kind: "stale" };
  return { kind: "toggle", shared: requested === "duo" };
}

// ---- Activité du partenaire : dernier record ----------------------------------

export type RecordSet = {
  exerciseId: string;
  performedAt: string;
  weightKg: number;
  reps: number;
  isWarmup?: boolean;
};

export type LatestRecord = {
  exerciseId: string;
  performedAt: string;
  weightKg: number;
  reps: number;
};

/**
 * Dernier record battu : la série (hors échauffement) la plus récente dont
 * la charge dépasse strictement toutes les séries précédentes du même
 * exercice. La toute première série d'un exercice n'est pas un record (rien
 * à battre). `visible` écarte les exercices dont le nom est inconnu.
 */
export function latestRecord(
  sets: RecordSet[],
  visible: (exerciseId: string) => boolean = () => true,
): LatestRecord | null {
  const sorted = sets
    .filter((s) => !s.isWarmup && s.weightKg > 0)
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const best = new Map<string, number>();
  let last: LatestRecord | null = null;
  for (const s of sorted) {
    const prev = best.get(s.exerciseId);
    if (prev !== undefined && s.weightKg > prev && visible(s.exerciseId)) {
      last = { exerciseId: s.exerciseId, performedAt: s.performedAt, weightKg: s.weightKg, reps: s.reps };
    }
    if (prev === undefined || s.weightKg > prev) best.set(s.exerciseId, s.weightKg);
  }
  return last;
}

/** « 82,5 kg × 5 » (espaces insécables). */
export function formatRecord(weightKg: number, reps: number): string {
  const w = weightKg.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${w} kg × ${reps}`;
}
