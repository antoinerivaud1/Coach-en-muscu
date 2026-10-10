/**
 * CM-86 (C7) : écran d'erreur des étapes d'onboarding quand le profil n'a pas
 * pu être lu. « Réessayer » recharge la page (lien plein, pas de redirection
 * serveur, donc pas de boucle avec le middleware).
 */
export default function LoadError({ retryHref }: { retryHref: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mt-16 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
        Impossible de charger ton profil
      </h1>
      <p role="alert" className="mt-3 text-base leading-snug text-[#A4A4AE]">
        La connexion a échoué. Vérifie ton réseau puis réessaie.
      </p>
      <div className="flex-1" />
      <a
        href={retryHref}
        className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-energy text-base font-extrabold text-ink"
      >
        Réessayer
      </a>
    </div>
  );
}
