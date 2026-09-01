import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { istListe } from "@/lib/einstellungen";
import { STAMMSPALTEN } from "@/lib/einstellungenPlan";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Die Stammlisten aus den Einstellungen: Auftragsarten, Lohnarten, Feiertage,
 * Lieferanten und so weiter.
 *
 * Alle liegen in einer Tabelle, unterschieden durch die Spalte "liste". Diese
 * eine Route bedient sie deshalb alle. Welche Listen es gibt, steht in
 * lib/einstellungen.ts — was da nicht drinsteht, wird abgelehnt. Sonst könnte
 * ein Tippfehler im Browser eine neue Liste ins Leben rufen, die niemand je
 * wieder findet.
 *
 * Was zu den gemeinsamen Spalten gehört (Name, Nummer, Farbe, aktiv,
 * Reihenfolge), wird als Spalte geschrieben. Alles Übrige landet in "daten".
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

function zahlOderNull(value: unknown) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const zahl = Number(text);
  return Number.isFinite(zahl) ? zahl : null;
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  return { ok: true as const, auth };
}

/** Eingaben in Spalten und JSON-Teil zerlegen. */
function zerlegen(felder: AnyRow) {
  const spalten: AnyRow = {};
  const daten: AnyRow = {};

  for (const [schluessel, wert] of Object.entries(felder || {})) {
    if (schluessel === "id" || schluessel === "liste") continue;
    if (STAMMSPALTEN.includes(schluessel)) {
      if (schluessel === "nummer" || schluessel === "sortierung") spalten[schluessel] = zahlOderNull(wert);
      else if (schluessel === "aktiv") spalten[schluessel] = wert !== false;
      else spalten[schluessel] = clean(wert) || null;
    } else {
      daten[schluessel] = wert === "" ? null : wert;
    }
  }

  return { spalten, daten };
}

const FEHLT = "Die Einstellungstabellen fehlen noch. Bitte supabase/einstellungen.sql ausführen.";

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const liste = clean(body.liste);
    if (!istListe(liste)) return NextResponse.json({ ok: false, error: `Unbekannte Liste: ${liste || "(leer)"}` }, { status: 400 });

    const { spalten, daten } = zerlegen(body.felder || {});
    if (!clean(spalten.name)) return NextResponse.json({ ok: false, error: "Bitte einen Namen eintragen." }, { status: 400 });

    // Nummer und Reihenfolge nachziehen, wenn nichts angegeben wurde.
    const letzte = await supabase
      .from("settings_lists")
      .select("nummer, sortierung")
      .eq("liste", liste)
      .order("sortierung", { ascending: false })
      .limit(200);
    if (letzte.error && fehlendeTabelle(letzte.error)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });

    const vorhandene = (letzte.data || []) as AnyRow[];
    const hoechsteNummer = vorhandene.reduce((max, zeile) => Math.max(max, Number(zeile.nummer) || 0), 0);
    const hoechsteSortierung = vorhandene.reduce((max, zeile) => Math.max(max, Number(zeile.sortierung) || 0), 0);

    if (spalten.nummer === null || spalten.nummer === undefined) spalten.nummer = hoechsteNummer + 1;
    if (spalten.sortierung === null || spalten.sortierung === undefined) spalten.sortierung = hoechsteSortierung + 1;
    if (spalten.aktiv === undefined) spalten.aktiv = true;

    const jetzt = new Date().toISOString();
    const ergebnis = await supabase
      .from("settings_lists")
      .insert({ liste, ...spalten, daten, created_at: jetzt, updated_at: jetzt })
      .select()
      .maybeSingle();

    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true, eintrag: ergebnis.data });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Anlegen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung des Eintrags." }, { status: 400 });

    const vorher = await supabase.from("settings_lists").select("*").eq("id", id).maybeSingle();
    if (vorher.error && fehlendeTabelle(vorher.error)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    if (vorher.error) throw new Error(vorher.error.message);
    if (!vorher.data) return NextResponse.json({ ok: false, error: "Dieser Eintrag wurde nicht gefunden." }, { status: 404 });

    const alt = vorher.data as AnyRow;
    const { spalten, daten } = zerlegen(body.felder || {});

    // Der JSON-Teil wird zusammengeführt, nicht ersetzt: ein Formular, das nur
    // den Schalter "aktiv" umlegt, soll nicht alles Übrige leeren.
    const altDaten = (alt.daten && typeof alt.daten === "object" ? alt.daten : {}) as AnyRow;

    const ergebnis = await supabase
      .from("settings_lists")
      .update({ ...spalten, daten: { ...altDaten, ...daten }, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true, eintrag: ergebnis.data });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung des Eintrags." }, { status: 400 });

    const ergebnis = await supabase.from("settings_lists").delete().eq("id", id);
    if (ergebnis.error && fehlendeTabelle(ergebnis.error)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
