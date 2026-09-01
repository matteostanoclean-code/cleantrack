import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Schlüsselverwaltung.
 *
 * Ein Schlüssel gehört zu einem Objekt und liegt entweder im Büro oder bei
 * einer Person. Das Wichtige ist nicht die Liste, sondern die Kette: wer hat
 * ihn seit wann. Geht einer verloren, muss man in fünf Sekunden sagen können,
 * wer ihn zuletzt hatte — sonst wird die Schließanlage teuer.
 *
 * Übergabe und Rückgabe sind deshalb eigene Vorgänge mit Datum, nicht nur ein
 * Namensfeld, das jemand überschreibt.
 */

const ZUSTAENDE = ["im_buero", "ausgegeben", "verloren", "zurueckgegeben"];

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

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const schluessel = await supabase.from("key_items").select("*").order("key_number", { ascending: true }).limit(1000);

    if (schluessel.error) {
      if (fehlendeTabelle(schluessel.error)) {
        return NextResponse.json({ ok: true, setupFehlt: true, keys: [], sites: [], employees: [], customers: [] });
      }
      throw new Error(schluessel.error.message);
    }

    const [objekte, personen, kunden] = await Promise.all([
      supabase.from("work_sites").select("id, name, customer_name, customer_id").order("name", { ascending: true }).limit(500),
      supabase.from("employee_profiles").select("id, name, active").order("name", { ascending: true }),
      supabase.from("customers").select("id, name").order("name", { ascending: true }).limit(500)
    ]);

    return NextResponse.json({
      ok: true,
      setupFehlt: false,
      keys: schluessel.data || [],
      sites: objekte.data || [],
      employees: ((personen.data || []) as AnyRow[]).filter((row) => clean(row.name) && row.active !== false),
      customers: kunden.data || []
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Schlüssel konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

async function daten(supabase: any, body: AnyRow) {
  const objektId = uuidOrNull(body.work_site_id);
  const objekt = objektId ? (await supabase.from("work_sites").select("name, customer_name, customer_id, address").eq("id", objektId).maybeSingle()).data : null;
  const person = nullableText(body.employee_name);

  return {
    key_name: clean(body.key_name) || null,
    key_number: nullableText(body.key_number),
    key_identifier: nullableText(body.key_identifier),
    key_count: nullableZahl(body.key_count) ?? 1,
    work_site_id: objektId,
    object_name: objekt ? clean(objekt.name) : nullableText(body.object_name),
    object_address: objekt ? clean(objekt.address) || null : null,
    customer_id: objekt?.customer_id || uuidOrNull(body.customer_id),
    customer_name: objekt ? clean(objekt.customer_name) || null : nullableText(body.customer_name),
    employee_name: person,
    // Wer einen Schlüssel hat, hat ihn ausgegeben bekommen. Der Zustand
    // ergibt sich daraus, damit beides nicht auseinanderlaufen kann.
    status: clean(body.status) && ZUSTAENDE.includes(clean(body.status)) ? clean(body.status) : (person ? "ausgegeben" : "im_buero"),
    handover_date: nullableDatum(body.handover_date),
    return_date: nullableDatum(body.return_date),
    notes: nullableText(body.notes)
  };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    if (!uuidOrNull(body.work_site_id)) {
      return NextResponse.json({ ok: false, error: "Bitte ein Objekt wählen. Ein Schlüssel ohne Schloss ist kein Schlüssel." }, { status: 400 });
    }

    const nutzlast = await daten(supabase, body);

    if (!nutzlast.key_number) {
      const vorhandene = await supabase.from("key_items").select("key_number").limit(1000);
      const hoechste = ((vorhandene.data || []) as AnyRow[])
        .map((zeile) => Number(String(zeile.key_number || "").replace(/\D/g, "")))
        .filter((zahl) => Number.isFinite(zahl))
        .reduce((groesste, zahl) => Math.max(groesste, zahl), 0);
      nutzlast.key_number = String(hoechste + 1);
    }
    if (!nutzlast.key_name) nutzlast.key_name = `Schlüssel ${nutzlast.key_number}`;

    const ergebnis = await safeInsert(supabase, "key_items", { ...nutzlast, created_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Schlüssel konnte nicht angelegt werden.";
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
    if (!id) return NextResponse.json({ ok: false, error: "Schlüssel-ID fehlt." }, { status: 400 });

    const vorher = await supabase.from("key_items").select("*").eq("id", id).maybeSingle();
    if (vorher.error) throw new Error(vorher.error.message);
    const alt = vorher.data as AnyRow | null;
    if (!alt) return NextResponse.json({ ok: false, error: "Schlüssel wurde nicht gefunden." }, { status: 404 });

    const vorgang = clean(body.vorgang);
    const heute = new Date().toISOString().slice(0, 10);

    /** Übergeben: Person setzen, Datum stempeln, Rückgabe löschen. */
    if (vorgang === "uebergeben") {
      const person = nullableText(body.employee_name);
      if (!person) return NextResponse.json({ ok: false, error: "Bitte eine Person wählen." }, { status: 400 });

      const ergebnis = await safeUpdateById(supabase, "key_items", id, {
        employee_name: person,
        status: "ausgegeben",
        handover_date: nullableDatum(body.handover_date) || heute,
        return_date: null
      });

      await pushAnMitarbeiter(
        supabase,
        person,
        "Schlüssel übernommen",
        `${clean(alt.key_name) || "Schlüssel"} für ${clean(alt.object_name) || "ein Objekt"} ist auf dich eingetragen.`,
        "/mitarbeiter/notifications",
        "key_handover"
      );

      return NextResponse.json({ ok: true, item: ergebnis.data });
    }

    /** Zurückgenommen: Person bleibt in der Historie, der Schlüssel liegt wieder im Büro. */
    if (vorgang === "zurueck") {
      const ergebnis = await safeUpdateById(supabase, "key_items", id, {
        employee_name: null,
        status: "im_buero",
        return_date: nullableDatum(body.return_date) || heute
      });
      return NextResponse.json({ ok: true, item: ergebnis.data });
    }

    if (vorgang === "verloren") {
      const ergebnis = await safeUpdateById(supabase, "key_items", id, {
        status: "verloren",
        notes: [clean(alt.notes), `Verlust gemeldet am ${heute}${clean(body.notiz) ? `: ${clean(body.notiz)}` : ""}`].filter(Boolean).join("\n")
      });
      return NextResponse.json({ ok: true, item: ergebnis.data });
    }

    const nutzlast = await daten(supabase, body);
    const ergebnis = await safeUpdateById(supabase, "key_items", id, nutzlast);
    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Schlüssel konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
