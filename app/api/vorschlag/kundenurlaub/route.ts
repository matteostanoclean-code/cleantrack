import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { safeInsert } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Schließzeit aus einer Kundenantwort vorschlagen.
 *
 * Gegenstelle für die Jahresabfrage im Büro-System: Dort wird das Postfach
 * gelesen, hier landet, was dabei herauskam. Angelegt wird immer als
 * **Vorschlag** (bestaetigt = false) — der Planer sieht ihn nicht an, bis
 * jemand im Urlaubsplaner zustimmt. Aus Fließtext gelesene Zeiträume still
 * in die Planung zu schreiben wäre der sichere Weg zu einem Einsatz, der
 * ausfällt, obwohl der Kunde offen hat.
 *
 * Eigener Zugang statt des Service-Schlüssels, und zwar mit Absicht: Dieses
 * Ende kann nichts weiter als unbestätigte Zeiträume anlegen. Kommt der
 * Schlüssel abhanden, ist der Schaden ein paar Vorschläge, die jemand
 * wegtippt.
 *
 * Ohne gesetzten Schlüssel ist das Ende zu. Nicht offen — ein Schreibzugang,
 * der mangels Einstellung jeden hereinlässt, ist schlimmer als keiner.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function datumOderNull(wert: unknown) {
  const text = clean(wert).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function POST(request: Request) {
  try {
    const schluessel = process.env.VORSCHLAG_SCHLUESSEL;
    if (!schluessel) {
      return NextResponse.json({ ok: false, error: "Dieses Ende ist nicht eingerichtet." }, { status: 503 });
    }
    if (clean(request.headers.get("authorization")) !== `Bearer ${schluessel}`) {
      return NextResponse.json({ ok: false, error: "Nicht berechtigt." }, { status: 401 });
    }

    const body = await request.json();
    const absender = clean(body.absender).toLowerCase();
    const von = datumOderNull(body.von);
    const bis = datumOderNull(body.bis) || von;

    if (!absender) return NextResponse.json({ ok: false, error: "Absender fehlt." }, { status: 400 });
    if (!von || !bis) return NextResponse.json({ ok: false, error: "Zeitraum fehlt oder ist unbrauchbar." }, { status: 400 });
    if (bis < von) return NextResponse.json({ ok: false, error: "Das Ende liegt vor dem Anfang." }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // Der Kunde wird über seine Mailadresse gefunden. Beide Felder, weil die
    // Kundenliste historisch zwei kennt.
    const kunden = await supabase
      .from("customers")
      .select("id, name, email, customer_email")
      .or(`email.ilike.${absender},customer_email.ilike.${absender}`)
      .limit(5);
    if (kunden.error) throw new Error(kunden.error.message);

    const kunde = ((kunden.data || []) as AnyRow[])[0] || null;
    if (!kunde) {
      return NextResponse.json(
        { ok: false, error: `Zu ${absender} gibt es keinen Kunden mit dieser Adresse.`, unbekannt: true },
        { status: 404 }
      );
    }

    // Macht ein Kunde zu, macht er an allen seinen Objekten zu. Je Objekt
    // eine Zeile, damit später eines davon einzeln wieder aufmachen kann.
    const objekte = await supabase
      .from("work_sites")
      .select("id, name, customer_name, active, status")
      .eq("customer_id", kunde.id)
      .limit(50);
    const ziele = ((objekte.data || []) as AnyRow[]).filter(
      (objekt) => objekt.active !== false && clean(objekt.status).toLowerCase() !== "passiv"
    );
    if (!ziele.length) {
      return NextResponse.json({ ok: false, error: `Zu ${clean(kunde.name)} gibt es kein aktives Objekt.` }, { status: 404 });
    }

    // Schon vorgeschlagen? Dann nicht noch einmal. Antwortet jemand zweimal
    // oder läuft die Abholung zweimal, soll nicht alles doppelt dastehen.
    const vorhanden = await supabase
      .from("site_closures")
      .select("id")
      .in("work_site_id", ziele.map((objekt) => objekt.id))
      .eq("von", von)
      .eq("bis", bis)
      .limit(1);
    if ((vorhanden.data || []).length) {
      return NextResponse.json({ ok: true, schonDa: true, anzahl: 0, kunde: clean(kunde.name) });
    }

    const angelegt: AnyRow[] = [];
    for (const objekt of ziele) {
      const ergebnis = await safeInsert(supabase, "site_closures", {
        work_site_id: objekt.id,
        object_name: clean(objekt.name) || null,
        customer_name: clean(objekt.customer_name) || clean(kunde.name) || null,
        von,
        bis,
        grund: clean(body.grund) || "Betriebsferien",
        faellt_aus: body.faellt_aus !== false,
        bestaetigt: false,
        quelle: "mail",
        absender,
        zitat: clean(body.zitat) || null,
        erkannt_at: new Date().toISOString(),
        created_by: "Kundenantwort"
      });
      if (ergebnis.data) angelegt.push(ergebnis.data);
    }

    return NextResponse.json({
      ok: true,
      kunde: clean(kunde.name),
      objekte: ziele.map((objekt) => clean(objekt.name)),
      anzahl: angelegt.length
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Vorschlag konnte nicht angelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
