import { NextResponse } from "next/server";
import { anmelden } from "@/lib/geraeteSchluessel";
import { safeInsert } from "@/lib/safeWrite";
import { dauerGesprochen, namenSuchen, verstehen, type Treffer } from "@/lib/sprache";

export const dynamic = "force-dynamic";

/**
 * Gegenstelle für gesprochene Sätze.
 *
 * Ein Satz kommt herein — diktiert vom Handy, zugerufen am Rechner oder
 * getippt — und wird zu einem Zettel. Nicht mehr und nicht weniger.
 *
 * Zwei Entscheidungen, die hier wichtiger sind als jede Funktion:
 *
 * 1. **Zwei Schritte, nie einer.** Ohne `ausfuehren: true` wird nur
 *    verstanden und zurückgefragt. Eine Spracherkennung irrt sich, und ein
 *    stiller Fehleintrag fällt erst Wochen später auf.
 *
 * 2. **Zeiten werden hier nicht gebucht.** Eine erfasste Zeit hängt an einem
 *    geplanten Einsatz und geht über die Zeitenfreigabe ins Büro. Wer sie per
 *    Zuruf einträgt, umgeht die Prüfung und schreibt ungeprüft in die
 *    Lohndaten. Gesprochene Zeiten werden deshalb als Zettel abgelegt, damit
 *    sie über den normalen Weg nachgetragen werden können.
 */

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

const FEHLT = "Die Notiztabelle fehlt noch. Bitte supabase/notizen.sql ausführen.";

/**
 * Anmeldung fürs Zurufen.
 *
 * Nimmt beides an: die normale Anmeldung aus dem Browser und einen
 * Geräteschlüssel aus der Brutus-App. Für die App ist das nötig, weil ein
 * Browser-Zugang nach kurzer Zeit abläuft und niemand jede Stunde etwas
 * abtippen will.
 */
async function requireAdmin(request: Request) {
  const auth = await anmelden(request);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  }
  if (!auth.isAdmin) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  }
  return { ok: true as const, auth };
}

/** Objekte und Kunden als Suchliste. Beides, weil man mal so und mal so spricht. */
async function namenslisten(supabase: AnyRow) {
  const objekte = await supabase.from("work_sites").select("id, name").limit(500);
  const kunden = await supabase.from("customers").select("id, name").limit(500);

  const zuTreffern = (zeilen: AnyRow[] | null | undefined): Treffer[] =>
    (zeilen || [])
      .map((zeile) => ({ id: clean(zeile.id), name: clean(zeile.name) }))
      .filter((eintrag) => eintrag.id && eintrag.name);

  return {
    objekte: objekte.error ? [] : zuTreffern(objekte.data),
    kunden: kunden.error ? [] : zuTreffern(kunden.data)
  };
}

/** Datum in gesprochener Form: "am fünften September". */
function datumGesprochen(datum: string | null, wortlaut: string | null) {
  if (wortlaut && /^(heute|morgen|gestern|vorgestern|uebermorgen)$/.test(wortlaut)) {
    return wortlaut === "uebermorgen" ? "übermorgen" : wortlaut;
  }
  if (!datum) return null;
  const [, monat, tag] = datum.split("-");
  return `am ${Number(tag)}.${Number(monat)}.`;
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const listen = await namenslisten(guard.auth.supabase);
  return NextResponse.json({
    ok: true,
    objekte: listen.objekte.length,
    kunden: listen.kunden.length,
    hinweis: "POST mit { text } versteht den Satz, POST mit { text, ausfuehren: true } legt ihn an."
  });
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = (await request.json()) as AnyRow;
    const text = clean(body.text);
    if (!text) {
      return NextResponse.json({ ok: false, error: "Ich habe nichts verstanden.", antwort: "Ich habe nichts verstanden." }, { status: 400 });
    }

    const gehoert = verstehen(text);
    const listen = await namenslisten(supabase);

    const objekte = namenSuchen(text, listen.objekte);
    const kunden = namenSuchen(text, listen.kunden);

    // Mehrere Objekte im selben Satz sind keine Entscheidung, die geraten
    // werden darf. Zurückfragen und nichts anlegen.
    if (objekte.length > 1) {
      const namen = objekte.map((eintrag) => eintrag.name);
      return NextResponse.json({
        ok: true,
        rueckfrage: true,
        moeglichkeiten: namen,
        verstanden: gehoert,
        antwort: `Meinst du ${namen.slice(0, -1).join(", ")} oder ${namen[namen.length - 1]}?`
      });
    }

    const objekt = objekte[0] || null;
    const kunde = kunden[0] || null;

    // Eine gesprochene Zeit wird ein Zettel, keine Buchung. Der Grund steht
    // oben im Kopf dieser Datei.
    const istZeit = gehoert.absicht === "zeit";
    const titel = istZeit ? `Zeit nachtragen: ${gehoert.titel}` : gehoert.titel;
    const bereich = istZeit ? "Zeiten" : null;

    const entwurf = {
      titel,
      beschreibung: istZeit
        ? "Per Sprache erfasst. Bitte über die Zeitenfreigabe nachtragen."
        : null,
      faellig_am: gehoert.datum,
      uhrzeit: gehoert.beginn,
      wichtig: gehoert.wichtig,
      bereich,
      work_site_id: objekt?.id || null,
      object_name: objekt?.name || kunde?.name || null
    };

    // Der Satz, den die Stimme sagt. Er nennt alles, was gespeichert würde,
    // damit ein Hörfehler auffällt, bevor er in der Datenbank steht.
    const teile = [entwurf.titel];
    const wann = datumGesprochen(gehoert.datum, gehoert.datumWortlaut);
    if (wann) teile.push(wann);
    if (gehoert.beginn) teile.push(`um ${gehoert.beginn.replace(":", " Uhr ")}`.replace(" Uhr 00", " Uhr"));
    if (gehoert.minuten) teile.push(dauerGesprochen(gehoert.minuten));
    if (entwurf.object_name) teile.push(`für ${entwurf.object_name}`);
    if (gehoert.wichtig) teile.push("als wichtig");
    const zusammenfassung = teile.join(", ");

    if (body.ausfuehren !== true) {
      return NextResponse.json({
        ok: true,
        rueckfrage: true,
        verstanden: gehoert,
        entwurf,
        antwort: `${zusammenfassung}. Soll ich das eintragen?`
      });
    }

    const ergebnis = await safeInsert(supabase, "notes", {
      ...entwurf,
      erledigt: false,
      besitzer: guard.auth.profile.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const nachsatz = istZeit
      ? " Die Zeit selbst trägst du in der Zeitenfreigabe nach."
      : "";

    return NextResponse.json({
      ok: true,
      notiz: ergebnis.data,
      uebersprungen: ergebnis.skipped,
      antwort: `Eingetragen: ${zusammenfassung}.${nachsatz}`
    });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) {
      return NextResponse.json({ ok: false, error: FEHLT, antwort: "Die Notiztabelle fehlt noch." }, { status: 409 });
    }
    const text = fehler instanceof Error ? fehler.message : "Der Satz konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text, antwort: "Da ist etwas schiefgegangen, ich habe nichts gespeichert." }, { status: 500 });
  }
}
