"use client";

/**
 * Geräte und Inventar.
 *
 * Jedes Gerät hat eine feste Adresse in der App. Wer die als QR-Code aufs
 * Gerät klebt, kommt mit der normalen Handy-Kamera direkt auf die Detailseite.
 * Deshalb braucht die App keinen eigenen Scanner.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  DetailRow,
  EmptyState,
  FormSheet,
  PageHeader,
  SearchInput,
  SectionHeading,
  Spinner,
  StatusPill,
  UiIcon,
  cx
} from "@/components/ui";
import { formatShortDateDE } from "@/lib/format";

type Device = {
  id: string;
  name: string;
  device_type: string | null;
  work_site_id: string | null;
  work_site_name: string | null;
  serial_number: string | null;
  inventory_number: string | null;
  description: string | null;
  purchase_date: string | null;
  last_service_date: string | null;
  service_interval_months: number | null;
  status: string | null;
  notes: string | null;
};

type Site = { id: string; name?: string | null; site_name?: string | null; object_name?: string | null; customer_name?: string | null };

const emptyForm = {
  id: "",
  name: "",
  deviceType: "",
  workSiteId: "",
  serialNumber: "",
  inventoryNumber: "",
  description: "",
  purchaseDate: "",
  lastServiceDate: "",
  serviceIntervalMonths: "",
  status: "aktiv",
  notes: ""
};

const DEVICE_TYPES = ["Staubsauger", "Einscheibenmaschine", "Scheuersaugmaschine", "Hochdruckreiniger", "Reinigungswagen", "Leiter", "Sonstiges"];

const fieldClass = "mt-1.5 w-full rounded-xl border border-paper-200 bg-white px-4 py-3.5 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";
const labelClass = "text-[13px] text-ink-400";

function siteLabel(site: Site) {
  return site.name || site.site_name || site.object_name || site.customer_name || "Objekt";
}

function statusTone(status?: string | null) {
  const value = String(status || "aktiv").toLowerCase();
  if (value === "defekt") return { tone: "danger" as const, label: "Defekt" };
  if (value === "ausgemustert") return { tone: "neutral" as const, label: "Ausgemustert" };
  return { tone: "success" as const, label: "Aktiv" };
}

/** Wartung fällig? Nur wenn Intervall und letzte Wartung gepflegt sind. */
function serviceDue(device: Device) {
  if (!device.service_interval_months || !device.last_service_date) return false;
  const last = new Date(`${device.last_service_date}T12:00:00`);
  if (Number.isNaN(last.getTime())) return false;
  last.setMonth(last.getMonth() + device.service_interval_months);
  return last.getTime() < Date.now();
}

export default function DevicesPage() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [form, setForm] = useState({ ...emptyForm });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (activeToken?: string) => {
    const current = activeToken || token;
    if (!current) return;
    setLoading(true);
    setError(null);
    try {
      const [deviceResponse, dashboardResponse] = await Promise.all([
        fetch("/api/mobile/devices", { cache: "no-store", headers: { Authorization: `Bearer ${current}` } }),
        fetch("/api/mobile/admin/dashboard", { cache: "no-store", headers: { Authorization: `Bearer ${current}` } })
      ]);
      const deviceResult = await deviceResponse.json();
      if (!deviceResponse.ok || !deviceResult.ok) throw new Error(deviceResult.error || "Geräte konnten nicht geladen werden.");
      setDevices(deviceResult.devices || []);
      setSetupRequired(Boolean(deviceResult.setupRequired));

      const dashboardResult = await dashboardResponse.json();
      if (dashboardResponse.ok && dashboardResult.ok) setSites(dashboardResult.workSites || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Geräte konnten nicht geladen werden.");
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
        const accessToken = data.session?.access_token || "";
        if (!mounted) return;
        setToken(accessToken);
        setAuthLoading(false);
        if (accessToken) await load(accessToken);
      } catch {
        if (!mounted) return;
        setAuthLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return devices.filter((device) => {
      if (siteFilter && device.work_site_id !== siteFilter) return false;
      if (!needle) return true;
      return `${device.name} ${device.device_type || ""} ${device.serial_number || ""} ${device.inventory_number || ""} ${device.work_site_name || ""}`.toLowerCase().includes(needle);
    });
  }, [devices, query, siteFilter]);

  const dueCount = devices.filter(serviceDue).length;
  const defectCount = devices.filter((device) => String(device.status || "").toLowerCase() === "defekt").length;

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/devices", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Gerät konnte nicht gespeichert werden.");
      setMessage(form.id ? "Gerät gespeichert." : "Gerät angelegt.");
      setForm({ ...emptyForm });
      setSheetOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Gerät konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <main className="min-h-[100dvh] bg-paper-100"><Spinner label="Prüfe Anmeldung…" /></main>;

  if (!token) {
    return (
      <main className="min-h-[100dvh] bg-paper-100">
        <PageHeader title="Geräte" backHref="/mitarbeiter/admin" />
        <div className="mx-auto max-w-[520px] px-4 py-6">
          <Banner tone="warn">Bitte zuerst in der App anmelden.</Banner>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 pb-28">
      <div className="mx-auto max-w-[520px]">
        <PageHeader
          title="Geräte"
          backHref="/mitarbeiter/admin"
          right={
            <button onClick={() => load()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-full text-ink-600 disabled:opacity-40" aria-label="Aktualisieren">
              <UiIcon name="refresh" className={cx("h-5 w-5", loading && "animate-spin")} />
            </button>
          }
        />

        <div className="bg-white px-4 pb-3 pt-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Gerät, Nummer oder Objekt suchen" />
        </div>

        {sites.length ? (
          <div className="border-b border-paper-200 bg-white px-4 pb-3">
            <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="w-full rounded-xl border border-paper-200 px-3 py-2.5 text-[14px] text-ink-800 outline-none">
              <option value="">Alle Objekte</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{siteLabel(site)}</option>)}
            </select>
          </div>
        ) : null}

        <div className="space-y-3 px-4 pt-4">
          {setupRequired ? (
            <Banner tone="warn">
              Die Gerätetabelle fehlt noch. Führe einmal <span className="font-semibold">supabase/geraete_tabelle.sql</span> in Supabase aus, danach funktioniert diese Seite sofort.
            </Banner>
          ) : null}
          {error ? <Banner tone="danger">{error}</Banner> : null}
          {message ? <Banner tone="success">{message}</Banner> : null}

          {!setupRequired && devices.length ? (
            <ChipRow>
              <Chip label="Alle" count={devices.length} active={!siteFilter} onClick={() => setSiteFilter("")} />
              {defectCount ? <Chip label="Defekt" icon="warning" count={defectCount} onClick={() => setQuery("")} /> : null}
              {dueCount ? <Chip label="Wartung fällig" count={dueCount} onClick={() => setQuery("")} /> : null}
            </ChipRow>
          ) : null}

          {loading && !devices.length ? <Spinner label="Lade Geräte…" /> : null}

          {!loading && !setupRequired && !filtered.length ? (
            <EmptyState icon="box" title="Keine Geräte erfasst" text="Leg das erste Gerät an, dann bekommt es eine eigene Seite und einen QR-Code." />
          ) : null}
        </div>

        <div className="px-4">
          {filtered.map((device) => {
            const status = statusTone(device.status);
            const due = serviceDue(device);
            return (
              <a key={device.id} href={`/mitarbeiter/geraet/${device.id}`} className="flex items-start gap-3 border-b border-paper-200 py-3.5">
                <span className="mt-0.5 shrink-0 text-ink-400"><UiIcon name="box" className="h-[22px] w-[22px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-ink-900">{device.name}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-400">
                    {[device.device_type, device.work_site_name, device.inventory_number].filter(Boolean).join(" · ") || "Ohne weitere Angaben"}
                  </span>
                  {due ? <span className="mt-1 block text-[13px] font-medium text-amber-700">Wartung fällig</span> : null}
                </span>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </a>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-[520px]">
          <Button variant="primary" full onClick={() => { setForm({ ...emptyForm }); setSheetOpen(true); }}>Gerät anlegen</Button>
        </div>
      </div>

      {sheetOpen ? (
        <FormSheet
          title={form.id ? "Gerät bearbeiten" : "Gerät anlegen"}
          onClose={() => setSheetOpen(false)}
          footer={<Button variant="primary" full disabled={saving || !form.name.trim()} onClick={save}>{saving ? "Speichere…" : form.id ? "Änderungen speichern" : "Gerät anlegen"}</Button>}
        >
          <div className="space-y-4 p-4">
            <label className="block">
              <span className={labelClass}>Bezeichnung</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} placeholder="z. B. Nilfisk VP300" />
            </label>

            <label className="block">
              <span className={labelClass}>Gerätetyp</span>
              <select value={form.deviceType} onChange={(event) => setForm({ ...form, deviceType: event.target.value })} className={fieldClass}>
                <option value="">Bitte wählen</option>
                {DEVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Objekt</span>
              <select value={form.workSiteId} onChange={(event) => setForm({ ...form, workSiteId: event.target.value })} className={fieldClass}>
                <option value="">Kein festes Objekt</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{siteLabel(site)}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Seriennummer</span>
                <input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} className={fieldClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Inventarnummer</span>
                <input value={form.inventoryNumber} onChange={(event) => setForm({ ...form, inventoryNumber: event.target.value })} className={fieldClass} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Kaufdatum</span>
                <input type="date" value={form.purchaseDate} onChange={(event) => setForm({ ...form, purchaseDate: event.target.value })} className={fieldClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Letzte Wartung</span>
                <input type="date" value={form.lastServiceDate} onChange={(event) => setForm({ ...form, lastServiceDate: event.target.value })} className={fieldClass} />
              </label>
            </div>

            <label className="block">
              <span className={labelClass}>Wartung alle … Monate</span>
              <input inputMode="numeric" value={form.serviceIntervalMonths} onChange={(event) => setForm({ ...form, serviceIntervalMonths: event.target.value })} className={fieldClass} placeholder="z. B. 12" />
            </label>

            <label className="block">
              <span className={labelClass}>Beschreibung</span>
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className={fieldClass} />
            </label>

            <p className="text-[13px] text-ink-400">Nach dem Anlegen bekommt das Gerät eine eigene Seite. Deren Adresse kannst du als QR-Code aufs Gerät kleben.</p>
          </div>
        </FormSheet>
      ) : null}
    </main>
  );
}
