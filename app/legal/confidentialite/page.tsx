// Texte à faire relire par Antoine.
// CM-93 : politique de confidentialité (URL à déclarer dans App Store Connect).
// Page publique et statique : aucune requête, aucune session.
import type { Metadata } from "next";
import LegalPage, { A, B, ContactEmail, Li, Muted, P, Section, Ul, Value } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Confidentialité · Coach en Muscu",
  description: "Politique de confidentialité de l'app Coach en Muscu.",
};

const TOC = [
  { id: "responsable", title: "Qui est responsable de tes données ?" },
  { id: "donnees", title: "Les données que nous traitons" },
  { id: "finalites", title: "Pourquoi et sur quelle base" },
  { id: "duo", title: "Ce que voit ton partenaire de duo" },
  { id: "destinataires", title: "Prestataires et destinataires" },
  { id: "conservation", title: "Durée de conservation" },
  { id: "suppression", title: "Suppression du compte et export" },
  { id: "droits", title: "Tes droits" },
  { id: "securite", title: "Sécurité" },
  { id: "cookies", title: "Cookies et stockage local" },
  { id: "mineurs", title: "Âge minimum" },
  { id: "modifications", title: "Modifications de cette politique" },
] as const;

export default function ConfidentialitePage() {
  const active = LEGAL.subprocessors.filter((s) => s.active);
  const planned = LEGAL.subprocessors.filter((s) => !s.active);
  return (
    <LegalPage
      current="confidentialite"
      title="Politique de confidentialité"
      toc={TOC}
      intro={`${LEGAL.appName} est un carnet de musculation. Cette page explique quelles données l’app utilise, pourquoi, avec qui elles sont partagées et comment exercer tes droits. En résumé : pas de publicité, pas de traceur publicitaire, aucune revente de données.`}
    >
      <Section id="responsable" n={1} title={TOC[0].title}>
        <P>
          Le responsable du traitement est <B>{LEGAL.editor.name}</B>, éditeur de l’app (détails
          dans les <A href="/legal/mentions">mentions légales</A>). Pour toute question sur tes
          données : <ContactEmail />
        </P>
      </Section>

      <Section id="donnees" n={2} title={TOC[1].title}>
        <P>Nous ne collectons que ce qui sert au fonctionnement de l’app :</P>
        <Ul>
          <Li>
            <B>Compte :</B> adresse email, mot de passe (stocké uniquement sous forme chiffrée
            par notre prestataire d’authentification, jamais lisible), prénom ou nom
            d’affichage, photo de profil si tu en ajoutes une, couleur de profil, objectif de
            séances par semaine.
          </Li>
          <Li>
            <B>Entraînement :</B> tes séances (dates, durée, exercices), les séries que tu
            enregistres (poids, répétitions), tes séances types et les exercices
            personnalisés que tu crées.
          </Li>
          <Li>
            <B>Duo :</B> le duo auquel tu appartiens, les invitations envoyées ou acceptées.
          </Li>
          <Li>
            <B>Abonnement :</B> le statut de ton abonnement Premium (actif, en essai, expiré).
            Le paiement est traité par Apple : nous ne recevons jamais tes coordonnées
            bancaires.
          </Li>
          <Li>
            <B>Données techniques :</B> les cookies de session nécessaires à la connexion et
            les journaux techniques des hébergeurs (adresse IP, date, page demandée), utilisés
            pour la sécurité et le diagnostic.
          </Li>
        </Ul>
        <P>
          Connexion avec Apple ou Google (prévue) : si tu choisis cette option, nous recevons
          uniquement l’identifiant de compte et l’adresse email transmis par Apple ou Google
          (éventuellement une adresse relais si tu masques ton email avec Apple).
        </P>
        <P>
          Nous ne collectons pas ta localisation, tes contacts ni tes données de santé
          provenant d’autres apps.
        </P>
      </Section>

      <Section id="finalites" n={3} title={TOC[2].title}>
        <Ul>
          <Li>
            <B>Fournir le service</B> (créer ton compte, enregistrer et afficher tes séances,
            calculer tes statistiques et records, faire fonctionner le duo, gérer ton
            abonnement) : exécution du contrat qui nous lie, c’est-à-dire les{" "}
            <A href="/legal/cgu">conditions générales d’utilisation</A> (article 6.1.b du RGPD).
          </Li>
          <Li>
            <B>Sécuriser l’app et corriger les bugs</B> (journaux techniques, prévention des
            abus) : notre intérêt légitime à fournir un service fiable (article 6.1.f du RGPD).
          </Li>
          <Li>
            <B>Répondre à tes demandes</B> envoyées au support : exécution du contrat ou
            intérêt légitime selon la demande.
          </Li>
          <Li>
            <B>Respecter nos obligations légales</B> (par exemple répondre à une autorité
            habilitée) : article 6.1.c du RGPD.
          </Li>
        </Ul>
        <P>
          Les notifications du minuteur de repos sont des notifications locales, programmées
          sur ton téléphone avec ton autorisation : elles ne passent pas par nos serveurs.
        </P>
        <P>
          Nous n’utilisons tes données ni pour de la publicité, ni pour du profilage
          publicitaire, et nous ne les vendons à personne.
        </P>
      </Section>

      <Section id="duo" n={4} title={TOC[3].title}>
        <P>
          Le duo permet de s’entraîner à deux. Quand tu rejoins un duo, ton partenaire voit tes
          séances, tes statistiques et tes records, et tu vois les siens. Il voit aussi ton nom
          d’affichage, ta couleur et ta photo de profil.
        </P>
        <P>
          Rejoindre un duo est un choix : il faut accepter une invitation. Si tu quittes le duo,
          ton partenaire n’a plus accès à tes nouvelles données (voir le{" "}
          <A href="/support#duo">support</A>).
        </P>
      </Section>

      <Section id="destinataires" n={5} title={TOC[4].title}>
        <P>
          Tes données ne sont accessibles qu’à l’éditeur et aux prestataires techniques
          ci-dessous, qui les traitent pour notre compte et selon nos instructions :
        </P>
        <Ul>
          {active.map((s) => (
            <Li key={s.name}>
              <B>{s.name}</B> : {s.purpose}. Localisation : <Value value={s.location} />.
            </Li>
          ))}
        </Ul>
        <P>Prestataires prévus, utilisés uniquement s’ils sont activés :</P>
        <Ul>
          {planned.map((s) => (
            <Li key={s.name}>
              <B>{s.name}</B> (si activé) : {s.purpose}. Localisation :{" "}
              <Value value={s.location} />.
            </Li>
          ))}
        </Ul>
        <P>
          Les données de l’app (compte, séances, séries) sont stockées dans l’Union
          européenne, à Paris. Lorsqu’un prestataire est situé hors de l’Union européenne,
          le transfert est encadré par les garanties prévues par le RGPD (décision
          d’adéquation, notamment le cadre de protection des données UE-États-Unis, ou
          clauses contractuelles types de la Commission européenne).
        </P>
      </Section>

      <Section id="conservation" n={6} title={TOC[5].title}>
        <Ul>
          <Li>
            <B>Données du compte et d’entraînement :</B> conservées tant que ton compte existe,
            puis supprimées à la suppression du compte.
          </Li>
          <Li>
            <B>Sauvegardes techniques :</B> la base est sauvegardée automatiquement pour
            pouvoir la restaurer en cas d’incident. Une donnée supprimée peut y subsister
            pendant <Value value={LEGAL.backupRetention} />, puis disparaît quand la sauvegarde
            est remplacée.
          </Li>
          <Li>
            <B>Journaux techniques :</B> conservés pour une durée courte par les hébergeurs,
            selon leurs propres règles, à des fins de sécurité.
          </Li>
          <Li>
            <B>Échanges avec le support :</B> conservés le temps de traiter ta demande et de
            garder une trace d’éventuels litiges.
          </Li>
        </Ul>
      </Section>

      <Section id="suppression" n={7} title={TOC[6].title}>
        <P>
          Bientôt, tu pourras supprimer ton compte directement depuis l’app, dans Profil. La
          suppression efface ton compte et tes données personnelles : profil, séances,
          séries, exercices personnalisés et appartenance à un duo. Un export de tes données
          est également prévu.
        </P>
        <P>
          En attendant, écris au support depuis l’adresse email de ton compte : nous
          supprimons le compte et ses données, ou t’envoyons une copie de tes données.
        </P>
        <Muted>
          Supprimer le compte ne résilie pas un abonnement souscrit sur l’App Store : la
          résiliation se fait dans les réglages de ton identifiant Apple (voir le{" "}
          <A href="/support#abonnement">support</A>).
        </Muted>
      </Section>

      <Section id="droits" n={8} title={TOC[7].title}>
        <P>Conformément au RGPD et à la loi Informatique et Libertés, tu disposes des droits :</P>
        <Ul>
          <Li>d’accès à tes données et d’en obtenir une copie ;</Li>
          <Li>de rectification des données inexactes ;</Li>
          <Li>d’effacement ;</Li>
          <Li>à la portabilité (recevoir tes données dans un format réutilisable) ;</Li>
          <Li>d’opposition aux traitements fondés sur l’intérêt légitime ;</Li>
          <Li>à la limitation du traitement ;</Li>
          <Li>de définir des directives sur le sort de tes données après ton décès.</Li>
        </Ul>
        <P>
          Pour les exercer, écris à <ContactEmail />. Nous répondons dans un délai d’un mois,
          prolongeable dans les cas prévus par le RGPD. Nous pouvons te demander de confirmer
          ton identité, par exemple en écrivant depuis l’adresse email du compte.
        </P>
        <P>
          Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation
          à la CNIL : <A href="https://www.cnil.fr/fr/plaintes">www.cnil.fr/fr/plaintes</A>.
        </P>
      </Section>

      <Section id="securite" n={9} title={TOC[8].title}>
        <P>
          Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en
          clair, les cookies de session ne sont pas lisibles par le code de la page, et
          l’accès aux données est limité à ce qui est nécessaire au service.
        </P>
      </Section>

      <Section id="cookies" n={10} title={TOC[9].title}>
        <P>
          L’app n’utilise que des cookies strictement nécessaires : le cookie de session qui
          te garde connecté et, le cas échéant, celui qui mémorise le profil choisi sur
          l’appareil. Elle garde aussi localement, sur ton téléphone, les séances en attente
          de synchronisation quand tu es hors connexion. Aucun cookie publicitaire ni de
          mesure d’audience : aucun consentement n’est donc demandé.
        </P>
      </Section>

      <Section id="mineurs" n={11} title={TOC[10].title}>
        <P>
          L’app est destinée aux personnes de {LEGAL.minAge} ans et plus. Si tu as moins de{" "}
          {LEGAL.minAge} ans, n’utilise pas l’app.
        </P>
      </Section>

      <Section id="modifications" n={12} title={TOC[11].title}>
        <P>
          Cette politique peut évoluer, par exemple à l’activation d’un nouveau prestataire.
          La date de mise à jour figure en haut de la page. En cas de changement important,
          tu en seras informé dans l’app.
        </P>
      </Section>
    </LegalPage>
  );
}
