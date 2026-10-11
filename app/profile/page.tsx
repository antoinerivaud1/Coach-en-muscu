import BottomNav from "@/components/BottomNav";
import ProfileScreen from "@/components/profile/ProfileScreen";

// CM-88 : plus aucune lecture côté serveur. L'écran lit la session, le
// profil, les badges et l'état du duo dans le navigateur (ProfileScreen),
// sous RLS.
export default function ProfilePage() {
  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-[30px] font-black tracking-tight text-fg">Profil</h1>
      <ProfileScreen />
      <BottomNav />
    </main>
  );
}
