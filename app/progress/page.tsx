import ProgressScreen from "@/components/progress/ProgressScreen";

// CM-88 : plus aucune lecture côté serveur. L'écran Stats lit la session, le
// `?profile=` et les séries dans le navigateur (ProgressScreen), sous RLS. Le
// `<main>` est rendu par l'écran : sa couleur dépend du membre affiché.
export default function ProgressPage() {
  return <ProgressScreen />;
}
