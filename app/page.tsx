import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-paper-100 px-5 py-10 text-ink-900">
      <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-[430px] flex-col justify-between rounded-[2rem] bg-white p-6">
        <div>
          <div className="mb-10 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-xl">🧼</div>
            <div>
              <p className="text-[17px] font-bold">Schichtklar</p>
              <p className="text-[13px] text-ink-400">Matteo Stano Clean · Team-App</p>
            </div>
          </div>

          <h1 className="text-[32px] font-bold leading-tight tracking-tight">Einsatzplan, Stempeluhr und Zeiten in einer App.</h1>
          <p className="mt-4 text-[15px] leading-6 text-ink-600">
            Das Team sieht seine Einsätze, stempelt am Objekt ein und aus, meldet Material und schickt Qualitätsnachweise.
            Das Büro plant, prüft die Zeiten und gibt frei.
          </p>

          <ul className="mt-6 space-y-2 text-[15px] text-ink-600">
            <li>· Einsatzplan mit Tagesroute und Objektmappe</li>
            <li>· Stempeluhr mit Standortprüfung am Objekt</li>
            <li>· Zeiten prüfen, korrigieren und freigeben</li>
            <li>· Material bestellen, Mängel melden, Chat mit dem Büro</li>
          </ul>
        </div>

        <div className="mt-10 space-y-3">
          <Link href="/mitarbeiter" className="block rounded-xl bg-brand-600 px-5 py-4 text-center text-[16px] font-semibold text-white">
            App öffnen
          </Link>
          <Link href="/mitarbeiter/admin" className="block rounded-xl border border-paper-300 px-5 py-4 text-center text-[16px] font-semibold text-ink-800">
            Adminbereich
          </Link>
          <p className="text-center text-[13px] text-ink-400">Anmeldung mit deiner Mitarbeiter-E-Mail und deinem Passwort.</p>
        </div>
      </section>
    </main>
  );
}
