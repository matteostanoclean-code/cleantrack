"use client";

/**
 * Zeitenfreigabe für das Büro.
 *
 * Zeigt jede erfasste Arbeitszeit gegen die Vorgabe, macht Abweichungen und
 * Standortfehler sichtbar und lässt Zeiten vor der Freigabe korrigieren.
 * Vergessenes Ausstempeln kann direkt nachgetragen werden.
 *
 * Unter „Nicht erfasst“ stehen vergangene Einsätze ganz ohne Stempel, mit der
 * 7-Tage-Frist nach § 17 MiLoG. Dort trägt das Büro die Zeit selbst ein oder
 * fragt beim Mitarbeiter nach.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
  ActionBar,
  Banner,
  Button,
  Chip,
  ChipRow,
  DetailRow,
  DetailSheet,
  EmptyState,
  PageHeader,
  SearchInput,
  SectionHeading,
  SegmentedTabs,
  Spinner,
  StatusPill,
  TileInput,
  UiIcon,
  cx
} from "@/components/ui";
import {
  addDaysIso,
  formatDateDE,
  formatTimeDE,
  hhmm,
  hoursLabel,
  localDayIso,
  mapsUrlForCoords,
  minutesBetweenHm,
  minutesToHm,
  signedHhmm,
  startOfWeekIso,
  todayIso
} from "@/lib/format";

type LogRow = {
  id: string;
  action?: string | null;
  label: string;
  time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distanceM?: number | null;
  allowedRadiusM?: number | null;
  ok: boolean;
  message?: string | null;
};

type TimeRecord = {
  id: string;
  entryId: string | null;
  taskId: string | null;
  employeeName: string;
  siteName: string;
  workSiteId: string | null;
  customerName: string | null;
  taskTitle: string | null;
  date: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedMinutes: number;
  actualStart: string | null;
  actualEnd: string | null;
  actualMinutes: number;
  breakMinutes: number;
  travelMinutes: number;
  approvedMinutes: number | null;
  deviationMinutes: number;
  state: "open" | "approved" | "rejected";
  approvalStatus: string;
  adminResponse: string | null;
  employeeReason: string | null;
  locationIssue: boolean;
  windowIssue?: boolean;
  windowFrom?: string | null;
  windowTo?: string | null;
  incomplete: boolean;
  log: LogRow[];
};

type MissingRecord = {
  id: string;
  taskId: string;
  employeeName: string;
  siteName: string;
  workSiteId: string | null;
  customerName: string | null;
  taskTitle: string | null;
  date: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedMinutes: number;
  fristBis: string;
  tageUebrig: number;
  dringend: boolean;
};

type Correction = { startTime?: string; endTime?: string; breakMinutes?: number; travelMinutes?: number; adminResponse?: string };

type ApiResponse = {
  ok: boolean;
  error?: string;
  records: TimeRecord[];
  missing?: MissingRecord[];
  summary: { open: number; approved: number; rejected: number; issues: number; missing?: number; missingUrgent?: number };
  employees: Array<{ id: string; name: string; active?: boolean | null }>;
  sites: Array<{ id: string | null; name: string }>;
};

type RangeKey = "today" | "week" | "month" | "all";
type StateKey = "missing" | "open" | "approved" | "rejected" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Heute",
  week: "Diese Woche",
  month: "Dieser Monat",
  all: "Letzte 90 Tage"
};

function rangeDates(range: RangeKey) {
  const today = todayIso();
  if (range === "today") return { from: today, to: today };
  if (range === "week") return { from: startOfWeekIso(today), to: addDaysIso(startOfWeekIso(today), 6) };
  if (range === "month") return { from: `${today.slice(0, 7)}-01`, to: addDaysIso(`${today.slice(0, 7)}-01`, 31) };
  return { from: addDaysIso(today, -90), to: today };
}

function stateTone(record: TimeRecord) {
  if (record.state === "approved") return { tone: "success" as const, label: "Freigegeben" };
  if (record.state === "rejected") return { tone: "danger" as const, label: "Abgelehnt" };
  return { tone: "pending" as const, label: "Ausstehend" };
}

function fristTone(row: MissingRecord) {
  if (row.tageUebrig < 0) {
    const tage = Math.abs(row.tageUebrig);
    return { tone: "danger" as const, label: `Frist seit ${tage} ${tage === 1 ? "Tag" : "Tagen"} vorbei` };
  }
  if (row.tageUebrig === 0) return { tone: "danger" as const, label: "Heute letzter Tag" };
  if (row.dringend) return { tone: "warn" as const, label: `Noch ${row.tageUebrig} ${row.tageUebrig === 1 ? "Tag" : "Tage"}` };
  return { tone: "neutral" as const, label: `Frist bis ${formatDateDE(row.fristBis)}` };
}

function plannedLabel(row: MissingRecord) {
  return row.plannedStart && row.plannedEnd ? `${row.plannedStart} - ${row.plannedEnd}` : `${hhmm(row.plannedMinutes)} Std.`;
}

function deviationLabel(minutes: number) {
  if (!minutes) return null;
  return minutes < 0 ? "Unterschreitung" : "Überschreitung";
}

export default function TimeApprovalPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [range, setRange] = useState<RangeKey>("month");
  const [stateFilter, setStateFilter] = useState<StateKey>("open");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [query, setQuery] = useState("");

  const [openRecord, setOpenRecord] = useState<TimeRecord | null>(null);
  const [openMissing, setOpenMissing] = useState<MissingRecord | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (tokenOverride?: string, rangeOverride?: RangeKey) => {
    const currentToken = tokenOverride || token;
    if (!currentToken) return;
    const { from, to } = rangeDates(rangeOverride || range);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mobile/admin/time-approvals?from=${from}&to=${to}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const result = (await response.json()) as ApiResponse;
      if (!response.ok || !result.ok) throw new Error(result.error || "Zeiten konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Zeiten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [range, token]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token || "";
        if (!mounted) return;
        // Von der Startseite kommt man mit ?ansicht=fehlt direkt in die Liste.
        if (new URLSearchParams(window.location.search).get("ansicht") === "fehlt") setStateFilter("missing");
        setToken(accessToken);
        setAuthLoading(false);
        if (accessToken) await load(accessToken);
      } catch (initError) {
        if (!mounted) return;
        setError(initError instanceof Error ? initError.message : "Login konnte nicht geprüft werden.");
        setAuthLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const records = useMemo(() => {
    const rows = data?.records || [];
    const search = query.trim().toLowerCase();
    return rows.filter((record) => {
      if (stateFilter !== "all" && record.state !== stateFilter) return false;
      if (employeeFilter && record.employeeName !== employeeFilter) return false;
      if (siteFilter && record.siteName !== siteFilter) return false;
      if (onlyIssues && !record.locationIssue && !record.incomplete) return false;
      if (search) {
        const haystack = `${record.employeeName} ${record.siteName} ${record.customerName || ""} ${record.taskTitle || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [data?.records, employeeFilter, onlyIssues, query, siteFilter, stateFilter]);

  const missing = useMemo(() => {
    const rows = data?.missing || [];
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (employeeFilter && row.employeeName !== employeeFilter) return false;
      if (siteFilter && row.siteName !== siteFilter) return false;
      if (search) {
        const haystack = `${row.employeeName} ${row.siteName} ${row.customerName || ""} ${row.taskTitle || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [data?.missing, employeeFilter, query, siteFilter]);

  const showMissing = stateFilter === "missing";

  async function decide(record: TimeRecord, action: "approve" | "reject", correction?: Correction) {
    setSavingId(record.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/mobile/admin/time-approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          entryId: record.entryId,
          taskId: record.taskId,
          employeeName: record.employeeName,
          date: record.date,
          ...correction
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Freigabe konnte nicht gespeichert werden.");
      setNotice(action === "approve"
        ? `${record.employeeName}: ${hoursLabel(result.approvedMinutes)} freigegeben.`
        : `${record.employeeName}: Zeit abgelehnt, gebucht bleibt die Vorgabe.`);
      setOpenRecord(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Freigabe konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  /** Büro trägt die Zeit für einen Einsatz ohne Stempel selbst ein und gibt sie frei. */
  async function enterMissing(row: MissingRecord, correction: Correction) {
    setSavingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/mobile/admin/time-approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "approve",
          taskId: row.taskId,
          employeeName: row.employeeName,
          date: row.date,
          ...correction
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Zeit konnte nicht eingetragen werden.");
      setNotice(`${row.employeeName}, ${formatDateDE(row.date)}: ${hoursLabel(result.approvedMinutes)} eingetragen und freigegeben.`);
      setOpenMissing(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Zeit konnte nicht eingetragen werden.");
    } finally {
      setSavingId(null);
    }
  }

  /**
   * Beim Mitarbeiter nachfragen. Geht als Chat mit Push raus — die Nachricht
   * bleibt im Verlauf stehen und belegt, dass das Büro sich gekümmert hat.
   */
  async function askEmployee(row: MissingRecord) {
    setSavingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const message = `Bitte teile mir deine Arbeitszeit für ${row.siteName} am ${formatDateDE(row.date)} mit (Von, Bis, Pause). Du kannst sie auch selbst im Stundenzettel unter „Nicht erfasst“ nachtragen.`;
      const response = await fetch("/api/mobile/admin/chat-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeName: row.employeeName, message })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Nachfrage konnte nicht gesendet werden.");
      setNotice(`Nachfrage an ${row.employeeName} gesendet.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Nachfrage konnte nicht gesendet werden.");
    } finally {
      setSavingId(null);
    }
  }

  /** Einsatz hat gar nicht stattgefunden: absagen, dann fehlt auch keine Zeit. */
  async function cancelMissing(row: MissingRecord) {
    if (!window.confirm(`Einsatz bei ${row.siteName} am ${formatDateDE(row.date)} als ausgefallen markieren? Es wird dann keine Zeit gebucht.`)) return;
    setSavingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/mobile/admin/dashboard", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "task_status", id: row.taskId, status: "cancelled", done: true })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Einsatz konnte nicht abgesagt werden.");
      setNotice(`Einsatz am ${formatDateDE(row.date)} als ausgefallen markiert.`);
      setOpenMissing(null);
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Einsatz konnte nicht abgesagt werden.");
    } finally {
      setSavingId(null);
    }
  }

  if (authLoading) {
    return <main className="min-h-[100dvh] bg-paper-100"><Spinner label="Prüfe Anmeldung…" /></main>;
  }

  if (!token) {
    return (
      <main className="min-h-[100dvh] bg-paper-100">
        <PageHeader title="Zeitenfreigabe" backHref="/mitarbeiter/admin" />
        <div className="mx-auto max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 px-4 py-6">
          <Banner tone="warn">Bitte zuerst in der App anmelden, dann diese Seite erneut öffnen.</Banner>
          <div className="mt-4"><a href="/mitarbeiter" className="text-[15px] font-semibold text-brand-700">Zur Anmeldung</a></div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 pb-10">
      <div className="mx-auto max-w-[520px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8 bg-paper-100">
        <PageHeader
          title="Zeitenfreigabe"
          backHref="/mitarbeiter/admin"
          right={
            <button onClick={() => load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-full text-ink-600 disabled:opacity-40" aria-label="Aktualisieren">
              <UiIcon name="refresh" className={cx("h-5 w-5", loading && "animate-spin")} />
            </button>
          }
        />

        <div className="bg-white px-4 pb-3 pt-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Mitarbeiter oder Objekt suchen" />
        </div>

        <div className="border-b border-paper-200 bg-white">
          <ChipRow>
            {/* Fehlende Zeiten kommen immer aus den letzten 90 Tagen, der Zeitraum gilt dort nicht. */}
            {showMissing ? null : (
              <Chip label={RANGE_LABEL[range]} icon="calendar" active onClick={() => {
                const order: RangeKey[] = ["today", "week", "month", "all"];
                const next = order[(order.indexOf(range) + 1) % order.length];
                setRange(next);
                load(undefined, next);
              }} />
            )}
            <Chip
              label="Nicht erfasst"
              icon={data?.summary.missingUrgent ? "warning" : undefined}
              active={showMissing}
              count={data?.summary.missing}
              onClick={() => setStateFilter("missing")}
            />
            <Chip label="Offen" active={stateFilter === "open"} count={data?.summary.open} onClick={() => setStateFilter("open")} />
            <Chip label="Freigegeben" active={stateFilter === "approved"} onClick={() => setStateFilter("approved")} />
            <Chip label="Abgelehnt" active={stateFilter === "rejected"} onClick={() => setStateFilter("rejected")} />
            <Chip label="Alle" active={stateFilter === "all"} onClick={() => setStateFilter("all")} />
            {showMissing ? null : (
              <Chip label="Nur Fehler" icon="warning" active={onlyIssues} count={data?.summary.issues} onClick={() => setOnlyIssues((value) => !value)} />
            )}
          </ChipRow>

          {(data?.employees?.length || data?.sites?.length) ? (
            <div className="grid grid-cols-2 gap-2 px-4 pb-3">
              <select
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
                className="w-full rounded-xl border border-paper-200 bg-white px-3 py-2.5 text-[14px] text-ink-800 outline-none"
              >
                <option value="">Alle Mitarbeiter</option>
                {(data?.employees || []).map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
              </select>
              <select
                value={siteFilter}
                onChange={(event) => setSiteFilter(event.target.value)}
                className="w-full rounded-xl border border-paper-200 bg-white px-3 py-2.5 text-[14px] text-ink-800 outline-none"
              >
                <option value="">Alle Objekte</option>
                {(data?.sites || []).map((site) => <option key={site.name} value={site.name}>{site.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-4 pt-4">
          {error ? <Banner tone="danger">{error}</Banner> : null}
          {notice ? <Banner tone="success">{notice}</Banner> : null}

          {loading && !data ? <Spinner label="Lade Zeiten…" /> : null}

          {showMissing ? (
            <MissingList
              rows={missing}
              total={data?.missing?.length || 0}
              loading={loading}
              savingId={savingId}
              onOpen={setOpenMissing}
              onAsk={askEmployee}
              onEnterAsPlanned={(row) => enterMissing(row, {
                startTime: row.plannedStart || "",
                endTime: row.plannedEnd || "",
                adminResponse: "Vom Büro nach Plan erfasst."
              })}
            />
          ) : null}

          {!showMissing && !loading && !records.length ? (
            <EmptyState
              icon="clock"
              title={data?.records.length ? "Keine Zeiten in dieser Auswahl" : `Keine Zeiten im Zeitraum „${RANGE_LABEL[range]}“`}
              text={data?.records.length
                ? "Wechsle oben auf „Alle“, um auch bereits freigegebene Zeiten zu sehen."
                : "Tippe oben links auf den Zeitraum, um weiter zurück zu schauen."}
            />
          ) : null}

          {/*
            Am Rechner eine Tabelle mit Haken und Kreuz direkt in der Zeile.
            Der Normalfall ist "passt, freigeben" — dafür soll man das Blatt
            nicht erst öffnen müssen. Am Handy bleiben es Karten, dort ist eine
            Tabelle mit acht Spalten unbrauchbar.
          */}
          {!showMissing && records.length ? (
            <div className="hidden overflow-x-auto rounded-2xl bg-white md:block">
              <table className="w-full min-w-[900px] text-left">
                <thead>
                  <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Einsatz</th>
                    <th className="px-3 py-3">Fehler</th>
                    <th className="px-3 py-3 text-right">Soll-Zeit</th>
                    <th className="px-3 py-3 text-right">Abweichung</th>
                    <th className="px-3 py-3 text-center">Freigeben</th>
                    <th className="px-3 py-3 text-center">Ablehnen</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const tone = stateTone(record);
                    const fehler: string[] = [];
                    if (record.locationIssue) fehler.push("Standortfehler");
                    if (record.incomplete) fehler.push("Kein Ausstempeln");
                    if (record.windowIssue) fehler.push("Ausserhalb Zeitfenster");
                    if (Math.abs(record.deviationMinutes) > 5) fehler.push(record.deviationMinutes < 0 ? "Unterschreitung" : "Überschreitung");
                    return (
                      <tr key={record.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-4 py-3 text-[14px] font-semibold text-ink-900">{formatDateDE(record.date)}</td>
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-3 py-3 text-[14px] text-ink-700">{record.employeeName}</td>
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-3 py-3">
                          {record.taskTitle ? <span className="block text-[12px] text-ink-400">{record.taskTitle}</span> : null}
                          <span className="text-[14px] text-ink-700">{record.siteName}</span>
                        </td>
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-3 py-3">
                          {fehler.length ? (
                            <span className="rounded-md bg-brand-100 px-2 py-1 text-[12px] font-semibold text-brand-700">
                              {fehler[0]}{fehler.length > 1 ? ` +${fehler.length - 1}` : ""}
                            </span>
                          ) : <span className="text-[13px] text-ink-300">–</span>}
                        </td>
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-3 py-3 text-right text-[14px] text-ink-700">{hhmm(record.plannedMinutes)} Std.</td>
                        <td onClick={() => setOpenRecord(record)} className="cursor-pointer px-3 py-3 text-right">
                          {record.deviationMinutes ? (
                            <span className={cx("text-[14px] font-semibold", record.deviationMinutes < 0 ? "text-danger-600" : "text-amber-700")}>
                              {signedHhmm(record.deviationMinutes)} Std.
                            </span>
                          ) : <span className="text-[14px] text-ink-400">–</span>}
                        </td>

                        {record.state === "open" ? (
                          <>
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => decide(record, "approve")}
                                disabled={savingId === record.id || record.incomplete}
                                title={record.incomplete ? "Erst im Blatt eine Endzeit eintragen" : "Zeit freigeben"}
                                className="grid h-9 w-9 place-items-center rounded-lg bg-success-500 text-white disabled:opacity-30"
                                aria-label="Zeit freigeben"
                              >
                                <UiIcon name="check" className="h-4 w-4" />
                              </button>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => decide(record, "reject")}
                                disabled={savingId === record.id}
                                title="Nur die geplante Zeit gutschreiben"
                                className="grid h-9 w-9 place-items-center rounded-lg bg-danger-500 text-white disabled:opacity-30"
                                aria-label="Zeit ablehnen"
                              >
                                <UiIcon name="close" className="h-4 w-4" />
                              </button>
                            </td>
                          </>
                        ) : (
                          <td colSpan={2} className="px-3 py-3 text-center"><StatusPill tone={tone.tone}>{tone.label}</StatusPill></td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className={cx("space-y-3 md:hidden", showMissing && "hidden")}>
            {records.map((record) => {
              const tone = stateTone(record);
              return (
                <article key={record.id} className="rounded-2xl bg-white p-4">
                  <button onClick={() => setOpenRecord(record)} className="flex w-full items-start gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[16px] font-bold text-ink-900">{formatDateDE(record.date)}</p>
                        {record.locationIssue ? <StatusPill tone="info">Standort stimmt nicht</StatusPill> : null}
                        {record.incomplete ? <StatusPill tone="warn">Kein Ausstempeln</StatusPill> : null}
                      </div>
                      <p className="mt-1 text-[14px] text-ink-400">{record.employeeName} · {record.siteName}</p>
                      <p className="mt-2 text-[14px] text-ink-400">Soll: {hhmm(record.plannedMinutes)}</p>
                      {record.deviationMinutes ? (
                        <p className={cx("text-[14px] font-semibold", record.deviationMinutes < 0 ? "text-danger-600" : "text-amber-700")}>
                          {signedHhmm(record.deviationMinutes)}
                        </p>
                      ) : (
                        <p className="text-[14px] text-ink-400">Ist: {hhmm(record.actualMinutes)}</p>
                      )}
                    </div>
                    {record.state === "open" ? null : <StatusPill tone={tone.tone}>{tone.label}</StatusPill>}
                  </button>

                  {record.state === "open" ? (
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        onClick={() => decide(record, "reject")}
                        disabled={savingId === record.id}
                        className="grid h-11 w-11 place-items-center rounded-xl bg-danger-500 text-white disabled:opacity-50"
                        aria-label="Zeit ablehnen"
                      >
                        <UiIcon name="close" className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => decide(record, "approve")}
                        disabled={savingId === record.id || record.incomplete}
                        className="grid h-11 w-11 place-items-center rounded-xl bg-success-500 text-white disabled:opacity-50"
                        aria-label="Zeit freigeben"
                      >
                        <UiIcon name="check" className="h-5 w-5" />
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </div>

      {openRecord ? (
        <RecordSheet
          record={openRecord}
          saving={savingId === openRecord.id}
          onClose={() => setOpenRecord(null)}
          onDecide={decide}
        />
      ) : null}

      {openMissing ? (
        <MissingSheet
          row={openMissing}
          saving={savingId === openMissing.id}
          onClose={() => setOpenMissing(null)}
          onEnter={enterMissing}
          onAsk={askEmployee}
          onCancel={cancelMissing}
        />
      ) : null}
    </main>
  );
}

function RecordSheet({ record, saving, onClose, onDecide }: {
  record: TimeRecord;
  saving: boolean;
  onClose: () => void;
  onDecide: (record: TimeRecord, action: "approve" | "reject", correction?: Correction) => Promise<void>;
}) {
  const [tab, setTab] = useState<"details" | "log">("details");
  const [startTime, setStartTime] = useState(record.actualStart ? formatTimeDE(record.actualStart) : record.plannedStart || "");
  const [endTime, setEndTime] = useState(record.actualEnd ? formatTimeDE(record.actualEnd) : record.plannedEnd || "");
  const [breakMinutes, setBreakMinutes] = useState(String(record.breakMinutes || 0));
  const [travelMinutes, setTravelMinutes] = useState(String(record.travelMinutes || 0));
  const [note, setNote] = useState("");

  const gross = minutesBetweenHm(startTime, endTime);
  const netMinutes = Math.max(0, gross - Number(breakMinutes || 0)) + Number(travelMinutes || 0);
  const tone = stateTone(record);
  const checkIn = record.log.find((row) => row.action === "clock_in") || record.log[0] || null;
  const checkOut = [...record.log].reverse().find((row) => row.action === "clock_out") || null;
  const checkInUrl = mapsUrlForCoords(checkIn?.latitude, checkIn?.longitude);
  const checkOutUrl = mapsUrlForCoords(checkOut?.latitude, checkOut?.longitude);

  function submit(action: "approve" | "reject") {
    onDecide(record, action, {
      startTime,
      endTime,
      breakMinutes: Number(breakMinutes || 0),
      travelMinutes: Number(travelMinutes || 0),
      adminResponse: note.trim()
    });
  }

  return (
    <DetailSheet
      title={record.siteName}
      subtitle={`${record.employeeName} · ${formatDateDE(record.date)}`}
      status={<StatusPill tone={tone.tone}>{tone.label}</StatusPill>}
      onClose={onClose}
      tabs={<SegmentedTabs tabs={[{ key: "details", label: "Details" }, { key: "log", label: "Logbuch" }]} value={tab} onChange={setTab} />}
      footer={
        <ActionBar>
          <Button variant="danger" disabled={saving} onClick={() => submit("reject")}>Ablehnen</Button>
          <Button variant="success" disabled={saving} onClick={() => submit("approve")}>{saving ? "Speichere…" : "Freigeben"}</Button>
        </ActionBar>
      }
    >
      {tab === "details" ? (
        <>
          <SectionHeading>Vorgabe</SectionHeading>
          <DetailRow icon="pin" label="Objekt" value={record.siteName} hint={record.customerName || undefined} />
          <DetailRow icon="calendar" label="Datum" value={formatDateDE(record.date)} />
          <DetailRow
            icon="clock"
            label="Zeitraum"
            value={record.plannedStart && record.plannedEnd ? `${record.plannedStart} - ${record.plannedEnd}` : "Keine feste Vorgabe"}
          />
          <DetailRow icon="target" label="Soll-Zeit" value={hhmm(record.plannedMinutes)} />

          <SectionHeading>Erfassung</SectionHeading>
          <DetailRow
            icon="clock"
            label="Zeitraum"
            value={record.actualStart ? `${formatTimeDE(record.actualStart)} - ${record.actualEnd ? formatTimeDE(record.actualEnd) : "offen"}` : "Nicht erfasst"}
          />
          <DetailRow
            icon="stopwatch"
            label="Arbeitszeit"
            value={hhmm(record.actualMinutes)}
            hint={record.breakMinutes ? `davon ${record.breakMinutes} Min. Pause erfasst` : undefined}
          />

          {record.deviationMinutes ? (
            <div className="flex items-center gap-2 border-b border-paper-200 px-4 py-3">
              <span className={record.deviationMinutes < 0 ? "text-danger-500" : "text-amber-700"}>
                <UiIcon name="warning" className="h-[22px] w-[22px]" />
              </span>
              <span className={cx("text-[16px] font-semibold", record.deviationMinutes < 0 ? "text-danger-600" : "text-amber-700")}>
                {signedHhmm(record.deviationMinutes)}
              </span>
              <span className="rounded-md bg-paper-100 px-2 py-1 text-[13px] text-ink-600">{deviationLabel(record.deviationMinutes)}</span>
            </div>
          ) : null}

          {record.employeeReason ? (
            <DetailRow icon="chat" label="Begründung vom Mitarbeiter" value={record.employeeReason} />
          ) : null}

          {record.incomplete ? (
            <div className="px-4 py-3">
              <Banner tone="warn">Es wurde nicht ausgestempelt. Trage unten Von und Bis ein, dann kannst du die Zeit nachtragen und freigeben.</Banner>
            </div>
          ) : null}

          <div className="px-4 py-3">
            <div className="flex items-start gap-3 rounded-xl bg-paper-100 px-3.5 py-3">
              <span className={record.locationIssue ? "text-danger-500" : "text-ink-400"}>
                <UiIcon name="pin" className="h-[22px] w-[22px]" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                {checkInUrl ? (
                  <a href={checkInUrl} target="_blank" rel="noreferrer" className="block text-[15px] font-medium text-brand-600">Check-In Standort ansehen</a>
                ) : <p className="text-[15px] text-ink-400">Kein Check-In Standort</p>}
                {checkOutUrl ? (
                  <a href={checkOutUrl} target="_blank" rel="noreferrer" className="block text-[15px] font-medium text-brand-600">Check-Out Standort ansehen</a>
                ) : <p className="text-[15px] text-ink-400">Kein Check-Out Standort</p>}
              </div>
              <span className="shrink-0 text-[13px] text-ink-400">{record.locationIssue ? "Standortfehler" : "Standort passt"}</span>
            </div>
          </div>

          <SectionHeading>Freigabe</SectionHeading>
          <div className="grid grid-cols-2 gap-3 px-4 pb-3">
            <TileInput icon="login" label="Von" value={startTime} onChange={setStartTime} placeholder="08:00" />
            <TileInput icon="logout" label="Bis" value={endTime} onChange={setEndTime} placeholder="16:30" />
            <TileInput icon="coffee" label="Pause" value={breakMinutes} onChange={setBreakMinutes} inputMode="numeric" suffix="min" />
            <TileInput icon="car" label="Fahrzeit" value={travelMinutes} onChange={setTravelMinutes} inputMode="numeric" suffix="min" />
          </div>

          <div className="px-4 pb-3">
            <div className="flex items-center justify-between rounded-xl bg-paper-100 px-3.5 py-3">
              <span className="flex items-center gap-2 text-ink-600">
                <UiIcon name="euro" className="h-[18px] w-[18px]" />
                <UiIcon name="clock" className="h-[18px] w-[18px]" />
                <span className="text-[17px] font-semibold text-ink-900">{minutesToHm(netMinutes)}</span>
              </span>
              <span className="text-[13px] text-ink-400">wird gebucht</span>
            </div>
          </div>

          <div className="px-4 pb-4">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Hinweis an den Mitarbeiter (optional)"
              className="w-full rounded-xl border border-paper-200 px-3.5 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
            />
          </div>
        </>
      ) : (
        <div className="pt-2">
          {record.log.length ? record.log.map((row) => (
            <div key={row.id} className="flex items-start gap-3 border-b border-paper-200 px-4 py-3.5">
              <span className={cx("mt-0.5", row.ok ? "text-success-600" : "text-danger-500")}>
                <UiIcon name={row.ok ? "check" : "warning"} className="h-[20px] w-[20px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-ink-900">{row.label}</p>
                <p className="mt-0.5 text-[13px] text-ink-400">
                  {formatTimeDE(row.time)}
                  {row.distanceM !== null && row.distanceM !== undefined ? ` · ${row.distanceM} m vom Objekt` : ""}
                  {row.allowedRadiusM ? ` · erlaubt ${row.allowedRadiusM} m` : ""}
                </p>
                {row.message ? <p className="mt-1 text-[13px] text-ink-400">{row.message}</p> : null}
              </div>
            </div>
          )) : <EmptyState icon="list" title="Keine Stempel vorhanden" text="Für diesen Tag wurde nichts erfasst." />}

          {record.adminResponse ? (
            <div className="px-4 pt-4">
              <Banner tone="info">Letzte Rückmeldung ans Team: {record.adminResponse}</Banner>
            </div>
          ) : null}
        </div>
      )}
    </DetailSheet>
  );
}

function MissingList({ rows, total, loading, savingId, onOpen, onAsk, onEnterAsPlanned }: {
  rows: MissingRecord[];
  total: number;
  loading: boolean;
  savingId: string | null;
  onOpen: (row: MissingRecord) => void;
  onAsk: (row: MissingRecord) => void;
  onEnterAsPlanned: (row: MissingRecord) => void;
}) {
  if (loading && !total) return <Spinner label="Suche Einsätze ohne Zeit…" />;

  if (!rows.length) {
    return (
      <EmptyState
        icon="check"
        title={total ? "Keine Einsätze in dieser Auswahl" : "Alles erfasst"}
        text={total ? "Mitarbeiter- oder Objektfilter oben zurücksetzen." : "Zu jedem Einsatz der letzten 90 Tage liegt eine Zeit vor."}
      />
    );
  }

  return (
    <>
      <Banner tone="info">
        Hier fehlt die Arbeitszeit ganz. Die Aufzeichnung muss bis zum 7. Tag nach dem Einsatz vorliegen, auch wenn der
        Mitarbeiter sie melden sollte. Trag die Zeit ein oder frag nach.
      </Banner>

      {/* Am Rechner als Tabelle, am Handy als Karten — wie die übrigen Zeiten. */}
      <div className="hidden overflow-x-auto rounded-2xl bg-white md:block">
        <table className="w-full min-w-[900px] text-left">
          <thead>
            <tr className="border-b border-paper-200 text-[12px] font-bold uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3">Datum</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Einsatz</th>
              <th className="px-3 py-3">Geplant</th>
              <th className="px-3 py-3">Frist</th>
              <th className="px-3 py-3 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const frist = fristTone(row);
              const busy = savingId === row.id;
              return (
                <tr key={row.id} className="border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                  <td onClick={() => onOpen(row)} className="cursor-pointer px-4 py-3 text-[14px] font-semibold text-ink-900">{formatDateDE(row.date)}</td>
                  <td onClick={() => onOpen(row)} className="cursor-pointer px-3 py-3 text-[14px] text-ink-700">{row.employeeName}</td>
                  <td onClick={() => onOpen(row)} className="cursor-pointer px-3 py-3">
                    {row.taskTitle ? <span className="block text-[12px] text-ink-400">{row.taskTitle}</span> : null}
                    <span className="text-[14px] text-ink-700">{row.siteName}</span>
                  </td>
                  <td onClick={() => onOpen(row)} className="cursor-pointer px-3 py-3 text-[14px] text-ink-700">{plannedLabel(row)}</td>
                  <td onClick={() => onOpen(row)} className="cursor-pointer px-3 py-3"><StatusPill tone={frist.tone}>{frist.label}</StatusPill></td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => onAsk(row)}
                        disabled={busy}
                        title="Per Chat und Push beim Mitarbeiter nachfragen"
                        className="rounded-lg border border-paper-300 px-3 py-2 text-[13px] font-semibold text-ink-700 disabled:opacity-40"
                      >
                        Nachfragen
                      </button>
                      {row.plannedStart && row.plannedEnd ? (
                        <button
                          onClick={() => onEnterAsPlanned(row)}
                          disabled={busy}
                          title={`${row.plannedStart} - ${row.plannedEnd} eintragen und freigeben`}
                          className="rounded-lg bg-success-500 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                        >
                          Wie geplant
                        </button>
                      ) : null}
                      <button
                        onClick={() => onOpen(row)}
                        disabled={busy}
                        className="rounded-lg bg-brand-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                      >
                        Eintragen
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const frist = fristTone(row);
          return (
            <article key={row.id} className="rounded-2xl bg-white p-4">
              <button onClick={() => onOpen(row)} className="flex w-full items-start gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-bold text-ink-900">{formatDateDE(row.date)}</p>
                  <p className="mt-1 text-[14px] text-ink-400">{row.employeeName} · {row.siteName}</p>
                  <p className="mt-2 text-[14px] text-ink-400">Geplant: {plannedLabel(row)}</p>
                </div>
                <StatusPill tone={frist.tone}>{frist.label}</StatusPill>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="neutral" disabled={savingId === row.id} onClick={() => onAsk(row)}>Nachfragen</Button>
                <Button disabled={savingId === row.id} onClick={() => onOpen(row)}>Eintragen</Button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function MissingSheet({ row, saving, onClose, onEnter, onAsk, onCancel }: {
  row: MissingRecord;
  saving: boolean;
  onClose: () => void;
  onEnter: (row: MissingRecord, correction: Correction) => Promise<void>;
  onAsk: (row: MissingRecord) => Promise<void>;
  onCancel: (row: MissingRecord) => Promise<void>;
}) {
  const [startTime, setStartTime] = useState(row.plannedStart || "");
  const [endTime, setEndTime] = useState(row.plannedEnd || "");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [travelMinutes, setTravelMinutes] = useState("0");
  const [note, setNote] = useState("");

  const gross = minutesBetweenHm(startTime, endTime);
  const netMinutes = Math.max(0, gross - Number(breakMinutes || 0)) + Number(travelMinutes || 0);
  const frist = fristTone(row);
  const asPlanned = startTime === row.plannedStart && endTime === row.plannedEnd && !Number(breakMinutes || 0) && !Number(travelMinutes || 0);

  function submit() {
    onEnter(row, {
      startTime,
      endTime,
      breakMinutes: Number(breakMinutes || 0),
      travelMinutes: Number(travelMinutes || 0),
      // Ohne eigenen Hinweis festhalten, woher die Zahl kommt.
      adminResponse: note.trim() || (asPlanned ? "Vom Büro nach Plan erfasst." : "Vom Büro erfasst.")
    });
  }

  return (
    <DetailSheet
      title={row.siteName}
      subtitle={`${row.employeeName} · ${formatDateDE(row.date)}`}
      status={<StatusPill tone={frist.tone}>{frist.label}</StatusPill>}
      onClose={onClose}
      footer={
        <ActionBar>
          <Button variant="neutral" disabled={saving} onClick={() => onAsk(row)}>Nachfragen</Button>
          <Button variant="success" disabled={saving || !startTime || !endTime} onClick={submit}>{saving ? "Speichere…" : "Eintragen"}</Button>
        </ActionBar>
      }
    >
      <SectionHeading>Vorgabe</SectionHeading>
      <DetailRow icon="pin" label="Objekt" value={row.siteName} hint={row.customerName || undefined} />
      <DetailRow icon="calendar" label="Datum" value={formatDateDE(row.date)} />
      <DetailRow icon="clock" label="Zeitraum" value={row.plannedStart && row.plannedEnd ? `${row.plannedStart} - ${row.plannedEnd}` : "Keine feste Vorgabe"} />
      <DetailRow icon="target" label="Soll-Zeit" value={hhmm(row.plannedMinutes)} />
      <DetailRow icon="flag" label="Aufzeichnen bis" value={formatDateDE(row.fristBis)} hint="7 Tage nach dem Einsatz (§ 17 MiLoG)" />

      <div className="px-4 py-3">
        <Banner tone="warn">Zu diesem Einsatz wurde nichts gestempelt. Von und Bis sind mit der Planung vorbelegt. Ändere sie, wenn der Mitarbeiter andere Zeiten genannt hat.</Banner>
      </div>

      <SectionHeading>Zeit eintragen</SectionHeading>
      <div className="grid grid-cols-2 gap-3 px-4 pb-3">
        <TileInput icon="login" label="Von" value={startTime} onChange={setStartTime} placeholder="08:00" />
        <TileInput icon="logout" label="Bis" value={endTime} onChange={setEndTime} placeholder="16:30" />
        <TileInput icon="coffee" label="Pause" value={breakMinutes} onChange={setBreakMinutes} inputMode="numeric" suffix="min" />
        <TileInput icon="car" label="Fahrzeit" value={travelMinutes} onChange={setTravelMinutes} inputMode="numeric" suffix="min" />
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center justify-between rounded-xl bg-paper-100 px-3.5 py-3">
          <span className="flex items-center gap-2 text-ink-600">
            <UiIcon name="euro" className="h-[18px] w-[18px]" />
            <UiIcon name="clock" className="h-[18px] w-[18px]" />
            <span className="text-[17px] font-semibold text-ink-900">{minutesToHm(netMinutes)}</span>
          </span>
          <span className="text-[13px] text-ink-400">wird gebucht</span>
        </div>
      </div>

      <div className="px-4 pb-3">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Woher stammt die Zeit? z. B. „Telefonisch vom Mitarbeiter am …“"
          className="w-full rounded-xl border border-paper-200 px-3.5 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
        />
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => onCancel(row)}
          disabled={saving}
          className="text-[14px] font-semibold text-danger-600 disabled:opacity-40"
        >
          Einsatz hat nicht stattgefunden
        </button>
      </div>
    </DetailSheet>
  );
}
