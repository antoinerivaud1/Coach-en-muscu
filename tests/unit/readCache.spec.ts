import { test, expect } from "@playwright/test";
import { queryKeys } from "@/lib/data/queryKeys";
import {
  formatDataStamp,
  isPersistedKey,
  isShowingOfflineData,
  oldestDataStamp,
  shouldPersistQuery,
  type OfflineSource,
} from "@/lib/offline/readCache";

// CM-90 (PR 3) : cache de lecture persistant et bandeau « Hors ligne ».
// Lancer : npm run test:unit

const P = "11111111-1111-1111-1111-111111111111";

test.describe("lectures gardées hors ligne", () => {
  test("écrans consultables : gardés", () => {
    for (const key of [
      queryKeys.dashboard.all(P),
      queryKeys.sessions.history(P),
      queryKeys.sessions.progress(P, ""),
      queryKeys.seances.library(P),
      queryKeys.exercises.catalog(P),
      queryKeys.profile.identity(P),
      queryKeys.profile.badges(P, 4),
      queryKeys.duo.state(P),
    ]) {
      expect(isPersistedKey(key), key.join("/")).toBe(true);
    }
  });

  test("session, écran de séance, éditeur, invitation, email : jamais gardés", () => {
    for (const key of [
      queryKeys.auth(),
      queryKeys.sessions.detail(P, "s1", false),
      queryKeys.sessions.detailAll(P, "s1"),
      queryKeys.seances.editor(P, "d1"),
      queryKeys.seances.editor(P, null),
      queryKeys.duoInvitation.preview(P, "ABC123"),
      queryKeys.account.email(P),
    ]) {
      expect(isPersistedKey(key), key.join("/")).toBe(false);
    }
  });

  test("clé sans profil : jamais gardée", () => {
    expect(isPersistedKey(queryKeys.dashboard.all(""))).toBe(false);
  });

  test("gardée dès qu'elle a des données, même après un rafraîchissement en échec", () => {
    const key = queryKeys.sessions.history(P);
    const state = (status: string, data: unknown) =>
      ({ queryKey: key, state: { status, data } }) as unknown as Parameters<typeof shouldPersistQuery>[0];
    expect(shouldPersistQuery(state("success", { sessions: [] }))).toBe(true);
    expect(shouldPersistQuery(state("error", { sessions: [] }))).toBe(true);
    expect(shouldPersistQuery(state("error", undefined))).toBe(false);
    expect(shouldPersistQuery(state("pending", undefined))).toBe(false);
  });
});

test.describe("bandeau hors ligne", () => {
  const ok = (dataUpdatedAt: number): OfflineSource => ({
    data: {},
    dataUpdatedAt,
    isRefetchError: false,
    status: "success",
  });
  const failed = (dataUpdatedAt: number): OfflineSource => ({
    data: {},
    dataUpdatedAt,
    isRefetchError: true,
    status: "error",
  });
  const empty: OfflineSource = { data: undefined, dataUpdatedAt: 0, isRefetchError: false, status: "error" };

  test("date et heure locales, sur deux chiffres", () => {
    expect(formatDataStamp(new Date(2026, 9, 3, 8, 5).getTime())).toBe("03/10 à 08:05");
    expect(formatDataStamp(new Date(2026, 9, 13, 18, 42).getTime())).toBe("13/10 à 18:42");
  });

  test("affiché si hors ligne, ou si un rafraîchissement a échoué", () => {
    expect(isShowingOfflineData([ok(1)], true)).toBe(false);
    expect(isShowingOfflineData([ok(1)], false)).toBe(true);
    expect(isShowingOfflineData([ok(1), failed(2)], true)).toBe(true);
  });

  test("jamais sans données à l'écran (c'est l'écran d'erreur qui parle)", () => {
    expect(isShowingOfflineData([empty], false)).toBe(false);
    expect(isShowingOfflineData([], false)).toBe(false);
  });

  test("la date annoncée est celle de la donnée la plus ancienne", () => {
    expect(oldestDataStamp([ok(300), failed(100), empty])).toBe(100);
    expect(oldestDataStamp([empty])).toBeNull();
  });
});
