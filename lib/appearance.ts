/**
 * CM-116 : apparence de l'app (thème clair ou sombre), choisie dans
 * Profil › Apparence et gardée sur l'appareil (localStorage, comme le réglage
 * d'affichage d'iOS : par téléphone, pas par compte).
 *
 * - `auto` (défaut) : suit l'iPhone, qui passe déjà en sombre au coucher du
 *   soleil si l'utilisateur l'a réglé ainsi ;
 * - `light` / `dark` : forcé ;
 * - `time` : sombre sur une plage horaire (19:00 à 07:00 par défaut), pour les
 *   séances du soir.
 *
 * Module pur (aucun import navigateur), testé dans tests/unit/appearance.spec.ts.
 * Le même calcul tourne AVANT le premier rendu dans `THEME_BOOT_SCRIPT`
 * (app/layout.tsx), pour éviter un flash de la mauvaise couleur ; le test
 * vérifie que les deux donnent le même résultat.
 */

export type AppearanceMode = "auto" | "light" | "dark" | "time";
export type Theme = "light" | "dark";

export type Appearance = {
  mode: AppearanceMode;
  /** « HH:MM » : début de la plage sombre (mode `time`). */
  darkFrom: string;
  /** « HH:MM » : retour au clair (mode `time`). */
  lightFrom: string;
};

export const APPEARANCE_KEY = "cm:appearance";

/** Événement envoyé sur `window` quand le réglage change dans cet onglet. */
export const APPEARANCE_EVENT = "cm:appearance-change";

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "auto",
  darkFrom: "19:00",
  lightFrom: "07:00",
};

/** Couleur de fond de chaque thème (barre d'état, `theme-color`). */
export const THEME_BACKGROUND: Record<Theme, string> = {
  dark: "#111114",
  light: "#F2F2F5",
};

const MODES: readonly AppearanceMode[] = ["auto", "light", "dark", "time"];

/** Minutes depuis minuit d'une heure « HH:MM », null si illisible. */
export function minutesOf(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Réglage lu depuis le stockage ; tout ce qui est illisible prend le défaut. */
export function parseAppearance(raw: string | null | undefined): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    const v = JSON.parse(raw) as Partial<Appearance>;
    return {
      mode: MODES.includes(v.mode as AppearanceMode) ? (v.mode as AppearanceMode) : "auto",
      darkFrom:
        typeof v.darkFrom === "string" && minutesOf(v.darkFrom) !== null
          ? v.darkFrom
          : DEFAULT_APPEARANCE.darkFrom,
      lightFrom:
        typeof v.lightFrom === "string" && minutesOf(v.lightFrom) !== null
          ? v.lightFrom
          : DEFAULT_APPEARANCE.lightFrom,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Vrai si `now` tombe dans la plage sombre [darkFrom, lightFrom[. */
export function inDarkWindow(a: Appearance, now: Date): boolean {
  const d = minutesOf(a.darkFrom) ?? 19 * 60;
  const l = minutesOf(a.lightFrom) ?? 7 * 60;
  const n = now.getHours() * 60 + now.getMinutes();
  if (d === l) return false;
  // 19:00 → 07:00 : la plage traverse minuit.
  return d > l ? n >= d || n < l : n >= d && n < l;
}

/** Thème à afficher. `systemDark` : réglage d'affichage de l'appareil. */
export function resolveTheme(a: Appearance, now: Date, systemDark: boolean): Theme {
  switch (a.mode) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "time":
      return inDarkWindow(a, now) ? "dark" : "light";
    default:
      return systemDark ? "dark" : "light";
  }
}

/** « 19:00 » → « 19 h », « 06:30 » → « 6 h 30 ». */
export function frenchHour(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return m && m !== "00" ? `${Number(h)} h ${m}` : `${Number(h)} h`;
}

/** Libellé court du réglage (ligne « Apparence » du Profil). */
export function appearanceLabel(a: Appearance): string {
  switch (a.mode) {
    case "light":
      return "Clair";
    case "dark":
      return "Sombre";
    case "time":
      return `Sombre de ${frenchHour(a.darkFrom)} à ${frenchHour(a.lightFrom)}`;
    default:
      return "Automatique";
  }
}

/**
 * Script en ligne de <head> : pose `data-theme` avant le premier rendu.
 * Même calcul que `parseAppearance` + `resolveTheme`, en JavaScript sans
 * dépendance (il tourne avant le bundle). Ne lève jamais : en cas d'erreur, le
 * CSS suit le système (`:root:not([data-theme])`).
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var a={mode:"auto",darkFrom:"19:00",lightFrom:"07:00"};
var re=/^([01]\\d|2[0-3]):([0-5]\\d)$/;
function mn(s){var m=re.exec(s);return m?(+m[1])*60+(+m[2]):null}
try{var r=window.localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});if(r){var v=JSON.parse(r);
if(["auto","light","dark","time"].indexOf(v.mode)>=0)a.mode=v.mode;
if(typeof v.darkFrom==="string"&&mn(v.darkFrom)!==null)a.darkFrom=v.darkFrom;
if(typeof v.lightFrom==="string"&&mn(v.lightFrom)!==null)a.lightFrom=v.lightFrom;}}catch(e){}
var t;
if(a.mode==="light"||a.mode==="dark"){t=a.mode}
else if(a.mode==="time"){var d=mn(a.darkFrom),l=mn(a.lightFrom),now=new Date(),n=now.getHours()*60+now.getMinutes();
t=d===l?"light":(d>l?(n>=d||n<l):(n>=d&&n<l))?"dark":"light"}
else{t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
var el=document.documentElement;el.setAttribute("data-theme",t);
var c=t==="dark"?${JSON.stringify(THEME_BACKGROUND.dark)}:${JSON.stringify(THEME_BACKGROUND.light)};
var ms=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<ms.length;i++){ms[i].setAttribute("content",c);ms[i].removeAttribute("media")}
}catch(e){}})();`;
