import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-5 py-8 text-ink-900">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[430px] flex-col justify-between rounded-[2rem] border border-brand-500/30 bg-paper-100 p-6 shadow-2xl shadow-ink-900/10">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-brand-500/40 bg-brand-50 text-2xl">🧼</div>
            <div>
              <p className="text-xl font-black">Schichtklar</p>
              <p className="text-xs text-ink-400">Gebäudereinigung · Team-App</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-paper-300 bg-white p-5">
            <p className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700 w-fit">Mobile App</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight">Einsatzplan, Stempeluhr und Zeiten in einer App.</h1>
            <p className="mt-4 text-sm leading-6 text-ink-600">Diese Version startet direkt als mobile Web-App und funktioniert in Vercel ohne blockierenden Login.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Link href="/mitarbeiter" className="block rounded-2xl bg-brand-600 px-5 py-4 text-center font-black text-white shadow-glow">App öffnen</Link>
          <p className="text-center text-xs text-ink-400">Später kann ich Login, Supabase und echte Mitarbeiterdaten wieder verbinden.</p>
        </div>
      </section>
    </main>
  );
}
