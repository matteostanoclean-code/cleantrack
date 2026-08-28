/**
 * Zeiten aus den Rohstempeln aufbereiten.
 *
 * Liegt hier und nicht in der Route, weil zwei Stellen dieselbe Rechnung
 * brauchen: die Zeitenfreigabe zeigt die Liste, das Dashboard zaehlt nur.
 * Getrennte Rechnungen wuerden frueher oder spaeter auseinanderlaufen.
 */

import { localDayIso, parseHm } from "@/lib/format";

/**
 * Erklärung, die der Mitarbeiter beim Nachtragen abhaken muss.
 *
 * Steht hier und nicht im Bildschirm, damit genau der Wortlaut gespeichert
 * wird, den er auch gesehen hat. Wird der Text später geändert, bleibt bei
 * alten Nachträgen der alte Wortlaut stehen.
 *
 * Achtung: Das ist kein geprüfter Rechtstext. Vor dem Einsatz im Betrieb
 * gehört der Wortlaut einmal vom Steuerberater oder Anwalt angesehen.
 */
export const NACHTRAG_ERKLAERUNG =
  "Ich bestätige, dass ich die oben angegebenen Arbeitszeiten tatsächlich und vollständig geleistet habe und meine Angaben wahrheitsgemäß sind. Mir ist bekannt, dass die Nachbuchung zunächst ungeprüft ist und erst nach Prüfung durch den Arbeitgeber freigegeben wird.";

export type AnyRow = Record<string, any>;

/** Abweichungen bis zu dieser Grenze gelten als planmäßig und brauchen keine Freigabe. */
export const TOLERANCE_MINUTES = 5;

export function text(value: unknown) {
  return String(value ?? "").trim();
}

export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}


function minutesFromTimeWindow(start?: unknown, end?: unknown) {
  const from = parseHm(text(start).slice(0, 5));
  const to = parseHm(text(end).slice(0, 5));
  if (from === null || to === null) return 0;
  return to >= from ? to - from : 1440 - from + to;
}

export function plannedMinutesFromTask(task: AnyRow | null) {
  if (!task) return 0;
  const direct = numberOrNull(task.planned_minutes ?? task.max_minutes ?? task.paid_minutes ?? task.wage_minutes);
  if (direct && direct > 0) return Math.round(direct);
  return minutesFromTimeWindow(task.start_time, task.end_time);
}

/** Arbeits- und Pausenminuten aus der Stempelfolge eines Tages. */
function spansFromEntries(entries: AnyRow[]) {
  const rows = [...entries]
    .filter((entry) => entry.created_at && entry.success !== false)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let workMinutes = 0;
  let breakMinutes = 0;
  let workStart: number | null = null;
  let breakStart: number | null = null;

  for (const row of rows) {
    const timestamp = new Date(row.created_at).getTime();
    if (!Number.isFinite(timestamp)) continue;

    if (row.action === "clock_in" || row.action === "break_end") {
      if (breakStart) {
        breakMinutes += Math.max(0, Math.round((timestamp - breakStart) / 60000));
        breakStart = null;
      }
      workStart = timestamp;
    }

    if (row.action === "break_start") {
      if (workStart) {
        workMinutes += Math.max(0, Math.round((timestamp - workStart) / 60000));
        workStart = null;
      }
      breakStart = timestamp;
    }

    if (row.action === "clock_out") {
      if (workStart) {
        workMinutes += Math.max(0, Math.round((timestamp - workStart) / 60000));
        workStart = null;
      }
      if (breakStart) {
        breakMinutes += Math.max(0, Math.round((timestamp - breakStart) / 60000));
        breakStart = null;
      }
    }
  }

  return { workMinutes, breakMinutes };
}

function entryHasLocationProblem(entry: AnyRow) {
  if (entry.success === false) return true;
  const distance = numberOrNull(entry.distance_m);
  const radius = numberOrNull(entry.allowed_radius_m);
  if (distance !== null && radius !== null && distance > radius) return true;
  return numberOrNull(entry.latitude) === null || numberOrNull(entry.longitude) === null;
}

function actionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    clock_in: "Eingestempelt",
    break_start: "Pause gestartet",
    break_end: "Pause beendet",
    clock_out: "Ausgestempelt"
  };
  return labels[text(action)] || "Zeit erfasst";
}

/**
 * Baut aus den Rohstempeln je Einsatz/Tag einen prüfbaren Datensatz.
 *
 * Wird auch von der Aufgabenzählung genutzt, damit die Zahl im Dashboard und
 * die Liste in der Zeitenfreigabe nie auseinanderlaufen.
 */
export function buildRecords(entries: AnyRow[], tasksById: Map<string, AnyRow>) {
  const groups = new Map<string, AnyRow[]>();

  for (const entry of entries) {
    const day = localDayIso(entry.created_at);
    if (!day) continue;
    const key = entry.task_id
      ? `task:${entry.task_id}`
      : `day:${text(entry.employee_name).toLowerCase()}|${day}|${text(entry.work_site_id)}`;
    groups.set(key, [...(groups.get(key) || []), entry]);
  }

  const records = Array.from(groups.entries()).map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const clockIn = sorted.find((row) => row.action === "clock_in") || sorted[0];
    const clockOut = [...sorted].reverse().find((row) => row.action === "clock_out") || null;
    const task = clockIn?.task_id ? tasksById.get(clockIn.task_id) || null : null;

    const { workMinutes, breakMinutes: computedBreak } = spansFromEntries(sorted);
    // Eine vom Büro eingetragene Pause hat Vorrang vor der aus den Stempeln berechneten.
    const breakMinutes = numberOrNull(clockOut?.pause_minutes) ?? computedBreak;
    const plannedMinutes = plannedMinutesFromTask(task);
    const storedApproved = numberOrNull(clockOut?.approved_minutes);
    const actualMinutes = numberOrNull(clockOut?.actual_minutes) ?? workMinutes;
    const deviationMinutes = plannedMinutes ? actualMinutes - plannedMinutes : 0;
    const locationIssue = sorted.some(entryHasLocationProblem);
    const incomplete = !clockOut;

    const rawStatus = text(clockOut?.approval_status).toLowerCase();
    let state: "open" | "approved" | "rejected";
    if (rawStatus === "approved") state = "approved";
    else if (rawStatus === "rejected") state = "rejected";
    else if (rawStatus === "pending") state = "open";
    else if (incomplete) state = "open";
    else state = Math.abs(deviationMinutes) > TOLERANCE_MINUTES || locationIssue ? "open" : "approved";

    const day = localDayIso(clockIn?.created_at);

    return {
      id: key,
      entryId: clockOut?.id || null,
      taskId: clockIn?.task_id || null,
      employeeName: clockIn?.employee_name || clockOut?.employee_name || "Mitarbeiter",
      siteName: clockIn?.work_site_name || task?.site || task?.customer_name || "Ohne Objekt",
      workSiteId: clockIn?.work_site_id || task?.work_site_id || null,
      customerName: task?.customer_name || null,
      taskTitle: task?.title || task?.task_type || null,
      date: day,
      plannedStart: task?.start_time ? text(task.start_time).slice(0, 5) : null,
      plannedEnd: task?.end_time ? text(task.end_time).slice(0, 5) : null,
      plannedMinutes,
      actualStart: clockIn?.created_at || null,
      actualEnd: clockOut?.created_at || null,
      actualMinutes,
      breakMinutes,
      travelMinutes: numberOrNull(clockOut?.travel_minutes) ?? 0,
      approvedMinutes: storedApproved,
      deviationMinutes,
      state,
      approvalStatus: rawStatus || (incomplete ? "incomplete" : "not_required"),
      adminResponse: clockOut?.admin_response || null,
      employeeReason: clockOut?.reason || clockOut?.note || null,
      locationIssue,
      incomplete,
      log: sorted.map((row) => ({
        id: row.id,
        action: row.action,
        label: actionLabel(row.action),
        time: row.created_at,
        latitude: numberOrNull(row.latitude),
        longitude: numberOrNull(row.longitude),
        distanceM: numberOrNull(row.distance_m),
        allowedRadiusM: numberOrNull(row.allowed_radius_m),
        ok: !entryHasLocationProblem(row),
        message: row.error_message || null
      }))
    };
  });

  return records.sort((a, b) => `${b.date}${b.actualStart || ""}`.localeCompare(`${a.date}${a.actualStart || ""}`));
}
