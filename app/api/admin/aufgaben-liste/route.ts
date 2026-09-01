import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Aufgaben: Reklamationen, Personalsachen, Kundenanfragen.
 *
 * Getrennt von /api/admin/aufgaben, das zählt nur die offenen Punkte fürs
 * Dashboard. Hier liegt der Vorgang selbst.
 *
 * Das Kürzel (REKL-2) wird beim Anlegen vergeben, fortlaufend je Art. Bei
 * diesen Mengen reicht "höchste vorhandene Nummer plus eins"; ein eigener
 * Zähler in der Datenbank wäre für ein paar Vorgänge am Tag zu viel Aufwand.
 */

const ARTEN: Record<string, string> = {
  REKL: "Reklamation",
  PERS: "Personal",
  KUND: "Kundenanfrage",
  SONS: "Sonstiges"
};

const PRIORITAETEN = ["gering", "mittel", "hoch", "dringend"];
const ZUSTAENDE = ["neu", "offen", "in_arbeit", "in_pruefung", "abgeschlossen"];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
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

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const aufgaben = await supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(1000);

    if (aufgaben.error) {
      if (fehlendeTabelle(aufgaben.error)) {
        return NextResponse.json({
          ok: true,
          setupFehlt: true,
          tickets: [],
          employees: [],
          sites: [],
          customers: [],
          arten: ARTEN
        });
      }
      throw new Error(aufgaben.error.message);
    }

    const [employees, sites, customers] = await Promise.all([
      supabase.from("employee_profiles").select("id, name, active").order("name", { ascending: true }),
      supabase.from("work_sites").select("id, name, customer_name").order("name", { ascending: true }).limit(500),
      supabase.from("customers").select("id, name").order("name", { ascending: true }).limit(500)
    ]);

    return NextResponse.json({
      ok: true,
      setupFehlt: false,
      tickets: aufgaben.data || [],
      employees: ((employees.data || []) as AnyRow[]).filter((row) => clean(row.name) && row.active !== false),
      sites: sites.data || [],
      customers: customers.data || [],
      arten: ARTEN,
      eigenerName: guard.auth.profile.name
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Aufgaben konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const titel = clean(body.title);
    if (!titel) return NextResponse.json({ ok: false, error: "Bitte einen Titel eintragen." }, { status: 400 });

    const art = ARTEN[clean(body.ticket_type).toUpperCase()] ? clean(body.ticket_type).toUpperCase() : "SONS";

    // Nächste Nummer je Art.
    const letzte = await supabase
      .from("tickets")
      .select("ticket_number")
      .eq("ticket_type", art)
      .order("ticket_number", { ascending: false })
      .limit(1);
    if (letzte.error && fehlendeTabelle(letzte.error)) {
      return NextResponse.json({ ok: false, error: "Die Aufgabentabelle fehlt noch. Bitte supabase/aufgaben_tabelle.sql ausführen." }, { status: 409 });
    }
    const nummer = Number(letzte.data?.[0]?.ticket_number || 0) + 1;

    const zustand = body.direkt_offen === false ? "neu" : "offen";
    const jetzt = new Date().toISOString();
    const zugewiesen = nullableText(body.assigned_to);

    const payload: AnyRow = {
      ticket_type: art,
      ticket_number: nummer,
      identifier: `${art}-${nummer}`,
      title: titel,
      description: nullableText(body.description),
      priority: PRIORITAETEN.includes(clean(body.priority).toLowerCase()) ? clean(body.priority).toLowerCase() : "mittel",
      status: zustand,
      assigned_to: zugewiesen,
      due_date: nullableDatum(body.due_date),
      created_by: guard.auth.profile.name,
      contact_person: nullableText(body.contact_person),
      contact_phone: nullableText(body.contact_phone),
      contact_email: nullableText(body.contact_email),
      link_employee_name: nullableText(body.link_employee_name),
      link_work_site_id: uuidOrNull(body.link_work_site_id),
      link_work_site_name: nullableText(body.link_work_site_name),
      link_customer_id: uuidOrNull(body.link_customer_id),
      link_customer_name: nullableText(body.link_customer_name),
      // Wird die Aufgabe gleich auf offen gestellt, ist das die erste Bearbeitung.
      first_response_at: zustand === "offen" ? jetzt : null,
      archived: false,
      created_at: jetzt,
      updated_at: jetzt
    };

    const ergebnis = await safeInsert(supabase, "tickets", payload);

    if (zugewiesen && zugewiesen !== guard.auth.profile.name) {
      await pushAnMitarbeiter(
        supabase,
        zugewiesen,
        `Neue Aufgabe: ${ARTEN[art]}`,
        `${payload.identifier} · ${titel}`,
        "/mitarbeiter/notifications",
        "ticket_assigned"
      );
      await supabase.from("admin_notifications").insert({
        title: "Neue Aufgabe",
        message: `${guard.auth.profile.name} hat dir ${payload.identifier} zugewiesen: ${titel}`,
        employee_name: zugewiesen,
        notification_type: "ticket_assigned",
        status: "open",
        read: false,
        created_at: jetzt
      });
    }

    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Aufgabe konnte nicht angelegt werden.";
    if (fehlendeTabelle(fehler)) {
      return NextResponse.json({ ok: false, error: "Die Aufgabentabelle fehlt noch. Bitte supabase/aufgaben_tabelle.sql ausführen." }, { status: 409 });
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
    if (!id) return NextResponse.json({ ok: false, error: "Aufgaben-ID fehlt." }, { status: 400 });

    const vorher = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
    if (vorher.error) throw new Error(vorher.error.message);
    const alt = vorher.data as AnyRow | null;
    if (!alt) return NextResponse.json({ ok: false, error: "Aufgabe wurde nicht gefunden." }, { status: 404 });

    const jetzt = new Date().toISOString();
    const payload: AnyRow = { updated_at: jetzt };

    if ("title" in body) payload.title = clean(body.title) || alt.title;
    if ("description" in body) payload.description = nullableText(body.description);
    if ("priority" in body && PRIORITAETEN.includes(clean(body.priority).toLowerCase())) payload.priority = clean(body.priority).toLowerCase();
    if ("assigned_to" in body) payload.assigned_to = nullableText(body.assigned_to);
    if ("due_date" in body) payload.due_date = nullableDatum(body.due_date);
    if ("contact_person" in body) payload.contact_person = nullableText(body.contact_person);
    if ("contact_phone" in body) payload.contact_phone = nullableText(body.contact_phone);
    if ("contact_email" in body) payload.contact_email = nullableText(body.contact_email);
    if ("link_employee_name" in body) payload.link_employee_name = nullableText(body.link_employee_name);
    if ("link_work_site_id" in body) payload.link_work_site_id = uuidOrNull(body.link_work_site_id);
    if ("link_work_site_name" in body) payload.link_work_site_name = nullableText(body.link_work_site_name);
    if ("link_customer_id" in body) payload.link_customer_id = uuidOrNull(body.link_customer_id);
    if ("link_customer_name" in body) payload.link_customer_name = nullableText(body.link_customer_name);
    if ("archived" in body) payload.archived = body.archived === true;

    if ("status" in body) {
      const neu = clean(body.status).toLowerCase();
      if (ZUSTAENDE.includes(neu)) {
        payload.status = neu;
        // Reaktionszeit einmalig festhalten: der erste Schritt weg von "neu".
        if (neu !== "neu" && !alt.first_response_at) payload.first_response_at = jetzt;
        if (neu === "abgeschlossen" && !alt.completed_at) payload.completed_at = jetzt;
        if (neu !== "abgeschlossen") payload.completed_at = null;
      }
    }

    const ergebnis = await safeUpdateById(supabase, "tickets", id, payload);

    // Wechselt der Zuständige, erfährt er es.
    const neuZugewiesen = clean(payload.assigned_to);
    if (neuZugewiesen && neuZugewiesen !== clean(alt.assigned_to) && neuZugewiesen !== guard.auth.profile.name) {
      await pushAnMitarbeiter(
        supabase,
        neuZugewiesen,
        "Aufgabe zugewiesen",
        `${clean(alt.identifier)} · ${clean(payload.title || alt.title)}`,
        "/mitarbeiter/notifications",
        "ticket_assigned"
      );
    }

    return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Aufgabe konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
