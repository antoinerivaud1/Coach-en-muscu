import { test, expect } from "@playwright/test";
import { catalogFilter } from "@/lib/queries/exercises";

// CM-86 : catalogue visible = système + mes exercices perso + ceux du duo.

const ME = "44444444-4444-4444-4444-444444444444";
const DUO = "33333333-3333-3333-3333-333333333333";

test.describe("catalogFilter (CM-86)", () => {
  test("solo : système + mes exercices perso", () => {
    expect(catalogFilter(null, ME)).toBe(
      `and(duo_id.is.null,owner_profile_id.is.null),owner_profile_id.eq.${ME}`,
    );
  });

  test("en duo : système + mes exercices perso + ceux du duo", () => {
    expect(catalogFilter(DUO, ME)).toBe(
      `and(duo_id.is.null,owner_profile_id.is.null),owner_profile_id.eq.${ME},duo_id.eq.${DUO}`,
    );
  });

  test("sans profil : jamais d'exercice perso", () => {
    expect(catalogFilter(null)).toBe("and(duo_id.is.null,owner_profile_id.is.null)");
    expect(catalogFilter(DUO, null)).toBe(
      `and(duo_id.is.null,owner_profile_id.is.null),duo_id.eq.${DUO}`,
    );
  });
});
