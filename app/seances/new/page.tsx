import SeanceEditorScreen from "@/components/seances/SeanceEditorScreen";

// CM-88 (PR 5) : plus aucune lecture côté serveur. L'éditeur lit la session,
// les noms déjà pris et le catalogue dans le navigateur, sous RLS.
export default function NewSeancePage() {
  return <SeanceEditorScreen dayId={null} />;
}
