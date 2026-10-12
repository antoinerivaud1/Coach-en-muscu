import RootRedirect from "@/components/home/RootRedirect";

// CM-89 (PR 1) : page statique (export Capacitor possible), plus de route
// serveur. La session est lue dans le navigateur (RootRedirect).
export default function RootPage() {
  return <RootRedirect />;
}
