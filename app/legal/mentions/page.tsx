// Texte à faire relire par Antoine.
// CM-93 : mentions légales (loi n° 2004-575 du 21 juin 2004, LCEN, article 6).
// Page publique et statique : aucune requête, aucune session.
import type { Metadata } from "next";
import LegalPage, { A, ContactEmail, Facts, P, Section, Value } from "@/components/legal/LegalPage";
import { LEGAL, type LegalHost } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Mentions légales · Coach en Muscu",
  description: "Mentions légales de l'app Coach en Muscu : éditeur et hébergeurs.",
};

const TOC = [
  { id: "editeur", title: "Éditeur" },
  { id: "publication", title: "Directeur de la publication" },
  { id: "hebergement", title: "Hébergement" },
  { id: "propriete", title: "Propriété intellectuelle" },
  { id: "contact", title: "Contact" },
] as const;

function hostRows(h: LegalHost) {
  return [
    { label: "Prestataire", value: h.name },
    { label: "Rôle", value: h.role },
    { label: "Adresse", value: h.address },
    { label: "Téléphone", value: h.phone },
    { label: "Site", value: <A href={h.website}>{h.website.replace("https://", "")}</A> },
  ];
}

export default function MentionsPage() {
  const e = LEGAL.editor;
  return (
    <LegalPage current="mentions" title="Mentions légales" toc={TOC}>
      <Section id="editeur" n={1} title={TOC[0].title}>
        <P>
          L’application {LEGAL.appName} et son site web sont édités par :
        </P>
        <Facts
          rows={[
            { label: "Nom", value: e.name },
            { label: "Statut", value: e.status },
            { label: "SIRET", value: e.siret },
            { label: "Adresse", value: e.address },
            { label: "Téléphone", value: e.phone },
            { label: "Email", value: <ContactEmail /> },
            { label: "Site", value: LEGAL.siteUrl },
          ]}
        />
      </Section>

      <Section id="publication" n={2} title={TOC[1].title}>
        <P>
          Directeur de la publication : <Value value={e.publicationDirector} />.
        </P>
      </Section>

      <Section id="hebergement" n={3} title={TOC[2].title}>
        <P>Le site et l’application web sont hébergés par :</P>
        <Facts rows={hostRows(LEGAL.hosts.web)} />
        <P>Les données de l’app (base de données et comptes) sont hébergées par :</P>
        <Facts rows={hostRows(LEGAL.hosts.data)} />
        <P>
          L’app iOS est distribuée par Apple via l’App Store.
        </P>
      </Section>

      <Section id="propriete" n={4} title={TOC[3].title}>
        <P>
          Le nom {LEGAL.appName}, le design, les textes et le code de l’app sont protégés par
          le droit de la propriété intellectuelle. Toute reproduction non autorisée est
          interdite. Les éléments de tiers (bibliothèques, polices) sont utilisés selon leurs
          licences, listées dans les <A href="/credits">crédits et licences</A>.
        </P>
      </Section>

      <Section id="contact" n={5} title={TOC[4].title}>
        <P>
          Pour toute question, signalement ou demande relative à tes données :{" "}
          <ContactEmail />
        </P>
      </Section>
    </LegalPage>
  );
}
