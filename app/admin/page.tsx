"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Tab =
  | "dashboard"
  | "planung"
  | "mitarbeiter"
  | "kunden"
  | "kontakte"
  | "objekte"
  | "aufgaben"
  | "meldungen"
  | "material"
  | "geraete"
  | "schluessel"
  | "zeiten"
  | "abwesenheiten"
  | "chat";

type Row = Record<string, any>;
type ModalType = "employeeInvite" | "employeeEdit" | "customer" | "contact" | "site" | "task" | "material" | "device" | "key" | "absence" | "timeCorrection" | null;

function parseLocalDate(value?: string | Date | null) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }

  const fallback = text ? new Date(text) : new Date();
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function toLocalIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const today = toLocalIso(new Date());

const emptyEmployeeInvite = { name: "", email: "", phone: "" };
const emptyEmployeeEdit = { id: "", name: "", email: "", phone: "", employee_number: "", address: "", hourly_rate: "0", monthly_hour_limit: "0", vacation_days: "0", active: true };
const emptyCustomer = { id: "", name: "", customer_number: "", address: "", phone: "", email: "", notes: "", active: true };
const emptyContact = { id: "", name: "", company: "", phone: "", email: "", role: "", notes: "" };
const emptySite = { id: "", name: "", customer_id: "", customer_name: "", address: "", allowed_radius_m: "50", monthly_hour_quota: "0", latitude: "", longitude: "", notes: "", active: true };
const emptyTask = { id: "", title: "Unterhaltsreinigung", task_date: today, due_date: today, start_time: "08:00", end_time: "10:00", planned_minutes: "120", customer_id: "", customer_name: "", site: "", work_site_id: "", employee_name: "", priority: "Normal", task_category: "Reklamation", status: "open", notes: "", done: false, item_type: "einsatz", task_type: "einsatz", repeat_mode: "once", recurrence_interval: "1", recurrence_unit: "week", recurrence_days: [] as string[], recurrence_end_date: "", travel_minutes: "0", break_minutes: "0", notify_employee: true, create_another: false, paid_minutes: "120" };

function createEmptyTaskForm(mode: "einsatz" | "task" = "einsatz") {
  return {
    ...emptyTask,
    title: mode === "task" ? "" : "Unterhaltsreinigung",
    due_date: today,
    task_date: today,
    start_time: mode === "task" ? "" : "08:00",
    end_time: mode === "task" ? "" : "10:00",
    planned_minutes: mode === "task" ? "0" : "120",
    paid_minutes: mode === "task" ? "0" : "120",
    item_type: mode,
    task_type: mode,
    priority: mode === "task" ? "Mittel" : "Normal",
    task_category: "Reklamation",
    status: "open",
  };
}
const emptyMaterial = { id: "", name: "", category: "", unit: "Stück", current_stock: "0", min_stock: "0", supplier: "", work_site_id: "", object_name: "", image_url: "", notes: "" };
const emptyDevice = { id: "", name: "", category: "", serial_number: "", assigned_to: "", status: "Aktiv", image_url: "", notes: "" };
const emptyKey = { id: "", key_name: "", key_number: "", customer_id: "", customer_name: "", customer_address: "", work_site_id: "", object_name: "", object_address: "", employee_name: "", status: "Ausgegeben", handover_date: today, return_date: "", notes: "" };
const emptyAbsence = { id: "", employee_name: "", absence_type: "Urlaub", start_date: today, end_date: today, reason: "", status: "open" };
const emptyTimeCorrection = { id: "", employee_name: "", work_date: today, start_time: "08:00", end_time: "10:00", site: "", work_site_id: "", reason: "Manuelle Korrektur", notes: "", approved: true };

function euro(value: unknown) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function friendlyUiError(value: unknown) {
  const message = String(value || "").trim();

  if (/final_schema_update\.sql/i.test(message)) return message;

  if (/schema cache|column .* does not exist|Could not find/i.test(message)) {
    return "Datenbank-Schema ist nicht aktuell. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  if (/violates check constraint/i.test(message)) {
    return "Eine alte Datenbank-Regel blockiert das Speichern. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  if (/violates not-null constraint|null value/i.test(message)) {
    return "Ein Pflichtfeld fehlt oder eine alte Pflichtregel blockiert das Speichern. Bitte final_schema_update.sql in Supabase ausführen.";
  }

  return message || "Aktion fehlgeschlagen.";
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CT";
}

function minutes(start?: string, end?: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let a = (sh || 0) * 60 + (sm || 0);
  let b = (eh || 0) * 60 + (em || 0);
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function prettyHours(value: unknown) {
  const total = Number(value || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function dateText(value?: string) {
  if (!value) return "-";
  return parseLocalDate(value).toLocaleDateString("de-DE");
}


function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function customerLabel(row: Row | undefined | null) {
  const label = String(row?.name || row?.customer_name || row?.company || "").trim();
  if (label) return label;
  const address = String(row?.address || row?.customer_address || "").trim();
  return address ? `Kunde ohne Name (${address})` : "";
}

function customerAddress(row: Row | undefined | null) {
  return String(row?.address || row?.customer_address || "").trim();
}

function siteOptionLabel(site: Row | undefined | null) {
  const name = String(site?.name || site?.site || "").trim();
  const customer = String(site?.customer_name || "").trim();
  if (!customer || customer.toLowerCase() === name.toLowerCase()) return name || customer || "Objekt ohne Namen";
  return `${name || "Objekt ohne Namen"} · ${customer}`;
}

function plannedMinutesValue(row: Row) {
  const planned = Number(row.planned_minutes ?? 0);
  if (Number.isFinite(planned) && planned > 0) return planned;
  const max = Number(row.max_minutes ?? 0);
  if (Number.isFinite(max) && max > 0) return max;
  return 0;
}

function customerValue(row: Row | undefined | null) {
  const id = String(row?.id || "").trim();
  return isUuid(id) ? id : customerLabel(row);
}

function findCustomerByValue(customers: Row[], value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return customers.find((customer) => {
    const id = String(customer.id || "").trim().toLowerCase();
    const label = customerLabel(customer).toLowerCase();
    return id === normalized || label === normalized;
  }) || null;
}

function siteBelongsToCustomer(site: Row, selectedValue: string, customers: Row[]) {
  if (!selectedValue) return true;
  const customer = findCustomerByValue(customers, selectedValue);
  const selectedLabel = customerLabel(customer).toLowerCase() || String(selectedValue || "").trim().toLowerCase();
  const selectedId = String(customer?.id || selectedValue || "").trim();

  const siteCustomerId = String(site.customer_id || "").trim();
  const siteCustomerName = String(site.customer_name || site.customer || "").trim().toLowerCase();

  if (isUuid(selectedId) && siteCustomerId && siteCustomerId === selectedId) return true;
  if (selectedLabel && siteCustomerName && siteCustomerName === selectedLabel) return true;
  return false;
}

function numberOrFallback(value: unknown, fallback: number) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return fallback;
  const num = Number(text);
  return Number.isFinite(num) ? num : fallback;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  return toLocalIso(date);
}

function weekdayKey(date: Date) {
  const keys = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  return keys[date.getDay()];
}

function uniqueDates(values: string[]) {
  return [...new Set(values)].sort();
}

function buildScheduleDates(form: Row) {
  const start = parseLocalDate(String(form.task_date || today));
  const mode = String(form.repeat_mode || "once");
  if (mode !== "repeat") return [isoDate(start)];

  const end = form.recurrence_end_date ? parseLocalDate(String(form.recurrence_end_date)) : addDays(start, 28);
  const interval = Math.max(1, Number(form.recurrence_interval || 1));
  const unit = String(form.recurrence_unit || "week");
  const selectedDays = Array.isArray(form.recurrence_days) ? form.recurrence_days : [];
  const dates: string[] = [];

  if (unit === "week") {
    let cursor = new Date(start);
    while (cursor <= end && dates.length < 370) {
      const diffDays = Math.floor((cursor.getTime() - start.getTime()) / 86400000);
      const weekIndex = Math.floor(diffDays / 7);
      const dayMatches = selectedDays.length === 0 || selectedDays.includes(weekdayKey(cursor));
      if (weekIndex % interval === 0 && dayMatches) dates.push(isoDate(cursor));
      cursor = addDays(cursor, 1);
    }
  } else {
    let cursor = new Date(start);
    while (cursor <= end && dates.length < 370) {
      dates.push(isoDate(cursor));
      cursor = addDays(cursor, unit === "day" ? interval : interval * 30);
    }
  }

  return uniqueDates(dates.length ? dates : [isoDate(start)]);
}


function dateOnly(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 10);
}

function startOfWeekMonday(value?: string) {
  const d = parseLocalDate(value || today);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function weekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function dayShort(date: string) {
  return parseLocalDate(date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function taskDuration(task: Row) {
  return plannedMinutesValue(task);
}

function normalizedStatus(value: unknown) {
  return String(value || "open").trim().toLowerCase();
}

function absenceIsBlocking(row: Row) {
  const status = normalizedStatus(row.status);
  return ["approved", "genehmigt", "accepted", "akzeptiert"].includes(status);
}

function absenceIsOpen(row: Row) {
  const status = normalizedStatus(row.status);
  return !status || ["open", "offen", "pending", "beantragt"].includes(status);
}

function absenceCoversDate(absence: Row, date: string) {
  const start = dateOnly(absence.start_date);
  const end = dateOnly(absence.end_date || absence.start_date);
  if (!start) return false;
  const current = dateOnly(date);
  return current >= start && current <= (end || start);
}

function employeeAbsenceForDate(absences: Row[], employeeName: string, date: string) {
  const name = String(employeeName || "").trim().toLowerCase();
  if (!name) return null;
  return absences.find((absence) => String(absence.employee_name || "").trim().toLowerCase() === name && absenceCoversDate(absence, date)) || null;
}

function dateRangeInclusive(startValue: unknown, endValue: unknown) {
  const startText = dateOnly(startValue);
  const endText = dateOnly(endValue || startValue);
  if (!startText) return [] as string[];

  const start = parseLocalDate(startText);
  const end = parseLocalDate(endText || startText);
  const dates: string[] = [];
  let cursor = new Date(start);

  while (cursor <= end && dates.length < 370) {
    dates.push(isoDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

function absenceTypeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function isVacationAbsence(row: Row) {
  const type = absenceTypeKey(row.absence_type);
  return type.includes("urlaub");
}

function isSickAbsence(row: Row) {
  const type = absenceTypeKey(row.absence_type);
  return type.includes("krank");
}

function isUnpaidAbsence(row: Row) {
  const type = absenceTypeKey(row.absence_type);
  return type.includes("unbezahlt");
}

function isPaidFreeAbsence(row: Row) {
  const type = absenceTypeKey(row.absence_type);
  return type.includes("bezahlt") || type.includes("frei bezahlt") || type.includes("bezahlt frei");
}

function isPaidAbsence(row: Row) {
  return isVacationAbsence(row) || isSickAbsence(row) || isPaidFreeAbsence(row);
}

function absenceDayCount(absences: Row[], employeeName: string, predicate: (row: Row) => boolean) {
  const name = String(employeeName || "").trim().toLowerCase();
  if (!name) return 0;

  return absences
    .filter((absence) => String(absence.employee_name || "").trim().toLowerCase() === name)
    .filter(absenceIsBlocking)
    .filter(predicate)
    .reduce((sum, absence) => sum + dateRangeInclusive(absence.start_date, absence.end_date || absence.start_date).length, 0);
}

function plannedMinutesForEmployeeDate(tasks: Row[], employeeName: string, date: string) {
  const name = String(employeeName || "").trim().toLowerCase();
  if (!name) return 0;

  return tasks
    .filter((task) => task.item_type !== "task" && task.task_type !== "task")
    .filter((task) => String(task.employee_name || "").trim().toLowerCase() === name)
    .filter((task) => dateOnly(task.task_date || task.due_date) === dateOnly(date))
    .reduce((sum, task) => sum + taskDuration(task), 0);
}

function findBlockingAbsence(absences: Row[], employeeName: string, dates: string[]) {
  return dates.map((date) => employeeAbsenceForDate(absences, employeeName, date)).find((absence) => absence && absenceIsBlocking(absence)) || null;
}

function timeToMinutes(value: unknown) {
  const text = String(value || "").trim();
  if (!text || !text.includes(":")) return null;
  const [h, m] = text.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function timesOverlap(aStart: unknown, aEnd: unknown, bStart: unknown, bEnd: unknown) {
  const a1 = timeToMinutes(aStart);
  const a2 = timeToMinutes(aEnd);
  const b1 = timeToMinutes(bStart);
  const b2 = timeToMinutes(bEnd);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return a1 < b2 && b1 < a2;
}

function findScheduleConflict(tasks: Row[], form: Row, dates: string[]) {
  const employee = String(form.employee_name || "").trim().toLowerCase();
  if (!employee) return null;
  return tasks.find((task) => {
    if (String(task.id || "") === String(form.id || "")) return false;
    const taskEmployee = String(task.employee_name || "").trim().toLowerCase();
    if (taskEmployee !== employee) return false;
    if (task.item_type === "task" || task.task_type === "task") return false;
    if (!dates.includes(dateOnly(task.task_date))) return false;
    return timesOverlap(form.start_time, form.end_time, task.start_time, task.end_time);
  }) || null;
}

function sameMonth(dateValue: unknown, monthDate: Date) {
  if (!dateValue) return false;
  const date = parseLocalDate(String(dateValue));
  return date.getFullYear() === monthDate.getFullYear() && date.getMonth() === monthDate.getMonth();
}

function monthName(date: Date) {
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function formatHours(value: unknown) {
  const total = Math.max(0, Number(value || 0));
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return `${h}:${String(m).padStart(2, "0")}h`;
}

function taskPlanLabel(task: Row) {
  const planned = taskDuration(task);
  return planned > 0 ? formatHours(planned) : "fehlt";
}

function employeeMonthlyLimit(employee: Row) {
  return Number(employee.monthly_hour_limit || employee.monthly_hours || employee.monthly_limit_minutes || 0);
}

function employeePlannedMinutesForMonth(tasks: Row[], employee: Row, monthDate: Date) {
  const name = String(employee.name || "").trim();
  return tasks
    .filter((task) => String(task.employee_name || "").trim() === name && sameMonth(task.task_date || task.due_date, monthDate))
    .reduce((sum, task) => sum + taskDuration(task), 0);
}

function siteHourQuotaMinutes(site: Row | undefined | null) {
  const hours = Number(site?.monthly_hour_quota || site?.monthly_hours || site?.hour_quota || 0);
  return Number.isFinite(hours) ? Math.max(0, Math.round(hours * 60)) : 0;
}

function sitePlannedMinutesForMonth(tasks: Row[], site: Row | undefined | null, monthDate: Date, currentTaskId?: string) {
  if (!site) return 0;
  return tasks
    .filter((task) => {
      if (currentTaskId && String(task.id || "") === String(currentTaskId)) return false;
      const sameSite = String(task.work_site_id || "") === String(site.id || "") || String(task.site || "") === String(site.name || "");
      return sameSite && sameMonth(task.task_date || task.due_date, monthDate) && task.item_type !== "task" && task.task_type !== "task";
    })
    .reduce((sum, task) => sum + taskDuration(task), 0);
}

function paidMinutesFromForm(form: Row) {
  const planned = Number(form.planned_minutes || 0);
  const travel = Number(form.travel_minutes || 0);
  const pause = Number(form.break_minutes || 0);
  return Math.max(0, planned + travel - pause);
}



function downloadCsv(filename: string, rows: Row[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function pdfText(value: unknown) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

function pdfHexText(value: unknown) {
  const text = `\uFEFF${pdfText(value)}`;
  let hex = "";
  for (let i = 0; i < text.length; i += 1) {
    hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  }
  return `<${hex}>`;
}

function safeFilename(value: unknown) {
  return String(value || "dokument")
    .toLowerCase()
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dokument";
}

function buildPdf(objects: string[], filename: string) {
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPdf(title: string, lines: string[], filename: string) {
  const stream = [`BT /F1 18 Tf 50 790 Td ${pdfHexText(title)} Tj ET`];
  lines.forEach((line, i) => stream.push(`BT /F1 11 Tf 50 ${750 - i * 22} Td ${pdfHexText(line)} Tj ET`));
  const content = stream.join("\n");
  buildPdf([
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ], filename);
}

function wrapPdfLine(text: string, maxChars: number) {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}


function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function printKeyHandoverPdf(data: {
  employeeName: string;
  customerAndAddress: string;
  keyAmount: string;
  keyNumber: string;
}) {
  const issueDate = new Date().toLocaleDateString("de-DE");
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Schlüsselübergabeprotokoll</title>
  <style>
    @page { size: A4; margin: 20mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12pt; line-height: 1.35; }
    h1 { font-size: 18pt; margin: 0 0 18px; }
    h2 { font-size: 13pt; margin: 18px 0 8px; }
    p { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
    th, td { border: 1px solid #111827; padding: 9px 10px; text-align: left; vertical-align: top; }
    th { font-weight: 700; background: #f3f4f6; }
    ul { margin: 8px 0 16px 18px; padding: 0; }
    li { margin: 0 0 7px; }
    .between { margin-bottom: 14px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; margin-top: 42px; }
    .line { border-top: 1px solid #111827; padding-top: 7px; font-size: 10.5pt; }
    .date { margin-top: 28px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Schlüsselübergabeprotokoll</h1>

  <p class="between"><strong>Zwischen:</strong></p>
  <p><strong>Arbeitgeber:</strong> Matteo Stano Clean Gebäudereinigung</p>
  <p><strong>Mitarbeiter:</strong> ${htmlEscape(data.employeeName || "-")}</p>

  <h2>1. Gegenstand der Übergabe</h2>
  <p>Der Mitarbeiter bestätigt den Erhalt der folgenden Schlüssel für das Objekt ${htmlEscape(data.customerAndAddress || "-")}:</p>

  <table>
    <thead>
      <tr>
        <th style="width: 28%;">Anzahl</th>
        <th>Schlüsselnummer / Kennzeichnung</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${htmlEscape(data.keyAmount || "-")}</td>
        <td>${htmlEscape(data.keyNumber || "-")}</td>
      </tr>
      <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
      <tr><td>&nbsp;</td><td>&nbsp;</td></tr>
    </tbody>
  </table>

  <h2>2. Pflichten des Mitarbeiters</h2>
  <p>Mit der Übernahme der Schlüssel verpflichtet sich der Mitarbeiter zu folgendem:</p>
  <ul>
    <li><strong>Sorgfaltspflicht:</strong> Die Schlüssel sind mit größter Sorgfalt zu verwahren. Eine Weitergabe an unbefugte Dritte ist strikt untersagt.</li>
    <li><strong>Nachschlüsselverbot:</strong> Es ist dem Mitarbeiter untersagt, eigenmächtig Kopien oder Nachschlüssel anzufertigen oder anfertigen zu lassen.</li>
    <li><strong>Meldepflicht:</strong> Der Verlust eines Schlüssels ist dem Arbeitgeber unverzüglich (ohne schuldhaftes Zögern) anzuzeigen.</li>
    <li><strong>Rückgabepflicht:</strong> Bei Beendigung des Arbeitsverhältnisses, oder auf ausdrückliches Verlangen des Arbeitgebers, sind alle überlassenen Schlüssel sofort zurückzugeben. Ein Zurückbehaltungsrecht besteht nicht.</li>
  </ul>

  <h2>3. Haftung</h2>
  <p>Bei Verlust oder Beschädigung der Schlüssel durch grobe Fahrlässigkeit oder Vorsatz haftet der Mitarbeiter für die daraus entstehenden Kosten (z. B. Austausch der Schließanlage, Notdienst).</p>
  <p><strong>Hinweis:</strong> Wir empfehlen dem Mitarbeiter, zu prüfen, ob die private Haftpflichtversicherung den Verlust von "beruflich genutzten Schlüsseln" abdeckt.</p>

  <h2>4. Empfangsbestätigung</h2>
  <p>Der Mitarbeiter bestätigt durch seine Unterschrift den Erhalt der oben aufgeführten Schlüssel in technisch einwandfreiem Zustand.</p>

  <p class="date">Ort, Datum: Ispringen, ${htmlEscape(issueDate)}</p>

  <div class="signatures">
    <div class="line">Unterschrift Arbeitgeber</div>
    <div class="line">Unterschrift Mitarbeiter</div>
  </div>

  <script>
    window.addEventListener('load', () => setTimeout(() => window.print(), 250));
  </script>
</body>
</html>`;
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    alert("Bitte Pop-ups erlauben, damit das Protokoll geöffnet werden kann.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function downloadKeyHandoverPdf(data: {
  employeeName: string;
  objectAddress: string;
  keyAmount: string;
  keyNumber: string;
  filename: string;
}) {
  const ops: string[] = [];
  let y = 805;

  const addText = (text: string, x = 50, size = 10, font = "F1") => {
    ops.push(`BT /${font} ${size} Tf ${x} ${y} Td ${pdfHexText(text)} Tj ET`);
    y -= size + 7;
  };
  const addWrapped = (text: string, x = 50, size = 10, maxChars = 92) => {
    wrapPdfLine(text, maxChars).forEach((line) => addText(line, x, size));
  };
  const addSpace = (value = 10) => { y -= value; };
  const addLine = (x1 = 50, x2 = 545) => {
    ops.push(`${x1} ${y} m ${x2} ${y} l S`);
    y -= 14;
  };

  addText("Schlüsselübergabeprotokoll", 50, 18, "F2");
  addLine();
  addText("Zwischen:", 50, 11, "F2");
  addText("Arbeitgeber: Matteo Stano Clean Gebäudereinigung", 50, 10);
  addText(`Mitarbeiter: ${data.employeeName || "-"}`, 50, 10);
  addSpace(8);

  addText("1. Gegenstand der Übergabe", 50, 12, "F2");
  addWrapped(`Der Mitarbeiter bestätigt den Erhalt der folgenden Schlüssel für das Objekt ${data.objectAddress || "-"}:`, 50, 10, 86);
  addSpace(4);

  const tableX = 50;
  const tableY = y;
  const amountW = 120;
  const numberW = 375;
  const rowH = 28;
  ops.push(`${tableX} ${tableY - rowH} ${amountW} ${rowH} re S`);
  ops.push(`${tableX + amountW} ${tableY - rowH} ${numberW} ${rowH} re S`);
  ops.push(`${tableX} ${tableY - rowH * 2} ${amountW} ${rowH} re S`);
  ops.push(`${tableX + amountW} ${tableY - rowH * 2} ${numberW} ${rowH} re S`);
  ops.push(`BT /F2 9 Tf ${tableX + 10} ${tableY - 18} Td ${pdfHexText("Anzahl")} Tj ET`);
  ops.push(`BT /F2 9 Tf ${tableX + amountW + 10} ${tableY - 18} Td ${pdfHexText("Schlüsselnummer / Kennzeichnung")} Tj ET`);
  ops.push(`BT /F1 10 Tf ${tableX + 10} ${tableY - rowH - 18} Td ${pdfHexText(data.keyAmount || "-")} Tj ET`);
  ops.push(`BT /F1 10 Tf ${tableX + amountW + 10} ${tableY - rowH - 18} Td ${pdfHexText(data.keyNumber || "-")} Tj ET`);
  y = tableY - rowH * 2 - 18;

  addText("2. Pflichten des Mitarbeiters", 50, 12, "F2");
  addWrapped("Mit der Übernahme der Schlüssel verpflichtet sich der Mitarbeiter zu folgendem:", 50, 10, 88);
  [
    "Sorgfaltspflicht: Die Schlüssel sind mit größter Sorgfalt zu verwahren. Eine Weitergabe an unbefugte Dritte ist strikt untersagt.",
    "Nachschlüsselverbot: Es ist dem Mitarbeiter untersagt, eigenmächtig Kopien oder Nachschlüssel anzufertigen oder anfertigen zu lassen.",
    "Meldepflicht: Der Verlust eines Schlüssels ist dem Arbeitgeber unverzüglich ohne schuldhaftes Zögern anzuzeigen.",
    "Rückgabepflicht: Bei Beendigung des Arbeitsverhältnisses oder auf ausdrückliches Verlangen des Arbeitgebers sind alle überlassenen Schlüssel sofort zurückzugeben. Ein Zurückbehaltungsrecht besteht nicht.",
  ].forEach((item) => addWrapped(`• ${item}`, 60, 9, 92));
  addSpace(4);

  addText("3. Haftung", 50, 12, "F2");
  addWrapped("Bei Verlust oder Beschädigung der Schlüssel durch grobe Fahrlässigkeit oder Vorsatz haftet der Mitarbeiter für die daraus entstehenden Kosten, zum Beispiel Austausch der Schließanlage oder Notdienst.", 50, 9, 96);
  addWrapped("Hinweis: Wir empfehlen dem Mitarbeiter, zu prüfen, ob die private Haftpflichtversicherung den Verlust von beruflich genutzten Schlüsseln abdeckt.", 50, 9, 96);
  addSpace(4);

  addText("4. Empfangsbestätigung", 50, 12, "F2");
  addWrapped("Der Mitarbeiter bestätigt durch seine Unterschrift den Erhalt der oben aufgeführten Schlüssel in technisch einwandfreiem Zustand.", 50, 9, 96);
  addSpace(12);
  addText(`Ort, Datum: Ispringen, ${new Date().toLocaleDateString("de-DE")}`, 50, 10, "F2");
  addSpace(34);
  ops.push(`BT /F1 10 Tf 50 ${y} Td ${pdfHexText("_____________________________")} Tj ET`);
  ops.push(`BT /F1 10 Tf 330 ${y} Td ${pdfHexText("_____________________________")} Tj ET`);
  y -= 16;
  ops.push(`BT /F1 9 Tf 50 ${y} Td ${pdfHexText("Unterschrift Arbeitgeber")} Tj ET`);
  ops.push(`BT /F1 9 Tf 330 ${y} Td ${pdfHexText("Unterschrift Mitarbeiter")} Tj ET`);

  const content = ops.join("\n");
  buildPdf([
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
  ], data.filename);
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [adminProfile, setAdminProfile] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [modal, setModal] = useState<ModalType>(null);
  const [search, setSearch] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");

  const [employees, setEmployees] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [entries, setEntries] = useState<Row[]>([]);
  const [absences, setAbsences] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [materialReports, setMaterialReports] = useState<Row[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [contacts, setContacts] = useState<Row[]>([]);
  const [chatMessages, setChatMessages] = useState<Row[]>([]);

  const [employeeInvite, setEmployeeInvite] = useState(emptyEmployeeInvite);
  const [employeeEdit, setEmployeeEdit] = useState(emptyEmployeeEdit);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [siteForm, setSiteForm] = useState(emptySite);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [keyForm, setKeyForm] = useState(emptyKey);
  const [absenceForm, setAbsenceForm] = useState(emptyAbsence);
  const [timeCorrectionForm, setTimeCorrectionForm] = useState(emptyTimeCorrection);
  const [chatEmployee, setChatEmployee] = useState("");
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (allowed) loadAll();
  }, [allowed]);

  useEffect(() => {
    // Die Planzeit ist bewusst unabhängig vom Von-Bis-Zeitfenster.
    // Von/Bis ist nur das Zeitfenster, in dem der Mitarbeiter einstempeln darf.
  }, [taskForm.start_time, taskForm.end_time, taskForm.id]);

  async function adminCall(body: Row) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(friendlyUiError(json.error || "Admin-Aktion fehlgeschlagen."));
    return json;
  }

  async function checkAdmin() {
    setLoading(true);
    try {
      const json = await adminCall({ action: "ping" });
      setAdminProfile(json.profile || null);
      setAllowed(true);
    } catch (error) {
      setAllowed(false);
      setAdminProfile(null);
      setMessage(error instanceof Error ? error.message : "Kein Zugriff.");
    } finally {
      setLoading(false);
    }
  }

  async function selectTable(table: string, orderBy = "created_at", ascending = false, limit?: number, silentMissing = false) {
    try {
      const json = await adminCall({ action: "select", table, orderBy, ascending, limit });
      return json.data || [];
    } catch (error) {
      const text = error instanceof Error ? error.message : `Daten konnten nicht geladen werden: ${table}`;
      const missingOptionalTable = /Could not find the table|schema cache|does not exist|relation .* does not exist/i.test(text);
      if (!silentMissing || !missingOptionalTable) setMessage(text);
      return [];
    }
  }

  async function loadAll() {
    const [employeeRows, customerRows, siteRows, taskRows, entryRows, absenceRows, materialRows, materialReportRows, notificationRows, deviceRows, keyRows, contactRows] = await Promise.all([
      selectTable("employee_profiles", "name", true),
      selectTable("customers", "created_at", false, undefined, true),
      selectTable("work_sites", "name", true),
      selectTable("tasks", "task_date", false),
      selectTable("time_entries", "created_at", false, 800),
      selectTable("absence_requests", "start_date", false),
      selectTable("material_products", "name", true),
      selectTable("material_reports", "created_at", false, 300, true),
      selectTable("admin_notifications", "created_at", false, 300, true),
      selectTable("equipment_items", "name", true),
      selectTable("key_items", "key_name", true),
      selectTable("customer_contacts", "name", true),
    ]);
    setEmployees(employeeRows);
    setCustomers(customerRows);
    setSites(siteRows);
    setTasks(taskRows);
    setEntries(entryRows);
    setAbsences(absenceRows);
    setMaterials(materialRows);
    setMaterialReports(materialReportRows);
    setAdminNotifications(notificationRows);
    setDevices(deviceRows);
    setKeys(keyRows);
    setContacts(contactRows);
  }

  const activeEmployees = employees.filter((item) => item.role !== "admin" && item.active !== false);
  const customerList = useMemo(() => customers.length ? customers : customerRowsFromSites(sites), [customers, sites]);
  const currentRole = String(adminProfile?.role || "").trim().toLowerCase();
  const isAdminRole = currentRole === "admin";
  const isObjectLeaderRole = currentRole === "objektleiter" || currentRole === "object_lead" || currentRole === "objectleader";
  const allowedTabs = useMemo(() => {
    if (isAdminRole) return navItems.map((item) => item.id);
    if (isObjectLeaderRole) return ["dashboard", "planung", "objekte", "aufgaben", "meldungen", "material", "zeiten", "abwesenheiten", "chat"] as Tab[];
    return [] as Tab[];
  }, [isAdminRole, isObjectLeaderRole]);
  const visibleNavItems = navItems.filter((item) => allowedTabs.includes(item.id));
  useEffect(() => {
    if (allowed && allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      setTab(allowedTabs[0]);
    }
  }, [allowed, allowedTabs, tab]);

  const assignmentRows = useMemo(() => tasks.filter((task) => task.item_type !== "task" && task.task_type !== "task"), [tasks]);
  const actionTaskRows = useMemo(() => tasks.filter((task) => task.item_type === "task" || task.task_type === "task"), [tasks]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return {
      employees: filterRows(employees, q),
      sites: filterRows(sites, q),
      customers: filterRows(customerList, q),
      contacts: filterRows(contacts, q),
      tasks: filterRows(tasks, q),
      assignments: filterRows(assignmentRows, q),
      actionTasks: filterRows(actionTaskRows, q),
      materials: filterRows(materials, q),
      materialReports: filterRows(materialReports, q),
      adminNotifications: filterRows(adminNotifications, q),
      devices: filterRows(devices, q),
      keys: filterRows(keys, q),
      entries: filterRows(entries, q),
      absences: filterRows(absences, q),
    };
  }, [search, employees, sites, customerList, contacts, tasks, assignmentRows, actionTaskRows, materials, materialReports, adminNotifications, devices, keys, entries, absences]);

  async function insertOrUpdate(table: string, id: string, payload: Row) {
    setSaving(true);
    setMessage("");
    try {
      if (id) {
        await adminCall({ action: "update", table, id, payload });
      } else {
        await adminCall({ action: "insert", table, payload: [payload] });
      }
      setModal(null);
      setMessage("Gespeichert.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(table: string, id: string, label: string) {
    if (!window.confirm(`${label} wirklich löschen?`)) return;
    setSaving(true);
    setMessage("");
    try {
      await adminCall({ action: "delete", table, id });
      setMessage("Gelöscht.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function createEmployeeInvite() {
    if (!employeeInvite.name.trim() || !employeeInvite.email.trim()) {
      setMessage("Bitte Name und E-Mail eintragen.");
      return;
    }

    setSaving(true);
    setMessage("");
    setInviteLink("");
    setWhatsappLink("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

      const response = await fetch("/api/admin/create-employee-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(employeeInvite),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Einladung konnte nicht erstellt werden.");
      setInviteLink(json.inviteLink || "");
      setWhatsappLink(json.whatsappLink || "");
      setMessage("Einladung erstellt. Der Mitarbeiter steht jetzt als Passiv in der Liste und kann den Link aktivieren.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einladung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function openEmployee(row?: Row) {
    setInviteLink("");
    setWhatsappLink("");
    if (!row) {
      setEmployeeInvite(emptyEmployeeInvite);
      setModal("employeeInvite");
      return;
    }
    setEmployeeEdit({
      id: String(row.id || ""),
      name: String(row.name || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      employee_number: String(row.employee_number || ""),
      address: String(row.address || row.street || ""),
      hourly_rate: String(row.hourly_rate ?? "0"),
      monthly_hour_limit: String(row.monthly_hour_limit ?? row.monthly_hours ?? "0"),
      vacation_days: String(row.vacation_days ?? row.annual_vacation_days ?? "0"),
      active: row.active !== false,
    });
    setModal("employeeEdit");
  }

  async function saveEmployee() {
    await updateEmployeeProfile({
      id: employeeEdit.id,
      name: employeeEdit.name,
      email: employeeEdit.email || null,
      phone: employeeEdit.phone || null,
      employee_number: employeeEdit.employee_number || null,
      address: employeeEdit.address || null,
      hourly_rate: Number(employeeEdit.hourly_rate || 0),
      monthly_hour_limit: Number(employeeEdit.monthly_hour_limit || 0),
      vacation_days: Number(employeeEdit.vacation_days || 0),
      active: employeeEdit.active,
    }, "Mitarbeiter gespeichert.");
  }

  async function updateEmployeeProfile(payload: Row, successText = "Mitarbeiter aktualisiert.") {
    setSaving(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

      const response = await fetch("/api/admin/update-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Mitarbeiter konnte nicht gespeichert werden.");

      if (json.employee?.id) {
        setEmployees((old) => old.map((item) => item.id === json.employee.id ? { ...item, ...json.employee } : item));
      }
      setModal(null);
      setMessage(successText);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mitarbeiter konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function setEmployeeActive(row: Row, active: boolean) {
    await updateEmployeeProfile({ id: row.id, name: row.name, active }, active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
  }

  function openCustomer(row?: Row) {
    setCustomerForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || row.customer_name || ""),
      customer_number: String(row.customer_number || ""),
      address: String(row.address || row.customer_address || ""),
      phone: String(row.phone || row.customer_phone || ""),
      email: String(row.email || row.customer_email || ""),
      notes: String(row.notes || row.customer_notes || ""),
      active: row.active !== false,
    } : emptyCustomer);
    setModal("customer");
  }

  async function saveCustomer() {
    await insertOrUpdate("customers", customerForm.id, {
      name: customerForm.name,
      customer_number: customerForm.customer_number || null,
      address: customerForm.address || null,
      phone: customerForm.phone || null,
      email: customerForm.email || null,
      notes: customerForm.notes || null,
      active: customerForm.active !== false,
    });
  }

  function openContact(row?: Row) {
    setContactForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      company: String(row.company || ""),
      phone: String(row.phone || ""),
      email: String(row.email || ""),
      role: String(row.role || row.contact_role || ""),
      notes: String(row.notes || ""),
    } : emptyContact);
    setModal("contact");
  }

  async function saveContact() {
    await insertOrUpdate("customer_contacts", contactForm.id, {
      name: contactForm.name,
      company: contactForm.company || null,
      phone: contactForm.phone || null,
      email: contactForm.email || null,
      role: contactForm.role || null,
      contact_role: contactForm.role || null,
      notes: contactForm.notes || null,
      active: true,
    });
  }

  async function geocodeSiteAddress() {
    const address = siteForm.address.trim();
    if (!address) {
      setMessage("Bitte zuerst eine Objekt-Adresse eintragen.");
      return;
    }

    setGeocoding(true);
    setMessage("");
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "GPS-Daten konnten nicht ermittelt werden.");
      setSiteForm((old) => ({ ...old, latitude: String(json.latitude ?? ""), longitude: String(json.longitude ?? "") }));
      setMessage("GPS-Daten wurden übernommen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GPS-Daten konnten nicht ermittelt werden.");
    } finally {
      setGeocoding(false);
    }
  }

  function openSite(row?: Row) {
    setSiteForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      customer_id: String(row.customer_id || ""),
      customer_name: String(row.customer_name || ""),
      address: String(row.address || ""),
      allowed_radius_m: String(row.allowed_radius_m ?? "50"),
      monthly_hour_quota: String(row.monthly_hour_quota ?? row.monthly_hours ?? row.hour_quota ?? "0"),
      latitude: String(row.latitude ?? ""),
      longitude: String(row.longitude ?? ""),
      notes: String(row.notes || ""),
      active: row.active !== false,
    } : emptySite);
    setModal("site");
  }

  async function saveSite() {
    const customer = customerList.find((item) => item.id === siteForm.customer_id);
    await insertOrUpdate("work_sites", siteForm.id, {
      name: siteForm.name,
      customer_id: isUuid(siteForm.customer_id) ? siteForm.customer_id : null,
      customer_name: customerLabel(customer) || siteForm.customer_name || null,
      address: siteForm.address,
      allowed_radius_m: numberOrFallback(siteForm.allowed_radius_m, 50),
      monthly_hour_quota: numberOrFallback(siteForm.monthly_hour_quota, 0),
      latitude: siteForm.latitude === "" ? null : numberOrFallback(siteForm.latitude, 0),
      longitude: siteForm.longitude === "" ? null : numberOrFallback(siteForm.longitude, 0),
      notes: siteForm.notes || null,
      active: siteForm.active,
    });
  }

  function openTask(row?: Row) {
    const mode: "einsatz" | "task" = tab === "aufgaben" ? "task" : "einsatz";
    if (!row) {
      setTaskForm(createEmptyTaskForm(mode));
      setModal("task");
      return;
    }

    const linkedSite = sites.find((site) => site.id === row.work_site_id || site.name === row.site);
    const rowIsTask = row.item_type === "task" || row.task_type === "task" || tab === "aufgaben";
    const editMode: "einsatz" | "task" = rowIsTask ? "task" : "einsatz";
    setTaskForm({
      ...createEmptyTaskForm(editMode),
      id: String(row.id || ""),
      title: String(row.title || (rowIsTask ? "" : "Unterhaltsreinigung")),
      task_date: String(row.task_date || row.due_date || today),
      due_date: String(row.due_date || row.task_date || today),
      start_time: String(row.start_time || (rowIsTask ? "" : "08:00")),
      end_time: String(row.end_time || (rowIsTask ? "" : "10:00")),
      planned_minutes: String(row.planned_minutes || row.max_minutes || (rowIsTask ? "0" : minutes(row.start_time, row.end_time) || "120")),
      paid_minutes: String(row.paid_minutes || row.wage_minutes || row.planned_minutes || row.max_minutes || (rowIsTask ? "0" : minutes(row.start_time, row.end_time) || "120")),
      customer_id: String(row.customer_id || linkedSite?.customer_id || ""),
      customer_name: String(row.customer_name || linkedSite?.customer_name || ""),
      site: String(row.site || linkedSite?.name || ""),
      work_site_id: String(row.work_site_id || linkedSite?.id || ""),
      employee_name: String(row.employee_name || ""),
      priority: String(row.priority || (rowIsTask ? "Mittel" : "Normal")),
      task_category: String(row.task_category || row.category || "Reklamation"),
      status: String(row.status || (row.done ? "done" : "open")),
      notes: String(row.notes || ""),
      done: Boolean(row.done),
      item_type: editMode,
      task_type: editMode,
      travel_minutes: String(row.travel_minutes ?? "0"),
      break_minutes: String(row.break_minutes ?? "0"),
      notify_employee: row.notify_employee !== false,
    });
    setModal("task");
  }

  async function saveTask() {
    const isActionTask = tab === "aufgaben" || taskForm.item_type === "task" || taskForm.task_type === "task";
    const site = sites.find((item) => item.id === taskForm.work_site_id);
    const customer = findCustomerByValue(customerList, taskForm.customer_id) || customerList.find((item) => customerLabel(item) === site?.customer_name);
    const customerIdForDb = isUuid(taskForm.customer_id) ? taskForm.customer_id : isUuid(site?.customer_id) ? site?.customer_id : null;
    const customerNameForDb = customerLabel(customer) || site?.customer_name || taskForm.customer_name || null;

    if (isActionTask) {
      const taskDate = taskForm.due_date || taskForm.task_date || today;
      const payload = {
        title: taskForm.title,
        task_date: taskDate,
        due_date: taskDate,
        start_time: null,
        end_time: null,
        planned_minutes: 0,
        max_minutes: 0,
        employee_name: taskForm.employee_name || null,
        customer_id: customerIdForDb,
        customer_name: customerNameForDb,
        site: site?.name || taskForm.site || null,
        work_site_id: taskForm.work_site_id || null,
        priority: taskForm.priority || "Mittel",
        task_category: taskForm.task_category || "Sonstiges",
        status: taskForm.status || "open",
        notes: taskForm.notes || null,
        done: taskForm.status === "done" || taskForm.done === true,
        notify_employee: taskForm.notify_employee !== false,
        item_type: "task",
        task_type: "task",
        schedule_type: "once",
      };
      await insertOrUpdate("tasks", taskForm.id, payload);
      return;
    }

    const plannedDates = taskForm.id || taskForm.repeat_mode !== "repeat" ? [dateOnly(taskForm.task_date || today)] : buildScheduleDates(taskForm);
    const absenceConflict = findBlockingAbsence(absences, taskForm.employee_name, plannedDates);
    if (absenceConflict) {
      setMessage(`${taskForm.employee_name} ist am ${dateText(absenceConflict.start_date)} bis ${dateText(absenceConflict.end_date || absenceConflict.start_date)} als ${absenceConflict.absence_type || "abwesend"} eingetragen. Einsatz wurde nicht gespeichert.`);
      return;
    }

    const scheduleConflict = findScheduleConflict(assignmentRows, taskForm, plannedDates);
    if (scheduleConflict) {
      setMessage(`${taskForm.employee_name} hat am ${dateText(scheduleConflict.task_date)} bereits einen Einsatz von ${scheduleConflict.start_time || "--:--"} bis ${scheduleConflict.end_time || "--:--"}. Einsatz wurde nicht gespeichert.`);
      return;
    }

        const plannedMinutes = Number(taskForm.planned_minutes || 0);
    if (!taskForm.work_site_id) {
      setMessage("Bitte Objekt / Standort auswählen.");
      return;
    }
    if (!String(taskForm.title || "").trim()) {
      setMessage("Bitte Auftrag / Leistung eintragen.");
      return;
    }
    if (!Number.isFinite(plannedMinutes) || plannedMinutes <= 0) {
      setMessage("Bitte Planzeit in Minuten eintragen. Von/Bis ist nur das Einstempel-Zeitfenster.");
      return;
    }

const basePayload = {
      title: taskForm.title,
      start_time: taskForm.start_time,
      end_time: taskForm.end_time,
      planned_minutes: plannedMinutes,
      max_minutes: plannedMinutes,
      paid_minutes: paidMinutesFromForm(taskForm),
      wage_minutes: paidMinutesFromForm(taskForm),
      employee_name: taskForm.employee_name || null,
      customer_id: customerIdForDb,
      customer_name: customerNameForDb,
      site: site?.name || taskForm.site,
      work_site_id: taskForm.work_site_id || null,
      priority: "Normal",
      task_category: "Einsatz",
      status: "open",
      notes: taskForm.notes || null,
      done: false,
      travel_minutes: Number(taskForm.travel_minutes || 0),
      break_minutes: Number(taskForm.break_minutes || 0),
      notify_employee: taskForm.notify_employee !== false,
      item_type: "einsatz",
      task_type: "einsatz",
      schedule_type: taskForm.repeat_mode === "repeat" ? "repeat" : "once",
      recurrence_interval: Number(taskForm.recurrence_interval || 1),
      recurrence_unit: taskForm.recurrence_unit || "week",
      recurrence_days: Array.isArray(taskForm.recurrence_days) ? taskForm.recurrence_days : [],
      recurrence_end_date: taskForm.repeat_mode === "repeat" ? taskForm.recurrence_end_date || null : null,
    };

    if (taskForm.id || taskForm.repeat_mode !== "repeat") {
      await insertOrUpdate("tasks", taskForm.id, { ...basePayload, task_date: taskForm.task_date, due_date: taskForm.task_date });
      return;
    }

    const dates = plannedDates;
    const recurrenceGroupId = crypto.randomUUID();
    setSaving(true);
    setMessage("");
    try {
      await adminCall({
        action: "insert",
        table: "tasks",
        payload: dates.map((date) => ({
          ...basePayload,
          task_date: date,
          due_date: date,
          recurrence_group_id: recurrenceGroupId,
        })),
      });
      setMessage(`${dates.length} Einsatz/Einsätze gespeichert.`);
      if (taskForm.create_another) {
        setTaskForm((old: any) => ({ ...createEmptyTaskForm("einsatz"), customer_id: old.customer_id, customer_name: old.customer_name, work_site_id: old.work_site_id, site: old.site, employee_name: old.employee_name }));
      } else {
        setModal(null);
      }
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einsätze konnten nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function reassignTask(row: Row, employeeName: string) {
    const nextEmployee = String(employeeName || "").trim();
    const taskDate = dateOnly(row.task_date || row.due_date || today);

    if (!row.id) {
      setMessage("Einsatz konnte nicht verschoben werden: Einsatz-ID fehlt.");
      return;
    }

    if (nextEmployee) {
      const absenceConflict = findBlockingAbsence(absences, nextEmployee, [taskDate]);
      if (absenceConflict) {
        setMessage(`${nextEmployee} ist am ${dateText(absenceConflict.start_date)} bis ${dateText(absenceConflict.end_date || absenceConflict.start_date)} als ${absenceConflict.absence_type || "abwesend"} eingetragen. Einsatz wurde nicht verschoben.`);
        return;
      }

      const scheduleConflict = findScheduleConflict(assignmentRows, { ...row, employee_name: nextEmployee }, [taskDate]);
      if (scheduleConflict) {
        setMessage(`${nextEmployee} hat am ${dateText(scheduleConflict.task_date)} bereits einen Einsatz von ${scheduleConflict.start_time || "--:--"} bis ${scheduleConflict.end_time || "--:--"}. Einsatz wurde nicht verschoben.`);
        return;
      }
    }

    setSaving(true);
    setMessage("");
    try {
      await adminCall({
        action: "update",
        table: "tasks",
        id: row.id,
        payload: {
          employee_name: nextEmployee || null,
        },
      });
      setMessage(nextEmployee ? `Einsatz wurde auf ${nextEmployee} verschoben.` : "Einsatz wurde auf ungeplant gesetzt.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einsatz konnte nicht verschoben werden.");
    } finally {
      setSaving(false);
    }
  }

  function openMaterial(row?: Row) {
    setMaterialForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      category: String(row.category || ""),
      unit: String(row.unit || "Stück"),
      current_stock: String(row.current_stock ?? "0"),
      min_stock: String(row.min_stock ?? "0"),
      supplier: String(row.supplier || ""),
      work_site_id: String(row.work_site_id || ""),
      object_name: String(row.object_name || ""),
      image_url: String(row.image_url || ""),
      notes: String(row.notes || ""),
    } : emptyMaterial);
    setModal("material");
  }

  async function saveMaterial() {
    const site = sites.find((item) => item.id === materialForm.work_site_id);
    await insertOrUpdate("material_products", materialForm.id, {
      name: materialForm.name,
      category: materialForm.category || null,
      unit: materialForm.unit || "Stück",
      current_stock: Number(materialForm.current_stock || 0),
      min_stock: Number(materialForm.min_stock || 0),
      supplier: materialForm.supplier || null,
      work_site_id: materialForm.work_site_id || null,
      object_name: site?.name || materialForm.object_name || null,
      image_url: materialForm.image_url || null,
      notes: materialForm.notes || null,
    });
  }

  async function resolveMaterialReport(row: Row) {
    await insertOrUpdate("material_reports", row.id, { status: "done", resolved_at: new Date().toISOString() });
  }

  function openDevice(row?: Row) {
    setDeviceForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      category: String(row.category || ""),
      serial_number: String(row.serial_number || ""),
      assigned_to: String(row.assigned_to || ""),
      status: String(row.status || "Aktiv"),
      image_url: String(row.image_url || ""),
      notes: String(row.notes || ""),
    } : emptyDevice);
    setModal("device");
  }

  async function saveDevice() {
    await insertOrUpdate("equipment_items", deviceForm.id, {
      name: deviceForm.name,
      category: deviceForm.category || null,
      serial_number: deviceForm.serial_number || null,
      assigned_to: deviceForm.assigned_to || null,
      status: deviceForm.status,
      image_url: deviceForm.image_url || null,
      notes: deviceForm.notes || null,
    });
  }

  function openKey(row?: Row) {
    const linkedSite = sites.find((site) => site.id === row?.work_site_id || site.name === row?.object_name);
    const linkedCustomer = findCustomerByValue(customerList, String(row?.customer_id || row?.customer_name || linkedSite?.customer_id || linkedSite?.customer_name || ""));
    setKeyForm(row ? {
      id: String(row.id || ""),
      key_name: String(row.key_name || ""),
      key_number: String(row.key_number || ""),
      customer_id: String(row.customer_id || linkedCustomer?.id || linkedSite?.customer_id || ""),
      customer_name: String(row.customer_name || customerLabel(linkedCustomer) || linkedSite?.customer_name || ""),
      customer_address: String(row.customer_address || customerAddress(linkedCustomer) || linkedSite?.customer_address || ""),
      work_site_id: String(row.work_site_id || linkedSite?.id || ""),
      object_name: String(row.object_name || linkedSite?.name || ""),
      object_address: String(row.object_address || linkedSite?.address || ""),
      employee_name: String(row.employee_name || ""),
      status: String(row.status || "Ausgegeben"),
      handover_date: String(row.handover_date || today),
      return_date: String(row.return_date || ""),
      notes: String(row.notes || ""),
    } : emptyKey);
    setModal("key");
  }

  async function saveKey() {
    const site = sites.find((item) => item.id === keyForm.work_site_id || item.name === keyForm.object_name);
    const customer = findCustomerByValue(customerList, keyForm.customer_id || keyForm.customer_name || site?.customer_id || site?.customer_name || "");
    const customerName = customerLabel(customer) || keyForm.customer_name || String(site?.customer_name || "").trim() || null;
    const customerAddr = customerAddress(customer) || keyForm.customer_address || String(site?.customer_address || "").trim() || null;

    await insertOrUpdate("key_items", keyForm.id, {
      key_name: keyForm.key_name,
      key_number: keyForm.key_number || null,
      customer_id: isUuid(keyForm.customer_id) ? keyForm.customer_id : customer && isUuid(customer.id) ? customer.id : null,
      customer_name: customerName,
      customer_address: customerAddr,
      work_site_id: keyForm.work_site_id || site?.id || null,
      object_name: site?.name || keyForm.object_name || null,
      object_address: site?.address || keyForm.object_address || null,
      employee_name: keyForm.employee_name || null,
      status: keyForm.status,
      handover_date: keyForm.handover_date || null,
      return_date: keyForm.return_date || null,
      notes: keyForm.notes || null,
    });
  }

  function createKeyPdf(row: Row) {
    const site = sites.find((item) => item.id === row.work_site_id || item.name === row.object_name);
    const customer = findCustomerByValue(customerList, String(row.customer_id || row.customer_name || site?.customer_id || site?.customer_name || ""));
    const customerName = customerLabel(customer) || String(row.customer_name || site?.customer_name || "").trim();
    const customerAddr = customerAddress(customer) || String(row.customer_address || site?.customer_address || site?.address || row.object_address || "").trim();
    const customerAndAddress = [customerName, customerAddr].filter(Boolean).join(", ");

    printKeyHandoverPdf({
      employeeName: String(row.employee_name || "-"),
      customerAndAddress: customerAndAddress || "-",
      keyAmount: String(row.key_name || "-"),
      keyNumber: String(row.key_number || "-"),
    });
  }

  function openAbsence(row?: Row) {
    setAbsenceForm(row ? {
      id: String(row.id || ""),
      employee_name: String(row.employee_name || ""),
      absence_type: String(row.absence_type || "Urlaub"),
      start_date: String(row.start_date || today),
      end_date: String(row.end_date || today),
      reason: String(row.reason || ""),
      status: String(row.status || "open"),
    } : emptyAbsence);
    setModal("absence");
  }

  async function saveAbsence() {
    await insertOrUpdate("absence_requests", absenceForm.id, {
      employee_name: absenceForm.employee_name,
      absence_type: absenceForm.absence_type,
      start_date: absenceForm.start_date,
      end_date: absenceForm.end_date,
      reason: absenceForm.reason || null,
      status: absenceForm.status,
    });
  }

  async function decideAbsence(row: Row, status: string) {
    const approved = status === "approved";
    const label = approved ? "genehmigt" : "abgelehnt";
    const employeeName = String(row.employee_name || "").trim();
    const type = String(row.absence_type || "Abwesenheit").trim();
    const period = `${dateText(row.start_date)} bis ${dateText(row.end_date)}`;
    const title = approved ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt";
    const messageText = `Dein Antrag ${type} vom ${period} wurde ${label}.`;

    setSaving(true);
    setMessage("");
    try {
      await adminCall({
        action: "update",
        table: "absence_requests",
        id: row.id,
        payload: {
          status,
          decided_at: new Date().toISOString(),
          admin_response: approved ? "Genehmigt" : "Abgelehnt",
        },
      });

      if (approved && employeeName) {
        const absenceDates = dateRangeInclusive(row.start_date, row.end_date || row.start_date);
        const existingAbsenceEntries = entries.filter((entry: Row) => String(entry.absence_request_id || "") === String(row.id || ""));
        const payload = absenceDates
          .filter((date) => !existingAbsenceEntries.some((entry: Row) => dateOnly(entry.work_date || entry.created_at) === date))
          .map((date) => {
            const plannedMinutes = plannedMinutesForEmployeeDate(assignmentRows, employeeName, date);
            const payrollMinutes = isUnpaidAbsence(row) ? 0 : plannedMinutes;
            return {
              employee_name: employeeName,
              work_date: date,
              absence_request_id: row.id,
              entry_type: "absence",
              absence_type: type,
              action: "absence",
              status: "approved",
              approved: true,
              planned_minutes: plannedMinutes,
              worked_minutes: 0,
              payroll_minutes: payrollMinutes,
              reason: isUnpaidAbsence(row) ? "Unbezahlt Frei" : type,
              notes: `${type}: ${payrollMinutes > 0 ? "Planzeit gutgeschrieben" : "0:00 Stunden gutgeschrieben"}`,
            };
          });

        if (payload.length > 0) {
          await adminCall({
            action: "insert",
            table: "time_entries",
            payload,
          });
        }
      }

      if (!approved && row.id) {
        const existingAbsenceEntries = entries.filter((entry: Row) => String(entry.absence_request_id || "") === String(row.id || ""));
        for (const entry of existingAbsenceEntries) {
          await adminCall({
            action: "update",
            table: "time_entries",
            id: entry.id,
            payload: {
              status: "rejected",
              approved: false,
              payroll_minutes: 0,
              worked_minutes: 0,
            },
          });
        }
      }

      if (employeeName) {
        await adminCall({
          action: "insert",
          table: "admin_notifications",
          payload: [{
            employee_name: employeeName,
            title,
            message: messageText,
            notification_type: "absence_decision",
            status: approved ? "approved" : "rejected",
            absence_request_id: row.id,
          }],
        });

        await adminCall({
          action: "insert",
          table: "chat_messages",
          payload: [{
            employee_name: employeeName,
            sender_role: "admin",
            sender_name: "Admin",
            message: messageText,
            read_by_admin: true,
            read_by_employee: false,
          }],
        });
      }

      setMessage(`Abwesenheit ${label}. Mitarbeiter wurde benachrichtigt.`);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Abwesenheit konnte nicht bearbeitet werden.");
    } finally {
      setSaving(false);
    }
  }

  function openTimeCorrection(row?: Row) {
    const startText = String(row?.start_time || row?.check_in_at || "").slice(11, 16) || "08:00";
    const endText = String(row?.end_time || row?.check_out_at || "").slice(11, 16) || "10:00";
    setTimeCorrectionForm(row ? {
      id: String(row.id || ""),
      employee_name: String(row.employee_name || ""),
      work_date: String(dateOnly(row.work_date || row.check_in_at || row.created_at) || today),
      start_time: startText === "T" ? "08:00" : startText,
      end_time: endText === "T" ? "10:00" : endText,
      site: String(row.site || row.work_site || row.work_site_name || ""),
      work_site_id: String(row.work_site_id || ""),
      reason: String(row.reason || "Manuelle Korrektur"),
      notes: String(row.notes || ""),
      approved: row.approved !== false,
    } : emptyTimeCorrection);
    setModal("timeCorrection");
  }

  async function saveTimeCorrection() {
    const startMinutes = timeToMinutes(timeCorrectionForm.start_time);
    const endMinutes = timeToMinutes(timeCorrectionForm.end_time);
    if (startMinutes === null || endMinutes === null) {
      setMessage("Bitte Start und Ende eintragen.");
      return;
    }

    let duration = endMinutes - startMinutes;
    if (duration < 0) duration += 1440;
    if (duration <= 0) {
      setMessage("Die Zeitkorrektur muss größer als 0 Minuten sein.");
      return;
    }

    const site = sites.find((item) => item.id === timeCorrectionForm.work_site_id || item.name === timeCorrectionForm.site);
    const checkIn = new Date(`${timeCorrectionForm.work_date}T${timeCorrectionForm.start_time}:00`);
    const checkOut = new Date(`${timeCorrectionForm.work_date}T${timeCorrectionForm.end_time}:00`);
    if (checkOut.getTime() < checkIn.getTime()) checkOut.setDate(checkOut.getDate() + 1);

    await insertOrUpdate("time_entries", timeCorrectionForm.id, {
      employee_name: timeCorrectionForm.employee_name,
      work_date: timeCorrectionForm.work_date,
      check_in_at: checkIn.toISOString(),
      check_out_at: checkOut.toISOString(),
      site: site?.name || timeCorrectionForm.site || null,
      work_site_name: site?.name || timeCorrectionForm.site || null,
      work_site_id: site?.id || timeCorrectionForm.work_site_id || null,
      action: "manual",
      entry_type: "manual",
      reason: timeCorrectionForm.reason || "Manuelle Korrektur",
      notes: timeCorrectionForm.notes || null,
      planned_minutes: duration,
      worked_minutes: duration,
      payroll_minutes: duration,
      approved: Boolean(timeCorrectionForm.approved),
      status: timeCorrectionForm.approved ? "approved" : "open",
    });
  }

  async function approveEntry(row: Row, approved: boolean) {
    await insertOrUpdate("time_entries", row.id, { approved, status: approved ? "approved" : "rejected" });
  }

  async function decideAdminNotification(note: Row, approved: boolean) {
    setSaving(true);
    setMessage("");

    try {
      const isOvertime = note.notification_type === "overtime_request";
      const overtimeMinutes = Math.max(0, Number(note.overtime_minutes || 0));
      const status = approved ? "approved" : "rejected";
      const nowIso = new Date().toISOString();

      if (isOvertime && approved && note.task_id && overtimeMinutes > 0) {
        const task = tasks.find((item) => item.id === note.task_id);
        const currentMax = Number(task?.max_minutes || task?.planned_minutes || 0);
        const alreadyApproved = Number(task?.approved_overtime_minutes || 0);

        await adminCall({
          action: "update",
          table: "tasks",
          id: note.task_id,
          payload: {
            approved_overtime_minutes: alreadyApproved + overtimeMinutes,
            max_minutes: currentMax + overtimeMinutes,
            overtime_status: "approved",
          },
        });
      }

      if (isOvertime && !approved && note.task_id) {
        await adminCall({
          action: "update",
          table: "tasks",
          id: note.task_id,
          payload: { overtime_status: "rejected" },
        });
      }

      await adminCall({
        action: "update",
        table: "admin_notifications",
        id: note.id,
        payload: {
          status,
          resolved_at: nowIso,
          admin_response: approved ? "Genehmigt" : "Abgelehnt",
          title: isOvertime ? (approved ? "Überstunden genehmigt" : "Überstunden abgelehnt") : note.title,
          message: isOvertime
            ? approved
              ? `Ich habe ${overtimeMinutes} Minuten Überstunden für ${note.site || "den Einsatz"} genehmigt.`
              : `Ich habe die Überstundenanfrage für ${note.site || "den Einsatz"} abgelehnt.`
            : note.message,
        },
      });

      if (isOvertime) {
        await adminCall({
          action: "insert",
          table: "chat_messages",
          payload: [{
            employee_name: note.employee_name,
            sender_role: "admin",
            sender_name: "Admin",
            message: approved
              ? `Überstunden genehmigt: ${overtimeMinutes} Minuten für ${note.site || "deinen Einsatz"}.`
              : `Überstunden abgelehnt für ${note.site || "deinen Einsatz"}. Bitte Einsatz beenden oder kurz melden.`,
            read_by_admin: true,
            read_by_employee: false,
          }],
        });
      }

      setMessage(isOvertime ? (approved ? "Überstunden genehmigt." : "Überstunden abgelehnt.") : "Meldung erledigt.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Meldung konnte nicht bearbeitet werden.");
    } finally {
      setSaving(false);
    }
  }

  async function closeAdminNotification(note: Row) {
    await insertOrUpdate("admin_notifications", note.id, {
      status: "done",
      resolved_at: new Date().toISOString(),
      admin_response: "Erledigt",
    });
  }

  async function sendChat() {
    if (!chatEmployee || !chatText.trim()) {
      setMessage("Bitte Mitarbeiter und Nachricht auswählen.");
      return;
    }
    await insertOrUpdate("chat_messages", "", {
      employee_name: chatEmployee,
      sender_role: "admin",
      sender_name: "Admin",
      message: chatText.trim(),
      read_by_admin: true,
      read_by_employee: false,
    });
    setChatText("");
    await loadChat(chatEmployee);
  }

  async function loadChat(employeeName: string) {
    setChatEmployee(employeeName);
    try {
      const json = await adminCall({ action: "select", table: "chat_messages", orderBy: "created_at", ascending: true, filters: { employee_name: employeeName } });
      setChatMessages(json.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chat konnte nicht geladen werden.");
    }
  }

  const workedMinutes = entries.reduce((sum, item) => sum + Number(item.worked_minutes || item.planned_minutes || 0), 0);
  const openTasks = tasks.filter((item) => !item.done).length;
  const openAbsences = absences.filter((item) => !item.status || item.status === "open").length;
  const lowStock = materials.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0)).length;
  const openMaterialReports = materialReports.filter((item) => !item.status || item.status === "open").length;
  function canCreateInTab(tabName: Tab) {
    if (isAdminRole) return true;
    if (isObjectLeaderRole) {
      return ["planung", "aufgaben", "meldungen", "material", "zeiten", "abwesenheiten", "chat"].includes(tabName);
    }
    return false;
  }

  const currentNav = visibleNavItems.find((item) => item.id === tab) || visibleNavItems[0] || navItems[0];
  const createButtonLabel = getCreateButtonLabel(tab);
  const canUsePrimaryAction = canCreateInTab(tab);

  function runPrimaryAction() {
    if (!canUsePrimaryAction) {
      setMessage("Für diese Aktion fehlt der Zugriff.");
      return;
    }
    if (tab === "mitarbeiter") return openEmployee();
    if (tab === "kunden") return openCustomer();
    if (tab === "kontakte") return openContact();
    if (tab === "objekte") return openSite();
    if (tab === "planung" || tab === "aufgaben") return openTask();
    if (tab === "meldungen") return loadAll();
    if (tab === "material") return openMaterial();
    if (tab === "geraete") return openDevice();
    if (tab === "schluessel") return openKey();
    if (tab === "abwesenheiten") return openAbsence();
    if (tab === "chat") {
      setMessage("Wähle links im Chat zuerst einen Mitarbeiter aus und schreibe dann deine Nachricht.");
      return;
    }
    return openTask();
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 font-bold text-slate-700">Lade Adminbereich...</main>;
  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black text-slate-950">Kein Zugriff</h1>
          <p className="mt-2 text-slate-500">Dieser Bereich ist nur für Administratoren sichtbar.</p>
          {message && <p className="mt-4 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-sm lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src="/logo.png" alt="CleanTrack" className="h-12 w-12 rounded-2xl object-contain ring-1 ring-slate-200" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">CleanTrack</p>
            <h1 className="truncate text-lg font-black text-slate-950">Verwaltung</h1>
            <p className="truncate text-xs font-semibold text-slate-400">Matteo Stano Clean</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                tab === item.id
                  ? "flex w-full items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-left text-sm font-black text-white shadow-sm"
                  : "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }
            >
              <span className={tab === item.id ? "flex h-8 w-8 items-center justify-center rounded-xl bg-white/20" : "flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100"}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-5 rounded-3xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-bold text-slate-300">Heute</p>
          <p className="mt-1 text-2xl font-black">{openTasks}</p>
          <p className="text-xs font-semibold text-slate-300">offene Aufgaben</p>
          <button type="button" onClick={() => setTab("aufgaben")} className="mt-4 w-full rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-950 hover:bg-blue-50">
            Aufgaben öffnen
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="CleanTrack" className="h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Admin</p>
                <h1 className="font-black text-slate-950">{currentNav.label}</h1>
              </div>
            </div>
            <button type="button" onClick={runPrimaryAction} disabled={!canUsePrimaryAction} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {createButtonLabel}
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-400 lg:hidden">Navigation läuft über die linke Seitenleiste am Desktop.</p>
        </div>

        <header className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white/95 px-8 py-5 shadow-sm backdrop-blur lg:block">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-blue-600">
                <span>{currentNav.icon}</span>
                <span>Adminbereich</span>
              </div>
              <h2 className="truncate text-3xl font-black tracking-tight text-slate-950">{currentNav.label}</h2>
            </div>
            <div className="flex items-center gap-3">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-80 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Suchen..." />
              <button type="button" onClick={loadAll} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
                Aktualisieren
              </button>
              <button type="button" onClick={runPrimaryAction} disabled={!canUsePrimaryAction} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {createButtonLabel}
              </button>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
          {message && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 font-bold text-blue-800">{message}</div>}

          {tab === "dashboard" && <Dashboard employees={activeEmployees} sites={sites} tasks={tasks} entries={entries} lowStock={lowStock} openMaterialReports={openMaterialReports} openNotifications={adminNotifications.filter((item: Row) => !item.status || item.status === "open").length} openAbsences={openAbsences} workedMinutes={workedMinutes} setTab={setTab} />}
          {tab === "planung" && <Planning tasks={filtered.assignments} employees={activeEmployees} sites={sites} customers={customerList} absences={absences} openTask={openTask} editTask={openTask} reassignTask={reassignTask} deleteTask={(row: Row) => removeRow("tasks", row.id, "Einsatz")} />}
          {tab === "mitarbeiter" && <Employees rows={filtered.employees} entries={entries} absences={absences} tasks={tasks} openCreate={() => openEmployee()} openEdit={openEmployee} activate={(row: Row) => setEmployeeActive(row, true)} deactivate={(row: Row) => setEmployeeActive(row, false)} exportRows={() => downloadCsv("mitarbeiter.csv", employees)} />}
          {tab === "kunden" && <Customers rows={filtered.customers} sites={sites} openCreate={() => openCustomer()} openEdit={openCustomer} deleteRow={(row: Row) => removeRow("customers", row.id, "Kunde")} exportRows={() => downloadCsv("kunden.csv", customerList)} />}
          {tab === "kontakte" && <Contacts rows={filtered.contacts} openCreate={() => openContact()} openEdit={openContact} deleteRow={(row: Row) => removeRow("customer_contacts", row.id, "Kontakt")} exportRows={() => downloadCsv("kontakte.csv", contacts)} />}
          {tab === "objekte" && <Sites rows={filtered.sites} openCreate={() => openSite()} openEdit={openSite} deleteRow={(row: Row) => removeRow("work_sites", row.id, "Objekt")} exportRows={() => downloadCsv("objekte.csv", sites)} />}
          {tab === "aufgaben" && <Tasks rows={filtered.actionTasks} openCreate={() => openTask()} openEdit={openTask} deleteRow={(row: Row) => removeRow("tasks", row.id, "Aufgabe")} exportRows={() => downloadCsv("aufgaben.csv", actionTaskRows)} />}
          {tab === "meldungen" && <Meldungen notifications={filtered.adminNotifications} materialReports={filtered.materialReports} absences={filtered.absences} entries={filtered.entries} setTab={setTab} resolveReport={resolveMaterialReport} decideAbsence={decideAbsence} decideNotification={decideAdminNotification} closeNotification={closeAdminNotification} />}
          {tab === "material" && <Materials rows={filtered.materials} reports={filtered.materialReports} sites={sites} openCreate={() => openMaterial()} openEdit={openMaterial} deleteRow={(row: Row) => removeRow("material_products", row.id, "Material")} resolveReport={resolveMaterialReport} onExport={() => downloadCsv("material.csv", materials)} />}
          {tab === "geraete" && <Devices rows={filtered.devices} openCreate={() => openDevice()} openEdit={openDevice} deleteRow={(row: Row) => removeRow("equipment_items", row.id, "Gerät")} exportRows={() => downloadCsv("geraete.csv", devices)} />}
          {tab === "schluessel" && <Keys rows={filtered.keys} openCreate={() => openKey()} openEdit={openKey} deleteRow={(row: Row) => removeRow("key_items", row.id, "Schlüssel")} pdf={createKeyPdf} exportRows={() => downloadCsv("schluessel.csv", keys)} />}
          {tab === "zeiten" && <Times rows={filtered.entries} employees={employees} tasks={assignmentRows} absences={absences} notifications={filtered.adminNotifications} approve={approveEntry} decideNotification={decideAdminNotification} closeNotification={closeAdminNotification} openCorrection={openTimeCorrection} exportRows={() => downloadCsv("zeiten.csv", entries)} />}
          {tab === "abwesenheiten" && <Absences rows={filtered.absences} openCreate={() => openAbsence()} openEdit={openAbsence} deleteRow={(row: Row) => removeRow("absence_requests", row.id, "Abwesenheit")} decide={decideAbsence} />}
          {tab === "chat" && <Chat employees={activeEmployees} employee={chatEmployee} setEmployee={loadChat} messages={chatMessages} text={chatText} setText={setChatText} send={sendChat} />}
        </section>
      </div>

      {modal === "employeeInvite" && <EmployeeInviteModal close={() => setModal(null)} form={employeeInvite} setForm={setEmployeeInvite} save={createEmployeeInvite} saving={saving} inviteLink={inviteLink} whatsappLink={whatsappLink} />}
      {modal === "employeeEdit" && <EmployeeEditModal close={() => setModal(null)} form={employeeEdit} setForm={setEmployeeEdit} save={saveEmployee} saving={saving} />}
      {modal === "customer" && <CustomerModal close={() => setModal(null)} form={customerForm} setForm={setCustomerForm} save={saveCustomer} saving={saving} />}
      {modal === "contact" && <ContactModal close={() => setModal(null)} form={contactForm} setForm={setContactForm} save={saveContact} saving={saving} />}
      {modal === "site" && <SiteModal close={() => setModal(null)} form={siteForm} setForm={setSiteForm} save={saveSite} saving={saving} customers={customerList} geocode={geocodeSiteAddress} geocoding={geocoding} />}
      {modal === "task" && <TaskModal close={() => setModal(null)} form={taskForm} setForm={setTaskForm} save={saveTask} saving={saving} employees={activeEmployees} customers={customerList} sites={sites} mode={tab === "aufgaben" ? "task" : "einsatz"} assignments={assignmentRows} absences={absences} />}
      {modal === "material" && <MaterialModal close={() => setModal(null)} form={materialForm} setForm={setMaterialForm} save={saveMaterial} saving={saving} sites={sites} />}
      {modal === "device" && <DeviceModal close={() => setModal(null)} form={deviceForm} setForm={setDeviceForm} save={saveDevice} saving={saving} employees={activeEmployees} />}
      {modal === "key" && <KeyModal close={() => setModal(null)} form={keyForm} setForm={setKeyForm} save={saveKey} saving={saving} employees={activeEmployees} sites={sites} customers={customerList} />}
      {modal === "absence" && <AbsenceModal close={() => setModal(null)} form={absenceForm} setForm={setAbsenceForm} save={saveAbsence} saving={saving} employees={activeEmployees} />}
      {modal === "timeCorrection" && <TimeCorrectionModal close={() => setModal(null)} form={timeCorrectionForm} setForm={setTimeCorrectionForm} save={saveTimeCorrection} saving={saving} employees={activeEmployees} sites={sites} />}
    </main>
  );
}

const navItems: { id: Tab; icon: string; label: string }[] = [
  { id: "dashboard", icon: "●", label: "Übersicht" },
  { id: "planung", icon: "▦", label: "Einsatzplan" },
  { id: "mitarbeiter", icon: "👥", label: "Mitarbeiter" },
  { id: "kunden", icon: "🏷", label: "Kunden" },
  { id: "kontakte", icon: "☎", label: "Kontakte" },
  { id: "objekte", icon: "🏢", label: "Objekte" },
  { id: "aufgaben", icon: "✓", label: "Aufgaben" },
  { id: "meldungen", icon: "🔔", label: "Meldungen" },
  { id: "material", icon: "📦", label: "Material" },
  { id: "geraete", icon: "🔧", label: "Geräte" },
  { id: "schluessel", icon: "🔑", label: "Schlüssel" },
  { id: "zeiten", icon: "⏱", label: "Zeiten" },
  { id: "abwesenheiten", icon: "✈", label: "Abwesenheiten" },
  { id: "chat", icon: "💬", label: "Chat" },
];

function getCreateButtonLabel(tab: Tab) {
  if (tab === "dashboard") return "+ Einsatz";
  if (tab === "planung") return "+ Einsatz";
  if (tab === "aufgaben") return "+ Aufgabe";
  if (tab === "meldungen") return "Aktualisieren";
  if (tab === "mitarbeiter") return "+ Mitarbeiter";
  if (tab === "kunden") return "+ Kunde";
  if (tab === "kontakte") return "+ Kontakt";
  if (tab === "objekte") return "+ Objekt";
  if (tab === "material") return "+ Material";
  if (tab === "geraete") return "+ Gerät";
  if (tab === "schluessel") return "+ Schlüssel";
  if (tab === "abwesenheiten") return "+ Abwesenheit";
  if (tab === "chat") return "Nachricht";
  return "+ Neu";
}

function filterRows(rows: Row[], query: string) {
  if (!query) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
}

function customerRowsFromSites(sites: Row[]) {
  const map = new Map<string, Row>();
  sites.forEach((site) => {
    const name = String(site.customer_name || site.customer || "").trim();
    const address = String(site.customer_address || "").trim();
    if (!name && !address) return;
    const key = String(site.customer_id || name || address).trim();
    if (!map.has(key)) {
      map.set(key, {
        id: isUuid(site.customer_id) ? site.customer_id : key,
        name: name || "",
        customer_name: name || "",
        address,
        customer_address: address,
        phone: site.customer_phone || "",
        email: site.customer_email || "",
        notes: site.customer_notes || "",
        object_count: 0,
      });
    }
    const existing = map.get(key)!;
    existing.object_count += 1;
    if (!existing.address && address) existing.address = address;
    if (!existing.customer_address && address) existing.customer_address = address;
  });
  return Array.from(map.values());
}


function PageHeader({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-black text-blue-700">{icon}</div>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Button({ children, onClick, primary = false, danger = false, type = "button", disabled = false }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; type?: "button" | "submit"; disabled?: boolean }) {
  const cls = danger
    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
    : primary
      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return <button type={type} onClick={onClick} disabled={disabled} className={`rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}>{children}</button>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Table({ headers, children, min = "900px" }: { headers: string[]; children: React.ReactNode; min?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead className="bg-slate-50 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="border-b border-slate-200 px-4 py-3 text-left font-black">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ text = "Noch keine Daten hinterlegt" }: { text?: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center text-center text-slate-400">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">×</div>
      <p className="font-bold text-slate-700">{text}</p>
      <p className="text-sm">Klicke oben auf „Neu“, um zu starten.</p>
    </div>
  );
}

function Status({ children, color = "green" }: { children: React.ReactNode; color?: "green" | "blue" | "yellow" | "red" | "gray" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-black ${colors[color]}`}>{children}</span>;
}

function Dashboard(p: any) {
  return (
    <div>
      <PageHeader icon="●" title="Übersicht" sub="Heute startklar machen" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Aktive Mitarbeiter" value={p.employees.length} hint="mit Login verbunden" />
        <Metric title="Offene Aufgaben" value={p.openTasks ?? p.tasks.filter((x: Row) => !x.done).length} hint="noch zu erledigen" />
        <Metric title="Arbeitszeit" value={`${prettyHours(p.workedMinutes)} Std.`} hint="erfasster Zeitraum" />
        <Metric title="Material prüfen" value={p.lowStock} hint="unter Mindestbestand" />
        <Metric title="Offene Meldungen" value={(p.openMaterialReports || 0) + (p.openNotifications || 0) + (p.openAbsences || 0)} hint="bitte prüfen" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="p-5">
          <h3 className="mb-4 font-black">Schnellstart</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Quick title="Mitarbeiter anlegen" text="Einladung erstellen und Link versenden." onClick={() => p.setTab("mitarbeiter")} />
            <Quick title="Aufgabe planen" text="Einsatz für Objekt und Mitarbeiter erstellen." onClick={() => p.setTab("aufgaben")} />
            <Quick title="Meldungen prüfen" text="Material, Überstunden und Abwesenheiten zentral bearbeiten." onClick={() => p.setTab("meldungen")} />
            <Quick title="Material buchen" text="Bestände und Artikel verwalten." onClick={() => p.setTab("material")} />
            <Quick title="Schlüssel prüfen" text="Ausgabe und Rückgabe dokumentieren." onClick={() => p.setTab("schluessel")} />
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-black">Offene Hinweise</h3>
          <InfoLine label="Meldungen" value={(p.openMaterialReports || 0) + (p.openNotifications || 0)} />
          <InfoLine label="Abwesenheiten" value={p.openAbsences} />
          <InfoLine label="Aufgaben" value={p.tasks.filter((x: Row) => !x.done).length} />
          <InfoLine label="Objekte" value={p.sites.length} />
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value, hint }: { title: string; value: React.ReactNode; hint: string }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-500">{title}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></Card>;
}

function Quick({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></button>;
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0"><span className="text-slate-500">{label}</span><span className="font-black text-slate-950">{value}</span></div>;
}

function Planning(p: any) {
  const [weekStart, setWeekStart] = useState(isoDate(startOfWeekMonday()));
  const [viewMode, setViewMode] = useState<"week" | "day" | "tour">("week");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [localSearch, setLocalSearch] = useState("");

  const baseDate = startOfWeekMonday(weekStart);
  const days = Array.from({ length: viewMode === "day" ? 1 : 7 }, (_, i) => isoDate(addDays(baseDate, i)));
  const rangeLabel = `${dateText(days[0])} → ${dateText(days[days.length - 1])}`;
  const kw = weekNumber(baseDate);
  const searchText = localSearch.trim().toLowerCase();
  const planMonth = parseLocalDate(days[0]);

  const tasksInRange = p.tasks.filter((task: Row) => {
    const taskDate = dateOnly(task.task_date || task.due_date);
    const inRange = days.includes(taskDate);
    if (!inRange) return false;
    if (employeeFilter && task.employee_name !== employeeFilter) return false;
    if (siteFilter && String(task.work_site_id || "") !== siteFilter && String(task.site || "") !== siteFilter) return false;
    if (!searchText) return true;
    return JSON.stringify(task).toLowerCase().includes(searchText);
  });

  const visibleEmployees = p.employees.filter((employee: Row) => {
    if (employeeFilter && employee.name !== employeeFilter) return false;
    if (!searchText) return true;
    return String(employee.name || "").toLowerCase().includes(searchText) || tasksInRange.some((task: Row) => task.employee_name === employee.name);
  });

  const unassigned = tasksInRange.filter((task: Row) => !task.employee_name).length;
  const missingGps = p.sites.filter((site: Row) => !site.latitude || !site.longitude).length;
  const absentInRange = p.employees.filter((employee: Row) =>
    days.some((day) => {
      const absence = employeeAbsenceForDate(p.absences || [], employee.name, day);
      return Boolean(absence && absenceIsBlocking(absence));
    })
  ).length;

  function jump(offsetDays: number) {
    setWeekStart(isoDate(addDays(baseDate, offsetDays)));
  }

  function goToday() {
    setWeekStart(isoDate(startOfWeekMonday()));
  }

  function taskSite(task: Row) {
    return p.sites.find((site: Row) => site.id === task.work_site_id || site.name === task.site);
  }

  function tasksFor(employee: Row, day: string) {
    return tasksInRange
      .filter((task: Row) => task.employee_name === employee.name && dateOnly(task.task_date) === day)
      .sort((a: Row, b: Row) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
  }

  function workload(employee: Row) {
    return tasksInRange
      .filter((task: Row) => task.employee_name === employee.name)
      .reduce((sum: number, task: Row) => sum + taskDuration(task), 0);
  }

  function monthlyWorkload(employee: Row) {
    return employeePlannedMinutesForMonth(p.tasks || [], employee, planMonth);
  }

  function unassignedTasksFor(day: string) {
    return tasksInRange
      .filter((task: Row) => !task.employee_name && dateOnly(task.task_date) === day)
      .sort((a: Row, b: Row) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
  }

  const tourGroups = p.sites
    .map((site: Row) => ({ site, tasks: tasksInRange.filter((task: Row) => task.work_site_id === site.id || task.site === site.name) }))
    .filter((group: Row) => group.tasks.length > 0);

  return (
    <div>
      <PageHeader icon="▦" title="Einsatzplanung" sub="Wochenübersicht nach Mitarbeiter, Objekt und Abwesenheit.">
        <Button onClick={() => p.openTask()} primary>+ Einsatz erstellen</Button>
      </PageHeader>

      <div className="mb-4 grid gap-3 xl:grid-cols-[1.4fr_.8fr]">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => jump(viewMode === "day" ? -1 : -7)}>‹</Button>
            <Button primary onClick={goToday}>Heute</Button>
            <Button onClick={() => jump(viewMode === "day" ? 1 : 7)}>›</Button>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700">KW {kw} · {rangeLabel}</div>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(isoDate(startOfWeekMonday(e.target.value)))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} className="min-w-[260px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Suchen" />
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
              <option value="">Alle Mitarbeiter</option>
              {p.employees.map((employee: Row) => <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>)}
            </select>
            <select value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
              <option value="">Alle Objekte</option>
              {p.sites.map((site: Row) => <option key={site.id || site.name} value={site.id || site.name}>{site.name}</option>)}
            </select>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setViewMode("day")} className={`rounded-xl px-4 py-2 text-sm font-black ${viewMode === "day" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Tag</button>
            <button type="button" onClick={() => setViewMode("week")} className={`rounded-xl px-4 py-2 text-sm font-black ${viewMode === "week" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Woche</button>
            <button type="button" onClick={() => setViewMode("tour")} className={`rounded-xl px-4 py-2 text-sm font-black ${viewMode === "tour" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>Touren</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black text-slate-950">{tasksInRange.length}</p>Einsätze</div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black text-slate-950">{unassigned}</p>ohne MA</div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-black text-slate-950">{absentInRange}</p>abwesend</div>
          </div>
        </Card>
      </div>

      {missingGps > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          Bei {missingGps} Objekt(en) fehlen GPS-Daten. Für diese Einsätze ist die spätere Standortprüfung noch nicht sauber möglich.
        </div>
      )}

      {viewMode === "tour" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {tourGroups.length === 0 && <Card className="p-6"><Empty text="Keine Touren in diesem Zeitraum" /></Card>}
          {tourGroups.map((group: any) => (
            <Card key={group.site.id || group.site.name} className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-950">{group.site.name}</h3>
                  <p className="text-sm text-slate-500">{group.site.address || group.site.customer_name || "Ohne Adresse"}</p>
                </div>
                <Status color={group.site.latitude && group.site.longitude ? "green" : "yellow"}>{group.site.latitude && group.site.longitude ? "GPS" : "GPS fehlt"}</Status>
              </div>
              <div className="space-y-2">
                {group.tasks.map((task: Row) => (
                  <button key={task.id} type="button" onClick={() => p.editTask(task)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50">
                    <p className="font-black text-slate-950">{dateText(task.task_date)} · {task.start_time || "--:--"} → {task.end_time || "--:--"}</p>
                    <p className="text-sm text-slate-600">{task.employee_name || "Nicht zugewiesen"} · {task.title}</p>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[1280px]">
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `260px repeat(${days.length}, minmax(160px, 1fr))` }}>
              <div className="border-r border-slate-200 p-3 text-sm font-black text-slate-500">Mitarbeiter</div>
              {days.map((day) => <div key={day} className="border-r border-slate-200 p-3 text-center text-sm font-black text-slate-600 last:border-r-0">{dayShort(day)}</div>)}
            </div>

            {!employeeFilter && (
              <div className="grid min-h-[118px] border-b border-slate-100 bg-amber-50/60" style={{ gridTemplateColumns: `260px repeat(${days.length}, minmax(160px, 1fr))` }}>
                <div className="border-r border-amber-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white">?</div>
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">Ungeplant</p>
                      <p className="text-xs font-bold text-amber-700">Einsätze ohne Mitarbeiter</p>
                    </div>
                  </div>
                </div>
                {days.map((day) => {
                  const dayTasks = unassignedTasksFor(day);
                  return (
                    <div key={`unassigned-${day}`} className="min-h-[118px] border-r border-amber-100 p-2 last:border-r-0">
                      <div className="space-y-2">
                        {dayTasks.map((task: Row) => {
                          const site = taskSite(task);
                          return (
                            <button key={task.id} type="button" onClick={() => p.editTask(task)} className="w-full rounded-xl border border-amber-300 bg-white p-3 text-left text-xs shadow-sm hover:border-blue-300 hover:bg-blue-50">
                              <div className="mb-1 flex items-center justify-between gap-2 text-slate-500">
                                <span className="font-bold">{task.start_time || "--:--"} → {task.end_time || "--:--"}</span>
                                <span>zuweisen</span>
                              </div>
                              <p className="truncate font-black text-slate-950">{task.site || site?.name || "Ohne Objekt"}</p>
                              <p className="mt-1 inline-flex rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-700">{task.title || "Einsatz"}</p>
                              <p className="mt-2 text-[11px] font-black text-slate-500">Planzeit: {taskPlanLabel(task)}</p>
                              <ReassignSelect task={task} employees={p.employees} onChange={p.reassignTask} />
                            </button>
                          );
                        })}
                        {dayTasks.length === 0 && <div className="min-h-[38px] rounded-xl border border-dashed border-amber-200 bg-white/50" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {visibleEmployees.map((employee: Row) => {
              const weekMinutes = workload(employee);
              const monthMinutes = monthlyWorkload(employee);
              const limitMinutes = employeeMonthlyLimit(employee) * 60;
              const remainingMinutes = limitMinutes - monthMinutes;
              const usagePercent = limitMinutes > 0 ? Math.min(100, Math.round((monthMinutes / limitMinutes) * 100)) : monthMinutes > 0 ? 100 : 0;
              const freePercent = limitMinutes > 0 ? Math.max(0, 100 - usagePercent) : 0;
              const overload = limitMinutes <= 0 ? monthMinutes > 0 : monthMinutes > limitMinutes;
              return (
                <div key={employee.id || employee.name} className="grid min-h-[136px] border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: `260px repeat(${days.length}, minmax(160px, 1fr))` }}>
                  <div className="border-r border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">{initials(employee.name || "CT")}</div>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{employee.name}</p>
                        <p className="text-xs font-bold text-slate-400">{prettyHours(weekMinutes)} Std. geplant</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2" title={`Stunden für ${monthName(planMonth)}\nEingeplant: ${formatHours(monthMinutes)}\nLimit: ${limitMinutes ? formatHours(limitMinutes) : "00:00h"}\nNoch verfügbar: ${remainingMinutes >= 0 ? formatHours(remainingMinutes) : `-${formatHours(Math.abs(remainingMinutes))}`}`}>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${overload ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.max(0, usagePercent)}%` }} />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${overload ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${freePercent}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-400">
                        <span>Planzeit: {formatHours(weekMinutes)}</span>
                        <span className={remainingMinutes < 0 ? "text-red-600" : "text-emerald-600"}>{limitMinutes ? `${remainingMinutes >= 0 ? formatHours(remainingMinutes) : `-${formatHours(Math.abs(remainingMinutes))}`} frei` : "Limit fehlt"}</span>
                      </div>
                    </div>
                  </div>

                  {days.map((day) => {
                    const dayTasks = tasksFor(employee, day);
                    const absence = employeeAbsenceForDate(p.absences || [], employee.name, day);
                    const blocked = Boolean(absence && absenceIsBlocking(absence));
                    const openAbsence = Boolean(absence && absenceIsOpen(absence));
                    return (
                      <div key={`${employee.id || employee.name}-${day}`} className={`min-h-[136px] border-r border-slate-100 p-2 last:border-r-0 ${blocked ? "bg-orange-50" : openAbsence ? "bg-amber-50/60" : "bg-white"}`}>
                        {absence && (
                          <div className={`mb-2 rounded-lg px-3 py-2 text-xs font-black ${blocked ? "bg-orange-500 text-white" : "bg-amber-100 text-amber-700"}`}>
                            {absence.absence_type || "Abwesend"} · {dateText(absence.start_date)} - {dateText(absence.end_date || absence.start_date)}
                          </div>
                        )}
                        <div className="space-y-2">
                          {dayTasks.map((task: Row) => {
                            const site = taskSite(task);
                            const gpsOk = Boolean(site?.latitude && site?.longitude);
                            const conflict = blocked;
                            return (
                              <button key={task.id} type="button" onClick={() => p.editTask(task)} className={`w-full rounded-xl border bg-white p-3 text-left text-xs shadow-sm hover:border-blue-300 ${conflict ? "border-red-300 ring-1 ring-red-200" : "border-slate-200"}`}>
                                <div className="mb-1 flex items-center justify-between gap-2 text-slate-500">
                                  <span className="font-bold">{task.start_time || "--:--"} → {task.end_time || "--:--"}</span>
                                  <span>{gpsOk ? "● GPS" : "GPS fehlt"}</span>
                                </div>
                                <p className="truncate font-black text-slate-950">{task.site || site?.name || "Ohne Objekt"}</p>
                                <p className="mt-1 inline-flex rounded-lg bg-orange-100 px-2 py-1 text-[11px] font-black text-orange-700">{task.title || "Einsatz"}</p>
                                <p className="mt-2 text-[11px] font-black text-slate-500">Planzeit: {taskPlanLabel(task)}</p>
                                {conflict && <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 font-black text-red-700">Konflikt: Mitarbeiter abwesend</p>}
                                <ReassignSelect task={task} employees={p.employees} onChange={p.reassignTask} />
                              </button>
                            );
                          })}
                          {!absence && dayTasks.length === 0 && <div className="min-h-[38px] rounded-xl border border-dashed border-slate-200" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {visibleEmployees.length === 0 && <div className="p-8"><Empty text="Keine Mitarbeiter für diese Ansicht" /></div>}
          </div>
        </div>
      )}

      <div className="mt-5">
        <Table headers={["Datum", "Zeitfenster", "Kunde", "Objekt", "Mitarbeiter", "Planzeit", "Hinweis", "Aktion"]}>
          {p.tasks.length === 0 ? <tr><td colSpan={8}><Empty text="Noch keine Einsätze geplant" /></td></tr> : p.tasks.map((task: Row) => {
            const site = taskSite(task);
            const gpsOk = Boolean(site?.latitude && site?.longitude);
            const absence = employeeAbsenceForDate(p.absences || [], task.employee_name, dateOnly(task.task_date));
            const blocked = Boolean(absence && absenceIsBlocking(absence));
            return (
              <tr key={task.id} className={blocked ? "bg-red-50" : ""}>
                <td className="px-4 py-3">{dateText(task.task_date)}</td>
                <td className="px-4 py-3 font-bold">{task.start_time || "--:--"} - {task.end_time || "--:--"}</td>
                <td className="px-4 py-3">{task.customer_name || site?.customer_name || "-"}</td>
                <td className="px-4 py-3 font-black">{task.site || site?.name || "-"}</td>
                <td className="px-4 py-3">{task.employee_name || "Nicht zugewiesen"}</td>
                <td className="px-4 py-3 font-bold">{taskDuration(task) ? `${taskDuration(task)} Min.` : "fehlt"}</td>
                <td className="px-4 py-3">{blocked ? <Status color="red">Abwesenheit</Status> : <Status color={gpsOk ? "green" : "yellow"}>{gpsOk ? "GPS bereit" : "GPS fehlt"}</Status>}</td>
                <td className="px-4 py-3"><Actions edit={() => p.editTask(task)} del={() => p.deleteTask(task)} /></td>
              </tr>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

function ReassignSelect({ task, employees, onChange }: { task: Row; employees: Row[]; onChange: (task: Row, employeeName: string) => void }) {
  return (
    <select
      value={task.employee_name || ""}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        onChange(task, event.target.value);
      }}
      className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-black text-slate-700 outline-none hover:border-blue-300"
      title="Schicht direkt zu anderem Mitarbeiter verschieben"
    >
      <option value="">Ungeplant</option>
      {employees.map((employee: Row) => <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>)}
    </select>
  );
}

function Employees(p: any) {
  return (
    <div>
      <PageHeader icon="👥" title="Mitarbeiter" sub={`${p.rows.length} Datensätze`}><Button onClick={p.exportRows}>Exportieren</Button><Button primary onClick={p.openCreate}>+ Mitarbeiter anlegen</Button></PageHeader>
      <div className="mb-5 grid gap-4 md:grid-cols-3"><Metric title="Aktive Mitarbeiter" value={p.rows.filter((x: Row) => x.active !== false).length} hint="im System" /><Metric title="Mit Login verbunden" value={p.rows.filter((x: Row) => x.auth_user_id).length} hint="Supabase Auth" /><Metric title="Abwesenheiten" value={p.absences.length} hint="gesamt" /></div>
      <Table headers={["Name", "Nummer", "Kontakt", "Arbeitszeit", "Urlaub", "Krank", "Kosten", "Status", "Aktion"]}>{p.rows.length === 0 ? <tr><td colSpan={9}><Empty /></td></tr> : p.rows.map((e: Row) => {
        const entryMinutes = p.entries.filter((x: Row) => x.employee_name === e.name).reduce((s: number, x: Row) => s + payableMinutes(x), 0);
        const cost = (entryMinutes / 60) * Number(e.hourly_rate || 0);
        const vacationTotal = Number(e.vacation_days ?? e.annual_vacation_days ?? 0);
        const vacationTaken = absenceDayCount(p.absences || [], e.name, isVacationAbsence);
        const vacationOpen = Math.max(0, vacationTotal - vacationTaken);
        const sickTaken = absenceDayCount(p.absences || [], e.name, isSickAbsence);
        return <tr key={e.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-black text-white">{initials(e.name)}</div><div><p className="font-black">{e.name}</p><p className="text-xs text-slate-500">{e.email || "Keine E-Mail"}</p></div></div></td><td className="px-4 py-3">{e.employee_number || "-"}</td><td className="px-4 py-3">{e.phone || "-"}</td><td className="px-4 py-3 font-bold">{prettyHours(entryMinutes)} Std.</td><td className="px-4 py-3"><p className="font-black">{vacationTaken} / {vacationTotal} Tage</p><p className="text-xs font-bold text-slate-500">{vacationOpen} offen</p></td><td className="px-4 py-3 font-bold">{sickTaken} Tage</td><td className="px-4 py-3 font-bold">{euro(cost)}</td><td className="px-4 py-3"><Status color={e.active === false ? "gray" : "green"}>{e.active === false ? "Passiv" : "Aktiv"}</Status></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button onClick={() => p.openEdit(e)}>Bearbeiten</Button>{e.active === false ? <Button primary onClick={() => p.activate(e)}>Aktivieren</Button> : <Button danger onClick={() => p.deactivate(e)}>Deaktivieren</Button>}</div></td></tr>;
      })}</Table>
    </div>
  );
}

function Customers(p: any) {
  return <ListPage icon="🏷" title="Kunden" sub="Hauptmaske für Kundenstammdaten" rows={p.rows} headers={["Kunde", "Nummer", "Adresse", "Telefon", "E-Mail", "Objekte", "Aktion"]} createLabel="+ Kunde erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => { const objectCount = p.sites?.filter((site: Row) => site.customer_id === r.id || site.customer_name === r.name).length || r.object_count || 0; return <tr key={r.id}><td className="px-4 py-3 font-black">{r.name || r.customer_name}</td><td className="px-4 py-3">{r.customer_number || "-"}</td><td className="px-4 py-3">{r.address || r.customer_address || "-"}</td><td className="px-4 py-3">{r.phone || r.customer_phone || "-"}</td><td className="px-4 py-3">{r.email || r.customer_email || "-"}</td><td className="px-4 py-3"><Status color={objectCount > 0 ? "blue" : "gray"}>{objectCount}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>; })}</ListPage>;
}

function Contacts(p: any) {
  return <ListPage icon="☎" title="Kontakte" sub="Ansprechpartner für Kunden und Objekte" rows={p.rows} headers={["Name", "Firma", "Rolle", "Telefon", "E-Mail", "Aktion"]} createLabel="+ Kontakt erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.company || "-"}</td><td className="px-4 py-3">{r.role || r.contact_role || "-"}</td><td className="px-4 py-3">{r.phone || "-"}</td><td className="px-4 py-3">{r.email || "-"}</td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Sites(p: any) {
  return <ListPage icon="🏢" title="Objekte" sub="Standorte mit GPS-Daten für Einsatzplanung und Zeiterfassung" rows={p.rows} headers={["Objekt", "Kunde", "Adresse", "Kontingent", "GPS", "Radius", "Status", "Aktion"]} createLabel="+ Objekt erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.customer_name || "-"}</td><td className="px-4 py-3">{r.address || "-"}</td><td className="px-4 py-3 font-bold">{Number(r.monthly_hour_quota || 0) ? `${r.monthly_hour_quota} Std./Monat` : "-"}</td><td className="px-4 py-3">{r.latitude && r.longitude ? `${r.latitude}, ${r.longitude}` : "GPS fehlt"}</td><td className="px-4 py-3">{r.allowed_radius_m || 50} m</td><td className="px-4 py-3"><Status color={r.active === false ? "gray" : "green"}>{r.active === false ? "Passiv" : "Aktiv"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Tasks(p: any) {
  return <ListPage icon="✓" title="Aufgaben" sub="Zusätzliche Aufgaben zu Kunden, Objekten oder Mitarbeitern. Einsätze bleiben in der Einsatzplanung." rows={p.rows} headers={["Fällig", "Typ", "Aufgabe", "Objekt", "Mitarbeiter", "Priorität", "Status", "Aktion"]} createLabel="+ Aufgabe erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.length === 0 ? <tr><td colSpan={8}><Empty text="Noch keine separaten Aufgaben angelegt" /></td></tr> : p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3">{dateText(r.due_date || r.task_date)}</td><td className="px-4 py-3"><Status color="blue">{r.task_category || "Sonstiges"}</Status></td><td className="px-4 py-3 font-black">{r.title}</td><td className="px-4 py-3">{r.site || "-"}</td><td className="px-4 py-3">{r.employee_name || "-"}</td><td className="px-4 py-3"><Status color={r.priority === "Dringend" ? "red" : r.priority === "Hoch" ? "yellow" : "blue"}>{r.priority || "Mittel"}</Status></td><td className="px-4 py-3"><Status color={r.done || r.status === "done" ? "green" : "gray"}>{r.done || r.status === "done" ? "Erledigt" : "Offen"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}


function messageDate(value: unknown) {
  const text = String(value || "");
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Meldungen(p: any) {
  const openNotifications = (p.notifications || []).filter((item: Row) => !item.status || item.status === "open");
  const overtimeRequests = openNotifications.filter((item: Row) => item.notification_type === "overtime_request");
  const otherNotifications = openNotifications.filter((item: Row) => item.notification_type !== "overtime_request");
  const openReports = (p.materialReports || []).filter((item: Row) => !item.status || item.status === "open");
  const openAbsences = (p.absences || []).filter((item: Row) => !item.status || item.status === "open");
  const autoClockOuts = (p.entries || []).filter((item: Row) => item.auto_clock_out === true || String(item.reason || "").toLowerCase().includes("gps"));
  const total = overtimeRequests.length + otherNotifications.length + openReports.length + openAbsences.length + autoClockOuts.length;

  return (
    <div>
      <PageHeader icon="🔔" title="Meldezentrale" sub="Hier sammle ich alles, worauf ich reagieren muss.">
        <Button onClick={() => p.setTab("material")}>Material öffnen</Button>
        <Button onClick={() => p.setTab("zeiten")}>Zeiten öffnen</Button>
        <Button onClick={() => p.setTab("abwesenheiten")}>Abwesenheiten öffnen</Button>
      </PageHeader>

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Alles offen" value={total} hint="Meldungen gesamt" />
        <Metric title="Material" value={openReports.length} hint="leer / fehlt" />
        <Metric title="Überstunden" value={overtimeRequests.length} hint="Anfragen" />
        <Metric title="Abwesenheit" value={openAbsences.length} hint="Anträge" />
        <Metric title="GPS / Auto-Stopp" value={autoClockOuts.length} hint="zu prüfen" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-black text-slate-950">Materialmeldungen</h3><p className="text-sm text-slate-500">Mitarbeiter meldet leeres Material am Objekt.</p></div>
            <Status color={openReports.length ? "red" : "green"}>{openReports.length} offen</Status>
          </div>
          <div className="space-y-3">
            {openReports.length === 0 && <Empty text="Keine offenen Materialmeldungen." />}
            {openReports.map((r: Row) => (
              <div key={r.id} className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-orange-950">{r.material_name || "Material"}</p>
                    <p className="text-sm font-bold text-orange-700">Objekt: {r.object_name || r.site || "-"}</p>
                    <p className="text-xs font-bold text-orange-600">{r.employee_name || "Mitarbeiter"} · Menge: {r.quantity_requested || r.quantity || 1} · {messageDate(r.created_at)}</p>
                    {r.notes && <p className="mt-2 text-sm text-orange-800">{r.notes}</p>}
                  </div>
                  <Button primary onClick={() => p.resolveReport(r)}>Erledigt</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-black text-slate-950">Überstunden</h3><p className="text-sm text-slate-500">Freigabe, bevor Mitarbeiter länger arbeitet.</p></div>
            <Status color={overtimeRequests.length ? "yellow" : "green"}>{overtimeRequests.length} offen</Status>
          </div>
          <div className="space-y-3">
            {overtimeRequests.length === 0 && <Empty text="Keine offenen Überstundenanfragen." />}
            {overtimeRequests.map((note: Row) => (
              <div key={note.id} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="font-black text-amber-950">{note.title || "Überstundenanfrage"}</p>
                <p className="text-sm font-bold text-amber-700">{note.employee_name || "Mitarbeiter"} · {note.site || note.object_name || "Objekt"} · +{note.overtime_minutes || 0} Minuten</p>
                <p className="mt-1 text-sm text-amber-800">{note.message || "Überstunden werden angefragt."}</p>
                <div className="mt-3 flex flex-wrap gap-2"><Button primary onClick={() => p.decideNotification(note, true)}>Genehmigen</Button><Button danger onClick={() => p.decideNotification(note, false)}>Ablehnen</Button></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-black text-slate-950">Abwesenheiten</h3><p className="text-sm text-slate-500">Urlaub, Krankmeldung oder Frei-Antrag.</p></div>
            <Status color={openAbsences.length ? "yellow" : "green"}>{openAbsences.length} offen</Status>
          </div>
          <div className="space-y-3">
            {openAbsences.length === 0 && <Empty text="Keine offenen Abwesenheiten." />}
            {openAbsences.map((a: Row) => (
              <div key={a.id} className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="font-black text-blue-950">{a.employee_name || "Mitarbeiter"} · {a.absence_type || "Abwesenheit"}</p>
                <p className="text-sm font-bold text-blue-700">{dateText(a.start_date)} bis {dateText(a.end_date)}</p>
                {a.reason && <p className="mt-1 text-sm text-blue-800">{a.reason}</p>}
                <div className="mt-3 flex flex-wrap gap-2"><Button primary onClick={() => p.decideAbsence(a, "approved")}>Genehmigen</Button><Button danger onClick={() => p.decideAbsence(a, "rejected")}>Ablehnen</Button></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-black text-slate-950">Weitere Meldungen</h3><p className="text-sm text-slate-500">GPS, System- und Mitarbeiterhinweise.</p></div>
            <Status color={(otherNotifications.length + autoClockOuts.length) ? "blue" : "green"}>{otherNotifications.length + autoClockOuts.length} offen</Status>
          </div>
          <div className="space-y-3">
            {otherNotifications.length === 0 && autoClockOuts.length === 0 && <Empty text="Keine weiteren offenen Meldungen." />}
            {otherNotifications.map((note: Row) => (
              <div key={note.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-black text-slate-950">{note.title || "Meldung"}</p>
                <p className="text-sm text-slate-600">{note.message || "-"}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">{note.employee_name || "System"} · {messageDate(note.created_at)}</p>
                <div className="mt-3"><Button onClick={() => p.closeNotification(note)}>Erledigt markieren</Button></div>
              </div>
            ))}
            {autoClockOuts.map((entry: Row) => (
              <div key={entry.id} className="rounded-2xl border border-red-100 bg-red-50 p-4">
                <p className="font-black text-red-950">Automatisch ausgestempelt</p>
                <p className="text-sm font-bold text-red-700">{entry.employee_name || "Mitarbeiter"} · {entry.work_site_name || entry.site || "Objekt"}</p>
                <p className="mt-1 text-sm text-red-700">{entry.reason || "GPS-Bereich verlassen oder Planzeit erreicht."}</p>
                <p className="mt-1 text-xs font-bold text-red-500">{messageDate(entry.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Materials(p: any) {
  const openReports = (p.reports || []).filter((r: Row) => !r.status || r.status === "open");
  return (
    <div>
      <PageHeader icon="📦" title="Materialwesen" sub="Artikel, Bestand, Objektverknüpfung und Mitarbeiter-Meldungen">
        <Button onClick={p.onExport || p.onCreate}>Exportieren</Button>
        <Button primary onClick={p.openCreate}>+ Artikel erstellen</Button>
      </PageHeader>

      <Card className="mb-5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">Materialmeldungen</h3>
            <p className="text-sm text-slate-500">Hier sehe ich, welches Material an welchem Objekt leer ist.</p>
          </div>
          <Status color={openReports.length ? "red" : "green"}>{openReports.length} offen</Status>
        </div>
        {openReports.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">Keine offenen Materialmeldungen.</p> : (
          <div className="space-y-3">
            {openReports.map((r: Row) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-4">
                <div>
                  <p className="font-black text-red-900">{r.material_name || "Material"}</p>
                  <p className="text-sm font-semibold text-red-700">Objekt: {r.object_name || "-"}</p>
                  <p className="text-xs text-red-600">Gemeldet von {r.employee_name || "Mitarbeiter"} · Menge: {r.quantity_requested || 1}</p>
                  {r.notes && <p className="mt-1 text-sm text-red-700">{r.notes}</p>}
                </div>
                <Button primary onClick={() => p.resolveReport(r)}>Erledigt</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Table headers={["Artikel", "Objekt", "Kategorie", "Bestand", "Mindestbestand", "Lieferant", "Status", "Aktion"]}>
        {p.rows.length === 0 ? <tr><td colSpan={8}><Empty /></td></tr> : p.rows.map((r: Row) => { const low = Number(r.current_stock || 0) <= Number(r.min_stock || 0); const linkedSite = p.sites?.find((s: Row) => s.id === r.work_site_id); return <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.object_name || linkedSite?.name || "Alle Objekte"}</td><td className="px-4 py-3">{r.category || "-"}</td><td className="px-4 py-3">{r.current_stock || 0} {r.unit || "Stück"}</td><td className="px-4 py-3">{r.min_stock || 0}</td><td className="px-4 py-3">{r.supplier || "-"}</td><td className="px-4 py-3"><Status color={low ? "red" : "green"}>{low ? "Nachbestellen" : "OK"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>; })}
      </Table>
    </div>
  );
}

function Devices(p: any) {
  return <ListPage icon="🔧" title="Geräte" sub="Maschinen und Betriebsmittel" rows={p.rows} headers={["Gerät", "Kategorie", "Seriennummer", "Zugewiesen", "Status", "Aktion"]} createLabel="+ Gerät erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.category || "-"}</td><td className="px-4 py-3">{r.serial_number || "-"}</td><td className="px-4 py-3">{r.assigned_to || "-"}</td><td className="px-4 py-3"><Status color={r.status === "Defekt" ? "red" : r.status === "Wartung" ? "yellow" : "green"}>{r.status || "Aktiv"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Keys(p: any) {
  return <ListPage icon="🔑" title="Schlüssel" sub="Schlüsselverwaltung mit Übergabeprotokoll" rows={p.rows} headers={["Anzahl", "Schlüsselnummer", "Kunde", "Objekt", "Mitarbeiter", "Status", "Protokoll", "Aktion"]} createLabel="+ Schlüssel erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.key_name}</td><td className="px-4 py-3">{r.key_number || "-"}</td><td className="px-4 py-3">{r.customer_name || "-"}</td><td className="px-4 py-3">{r.object_name || "-"}</td><td className="px-4 py-3">{r.employee_name || "-"}</td><td className="px-4 py-3"><Status color={r.status === "Verloren" ? "red" : r.status === "Zurückgegeben" ? "green" : "blue"}>{r.status || "Ausgegeben"}</Status></td><td className="px-4 py-3"><Button onClick={() => p.pdf(r)}>Protokoll</Button></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function monthFromValue(value: unknown) {
  const text = String(value || "");
  if (!text) return "";
  return text.slice(0, 7);
}

function payrollDate(value: Row) {
  return String(value.work_date || value.check_in_at || value.created_at || "");
}

function payableMinutes(row: Row) {
  return Number(row.payroll_minutes ?? row.worked_minutes ?? row.planned_minutes ?? 0);
}

function timeEntryDate(row: Row) {
  return dateOnly(row.work_date || row.check_in_at || row.created_at);
}

function DailyClosing(p: any) {
  const employees = (p.employees || []).filter((employee: Row) => employee.role !== "admin" && employee.active !== false);
  const dayTasks = (p.tasks || []).filter((task: Row) => dateOnly(task.task_date || task.due_date) === p.selectedDay);
  const dayEntries = (p.entries || []).filter((entry: Row) => timeEntryDate(entry) === p.selectedDay);
  const rows = employees.map((employee: Row) => {
    const employeeName = String(employee.name || "");
    const planned = dayTasks
      .filter((task: Row) => String(task.employee_name || "") === employeeName)
      .reduce((sum: number, task: Row) => sum + taskDuration(task), 0);
    const employeeEntries = dayEntries.filter((entry: Row) => String(entry.employee_name || "") === employeeName);
    const actual = employeeEntries.reduce((sum: number, entry: Row) => sum + payableMinutes(entry), 0);
    const absence = employeeAbsenceForDate(p.absences || [], employeeName, p.selectedDay);
    const approvedAbsence = absence && absenceIsBlocking(absence);
    const diff = actual - planned;
    let status = "OK";
    let color: "green" | "yellow" | "red" | "gray" = "green";

    if (approvedAbsence && isUnpaidAbsence(absence)) {
      status = "Unbezahlt Frei";
      color = "gray";
    } else if (approvedAbsence) {
      status = absence.absence_type || "Abwesenheit";
      color = "yellow";
    } else if (planned > 0 && actual <= 0) {
      status = "Nicht gestempelt";
      color = "red";
    } else if (diff > 15) {
      status = "Über Planzeit";
      color = "red";
    } else if (diff < -15) {
      status = "Unter Planzeit";
      color = "yellow";
    }

    return { employee, planned, actual, diff, status, color, entries: employeeEntries };
  });

  async function approveEntries(entries: Row[]) {
    for (const entry of entries) {
      await p.approve(entry, true);
    }
  }

  return (
    <Card className="mb-5 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-slate-950">Tagesabschluss</h3>
          <p className="text-sm font-bold text-slate-500">Ich prüfe hier geplante Zeit, gestempelte Zeit und Abwesenheiten pro Tag.</p>
        </div>
        <input type="date" value={p.selectedDay} onChange={(event) => p.setSelectedDay(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="px-4 py-3">Mitarbeiter</th><th className="px-4 py-3">Planzeit</th><th className="px-4 py-3">Ist / Lohnzeit</th><th className="px-4 py-3">Differenz</th><th className="px-4 py-3">Hinweis</th><th className="px-4 py-3">Aktion</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length === 0 ? <tr><td colSpan={6}><Empty text="Keine Mitarbeiter für diesen Tag." /></td></tr> : rows.map((row: Row) => (
              <tr key={row.employee.id || row.employee.name}>
                <td className="px-4 py-3 font-black">{row.employee.name}</td>
                <td className="px-4 py-3 font-bold">{prettyHours(row.planned)} Std.</td>
                <td className="px-4 py-3 font-bold">{prettyHours(row.actual)} Std.</td>
                <td className={`px-4 py-3 font-black ${row.diff < 0 ? "text-red-600" : row.diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>{row.diff === 0 ? "0:00" : `${row.diff > 0 ? "+" : "-"}${prettyHours(Math.abs(row.diff))}`} Std.</td>
                <td className="px-4 py-3"><Status color={row.color}>{row.status}</Status></td>
                <td className="px-4 py-3"><Button disabled={row.entries.length === 0} onClick={() => approveEntries(row.entries)}>Freigeben</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Times(p: any) {
  const defaultMonth = today.slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedDay, setSelectedDay] = useState(today);
  const openNotifications = (p.notifications || []).filter((item: Row) => !item.status || item.status === "open");
  const overtimeRequests = openNotifications.filter((item: Row) => item.notification_type === "overtime_request");
  const monthRows = (p.rows || []).filter((row: Row) => monthFromValue(payrollDate(row)) === selectedMonth);
  const approvedRows = monthRows.filter((row: Row) => row.approved === true || row.status === "approved");
  const openRows = monthRows.filter((row: Row) => !(row.approved === true || row.status === "approved") && row.status !== "rejected");

  const payrollRows = (p.employees || [])
    .map((employee: Row) => {
      const employeeEntries = approvedRows.filter((entry: Row) => String(entry.employee_name || "") === String(employee.name || ""));
      const totalMinutes = employeeEntries.reduce((sum: number, entry: Row) => sum + payableMinutes(entry), 0);
      const hourlyRate = Number(employee.hourly_rate || 0);
      return {
        employee_name: employee.name || "-",
        entries: employeeEntries.length,
        minutes: totalMinutes,
        hours: Number((totalMinutes / 60).toFixed(2)),
        hourly_rate: hourlyRate,
        amount: Number(((totalMinutes / 60) * hourlyRate).toFixed(2)),
      };
    })
    .filter((row: Row) => row.minutes > 0);

  const totalApprovedMinutes = approvedRows.reduce((sum: number, row: Row) => sum + payableMinutes(row), 0);
  const totalAmount = payrollRows.reduce((sum: number, row: Row) => sum + Number(row.amount || 0), 0);

  function exportPayroll() {
    const rows = payrollRows.map((row: Row) => ({
      Monat: selectedMonth,
      Mitarbeiter: row.employee_name,
      Eintraege: row.entries,
      Minuten: row.minutes,
      Stunden: row.hours,
      Stundenlohn: row.hourly_rate,
      Betrag: row.amount,
    }));
    downloadCsv(`lohnexport-${selectedMonth}.csv`, rows.length ? rows : [{ Monat: selectedMonth, Hinweis: "Keine freigegebenen Zeiten vorhanden" }]);
  }

  async function approveOpenMonth() {
    for (const row of openRows) {
      await p.approve(row, true);
    }
  }

  return (
    <div>
      {overtimeRequests.length > 0 && (
        <Card className="mb-5 border-amber-200 bg-amber-50 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-amber-950">Überstundenanfragen</h3>
              <p className="text-sm font-bold text-amber-700">Ich entscheide hier nur, ob ein Mitarbeiter länger arbeiten darf.</p>
            </div>
            <Status color="yellow">{overtimeRequests.length} offen</Status>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {overtimeRequests.map((note: Row) => (
              <div key={note.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{note.employee_name}</p>
                    <p className="mt-1 text-sm font-bold text-slate-600">{note.site || "Einsatz"} · +{note.overtime_minutes || 0} Min.</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{dateText(note.created_at)} · {note.message}</p>
                  </div>
                  <Status color="yellow">wartet</Status>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button primary onClick={() => p.decideNotification(note, true)}>Genehmigen</Button>
                  <Button danger onClick={() => p.decideNotification(note, false)}>Ablehnen</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <PageHeader icon="⏱" title="Zeiten & Lohnexport" sub="Ich gebe Zeiten frei und exportiere danach die Monatsstunden.">
        <Button onClick={() => p.openCorrection()}>Zeit korrigieren</Button>
        <Button onClick={p.exportRows}>Zeiten CSV</Button>
        <Button primary onClick={exportPayroll}>Lohnexport CSV</Button>
      </PageHeader>

      <DailyClosing selectedDay={selectedDay} setSelectedDay={setSelectedDay} employees={p.employees || []} tasks={p.tasks || []} entries={p.rows || []} absences={p.absences || []} approve={p.approve} />

      <Card className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-slate-950">Live-Status heute</h3>
            <p className="text-sm font-bold text-slate-500">Ich sehe hier, wer gestartet, in Pause oder beendet ist.</p>
          </div>
          <Status color="blue">{today}</Status>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(p.employees || []).filter((employee: Row) => employee.role !== "admin").map((employee: Row) => {
            const todayEntries = (p.rows || []).filter((entry: Row) => String(entry.employee_name || "") === String(employee.name || "") && timeEntryDate(entry) === today).sort((a: Row, b: Row) => new Date(a.created_at || a.check_in_at || 0).getTime() - new Date(b.created_at || b.check_in_at || 0).getTime());
            const last = todayEntries[todayEntries.length - 1];
            const action = String(last?.action || "");
            const status = action === "start" || action === "break_end" ? "arbeitet" : action === "break_start" ? "Pause" : action === "end" || action === "check_out" ? "beendet" : "nicht gestartet";
            const color = status === "arbeitet" ? "green" : status === "Pause" ? "yellow" : status === "beendet" ? "gray" : "red";
            return <div key={employee.id || employee.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-black text-slate-950">{employee.name}</p><p className="mt-1 text-xs font-bold text-slate-400">{todayEntries.length} Einträge heute</p><div className="mt-3"><Status color={color as any}>{status}</Status></div></div>;
          })}
        </div>
      </Card>

      <Card className="mb-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Monat</label>
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none focus:border-blue-500" />
            <button type="button" onClick={approveOpenMonth} disabled={openRows.length === 0} className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
              Offene Zeiten freigeben
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Metric title="Freigegebene Zeiten" value={approvedRows.length} hint="Einträge im Monat" />
            <Metric title="Offene Zeiten" value={openRows.length} hint="noch zu prüfen" />
            <Metric title="Freigegebene Stunden" value={`${(totalApprovedMinutes / 60).toFixed(2)} h`} hint="für Lohnexport" />
            <Metric title="Lohnsumme" value={euro(totalAmount)} hint="nach Stundenlohn" />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-4 py-3">Mitarbeiter</th><th className="px-4 py-3">Einträge</th><th className="px-4 py-3">Stunden</th><th className="px-4 py-3">Stundenlohn</th><th className="px-4 py-3">Betrag</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {payrollRows.length === 0 ? <tr><td colSpan={5}><Empty text="Für diesen Monat gibt es noch keine freigegebenen Zeiten." /></td></tr> : payrollRows.map((row: Row) => (
                <tr key={row.employee_name}><td className="px-4 py-3 font-black">{row.employee_name}</td><td className="px-4 py-3">{row.entries}</td><td className="px-4 py-3">{row.hours}</td><td className="px-4 py-3">{euro(row.hourly_rate)}</td><td className="px-4 py-3 font-black">{euro(row.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ListPage icon="⏱" title="Zeitenfreigabe" sub="Arbeitszeiten prüfen, Überstunden genehmigen und automatische Ausstempelungen kontrollieren" rows={p.rows} headers={["Datum", "Mitarbeiter", "Objekt", "Arbeitszeit", "Grund", "Status", "Aktion"]} createLabel="Export" onCreate={p.exportRows}>
        {p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3">{dateText(r.work_date || r.created_at)}</td><td className="px-4 py-3 font-black">{r.employee_name}</td><td className="px-4 py-3">{r.site || r.work_site || r.work_site_name || "-"}</td><td className="px-4 py-3">{prettyHours(payableMinutes(r))} Std.</td><td className="px-4 py-3">{r.reason === "max_time_reached" ? "Planzeit erreicht" : r.reason === "left_geofence" ? "GPS verlassen" : r.reason || "manuell"}</td><td className="px-4 py-3"><Status color={r.status === "approved" || r.approved ? "green" : r.status === "rejected" ? "red" : r.auto_clock_out ? "yellow" : "gray"}>{r.auto_clock_out ? "automatisch" : r.status || (r.approved ? "approved" : "offen")}</Status></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button primary onClick={() => p.approve(r, true)}>Freigeben</Button><Button onClick={() => p.openCorrection(r)}>Korrigieren</Button><Button danger onClick={() => p.approve(r, false)}>Ablehnen</Button></div></td></tr>)}
      </ListPage>
    </div>
  );
}

function Absences(p: any) {
  return <ListPage icon="✈" title="Abwesenheiten" sub="Urlaub, Krankheit und Freistellung" rows={p.rows} headers={["Mitarbeiter", "Art", "Von", "Bis", "Status", "Aktion"]} createLabel="+ Abwesenheit" onCreate={p.openCreate}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.employee_name}</td><td className="px-4 py-3">{r.absence_type}</td><td className="px-4 py-3">{dateText(r.start_date)}</td><td className="px-4 py-3">{dateText(r.end_date)}</td><td className="px-4 py-3"><Status color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "yellow"}>{r.status || "open"}</Status></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button primary onClick={() => p.decide(r, "approved")}>OK</Button><Button danger onClick={() => p.decide(r, "rejected")}>Nein</Button><Button onClick={() => p.openEdit(r)}>Bearbeiten</Button><Button danger onClick={() => p.deleteRow(r)}>Löschen</Button></div></td></tr>)}</ListPage>;
}

function Chat(p: any) {
  return (
    <div>
      <PageHeader icon="💬" title="Chat" sub="Nachrichten an Mitarbeiter" />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="p-4"><h3 className="mb-3 font-black">Mitarbeiter</h3>{p.employees.map((e: Row) => <button key={e.id} type="button" onClick={() => p.setEmployee(e.name)} className={p.employee === e.name ? "mb-2 w-full rounded-xl bg-blue-600 p-3 text-left font-bold text-white" : "mb-2 w-full rounded-xl bg-slate-50 p-3 text-left font-bold text-slate-700 hover:bg-blue-50"}>{e.name}</button>)}</Card>
        <Card className="p-4"><h3 className="mb-4 font-black">{p.employee ? `Chat mit ${p.employee}` : "Mitarbeiter auswählen"}</h3><div className="mb-4 h-[55vh] overflow-y-auto rounded-2xl bg-slate-50 p-4">{p.messages.length === 0 && <Empty text="Noch keine Nachrichten" />}{p.messages.map((m: Row) => <div key={m.id} className={m.sender_role === "admin" ? "mb-3 ml-auto max-w-[80%] rounded-2xl bg-blue-600 p-3 text-white" : "mb-3 max-w-[80%] rounded-2xl bg-white p-3 shadow-sm"}><p className="text-xs font-black opacity-70">{m.sender_role === "admin" ? "Ich" : m.sender_name || m.employee_name}</p><p>{m.message}</p></div>)}</div><div className="flex gap-2"><input value={p.text} onChange={(event) => p.setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") p.send(); }} className="field" placeholder="Nachricht schreiben..." /><Button primary onClick={p.send}>Senden</Button></div></Card>
      </div>
    </div>
  );
}

function ListPage(p: any) {
  return (
    <div>
      <PageHeader icon={p.icon} title={p.title} sub={p.sub}><Button onClick={p.onExport || p.onCreate}>Exportieren</Button><Button primary onClick={p.onCreate}>{p.createLabel}</Button></PageHeader>
      <Table headers={p.headers}>{p.rows.length === 0 ? <tr><td colSpan={p.headers.length}><Empty /></td></tr> : p.children}</Table>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">{children}</span>;
}

function Actions({ edit, del }: { edit: () => void; del: () => void }) {
  return <div className="flex flex-wrap gap-2"><Button onClick={edit}>Bearbeiten</Button><Button danger onClick={del}>Löschen</Button></div>;
}

function ModalShell({ title, close, children, onSubmit, saving, wide = false }: { title: string; close: () => void; children: React.ReactNode; onSubmit: () => void; saving: boolean; wide?: boolean }) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className={`my-8 rounded-3xl bg-white shadow-2xl ${wide ? "w-full max-w-5xl" : "w-full max-w-2xl"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><h2 className="text-xl font-black text-slate-950">{title}</h2><button type="button" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">✕</button></div>
        <div className="grid gap-4 p-6 md:grid-cols-2">{children}</div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><button type="button" onClick={close} className="text-sm font-bold text-slate-500">Abbrechen</button><Button primary type="submit" disabled={saving}>{saving ? "Speichern..." : "Speichern"}</Button></div>
      </form>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1 block text-xs font-black text-slate-500">{label}</span>{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`field ${props.className || ""}`} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`field ${props.className || ""}`}>{props.children}</select>; }
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`field min-h-28 ${props.className || ""}`} />; }

function EmployeeInviteModal(p: any) {
  return <ModalShell title="Mitarbeiter anlegen" close={p.close} onSubmit={p.save} saving={p.saving}><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="E-Mail"><Input required type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field>{p.inviteLink && <div className="md:col-span-2 rounded-2xl bg-blue-50 p-4"><p className="mb-2 font-black text-blue-900">Aktivierungslink</p><input readOnly className="field" value={p.inviteLink} /><div className="mt-3 flex gap-2"><Button onClick={() => navigator.clipboard.writeText(p.inviteLink)}>Link kopieren</Button>{p.whatsappLink && <a href={p.whatsappLink} target="_blank" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">WhatsApp öffnen</a>}</div></div>}</ModalShell>;
}

function EmployeeEditModal(p: any) {
  return <ModalShell title="Mitarbeiter bearbeiten" close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="Personalnummer"><Input value={p.form.employee_number} onChange={(e) => p.setForm({ ...p.form, employee_number: e.target.value })} /></Field><Field label="Adresse" wide><Input value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field><Field label="Stundenlohn"><Input type="number" step="0.01" value={p.form.hourly_rate} onChange={(e) => p.setForm({ ...p.form, hourly_rate: e.target.value })} /></Field><Field label="Monatslimit Stunden"><Input type="number" step="0.25" value={p.form.monthly_hour_limit} onChange={(e) => p.setForm({ ...p.form, monthly_hour_limit: e.target.value })} placeholder="z. B. 80" /></Field><Field label="Urlaubstage"><Input type="number" step="0.5" value={p.form.vacation_days} onChange={(e) => p.setForm({ ...p.form, vacation_days: e.target.value })} /></Field><Field label="Status"><Select value={p.form.active ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, active: e.target.value === "true" })}><option value="true">Aktiv</option><option value="false">Passiv</option></Select></Field></ModalShell>;
}

function CustomerModal(p: any) { return <ModalShell title={p.form.id ? "Kunde bearbeiten" : "Kunde erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Kunde"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Kundennummer"><Input value={p.form.customer_number} onChange={(e) => p.setForm({ ...p.form, customer_number: e.target.value })} /></Field><Field label="Adresse" wide><Input value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function ContactModal(p: any) { return <ModalShell title={p.form.id ? "Kontakt bearbeiten" : "Kontakt erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Firma"><Input value={p.form.company} onChange={(e) => p.setForm({ ...p.form, company: e.target.value })} /></Field><Field label="Rolle"><Input value={p.form.role} onChange={(e) => p.setForm({ ...p.form, role: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function SiteModal(p: any) {
  return (
    <ModalShell title={p.form.id ? "Objekt bearbeiten" : "Objekt erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide>
      <Field label="Kunde">
        <Select value={p.form.customer_id || p.form.customer_name || ""} onChange={(e) => { const customer = findCustomerByValue(p.customers, e.target.value); p.setForm({ ...p.form, customer_id: isUuid(e.target.value) ? e.target.value : "", customer_name: customerLabel(customer) || e.target.value }); }}>
          <option value="">Kunde auswählen</option>
          {p.customers.map((c: Row) => <option key={customerValue(c)} value={customerValue(c)}>{customerLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Objektname"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field>
      <Field label="Adresse" wide><Input required value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field>
      <Field label="GPS-Radius Meter"><Input type="number" value={p.form.allowed_radius_m} onChange={(e) => p.setForm({ ...p.form, allowed_radius_m: e.target.value })} /></Field>
      <Field label="Stundenkontingent / Monat"><Input type="number" step="0.25" value={p.form.monthly_hour_quota} onChange={(e) => p.setForm({ ...p.form, monthly_hour_quota: e.target.value })} placeholder="z. B. 44" /></Field>
      <Field label="GPS automatisch holen"><button type="button" onClick={p.geocode} disabled={p.geocoding} className="field text-left font-black text-blue-700 disabled:opacity-60">{p.geocoding ? "GPS wird gesucht..." : "GPS aus Adresse holen"}</button></Field>
      <Field label="Latitude"><Input value={p.form.latitude} onChange={(e) => p.setForm({ ...p.form, latitude: e.target.value })} /></Field>
      <Field label="Longitude"><Input value={p.form.longitude} onChange={(e) => p.setForm({ ...p.form, longitude: e.target.value })} /></Field>
      <Field label="Status"><Select value={p.form.active ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, active: e.target.value === "true" })}><option value="true">Aktiv</option><option value="false">Passiv</option></Select></Field>
      <Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field>
    </ModalShell>
  );
}

function TaskModal(p: any) {
  const selectedCustomerValue = String(p.form.customer_id || p.form.customer_name || "");
  const selectedCustomer = findCustomerByValue(p.customers, selectedCustomerValue);
  const filteredSites = selectedCustomerValue ? p.sites.filter((site: Row) => siteBelongsToCustomer(site, selectedCustomerValue, p.customers)) : p.sites;
  const selectCustomer = (value: string) => {
    const customer = findCustomerByValue(p.customers, value);
    p.setForm({
      ...p.form,
      customer_id: isUuid(value) ? value : "",
      customer_name: customerLabel(customer) || value,
      work_site_id: "",
      site: "",
    });
  };
  const selectSite = (value: string) => {
    const site = p.sites.find((s: Row) => s.id === value);
    const customer = findCustomerByValue(p.customers, site?.customer_id || site?.customer_name || p.form.customer_id);
    p.setForm({
      ...p.form,
      work_site_id: value,
      site: site?.name || "",
      customer_id: isUuid(site?.customer_id) ? site?.customer_id : customer && isUuid(customer.id) ? customer.id : p.form.customer_id,
      customer_name: site?.customer_name || customerLabel(customer) || p.form.customer_name,
    });
  };
  const selectedSite = p.sites.find((site: Row) => site.id === p.form.work_site_id);
  const gpsReady = Boolean(selectedSite?.latitude && selectedSite?.longitude);
  const assignmentMonth = parseLocalDate(p.form.task_date || today);
  const objectPlannedMinutes = sitePlannedMinutesForMonth(p.assignments || [], selectedSite, assignmentMonth, p.form.id) + Number(p.form.planned_minutes || 0);
  const objectQuotaMinutes = siteHourQuotaMinutes(selectedSite);
  const objectRemainingMinutes = objectQuotaMinutes - objectPlannedMinutes;
  const currentPaidMinutes = paidMinutesFromForm(p.form);
  const weekdayLabels = [
    ["MO", "M"],
    ["TU", "D"],
    ["WE", "M"],
    ["TH", "D"],
    ["FR", "F"],
    ["SA", "S"],
    ["SU", "S"],
  ];
  const selectedDays = Array.isArray(p.form.recurrence_days) ? p.form.recurrence_days : [];
  const toggleDay = (key: string) => {
    const next = selectedDays.includes(key) ? selectedDays.filter((item: string) => item !== key) : [...selectedDays, key];
    p.setForm({ ...p.form, recurrence_days: next });
  };

  const isActionTask = p.mode === "task" || p.form.item_type === "task" || p.form.task_type === "task";
  if (isActionTask) {
    return (
      <ModalShell title={p.form.id ? "Aufgabe bearbeiten" : "Neue Aufgabe erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide>
        <div className="md:col-span-2 rounded-2xl bg-slate-50 p-4">
          <p className="mb-3 font-black text-slate-950">Allgemeine Informationen</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Titel" wide><Input required value={p.form.title} onChange={(e) => p.setForm({ ...p.form, title: e.target.value })} placeholder="z. B. Nacharbeit" /></Field>
            <Field label="Aufgabentyp"><Select value={p.form.task_category} onChange={(e) => p.setForm({ ...p.form, task_category: e.target.value })}><option>Reklamation</option><option>Personal</option><option>Kundenanfrage</option><option>Sonstiges</option></Select></Field>
            <Field label="Priorität"><Select value={p.form.priority} onChange={(e) => p.setForm({ ...p.form, priority: e.target.value })}><option>Niedrig</option><option>Mittel</option><option>Hoch</option><option>Dringend</option></Select></Field>
            <Field label="Fälligkeitsdatum"><Input type="date" value={p.form.due_date || p.form.task_date} onChange={(e) => p.setForm({ ...p.form, due_date: e.target.value, task_date: e.target.value })} /></Field>
            <Field label="Status"><Select value={p.form.status || (p.form.done ? "done" : "open")} onChange={(e) => p.setForm({ ...p.form, status: e.target.value, done: e.target.value === "done" })}><option value="open">Offen</option><option value="done">Erledigt</option></Select></Field>
          </div>
        </div>

        <Field label="Kunde">
          <Select value={selectedCustomer?.id || p.form.customer_id || p.form.customer_name || ""} onChange={(e) => selectCustomer(e.target.value)}>
            <option value="">Kunde auswählen</option>
            {p.customers.map((c: Row) => <option key={customerValue(c)} value={customerValue(c)}>{customerLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label="Objekt">
          <Select value={p.form.work_site_id} onChange={(e) => selectSite(e.target.value)}>
            <option value="">Objekt auswählen</option>
            {filteredSites.map((s: Row) => <option key={s.id} value={s.id}>{siteOptionLabel(s)}</option>)}
          </Select>
        </Field>
        <Field label="Mitarbeiter">
          <EmployeePicker value={p.form.employee_name} employees={p.employees} assignments={p.assignments || []} absences={p.absences || []} taskDate={p.form.task_date || p.form.due_date} currentTaskId={p.form.id} onChange={(name) => p.setForm({ ...p.form, employee_name: name })} />
        </Field>
        <Field label="Mitarbeiter benachrichtigen"><label className="field flex items-center gap-3 font-bold"><input type="checkbox" checked={p.form.notify_employee !== false} onChange={(e) => p.setForm({ ...p.form, notify_employee: e.target.checked })} /> Benachrichtigung senden</label></Field>
        <Field label="Beschreibung" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} placeholder="Beschreibung" /></Field>
      </ModalShell>
    );
  }

  return (
    <ModalShell title={p.form.id ? "Einsatz bearbeiten" : "Neuen Einsatz planen"} close={p.close} onSubmit={p.save} saving={p.saving} wide>
      <Field label="Kunde">
        <Select value={selectedCustomer?.id || p.form.customer_id || p.form.customer_name || ""} onChange={(e) => selectCustomer(e.target.value)}>
          <option value="">Kunde auswählen</option>
          {p.customers.map((c: Row) => <option key={customerValue(c)} value={customerValue(c)}>{customerLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Objekt / Standort">
        <Select required value={p.form.work_site_id} onChange={(e) => selectSite(e.target.value)}>
          <option value="">Objekt auswählen</option>
          {filteredSites.map((s: Row) => <option key={s.id} value={s.id}>{siteOptionLabel(s)}</option>)}
        </Select>
      </Field>
      <Field label="Mitarbeiter">
        <EmployeePicker value={p.form.employee_name} employees={p.employees} assignments={p.assignments || []} absences={p.absences || []} taskDate={p.form.task_date || p.form.due_date} currentTaskId={p.form.id} onChange={(name) => p.setForm({ ...p.form, employee_name: name })} />
      </Field>
      <Field label="Auftrag / Leistung"><Input required value={p.form.title} onChange={(e) => p.setForm({ ...p.form, title: e.target.value })} placeholder="z. B. Unterhaltsreinigung" /></Field>

      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-slate-950">{monthName(assignmentMonth)}</p>
            <p className="mt-1 text-sm text-slate-500">Objekt-Kontingent für diesen Monat</p>
          </div>
          <div className="grid min-w-[320px] gap-2 text-sm">
            <div className="flex justify-between gap-6"><span className="text-slate-500">Geplant:</span><strong>{formatHours(objectPlannedMinutes)}</strong></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Stundenkontingent:</span><strong>{objectQuotaMinutes ? formatHours(objectQuotaMinutes) : "-"}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${objectQuotaMinutes && objectPlannedMinutes > objectQuotaMinutes ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${objectQuotaMinutes ? Math.min(100, Math.round((objectPlannedMinutes / objectQuotaMinutes) * 100)) : objectPlannedMinutes ? 100 : 0}%` }} />
            </div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Noch verfügbar:</span><strong className={objectQuotaMinutes && objectRemainingMinutes < 0 ? "text-red-600" : "text-slate-950"}>{objectQuotaMinutes ? (objectRemainingMinutes >= 0 ? formatHours(objectRemainingMinutes) : `-${formatHours(Math.abs(objectRemainingMinutes))}`) : "-"}</strong></div>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 rounded-2xl bg-slate-50 p-4">
        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => p.setForm({ ...p.form, repeat_mode: "once" })} className={`rounded-xl border px-4 py-2 text-sm font-bold ${p.form.repeat_mode !== "repeat" ? "border-blue-500 bg-white text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>Einmalig</button>
          <button type="button" onClick={() => p.setForm({ ...p.form, repeat_mode: "repeat" })} className={`rounded-xl border px-4 py-2 text-sm font-bold ${p.form.repeat_mode === "repeat" ? "border-blue-500 bg-white text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>Wiederholend</button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Startdatum"><Input type="date" value={p.form.task_date} onChange={(e) => p.setForm({ ...p.form, task_date: e.target.value })} /></Field>
          <Field label="Von"><Input type="time" value={p.form.start_time} onChange={(e) => p.setForm({ ...p.form, start_time: e.target.value })} /></Field>
          <Field label="Bis"><Input type="time" value={p.form.end_time} onChange={(e) => p.setForm({ ...p.form, end_time: e.target.value })} /></Field>
          <Field label="Planzeit"><Input type="number" min="0" value={p.form.planned_minutes} onChange={(e) => p.setForm({ ...p.form, planned_minutes: e.target.value })} placeholder="Minuten" /></Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => p.setForm({ ...p.form, travel_minutes: String(Number(p.form.travel_minutes || 0) + 15) })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">+ Fahrzeit hinzufügen</button>
          <button type="button" onClick={() => p.setForm({ ...p.form, break_minutes: String(Number(p.form.break_minutes || 0) + 15) })} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">+ Pausenzeit hinzufügen</button>
          {(Number(p.form.travel_minutes || 0) > 0 || Number(p.form.break_minutes || 0) > 0) && <span className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-500">Fahrt {p.form.travel_minutes || 0} Min. · Pause {p.form.break_minutes || 0} Min.</span>}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-black text-slate-600">Lohnzeit in diesem Auftrag</span>
            <span className="text-lg font-black text-slate-950">{formatHours(currentPaidMinutes)}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">Planzeit + Fahrzeit − Pausenzeit</p>
        </div>

        {p.form.repeat_mode === "repeat" && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Wiederholen alle"><div className="grid grid-cols-[90px_1fr] gap-2"><Input type="number" min="1" value={p.form.recurrence_interval} onChange={(e) => p.setForm({ ...p.form, recurrence_interval: e.target.value })} /><Select value={p.form.recurrence_unit} onChange={(e) => p.setForm({ ...p.form, recurrence_unit: e.target.value })}><option value="week">Woche</option><option value="day">Tag</option><option value="month">Monat</option></Select></div></Field>
            <Field label="Enddatum"><Input type="date" value={p.form.recurrence_end_date} onChange={(e) => p.setForm({ ...p.form, recurrence_end_date: e.target.value })} /></Field>
            <Field label="Wiederholen am" wide>
              <div className="flex flex-wrap gap-2">
                {weekdayLabels.map(([key, label]) => <button key={key} type="button" onClick={() => toggleDay(key)} className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-black ${selectedDays.includes(key) ? "border-blue-500 bg-blue-100 text-blue-700" : "border-slate-200 bg-white text-slate-500"}`}>{label}</button>)}
              </div>
            </Field>
          </div>
        )}
      </div>

      <Field label="GPS-Status"><div className={`field font-black ${gpsReady ? "text-emerald-700" : "text-amber-700"}`}>{p.form.work_site_id ? (gpsReady ? "GPS-Daten vorhanden" : "GPS fehlt beim Objekt") : "Objekt auswählen"}</div></Field>
      <Field label="Mitarbeiter benachrichtigen"><label className="field flex items-center gap-3 font-bold"><input type="checkbox" checked={p.form.notify_employee !== false} onChange={(e) => p.setForm({ ...p.form, notify_employee: e.target.checked })} /> Benachrichtigung senden</label></Field>
      <Field label="Weiteren Einsatz erstellen"><label className="field flex items-center gap-3 font-bold"><input type="checkbox" checked={Boolean(p.form.create_another)} onChange={(e) => p.setForm({ ...p.form, create_another: e.target.checked })} /> Nach dem Speichern offen lassen</label></Field>
      <Field label="Beschreibung" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field>
    </ModalShell>
  );
}


function EmployeePicker({ value, employees, assignments = [], absences = [], taskDate, currentTaskId, onChange }: { value: string; employees: Row[]; assignments?: Row[]; absences?: Row[]; taskDate?: string; currentTaskId?: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = employees.find((employee) => employee.name === value);
  const filteredEmployees = employees.filter((employee) => {
    const haystack = `${employee.name || ""} ${employee.employee_group || ""} ${employee.role || ""}`.toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  const pickerDate = dateOnly(taskDate || today);
  const pickerMonth = parseLocalDate(pickerDate || today);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-center gap-2">
        {value ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">{initials(selected?.name || value)}</span>
            {value}
            <button type="button" onClick={() => onChange("")} className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-xs font-black text-white">×</button>
          </span>
        ) : <span className="px-2 py-2 text-sm font-semibold text-slate-400">Noch kein Mitarbeiter ausgewählt</span>}
        <button type="button" onClick={() => setOpen((old) => !old)} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">Hinzufügen +</button>
        {value && <button type="button" onClick={() => onChange("")} className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">Auf ungeplant setzen</button>}
      </div>

      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus className="w-full rounded-xl border border-blue-300 bg-white px-4 py-3 text-sm font-semibold outline-none" placeholder="Nach Name, Gruppe oder Tag suchen" />
          </div>
          <div className="max-h-72 overflow-y-auto pb-2">
            {filteredEmployees.length === 0 && <p className="px-4 py-4 text-sm font-bold text-slate-400">Keine Mitarbeiter gefunden</p>}
            {filteredEmployees.map((employee) => {
              const monthMinutes = employeePlannedMinutesForMonth(assignments, employee, pickerMonth);
              const limitMinutes = employeeMonthlyLimit(employee) * 60;
              const remainingMinutes = limitMinutes - monthMinutes;
              const absence = employeeAbsenceForDate(absences, employee.name, pickerDate);
              const blocked = Boolean(absence && absenceIsBlocking(absence));
              return (
                <button key={employee.id || employee.name} type="button" onClick={() => { onChange(employee.name); setOpen(false); setQuery(""); }} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50 ${employee.name === value ? "bg-blue-50" : ""} ${blocked ? "opacity-70" : ""}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-black text-white">{initials(employee.name || "CT")}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-400">{employee.employee_group || employee.role || "Servicekraft"}</span>
                      <span className="block truncate font-bold text-slate-800">{employee.name}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[11px] font-black">
                    {blocked ? <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">abwesend</span> : limitMinutes ? <span className={remainingMinutes < 0 ? "text-red-600" : "text-emerald-600"}>{remainingMinutes >= 0 ? formatHours(remainingMinutes) : `-${formatHours(Math.abs(remainingMinutes))}`} frei</span> : <span className="text-slate-400">kein Limit</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


function MaterialModal(p: any) {
  return <ModalShell title={p.form.id ? "Artikel bearbeiten" : "Neuen Artikel erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Artikel"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Objekt-Verknüpfung"><Select value={p.form.work_site_id} onChange={(e) => { const site = p.sites.find((s: Row) => s.id === e.target.value); p.setForm({ ...p.form, work_site_id: e.target.value, object_name: site?.name || "" }); }}><option value="">Für alle Objekte</option>{p.sites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Kategorie"><Input value={p.form.category} onChange={(e) => p.setForm({ ...p.form, category: e.target.value })} /></Field><Field label="Einheit"><Input value={p.form.unit} onChange={(e) => p.setForm({ ...p.form, unit: e.target.value })} /></Field><Field label="Bestand"><Input type="number" value={p.form.current_stock} onChange={(e) => p.setForm({ ...p.form, current_stock: e.target.value })} /></Field><Field label="Mindestbestand"><Input type="number" value={p.form.min_stock} onChange={(e) => p.setForm({ ...p.form, min_stock: e.target.value })} /></Field><Field label="Lieferant"><Input value={p.form.supplier} onChange={(e) => p.setForm({ ...p.form, supplier: e.target.value })} /></Field><Field label="Bild-URL" wide><Input value={p.form.image_url} onChange={(e) => p.setForm({ ...p.form, image_url: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>;
}
function DeviceModal(p: any) { return <ModalShell title={p.form.id ? "Gerät bearbeiten" : "Neues Gerät anlegen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Gerätename"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Kategorie"><Input value={p.form.category} onChange={(e) => p.setForm({ ...p.form, category: e.target.value })} /></Field><Field label="Seriennummer"><Input value={p.form.serial_number} onChange={(e) => p.setForm({ ...p.form, serial_number: e.target.value })} /></Field><Field label="Zugewiesen an"><Select value={p.form.assigned_to} onChange={(e) => p.setForm({ ...p.form, assigned_to: e.target.value })}><option value="">Nicht zugewiesen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option>Aktiv</option><option>Wartung</option><option>Defekt</option><option>Archiv</option></Select></Field><Field label="Bild-URL"><Input value={p.form.image_url} onChange={(e) => p.setForm({ ...p.form, image_url: e.target.value })} /></Field><Field label="Kommentar" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function KeyModal(p: any) {
  const selectedCustomer = findCustomerByValue(p.customers, p.form.customer_id || p.form.customer_name || "");
  const selectedCustomerValue = selectedCustomer ? customerValue(selectedCustomer) : p.form.customer_id || p.form.customer_name || "";
  const filteredSites = p.form.customer_id || p.form.customer_name
    ? p.sites.filter((site: Row) => siteBelongsToCustomer(site, p.form.customer_id || p.form.customer_name, p.customers))
    : p.sites;

  const selectCustomer = (value: string) => {
    const customer = findCustomerByValue(p.customers, value);
    p.setForm({
      ...p.form,
      customer_id: isUuid(value) ? value : customer && isUuid(customer.id) ? customer.id : "",
      customer_name: customerLabel(customer) || value,
      customer_address: customerAddress(customer),
      work_site_id: "",
      object_name: "",
      object_address: "",
    });
  };

  const selectSite = (value: string) => {
    const site = p.sites.find((s: Row) => s.id === value);
    const customer = findCustomerByValue(p.customers, site?.customer_id || site?.customer_name || p.form.customer_id || p.form.customer_name || "");
    p.setForm({
      ...p.form,
      work_site_id: value,
      object_name: site?.name || "",
      object_address: site?.address || "",
      customer_id: isUuid(site?.customer_id) ? site.customer_id : customer && isUuid(customer.id) ? customer.id : p.form.customer_id,
      customer_name: site?.customer_name || customerLabel(customer) || p.form.customer_name,
      customer_address: site?.customer_address || customerAddress(customer) || p.form.customer_address,
    });
  };

  return (
    <ModalShell title={p.form.id ? "Schlüssel bearbeiten" : "Neuen Schlüssel anlegen"} close={p.close} onSubmit={p.save} saving={p.saving} wide>
      <Field label="Anzahl Schlüssel"><Input required value={p.form.key_name} onChange={(e) => p.setForm({ ...p.form, key_name: e.target.value })} placeholder="z. B. 1" /></Field>
      <Field label="Schlüsselnummer / Kennzeichnung"><Input value={p.form.key_number} onChange={(e) => p.setForm({ ...p.form, key_number: e.target.value })} placeholder="z. B. 12345" /></Field>
      <Field label="Kunde">
        <Select value={selectedCustomerValue} onChange={(e) => selectCustomer(e.target.value)}>
          <option value="">Kunde auswählen</option>
          {p.customers.filter((c: Row) => customerLabel(c)).map((c: Row) => <option key={customerValue(c)} value={customerValue(c)}>{customerLabel(c)}{customerAddress(c) ? ` · ${customerAddress(c)}` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Objekt / Standort">
        <Select value={p.form.work_site_id} onChange={(e) => selectSite(e.target.value)}>
          <option value="">Objekt auswählen</option>
          {filteredSites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` · ${s.address}` : ""}</option>)}
        </Select>
      </Field>
      <Field label="Mitarbeiter">
        <Select value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}>
          <option value="">Mitarbeiter auswählen</option>
          {p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}
        </Select>
      </Field>
      <Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option>Ausgegeben</option><option>Zurückgegeben</option><option>Verloren</option><option>Archiv</option></Select></Field>
      <Field label="Ausgabe"><Input type="date" value={p.form.handover_date} onChange={(e) => p.setForm({ ...p.form, handover_date: e.target.value })} /></Field>
      <Field label="Rückgabe"><Input type="date" value={p.form.return_date} onChange={(e) => p.setForm({ ...p.form, return_date: e.target.value })} /></Field>
      <Field label="Kommentar" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field>
    </ModalShell>
  );
}
function TimeCorrectionModal(p: any) {
  return (
    <ModalShell title={p.form.id ? "Zeit korrigieren" : "Zeitkorrektur erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide>
      <Field label="Mitarbeiter">
        <Select required value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}>
          <option value="">Mitarbeiter auswählen</option>
          {p.employees.map((employee: Row) => <option key={employee.id || employee.name} value={employee.name}>{employee.name}</option>)}
        </Select>
      </Field>
      <Field label="Objekt">
        <Select value={p.form.work_site_id} onChange={(e) => {
          const site = p.sites.find((item: Row) => item.id === e.target.value);
          p.setForm({ ...p.form, work_site_id: e.target.value, site: site?.name || "" });
        }}>
          <option value="">Objekt auswählen</option>
          {p.sites.map((site: Row) => <option key={site.id || site.name} value={site.id}>{siteOptionLabel(site)}</option>)}
        </Select>
      </Field>
      <Field label="Datum"><Input type="date" value={p.form.work_date} onChange={(e) => p.setForm({ ...p.form, work_date: e.target.value })} /></Field>
      <Field label="Von"><Input type="time" value={p.form.start_time} onChange={(e) => p.setForm({ ...p.form, start_time: e.target.value })} /></Field>
      <Field label="Bis"><Input type="time" value={p.form.end_time} onChange={(e) => p.setForm({ ...p.form, end_time: e.target.value })} /></Field>
      <Field label="Freigabe"><Select value={p.form.approved ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, approved: e.target.value === "true" })}><option value="true">Direkt freigeben</option><option value="false">Offen lassen</option></Select></Field>
      <Field label="Grund"><Input value={p.form.reason} onChange={(e) => p.setForm({ ...p.form, reason: e.target.value })} placeholder="z. B. Mitarbeiter hat vergessen auszustempeln" /></Field>
      <Field label="Kommentar" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} placeholder="Interner Kommentar" /></Field>
    </ModalShell>
  );
}

function AbsenceModal(p: any) { return <ModalShell title={p.form.id ? "Abwesenheit bearbeiten" : "Abwesenheit erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Mitarbeiter"><Select required value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Art"><Select value={p.form.absence_type} onChange={(e) => p.setForm({ ...p.form, absence_type: e.target.value })}><option>Urlaub</option><option>Krank</option><option>Bezahlt Frei</option><option>Unbezahlt Frei</option><option>Sonstiges</option></Select></Field><Field label="Von"><Input type="date" value={p.form.start_date} onChange={(e) => p.setForm({ ...p.form, start_date: e.target.value })} /></Field><Field label="Bis"><Input type="date" value={p.form.end_date} onChange={(e) => p.setForm({ ...p.form, end_date: e.target.value })} /></Field><Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option value="open">Offen</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option></Select></Field><Field label="Grund" wide><Textarea value={p.form.reason} onChange={(e) => p.setForm({ ...p.form, reason: e.target.value })} /></Field></ModalShell>; }
