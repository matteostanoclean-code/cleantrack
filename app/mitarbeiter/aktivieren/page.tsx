"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

type Employee = {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  must_change_password: boolean | null;
  canLogin: boolean;
};

type CreatedLogin = {
  email: string;
  password: string;
  mustChangePassword: boolean;
};

function statusText(employee: Employee) {
  if (employee.role === "admin") return "Admin";
  if (employee.canLogin) return "Login aktiv";
  if (employee.auth_user_id && employee.active === false) return "Deaktiviert";
  if (employee.auth_user_id) return "Auth verbunden";
  return "Kein Login";
}

function statusClass(employee: Employee) {
  if (employee.role === "admin") return "border-blue-500/30 bg-blue-500/10 text-blue-100";
  if (employee.canLogin) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (employee.auth_user_id && employee.active === false) return "border-red-500/30 bg-red-500/10 text-red-100";
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-100";
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

export default function ActivateEmployeesPage() {
  const [token, setToken] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [createdLogins, setCreatedLogins] = useState<Record<string, CreatedLogin>>({});

  const inactiveEmployees = useMemo(() => employees.filter((employee) => employee.role !== "admin" && !employee.canLogin), [employees]);
  const activeEmployees = useMemo(() => employees.filter((employee) => employee.role !== "admin" && employee.canLogin), [employees]);

  const loadEmployees = useCallback(async (authToken?: string) => {
    const activeToken = authToken || token;
    if (!activeToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mobile/admin/employees", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Mitarbeiter konnten nicht geladen werden.");
      setEmployees(result.employees || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Mitarbeiter konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const authToken = data.session?.access_token || "";
        if (!mounted) return;
        setToken(authToken);
        await loadEmployees(authToken);
      } catch (initError) {
        if (!mounted) return;
        setError(initError instanceof Error ? initError.message : "Login konnte nicht geprüft werden.");
        setLoading(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activateEmployee(employee: Employee) {
    if (!token) return;
    setSavingId(employee.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/mobile/admin/activate-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId: employee.id, password: passwords[employee.id] || "" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Mitarbeiter konnte nicht aktiviert werden.");
      setCreatedLogins((current) => ({ ...current, [employee.id]: result.login }));
      setSuccess(`${employee.name || "Mitarbeiter"} wurde aktiviert.`);
      await loadEmployees(token);
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Mitarbeiter konnte nicht aktiviert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function deactivateEmployee(employee: Employee) {
    if (!token) return;
    const confirmed = window.confirm(`${employee.name || "Mitarbeiter"} wirklich deaktivieren?`);
    if (!confirmed) return;

    setSavingId(employee.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/mobile/admin/deactivate-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId: employee.id })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Mitarbeiter konnte nicht deaktiviert werden.");
      setSuccess(`${employee.name || "Mitarbeiter"} wurde deaktiviert.`);
      await loadEmployees(token);
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : "Mitarbeiter konnte nicht deaktiviert werden.");
    } finally {
      setSavingId(null);
    }
  }

  if (!token && !loading) {
    return (
      <main className="min-h-screen bg-slate-950 px-3 py-4 text-white">
        <section className="mx-auto max-w-[430px] rounded-[2rem] border border-blue-500/30 bg-slate-950 p-5 shadow-2xl shadow-blue-950/40">
          <h1 className="text-2xl font-black">Mitarbeiter aktivieren</h1>
          <p className="mt-2 text-sm text-slate-400">Bitte erst als Admin in der Mitarbeiter-App anmelden.</p>
          <Link href="/mitarbeiter" className="mt-5 block rounded-2xl bg-blue-600 px-5 py-4 text-center font-black">Zum Login</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="phone-bg min-h-screen bg-slate-950 px-3 py-4 text-slate-50 sm:px-5">
      <section className="mx-auto max-w-[430px] overflow-hidden rounded-[2rem] border border-blue-500/30 bg-slate-950 shadow-2xl shadow-blue-950/40">
        <header className="sticky top-0 z-10 border-b border-slate-900 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-200">Admin</p>
              <h1 className="text-2xl font-black">Mitarbeiter aktivieren</h1>
            </div>
            <Link href="/mitarbeiter" className="rounded-2xl border border-slate-800 px-4 py-2 text-sm font-bold text-blue-100">App</Link>
          </div>
        </header>

        <div className="space-y-4 px-5 py-5">
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Aktiv</p>
              <p className="mt-1 text-3xl font-black text-emerald-200">{activeEmployees.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs text-slate-500">Offen</p>
              <p className="mt-1 text-3xl font-black text-yellow-200">{inactiveEmployees.length}</p>
            </div>
          </section>

          {loading && (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-blue-500" />
              <p className="font-black">Lade Mitarbeiter…</p>
            </div>
          )}

          {error && <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}
          {success && <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</p>}

          {!loading && (
            <>
              <section className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="font-black text-blue-100">So nutzt du es</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">Ich aktiviere einen Mitarbeiter, kopiere E-Mail und Startpasswort und gebe es der Person. Danach kann sie sich in der App anmelden.</p>
              </section>

              <section className="space-y-3">
                <h2 className="font-black">Noch ohne Login</h2>
                {inactiveEmployees.length ? inactiveEmployees.map((employee) => (
                  <article key={employee.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{employee.name || "Ohne Name"}</p>
                        <p className="truncate text-xs text-slate-500">{employee.email || "Keine E-Mail"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(employee)}`}>{statusText(employee)}</span>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Eigenes Startpasswort optional</span>
                      <input
                        value={passwords[employee.id] || ""}
                        onChange={(event) => setPasswords((current) => ({ ...current, [employee.id]: event.target.value }))}
                        type="text"
                        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
                        placeholder="Leer lassen = Passwort wird erzeugt"
                      />
                    </label>

                    <button
                      disabled={savingId === employee.id || !employee.email}
                      onClick={() => activateEmployee(employee)}
                      className="mt-3 w-full rounded-2xl bg-blue-600 py-4 font-black text-white shadow-glow disabled:opacity-50"
                    >
                      {savingId === employee.id ? "Aktiviere…" : "Login aktivieren"}
                    </button>

                    {createdLogins[employee.id] && (
                      <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                        <p className="font-black">Zugangsdaten</p>
                        <p className="mt-2 break-all">E-Mail: {createdLogins[employee.id].email}</p>
                        <p className="break-all">Passwort: {createdLogins[employee.id].password}</p>
                        <button
                          onClick={() => copyToClipboard(`E-Mail: ${createdLogins[employee.id].email}\nPasswort: ${createdLogins[employee.id].password}`)}
                          className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white"
                        >
                          Kopieren
                        </button>
                      </div>
                    )}
                  </article>
                )) : <p className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Alle Mitarbeiter haben bereits einen aktiven Login.</p>}
              </section>

              <section className="space-y-3">
                <h2 className="font-black">Aktive Logins</h2>
                {activeEmployees.length ? activeEmployees.map((employee) => (
                  <article key={employee.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-black">{employee.name || "Ohne Name"}</p>
                        <p className="truncate text-xs text-slate-500">{employee.email || "Keine E-Mail"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-black ${statusClass(employee)}`}>{statusText(employee)}</span>
                    </div>
                    <button
                      disabled={savingId === employee.id}
                      onClick={() => deactivateEmployee(employee)}
                      className="mt-4 w-full rounded-2xl border border-red-500/30 bg-red-500/10 py-3 font-black text-red-100 disabled:opacity-50"
                    >
                      Deaktivieren
                    </button>
                  </article>
                )) : <p className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Noch keine aktiven Mitarbeiter-Logins.</p>}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
