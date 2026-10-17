import BackButton from "@/components/BackButton";
import AppearanceScreen from "@/components/profile/AppearanceScreen";

// CM-116 : Profil › Apparence (Automatique, Clair, Sombre, Selon l'heure).
// Réglage gardé sur l'appareil, aucune lecture serveur.
export default function AppearancePage() {
  return (
    <main className="min-h-[100dvh] px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <BackButton fallback="/profile" label="Profil" />
      <h1 className="mx-1 mt-3 text-[34px] font-bold leading-[41px] text-fg">Apparence</h1>
      <AppearanceScreen />
    </main>
  );
}
