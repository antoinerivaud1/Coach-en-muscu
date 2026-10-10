// CM-93 : mise en page commune des pages légales, support et crédits.
// Pages publiques (lib/auth/publicPaths.ts) : aucune requête, aucune session.
import Link from "next/link";
import { Children, type ReactNode } from "react";
import BackButton from "@/components/BackButton";
import { LEGAL, isTodo } from "@/lib/legal";
import { frenchTypo } from "@/lib/typo";

export type LegalPageKey = "confidentialite" | "cgu" | "mentions" | "support" | "credits";

export const LEGAL_PAGES: readonly { key: LegalPageKey; href: string; label: string; sub: string }[] = [
  {
    key: "confidentialite",
    href: "/legal/confidentialite",
    label: "Confidentialité",
    sub: "Données collectées, usage, tes droits",
  },
  {
    key: "cgu",
    href: "/legal/cgu",
    label: "CGU et abonnement",
    sub: "Règles d'utilisation, Premium, résiliation",
  },
  {
    key: "mentions",
    href: "/legal/mentions",
    label: "Mentions légales",
    sub: "Éditeur et hébergeurs",
  },
  { key: "support", href: "/support", label: "Support", sub: "Questions fréquentes et contact" },
  {
    key: "credits",
    href: "/credits",
    label: "Crédits et licences",
    sub: "Bibliothèques et polices utilisées",
  },
];

/** Applique la typographie française aux enfants texte directs. */
function fr(children: ReactNode): ReactNode {
  return Children.map(children, (c) => (typeof c === "string" ? frenchTypo(c) : c));
}

export type TocItem = { id: string; title: string };

export default function LegalPage({
  current,
  title,
  intro,
  toc,
  children,
}: {
  current: LegalPageKey;
  title: string;
  intro?: string;
  toc?: readonly TocItem[];
  children: ReactNode;
}) {
  const others = LEGAL_PAGES.filter((p) => p.key !== current);
  return (
    <main className="min-h-[100dvh] px-5 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <BackButton fallback="/" />
          <span className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-energy font-oswald text-sm font-bold text-ink"
              aria-hidden
            >
              C
            </span>
            <span className="font-oswald text-xs font-bold uppercase tracking-[0.2em] text-fg">
              {LEGAL.appName}
            </span>
          </span>
        </div>

        <h1 className="mt-7 text-balance text-[34px] font-black leading-[1.05] tracking-tight text-fg">
          {fr(title)}
          <span className="text-energy">.</span>
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          {frenchTypo("Dernière mise à jour :")}{" "}
          <time dateTime={LEGAL.lastUpdatedIso}>{LEGAL.lastUpdated}</time>
        </p>
        {intro && <p className="mt-5 text-base leading-[1.6] text-fg">{frenchTypo(intro)}</p>}

        {toc && toc.length > 0 && (
          <nav aria-label="Sommaire" className="mt-7 rounded-2xl border border-line bg-surface p-4">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-fg-muted">
              Sommaire
            </p>
            <ol className="mt-3 flex flex-col gap-1">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="flex gap-3 rounded-lg py-1.5 text-base text-fg hover:text-energy"
                  >
                    <span className="w-6 flex-none text-right font-oswald font-semibold text-energy">
                      {i + 1}
                    </span>
                    <span>{frenchTypo(item.title)}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <div className="mt-2">{children}</div>

        <nav aria-label="Autres pages" className="mt-14 border-t border-line pt-8">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-fg-muted">
            Voir aussi
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {others.map((p) => (
              <li key={p.key}>
                <Link
                  href={p.href}
                  className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-white/20"
                >
                  <span className="flex-1">
                    <span className="block font-extrabold text-fg">{p.label}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-fg-muted">
                      {frenchTypo(p.sub)}
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 flex-none text-fg-muted"
                    aria-hidden
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm text-fg-muted">
            {frenchTypo("Une question ? Écris-nous :")} <ContactEmail />
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            © 2026 {LEGAL.editor.name} · {LEGAL.appName}
          </p>
        </nav>
      </div>
    </main>
  );
}

/** Section numérotée, ancre du sommaire. */
export function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="mt-10 scroll-mt-6">
      <h2
        id={`${id}-titre`}
        className="flex gap-3 text-balance text-[22px] font-extrabold leading-tight tracking-tight text-fg"
      >
        {n !== undefined && (
          <span className="flex-none font-oswald font-semibold text-energy">{n}</span>
        )}
        <span>{frenchTypo(title)}</span>
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-base leading-[1.6] text-fg">{children}</div>
    </section>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-3 text-balance text-lg font-extrabold text-fg">{fr(children)}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{fr(children)}</p>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[1.55] text-fg-muted">{fr(children)}</p>;
}

export function Ul({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2 pl-1">{children}</ul>;
}

export function Li({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[11px] h-1.5 w-1.5 flex-none rounded-full bg-energy" aria-hidden />
      <span>{fr(children)}</span>
    </li>
  );
}

export function B({ children }: { children: ReactNode }) {
  return <strong className="font-bold text-fg">{fr(children)}</strong>;
}

const LINK_CLASS =
  "font-semibold text-energy underline decoration-energy/40 underline-offset-4 hover:decoration-energy";

/** Lien interne (Link) ou externe (nouvel onglet). */
export function A({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={LINK_CLASS}>
        {fr(children)}
      </Link>
    );
  }
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      className={`${LINK_CLASS} break-words`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {fr(children)}
    </a>
  );
}

/** Valeur de la config : surlignée en orange si encore « À COMPLÉTER ». */
export function Value({ value }: { value: string }) {
  if (isTodo(value)) {
    return (
      <mark className="rounded-md bg-flame/15 px-1.5 py-0.5 font-semibold text-flame ring-1 ring-inset ring-flame/50 [box-decoration-break:clone]">
        {frenchTypo(value)}
      </mark>
    );
  }
  return <>{frenchTypo(value)}</>;
}

/** Email de contact : lien mailto, ou champ à compléter surligné. */
export function ContactEmail() {
  const email = LEGAL.editor.email;
  if (isTodo(email)) return <Value value={email} />;
  return <A href={`mailto:${email}`}>{email}</A>;
}

/** Tableau clé / valeur lisible sur téléphone (empilé). */
export function Facts({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <div key={r.label} className="px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">
            {r.label}
          </dt>
          <dd className="mt-1 text-base leading-[1.5] text-fg">
            {typeof r.value === "string" ? <Value value={r.value} /> : r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
