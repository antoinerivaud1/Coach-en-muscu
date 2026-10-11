import type { Metadata } from "next";
import InviterScreen from "@/components/duo/InviterScreen";

export const metadata: Metadata = { title: "Inviter ton partenaire · Coach en Muscu" };

// CM-88 (PR 7) : plus aucune lecture côté serveur. L'écran lit la session,
// l'état du duo et le prénom dans le navigateur (InviterScreen), sous RLS.
export default function InviterPage() {
  return <InviterScreen />;
}
