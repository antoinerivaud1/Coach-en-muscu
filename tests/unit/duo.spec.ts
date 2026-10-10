import { test, expect } from "@playwright/test";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  duoErrorCode,
  duoErrorMessage,
  formatRecord,
  hexToRgbChannels,
  inviteJoinPath,
  isValidInviteCode,
  latestRecord,
  normalizeInviteCode,
  STALE_DUO_MESSAGE,
  activeMembership,
  seanceDestination,
  shareDecision,
  showsComparison,
  toMembers,
} from "@/lib/duo";

// Tests unitaires purs (CM-87) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test.describe("code d'invitation (CM-87)", () => {
  test("alphabet de 32 caractères, sans 0, O, 1 ni I", () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(32);
    for (const banned of ["0", "O", "1", "I"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(banned);
    }
    expect(INVITE_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
    expect(INVITE_CODE_LENGTH).toBe(6);
  });

  test("même alphabet que cm87_new_code() dans la migration", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261010191000_cm87_duo_rpc.sql", "utf8");
    expect(sql).toContain(`'${INVITE_CODE_ALPHABET}'`);
  });

  test("normalisation de la saisie", () => {
    expect(normalizeInviteCode("k7q m4p")).toBe("K7QM4P");
    expect(normalizeInviteCode(" K7-QM-4P ")).toBe("K7QM4P");
    expect(normalizeInviteCode("k7qm4pzz")).toBe("K7QM4P");
    // Caractères ambigus retirés plutôt que devinés.
    expect(normalizeInviteCode("O0I1AB")).toBe("AB");
    expect(normalizeInviteCode(null)).toBe("");
    expect(normalizeInviteCode(undefined)).toBe("");
  });

  test("validité d'un code complet", () => {
    expect(isValidInviteCode("K7QM4P")).toBe(true);
    expect(isValidInviteCode("K7QM4")).toBe(false);
    expect(isValidInviteCode("K7QM4PP")).toBe(false);
    expect(isValidInviteCode("K7QM4O")).toBe(false);
    expect(isValidInviteCode("k7qm4p")).toBe(false);
    expect(isValidInviteCode(null)).toBe(false);
  });

  test("lien d'invitation", () => {
    expect(inviteJoinPath("K7QM4P")).toBe("/duo/rejoindre?code=K7QM4P");
  });
});

test.describe("erreurs des RPC (CM-87)", () => {
  test("code extrait du message PostgreSQL", () => {
    expect(duoErrorCode("cm87:color_conflict")).toBe("color_conflict");
    expect(duoErrorCode('ERROR: cm87:duo_full (P0001)')).toBe("duo_full");
    expect(duoErrorCode("cm87:inconnu")).toBeNull();
    expect(duoErrorCode("permission denied")).toBeNull();
  });

  test("message en français, jamais le détail technique", () => {
    expect(duoErrorMessage("cm87:invitation_expired")).toContain("expiré");
    expect(duoErrorMessage("cm87:duo_full")).toBe("Ce duo est déjà complet.");
    expect(duoErrorMessage("relation does not exist")).toBe(
      "Une erreur est survenue. Réessaie dans un instant.",
    );
  });
});

test.describe("membres affichés (CM-87)", () => {
  const me = { id: "a", display_name: "Léa", accent_color: "#FF4F7E" };
  const partner = { id: "b", display_name: "Antoine", accent_color: "#2FE6FF" };

  test("prénom et couleur, moi d'abord", () => {
    expect(toMembers([partner, me], "a")).toEqual([
      { id: "a", name: "Léa", color: "#FF4F7E", isMe: true },
      { id: "b", name: "Antoine", color: "#2FE6FF", isMe: false },
    ]);
  });

  test("jamais « Toi » ni « Elle » : prénom vide remplacé par un libellé neutre", () => {
    const members = toMembers(
      [{ id: "a", display_name: " ", accent_color: null }, { id: "b", display_name: "" }],
      "a",
    );
    expect(members.map((m) => m.name)).toEqual(["Moi", "Partenaire"]);
    for (const m of members) expect(m.name).not.toMatch(/^(Toi|Elle)$/);
  });

  test("couleur invalide : cyan par défaut (color_role n'est plus lu)", () => {
    expect(toMembers([{ id: "a", display_name: "X", accent_color: "#123456" }], "a")[0]!.color).toBe(
      "#2FE6FF",
    );
  });

  test("comparaison seulement à deux", () => {
    expect(showsComparison([])).toBe(false);
    expect(showsComparison([me])).toBe(false);
    expect(showsComparison([me, partner])).toBe(true);
  });

  test("canaux RGB pour --member-rgb", () => {
    expect(hexToRgbChannels("#FF4F7E")).toBe("255 79 126");
    expect(hexToRgbChannels("#2fe6ff")).toBe("47 230 255");
    expect(hexToRgbChannels("rouge")).toBe("47 230 255");
  });
});

test.describe("choix Pour moi / Pour nous deux (CM-87)", () => {
  const shared = { kind: "shared", duoId: "d" } as const;
  const personal = { kind: "personal" } as const;
  const error = { kind: "error", error: "lecture impossible" } as const;

  test("duo illisible : refus, jamais de repli en perso (C3)", () => {
    expect(seanceDestination(error, undefined)).toEqual({ ok: false, error: "lecture impossible" });
    expect(seanceDestination(error, "perso")).toEqual({ ok: false, error: "lecture impossible" });
  });

  test("sans partenaire : perso ; un choix envoyé = page périmée, refus", () => {
    expect(seanceDestination(personal, undefined)).toEqual({ ok: true, target: "perso" });
    expect(seanceDestination(personal, null)).toEqual({ ok: true, target: "perso" });
    expect(seanceDestination(personal, "duo")).toEqual({ ok: false, error: STALE_DUO_MESSAGE });
    expect(seanceDestination(personal, "perso")).toEqual({ ok: false, error: STALE_DUO_MESSAGE });
  });

  test("en duo : « Pour nous deux » par défaut", () => {
    expect(seanceDestination(shared, undefined)).toEqual({ ok: true, target: "duo" });
    expect(seanceDestination(shared, "duo")).toEqual({ ok: true, target: "duo" });
    expect(seanceDestination(shared, "perso")).toEqual({ ok: true, target: "perso" });
  });
});

test.describe("partager / garder pour moi à l'édition (C2)", () => {
  test("aucun changement du choix affiché : rien, même si l'état lu diffère", () => {
    expect(shareDecision("perso", "perso", "duo")).toEqual({ kind: "none" });
    expect(shareDecision(undefined, "perso", "duo")).toEqual({ kind: "none" });
    expect(shareDecision("duo", undefined, "duo")).toEqual({ kind: "none" });
  });

  test("lecture de l'état réel en échec : refus, rien n'est basculé", () => {
    expect(shareDecision("duo", "perso", null)).toEqual({ kind: "error" });
  });

  test("changement demandé et état réel conforme : bascule", () => {
    expect(shareDecision("duo", "perso", "duo")).toEqual({ kind: "toggle", shared: false });
    expect(shareDecision("perso", "duo", "perso")).toEqual({ kind: "toggle", shared: true });
  });

  test("déjà du bon côté : rien", () => {
    expect(shareDecision("duo", "perso", "perso")).toEqual({ kind: "none" });
  });
});

test.describe("duo actif (CM-87)", () => {
  test("seul dans son duo (invitation en attente) = solo", () => {
    expect(activeMembership("a", "d", [{ profile_id: "a", joined_at: "2026-10-01" }])).toBeNull();
    expect(activeMembership("a", "d", [])).toBeNull();
  });

  test("à deux : partenaire et date d'arrivée du second", () => {
    expect(
      activeMembership("a", "d", [
        { profile_id: "a", joined_at: "2026-10-01T10:00:00Z" },
        { profile_id: "b", joined_at: "2026-10-09T10:00:00Z" },
      ]),
    ).toEqual({ duoId: "d", partnerId: "b", since: "2026-10-09T10:00:00Z" });
  });
});

test.describe("dernier record du partenaire (CM-87)", () => {
  const set = (exerciseId: string, day: number, weightKg: number, reps = 5, isWarmup = false) => ({
    exerciseId,
    performedAt: `2026-10-0${day}T18:00:00Z`,
    weightKg,
    reps,
    isWarmup,
  });

  test("la série la plus récente qui dépasse le meilleur précédent", () => {
    const rec = latestRecord([
      set("dc", 1, 80),
      set("dc", 3, 82.5),
      set("sq", 2, 100),
      set("sq", 4, 100),
    ]);
    expect(rec).toEqual({ exerciseId: "dc", performedAt: "2026-10-03T18:00:00Z", weightKg: 82.5, reps: 5 });
  });

  test("première série d'un exercice et échauffements : pas un record", () => {
    expect(latestRecord([set("dc", 1, 80)])).toBeNull();
    expect(latestRecord([set("dc", 1, 80), set("dc", 2, 90, 5, true)])).toBeNull();
  });

  test("exercice invisible écarté", () => {
    expect(latestRecord([set("x", 1, 10), set("x", 2, 20)], () => false)).toBeNull();
  });

  test("format « 82,5 kg × 5 »", () => {
    expect(formatRecord(82.5, 5)).toBe("82,5 kg × 5");
  });
});
