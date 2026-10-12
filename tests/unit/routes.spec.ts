import { test, expect } from "@playwright/test";
import { SEANCE_EDIT_PATH, SESSION_VIEW_PATH, seanceEditPath, sessionPath } from "@/lib/routes";
import { loginPath, safeNextPath } from "@/lib/auth/core";

// CM-89 (PR 2) : plus de route dynamique, l'id passe en query. Tests purs.

const ID = "0b6f7c1e-3d2a-4c5b-9e8f-1a2b3c4d5e6f";

test.describe("sessionPath (CM-89 PR 2)", () => {
  test("séance seule", () => {
    expect(sessionPath(ID)).toBe(`/sessions/view?id=${ID}`);
    expect(sessionPath(ID, {})).toBe(`${SESSION_VIEW_PATH}?id=${ID}`);
  });

  test("« Modifier » et « Corriger les séries »", () => {
    expect(sessionPath(ID, { edit: true })).toBe(`/sessions/view?id=${ID}&edit=1`);
    expect(sessionPath(ID, { editSets: true })).toBe(`/sessions/view?id=${ID}&editsets=1`);
    expect(sessionPath(ID, { edit: false, editSets: false })).toBe(`/sessions/view?id=${ID}`);
  });

  test("`edit` l'emporte sur `editSets`, comme à la lecture", () => {
    expect(sessionPath(ID, { edit: true, editSets: true })).toBe(`/sessions/view?id=${ID}&edit=1`);
  });

  test("id encodé : aucune query injectée", () => {
    expect(sessionPath("a&edit=1")).toBe("/sessions/view?id=a%26edit%3D1");
    expect(new URL(sessionPath("a b#c"), "http://x.invalid").searchParams.get("id")).toBe("a b#c");
  });

  test("utilisable comme `next` de connexion", () => {
    const path = sessionPath(ID, { edit: true });
    expect(safeNextPath(path)).toBe(path);
    expect(loginPath(path)).toBe(`/login?next=${encodeURIComponent(path)}`);
  });
});

test.describe("seanceEditPath (CM-89 PR 2)", () => {
  test("éditeur d'une séance type", () => {
    expect(seanceEditPath(ID)).toBe(`/seances/edit?id=${ID}`);
    expect(seanceEditPath(ID).startsWith(`${SEANCE_EDIT_PATH}?`)).toBe(true);
  });

  test("id encodé", () => {
    expect(seanceEditPath("x/y?z")).toBe("/seances/edit?id=x%2Fy%3Fz");
  });

  test("utilisable comme `next` de connexion", () => {
    expect(safeNextPath(seanceEditPath(ID))).toBe(seanceEditPath(ID));
  });
});
