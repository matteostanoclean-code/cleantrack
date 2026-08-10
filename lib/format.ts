/** Gemeinsame Formatierung für Datum, Uhrzeit und Dauer. Immer deutsch, immer gleich. */

const WEEKDAY_DATE = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const DAY_MONTH = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

export function two(value: number) {
  return String(Math.abs(Math.trunc(value))).padStart(2, "0");
}

/** 90 → "01:30" */
export function hhmm(minutes?: number | null) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

/** -29 → "- 00:29", 15 → "+ 00:15", 0 → "00:00" */
export function signedHhmm(minutes?: number | null) {
  const value = Math.round(Number(minutes || 0));
  if (!value) return "00:00";
  return `${value < 0 ? "-" : "+"} ${hhmm(Math.abs(value))}`;
}

/** 90 → "1:30 h", 45 → "45 Min." */
export function hoursLabel(minutes?: number | null) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(total / 60);
  if (!hours) return `${total} Min.`;
  return `${hours}:${two(total % 60)} h`;
}

function toDate(value?: string | null) {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : `${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-05-04" → "Mo., 04.05.2026" */
export function formatDateDE(value?: string | null) {
  const date = toDate(value);
  return date ? WEEKDAY_DATE.format(date) : "—";
}

/** "2026-05-04" → "04.05.2026" */
export function formatShortDateDE(value?: string | null) {
  const date = toDate(value);
  return date ? SHORT_DATE.format(date) : "—";
}

/** "2026-05-04" → "4. Mai" */
export function formatDayMonthDE(value?: string | null) {
  const date = toDate(value);
  return date ? DAY_MONTH.format(date) : "—";
}

/** ISO-Zeitstempel oder "08:00:00" → "08:00" */
export function formatTimeDE(value?: string | null) {
  if (!value) return "—";
  const raw = String(value);
  if (/^\d{2}:\d{2}/.test(raw)) return raw.slice(0, 5);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : TIME.format(date);
}

/** "08:30" → 510 Minuten seit Mitternacht. Ungültige Eingabe → null. */
export function parseHm(value?: string | null) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 510 → "08:30" */
export function minutesToHm(minutes?: number | null) {
  const total = ((Math.round(Number(minutes || 0)) % 1440) + 1440) % 1440;
  return `${two(Math.floor(total / 60))}:${two(total % 60)}`;
}

/** Minuten zwischen zwei "HH:MM"-Zeiten, über Mitternacht hinweg. */
export function minutesBetweenHm(start?: string | null, end?: string | null) {
  const from = parseHm(start);
  const to = parseHm(end);
  if (from === null || to === null) return 0;
  return to >= from ? to - from : 1440 - from + to;
}

export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Lokales Datum (nicht UTC) eines Zeitstempels als "YYYY-MM-DD". */
export function localDayIso(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

export function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Montag der Woche, in der das Datum liegt. */
export function startOfWeekIso(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = (date.getDay() + 6) % 7;
  return addDaysIso(iso, -weekday);
}

export function mapsUrlForCoords(latitude?: number | null, longitude?: number | null) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
