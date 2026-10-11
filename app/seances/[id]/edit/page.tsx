import SeanceEditorScreen from "@/components/seances/SeanceEditorScreen";

// CM-88 (PR 5) : plus aucune lecture côté serveur. Seul l'id est lu dans
// l'URL ; la séance, son accès (RLS + contrôle en code) et le catalogue sont
// lus dans le navigateur. Le paramètre dynamique reste en place jusqu'au
// routage client des `[id]` (CM-89).
export default async function EditSeancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SeanceEditorScreen dayId={id} />;
}
