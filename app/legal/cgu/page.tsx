// Texte à faire relire par Antoine.
// CM-93 : conditions générales d'utilisation et conditions d'abonnement.
// Page publique et statique : aucune requête, aucune session.
import type { Metadata } from "next";
import LegalPage, { A, B, ContactEmail, Li, Muted, P, Section, Ul, Value } from "@/components/legal/LegalPage";
import { LEGAL, formatPrice } from "@/lib/legal";

export const metadata: Metadata = {
  title: "CGU et abonnement · Coach en Muscu",
  description: "Conditions générales d'utilisation et conditions d'abonnement de Coach en Muscu.",
};

const TOC = [
  { id: "objet", title: "Objet et acceptation" },
  { id: "compte", title: "Accès à l’app et compte" },
  { id: "service", title: "Le service" },
  { id: "duo", title: "Le duo" },
  { id: "sante", title: "Santé et sécurité" },
  { id: "abonnement", title: "Conditions d’abonnement Premium" },
  { id: "usage", title: "Règles d’utilisation" },
  { id: "propriete", title: "Propriété intellectuelle et contenus" },
  { id: "responsabilite", title: "Disponibilité et responsabilité" },
  { id: "fin", title: "Fin du compte" },
  { id: "donnees", title: "Données personnelles" },
  { id: "evolution", title: "Modification des conditions" },
  { id: "droit", title: "Droit applicable et litiges" },
] as const;

export default function CguPage() {
  const monthly = formatPrice(LEGAL.pricing.monthlyCents);
  const yearly = formatPrice(LEGAL.pricing.yearlyCents);
  const trial = LEGAL.pricing.yearlyTrialDays;
  return (
    <LegalPage
      current="cgu"
      title="Conditions générales d’utilisation"
      toc={TOC}
      intro={`Ces conditions encadrent l’utilisation de ${LEGAL.appName}, y compris l’abonnement Premium. Elles sont rédigées pour être lues : si un point n’est pas clair, écris au support.`}
    >
      <Section id="objet" n={1} title={TOC[0].title}>
        <P>
          {LEGAL.appName} est une application de suivi de musculation éditée par{" "}
          <B>{LEGAL.editor.name}</B> (voir les <A href="/legal/mentions">mentions légales</A>).
          En créant un compte ou en utilisant l’app, tu acceptes les présentes conditions.
        </P>
        <P>
          Si tu as téléchargé l’app sur l’App Store, les conditions d’utilisation d’Apple
          s’appliquent également, notamment pour le téléchargement et les achats intégrés.
        </P>
      </Section>

      <Section id="compte" n={2} title={TOC[1].title}>
        <Ul>
          <Li>L’app est réservée aux personnes de {LEGAL.minAge} ans et plus.</Li>
          <Li>
            Un compte est personnel. Tu t’engages à fournir une adresse email valide et à
            garder ton mot de passe confidentiel. Toute action faite depuis ton compte est
            réputée faite par toi.
          </Li>
          <Li>
            Si tu penses que ton compte a été utilisé par quelqu’un d’autre, préviens le
            support sans attendre.
          </Li>
        </Ul>
      </Section>

      <Section id="service" n={3} title={TOC[2].title}>
        <P>
          L’app permet d’enregistrer tes séances et tes séries (poids, répétitions), de créer
          des séances types et des exercices personnalisés, de suivre ta progression et de
          t’entraîner en duo.
        </P>
        <P>
          Une partie des fonctions est gratuite. Certaines fonctions sont réservées aux
          abonnés Premium ; la liste à jour est présentée dans l’app avant toute
          souscription. L’éditeur peut faire évoluer les fonctions de l’app, en particulier
          pour l’améliorer ou la sécuriser.
        </P>
      </Section>

      <Section id="duo" n={4} title={TOC[3].title}>
        <P>
          Un duo réunit deux comptes. Les membres d’un duo voient mutuellement leurs séances,
          statistiques et records. On rejoint un duo uniquement en acceptant une invitation,
          et on peut le quitter à tout moment.
        </P>
        <P>
          Le partenaire invité dans le duo d’un abonné Premium profite des fonctions duo sans
          avoir à souscrire son propre abonnement.
        </P>
      </Section>

      <Section id="sante" n={5} title={TOC[4].title}>
        <P>
          L’app est un carnet d’entraînement. Ce n’est ni un dispositif médical, ni un
          programme de coaching personnalisé, et elle ne remplace pas l’avis d’un médecin ou
          d’un professionnel du sport.
        </P>
        <P>
          Avant de commencer ou d’intensifier un entraînement, en particulier en cas de
          problème de santé, demande l’avis d’un médecin. Les guides d’exercices et les
          suggestions de l’app sont des repères généraux : adapte les charges à ton niveau et
          arrête en cas de douleur. Tu pratiques sous ta propre responsabilité.
        </P>
      </Section>

      <Section id="abonnement" n={6} title={TOC[5].title}>
        <P>Premium est proposé par abonnement, via les achats intégrés d’Apple :</P>
        <Ul>
          <Li>
            <B>Mensuel :</B> {monthly} par mois.
          </Li>
          <Li>
            <B>Annuel :</B> {yearly} par an, avec un essai gratuit de {trial} jours.
          </Li>
        </Ul>
        <Muted>
          Prix TTC indicatifs pour la France. Le prix applicable est celui affiché par l’App
          Store au moment de la souscription ; il peut varier selon le pays.
        </Muted>
        <Ul>
          <Li>
            Le paiement est débité sur ton compte Apple à la confirmation de l’achat ou, pour
            l’abonnement annuel avec essai, à la fin de l’essai gratuit.
          </Li>
          <Li>
            L’abonnement se renouvelle automatiquement pour la même durée, sauf si tu le
            résilies au moins 24 heures avant la fin de la période en cours. Le
            renouvellement est débité dans les 24 heures précédant la fin de la période.
          </Li>
          <Li>
            Si tu résilies pendant l’essai gratuit au moins 24 heures avant sa fin, rien
            n’est débité. Toute partie non utilisée de l’essai gratuit est perdue si tu
            souscris un abonnement pendant l’essai.
          </Li>
          <Li>
            Tu gères et résilies ton abonnement dans les réglages de ton identifiant Apple
            (Réglages, puis ton nom, puis Abonnements). Supprimer l’app ou ton compte ne
            résilie pas l’abonnement.
          </Li>
          <Li>
            Après résiliation, Premium reste actif jusqu’à la fin de la période déjà payée.
          </Li>
          <Li>
            Les paiements et les remboursements sont gérés par Apple, selon ses conditions.
            Une demande de remboursement se fait auprès d’Apple :{" "}
            <A href="https://reportaproblem.apple.com">reportaproblem.apple.com</A>.
          </Li>
          <Li>
            En cas de changement de prix, Apple t’en informe à l’avance selon ses règles, et
            tu restes libre de résilier.
          </Li>
        </Ul>
      </Section>

      <Section id="usage" n={7} title={TOC[6].title}>
        <P>En utilisant l’app, tu t’engages à ne pas :</P>
        <Ul>
          <Li>tenter d’accéder aux données d’autres utilisateurs ou à des parties non autorisées du service ;</Li>
          <Li>perturber le fonctionnement de l’app, par exemple par des envois automatisés massifs ;</Li>
          <Li>utiliser l’app à des fins illégales ou pour nuire à autrui ;</Li>
          <Li>copier, revendre ou décompiler l’app, sauf dans les cas autorisés par la loi.</Li>
        </Ul>
      </Section>

      <Section id="propriete" n={8} title={TOC[7].title}>
        <P>
          L’app, son nom, son design et ses textes appartiennent à l’éditeur ou à ses
          partenaires (voir les <A href="/credits">crédits et licences</A>). Tu disposes d’un
          droit d’utilisation personnel, non exclusif et non transférable, pour la durée
          d’utilisation de l’app.
        </P>
        <P>
          Les données que tu saisis (séances, séries, exercices personnalisés) restent les
          tiennes. Tu autorises l’éditeur à les stocker et à les traiter uniquement pour
          faire fonctionner le service, y compris leur affichage à ton partenaire de duo.
        </P>
      </Section>

      <Section id="responsabilite" n={9} title={TOC[8].title}>
        <P>
          L’éditeur fait de son mieux pour que l’app soit disponible et fiable, sans pouvoir
          garantir une disponibilité permanente : maintenances, mises à jour ou pannes des
          prestataires peuvent l’interrompre temporairement.
        </P>
        <P>
          La responsabilité de l’éditeur ne peut être engagée pour un dommage résultant d’une
          mauvaise utilisation de l’app, d’une pratique sportive inadaptée ou d’un événement
          hors de son contrôle. Rien dans ces conditions ne limite les droits que la loi
          accorde aux consommateurs.
        </P>
      </Section>

      <Section id="fin" n={10} title={TOC[9].title}>
        <P>
          Tu peux arrêter d’utiliser l’app et demander la suppression de ton compte à tout
          moment (bientôt directement depuis Profil, en attendant via le{" "}
          <A href="/support#suppression">support</A>).
        </P>
        <P>
          En cas de manquement grave à ces conditions, l’éditeur peut suspendre ou fermer le
          compte concerné, après t’en avoir informé sauf urgence ou obligation légale.
        </P>
      </Section>

      <Section id="donnees" n={11} title={TOC[10].title}>
        <P>
          L’utilisation de tes données est décrite dans la{" "}
          <A href="/legal/confidentialite">politique de confidentialité</A>.
        </P>
      </Section>

      <Section id="evolution" n={12} title={TOC[11].title}>
        <P>
          Ces conditions peuvent évoluer. La date de mise à jour figure en haut de la page.
          En cas de changement important, tu en seras informé dans l’app avant son entrée
          en vigueur.
        </P>
      </Section>

      <Section id="droit" n={13} title={TOC[12].title}>
        <P>
          Ces conditions sont soumises au droit français. En cas de difficulté, contacte
          d’abord le support : <ContactEmail />
        </P>
        <P>
          Si aucune solution n’est trouvée, tu peux recourir gratuitement au médiateur de la
          consommation : <Value value={LEGAL.consumerMediator} />.
        </P>
        <P>
          À défaut d’accord amiable, le litige relève des tribunaux compétents selon les
          règles de droit commun ; en tant que consommateur, tu peux saisir la juridiction
          de ton domicile.
        </P>
      </Section>
    </LegalPage>
  );
}
