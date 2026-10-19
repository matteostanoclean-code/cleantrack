import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { kundeZumToken, sauber } from "@/lib/portal";
import { pushAnBuero } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Das Kundenportal: was der Kunde sieht und was er melden kann.
 *
 * Gezeigt werden Besuche, keine Zeiten: an welchem Tag an welchem Objekt
 * gearbeitet wurde und was gemacht wurde. Stunden, Löhne und Deckungsbeiträge
 * haben hier nichts verloren und werden gar nicht erst geladen.
 *
 * Auch keine Namen der Mitarbeiter. Das ist eine Entscheidung, keine
 * technische Grenze: Namen sind personenbezogene Daten, und sie an Kunden
 * weiterzugeben ist etwas, das man mit seinen Leuten bespricht, bevor man es
 * tut.
 */

const MONATE_ZURUECK = 6;

function tagVor(monate: number) {
  const datum = new Date();
  datum.setMonth(datum.getMonth() - monate);
  return datum.toISOString().slice(0, 10);
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const kunde = await kundeZumToken(token);
    // Unbekannt und abgeschaltet sehen gleich aus: aus der Antwort soll sich
    // nichts ableiten lassen.
    if (!kunde) return NextResponse.json({ ok: false, error: "Dieser Zugang ist nicht gültig." }, { status: 404 });

    const supabase = getSupabaseAdmin();
    const objektIds = kunde.objekte.map((objekt) => sauber(objekt.id)).filter(Boolean);
    if (!objektIds.length) {
      return NextResponse.json({ ok: true, kunde: { name: kunde.name }, objekte: [], besuche: [] });
    }

    const von = tagVor(MONATE_ZURUECK);

    const [stempel, aufgaben] = await Promise.all([
      supabase
        .from("time_entries")
        .select("work_site_id, work_site_name, created_at, action, task_id")
        .in("work_site_id", objektIds)
        .gte("created_at", `${von}T00:00:00.000Z`)
        .order("created_at", { ascending: false })
        .limit(4000),
      supabase
        .from("tasks")
        .select("id, title, work_site_id, task_date")
        .in("work_site_id", objektIds)
        .gte("task_date", von)
        .limit(4000)
    ]);

    const aufgabenNach = new Map<string, AnyRow>();
    for (const aufgabe of ((aufgaben.data || []) as AnyRow[])) aufgabenNach.set(sauber(aufgabe.id), aufgabe);

    /**
     * Ein Besuch ist ein Tag an einem Objekt, an dem gestempelt wurde. Wer
     * zweimal am Tag ein- und ausstempelt, war trotzdem einmal da.
     */
    const besuche = new Map<string, AnyRow>();
    for (const eintrag of ((stempel.data || []) as AnyRow[])) {
      if (sauber(eintrag.action) !== "clock_in") continue;
      const tag = sauber(eintrag.created_at).slice(0, 10);
      const objektId = sauber(eintrag.work_site_id);
      if (!tag || !objektId) continue;

      const schluessel = `${tag}|${objektId}`;
      const vorhanden = besuche.get(schluessel) || {
        datum: tag,
        objektId,
        objekt: sauber(eintrag.work_site_name) || sauber(kunde.objekte.find((o) => sauber(o.id) === objektId)?.name),
        leistungen: new Set<string>()
      };
      const aufgabe = eintrag.task_id ? aufgabenNach.get(sauber(eintrag.task_id)) : null;
      const leistung = sauber(aufgabe?.title);
      if (leistung) vorhanden.leistungen.add(leistung);
      besuche.set(schluessel, vorhanden);
    }

    return NextResponse.json({
      ok: true,
      kunde: { name: kunde.name },
      objekte: kunde.objekte.map((objekt) => ({
        id: objekt.id,
        name: sauber(objekt.name),
        anschrift: sauber(objekt.address) || [sauber(objekt.street), [sauber(objekt.postal_code), sauber(objekt.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ")
      })),
      besuche: Array.from(besuche.values())
        .map((besuch) => ({
          datum: besuch.datum,
          objektId: besuch.objektId,
          objekt: besuch.objekt,
          leistungen: Array.from(besuch.leistungen as Set<string>)
        }))
        .sort((a, b) => b.datum.localeCompare(a.datum))
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Die Übersicht konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Eine Reklamation aus dem Portal. Wird ein ganz normaler REKL-Vorgang. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const kunde = await kundeZumToken(token);
    if (!kunde) return NextResponse.json({ ok: false, error: "Dieser Zugang ist nicht gültig." }, { status: 404 });

    const body = await request.json();
    const beschreibung = sauber(body.beschreibung).slice(0, 4000);
    if (!beschreibung) return NextResponse.json({ ok: false, error: "Bitte beschreiben, was nicht gepasst hat." }, { status: 400 });

    const objektId = sauber(body.work_site_id);
    const objekt = kunde.objekte.find((eintrag) => sauber(eintrag.id) === objektId) || null;

    const supabase = getSupabaseAdmin();

    const letzte = await supabase
      .from("tickets")
      .select("ticket_number")
      .eq("ticket_type", "REKL")
      .order("ticket_number", { ascending: false })
      .limit(1);
    const nummer = Number(letzte.data?.[0]?.ticket_number || 0) + 1;

    const bilder = Array.isArray(body.photo_urls) ? body.photo_urls.map(sauber).filter(Boolean).slice(0, 6) : [];
    const jetzt = new Date().toISOString();
    const titel = `Reklamation ${kunde.name}${objekt ? ` · ${sauber(objekt.name)}` : ""}`;

    const eintrag = await supabase
      .from("tickets")
      .insert({
        ticket_type: "REKL",
        ticket_number: nummer,
        identifier: `REKL-${nummer}`,
        title: titel,
        description: beschreibung,
        // Eine Reklamation vom Kunden ist nie "gering". Was sie wirklich ist,
        // entscheidet das Büro beim Ansehen.
        priority: "hoch",
        status: "offen",
        created_by: kunde.name,
        quelle: "kunde",
        contact_person: sauber(body.name) || null,
        contact_email: sauber(body.email) || null,
        contact_phone: sauber(body.telefon) || null,
        link_customer_id: kunde.id,
        link_customer_name: kunde.name,
        link_work_site_id: objekt ? objekt.id : null,
        link_work_site_name: objekt ? sauber(objekt.name) : null,
        photo_urls: bilder,
        archived: false,
        created_at: jetzt,
        updated_at: jetzt
      })
      .select()
      .maybeSingle();

    if (eintrag.error) throw new Error(eintrag.error.message);

    await supabase.from("admin_notifications").insert({
      title: "Reklamation vom Kunden",
      message: `${kunde.name}${objekt ? ` · ${sauber(objekt.name)}` : ""}: ${beschreibung.slice(0, 200)}`,
      notification_type: "reklamation",
      status: "open",
      read: false,
      created_at: jetzt
    });

    // Eine Reklamation soll nicht bis zum nächsten Blick ins Dashboard warten.
    await pushAnBuero(
      supabase,
      "Reklamation vom Kunden",
      `${kunde.name}${objekt ? ` · ${sauber(objekt.name)}` : ""}: ${beschreibung.slice(0, 120)}`,
      "/mitarbeiter/admin/aufgaben",
      "reklamation"
    );

    return NextResponse.json({ ok: true, kuerzel: `REKL-${nummer}` });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Die Meldung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
