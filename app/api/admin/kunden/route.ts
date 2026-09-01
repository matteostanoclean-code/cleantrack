import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { koordinaten } from "@/lib/objekte";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Kunden.
 *
 * Der Kunde ist, wer die Rechnung bekommt. Wo gearbeitet wird, steht am
 * Objekt. Bei den meisten hier ist das dieselbe Anschrift — deshalb kann beim
 * Anlegen gleich ein Objekt mitentstehen, samt Koordinaten.
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

    const [kunden, objekte, kontakte] = await Promise.all([
      supabase.from("customers").select("*").order("name", { ascending: true }).limit(1000),
      supabase.from("work_sites").select("id, name, customer_id, address, active, status").limit(1000),
      supabase.from("customer_contacts").select("id, customer_id").limit(2000)
    ]);

    if (kunden.error) throw new Error(kunden.error.message);

    return NextResponse.json({
      ok: true,
      customers: kunden.data || [],
      sites: objekte.error ? [] : (objekte.data || []),
      contacts: kontakte.error ? [] : (kontakte.data || [])
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Kunden konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

function kundenDaten(body: AnyRow) {
  const strasse = nullableText(body.street);
  const plz = nullableText(body.postal_code);
  const ort = nullableText(body.city);
  const anschrift = [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;

  return {
    name: clean(body.name),
    company_name: clean(body.name),
    customer_name: clean(body.name),
    customer_number: nullableText(body.customer_number),
    status: clean(body.status) || "aktiv",
    active: clean(body.status).toLowerCase() !== "passiv",
    contact_person: nullableText(body.contact_person),
    email: nullableText(body.email),
    customer_email: nullableText(body.email),
    phone: nullableText(body.phone),
    customer_phone: nullableText(body.phone),
    mobile: nullableText(body.mobile),
    street: strasse,
    postal_code: plz,
    city: ort,
    country: nullableText(body.country) || "DE Deutschland",
    address_addition: nullableText(body.address_addition),
    address: anschrift,
    customer_address: anschrift,
    contract_start_date: nullableDatum(body.contract_start_date),
    contract_end_date: nullableDatum(body.contract_end_date),
    payment_terms: nullableText(body.payment_terms),
    notes: nullableText(body.notes),
    customer_notes: nullableText(body.notes)
  };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    if (!clean(body.name)) return NextResponse.json({ ok: false, error: "Bitte einen Namen eintragen." }, { status: 400 });

    const daten = kundenDaten(body);

    if (!daten.customer_number) {
      const letzte = await supabase.from("customers").select("customer_number").limit(1000);
      const hoechste = ((letzte.data || []) as AnyRow[])
        .map((zeile) => Number(String(zeile.customer_number || "").replace(/\D/g, "")))
        .filter((zahl) => Number.isFinite(zahl))
        .reduce((groesste, zahl) => Math.max(groesste, zahl), 1000);
      daten.customer_number = String(hoechste + 1);
    }

    const ergebnis = await safeInsert(supabase, "customers", daten);
    const kunde = ergebnis.data as AnyRow;

    /**
     * Objekt gleich mitanlegen.
     *
     * Bei den meisten Kunden hier ist die Rechnungsanschrift auch der Ort, an
     * dem gearbeitet wird. Dann spart das einen zweiten Weg — und ohne Objekt
     * kann ohnehin niemand stempeln.
     */
    let objekt: AnyRow | null = null;
    let objektHinweis: string | null = null;

    if (body.objekt_anlegen === true && kunde?.id) {
      const letzte = await supabase.from("work_sites").select("object_number").order("object_number", { ascending: false }).limit(1);
      const nummer = Number(letzte.data?.[0]?.object_number || 0) + 1;
      const ort = await koordinaten(daten.street || "", daten.postal_code || "", daten.city || "");
      const tags = Array.isArray(body.tags) ? body.tags.map(clean).filter(Boolean) : [];

      const objektErgebnis = await safeInsert(supabase, "work_sites", {
        name: daten.name,
        object_number: nummer,
        customer_id: kunde.id,
        customer_name: daten.name,
        customer_number: daten.customer_number,
        street: daten.street,
        postal_code: daten.postal_code,
        city: daten.city,
        country: daten.country,
        address: daten.address,
        latitude: ort?.latitude ?? null,
        longitude: ort?.longitude ?? null,
        allowed_radius_m: 150,
        tags: tags.length ? tags.join(", ") : null,
        status: "aktiv",
        active: true,
        notes: "Beim Anlegen des Kunden mit erstellt."
      });
      objekt = objektErgebnis.data;
      objektHinweis = ort
        ? null
        : "Das Objekt wurde angelegt, für die Anschrift wurde aber kein Standort gefunden. Ohne Koordinaten kann dort nicht gestempelt werden.";
    }

    return NextResponse.json({ ok: true, item: kunde, objekt, objektHinweis, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Kunde konnte nicht angelegt werden.";
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
    if (!id) return NextResponse.json({ ok: false, error: "Kunden-ID fehlt." }, { status: 400 });

    const daten = kundenDaten(body);
    const ergebnis = await safeUpdateById(supabase, "customers", id, daten);

    // Der Kundenname steht auch an den Objekten. Ohne dieses Nachziehen hiesse
    // der Kunde nach einer Umfirmierung an zwei Stellen verschieden.
    await supabase.from("work_sites").update({ customer_name: daten.name, customer_number: daten.customer_number }).eq("customer_id", id);

    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Kunde konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
