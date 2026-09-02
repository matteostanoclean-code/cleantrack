import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { buildRecords } from "@/lib/zeiten";
import { zeitgrenzenLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Wirtschaftlichkeit je Objekt für einen Monat.
 *
 * Die Frage, die dieser Bildschirm beantwortet: Womit verdienst du Geld, und
 * womit legst du drauf. Der Umsatz allein sagt das nicht — ein Objekt mit
 * 800 Euro Pauschale, an dem zwanzig Stunden hängen, ist schlechter als eines
 * mit 400 und fünf.
 *
 * Zwei Arten von Erlös:
 *   Pauschale     ein fester Betrag im Monat, unabhängig von den Stunden
 *   Stundensatz   Stunden mal Satz, für alles ohne Pauschale
 * Steht am Objekt beides, gilt die Pauschale. Steht keines von beidem, kommt
 * das Objekt in eine eigene Gruppe, statt mit null Umsatz die Bilanz zu
 * verzerren.
 *
 * Die Stunden kommen über dieselbe Rechnung wie Zeitenfreigabe und Lohn.
 * Gezählt wird nur, was freigegeben ist — offene Zeiten stehen daneben, damit
 * sichtbar bleibt, wie vorläufig die Zahl noch ist.
 *
 * WICHTIG zu den Kosten: Gerechnet wird mit dem Bruttostundenlohn aus dem
 * Mitarbeiterstamm. Das ist NICHT, was die Stunde dich wirklich kostet — die
 * Arbeitgeberanteile beziehungsweise die Pauschalabgaben beim Minijob fehlen.
 * Der Deckungsbeitrag hier ist deshalb die Obergrenze, nie das Ergebnis.
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

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 });

    const supabase = auth.supabase;
    const { searchParams } = new URL(request.url);
    const monat = clean(searchParams.get("month")) || new Date().toISOString().slice(0, 7);
    const { von, bis, tage } = monatsGrenzen(monat);

    // Ein Tag Puffer, damit Buchungen am Tagesrand nicht durch die Zeitzone fallen.
    const rahmenVon = new Date(`${von}T00:00:00`);
    rahmenVon.setDate(rahmenVon.getDate() - 1);
    const rahmenBis = new Date(`${bis}T23:59:59`);
    rahmenBis.setDate(rahmenBis.getDate() + 1);

    const [objekteErgebnis, personenErgebnis, zeitenErgebnis, aufgabenErgebnis, materialErgebnis, monatskostenErgebnis] = await Promise.all([
      supabase.from("work_sites").select("*").order("name", { ascending: true }).limit(500),
      supabase.from("employee_profiles").select("id, name, hourly_rate, active, role"),
      supabase
        .from("time_entries")
        .select("*")
        .gte("created_at", rahmenVon.toISOString())
        .lte("created_at", rahmenBis.toISOString())
        .order("created_at", { ascending: true })
        .limit(4000),
      supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done, status, window_binding")
        .gte("task_date", von)
        .lte("task_date", bis)
        .limit(4000),
      supabase.from("material_reports").select("*").order("created_at", { ascending: false }).limit(4000),
      supabase.from("settings_lists").select("*").eq("liste", "monatskosten").eq("name", monat).maybeSingle()
    ]);

    if (objekteErgebnis.error) throw new Error(objekteErgebnis.error.message);

    const objekte = (objekteErgebnis.data || []) as AnyRow[];
    const aufgaben = (aufgabenErgebnis.data || []) as AnyRow[];

    const tasksById = new Map<string, AnyRow>();
    for (const aufgabe of aufgaben) tasksById.set(aufgabe.id, aufgabe);

    // Einsätze nachladen, auf die Buchungen zeigen, die aber außerhalb des
    // Monats liegen — sonst fehlt ihnen die Zeitvorgabe.
    const fehlendeIds = Array.from(new Set(
      ((zeitenErgebnis.data || []) as AnyRow[]).map((eintrag) => clean(eintrag.task_id)).filter((id) => id && !tasksById.has(id))
    ));
    if (fehlendeIds.length) {
      const nachschlag = await supabase
        .from("tasks")
        .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, planned_minutes, max_minutes, paid_minutes, wage_minutes, work_site_id, task_type, done, status, window_binding")
        .in("id", fehlendeIds);
      for (const aufgabe of (nachschlag.data || []) as AnyRow[]) tasksById.set(aufgabe.id, aufgabe);
    }

    const eintraege = ((zeitenErgebnis.data || []) as AnyRow[]).filter((eintrag) => {
      const tag = clean(eintrag.created_at).slice(0, 10);
      return tag >= von && tag <= bis;
    });

    const saetze = buildRecords(eintraege, tasksById, await zeitgrenzenLaden(supabase));

    // Stundenlohn je Person, für die Kostenseite.
    const lohnJePerson = new Map<string, number | null>();
    for (const person of ((personenErgebnis.data || []) as AnyRow[])) {
      const name = clean(person.name).toLowerCase();
      if (!name) continue;
      const satz = zahl(person.hourly_rate);
      lohnJePerson.set(name, satz > 0 ? satz : null);
    }

    type Sammler = {
      minutenFrei: number;
      minutenOffen: number;
      minutenGeplant: number;
      lohnkosten: number;
      minutenOhneLohn: number;
      personen: Set<string>;
      materialkosten: number;
      materialerloes: number;
      materialZeilen: number;
      materialOhnePreis: number;
    };
    const leererSammler = (): Sammler => ({
      minutenFrei: 0, minutenOffen: 0, minutenGeplant: 0, lohnkosten: 0, minutenOhneLohn: 0, personen: new Set<string>(),
      materialkosten: 0, materialerloes: 0, materialZeilen: 0, materialOhnePreis: 0
    });

    const jeObjekt = new Map<string, Sammler>();
    const ohneObjekt = leererSammler();
    const personenOhneLohn = new Set<string>();

    for (const satz of saetze as AnyRow[]) {
      const objektId = clean(satz.workSiteId);
      const topf = objektId ? (jeObjekt.get(objektId) || leererSammler()) : ohneObjekt;
      if (objektId) jeObjekt.set(objektId, topf);

      const person = clean(satz.employeeName);
      if (person) topf.personen.add(person);

      const minuten = Number(satz.approvedMinutes ?? satz.actualMinutes ?? 0) || 0;

      if (satz.state === "approved") {
        topf.minutenFrei += minuten;
        const lohn = lohnJePerson.get(person.toLowerCase());
        if (lohn === null || lohn === undefined) {
          topf.minutenOhneLohn += minuten;
          if (person) personenOhneLohn.add(person);
        } else {
          topf.lohnkosten += (minuten / 60) * lohn;
        }
      } else {
        topf.minutenOffen += minuten;
      }
    }

    /**
     * Material je Objekt.
     *
     * Gezählt wird ab dem Moment, in dem tatsächlich bestellt wurde — was nur
     * gemeldet ist, hat noch nichts gekostet. Als Datum gilt die Lieferung,
     * ersatzweise die Bestellung, ersatzweise die Meldung.
     *
     * Nicht weiterberechnetes Material ist reine Kosten. Genau darum geht es:
     * Toiletten- und Handpapier, das im Objekt verschwindet, ohne je auf einer
     * Rechnung aufzutauchen.
     */
    const materialGemeldet: AnyRow[] = [];
    for (const zeile of ((materialErgebnis.data || []) as AnyRow[])) {
      const zustand = clean(zeile.status).toLowerCase();
      const datum = clean(zeile.delivered_at || zeile.ordered_at || zeile.created_at).slice(0, 10);
      if (datum < von || datum > bis) continue;

      if (!["ordered", "done", "billed"].includes(zustand)) {
        // Gemeldet, aber noch nicht bestellt. Kostet noch nichts, ist aber
        // ein offener Punkt.
        if (zustand === "open") materialGemeldet.push({ objekt: clean(zeile.object_name), artikel: clean(zeile.material_name || zeile.product_name) });
        continue;
      }

      const objektId = clean(zeile.work_site_id);
      if (!objektId) continue;
      const topf = jeObjekt.get(objektId) || leererSammler();
      jeObjekt.set(objektId, topf);

      const menge = Math.max(1, zahl(zeile.quantity ?? zeile.quantity_requested ?? zeile.amount) || 1);
      const einkauf = zahl(zeile.unit_price);
      topf.materialZeilen += 1;
      if (einkauf > 0) topf.materialkosten += menge * einkauf;
      else topf.materialOhnePreis += 1;
      if (zeile.billable === true) topf.materialerloes += menge * zahl(zeile.sale_unit_price);
    }

    // Planzeit je Objekt aus den Einsätzen des Monats.
    for (const aufgabe of aufgaben) {
      const objektId = clean(aufgabe.work_site_id);
      if (!objektId) continue;
      const topf = jeObjekt.get(objektId) || leererSammler();
      jeObjekt.set(objektId, topf);
      topf.minutenGeplant += zahl(aufgabe.planned_minutes);
    }

    const zeilen = objekte.map((objekt) => {
      const topf = jeObjekt.get(clean(objekt.id)) || leererSammler();
      const pauschale = zahl(objekt.monthly_flat_rate);
      const stundensatz = zahl(objekt.hourly_rate);
      const stunden = topf.minutenFrei / 60;

      // Pauschale schlägt Stundensatz. Steht beides da, ist die Pauschale
      // vereinbart und der Satz nur eine Notiz für Zusatzarbeiten.
      const art: "pauschale" | "stundensatz" | "keiner" =
        pauschale > 0 ? "pauschale" : stundensatz > 0 ? "stundensatz" : "keiner";
      const leistungsErloes = art === "pauschale" ? pauschale : art === "stundensatz" ? stunden * stundensatz : 0;

      // Weiterberechnetes Material steht als eigene Position auf der Rechnung
      // und kommt deshalb oben drauf, nicht in die Pauschale hinein.
      const erloes = leistungsErloes + topf.materialerloes;
      const kosten = topf.lohnkosten + topf.materialkosten;
      const deckungsbeitrag = erloes - kosten;

      return {
        id: objekt.id,
        name: clean(objekt.name) || "Ohne Namen",
        objektnummer: objekt.object_number ?? null,
        kunde: clean(objekt.customer_name) || null,
        tags: clean(objekt.tags) || null,
        aktiv: objekt.active !== false && clean(objekt.status).toLowerCase() !== "passiv",
        art,
        pauschale: pauschale > 0 ? pauschale : null,
        stundensatz: stundensatz > 0 ? stundensatz : null,
        minutenFrei: Math.round(topf.minutenFrei),
        minutenOffen: Math.round(topf.minutenOffen),
        minutenGeplant: Math.round(topf.minutenGeplant),
        minutenOhneLohn: Math.round(topf.minutenOhneLohn),
        personen: topf.personen.size,
        leistungsErloes,
        materialerloes: topf.materialerloes,
        materialkosten: topf.materialkosten,
        materialZeilen: topf.materialZeilen,
        materialOhnePreis: topf.materialOhnePreis,
        erloes,
        lohnkosten: topf.lohnkosten,
        deckungsbeitrag: art === "keiner" ? null : deckungsbeitrag,
        marge: art === "keiner" || erloes <= 0 ? null : (deckungsbeitrag / erloes) * 100,
        erloesJeStunde: art === "keiner" || stunden <= 0 ? null : erloes / stunden
      };
    });

    const gerechnet = zeilen.filter((zeile) => zeile.art !== "keiner");
    const summe = {
      erloes: gerechnet.reduce((s, z) => s + z.erloes, 0),
      lohnkosten: gerechnet.reduce((s, z) => s + z.lohnkosten, 0),
      materialkosten: zeilen.reduce((s, z) => s + z.materialkosten, 0),
      materialerloes: zeilen.reduce((s, z) => s + z.materialerloes, 0),
      materialOhnePreis: zeilen.reduce((s, z) => s + z.materialOhnePreis, 0),
      minutenFrei: zeilen.reduce((s, z) => s + z.minutenFrei, 0),
      minutenOffen: zeilen.reduce((s, z) => s + z.minutenOffen, 0),
      minutenGeplant: zeilen.reduce((s, z) => s + z.minutenGeplant, 0),
      minutenOhneObjekt: Math.round(ohneObjekt.minutenFrei),
      objekteOhneSatz: zeilen.filter((z) => z.art === "keiner" && (z.minutenFrei > 0 || z.aktiv)).length
    };

    const heute = new Date().toISOString().slice(0, 10);

    /**
     * Lohnkosten des Monats aus der Lohnabrechnung.
     *
     * Solange nicht jede Stunde einem Objekt zugeordnet ist, lässt sich der
     * Lohn nicht sauber verteilen. Die eine Zahl aus der Abrechnung ist aber
     * schon jetzt richtig — und eine richtige Gesamtzahl ist mehr wert als
     * eine erfundene Aufteilung.
     *
     * Sie ersetzt deshalb im Gesamtergebnis die Summe der objektbezogenen
     * Lohnkosten. Die Spalte je Objekt bleibt daneben stehen und zeigt, was
     * sich bisher zuordnen lässt.
     */
    const monatskostenZeile = (monatskostenErgebnis.error ? null : monatskostenErgebnis.data) as AnyRow | null;
    const monatsDaten = (monatskostenZeile?.daten && typeof monatskostenZeile.daten === "object" ? monatskostenZeile.daten : {}) as AnyRow;
    const lohnkostenMonat = monatsDaten.lohnkosten === null || monatsDaten.lohnkosten === undefined ? null : zahl(monatsDaten.lohnkosten);

    return NextResponse.json({
      ok: true,
      monat,
      von,
      bis,
      tage,
      lohnkostenMonat,
      lohnkostenMonatDetails: {
        gehalt: monatsDaten.gehalt ?? null,
        ag_kosten: monatsDaten.ag_kosten ?? null,
        sachzuwendung: monatsDaten.sachzuwendung ?? null,
        notiz: monatsDaten.notiz ?? null
      },
      monatskostenId: monatskostenZeile?.id || null,
      // Läuft der Monat noch, steht die volle Pauschale gegen erst halb
      // erfasste Stunden. Die Marge sieht dann besser aus, als sie ist.
      laufend: heute >= von && heute <= bis,
      zeilen,
      summe: {
        ...summe,
        // Die eingetragene Zahl aus der Abrechnung schlägt die aus Stunden
        // gerechnete: sie stimmt, die andere ist noch unvollständig.
        lohnkostenGesamt: lohnkostenMonat ?? summe.lohnkosten,
        deckungsbeitrag: summe.erloes - (lohnkostenMonat ?? summe.lohnkosten) - summe.materialkosten
      },
      personenOhneLohn: Array.from(personenOhneLohn).sort(),
      materialGemeldet,
      hinweisKosten: "Gerechnet mit dem Bruttostundenlohn aus dem Mitarbeiterstamm. Arbeitgeberanteile und Pauschalabgaben sind nicht enthalten — der Deckungsbeitrag ist die Obergrenze."
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Auswertung konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
