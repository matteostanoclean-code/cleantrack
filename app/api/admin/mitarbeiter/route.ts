import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeUpdateById } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Mitarbeiterakte.
 *
 * GET liefert die Liste mit allem, was in der Übersicht und in den Reitern
 * gebraucht wird: Stammdaten, Einsätze, Zeiten, Abwesenheiten, Qualitäts-
 * kontrollen. Alles in einem Zug, damit das Blatt beim Öffnen sofort steht.
 *
 * PATCH speichert die Akte. Über safeUpdateById, damit ein noch fehlendes
 * Feld nicht die ganze Änderung verwirft — was nicht gespeichert werden kann,
 * wird gemeldet statt still verschluckt.
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

    const [profileResult, tasksResult, entriesResult, absencesResult, qualityResult, sitesResult, assignResult] = await Promise.all([
      supabase.from("employee_profiles").select("*").order("employee_number", { ascending: true }),
      supabase.from("tasks").select("id, title, task_date, start_time, end_time, planned_minutes, max_minutes, site, customer_name, employee_name, status, done, task_type").limit(4000),
      supabase.from("time_entries").select("id, employee_name, action, created_at, task_id, actual_minutes, approved_minutes, approval_status, work_site_name").order("created_at", { ascending: false }).limit(3000),
      supabase.from("absence_requests").select("*").order("start_date", { ascending: false }).limit(500),
      supabase.from("quality_reports").select("id, employee_name, site, rating, created_at, status").order("created_at", { ascending: false }).limit(500),
      supabase.from("work_sites").select("id, name, customer_name").order("name", { ascending: true }).limit(500),
      supabase.from("employee_work_sites").select("employee_name, work_site_id, site_name, active").limit(2000)
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);

    return NextResponse.json({
      ok: true,
      employees: ((profileResult.data || []) as AnyRow[]).filter((row) => clean(row.name)),
      tasks: tasksResult.data || [],
      timeEntries: entriesResult.data || [],
      absences: absencesResult.data || [],
      qualityReports: qualityResult.data || [],
      sites: sitesResult.data || [],
      assignments: assignResult.error ? [] : (assignResult.data || [])
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Mitarbeiter konnten nicht geladen werden.";
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
    if (!id) return NextResponse.json({ ok: false, error: "Mitarbeiter-ID fehlt." }, { status: 400 });

    const vorname = clean(body.first_name);
    const nachname = clean(body.last_name);
    // Der Anzeigename hängt an vielen Stellen (Einsätze, Zeiten, Chat) am
    // Text. Er wird nur nachgeführt, wenn Vor- und Nachname etwas hergeben.
    const anzeigename = [vorname, nachname].filter(Boolean).join(" ");

    const strasse = nullableText(body.street);
    const plz = nullableText(body.postal_code);
    const ort = nullableText(body.city);
    const anschrift = [strasse, [plz, ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;

    const payload: AnyRow = {
      first_name: nullableText(vorname),
      last_name: nullableText(nachname),
      gender: nullableText(body.gender),
      language: nullableText(body.language),
      birthday: nullableDatum(body.birthday),
      email: nullableText(body.email),
      phone: nullableText(body.phone),

      street: strasse,
      postal_code: plz,
      city: ort,
      country: nullableText(body.country),
      address_addition: nullableText(body.address_addition),
      address: anschrift,

      employment_type: nullableText(body.employment_type),
      employee_group: nullableText(body.employee_group),
      contract_start: nullableDatum(body.contract_start),
      contract_end: nullableDatum(body.contract_end),
      wage_type: nullableText(body.wage_type),
      hourly_rate: nullableZahl(body.hourly_rate),
      weekly_hours: nullableZahl(body.weekly_hours),
      hours_monday: nullableZahl(body.hours_monday),
      hours_tuesday: nullableZahl(body.hours_tuesday),
      hours_wednesday: nullableZahl(body.hours_wednesday),
      hours_thursday: nullableZahl(body.hours_thursday),
      hours_friday: nullableZahl(body.hours_friday),
      hours_saturday: nullableZahl(body.hours_saturday),
      hours_sunday: nullableZahl(body.hours_sunday),
      travel_time_allowed: body.travel_time_allowed === true,
      annual_vacation_days: nullableZahl(body.annual_vacation_days),
      absence_pay_per_day: nullableZahl(body.absence_pay_per_day),
      monthly_hour_limit: nullableZahl(body.monthly_hour_limit),

      employee_number: nullableText(body.employee_number),
      rights_group: nullableText(body.rights_group),
      role: nullableText(body.role) || "employee",
      tags: nullableText(body.tags),
      notes: nullableText(body.notes),
      active: body.active !== false
    };

    if (anzeigename) payload.name = anzeigename;

    const ergebnis = await safeUpdateById(supabase, "employee_profiles", id, payload);

    return NextResponse.json({
      ok: true,
      item: ergebnis.data,
      // Ehrlich melden, was die Datenbank noch nicht kennt.
      uebersprungen: ergebnis.skipped,
      hinweis: ergebnis.skipped.length
        ? `${ergebnis.skipped.length} Felder konnten nicht gespeichert werden, die Spalten fehlen noch. Bitte supabase/mitarbeiter_felder.sql ausführen.`
        : null
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Mitarbeiter konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
