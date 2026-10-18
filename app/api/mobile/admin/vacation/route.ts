import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeUpdateById } from "@/lib/safeWrite";
import { urlaubsGutschrift } from "@/lib/urlaub";
import { pushAnBuero, pushAnMitarbeiter, pushKlartext } from "@/lib/push";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function todayIso() {
  return new Date().toISOString();
}

function isActiveTask(task: AnyRow) {
  const status = clean(task.status || "open").toLowerCase();
  if (task.done) return false;
  return !["done", "erledigt", "cancelled", "canceled", "storniert", "paused", "pause"].includes(status);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen die Urlaubsplanung nutzen." }, { status: 403 }) };
  return { ok: true as const, auth };
}

async function readAbsence(supabase: any, id: string) {
  const { data, error } = await supabase.from("absence_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Abwesenheitsantrag wurde nicht gefunden.");
  return data as AnyRow;
}

async function notifyEmployee(supabase: any, absence: AnyRow, title: string, message: string) {
  if (!clean(absence.employee_name)) return;
  await supabase.from("admin_notifications").insert({
    title,
    message,
    employee_name: absence.employee_name,
    notification_type: "absence_decision",
    absence_request_id: absence.id,
    status: "open",
    read: false,
    created_at: todayIso()
  });
}

async function loadConflicts(supabase: any, absence: AnyRow) {
  const employeeName = clean(absence.employee_name);
  const startDate = clean(absence.start_date);
  const endDate = clean(absence.end_date || absence.start_date);
  if (!employeeName || !startDate) return [] as AnyRow[];

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, site, employee_name, task_date, start_time, end_time, status, done, recurrence_group_id, notes, planned_minutes")
    .eq("employee_name", employeeName)
    .gte("task_date", startDate)
    .lte("task_date", endDate)
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw new Error(error.message);
  return (data || []).filter(isActiveTask);
}

/**
 * Die Einsätze eines Abwesenden übernehmen.
 *
 * Vorher wurden sie nur freigegeben: Mitarbeiter raus, Einsatz steht ohne
 * Namen da. Das ist ehrlich, aber niemand wird darauf gestoßen — der Einsatz
 * liegt in einer Liste, die man ansehen muss. Jetzt landet er bei dem, der den
 * Urlaub genehmigt, und der bekommt eine Nachricht aufs Handy. Wer ihn nicht
 * selbst macht, verteilt ihn weiter; dafür ist der Planer da.
 *
 * Die vorhandene Notiz bleibt stehen, der Hinweis kommt dahinter. Deshalb wird
 * Zeile für Zeile geschrieben statt alle auf einmal.
 */
async function einsaetzeUebernehmen(supabase: any, conflicts: AnyRow[], uebernehmer: string, hinweis: string) {
  const ziel = clean(uebernehmer);
  let zahl = 0;
  for (const task of conflicts) {
    const id = clean(task.id);
    if (!id) continue;
    const alteNotiz = clean(task.notes);
    const { error } = await supabase
      .from("tasks")
      .update({
        // Ohne Übernehmer bleibt es beim bisherigen Verhalten: Einsatz
        // freigeben, damit er in "Einsätze ohne Mitarbeiter" auftaucht.
        employee_name: ziel || null,
        notify_employee: false,
        notes: [alteNotiz, hinweis].filter(Boolean).join(" · ")
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    zahl += 1;
  }
  return zahl;
}

/**
 * Dem Übernehmer sagen, was jetzt auf ihm steht.
 *
 * Erzwungener Push: Die Nachricht geht immer raus, und wenn sie es nicht tut,
 * sagt der Bericht warum. Eine Übergabe, von der man erst beim nächsten
 * Öffnen der App erfährt, ist keine Übergabe.
 */
async function uebergabeMelden(supabase: any, uebernehmer: string, absence: AnyRow, conflicts: AnyRow[]) {
  const ziel = clean(uebernehmer);
  if (!ziel || !conflicts.length) return null;

  const zeitraum = `${absence.start_date} bis ${absence.end_date || absence.start_date}`;
  const liste = conflicts
    .slice(0, 6)
    .map((task) => `${clean(task.task_date).slice(0, 10)} ${clean(task.site) || clean(task.title) || "Einsatz"}`)
    .join(", ");
  const text = `${conflicts.length === 1 ? "Ein Einsatz" : `${conflicts.length} Einsätze`} von ${clean(absence.employee_name)} (${zeitraum}) stehen jetzt auf dir: ${liste}${conflicts.length > 6 ? " …" : ""}`;

  await supabase.from("admin_notifications").insert({
    title: "Einsätze übernommen",
    message: text,
    employee_name: ziel,
    notification_type: "einsatz_uebernommen",
    status: "open",
    read: false,
    created_at: todayIso()
  });

  let bericht = await pushAnMitarbeiter(
    supabase,
    ziel,
    "Einsätze übernommen",
    text,
    "/mitarbeiter/admin/einsatzplaner",
    "einsatz_uebernommen"
  );

  /**
   * Hat der Name kein Gerät, geht die Nachricht ans Büro.
   *
   * Grund: Login- und Anzeigename können auseinanderlaufen — ein Gerät lag
   * jahrelang unter "Matteo" statt "Matteo Stano" und hat deshalb nie etwas
   * bekommen. Eine Übergabe darf nicht an einer Schreibweise scheitern.
   */
  if (bericht.grund === "kein_geraet" || bericht.grund === "kein_empfaenger") {
    const ersatz = await pushAnBuero(supabase, "Einsätze übernommen", text, "/mitarbeiter/admin/einsatzplaner", "einsatz_uebernommen");
    if (ersatz.zugestellt > 0) bericht = ersatz;
  }

  return { anzahl: conflicts.length, push: bericht, hinweis: pushKlartext(bericht, ziel) };
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { supabase } = guard.auth;
    const body = await request.json();
    const employeeName = clean(body.employee_name);
    const requestType = clean(body.request_type || body.absence_type || "urlaub");
    const startDate = clean(body.start_date);
    const endDate = clean(body.end_date || body.start_date);

    if (!employeeName) return NextResponse.json({ ok: false, error: "Bitte Mitarbeiter auswählen." }, { status: 400 });
    if (!startDate || !endDate) return NextResponse.json({ ok: false, error: "Bitte Zeitraum eintragen." }, { status: 400 });

    const { data: employee } = await supabase
      .from("employee_profiles")
      .select("id, name")
      .eq("name", employeeName)
      .maybeSingle();

    const payload = {
      employee_name: employeeName,
      employee_profile_id: employee?.id || null,
      request_type: requestType,
      absence_type: requestType,
      start_date: startDate,
      end_date: endDate,
      reason: nullableText(body.reason),
      status: clean(body.status || "approved"),
      admin_response: nullableText(body.admin_response || "Vom Admin eingetragen."),
      decided_at: todayIso(),
      created_at: todayIso()
    };

    const { data, error } = await supabase.from("absence_requests").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    // Trägt das Büro die Abwesenheit direkt genehmigt ein, wird gleich hier
    // gerechnet. Sonst stünde der Urlaub ohne Stunden da.
    let gutschrift = { tage: 0, minuten: 0, detail: [] as any[] };
    if (clean(payload.status).toLowerCase() === "approved") {
      gutschrift = await urlaubsGutschrift(supabase, employeeName, startDate, endDate);
      try {
        await safeUpdateById(supabase, "absence_requests", data.id, {
          credited_minutes: gutschrift.minuten,
          credited_days: gutschrift.tage,
          credit_detail: gutschrift.detail
        });
      } catch {
        /* Eintrag steht, nur die Stunden fehlen. Siehe supabase/urlaub_gutschrift.sql */
      }
    }

    /**
     * Gleich genehmigt eingetragen heißt: die Einsätze in dem Zeitraum macht
     * niemand mehr. Sie gehen auf den, der den Urlaub einträgt — sonst stünden
     * sie weiter auf dem Abwesenden und die Planung sähe besetzt aus.
     */
    let uebergabe = null;
    if (clean(payload.status).toLowerCase() === "approved") {
      const conflicts = await loadConflicts(supabase, data);
      if (conflicts.length) {
        await einsaetzeUebernehmen(
          supabase,
          conflicts,
          guard.auth.profile.name,
          `Übernommen von ${guard.auth.profile.name}, weil ${employeeName} vom ${startDate} bis ${endDate} abwesend ist.`
        );
        uebergabe = await uebergabeMelden(supabase, guard.auth.profile.name, data, conflicts);
      }
    }

    await notifyEmployee(
      supabase,
      data,
      "Abwesenheit eingetragen",
      `Für dich wurde eine Abwesenheit vom ${startDate} bis ${endDate} eingetragen.`
    );

    return NextResponse.json({ ok: true, item: data, gutschrift, uebergabe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abwesenheit konnte nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const id = clean(body.id);
    const action = clean(body.action);
    const adminResponse = nullableText(body.admin_response);

    if (!id) return NextResponse.json({ ok: false, error: "Antrag-ID fehlt." }, { status: 400 });
    const absence = await readAbsence(supabase, id);

    if (action === "reject") {
      const { data, error } = await supabase
        .from("absence_requests")
        .update({ status: "rejected", admin_response: adminResponse || "Abgelehnt.", decided_at: todayIso() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      await notifyEmployee(supabase, data, "Abwesenheit abgelehnt", data.admin_response || "Deine Abwesenheit wurde abgelehnt.");
      return NextResponse.json({ ok: true, item: data, conflictsReleased: 0 });
    }

    if (action === "approve" || action === "approve_and_unassign") {
      const conflicts = await loadConflicts(supabase, absence);

      // Zuerst rechnen, dann freigeben. Wird der Mitarbeiter vorher aus den
      // Einsätzen genommen, ist die Planzeit weg und der Tag wäre null wert.
      const gutschrift = await urlaubsGutschrift(
        supabase,
        clean(absence.employee_name),
        clean(absence.start_date),
        clean(absence.end_date || absence.start_date)
      );

      /**
       * Einsätze immer freigeben, nicht nur auf Wunsch.
       *
       * Wer im Urlaub ist, macht den Termin nicht. Bliebe er auf ihm stehen,
       * sähe die Planung besetzt aus und niemand würde nachfragen — bis der
       * Kunde anruft. Freigegeben taucht er in "Einsätze ohne Mitarbeiter"
       * auf und wird neu verteilt.
       */
      const released = await einsaetzeUebernehmen(
        supabase,
        conflicts,
        profile.name,
        `Übernommen von ${profile.name}, weil ${absence.employee_name} vom ${absence.start_date} bis ${absence.end_date || absence.start_date} abwesend ist.`
      );
      const uebergabe = await uebergabeMelden(supabase, profile.name, absence, conflicts);

      const { data, error } = await supabase
        .from("absence_requests")
        .update({ status: "approved", admin_response: adminResponse || "Genehmigt.", decided_at: todayIso() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      // Getrennt geschrieben und über safeUpdateById, damit ein fehlendes Feld
      // die Genehmigung nicht scheitern lässt.
      let gespeicherteZeile: AnyRow | null = null;
      let uebersprungen: string[] = ["credited_minutes", "credited_days", "credit_detail"];
      try {
        const ergebnis = await safeUpdateById(supabase, "absence_requests", id, {
          credited_minutes: gutschrift.minuten,
          credited_days: gutschrift.tage,
          credit_detail: gutschrift.detail
        });
        gespeicherteZeile = ergebnis.data;
        uebersprungen = ergebnis.skipped;
      } catch {
        /* Die Genehmigung steht, nur die Stunden fehlen. Hinweis unten. */
      }
      const gutschriftGespeichert = uebersprungen.length === 0;

      await notifyEmployee(
        supabase,
        data,
        "Abwesenheit genehmigt",
        [
          `${profile.name} hat deine Abwesenheit vom ${data.start_date} bis ${data.end_date || data.start_date} genehmigt.`,
          gutschrift.minuten > 0
            ? `Dir werden ${gutschrift.tage} Tage mit zusammen ${Math.floor(gutschrift.minuten / 60)}:${String(gutschrift.minuten % 60).padStart(2, "0")} Stunden gutgeschrieben.`
            : "",
          released ? `${released} Einsätze hat ${profile.name} übernommen.` : ""
        ].filter(Boolean).join(" ")
      );

      return NextResponse.json({
        ok: true,
        item: { ...data, ...(gespeicherteZeile || {}) },
        conflicts: conflicts.length,
        conflictsReleased: released,
        uebergabe,
        gutschrift,
        hinweis: gutschriftGespeichert
          ? null
          : "Die Gutschrift konnte nicht gespeichert werden. Bitte supabase/urlaub_gutschrift.sql einmal ausführen."
      });
    }

    /**
     * Stunden von Hand setzen.
     *
     * Die Rechnung findet nicht immer etwas — bei jemandem, der erst seit
     * kurzem da ist, oder bei einem Wochentag, an dem er sonst nie arbeitet.
     * Dann trägt das Büro ein, was der Tag wert ist.
     */
    if (action === "credit") {
      const roh = Array.isArray(body.detail) ? body.detail : [];
      const detail = roh
        .map((eintrag: AnyRow) => ({
          tag: clean(eintrag.tag).slice(0, 10),
          minuten: Math.max(0, Math.round(Number(eintrag.minuten) || 0)),
          quelle: clean(eintrag.quelle) || "manuell"
        }))
        .filter((eintrag: AnyRow) => /^\d{4}-\d{2}-\d{2}$/.test(eintrag.tag));

      if (!detail.length) {
        return NextResponse.json({ ok: false, error: "Keine Tage übergeben." }, { status: 400 });
      }

      const minuten = detail.reduce((summe: number, eintrag: AnyRow) => summe + eintrag.minuten, 0);
      const tage = detail.filter((eintrag: AnyRow) => eintrag.minuten > 0).length;

      try {
        const ergebnis = await safeUpdateById(supabase, "absence_requests", id, {
          credited_minutes: minuten,
          credited_days: tage,
          credit_detail: detail
        });
        if (ergebnis.skipped.length) {
          return NextResponse.json(
            { ok: false, error: "Die Spalten für die Gutschrift fehlen noch. Bitte supabase/urlaub_gutschrift.sql ausführen." },
            { status: 409 }
          );
        }
        await notifyEmployee(
          supabase,
          absence,
          "Stunden für deine Abwesenheit",
          `Dir wurden ${tage} ${tage === 1 ? "Tag" : "Tage"} mit zusammen ${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")} Stunden gutgeschrieben.`
        );
        return NextResponse.json({ ok: true, item: ergebnis.data, credited_minutes: minuten, credited_days: tage });
      } catch (fehler) {
        const text = fehler instanceof Error ? fehler.message : "Gutschrift konnte nicht gespeichert werden.";
        return NextResponse.json({ ok: false, error: text }, { status: 500 });
      }
    }

    if (action === "unassign_conflicts") {
      const conflicts = await loadConflicts(supabase, absence);
      const released = await einsaetzeUebernehmen(supabase, conflicts, profile.name, `Übernommen von ${profile.name}, weil ${absence.employee_name} vom ${absence.start_date} bis ${absence.end_date || absence.start_date} abwesend ist.`);
      const uebergabe = await uebergabeMelden(supabase, profile.name, absence, conflicts);
      return NextResponse.json({ ok: true, conflicts: conflicts.length, conflictsReleased: released, uebergabe });
    }

    return NextResponse.json({ ok: false, error: "Unbekannte Urlaubs-Aktion." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Urlaubsplanung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
