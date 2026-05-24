"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Employee = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  push_count?: number;
};

type RecentNotification = {
  id: string;
  title?: string | null;
  message?: string | null;
  employee_name?: string | null;
  notification_type?: string | null;
  created_at?: string | null;
  status?: string | null;
  read?: boolean | null;
};

type PushData = {
  ok: boolean;
  error?: string;
  employees: Employee[];
  recent: RecentNotification[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <div className="mx-auto min-h-[calc(100vh-2rem)] max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <div className="min-h-[calc(100vh-2rem)] bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 px-4 py-5">
          {children}
        </div>
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
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-blue-500/40 bg-blue-500/10 text-3xl">🔔</div>
          <h1 className="text-3xl font-black">Push-Zentrale</h1>
          <p className="mt-2 text-sm text-slate-400">Als Admin anmelden und Mitarbeiter informieren.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">E-Mail</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Passwort</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" />
          </label>
          {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
          <button disabled={saving} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Melde an…" : "Anmelden"}</button>
        </form>
      </div>
    </Shell>
  );
}

export default function AdminPushPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PushData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [target, setTarget] = useState<"employee" | "all">("employee");
  const [employeeProfileId, setEmployeeProfileId] = useState("");
  const [title, setTitle] = useState("Meldung vom Büro");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/mitarbeiter/notifications");

  const employees = data?.employees || [];
  const activeEmployees = employees.filter((employee) => employee.active !== false);
  const pushReadyCount = activeEmployees.filter((employee) => Number(employee.push_count || 0) > 0).length;
  const selectedEmployee = useMemo(() => activeEmployees.find((employee) => employee.id === employeeProfileId) || activeEmployees[0] || null, [activeEmployees, employeeProfileId]);

  const load = useCallback(async (overrideToken?: string) => {
    const currentToken = overrideToken || token;
    if (!currentToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/push", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Push-Zentrale konnte nicht geladen werden.");
      setData(result);
      if (!employeeProfileId && result.employees?.[0]?.id) setEmployeeProfileId(result.employees[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Push-Zentrale konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [employeeProfileId, token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionToken = sessionData.session?.access_token || "";
      setToken(sessionToken);
      setAuthLoading(false);
      if (sessionToken) await load(sessionToken);
    }
    init();
  }, [load]);

  async function handleLogin(nextToken: string) {
    setToken(nextToken);
    await load(nextToken);
  }

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setToken("");
    setData(null);
  }

  async function sendPush(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target,
          employeeProfileId: target === "employee" ? selectedEmployee?.id : undefined,
          employeeName: target === "employee" ? selectedEmployee?.name : undefined,
          title,
          message: body,
          url
        })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Push-Nachricht konnte nicht gesendet werden.");
      setMessage(`Gesendet: ${result.sent || 0} Push · ${result.notificationCount || 0} Meldung(en) gespeichert · ${result.employeesWithoutDevice || 0} ohne Gerät.`);
      setBody("");
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Push-Nachricht konnte nicht gesendet werden.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return <Shell><div className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-slate-400">Lade Push-Zentrale…</div></Shell>;
  }

  if (!token) return <LoginBox onLogin={handleLogin} />;

  return (
    <Shell>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/mitarbeiter" className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-black text-blue-100">← App</Link>
          <button onClick={logout} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100">Abmelden</button>
        </div>

        <section className="rounded-3xl border border-blue-500/25 bg-slate-900/80 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-blue-200">Admin</p>
          <h1 className="mt-2 text-2xl font-black text-white">Push-Zentrale</h1>
          <p className="mt-1 text-sm text-slate-400">Ich kann Mitarbeitern sofort eine Meldung aufs Handy schicken.</p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Aktive MA</p>
            <p className="mt-2 text-2xl font-black text-white">{activeEmployees.length}</p>
            <p className="text-xs text-slate-400">im System</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Push aktiv</p>
            <p className="mt-2 text-2xl font-black text-emerald-100">{pushReadyCount}</p>
            <p className="text-xs text-slate-400">mit Gerät</p>
          </div>
        </div>

        {loading ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">Lade Daten…</p> : null}
        {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}
        {message ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</p> : null}

        <form onSubmit={sendPush} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTarget("employee")} className={`rounded-2xl border px-3 py-3 text-sm font-black ${target === "employee" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>Ein Mitarbeiter</button>
            <button type="button" onClick={() => setTarget("all")} className={`rounded-2xl border px-3 py-3 text-sm font-black ${target === "all" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>Alle aktiven</button>
          </div>

          {target === "employee" ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mitarbeiter</span>
              <select value={selectedEmployee?.id || ""} onChange={(event) => setEmployeeProfileId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{clean(employee.name) || "Ohne Name"} · {employee.push_count || 0} Gerät(e)</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
              Ich sende an alle aktiven Mitarbeiter. Mitarbeiter ohne aktiviertes Push-Gerät bekommen trotzdem eine Meldung in der App.
            </div>
          )}

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titel</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z. B. Objekt geändert" />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nachricht</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} required className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" placeholder="z. B. Bitte zuerst zum Objekt Hauptstraße fahren. Kunde hat angerufen." />
          </label>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Öffnet in der App</span>
            <select value={url} onChange={(event) => setUrl(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-blue-500">
              <option value="/mitarbeiter/notifications">Meldungen</option>
              <option value="/mitarbeiter/schedule">Einsatzplan</option>
              <option value="/mitarbeiter/chat">Chat</option>
              <option value="/mitarbeiter/route">Tagesroute</option>
            </select>
          </label>

          <button disabled={saving || !body.trim()} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-60">{saving ? "Sende…" : "Push-Nachricht senden"}</button>
        </form>

        <section className="space-y-3">
          <h2 className="font-black">Mitarbeiter-Geräte</h2>
          {activeEmployees.length ? activeEmployees.map((employee) => (
            <article key={employee.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-white">{clean(employee.name) || "Mitarbeiter"}</p>
                  <p className="truncate text-xs text-slate-500">{employee.email || "Keine E-Mail"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black ${Number(employee.push_count || 0) > 0 ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"}`}>{employee.push_count || 0} Gerät</span>
              </div>
            </article>
          )) : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">Keine aktiven Mitarbeiter gefunden.</p>}
        </section>

        <section className="space-y-3 pb-6">
          <h2 className="font-black">Letzte Push-Meldungen</h2>
          {(data?.recent || []).length ? data?.recent.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <p className="font-black text-blue-100">{item.title || "Meldung"}</p>
              <p className="mt-1 text-sm text-slate-300">{item.message || "—"}</p>
              <p className="mt-2 text-xs text-slate-500">{item.employee_name || "Alle"} · {dateTime(item.created_at)}</p>
            </article>
          )) : <p className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">Noch keine manuelle Push-Meldung gesendet.</p>}
        </section>
      </div>
    </Shell>
  );
}
