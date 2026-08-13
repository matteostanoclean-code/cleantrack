"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type AbsenceRow = {
  id: string;
  employee_name?: string | null;
  request_type?: string | null;
  absence_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string | null;
  admin_response?: string | null;
};

type MaterialRow = {
  id: string;
  employee_name?: string | null;
  material_name?: string | null;
  product_name?: string | null;
  object_name?: string | null;
  site?: string | null;
  quantity?: number | null;
  quantity_requested?: number | null;
  message?: string | null;
  comment?: string | null;
  notes?: string | null;
  status?: string | null;
  photo_urls?: string[] | null;
  photo_count?: number | null;
  created_at?: string | null;
};

type QualityRow = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  site?: string | null;
  rating?: number | null;
  checked_items?: string[] | null;
  notes?: string | null;
  status?: string | null;
  photo_urls?: string[] | null;
  photo_count?: number | null;
  created_at?: string | null;
};

type ServiceRow = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  customer_name?: string | null;
  signer_name?: string | null;
  signature_url?: string | null;
  notes?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type TimeApprovalRow = {
  id: string;
  task_id?: string | null;
  employee_name?: string | null;
  work_site_id?: string | null;
  work_site_name?: string | null;
  action?: string | null;
  created_at?: string | null;
  planned_minutes?: number | null;
  actual_minutes?: number | null;
  overtime_minutes?: number | null;
  approved_minutes?: number | null;
  approval_status?: string | null;
  admin_response?: string | null;
};

type ChatRow = {
  id: string;
  employee_name?: string | null;
  sender_name?: string | null;
  sender_role?: string | null;
  message?: string | null;
  body?: string | null;
  text?: string | null;
  status?: string | null;
  todo_status?: string | null;
  read_by_admin?: boolean | null;
  created_at?: string | null;
};

type NotificationRow = {
  id: string;
  title?: string | null;
  message?: string | null;
  employee_name?: string | null;
  work_site_name?: string | null;
  object_name?: string | null;
  site?: string | null;
  status?: string | null;
  notification_type?: string | null;
  created_at?: string | null;
};

type AdminData = {
  ok: boolean;
  error?: string;
  absences: AbsenceRow[];
  materialReports: MaterialRow[];
  chatMessages: ChatRow[];
  notifications: NotificationRow[];
  qualityReports: QualityRow[];
  serviceReports: ServiceRow[];
  timeApprovals: TimeApprovalRow[];
};

type Tab = "time" | "absence" | "material" | "quality" | "service" | "chat" | "notifications";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function hoursLabel(minutes?: number | null) {
  const value = Math.max(0, Math.round(Number(minutes || 0)));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m} Min.`;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

function bodyOf(row: ChatRow) {
  return row.message || row.body || row.text || "Nachricht";
}

function materialName(row: MaterialRow) {
  return row.material_name || row.product_name || "Material";
}

function objectName(row: MaterialRow | NotificationRow) {
  return row.object_name || row.site || ("work_site_name" in row ? row.work_site_name : null) || "Ohne Objekt";
}

/** Status in Klartext statt englischer Datenbankwerte. */
function StatusBadge({ status }: { status?: string | null }) {
  const value = String(status || "open").toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Offen", className: "bg-paper-200 text-ink-600" },
    pending: { label: "Ausstehend", className: "bg-danger-500 text-white" },
    approved: { label: "Freigegeben", className: "bg-brand-100 text-brand-700" },
    done: { label: "Erledigt", className: "bg-success-100 text-success-700" },
    resolved: { label: "Erledigt", className: "bg-success-100 text-success-700" },
    closed: { label: "Erledigt", className: "bg-success-100 text-success-700" },
    rejected: { label: "Abgelehnt", className: "bg-danger-100 text-danger-700" }
  };
  const badge = map[value] || { label: status || "Offen", className: "bg-paper-200 text-ink-600" };
  return <span className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold ${badge.className}`}>{badge.label}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="mx-auto min-h-[100dvh] max-w-[520px] px-4 py-5" style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}>
        {children}
      </div>
    </main>
  );
}

function LoginBox({ onLogin }: { onLogin: (token: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw new Error(loginError.message);
      const token = data.session?.access_token;
      if (!token) throw new Error("Session fehlt.");
      await onLogin(token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <div className="flex min-h-[calc(100vh-4rem)] flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-brand-500/40 bg-brand-50 text-3xl">🧼</div>
          <h1 className="text-3xl font-bold">Admin-Freigaben</h1>
          <p className="mt-2 text-sm text-ink-400">Bitte mit Admin-Zugang anmelden.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-paper-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500" />
          </label>
          {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={saving} className="w-full rounded-2xl bg-brand-600 py-4 font-bold text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-paper-200 bg-white p-4">
      <p className="font-bold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-400">{text}</p>
    </div>
  );
}

function SectionButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${active ? "border-brand-500 bg-brand-600 text-white" : "border-paper-300 bg-white text-ink-600"}`}>
      <span className="block truncate font-bold">{label}</span>
      <span className="text-[11px] opacity-80">{count} offen</span>
    </button>
  );
}

function AdminPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [tab, setTab] = useState<Tab>("absence");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [replyById, setReplyById] = useState<Record<string, string>>({});

  const counts = useMemo(() => ({
    absence: data?.absences?.length || 0,
    material: data?.materialReports?.length || 0,
    chat: data?.chatMessages?.length || 0,
    notifications: data?.notifications?.length || 0,
    quality: data?.qualityReports?.length || 0,
    service: data?.serviceReports?.length || 0,
    time: data?.timeApprovals?.length || 0
  }), [data]);

  const load = useCallback(async (tokenOverride?: string) => {
    const currentToken = tokenOverride || token;
    if (!currentToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/requests", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Freigaben konnten nicht geladen werden.");
      setData(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Freigaben konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token || "";
        if (!mounted) return;
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

  async function onLogin(accessToken: string) {
    setToken(accessToken);
    await load(accessToken);
  }

  async function patchItem(type: "time" | "absence" | "material" | "quality" | "service" | "chat" | "notification", id: string, action: string) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type, id, action, adminResponse: noteById[id] || "" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Speichern fehlgeschlagen.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Speichern fehlgeschlagen.");
    } finally {
      setSavingId(null);
    }
  }

  async function sendReply(row: ChatRow) {
    const message = (replyById[row.id] || "").trim();
    if (!message) return;
    setSavingId(row.id);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/chat-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeName: row.employee_name, message, sourceMessageId: row.id })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Antwort konnte nicht gesendet werden.");
      setReplyById((old) => ({ ...old, [row.id]: "" }));
      await load();
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "Antwort konnte nicht gesendet werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setToken("");
    setData(null);
  }

  if (authLoading) {
    return <Shell><div className="grid min-h-[70vh] place-items-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-paper-300 border-t-blue-500" /></div></Shell>;
  }

  if (!token) return <LoginBox onLogin={onLogin} />;

  return (
    <Shell>
      <div className="space-y-5 pb-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Adminbereich</p>
              <h1 className="text-3xl font-bold">Freigaben</h1>
              <p className="mt-1 text-sm text-ink-400">Überzeit, Urlaub, Material, Qualität, Leistung, Chat und Meldungen bearbeiten.</p>
            </div>
            <Link href="/mitarbeiter" className="rounded-2xl border border-paper-300 bg-white px-4 py-3 text-sm font-bold text-brand-700">App</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/mitarbeiter/admin" className="rounded-2xl border border-paper-300 bg-paper-100 px-4 py-3 text-center text-sm font-bold text-brand-700">← Zurück</Link>
            <button onClick={() => load()} disabled={loading} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Lade…" : "Aktualisieren"}</button>
          </div>
        </header>

        {error && <p className="rounded-2xl border border-rose-500/30 bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link href="/mitarbeiter/admin/zeiten" className="rounded-2xl border border-brand-500 bg-brand-50 px-3 py-3 text-left text-sm text-brand-700">
            <span className="block truncate font-bold">Zeiten</span>
            <span className="text-[11px] opacity-80">{counts.time} offen · eigene Seite</span>
          </Link>
          <SectionButton active={tab === "absence"} label="Urlaub" count={counts.absence} onClick={() => setTab("absence")} />
          <SectionButton active={tab === "material"} label="Material" count={counts.material} onClick={() => setTab("material")} />
          <SectionButton active={tab === "quality"} label="Qualität" count={counts.quality} onClick={() => setTab("quality")} />
          <SectionButton active={tab === "service"} label="Leistung" count={counts.service} onClick={() => setTab("service")} />
          <SectionButton active={tab === "chat"} label="Chat" count={counts.chat} onClick={() => setTab("chat")} />
          <SectionButton active={tab === "notifications"} label="Meldungen" count={counts.notifications} onClick={() => setTab("notifications")} />
        </nav>

        {tab === "absence" && (
          <section className="space-y-3">
            <h2 className="font-bold">Abwesenheiten</h2>
            {data?.absences?.length ? data.absences.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{row.employee_name || "Mitarbeiter"}</p>
                    <p className="mt-1 text-sm text-ink-400">{row.absence_type || row.request_type || "Abwesenheit"} · {formatDate(row.start_date)} bis {formatDate(row.end_date)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {row.reason && <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.reason}</p>}
                <textarea value={noteById[row.id] || ""} onChange={(event) => setNoteById((old) => ({ ...old, [row.id]: event.target.value }))} rows={2} className="mt-3 w-full rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500" placeholder="Antwort / Hinweis an Mitarbeiter" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button disabled={savingId === row.id} onClick={() => patchItem("absence", row.id, "approve")} className="rounded-2xl bg-success-500 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">Genehmigen</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("absence", row.id, "reject")} className="rounded-2xl bg-danger-500 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">Ablehnen</button>
                </div>
              </article>
            )) : <EmptyCard title="Keine offenen Abwesenheiten" text="Neue Urlaubs- oder Krankmeldungen erscheinen hier." />}
          </section>
        )}

        {tab === "material" && (
          <section className="space-y-3">
            <h2 className="font-bold">Materialmeldungen</h2>
            {data?.materialReports?.length ? data.materialReports.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{materialName(row)}</p>
                    <p className="mt-1 text-sm text-ink-400">{row.employee_name || "Mitarbeiter"} · {objectName(row)}</p>
                    <p className="mt-1 text-xs text-ink-400">Menge: {row.quantity_requested || row.quantity || 1} · {formatDateTime(row.created_at)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {(row.comment || row.notes || row.message) && <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.comment || row.notes || row.message}</p>}
                {row.photo_urls?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {row.photo_urls.slice(0, 6).map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-paper-300 bg-paper-100">
                        <img src={url} alt="Materialfoto" className="h-24 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
                <textarea value={noteById[row.id] || ""} onChange={(event) => setNoteById((old) => ({ ...old, [row.id]: event.target.value }))} rows={2} className="mt-3 w-full rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500" placeholder="Antwort / Hinweis" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button disabled={savingId === row.id} onClick={() => patchItem("material", row.id, "approve")} className="rounded-2xl bg-brand-600 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Freigeben</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("material", row.id, "done")} className="rounded-2xl bg-success-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Erledigt</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("material", row.id, "reject")} className="rounded-2xl bg-danger-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Ablehnen</button>
                </div>
              </article>
            )) : <EmptyCard title="Keine offenen Materialmeldungen" text="Wenn ein Mitarbeiter Material meldet, landet es hier." />}
          </section>
        )}

        {tab === "quality" && (
          <section className="space-y-3">
            <h2 className="font-bold">Qualitätsnachweise</h2>
            {data?.qualityReports?.length ? data.qualityReports.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{row.work_site_name || row.site || "Objekt"}</p>
                    <p className="mt-1 text-sm text-ink-400">{row.employee_name || "Mitarbeiter"} · {formatDateTime(row.created_at)}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {row.photo_count || row.photo_urls?.length || 0} Foto(s) · {(row.checked_items || []).length} Punkte
                      {row.rating ? ` · ${"★".repeat(row.rating)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {row.photo_urls?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {row.photo_urls.slice(0, 6).map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-paper-300 bg-paper-100">
                        <img src={url} alt="Qualitätsfoto" className="h-24 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
                {row.checked_items?.length ? <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.checked_items.join(" · ")}</p> : null}
                {row.notes && <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.notes}</p>}
                <textarea value={noteById[row.id] || ""} onChange={(event) => setNoteById((old) => ({ ...old, [row.id]: event.target.value }))} rows={2} className="mt-3 w-full rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500" placeholder="Antwort / Hinweis" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button disabled={savingId === row.id} onClick={() => patchItem("quality", row.id, "approve")} className="rounded-2xl bg-brand-600 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Freigeben</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("quality", row.id, "done")} className="rounded-2xl bg-success-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Erledigt</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("quality", row.id, "reject")} className="rounded-2xl bg-danger-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Ablehnen</button>
                </div>
              </article>
            )) : <EmptyCard title="Keine offenen Qualitätsnachweise" text="Wenn Mitarbeiter einen Nachweis senden, erscheint er hier mit Foto und Checkliste." />}
          </section>
        )}

        {tab === "service" && (
          <section className="space-y-3">
            <h2 className="font-bold">Leistungsnachweise</h2>
            {data?.serviceReports?.length ? data.serviceReports.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{row.work_site_name || "Objekt"}</p>
                    <p className="mt-1 text-sm text-ink-400">{row.employee_name || "Mitarbeiter"} · {formatDateTime(row.created_at)}</p>
                    <p className="mt-1 text-xs text-ink-400">Kunde: {row.customer_name || "—"} · Unterschrift: {row.signer_name || "erfasst"}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {row.signature_url ? (
                  <a href={row.signature_url} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-2xl border border-paper-300 bg-paper-100 p-3 text-center text-sm font-bold text-brand-700">Unterschrift öffnen</a>
                ) : null}
                {row.notes && <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.notes}</p>}
                <textarea value={noteById[row.id] || ""} onChange={(event) => setNoteById((old) => ({ ...old, [row.id]: event.target.value }))} rows={2} className="mt-3 w-full rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500" placeholder="Antwort / Hinweis" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button disabled={savingId === row.id} onClick={() => patchItem("service", row.id, "approve")} className="rounded-2xl bg-brand-600 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Freigeben</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("service", row.id, "done")} className="rounded-2xl bg-success-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Erledigt</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("service", row.id, "reject")} className="rounded-2xl bg-danger-500 px-2 py-3 text-xs font-bold text-white disabled:opacity-50">Ablehnen</button>
                </div>
              </article>
            )) : <EmptyCard title="Keine offenen Leistungsnachweise" text="Wenn ein Kunde auf dem Handy unterschreibt, landet der Nachweis hier." />}
          </section>
        )}

        {tab === "chat" && (
          <section className="space-y-3">
            <h2 className="font-bold">Chat vom Team</h2>
            {data?.chatMessages?.length ? data.chatMessages.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{row.employee_name || row.sender_name || "Mitarbeiter"}</p>
                    <p className="mt-1 text-xs text-ink-400">{formatDateTime(row.created_at)}</p>
                  </div>
                  <StatusBadge status={row.todo_status || row.status} />
                </div>
                <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{bodyOf(row)}</p>
                <textarea value={replyById[row.id] || ""} onChange={(event) => setReplyById((old) => ({ ...old, [row.id]: event.target.value }))} rows={2} className="mt-3 w-full rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500" placeholder="Antwort schreiben…" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button disabled={savingId === row.id || !(replyById[row.id] || "").trim()} onClick={() => sendReply(row)} className="rounded-2xl bg-brand-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">Antworten</button>
                  <button disabled={savingId === row.id} onClick={() => patchItem("chat", row.id, "done")} className="rounded-2xl bg-paper-300 px-3 py-3 text-sm font-bold text-ink-900 disabled:opacity-50">Als erledigt</button>
                </div>
              </article>
            )) : <EmptyCard title="Keine offenen Chat-Nachrichten" text="Neue Nachrichten aus der Mitarbeiter-App erscheinen hier." />}
          </section>
        )}

        {tab === "notifications" && (
          <section className="space-y-3">
            <h2 className="font-bold">Allgemeine Meldungen</h2>
            {data?.notifications?.length ? data.notifications.map((row) => (
              <article key={row.id} className="rounded-2xl border border-paper-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{row.title || "Meldung"}</p>
                    <p className="mt-1 text-sm text-ink-400">{row.employee_name || "System"} · {row.notification_type || "Info"}</p>
                    <p className="mt-1 text-xs text-ink-400">{formatDateTime(row.created_at)}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                {row.message && <p className="mt-3 rounded-2xl bg-paper-100 px-3 py-2 text-sm text-ink-600">{row.message}</p>}
                <button disabled={savingId === row.id} onClick={() => patchItem("notification", row.id, "done")} className="mt-3 w-full rounded-2xl bg-brand-600 px-3 py-3 text-sm font-bold text-white disabled:opacity-50">Als erledigt markieren</button>
              </article>
            )) : <EmptyCard title="Keine offenen Meldungen" text="Alles erledigt. Sauber so. 🧽" />}
          </section>
        )}

        <button onClick={logout} className="w-full rounded-3xl border border-rose-500/30 bg-rose-100 p-4 text-left font-bold text-rose-700">Abmelden</button>
      </div>
    </Shell>
  );
}

export default function Page() {
  return <AdminPage />;
}
