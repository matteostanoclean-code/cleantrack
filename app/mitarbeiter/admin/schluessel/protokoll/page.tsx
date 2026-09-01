import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Übergabeprotokoll für Schlüssel, zum Ausdrucken oder als PDF speichern.
 *
 * Bewusst Papier statt Klick in der App: Bei einem Schlüssel hängt an der
 * Übergabe zu viel, um sich auf eine Bestätigung zu verlassen, deren
 * Beweiswert niemand geprüft hat. Ein unterschriebenes Blatt versteht jeder,
 * auch ein Gericht.
 *
 * Auf einem Blatt stehen beide Vorgänge: die Übergabe oben, die Rückgabe
 * unten. So liegt am Ende ein Zettel je Schlüssel in der Akte und nicht zwei,
 * die man zusammensuchen muss.
 *
 * Der Erklärungstext ist bewusst schlicht gehalten und KEIN geprüfter
 * Rechtstext. Vor dem Einsatz im Betrieb gehört er einmal vom Anwalt oder der
 * Innung angesehen.
 */

type AnyRow = Record<string, any>;

const ERKLAERUNG = [
  "Der Übernehmer bestätigt mit seiner Unterschrift den Empfang der oben aufgeführten Schlüssel.",
  "Die Schlüssel bleiben Eigentum des Arbeitgebers beziehungsweise des Auftraggebers und dürfen weder an Dritte weitergegeben noch nachgemacht werden.",
  "Der Verlust eines Schlüssels ist unverzüglich zu melden.",
  "Die Schlüssel sind auf Verlangen, spätestens jedoch bei Beendigung des Arbeitsverhältnisses, zurückzugeben."
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function datumText(value?: unknown) {
  const text = clean(value).slice(0, 10);
  if (!text) return "";
  const datum = new Date(`${text}T12:00:00`);
  if (Number.isNaN(datum.getTime())) return text;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(datum);
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex gap-3 border-b border-neutral-200 py-1.5">
      <span className="w-[150px] shrink-0 text-[12px] text-neutral-500">{label}</span>
      <span className="text-[13px] font-medium text-neutral-900">{wert || "—"}</span>
    </div>
  );
}

function Unterschrift({ titel, name }: { titel: string; name?: string }) {
  return (
    <div>
      <div className="h-12 border-b border-neutral-800" />
      <p className="mt-1 text-[11px] text-neutral-500">{titel}</p>
      {name ? <p className="text-[12px] font-medium text-neutral-800">{name}</p> : null}
    </div>
  );
}

export default async function ProtokollSeite({ searchParams }: { searchParams: Promise<{ ids?: string; person?: string }> }) {
  const { ids, person } = await searchParams;
  const liste = clean(ids).split(",").map(clean).filter(Boolean);

  let schluessel: AnyRow[] = [];
  let problem: string | null = null;

  if (!liste.length) {
    problem = "Kein Schlüssel angegeben. Bitte über die Schlüsselliste öffnen.";
  } else {
    try {
      const supabase = getSupabaseAdmin();
      const ergebnis = await supabase.from("key_items").select("*").in("id", liste);
      if (ergebnis.error) throw new Error(ergebnis.error.message);
      schluessel = (ergebnis.data || []) as AnyRow[];
      if (!schluessel.length) problem = "Diese Schlüssel wurden nicht gefunden.";
    } catch (fehler) {
      problem = fehler instanceof Error ? fehler.message : "Die Schlüssel konnten nicht geladen werden.";
    }
  }

  const erster = schluessel[0] || {};
  const uebernehmer = clean(person) || clean(erster.employee_name);
  const objekt = clean(erster.object_name);
  const kunde = clean(erster.customer_name);
  const anschrift = clean(erster.object_address);

  return (
    <main className="min-h-[100dvh] bg-neutral-100 p-6 text-neutral-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-[820px]">
        <div className="mb-4 flex items-center justify-between gap-4 print:hidden">
          <p className="text-[14px] text-neutral-500">
            Über <strong>Datei &rarr; Drucken</strong> ausgeben oder als PDF speichern. Zwei Ausfertigungen: eine für die Akte, eine für den Mitarbeiter.
          </p>
          <a href="/mitarbeiter/admin/schluessel" className="shrink-0 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-[14px] font-semibold">Zurück</a>
        </div>

        {problem ? (
          <div className="rounded-xl bg-amber-100 px-4 py-3 text-[14px] text-amber-800 print:hidden">{problem}</div>
        ) : (
          <div className="bg-white p-10 print:p-0">
            {/* Kopf */}
            <div className="flex items-start justify-between gap-6 border-b-2 border-neutral-800 pb-4">
              <div>
                <h1 className="text-[22px] font-bold leading-tight">Schlüssel-Übergabeprotokoll</h1>
                <p className="mt-1 text-[13px] text-neutral-500">
                  {schluessel.length === 1 ? "Ein Schlüssel" : `${schluessel.length} Schlüssel`}
                  {objekt ? ` · ${objekt}` : ""}
                </p>
              </div>
              <div className="text-right">
                <img src="/logo-app.png" alt="" className="ml-auto h-12 w-auto object-contain" />
                <p className="mt-1 text-[11px] text-neutral-500">Matteo Stano Clean Gebäudereinigung</p>
              </div>
            </div>

            {/* Wer und wo */}
            <div className="mt-5 grid grid-cols-2 gap-x-10">
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-neutral-500">Übernehmer</p>
                <Zeile label="Name" wert={uebernehmer} />
                <Zeile label="Übergeben am" wert={datumText(erster.handover_date) || datumText(new Date().toISOString())} />
              </div>
              <div>
                <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-neutral-500">Objekt</p>
                <Zeile label="Objekt" wert={objekt} />
                <Zeile label="Anschrift" wert={anschrift} />
                <Zeile label="Kunde" wert={kunde} />
              </div>
            </div>

            {/* Die Schlüssel */}
            <div className="mt-6">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-neutral-500">Übergebene Schlüssel</p>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Nr.</th>
                    <th className="py-2 pr-3">Bezeichnung</th>
                    <th className="py-2 pr-3">Kennung</th>
                    <th className="py-2 pr-3">Objekt</th>
                    <th className="py-2 text-right">Anzahl</th>
                  </tr>
                </thead>
                <tbody>
                  {schluessel.map((eintrag) => (
                    <tr key={eintrag.id} className="border-b border-neutral-200">
                      <td className="py-2 pr-3 font-mono text-[13px]">{clean(eintrag.key_number) || "—"}</td>
                      <td className="py-2 pr-3 text-[13px] font-medium">{clean(eintrag.key_name) || "Schlüssel"}</td>
                      <td className="py-2 pr-3 font-mono text-[12px] text-neutral-600">{clean(eintrag.key_identifier) || "—"}</td>
                      <td className="py-2 pr-3 text-[13px] text-neutral-600">{clean(eintrag.object_name) || "—"}</td>
                      <td className="py-2 text-right text-[13px] font-semibold">{Number(eintrag.key_count) || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Erklärung */}
            <div className="mt-6 rounded border border-neutral-300 p-4">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-neutral-500">Erklärung</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-neutral-800">
                {ERKLAERUNG.map((satz) => <li key={satz}>{satz}</li>)}
              </ol>
            </div>

            {/* Unterschriften Übergabe */}
            <div className="mt-8 grid grid-cols-2 gap-10">
              <Unterschrift titel="Ort, Datum und Unterschrift Übergeber" />
              <Unterschrift titel="Ort, Datum und Unterschrift Übernehmer" name={uebernehmer} />
            </div>

            {/* Rückgabe auf demselben Blatt */}
            <div className="mt-10 border-t-2 border-dashed border-neutral-400 pt-6">
              <p className="text-[15px] font-bold">Rückgabe</p>
              <p className="mt-1 text-[12px] text-neutral-600">
                Wird beim Zurückgeben ausgefüllt. Bitte prüfen, ob alle oben aufgeführten Schlüssel vollständig zurückkommen.
              </p>

              <div className="mt-4 flex gap-6">
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="inline-block h-4 w-4 border border-neutral-700" />
                  vollständig zurückgegeben
                </label>
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="inline-block h-4 w-4 border border-neutral-700" />
                  unvollständig, Anmerkung:
                </label>
                <span className="min-w-[180px] flex-1 border-b border-neutral-400" />
              </div>

              <div className="mt-8 grid grid-cols-2 gap-10">
                <Unterschrift titel="Ort, Datum und Unterschrift Rücknehmer" />
                <Unterschrift titel="Ort, Datum und Unterschrift Rückgeber" name={uebernehmer} />
              </div>
            </div>

            <p className="mt-8 text-[10px] leading-relaxed text-neutral-400">
              Erstellt am {datumText(new Date().toISOString())} mit Schichtklar. Zwei Ausfertigungen: eine für die Personalakte, eine für den Mitarbeiter.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
