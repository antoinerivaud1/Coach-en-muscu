import { test, expect } from "@playwright/test";
import { buildLastDoneByDay } from "@/lib/queries/sessions";

// Tests unitaires purs (CM-67) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test.describe("buildLastDoneByDay (CM-81)", () => {
  test("retient la séance la plus récente de chaque séance type", () => {
    const lastDone = buildLastDoneByDay([
      { program_day_id: "dos", performed_at: "2026-09-01T18:00:00.000Z" },
      { program_day_id: "pec", performed_at: "2026-09-12T18:00:00.000Z" },
      { program_day_id: "dos", performed_at: "2026-09-07T18:00:00.000Z" },
    ]);

    expect(lastDone.get("dos")).toBe("2026-09-07T18:00:00.000Z");
    expect(lastDone.get("pec")).toBe("2026-09-12T18:00:00.000Z");
  });

  test("ne dépend pas de l'ordre d'arrivée des séances", () => {
    const rows = [
      { program_day_id: "dos", performed_at: "2026-09-07T18:00:00.000Z" },
      { program_day_id: "dos", performed_at: "2026-09-01T18:00:00.000Z" },
    ];

    expect(buildLastDoneByDay(rows).get("dos")).toBe(
      buildLastDoneByDay([...rows].reverse()).get("dos"),
    );
  });

  test("ignore les séances détachées de toute séance type", () => {
    const lastDone = buildLastDoneByDay([
      { program_day_id: null, performed_at: "2026-09-12T18:00:00.000Z" },
    ]);

    expect(lastDone.size).toBe(0);
  });

  test("une séance type jamais faite n'a pas d'entrée", () => {
    const lastDone = buildLastDoneByDay([
      { program_day_id: "dos", performed_at: "2026-09-07T18:00:00.000Z" },
    ]);

    expect(lastDone.has("jambes")).toBe(false);
    expect(lastDone.get("jambes") ?? null).toBeNull();
  });
});
