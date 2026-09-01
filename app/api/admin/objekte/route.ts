import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { OBJEKT_TAGS, koordinaten } from "@/lib/objekte";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Objekte: wo gearbeitet wird.
 *
 * Ein Objekt ist der Ort, nicht der Kunde. Ein Kunde kann mehrere Objekte
 * haben, und am Objekt hängt alles Weitere: Einsätze, Geräte, Schlüssel,
 * Material, die NFC-Aufkleber und der Radius fürs Stempeln.
 *
 * Die Koordinaten werden beim Speichern aus der Anschrift geholt. Ohne sie
 * kann dort niemand stempeln, und von Hand einzutragen traut sich zu Recht
 * niemand.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableZahl(value: unknown) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const zahl = Number(text);
  return Number.isFinite(zahl) ? zahl : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

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

    const [objekte, kunden, personen, geraete, schluessel, aufgaben] = await Promise.all([
      supabase.from("work_sites").select("*").order("name", { ascending: true }).limit(500),
      supabase.from("customers").select("id, name, customer_number, street, postal_code, city, address").order("name", { ascending: true }).limit(500),
      supabase.from("employee_profiles").select("id, name, role, active").order("name", { ascending: true }),
      supabase.from("devices").select("id, work_site_id").limit(2000),
      supabase.from("key_items").select("id, work_site_id").limit(2000),
      supabase.from("tasks").select("work_site_id, planned_minutes, max_minutes, start_time, end_time, task_date").limit(4000)
    ]);

    if (objekte.error) throw new Error(objekte.error.message);

    return NextResponse.json({
      ok: true,
      sites: objekte.data || [],
      customers: kunden.data || [],
      employees: ((personen.data || []) as AnyRow[]).filter((row) => clean(row.name) && row.active !== false),
      devices: geraete.error ? [] : (geraete.data || []),
      keys: schluessel.error ? [] : (schluessel.data || []),
      tasks: aufgaben.error ? [] : (aufgaben.data || []),
      tags: OBJEKT_TAGS
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Objekte konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

function objektDaten(body: AnyRow, kunde: AnyRow | null) {
  const strasse = nullableText(body.street);
  const plz = nullableText(body.postal_code);
  const ort = nullableText(body.city);
  const anschrift = [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;

  const gewaehlteTags = Array.isArray(body.tags) ? body.tags.map(clean).filter(Boolean) : clean(body.tags).split(",").map(clean).filter(Boolean);

  return {
    name: clean(body.name),
    object_number: nullableZahl(body.object_number),
    object_manager: nullableText(body.object_manager),
    status: clean(body.status) || "aktiv",
    active: clean(body.status).toLowerCase() !== "passiv",
    tags: gewaehlteTags.length ? gewaehlteTags.join(", ") : null,
    street: strasse,
    postal_code: plz,
    city: ort,
    country: nullableText(body.country) || "DE Deutschland",
    address_addition: nullableText(body.address_addition),
    address: anschrift,
    allowed_radius_m: nullableZahl(body.allowed_radius_m) ?? 150,
    monthly_flat_rate: nullableZahl(body.monthly_flat_rate),
    hourly_rate: nullableZahl(body.hourly_rate),
    notes: nullableText(body.notes),
    customer_id: uuidOrNull(body.customer_id),
    customer_name: kunde ? clean(kunde.name) : nullableText(body.customer_name),
    customer_number: kunde ? clean(kunde.customer_number) || null : null
  };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    if (!clean(body.name)) return NextResponse.json({ ok: false, error: "Bitte einen Namen eintragen." }, { status: 400 });

    const kundeId = uuidOrNull(body.customer_id);
    const kunde = kundeId ? (await supabase.from("customers").select("*").eq("id", kundeId).maybeSingle()).data : null;

    const daten = objektDaten(body, kunde);

    if (!daten.object_number) {
      const letzte = await supabase.from("work_sites").select("object_number").order("object_number", { ascending: false }).limit(1);
      daten.object_number = Number(letzte.data?.[0]?.object_number || 0) + 1;
    }

    const ort = await koordinaten(daten.street || "", daten.postal_code || "", daten.city || "");
    const ergebnis = await safeInsert(supabase, "work_sites", {
      ...daten,
      latitude: ort?.latitude ?? null,
      longitude: ort?.longitude ?? null
    });

    return NextResponse.json({
      ok: true,
      item: ergebnis.data,
      uebersprungen: ergebnis.skipped,
      koordinatenGefunden: Boolean(ort),
      hinweis: ort ? null : "Für diese Anschrift wurde kein Standort gefunden. Ohne Koordinaten kann dort nicht gestempelt werden — bitte in der Objektliste nachtragen."
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Objekt konnte nicht angelegt werden.";
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
    if (!id) return NextResponse.json({ ok: false, error: "Objekt-ID fehlt." }, { status: 400 });

    const vorher = await supabase.from("work_sites").select("*").eq("id", id).maybeSingle();
    if (vorher.error) throw new Error(vorher.error.message);
    const alt = vorher.data as AnyRow | null;
    if (!alt) return NextResponse.json({ ok: false, error: "Objekt wurde nicht gefunden." }, { status: 404 });

    const kundeId = uuidOrNull(body.customer_id);
    const kunde = kundeId ? (await supabase.from("customers").select("*").eq("id", kundeId).maybeSingle()).data : null;
    const daten = objektDaten(body, kunde);

    // Nur neu suchen, wenn sich die Anschrift geändert hat oder noch keine
    // Koordinaten da sind. Sonst würde jedes Speichern eine fremde Stelle
    // befragen, ohne dass sich etwas geändert hat.
    const anschriftNeu = clean(daten.street) !== clean(alt.street)
      || clean(daten.postal_code) !== clean(alt.postal_code)
      || clean(daten.city) !== clean(alt.city);
    const brauchtKoordinaten = anschriftNeu || alt.latitude === null || alt.longitude === null;

    let breite = alt.latitude;
    let laenge = alt.longitude;
    let gefunden = breite !== null && laenge !== null;

    if (nullableZahl(body.latitude) !== null && nullableZahl(body.longitude) !== null) {
      // Von Hand eingetragene Koordinaten haben Vorrang.
      breite = nullableZahl(body.latitude);
      laenge = nullableZahl(body.longitude);
      gefunden = true;
    } else if (brauchtKoordinaten) {
      const ort = await koordinaten(daten.street || "", daten.postal_code || "", daten.city || "");
      if (ort) {
        breite = ort.latitude;
        laenge = ort.longitude;
        gefunden = true;
      } else if (anschriftNeu) {
        breite = null;
        laenge = null;
        gefunden = false;
      }
    }

    const ergebnis = await safeUpdateById(supabase, "work_sites", id, {
      ...daten,
      object_number: daten.object_number ?? alt.object_number,
      latitude: breite,
      longitude: laenge
    });

    return NextResponse.json({
      ok: true,
      item: ergebnis.data,
      uebersprungen: ergebnis.skipped,
      koordinatenGefunden: gefunden,
      hinweis: gefunden ? null : "Für diese Anschrift wurde kein Standort gefunden. Ohne Koordinaten kann dort nicht gestempelt werden."
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Objekt konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
