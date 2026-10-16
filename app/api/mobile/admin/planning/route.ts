import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen die Planungszentrale nutzen." }, { status: 403 }) };
  return { ok: true, auth };
}

function seriesQuery(supabase: any, groupId: string, scope: string, fromDate: string) {
  let query = supabase.from("tasks").select("id, title, site, employee_name, task_date, status, done").eq("recurrence_group_id", groupId);
  if (scope !== "all") query = query.gte("task_date", fromDate || todayIso());
  return query;
}

/**
 * Meldung in der App ablegen und zusätzlich aufs Handy schicken.
 *
 * Vorher stand die Zuweisung nur in der App und wurde erst beim nächsten
 * Öffnen gesehen. Wer nicht reinschaut, erfährt von einem neuen Einsatz nichts.
 */
async function insertAdminNote(supabase: any, payload: AnyRow) {
  if (payload.employee_name) {
    await pushAnMitarbeiter(
      supabase,
      payload.employee_name,
      payload.title,
      payload.message,
      payload.push_url || "/mitarbeiter/schedule",
      payload.notification_type || "planning_update"
    );
  }
  await supabase.from("admin_notifications").insert({
    title: payload.title,
    message: payload.message,
    employee_name: payload.employee_name || null,
    work_site_name: payload.work_site_name || null,
    object_name: payload.work_site_name || null,
    site: payload.work_site_name || null,
    notification_type: payload.notification_type || "planning_update",
    status: "open",
    read: false,
    created_at: new Date().toISOString()
  });
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if ("response" in guard) return guard.response;

    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const type = clean(body.type);
    const id = clean(body.id);
    const groupId = clean(body.recurrence_group_id);
    const scope = clean(body.scope || "future");
    const fromDate = clean(body.from_date || todayIso());

    if (type === "task_assign") {
      if (!id) return NextResponse.json({ ok: false, error: "Einsatz-ID fehlt." }, { status: 400 });
      const employeeName = nullableText(body.employee_name);
      const { data, error } = await supabase
        .from("tasks")
        .update({ employee_name: employeeName, notify_employee: Boolean(employeeName) })
        .eq("id", id)
        .select("id, title, site, employee_name, task_date")
        .single();
      if (error) throw new Error(error.message);
      if (employeeName) {
        await insertAdminNote(supabase, {
          title: "Einsatz zugewiesen",
          message: `${profile.name} hat dir einen Einsatz zugewiesen: ${data.title || "Einsatz"}${data.site ? ` bei ${data.site}` : ""}.`,
          employee_name: employeeName,
          work_site_name: data.site,
          notification_type: "task_assigned"
        });
      }
      return NextResponse.json({ ok: true, item: data, count: 1 });
    }

    if (type === "series_assign") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const employeeName = nullableText(body.employee_name);
      let updateQuery = supabase
        .from("tasks")
        .update({ employee_name: employeeName, notify_employee: Boolean(employeeName) })
        .eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date");
      if (error) throw new Error(error.message);
      const count = Array.isArray(data) ? data.length : 0;
      if (employeeName && count) {
        await insertAdminNote(supabase, {
          title: "Einsatz-Serie zugewiesen",
          message: `${count} Einsätze wurden dir zugewiesen.`,
          employee_name: employeeName,
          work_site_name: data?.[0]?.site,
          notification_type: "task_series_assigned"
        });
      }
      return NextResponse.json({ ok: true, items: data || [], count });
    }

    if (type === "series_update") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const patch: AnyRow = {};
      if (body.title !== undefined) patch.title = nullableText(body.title);
      if (body.site !== undefined) patch.site = nullableText(body.site);
      if (body.start_time !== undefined) patch.start_time = nullableText(body.start_time);
      if (body.end_time !== undefined) patch.end_time = nullableText(body.end_time);
      if (body.planned_minutes !== undefined) {
        const minutes = nullableNumber(body.planned_minutes);
        patch.planned_minutes = minutes;
        patch.max_minutes = minutes;
        patch.paid_minutes = minutes;
        patch.wage_minutes = minutes;
      }
      if (body.employee_name !== undefined) {
        const employeeName = nullableText(body.employee_name);
        patch.employee_name = employeeName;
        patch.notify_employee = Boolean(employeeName);
      }
      if (body.status !== undefined) {
        patch.status = clean(body.status) || "open";
        patch.done = ["done", "cancelled", "storniert"].includes(clean(body.status).toLowerCase());
      }
      if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "Keine Änderung angegeben." }, { status: 400 });

      let updateQuery = supabase.from("tasks").update(patch).eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date, status");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, items: data || [], count: Array.isArray(data) ? data.length : 0 });
    }

    if (type === "series_status") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const status = clean(body.status) || "open";
      const done = booleanValue(body.done, ["done", "cancelled", "storniert", "paused"].includes(status.toLowerCase()));
      let updateQuery = supabase.from("tasks").update({ status, done }).eq("recurrence_group_id", groupId);
      if (scope !== "all") updateQuery = updateQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await updateQuery.select("id, title, site, employee_name, task_date, status");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, items: data || [], count: Array.isArray(data) ? data.length : 0 });
    }

    /**
     * Die Wochentage einer Serie ändern.
     *
     * Ein Wochentag ist keine Eigenschaft der Serie, sondern ergibt sich
     * daraus, an welchen Tagen Einsätze liegen. Deshalb wird hier beides
     * gemacht: Tage, die wegfallen, werden gelöscht, Tage, die dazukommen,
     * werden angelegt.
     *
     * Angefasst wird nur, was noch offen ist und vor uns liegt. Erledigte
     * Einsätze sind Arbeitszeitaufzeichnungen (§ 17 Abs. 1 MiLoG) und
     * bleiben stehen, auch wenn ihr Wochentag nicht mehr vorgesehen ist.
     */
    if (type === "series_weekdays") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });
      const tage = Array.isArray(body.weekdays)
        ? Array.from(new Set(body.weekdays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)))
        : [];
      if (!tage.length) {
        return NextResponse.json({ ok: false, error: "Bitte mindestens einen Wochentag wählen." }, { status: 400 });
      }

      const start = fromDate || todayIso();
      const { data: alle, error: leseFehler } = await supabase
        .from("tasks")
        .select("*")
        .eq("recurrence_group_id", groupId)
        .order("task_date", { ascending: true });
      if (leseFehler) throw new Error(leseFehler.message);
      if (!alle?.length) return NextResponse.json({ ok: false, error: "Serie nicht gefunden." }, { status: 404 });

      const wochentag = (datum: string) => new Date(`${datum}T12:00:00Z`).getUTCDay();
      const kuenftig = alle.filter((t: AnyRow) => String(t.task_date) >= start);

      // Weg: offene Einsätze an Tagen, die nicht mehr vorgesehen sind.
      const zuLoeschen = kuenftig
        .filter((t: AnyRow) => !t.done && !tage.includes(wochentag(String(t.task_date))))
        .map((t: AnyRow) => t.id);
      if (zuLoeschen.length) {
        const { error } = await supabase.from("tasks").delete().in("id", zuLoeschen);
        if (error) throw new Error(error.message);
      }

      // Dazu: fehlende Tage im Zeitraum der Serie anlegen. Vorlage ist ein
      // vorhandener Einsatz, damit Titel, Objekt und Zeiten stimmen.
      const vorlage: AnyRow = kuenftig[0] || alle[alle.length - 1];
      const vorhanden = new Set(
        kuenftig.map((t: AnyRow) => String(t.task_date))
      );
      const letzter = String(
        vorlage.recurrence_end_date || alle[alle.length - 1].task_date
      ).slice(0, 10);

      // Bewusst nur diese Felder und nicht die ganze Zeile: eine Vorlage kann
      // Stempelzeiten, Fotos und gesetzte Haken mitbringen, die zu einem neuen
      // Einsatz nicht gehören.
      const UEBERNEHMEN = [
        "title", "site", "employee_name", "start_time", "end_time", "window_binding",
        "max_minutes", "planned_minutes", "paid_minutes", "wage_minutes",
        "work_site_id", "customer_id", "customer_name", "priority",
        "task_type", "item_type", "notes", "repeat_mode", "recurrence_unit",
        "recurrence_interval", "recurrence_end_date"
      ];

      const neue: AnyRow[] = [];
      const cursor = new Date(`${start}T12:00:00Z`);
      const ende = new Date(`${letzter}T12:00:00Z`);
      while (cursor <= ende && neue.length < 400) {
        const datum = cursor.toISOString().slice(0, 10);
        if (tage.includes(cursor.getUTCDay()) && !vorhanden.has(datum)) {
          const zeile: AnyRow = {};
          for (const spalte of UEBERNEHMEN) {
            if (vorlage[spalte] !== undefined) zeile[spalte] = vorlage[spalte];
          }
          zeile.recurrence_group_id = groupId;
          zeile.recurrence_days = tage;
          zeile.task_date = datum;
          zeile.due_date = datum;
          zeile.done = false;
          zeile.status = "open";
          neue.push(zeile);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      if (neue.length) {
        const { error } = await supabase.from("tasks").insert(neue);
        if (error) throw new Error(error.message);
      }

      // Die verbliebenen Einsätze führen die neue Tagesliste mit.
      const { error: merkFehler } = await supabase
        .from("tasks")
        .update({ recurrence_days: tage })
        .eq("recurrence_group_id", groupId)
        .gte("task_date", start);
      if (merkFehler) throw new Error(merkFehler.message);

      const geschuetzt = kuenftig.filter(
        (t: AnyRow) => t.done && !tage.includes(wochentag(String(t.task_date)))
      ).length;

      return NextResponse.json({
        ok: true,
        removed: zuLoeschen.length,
        added: neue.length,
        protected_count: geschuetzt
      });
    }

    /**
     * Eine falsch angelegte Serie wieder loswerden.
     *
     * Geloescht wird nur, was noch vor uns liegt und noch nicht erledigt
     * ist. Erledigte Einsaetze sind Arbeitszeitaufzeichnungen: nach
     * § 17 Abs. 1 MiLoG sind sie mindestens zwei Jahre aufzubewahren.
     * Sie bleiben deshalb stehen, auch wenn der Rest der Serie faellt,
     * und werden in der Antwort gezaehlt.
     */
    if (type === "series_delete") {
      if (!groupId) return NextResponse.json({ ok: false, error: "Serien-ID fehlt." }, { status: 400 });

      let schutzQuery = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("recurrence_group_id", groupId)
        .eq("done", true);
      if (scope !== "all") schutzQuery = schutzQuery.gte("task_date", fromDate || todayIso());
      const { count: geschuetzt } = await schutzQuery;

      let deleteQuery = supabase
        .from("tasks")
        .delete()
        .eq("recurrence_group_id", groupId)
        .eq("done", false);
      if (scope !== "all") deleteQuery = deleteQuery.gte("task_date", fromDate || todayIso());
      const { data, error } = await deleteQuery.select("id, title, site, task_date");
      if (error) throw new Error(error.message);

      const count = Array.isArray(data) ? data.length : 0;
      return NextResponse.json({
        ok: true,
        items: data || [],
        count,
        protected_count: geschuetzt || 0
      });
    }

    return NextResponse.json({ ok: false, error: "Unbekannte Planungs-Aktion." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Planung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
