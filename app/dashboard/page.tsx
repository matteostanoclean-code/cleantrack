export default function DashboardPage() {
  const heutigesDatum = new Date().toLocaleDateString("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
    return (
    <main className="min-h-screen bg-[#020817] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-800 bg-[#081225] lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <h1 className="text-2xl font-bold tracking-tight">StanoClean</h1>
            <p className="mt-1 text-sm text-slate-400">Pro</p>
          </div>

          <div className="px-4 py-6">
            <p className="mb-3 px-3 text-xs uppercase tracking-[0.2em] text-slate-500">
              Übersicht
            </p>

            <div className="space-y-1">
              <button className="w-full rounded-2xl bg-blue-600/20 px-4 py-3 text-left font-medium text-blue-300">
                Dashboard
              </button>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Aufträge
              </button>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Kunden
              </button>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Mitarbeiter
              </button>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Einsatzplan
              </button>
             <a
  href="/rechner"
  className="block w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800"
>
  Kalkulator
</a>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Rechnungen
              </button>
              <button className="w-full rounded-2xl px-4 py-3 text-left text-slate-300 hover:bg-slate-800">
                Einstellungen
              </button>
            </div>
          </div>

          <div className="mt-auto border-t border-slate-800 px-6 py-4">
            <p className="text-sm text-slate-400">kontakt@matteostano-clean.de</p>
          </div>
        </aside>

        <section className="flex-1">
         

          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-white">
                  Hallo, Matteo
                </h1>
<p className="mt-2 text-slate-400">{heutigesDatum}</p>              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <p className="text-sm text-slate-400">Umsatz dieser Monat</p>
                  <p className="mt-4 text-4xl font-bold">0,00 €</p>
                  <p className="mt-3 text-sm text-slate-500">Gesamt: 0,00 €</p>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <p className="text-sm text-slate-400">Offene Aufträge</p>
                  <p className="mt-4 text-4xl font-bold">0</p>
                  <p className="mt-3 text-sm text-slate-500">Keine offenen Aufgaben</p>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <p className="text-sm text-slate-400">Erledigt</p>
                  <p className="mt-4 text-4xl font-bold">0</p>
                  <p className="mt-3 text-sm text-slate-500">0 von 0 Aufträgen</p>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <p className="text-sm text-slate-400">Kunden</p>
                  <p className="mt-4 text-4xl font-bold">1</p>
                  <p className="mt-3 text-sm text-slate-500">Erster Kunde gespeichert</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-500">
                  Neuer Auftrag
                </button>
                <button className="rounded-2xl border border-emerald-700 bg-emerald-950 px-5 py-3 font-medium text-emerald-300 hover:bg-emerald-900">
                  Neuer Kunde
                </button>
                <button className="rounded-2xl border border-violet-700 bg-violet-950 px-5 py-3 font-medium text-violet-300 hover:bg-violet-900">
                  Neuer Mitarbeiter
                </button>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Heute fällig</h2>
                    <button className="text-sm text-blue-400 hover:text-blue-300">
                      Alle Aufträge
                    </button>
                  </div>

                  <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
                    🎉 Keine Aufträge heute
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Mitarbeiter</h2>
                    <button className="text-sm text-blue-400 hover:text-blue-300">
                      Alle
                    </button>
                  </div>

                  <div className="mt-6 rounded-2xl bg-slate-950/60 p-4">
                    <p className="font-semibold text-white">Noch keine Mitarbeiter</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Lege als Nächstes deinen ersten Mitarbeiter an.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <h2 className="text-xl font-semibold">Umsatz (Woche)</h2>

                  <div className="mt-6 h-64 rounded-2xl border border-slate-800 bg-slate-950/50 p-6">
                    <div className="mt-40 grid grid-cols-7 gap-3 text-center text-xs text-slate-500">
                      {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((tag) => (
                        <div key={tag} className="space-y-2">
                          <div className="h-1 rounded-full bg-slate-700" />
                          <div>{tag}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Heute</h2>
                    <span className="text-sm text-slate-400">0 Aufträge</span>
                  </div>

                  <div className="mt-6 h-64 rounded-2xl border border-slate-800 bg-slate-950/50 p-6 text-slate-500">
                    Keine Aufträge für heute.
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <h2 className="text-xl font-semibold">Umsatz-Details</h2>

                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-slate-400">Gesamtumsatz</span>
                      <span className="font-semibold">0,00 €</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-slate-400">Abgerechnet</span>
                      <span className="font-semibold text-emerald-400">0,00 €</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <span className="text-slate-400">Offen</span>
                      <span className="font-semibold text-amber-400">0,00 €</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Aufträge gesamt</span>
                      <span className="font-semibold">0</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                  <h2 className="text-xl font-semibold">Letzte Aktivitäten</h2>

                  <div className="mt-6 rounded-2xl border border-dashed border-slate-700 p-8 text-slate-500">
                    Noch keine Aktivitäten vorhanden.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}