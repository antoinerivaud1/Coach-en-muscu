import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  CSV_HEADER,
  EXPORT_CSV_NAME,
  EXPORT_JSON_NAME,
  buildExportJson,
  buildExportZip,
  buildSetsCsv,
  csvField,
  exportFileBaseName,
  formatCsvNumber,
  formatExportDateTime,
  orderSets,
  type AccountExportData,
  type ExportSession,
  type ExportSet,
} from "@/lib/export/accountExport";
import { crc32, createZip } from "@/lib/export/zip";
import {
  ACCOUNT_DELETED_PATH,
  DELETE_CONFIRMATION_WORD,
  deleteAccountErrorMessage,
  isDeleteConfirmation,
  isExplicitRefusal,
  sessionCookieNames,
} from "@/lib/accountDeletion";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import type { BrowserSupabase } from "@/lib/supabase/client";
import { closeDeletedAccountSession, deleteMyAccount } from "@/lib/data/account";
import { deliverExport, exportFileName, type ExportDeps } from "@/lib/export/deliverExport";
import { isPublicPath } from "@/lib/auth/publicPaths";

// CM-60 : export des données (CSV, JSON, ZIP) et garde de confirmation de la
// suppression du compte.

function set(partial: Partial<ExportSet> & Pick<ExportSet, "exercise_id" | "set_index">): ExportSet {
  return {
    id: `set-${partial.exercise_id}-${partial.set_index}`,
    weight_kg: 50,
    reps: 10,
    rpe: null,
    is_warmup: false,
    created_at: "2026-10-02T10:00:00.000Z",
    exercise_name: partial.exercise_id,
    ...partial,
  };
}

function session(partial: Partial<ExportSession> & Pick<ExportSession, "id" | "performed_at">): ExportSession {
  return {
    duration_seconds: 1800,
    feedback: null,
    notes: null,
    created_at: partial.performed_at,
    seance_name: "Full body",
    sets: [],
    ...partial,
  };
}

/** Lignes du CSV, sans le BOM ni la dernière ligne vide. */
function csvLines(csv: string): string[] {
  return csv.replace(/^﻿/, "").split("\r\n").slice(0, -1);
}

test.describe("CSV : champs (CM-60)", () => {
  test("texte simple : inchangé", () => {
    expect(csvField("Squat barre")).toBe("Squat barre");
    expect(csvField("Élévations latérales")).toBe("Élévations latérales");
    expect(csvField(null)).toBe("");
  });

  test("virgule, point-virgule, saut de ligne : entre guillemets", () => {
    expect(csvField("Développé, couché")).toBe('"Développé, couché"');
    expect(csvField("Tirage ; poulie")).toBe('"Tirage ; poulie"');
    expect(csvField("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvField(" espace devant")).toBe('" espace devant"');
  });

  test("guillemets doublés", () => {
    expect(csvField('Curl "marteau"')).toBe('"Curl ""marteau"""');
    expect(csvField('"')).toBe('""""');
  });

  test("formules de tableur neutralisées", () => {
    expect(csvField("=SOMME(A1:A2)")).toBe("'=SOMME(A1:A2)");
    expect(csvField("+33 6")).toBe("'+33 6");
    expect(csvField("-10 kg")).toBe("'-10 kg");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });
});

test.describe("CSV : nombres (CM-60)", () => {
  test("décimales à la virgule, entiers sans décimale", () => {
    expect(formatCsvNumber(72.5)).toBe("72,5");
    expect(formatCsvNumber(70)).toBe("70");
    expect(formatCsvNumber(0.25)).toBe("0,25");
    expect(formatCsvNumber(1.125)).toBe("1,13");
  });

  test("numeric renvoyé en texte par PostgREST", () => {
    expect(formatCsvNumber("72.50")).toBe("72,5");
    expect(formatCsvNumber("100.00")).toBe("100");
  });

  test("valeurs absentes ou invalides : vide", () => {
    expect(formatCsvNumber(null)).toBe("");
    expect(formatCsvNumber(undefined)).toBe("");
    expect(formatCsvNumber("")).toBe("");
    expect(formatCsvNumber("abc")).toBe("");
    expect(formatCsvNumber(Number.NaN)).toBe("");
  });
});

test.describe("CSV des séances et séries (CM-60)", () => {
  const sessions: ExportSession[] = [
    session({
      id: "s2",
      performed_at: "2026-10-05T16:30:00.000Z",
      seance_name: "Haut, bas",
      sets: [set({ exercise_id: 'Curl "marteau"', set_index: 1, weight_kg: "12.50", reps: 12 })],
    }),
    session({
      id: "s1",
      performed_at: "2026-10-02T10:00:00.000Z",
      seance_name: null,
      sets: [
        set({ exercise_id: "Squat", set_index: 2, weight_kg: 72.5, reps: 8 }),
        set({ exercise_id: "Squat", set_index: 1, weight_kg: 40, reps: 10, is_warmup: true }),
        set({
          exercise_id: "Rowing",
          set_index: 1,
          weight_kg: 55,
          reps: 9,
          created_at: "2026-10-02T10:20:00.000Z",
        }),
      ],
    }),
  ];
  const lines = csvLines(buildSetsCsv(sessions));

  test("BOM UTF-8, en-tête, séparateur « ; », fins de ligne CRLF", () => {
    const csv = buildSetsCsv(sessions);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe(CSV_HEADER.join(";"));
    expect(lines[0]).toBe("Date;Séance type;Exercice;Série;Poids (kg);Répétitions;Échauffement");
  });

  test("une ligne par série, ordre chronologique, exercices dans l'ordre de la séance", () => {
    expect(lines.slice(1)).toEqual([
      "2026-10-02 12:00;Sans séance type;Squat;1;40;10;oui",
      "2026-10-02 12:00;Sans séance type;Squat;2;72,5;8;non",
      "2026-10-02 12:00;Sans séance type;Rowing;1;55;9;non",
      '2026-10-05 18:30;"Haut, bas";"Curl ""marteau""";1;12,5;12;non',
    ]);
  });

  test("aucune séance : en-tête seul", () => {
    expect(csvLines(buildSetsCsv([]))).toEqual([CSV_HEADER.join(";")]);
  });

  test("exercice illisible : libellé de repli", () => {
    const csv = buildSetsCsv([
      session({
        id: "s",
        performed_at: "2026-10-02T10:00:00.000Z",
        sets: [set({ exercise_id: "x", set_index: 1, exercise_name: null })],
      }),
    ]);
    expect(csvLines(csv)[1]).toContain(";Exercice indisponible;");
  });
});

test.describe("Ordre des séries (CM-60)", () => {
  test("exercices dans l'ordre où ils ont été commencés, puis numéro", () => {
    const ordered = orderSets([
      { exercise_id: "B", set_index: 1, created_at: "2026-10-02T10:10:00Z" },
      { exercise_id: "A", set_index: 2, created_at: "2026-10-02T10:05:00Z" },
      { exercise_id: "A", set_index: 1, created_at: "2026-10-02T10:00:00Z" },
      { exercise_id: "B", set_index: 2, created_at: "2026-10-02T10:12:00Z" },
    ]);
    expect(ordered.map((x) => `${x.exercise_id}${x.set_index}`)).toEqual(["A1", "A2", "B1", "B2"]);
  });
});

test.describe("Dates et nom de fichier (CM-60)", () => {
  test("heure de Paris (été et hiver)", () => {
    expect(formatExportDateTime("2026-10-02T10:00:00.000Z")).toBe("2026-10-02 12:00");
    expect(formatExportDateTime("2026-12-02T10:00:00.000Z")).toBe("2026-12-02 11:00");
  });

  test("coach-en-muscu-export-AAAA-MM-JJ, date de Paris", () => {
    expect(exportFileBaseName(new Date("2026-10-11T08:00:00Z"))).toBe("coach-en-muscu-export-2026-10-11");
    // 23 h 30 UTC le 10 = 1 h 30 à Paris le 11.
    expect(exportFileBaseName(new Date("2026-10-10T23:30:00Z"))).toBe("coach-en-muscu-export-2026-10-11");
  });
});

const DATA: AccountExportData = {
  email: "solo@coach-en-muscu.test",
  profile: {
    display_name: "Solo",
    accent_color: "#FF8A3D",
    weekly_goal: 3,
    avatar_url: null,
    created_at: "2026-10-01T00:00:00Z",
    onboarded_at: "2026-10-01T00:00:00Z",
  },
  programs: [
    {
      id: "p0",
      name: "Nos séances",
      created_at: "2026-09-01T00:00:00Z",
      shared: true,
      days: [{ id: "d9", name: "Haut du corps", order_index: 0, exercises: [] }],
    },
    {
      id: "p1",
      name: "Programme solo",
      created_at: "2026-10-01T00:00:00Z",
      shared: false,
      days: [
        {
          id: "d2",
          name: "Jambes",
          order_index: 1,
          exercises: [],
        },
        {
          id: "d1",
          name: "Full body",
          order_index: 0,
          exercises: [
            {
              order_index: 0,
              exercise_id: "e1",
              exercise_name: "Squat barre",
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 10,
              rest_seconds: 120,
              notes: null,
            },
          ],
        },
      ],
    },
  ],
  sessions: [
    session({
      id: "s1",
      performed_at: "2026-10-02T10:00:00.000Z",
      sets: [set({ exercise_id: "e1", exercise_name: "Squat barre", set_index: 1, weight_kg: "60.00", rpe: "7" })],
    }),
  ],
  exercises: [
    {
      id: "e8",
      name: "Exercice du duo",
      muscle_group: "back",
      is_compound: true,
      created_at: "2026-09-01T00:00:00Z",
      shared: true,
    },
    {
      id: "e9",
      name: "Exercice perso",
      muscle_group: "other",
      is_compound: false,
      created_at: "2026-10-01T00:00:00Z",
      shared: false,
    },
  ],
};

test.describe("JSON complet (CM-60)", () => {
  const json = JSON.parse(buildExportJson(DATA, new Date("2026-10-11T08:00:00Z")));

  test("en-tête du format", () => {
    expect(json.format).toBe("coach-en-muscu-export");
    expect(json.version).toBe(1);
    expect(json.genere_le).toBe("2026-10-11T08:00:00.000Z");
    expect(json.compte).toEqual({ email: "solo@coach-en-muscu.test" });
    expect(json.profil.prenom).toBe("Solo");
  });

  test("séances types triées, avec leurs exercices", () => {
    const perso = json.seances_types.filter((d: { partagee: boolean }) => !d.partagee);
    expect(perso.map((d: { nom: string }) => d.nom)).toEqual(["Full body", "Jambes"]);
    expect(perso[0].bibliotheque).toBe("Programme solo");
    expect(perso[0].exercices[0]).toMatchObject({ exercice: "Squat barre", series: 3 });
  });

  test("bibliothèque du duo incluse, marquée partagée", () => {
    expect(json.seances_types[0]).toMatchObject({
      nom: "Haut du corps",
      bibliotheque: "Nos séances",
      partagee: true,
    });
    expect(json.seances_types.filter((d: { partagee: boolean }) => d.partagee)).toHaveLength(1);
  });

  test("séances et séries, nombres en nombres", () => {
    expect(json.seances).toHaveLength(1);
    expect(json.seances[0]).toMatchObject({ seance_type: "Full body", terminee: true });
    expect(json.seances[0].series[0]).toMatchObject({ exercice: "Squat barre", poids_kg: 60, rpe: 7, numero: 1 });
  });

  test("exercices perso, puis ceux du duo (partagés)", () => {
    expect(json.exercices).toEqual([
      expect.objectContaining({ nom: "Exercice perso", groupe_musculaire: "other", partage: false }),
      expect.objectContaining({ nom: "Exercice du duo", partage: true }),
    ]);
  });
});

/** Fichiers d'une archive ZIP « stored », lue à partir du répertoire central. */
function readZip(zip: Uint8Array): { name: string; text: string }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.byteLength - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out: { name: string; text: string }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(local + 26, true);
    const start = local + 30 + localNameLen;
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.push({ name, text: dec.decode(data) });
    p += 46 + nameLen;
  }
  return out;
}

test.describe("Archive ZIP (CM-60)", () => {
  test("CRC-32 de référence", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  test("archive lisible : noms, contenus et CRC", () => {
    const enc = new TextEncoder();
    const zip = createZip(
      [
        { name: "a.txt", data: enc.encode("bonjour") },
        { name: "dossier/é.json", data: enc.encode('{"ok":true}') },
      ],
      new Date("2026-10-11T08:00:00Z"),
    );
    expect(readZip(zip)).toEqual([
      { name: "a.txt", text: "bonjour" },
      { name: "dossier/é.json", text: '{"ok":true}' },
    ]);
  });

  test("export : le CSV et le JSON, non vides", () => {
    const files = readZip(buildExportZip(DATA, new Date("2026-10-11T08:00:00Z")));
    expect(files.map((f) => f.name)).toEqual([EXPORT_CSV_NAME, EXPORT_JSON_NAME]);
    expect(files[0].text).toContain("2026-10-02 12:00;Full body;Squat barre;1;60;10;non");
    expect(JSON.parse(files[1].text).seances).toHaveLength(1);
  });
});

test.describe("Suppression du compte : garde de confirmation (CM-60)", () => {
  test("le mot attendu, casse et espaces autour ignorés", () => {
    for (const ok of ["SUPPRIMER", "supprimer", "Supprimer", "  SUPPRIMER ", "supprimer\n"]) {
      expect(isDeleteConfirmation(ok), JSON.stringify(ok)).toBe(true);
    }
  });

  test("tout autre mot : refusé", () => {
    for (const ko of ["", " ", "SUPPRIME", "SUPPRIMERR", "SUPPRIMER !", "S U P P R I M E R", "OUI", "DELETE"]) {
      expect(isDeleteConfirmation(ko), JSON.stringify(ko)).toBe(false);
    }
    expect(isDeleteConfirmation(null)).toBe(false);
    expect(isDeleteConfirmation(undefined)).toBe(false);
  });

  test("le mot de l'app est celui qu'exige la RPC", () => {
    expect(DELETE_CONFIRMATION_WORD).toBe("SUPPRIMER");
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261011100000_cm60_delete_account.sql"),
      "utf8",
    );
    expect(sql).toContain(`p_confirmation is distinct from '${DELETE_CONFIRMATION_WORD}'`);
  });

  test("messages d'erreur : codes cm60 traduits", () => {
    expect(deleteAccountErrorMessage({ message: "cm60:confirmation_required", code: "P0001" })).toContain(
      "SUPPRIMER",
    );
    expect(deleteAccountErrorMessage({ message: "cm60:not_authenticated" })).toContain("session a expiré");
    expect(deleteAccountErrorMessage({ message: "cm60:account_not_found", code: "P0001" })).toContain(
      "n'existe plus",
    );
  });

  test("refus explicite de la base : « Rien n'a été supprimé »", () => {
    for (const refused of [
      { message: "cm87:already_in_duo", code: "P0001" },
      { message: "cm60:inconnu", code: "P0001" },
      { message: "permission denied for function delete_my_account", code: "42501" },
      { message: "deadlock detected", code: "40P01" },
      { message: "Could not find the function", code: "PGRST202" },
    ]) {
      expect(isExplicitRefusal(refused), refused.message).toBe(true);
      expect(deleteAccountErrorMessage(refused), refused.message).toContain("Rien n'a été supprimé");
    }
  });

  test("réponse perdue : suppression « non confirmée », jamais « rien n'a été supprimé »", () => {
    for (const lost of [
      null,
      undefined,
      { message: "TypeError: fetch failed", code: "" },
      { message: "network", code: null },
      { message: "<html>502 Bad Gateway</html>" },
      { message: "", code: "502" },
    ]) {
      expect(isExplicitRefusal(lost), JSON.stringify(lost)).toBe(false);
      const msg = deleteAccountErrorMessage(lost);
      expect(msg).toBe("La suppression n'a pas pu être confirmée. Reconnecte-toi pour vérifier.");
      expect(msg).not.toContain("Rien n'a été supprimé");
    }
  });

  test("la page « Compte supprimé » est publique", () => {
    expect(ACCOUNT_DELETED_PATH).toBe("/compte-supprime");
    expect(isPublicPath(ACCOUNT_DELETED_PATH)).toBe(true);
  });
});

// ---- Remise du fichier : partage système ou téléchargement --------------------

type Calls = { built: Date[]; shared: ShareData[]; links: { href: string; name: string }[] };

const ZIP_BYTES = new TextEncoder().encode("PK\u0003\u0004contenu");

function deps(
  over: {
    zip?: Uint8Array<ArrayBuffer> | Error;
    canShare?: boolean;
    share?: (d: ShareData) => Promise<void>;
  } = {},
): { deps: ExportDeps; calls: Calls } {
  const calls: Calls = { built: [], shared: [], links: [] };
  const share =
    over.share ??
    (async (d: ShareData) => {
      calls.shared.push(d);
    });
  return {
    calls,
    deps: {
      buildZip: async (now) => {
        calls.built.push(now);
        if (over.zip instanceof Error) throw over.zip;
        return over.zip ?? ZIP_BYTES;
      },
      navigator:
        over.canShare === undefined
          ? {}
          : {
              canShare: () => over.canShare!,
              share: async (d) => {
                calls.shared.push(d);
                return share(d);
              },
            },
      createObjectURL: () => "blob:test/1",
      revokeObjectURL: () => {},
      clickDownloadLink: (href, name) => calls.links.push({ href, name }),
      now: () => new Date("2026-10-11T08:00:00Z"),
    },
  };
}

test.describe("Remise de l'export (CM-60)", () => {
  test("partage de fichiers possible : feuille de partage avec le ZIP, aucun téléchargement", async () => {
    const { deps: d, calls } = deps({ canShare: true });
    expect(await deliverExport(d)).toBe("shared");
    // CM-88 : archive construite dans le navigateur, datée du même instant.
    expect(calls.built).toEqual([new Date("2026-10-11T08:00:00Z")]);
    expect(calls.links).toEqual([]);
    const file = calls.shared[0].files![0];
    expect(file.name).toBe("coach-en-muscu-export-2026-10-11.zip");
    expect(file.type).toBe("application/zip");
    expect(await file.text()).toContain("contenu");
  });

  test("partage de fichiers impossible : téléchargement par lien temporaire", async () => {
    const { deps: d, calls } = deps({ canShare: false });
    expect(await deliverExport(d)).toBe("downloaded");
    expect(calls.shared).toEqual([]);
    expect(calls.links).toEqual([{ href: "blob:test/1", name: "coach-en-muscu-export-2026-10-11.zip" }]);
  });

  test("pas d'API de partage du tout : téléchargement", async () => {
    const { deps: d, calls } = deps();
    expect(await deliverExport(d)).toBe("downloaded");
    expect(calls.links).toHaveLength(1);
  });

  test("feuille de partage fermée : rien d'autre", async () => {
    const abort = Object.assign(new Error("annulé"), { name: "AbortError" });
    const { deps: d, calls } = deps({ canShare: true, share: async () => Promise.reject(abort) });
    expect(await deliverExport(d)).toBe("cancelled");
    expect(calls.links).toEqual([]);
  });

  test("partage refusé (geste expiré) : repli sur le téléchargement", async () => {
    const denied = Object.assign(new Error("refusé"), { name: "NotAllowedError" });
    const { deps: d, calls } = deps({ canShare: true, share: async () => Promise.reject(denied) });
    expect(await deliverExport(d)).toBe("downloaded");
    expect(calls.links).toHaveLength(1);
  });

  test("échecs : lecture impossible, archive vide", async () => {
    for (const zip of [new Error("offline"), new Uint8Array(new ArrayBuffer(0))]) {
      const { deps: d, calls } = deps({ canShare: true, zip });
      await expect(deliverExport(d)).rejects.toThrow();
      expect(calls.shared).toEqual([]);
      expect(calls.links).toEqual([]);
    }
  });

  test("nom du fichier : date du jour (Paris)", () => {
    expect(exportFileName(new Date("2026-10-11T08:00:00Z"))).toBe(
      "coach-en-muscu-export-2026-10-11.zip",
    );
    // 23 h 30 UTC le 10 : déjà le 11 à Paris.
    expect(exportFileName(new Date("2026-10-10T23:30:00Z"))).toBe(
      "coach-en-muscu-export-2026-10-11.zip",
    );
  });
});

// ---- CM-88 : suppression depuis le navigateur ----------------------------------

/** `document.cookie` simulé : lecture de la chaîne, écritures enregistrées. */
function fakeDocument(cookie: string) {
  const writes: string[] = [];
  return {
    writes,
    doc: {
      get cookie() {
        return cookie;
      },
      set cookie(v: string) {
        writes.push(v);
      },
    },
  };
}

type FakeAuth = Pick<BrowserSupabase, "auth" | "rpc">;

test.describe("Suppression du compte côté navigateur (CM-88)", () => {
  test("cookies de session, morceaux .0 / .1 compris, et rien d'autre", () => {
    expect(
      sessionCookieNames(
        "cm_onboarded=x; sb-abc-auth-token.0=aaa; theme=sombre; sb-abc-auth-token.1=bbb; sb-abc-auth-token-code-verifier=c",
      ),
    ).toEqual(["sb-abc-auth-token.0", "sb-abc-auth-token.1", "sb-abc-auth-token-code-verifier"]);
    expect(sessionCookieNames("")).toEqual([]);
  });

  test("fermeture : cookies effacés d'abord, signOut bloqué borné", async () => {
    const { doc, writes } = fakeDocument("sb-abc-auth-token.0=aaa; sb-abc-auth-token.1=bbb; theme=x");
    let writesAtSignOut: number | null = null;
    const supabase = {
      auth: {
        signOut: () => {
          writesAtSignOut = writes.length;
          return new Promise<never>(() => {}); // ne répond jamais
        },
      },
    } as unknown as Pick<BrowserSupabase, "auth">;
    const started = Date.now();
    await closeDeletedAccountSession(supabase, doc, 50);
    expect(Date.now() - started).toBeLessThan(1_000);
    // signOut appelé APRÈS l'effacement des deux cookies.
    expect(writesAtSignOut).toBe(2);
    expect(writes).toEqual([
      "sb-abc-auth-token.0=; Path=/; Max-Age=0; SameSite=Lax",
      "sb-abc-auth-token.1=; Path=/; Max-Age=0; SameSite=Lax",
    ]);
  });

  test("fermeture : un signOut en erreur ne fait pas échouer", async () => {
    const { doc } = fakeDocument("sb-abc-auth-token=aaa");
    const supabase = {
      auth: { signOut: async () => Promise.reject(new Error("réseau")) },
    } as unknown as Pick<BrowserSupabase, "auth">;
    await closeDeletedAccountSession(supabase, doc, 50);
  });

  test("réseau coupé à la vérification de session : rien n'est supprimé, pas « session expirée »", async () => {
    let rpcCalled = false;
    const supabase = {
      auth: {
        getClaims: async () => ({
          data: null,
          error: new AuthRetryableFetchError("Failed to fetch", 0),
        }),
      },
      rpc: async () => {
        rpcCalled = true;
        return { error: null };
      },
    } as unknown as FakeAuth;
    const result = await deleteMyAccount(supabase as BrowserSupabase, "SUPPRIMER");
    expect(result).toEqual({ ok: false, error: deleteAccountErrorMessage({ message: "cm60:offline" }) });
    expect(result.ok === false && result.error).toContain("Rien n'a été supprimé");
    expect(rpcCalled).toBe(false);
  });

  test("sans session : « session expirée », aucun appel", async () => {
    let rpcCalled = false;
    const supabase = {
      auth: { getClaims: async () => ({ data: null, error: null }) },
      rpc: async () => {
        rpcCalled = true;
        return { error: null };
      },
    } as unknown as FakeAuth;
    const result = await deleteMyAccount(supabase as BrowserSupabase, "SUPPRIMER");
    expect(result).toEqual({
      ok: false,
      error: deleteAccountErrorMessage({ message: "cm60:not_authenticated" }),
    });
    expect(rpcCalled).toBe(false);
  });
});
