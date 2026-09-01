import Link from "next/link";

/**
 * Platzhalter für einen Bereich, den es in der Leiste schon gibt, dessen
 * Bildschirm aber noch nicht gebaut ist.
 *
 * Bewusst ehrlich: Es steht da, was kommen soll und wo man das heute schon
 * findet. Eine leere Seite ohne Erklärung wirkt wie ein Fehler.
 */
export default function Platzhalter({
  titel,
  kommt,
  heute
}: {
  titel: string;
  kommt: string;
  heute?: Array<{ text: string; adresse: string }>;
}) {
  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 px-4 py-5" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Schichtklar Admin</p>
        <h1 className="text-3xl font-bold">{titel}</h1>

        <div className="mt-5 max-w-[640px] rounded-2xl border border-paper-200 bg-white p-5">
          <p className="text-[15px] leading-relaxed text-ink-600">{kommt}</p>
          <p className="mt-3 text-[14px] text-ink-400">Dieser Bildschirm ist noch nicht gebaut.</p>

          {heute?.length ? (
            <div className="mt-4 border-t border-paper-200 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Solange</p>
              <div className="mt-2 space-y-2">
                {heute.map((eintrag) => (
                  <Link key={eintrag.adresse} href={eintrag.adresse} className="block rounded-xl border border-paper-200 px-4 py-3 text-[15px] font-medium text-brand-700 hover:bg-paper-100">
                    {eintrag.text}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
