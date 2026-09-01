import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Geräte und Inventar.
 *
 * Zwei Fragen an dieselben Daten: Was steht wo (Alltag) und was ist es noch
 * wert (Bilanz). Deshalb hängt am Gerät beides — Objekt und Wartung auf der
 * einen Seite, Anschaffung und Abschreibung auf der anderen.
 *
 * Der Restbuchwert wird linear gerechnet und immer frisch, nie gespeichert.
 * Ein gespeicherter Buchwert ist ab dem Tag danach falsch.
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

function nullableDatum(value: unknown) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

/**
 * Restbuchwert linear.
 *
 * Anschaffungspreis geteilt durch die Nutzungsdauer, mal die vollen Monate
 * seit der Anschaffung. Unter null geht es nicht, und nach einem Abgang ist
 * der Wert null.
 *
 * Bewusst monatsgenau statt taggenau: Für die Inventarliste reicht das, und
 * die Zahl bleibt nachrechenbar.
 */
function buchwert(geraet: AnyRow) {
  const preis = Number(geraet.purchase_price || 0);
  const jahre = Number(geraet.useful_life_years || 0);
  const gekauft = clean(geraet.purchase_date).slice(0, 10);

  if (!preis) return { restwert: null as number | null, abschreibungBisher: null as number | null, monatlich: null as number | null };
  if (clean(geraet.disposed_at)) return { restwert: 0, abschreibungBisher: preis, monatlich: null };
  if (!jahre || !gekauft) return { restwert: preis, abschreibungBisher: 0, monatlich: null };

  const monate = jahre * 12;
  const monatlich = preis / monate;
  const start = new Date(`${gekauft}T12:00:00`);
  const jetzt = new Date();
  const vergangen = Math.max(0, (jetzt.getFullYear() - start.getFullYear()) * 12 + (jetzt.getMonth() - start.getMonth()));
  const abgeschrieben = Math.min(preis, monatlich * vergangen);

  return {
    restwert: Math.max(0, Math.round((preis - abgeschrieben) * 100) / 100),
    abschreibungBisher: Math.round(abgeschrieben * 100) / 100,
    monatlich: Math.round(monatlich * 100) / 100
  };
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const geraete = await supabase.from("devices").select("*").order("name", { ascending: true }).limit(1000);

    if (geraete.error) {
      if (fehlendeTabelle(geraete.error)) {
        return NextResponse.json({ ok: true, setupFehlt: true, devices: [], sites: [], employees: [] });
      }
      throw new Error(geraete.error.message);
    }

    const [objekte, personen] = await Promise.all([
      supabase.from("work_sites").select("id, name, customer_name, object_number").order("name", { ascending: true }).limit(500),
      supabase.from("employee_profiles").select("id, name, active").order("name", { ascending: true })
    ]);

    const mitWert: AnyRow[] = ((geraete.data || []) as AnyRow[]).map((geraet) => ({ ...geraet, ...buchwert(geraet) }));

    const imBestand = mitWert.filter((geraet) => !clean(geraet.disposed_at));
    const summe = {
      anzahl: imBestand.length,
      anschaffung: imBestand.reduce((s, g) => s + Number(g.purchase_price || 0), 0),
      restwert: imBestand.reduce((s, g) => s + Number(g.restwert || 0), 0),
      abgegangen: mitWert.length - imBestand.length
    };

    return NextResponse.json({
      ok: true,
      setupFehlt: false,
      devices: mitWert,
      sites: objekte.data || [],
      employees: ((personen.data || []) as AnyRow[]).filter((row) => clean(row.name) && row.active !== false),
      summe
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Geräte konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

async function daten(supabase: any, body: AnyRow) {
  const objektId = uuidOrNull(body.work_site_id);
  const objekt = objektId ? (await supabase.from("work_sites").select("name").eq("id", objektId).maybeSingle()).data : null;

  return {
    name: clean(body.name),
    device_type: nullableText(body.device_type),
    manufacturer: nullableText(body.manufacturer),
    model: nullableText(body.model),
    serial_number: nullableText(body.serial_number),
    inventory_number: nullableText(body.inventory_number),
    nfc_tag_id: nullableText(body.nfc_tag_id),
    work_site_id: objektId,
    work_site_name: objekt ? clean(objekt.name) : nullableText(body.work_site_name),
    assigned_to: nullableText(body.assigned_to),
    status: clean(body.status) || "aktiv",

    // Anschaffung und Abschreibung
    purchase_date: nullableDatum(body.purchase_date),
    purchase_price: nullableZahl(body.purchase_price),
    supplier: nullableText(body.supplier),
    invoice_number: nullableText(body.invoice_number),
    useful_life_years: nullableZahl(body.useful_life_years),
    disposed_at: nullableDatum(body.disposed_at),
    disposal_note: nullableText(body.disposal_note),

    // Wartung
    last_service_date: nullableDatum(body.last_service_date),
    next_service_date: nullableDatum(body.next_service_date),
    service_interval_months: nullableZahl(body.service_interval_months),

    description: nullableText(body.description),
    notes: nullableText(body.notes)
  };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    if (!clean(body.name)) return NextResponse.json({ ok: false, error: "Bitte einen Namen eintragen." }, { status: 400 });
    if (!uuidOrNull(body.work_site_id)) return NextResponse.json({ ok: false, error: "Bitte ein Objekt wählen. Jedes Gerät steht irgendwo." }, { status: 400 });

    const nutzlast = await daten(supabase, body);

    // Inventarnummer vergeben, wenn keine da ist. Fortlaufend, damit sie zur
    // Liste des Steuerberaters passt.
    if (!nutzlast.inventory_number) {
      const vorhandene = await supabase.from("devices").select("inventory_number").limit(1000);
      const hoechste = ((vorhandene.data || []) as AnyRow[])
        .map((zeile) => Number(String(zeile.inventory_number || "").replace(/\D/g, "")))
        .filter((zahl) => Number.isFinite(zahl))
        .reduce((groesste, zahl) => Math.max(groesste, zahl), 0);
      nutzlast.inventory_number = String(hoechste + 1);
    }

    const ergebnis = await safeInsert(supabase, "devices", { ...nutzlast, created_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Gerät konnte nicht angelegt werden.";
    if (fehlendeTabelle(fehler)) {
      return NextResponse.json({ ok: false, error: "Die Gerätetabelle fehlt noch. Bitte supabase/geraete_tabelle.sql ausführen." }, { status: 409 });
    }
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
    if (!id) return NextResponse.json({ ok: false, error: "Geräte-ID fehlt." }, { status: 400 });

    const nutzlast = await daten(supabase, body);
    const ergebnis = await safeUpdateById(supabase, "devices", id, { ...nutzlast, updated_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Gerät konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
