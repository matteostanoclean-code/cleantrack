import Link from "next/link";

/**
 * Startseite.
 *
 * Bewusst karg: Logo, wofür die App da ist, zwei Knöpfe. Wer hier landet,
 * weiß längst, was Schichtklar ist — er will rein. Die Beschreibung von
 * vorher war Werbung für Leute, die es hier nicht gibt.
 */
export default function Home() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-paper-100 px-5 py-10 text-ink-900">
      <section className="w-full max-w-[420px] rounded-[2rem] bg-white px-6 py-10">
        <img
          src="/logo-app.png"
          alt="Matteo Stano Clean Gebäudereinigung"
          className="mx-auto w-full max-w-[260px]"
        />

        <p className="mt-6 text-center text-[15px] font-semibold uppercase tracking-[0.18em] text-brand-600">
          Team-App
        </p>
        <p className="mt-2 text-center text-[15px] leading-6 text-ink-400">
          Einsatzplan, Stempeluhr und Zeiten
        </p>

        <div className="mt-10 space-y-3">
          <Link href="/mitarbeiter" className="block rounded-xl bg-brand-600 px-5 py-4 text-center text-[16px] font-semibold text-white">
            App öffnen
          </Link>
          <Link href="/mitarbeiter/admin" className="block rounded-xl border border-paper-300 px-5 py-4 text-center text-[16px] font-semibold text-ink-800">
            Adminbereich
          </Link>
        </div>

        <p className="mt-6 text-center text-[13px] leading-5 text-ink-400">
          Anmeldung mit deiner Mitarbeiter-E-Mail und deinem Passwort.
        </p>
      </section>
    </main>
  );
}
