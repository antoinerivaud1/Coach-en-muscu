import BottomNav from "@/components/BottomNav";
import HistoryScreen from "@/components/history/HistoryScreen";

// CM-88 : plus aucune lecture côté serveur. Le Carnet lit la session et les
// séances dans le navigateur (HistoryScreen), sous RLS.
export default function HistoryPage() {
  return (
    <main className="min-h-screen p-4 pb-28">
      <HistoryScreen />
      <BottomNav />
    </main>
  );
}
