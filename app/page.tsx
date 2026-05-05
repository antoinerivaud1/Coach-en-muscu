export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-3xl font-bold">Coach en Muscu</h1>
      <p className="text-sm text-zinc-400">Phase 1 Foundation. Build OK.</p>
      <div className="mt-6 flex gap-3">
        <span className="rounded-full bg-toi px-3 py-1 text-sm font-medium">Toi</span>
        <span className="rounded-full bg-elle px-3 py-1 text-sm font-medium">Elle</span>
      </div>
    </main>
  );
}
