import BottomNav from "@/components/BottomNav";
import GuideScreen from "@/components/guide/GuideScreen";

// CM-88 : plus aucune lecture côté serveur. L'écran lit la session et le
// catalogue dans le navigateur (GuideScreen), sous RLS.
export default function GuidePage() {
  return (
    <main className="min-h-screen p-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <GuideScreen />
      <BottomNav />
    </main>
  );
}
