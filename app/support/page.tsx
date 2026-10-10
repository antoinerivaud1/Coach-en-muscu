// Texte à faire relire par Antoine.
// CM-93 : page support (URL à déclarer dans App Store Connect).
// Page publique et statique : aucune requête, aucune session.
import type { Metadata } from "next";
import LegalPage, { A, B, ContactEmail, Li, Muted, P, Section, Ul } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Support · Coach en Muscu",
  description: "Aide et contact pour l'app Coach en Muscu.",
};

const TOC = [
  { id: "contact", title: "Nous contacter" },
  { id: "mot-de-passe", title: "J’ai oublié mon mot de passe" },
  { id: "suppression", title: "Comment supprimer mon compte ?" },
  { id: "duo", title: "Comment quitter un duo ?" },
  { id: "abonnement", title: "Gérer ou résilier mon abonnement" },
  { id: "partenaire", title: "Mon partenaire doit-il payer ?" },
  { id: "donnees", title: "Que faites-vous de mes données ?" },
] as const;

export default function SupportPage() {
  return (
    <LegalPage
      current="support"
      title="Support"
      toc={TOC}
      intro="Les réponses aux questions les plus fréquentes, et comment nous joindre."
    >
      <Section id="contact" n={1} title={TOC[0].title}>
        <P>
          Écris-nous par email : <ContactEmail />
        </P>
        <P>
          Pour une demande sur ton compte, écris depuis l’adresse email de ton compte : cela
          nous permet de vérifier qu’il s’agit bien de toi. Indique le modèle de ton téléphone
          et ce qui se passe si tu signales un bug.
        </P>
      </Section>

      <Section id="mot-de-passe" n={2} title={TOC[1].title}>
        <P>
          La réinitialisation du mot de passe depuis l’app arrive bientôt. En attendant,
          écris au support depuis l’adresse email de ton compte : nous t’aidons à retrouver
          l’accès.
        </P>
      </Section>

      <Section id="suppression" n={3} title={TOC[2].title}>
        <P>
          La suppression du compte directement depuis l’app, dans Profil, arrive bientôt.
          Elle effacera ton compte et tes données personnelles (profil, séances, séries,
          exercices personnalisés, appartenance à un duo).
        </P>
        <P>
          En attendant, écris au support depuis l’adresse email de ton compte en demandant la
          suppression : nous la confirmons par email une fois faite.
        </P>
        <Muted>
          Si tu as un abonnement Premium, pense à le résilier aussi dans les réglages de ton
          identifiant Apple : supprimer le compte ne l’arrête pas.
        </Muted>
      </Section>

      <Section id="duo" n={4} title={TOC[3].title}>
        <P>
          Tu peux quitter un duo à tout moment. Une fois sorti, ton ancien partenaire ne voit
          plus tes nouvelles séances et tu ne vois plus les siennes. Tes propres séances
          restent dans ton compte.
        </P>
        <P>
          L’option « Quitter le duo » arrive dans Profil. D’ici là, écris au support et nous
          nous en chargeons.
        </P>
      </Section>

      <Section id="abonnement" n={5} title={TOC[4].title}>
        <P>L’abonnement Premium est géré par Apple. Sur ton iPhone :</P>
        <Ul>
          <Li>
            ouvre <B>Réglages</B>, touche ton nom, puis <B>Abonnements</B> ;
          </Li>
          <Li>
            choisis <B>{LEGAL.appName}</B> pour changer de formule ou <B>Annuler l’abonnement</B>.
          </Li>
        </Ul>
        <P>
          Résilie au moins 24 heures avant la fin de la période en cours pour éviter le
          renouvellement. Premium reste actif jusqu’à la fin de la période payée. Supprimer
          l’app ne résilie pas l’abonnement.
        </P>
        <P>
          Remboursement : la demande se fait auprès d’Apple, sur{" "}
          <A href="https://reportaproblem.apple.com">reportaproblem.apple.com</A>. Détails
          dans les <A href="/legal/cgu#abonnement">conditions d’abonnement</A>.
        </P>
      </Section>

      <Section id="partenaire" n={6} title={TOC[5].title}>
        <P>
          Non. Le partenaire invité dans le duo d’un abonné Premium profite des fonctions duo
          sans abonnement propre.
        </P>
      </Section>

      <Section id="donnees" n={7} title={TOC[6].title}>
        <P>
          Elles servent uniquement à faire fonctionner l’app : pas de publicité, pas de
          revente. Tout est détaillé dans la{" "}
          <A href="/legal/confidentialite">politique de confidentialité</A>.
        </P>
      </Section>
    </LegalPage>
  );
}
