import { test, expect } from "@playwright/test";
import {
  REFUSED_MESSAGE,
  RLS_DENIED_CODE,
  isRlsDenied,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";

// Tests unitaires purs (CM-59 B) : refus de la RLS côté server actions.

test.describe("isRlsDenied", () => {
  test("code 42501 : refus", () => {
    expect(RLS_DENIED_CODE).toBe("42501");
    expect(isRlsDenied({ code: "42501" })).toBe(true);
  });

  test("autres codes, null, absent : pas un refus", () => {
    expect(isRlsDenied({ code: "23505" })).toBe(false);
    expect(isRlsDenied({ code: null })).toBe(false);
    expect(isRlsDenied({})).toBe(false);
    expect(isRlsDenied(null)).toBe(false);
    expect(isRlsDenied(undefined)).toBe(false);
  });
});

test.describe("writeErrorMessage", () => {
  test("refus RLS : message générique, sans détail technique", () => {
    const msg = writeErrorMessage({
      code: "42501",
      message: 'new row violates row-level security policy for table "sessions"',
    });
    expect(msg).toBe(REFUSED_MESSAGE);
    expect(msg).not.toContain("row-level");
  });

  test("autre erreur : message d'origine", () => {
    expect(writeErrorMessage({ code: "23505", message: "duplicate key" })).toBe("duplicate key");
  });
});

test.describe("touchedRows", () => {
  test("au moins une ligne", () => {
    expect(touchedRows([{ id: "x" }])).toBe(true);
  });

  test("0 ligne, null ou absent : refus", () => {
    expect(touchedRows([])).toBe(false);
    expect(touchedRows(null)).toBe(false);
    expect(touchedRows(undefined)).toBe(false);
  });
});
