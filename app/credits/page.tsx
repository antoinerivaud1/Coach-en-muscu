// Texte à faire relire par Antoine.
// CM-93 : crédits et licences des composants tiers (accessible depuis Profil).
// Page statique : aucune requête, aucune session.
import type { Metadata } from "next";
import LegalPage, { A, Facts, P, Section } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";
import { LICENSES } from "@/lib/licenses";

export const metadata: Metadata = {
  title: "Crédits et licences · Coach en Muscu",
  description: "Bibliothèques et polices utilisées par Coach en Muscu, et leurs licences.",
};

/**
 * Mise en forme pour téléphone : les retours à la ligne « durs » (largeur
 * 80 colonnes) sont rejoints, les paragraphes, titres en capitales et lignes
 * de tirets sont conservés. Le texte lui-même n'est pas modifié.
 */
function licenseParagraphs(text: string): string[][] {
  const isRule = (line: string) => /^-+$/.test(line);
  return text.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const out: string[] = [];
    lines.forEach((line, i) => {
      const prev = lines[i - 1];
      // Titre de section (« PREAMBLE », « PERMISSION & CONDITIONS ») : 1re ligne du bloc.
      const prevIsHeading = i === 1 && /^[A-Z][A-Z &]+$/.test(prev);
      const startsOwnLine =
        i === 0 || isRule(line) || isRule(prev) || prevIsHeading || /^\d\)/.test(line);
      if (startsOwnLine) out.push(line);
      else out[out.length - 1] += ` ${line}`;
    });
    return out;
  });
}

export default function CreditsPage() {
  const toc = LICENSES.map((l) => ({ id: l.id, title: l.name }));
  return (
    <LegalPage
      current="credits"
      title="Crédits et licences"
      toc={toc}
      intro={`${LEGAL.appName} s’appuie sur des composants libres. Merci à leurs auteurs. Leurs licences sont reproduites ci-dessous, en version originale anglaise.`}
    >
      {LICENSES.map((l, i) => (
        <Section key={l.id} id={l.id} n={i + 1} title={l.name}>
          <Facts
            rows={[
              { label: "Utilisation", value: l.usage },
              { label: "Licence", value: l.license },
              { label: "Source", value: <A href={l.url}>{l.url.replace("https://", "")}</A> },
            ]}
          />
          <P>Texte de la licence :</P>
          <div
            lang="en"
            className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-xs leading-[1.55] text-fg"
          >
            {licenseParagraphs(l.text).map((lines, j) => (
              <p key={j} className="break-words">
                {lines.map((line, k) => (
                  <span key={k}>
                    {k > 0 && <br />}
                    {line}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </Section>
      ))}
    </LegalPage>
  );
}
