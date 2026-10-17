"use client";

import { useEffect, useState } from "react";
import {
  APPEARANCE_EVENT,
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveTheme,
  type Appearance,
  type AppearanceMode,
  type Theme,
} from "@/lib/appearance";

/**
 * CM-116 : Profil › Apparence. Le réglage est gardé sur l'appareil
 * (localStorage) et appliqué tout de suite par ThemeController
 * (événement `APPEARANCE_EVENT`).
 */

const MODES: { id: AppearanceMode; label: string; sub: string }[] = [
  { id: "auto", label: "Automatique", sub: "Suit ton iPhone : sombre au coucher du soleil si tu l'as réglé ainsi" },
  { id: "light", label: "Clair", sub: "Toujours clair" },
  { id: "dark", label: "Sombre", sub: "Toujours sombre" },
  { id: "time", label: "Selon l'heure", sub: "Sombre pour les séances du soir" },
];

function readStored(): Appearance {
  try {
    return parseAppearance(window.localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function store(a: Appearance) {
  try {
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    // Stockage bloqué (navigation privée) : le réglage vaut pour la page.
  }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

function systemDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function PhonePreview({ theme }: { theme: Theme }) {
  const dark = theme === "dark";
  return (
    <span
      aria-hidden
      className="flex h-[164px] w-[92px] flex-col gap-1.5 rounded-[18px] px-2 pt-3.5"
      style={{
        background: dark ? "#111114" : "#F2F2F5",
        boxShadow: dark ? "0 0 0 1px rgba(255,255,255,0.12)" : "0 0 0 1px rgba(0,0,0,0.08)",
      }}
    >
      <span className="h-2 w-[46px] rounded" style={{ background: dark ? "#F5F5F7" : "#111114" }} />
      <span className="flex h-[52px] flex-col rounded-[10px] p-2" style={{ background: dark ? "#1B1B1F" : "#FFFFFF" }}>
        <span className="h-2.5 w-9 rounded" style={{ background: dark ? "#F5F5F7" : "#111114" }} />
        <span className="mt-3.5 h-3 rounded-full" style={{ background: "#FF7A45" }} />
      </span>
      <span className="h-[30px] rounded-[10px]" style={{ background: dark ? "#1B1B1F" : "#FFFFFF" }} />
      <span
        className="mb-2 mt-auto h-4 rounded-full"
        style={{
          background: dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.9)",
          boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,0.3)" : "0 2px 6px rgba(0,0,0,0.12)",
        }}
      />
    </span>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[26px] w-[26px] items-center justify-center rounded-full ${
        on ? "bg-energy text-energy-fg" : "border-2 border-edge text-transparent"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

export default function AppearanceScreen() {
  const [a, setA] = useState<Appearance | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [sysDark, setSysDark] = useState(true);

  useEffect(() => {
    setA(readStored());
    setSysDark(systemDark());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!a) return <div className="mt-6 h-64 animate-pulse rounded-card bg-surface" />;

  const update = (next: Appearance) => {
    setA(next);
    store(next);
  };
  const shown = resolveTheme(a, now, sysDark);

  return (
    <div className="mt-5 flex flex-col gap-3.5">
      <section aria-label="Aperçu" className="grid grid-cols-2 gap-3 rounded-card bg-surface px-4 pb-3.5 pt-[18px] shadow-[0_0_0_1px_var(--line)]">
        {(["light", "dark"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={shown === t}
            onClick={() => update({ ...a, mode: t })}
            className="flex flex-col items-center gap-2"
          >
            <PhonePreview theme={t} />
            <span className="text-[15px] font-semibold text-fg">{t === "light" ? "Clair" : "Sombre"}</span>
            <Check on={shown === t} />
          </button>
        ))}
      </section>

      <section aria-label="Mode" role="radiogroup" className="overflow-hidden rounded-card bg-surface shadow-[0_0_0_1px_var(--line)]">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={a.mode === m.id}
            onClick={() => update({ ...a, mode: m.id })}
            className={`flex min-h-16 w-full items-center gap-2.5 px-4 py-2 text-left ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="flex-1">
              <span className="block text-[17px] leading-[22px] text-fg">{m.label}</span>
              <span className="block text-[15px] leading-5 text-fg-muted">{m.sub}</span>
            </span>
            {a.mode === m.id && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-accent" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        ))}
      </section>

      {a.mode === "time" && (
        <section aria-label="Plage horaire" className="overflow-hidden rounded-card bg-surface shadow-[0_0_0_1px_var(--line)]">
          <label className="flex min-h-[52px] items-center gap-2.5 px-4">
            <span className="flex-1 text-[17px] text-fg">Sombre à partir de</span>
            <input
              type="time"
              value={a.darkFrom}
              onChange={(e) => e.target.value && update({ ...a, darkFrom: e.target.value })}
              className="h-9 rounded-[10px] bg-surface2 px-3 font-oswald text-[17px] font-semibold text-fg"
            />
          </label>
          <label className="flex min-h-[52px] items-center gap-2.5 border-t border-line px-4">
            <span className="flex-1 text-[17px] text-fg">Clair à partir de</span>
            <input
              type="time"
              value={a.lightFrom}
              onChange={(e) => e.target.value && update({ ...a, lightFrom: e.target.value })}
              className="h-9 rounded-[10px] bg-surface2 px-3 font-oswald text-[17px] font-semibold text-fg"
            />
          </label>
        </section>
      )}

      <p className="mx-2 text-[15px] leading-5 text-fg-muted">
        Pendant une séance, l&apos;apparence ne change pas : elle est fixée à l&apos;ouverture, pour ne jamais
        basculer entre deux séries.
      </p>
    </div>
  );
}
