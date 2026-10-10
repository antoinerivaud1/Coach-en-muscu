// CM-93 : configuration juridique centralisée (pages /legal/*, /support,
// /credits). Texte à faire relire par Antoine.
//
// Règle : toute information inconnue est une chaîne « À COMPLÉTER : … ».
// Les pages l'affichent surlignée, et `LEGAL_TODO` liste ces champs (rappel
// dans la description de PR). Aucun import Next : testé dans
// tests/unit/legal.spec.ts.

export const TODO_PREFIX = "À COMPLÉTER : ";

function todo(what: string): string {
  return `${TODO_PREFIX}${what}`;
}

export function isTodo(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(TODO_PREFIX);
}

export type LegalHost = {
  name: string;
  role: string;
  address: string;
  phone: string;
  website: string;
};

export type LegalSubprocessor = {
  name: string;
  purpose: string;
  location: string;
  /** `false` : prestataire prévu mais pas encore branché (« si activé »). */
  active: boolean;
};

export type LegalConfig = {
  appName: string;
  /** Date affichée « Dernière mise à jour », en toutes lettres. */
  lastUpdated: string;
  /** Même date, format ISO (attribut `dateTime`). */
  lastUpdatedIso: string;
  siteUrl: string;
  editor: {
    name: string;
    status: string;
    siret: string;
    address: string;
    phone: string;
    email: string;
    publicationDirector: string;
  };
  hosts: { web: LegalHost; data: LegalHost };
  subprocessors: readonly LegalSubprocessor[];
  pricing: {
    /** Prix TTC indicatifs (France), le prix affiché par l'App Store fait foi. */
    monthlyCents: number;
    yearlyCents: number;
    /** Essai gratuit, sur l'abonnement annuel uniquement. */
    yearlyTrialDays: number;
  };
  minAge: number;
  /** Durée de conservation des sauvegardes techniques de la base. */
  backupRetention: string;
  /** Médiateur de la consommation (Code de la consommation, art. L612-1). */
  consumerMediator: string;
};

export const LEGAL: LegalConfig = {
  appName: "Coach en Muscu",
  lastUpdated: "10 octobre 2026",
  lastUpdatedIso: "2026-10-10",
  siteUrl: todo("URL publique du site (domaine de production)"),
  editor: {
    name: "Antoine Rivaud",
    status: todo("statut juridique (micro-entreprise prévue, immatriculation en cours)"),
    siret: todo("numéro SIRET"),
    address: todo("adresse postale de l'éditeur (ou adresse de domiciliation)"),
    phone: todo("numéro de téléphone de l'éditeur"),
    email: todo("adresse email de contact et de support"),
    publicationDirector: "Antoine Rivaud",
  },
  hosts: {
    web: {
      name: "Vercel Inc.",
      role: "Hébergement du site web et de l'application web",
      address: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
      phone: todo("numéro de téléphone de Vercel Inc. (exigé par la LCEN)"),
      website: "https://vercel.com",
    },
    data: {
      name: "Supabase, Inc.",
      role: "Base de données et authentification (serveurs dans l'Union européenne, région Paris)",
      address: "3500 S. DuPont Highway, Dover, DE 19901, États-Unis (siège déclaré)",
      phone: todo("numéro de téléphone de Supabase, Inc. (exigé par la LCEN)"),
      website: "https://supabase.com",
    },
  },
  subprocessors: [
    {
      name: "Supabase",
      purpose: "base de données, authentification et sauvegardes",
      location: "Union européenne (Paris, AWS eu-west-3)",
      active: true,
    },
    {
      name: "Vercel",
      purpose: "hébergement et diffusion du site et de l'application web",
      location: "réseau mondial (siège aux États-Unis)",
      active: true,
    },
    {
      name: "Apple",
      purpose: "distribution de l'app (App Store) et paiement des abonnements (achats intégrés)",
      location: "selon les conditions d'Apple",
      active: true,
    },
    {
      name: "RevenueCat",
      purpose: "gestion du statut des abonnements",
      location: "États-Unis",
      active: false,
    },
    {
      name: "Sentry",
      purpose: "suivi des erreurs techniques",
      location: todo("région d'hébergement Sentry retenue (UE ou États-Unis)"),
      active: false,
    },
  ],
  pricing: {
    monthlyCents: 399,
    yearlyCents: 2499,
    yearlyTrialDays: 7,
  },
  minAge: 16,
  backupRetention: todo("durée de conservation des sauvegardes Supabase (dépend du plan)"),
  consumerMediator: todo("nom et site du médiateur de la consommation choisi"),
};

/** 399 → « 3,99 € » (espace insécable avant le symbole). */
export function formatPrice(cents: number): string {
  const euros = (cents / 100).toFixed(2).replace(".", ",");
  return `${euros} €`;
}

export type LegalTodo = { path: string; label: string };

/** Parcourt la config et liste chaque champ encore « À COMPLÉTER ». */
export function collectTodos(value: unknown, path = "LEGAL"): LegalTodo[] {
  if (isTodo(value)) return [{ path, label: value.slice(TODO_PREFIX.length) }];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectTodos(item, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => collectTodos(v, `${path}.${key}`));
  }
  return [];
}

/** Champs qu'Antoine doit encore compléter avant la soumission App Store. */
export const LEGAL_TODO: readonly LegalTodo[] = collectTodos(LEGAL);
