import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { buildRecords, plannedMinutesFromTask } from "@/lib/zeiten";
import { zeitgrenzenLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Lohnübersicht je Mitarbeiter für einen Monat.
 *
 * Die Zeiten werden über dieselbe Rechnung gebildet wie in der
 * Zeitenfreigabe. Zwei getrennte Rechnungen für dieselbe Sache laufen früher
 * oder später auseinander, und dann traut man keiner von beiden mehr.
 *
 * Die Spalten bedeuten:
 *   Vertragsstunden  was vereinbart ist, aus den Wochenstunden hochgerechnet
 *   Sollstunden      Summe der Zeitvorgaben aller Einsätze im Monat
 *   Arbeitszeit      was freigegeben ist, also gezählte Arbeit
 *   Abwesenheit      gutgeschriebene Stunden aus genehmigtem Urlaub
 *   Lohnzeit         Arbeitszeit plus Abwesenheit, das geht in den Lohn
 *   Saldo            Lohnzeit gegen Vertragsstunden
 *   Offen            Zeiten, die noch niemand freigegeben hat
 *
 * Solange etwas offen ist, ist die Lohnzeit vorläufig. Deshalb steht die Zahl
 * offener Punkte in der ersten Spalte und nicht irgendwo hinten.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function zahl(value: unknown) {
  const wert = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(wert) ? wert : 0;
}

function monatsGrenzen(monat: string) {
  const [jahr, m] = monat.split("-").map(Number);
  if (!jahr || !m) {
    const jetzt = new Date();
    return monatsGrenzen(`${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}`);
  }
  const von = `${jahr}-${String(m).padStart(2, "0")}-01`;
  const letzterTag = new Date(jahr, m, 0).getDate();
  const bis = `${jahr}-${String(m).padStart(2, "0")}-${String(letzterTag).padStart(2, "0")}`;
  return { von, bis, tage: letzterTag };
}

/** Kalendertage eines Zeitraums, die in den Monat fallen. */
function tageImMonat(von: string, bis: string, monatVon: string, monatBis: string) {
  const start = von > monatVon ? von : monatVon;
  const ende = bis < monatBis ? bis : monatBis;
  if (!start || !ende || ende < start) return 0;
  return Math.round((new Date(`${ende}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 });

    const supabase = auth.supabase;
    const { searchParams } = new URL(request.url);
    const monat = clean(searchParams.get("month")) || new Date().toISOString().slice(0, 7);
    const { von, bis, tage } = monatsGrenzen(monat);

    // Ein Tag Puffer an beiden Enden, damit Buchungen am Tagesrand nicht
    // durch die Zeitzone herausfallen.
    const rahmenVon = new Date(`${von}T00:00:00`);
    rahmenVon.setDate(rahmenVon.getDate() - 1);
    const rahmenBis = new Date(`${bis}T23:59:59`);
    rahmenBis.setDate(rahmenBis.getDate() + 1);

    const [personen, zeitenErgebnis, aufgabenErgebnis, abwesenheiten] = await Promise.all([
      supabase.from("employee_profiles").select("*").order("employee_number", { ascending: true }),
      supabase
        .from("time_entries")
        .select("*")
        .gte("created_at", rahmenVon.toISOString())
        .lte("created_at", rahmenBis.toISOString())
        .order("created_at", { ascending: true })
        .limit(4000),
      supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done, status")
        .gte("task_date", von)
        .lte("task_date", bis)
        .limit(4000),
      supabase.from("absence_requests").select("*").limit(1000)
    ]);

    if (personen.error) throw new Error(personen.error.message);

    const aufgaben = (aufgabenErgebnis.data || []) as AnyRow[];
    const tasksById = new Map<string, AnyRow>();
    for (const aufgabe of aufgaben) tasksById.set(aufgabe.id, aufgabe);

    // Ergänzend die Einsätze holen, auf die Buchungen zeigen, aber die außerhalb
    // des Monats liegen — sonst fehlt ihnen die Zeitvorgabe.
    const fehlendeIds = Array.from(new Set(
      ((zeitenErgebnis.data || []) as AnyRow[]).map((eintrag) => clean(eintrag.task_id)).filter((id) => id && !tasksById.has(id))
    ));
    if (fehlendeIds.length) {
      const nachschlag = await supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done")
        .in("id", fehlendeIds);
      for (const aufgabe of (nachschlag.data || []) as AnyRow[]) tasksById.set(aufgabe.id, aufgabe);
    }

    const eintraege = ((zeitenErgebnis.data || []) as AnyRow[]).filter((eintrag) => {
      const tag = clean(eintrag.created_at).slice(0, 10);
      return tag >= von && tag <= bis;
    });

    const saetze = buildRecords(eintraege, tasksById, await zeitgrenzenLaden(supabase));

    const zeilen = ((personen.data || []) as AnyRow[])
      .filter((person) => clean(person.name) && person.active !== false && clean(person.role).toLowerCase() !== "admin")
      .map((person) => {
        const name = clean(person.name);
        const eigene = saetze.filter((satz: AnyRow) => clean(satz.employeeName) === name);

        const offen = eigene.filter((satz: AnyRow) => satz.state === "open").length;
        const arbeitszeit = eigene
          .filter((satz: AnyRow) => satz.state === "approved")
          .reduce((summe: number, satz: AnyRow) => summe + Number(satz.approvedMinutes ?? satz.actualMinutes ?? 0), 0);

        const soll = aufgaben
          .filter((aufgabe) => clean(aufgabe.employee_name) === name && clean(aufgabe.status).toLowerCase() !== "cancelled")
          .reduce((summe, aufgabe) => summe + plannedMinutesFromTask(aufgabe), 0);

        const abwesenheit = ((abwesenheiten.data || []) as AnyRow[])
          .filter((eintrag) => {
            if (clean(eintrag.employee_name) !== name) return false;
            if (clean(eintrag.status).toLowerCase() !== "approved") return false;
            const eVon = clean(eintrag.start_date).slice(0, 10);
            const eBis = clean(eintrag.end_date || eintrag.start_date).slice(0, 10);
            return eBis >= von && eVon <= bis;
          })
          .reduce((summe, eintrag) => {
            const gesamt = zahl(eintrag.credited_minutes);
            if (!gesamt) return summe;
            const eVon = clean(eintrag.start_date).slice(0, 10);
            const eBis = clean(eintrag.end_date || eintrag.start_date).slice(0, 10);
            const alleTage = Math.max(1, Math.round((new Date(`${eBis}T12:00:00`).getTime() - new Date(`${eVon}T12:00:00`).getTime()) / 86400000) + 1);
            const anteilig = tageImMonat(eVon, eBis, von, bis);
            // Geht der Urlaub über den Monatswechsel, wird anteilig gerechnet.
            return summe + Math.round((gesamt / alleTage) * anteilig);
          }, 0);

        // Vertragsstunden: erst die Monatsangabe, sonst aus den Wochenstunden
        // auf die Tage des Monats hochgerechnet.
        const monatlich = zahl(person.monthly_hour_limit) || zahl(person.monthly_hours);
        const woechentlich = zahl(person.weekly_hours);
        const vertrag = monatlich > 0
          ? Math.round(monatlich * 60)
          : woechentlich > 0
            ? Math.round((woechentlich * 60 * tage) / 7)
            : 0;

        const lohnzeit = arbeitszeit + abwesenheit;

        return {
          id: person.id,
          name,
          employee_number: clean(person.employee_number),
          offen,
          vertragMinuten: vertrag,
          sollMinuten: soll,
          arbeitMinuten: arbeitszeit,
          abwesenheitMinuten: abwesenheit,
          lohnMinuten: lohnzeit,
          saldoMinuten: vertrag > 0 ? lohnzeit - vertrag : 0,
          stundensatz: zahl(person.hourly_rate)
        };
      });

    return NextResponse.json({
      ok: true,
      monat,
      von,
      bis,
      zeilen,
      summe: {
        offen: zeilen.reduce((s, z) => s + z.offen, 0),
        arbeitMinuten: zeilen.reduce((s, z) => s + z.arbeitMinuten, 0),
        abwesenheitMinuten: zeilen.reduce((s, z) => s + z.abwesenheitMinuten, 0),
        lohnMinuten: zeilen.reduce((s, z) => s + z.lohnMinuten, 0)
      }
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Lohnübersicht konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
