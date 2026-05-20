import Link from "next/link";

export default function Home() {
  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[430px] flex-col justify-between rounded-[2rem] border border-blue-500/30 bg-slate-950 p-6 shadow-2xl shadow-blue-950/40">
        <div>
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-blue-500/40 bg-blue-500/10 text-2xl">🧼</div>
            <div>
              <p className="text-xl font-black">CleanTrack Pro</p>
              <p className="text-xs text-slate-400">Gebäudereinigung · Team-App</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5">
            <p className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200 w-fit">Mobile App</p>
            <h1 className="mt-5 text-4xl font-black tracking-tight">Einsatzplan, Stempeluhr und Zeiten in einer App.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">Diese Version startet direkt als mobile Web-App und funktioniert in Vercel ohne blockierenden Login.</p>
          </div>
        </div>

        <div className="space-y-3">
          <Link href="/mitarbeiter" className="block rounded-2xl bg-blue-600 px-5 py-4 text-center font-black text-white shadow-glow">App öffnen</Link>
          <p className="text-center text-xs text-slate-500">Später kann ich Login, Supabase und echte Mitarbeiterdaten wieder verbinden.</p>
        </div>
      </section>
    </main>
  );
}
