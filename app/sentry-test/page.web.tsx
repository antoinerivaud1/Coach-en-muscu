// CM-95 : page de vérification Sentry, invisible (404) tant que SENTRY_TEST_PAGE
// ne vaut pas "1". À activer seulement le temps d'un test, sur Preview de préférence.
// CM-89 (PR 3) : suffixe `.web`, absente du bundle natif (variable serveur
// lue à chaque requête, impossible dans un export statique).
import { notFound } from "next/navigation";
import SentryTestButtons from "./SentryTestButtons";

export const dynamic = "force-dynamic";

export default function SentryTestPage() {
  if (process.env.SENTRY_TEST_PAGE !== "1") notFound();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-black">Test Sentry</h1>
      <p className="text-base text-fg-muted">
        Chaque bouton lève une erreur volontaire. Elles doivent apparaître dans Sentry
        avec une pile lisible (fichiers .tsx, pas du code minifié).
      </p>
      <SentryTestButtons />
    </main>
  );
}
