import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Notizzettel.
 *
 * Getrennt von den Aufgaben-Vorgängen: eine Reklamation hat ein Kürzel, eine
 * Zuständigkeit und einen Verlauf, ein Zettel hat einen Satz und ein Datum.
 * Wer erst ein Formular ausfüllen muss, notiert nichts mehr.
 *
 * Erledigte werden nicht gelöscht, nur weggeräumt. Man will nachsehen können,
 * ob man etwas wirklich gemacht hat.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableDatum(value: unknown) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function nullableZeit(value: unknown) {
  const text = clean(value).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

const FEHLT = "Die Notiztabelle fehlt noch. Bitte supabase/notizen.sql ausführen.";

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  return { ok: true as const, auth };
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const notizen = await supabase
      .from("notes")
      .select("*")
      .order("faellig_am", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1000);

    if (notizen.error) {
      if (fehlendeTabelle(notizen.error)) {
        return NextResponse.json({ ok: true, setupFehlt: true, notizen: [], sites: [], bereiche: [] });
      }
      throw new Error(notizen.error.message);
    }

    const objekte = await supabase.from("work_sites").select("id, name").order("name", { ascending: true }).limit(500);

    // Die bereits benutzten Bereiche als Vorschlag. Keine feste Liste — was
    // jemand einmal getippt hat, kann er beim nächsten Mal anklicken.
    const bereiche = Array.from(new Set(
      ((notizen.data || []) as AnyRow[]).map((zeile) => clean(zeile.bereich)).filter(Boolean)
    )).sort();

    return NextResponse.json({
      ok: true,
      setupFehlt: false,
      notizen: notizen.data || [],
      sites: objekte.error ? [] : (objekte.data || []),
      bereiche
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Notizen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

function daten(body: AnyRow, objektName: string | null) {
  return {
    titel: clean(body.titel),
    beschreibung: nullableText(body.beschreibung),
    faellig_am: nullableDatum(body.faellig_am),
    uhrzeit: nullableZeit(body.uhrzeit),
    wichtig: body.wichtig === true,
    bereich: nullableText(body.bereich),
    work_site_id: uuidOrNull(body.work_site_id),
    object_name: objektName,
    updated_at: new Date().toISOString()
  };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    if (!clean(body.titel)) return NextResponse.json({ ok: false, error: "Bitte etwas eintragen." }, { status: 400 });

    const objektId = uuidOrNull(body.work_site_id);
    const objekt = objektId ? (await supabase.from("work_sites").select("name").eq("id", objektId).maybeSingle()).data : null;

    const ergebnis = await safeInsert(supabase, "notes", {
      ...daten(body, objekt?.name || null),
      erledigt: false,
      besitzer: guard.auth.profile.name,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, notiz: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Notiz konnte nicht angelegt werden.";
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
    if (!id) return NextResponse.json({ ok: false, error: "Notiz-ID fehlt." }, { status: 400 });

    // Nur abhaken oder wieder aufmachen — dann bleibt der Rest unangetastet.
    if (Object.prototype.hasOwnProperty.call(body, "erledigt") && !Object.prototype.hasOwnProperty.call(body, "titel")) {
      const fertig = body.erledigt === true;
      const ergebnis = await safeUpdateById(supabase, "notes", id, {
        erledigt: fertig,
        erledigt_am: fertig ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });
      return NextResponse.json({ ok: true, notiz: ergebnis.data });
    }

    if (!clean(body.titel)) return NextResponse.json({ ok: false, error: "Bitte etwas eintragen." }, { status: 400 });

    const objektId = uuidOrNull(body.work_site_id);
    const objekt = objektId ? (await supabase.from("work_sites").select("name").eq("id", objektId).maybeSingle()).data : null;

    const ergebnis = await safeUpdateById(supabase, "notes", id, daten(body, objekt?.name || null));
    return NextResponse.json({ ok: true, notiz: ergebnis.data, uebersprungen: ergebnis.skipped });
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

    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Notiz-ID fehlt." }, { status: 400 });

    const ergebnis = await guard.auth.supabase.from("notes").delete().eq("id", id);
    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
