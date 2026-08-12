"use client";

/**
 * Geräte-Detailseite.
 *
 * Das ist die Seite, die der QR-Code auf dem Gerät öffnet. Sie muss ohne
 * Vorwissen verständlich sein: Was ist das für ein Gerät, wo gehört es hin,
 * wann war die letzte Wartung, und was kann ich jetzt melden.
 */

import { use, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { Banner, Button, DetailRow, PageHeader, SectionHeading, Spinner, StatusPill } from "@/components/ui";
import { formatShortDateDE } from "@/lib/format";

type Device = {
  id: string;
  name: string;
  device_type: string | null;
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

function statusTone(status?: string | null) {
  const value = String(status || "aktiv").toLowerCase();
  if (value === "defekt") return { tone: "danger" as const, label: "Defekt" };
  if (value === "ausgemustert") return { tone: "neutral" as const, label: "Ausgemustert" };
  return { tone: "success" as const, label: "Aktiv" };
}

export default function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [token, setToken] = useState("");
  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [defectNote, setDefectNote] = useState("");
  const [defectOpen, setDefectOpen] = useState(false);

  const load = useCallback(async (activeToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mobile/devices?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Gerät konnte nicht geladen werden.");
      if (result.setupRequired) throw new Error("Die Gerätetabelle fehlt noch. Bitte supabase/geraete_tabelle.sql ausführen.");
      setDevice((result.devices || [])[0] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gerät konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token || "";
      if (!mounted) return;
      setToken(accessToken);
      if (accessToken) await load(accessToken);
      else setLoading(false);
    }
    init();
    return () => { mounted = false; };
  }, [load]);

  async function report(action: "defekt" | "wartung") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/mobile/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, action, notes: action === "defekt" ? defectNote : "" })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Meldung konnte nicht gespeichert werden.");
      setMessage(action === "defekt" ? "Defekt gemeldet. Das Büro ist informiert." : "Wartung eingetragen.");
      setDefectOpen(false);
      setDefectNote("");
      await load(token);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Meldung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  if (!token && !loading) {
    return (
      <main className="min-h-[100dvh] bg-paper-100">
        <PageHeader title="Gerät" backHref="/mitarbeiter" />
        <div className="mx-auto max-w-[520px] px-4 py-6 space-y-4">
          <Banner tone="warn">Bitte zuerst anmelden, dann siehst du die Gerätedaten.</Banner>
          <a href="/mitarbeiter" className="block rounded-xl bg-brand-600 px-4 py-3.5 text-center text-[16px] font-semibold text-white">Zur Anmeldung</a>
        </div>
      </main>
    );
  }

  const status = statusTone(device?.status);

  return (
    <main className="min-h-[100dvh] bg-paper-100">
      <div className="mx-auto max-w-[520px] bg-white pb-10">
        <PageHeader title="Gerät" backHref="/mitarbeiter/admin/geraete" />

        {loading ? <Spinner label="Lade Gerät…" /> : null}
        {error ? <div className="px-4 pt-4"><Banner tone="danger">{error}</Banner></div> : null}
        {message ? <div className="px-4 pt-4"><Banner tone="success">{message}</Banner></div> : null}

        {device ? (
          <>
            <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
              <div className="min-w-0">
                <h1 className="text-[24px] font-bold text-ink-900">{device.name}</h1>
                <p className="mt-0.5 text-[14px] text-ink-400">{device.device_type || "Ohne Typ"}</p>
              </div>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>

            <SectionHeading>Zuordnung</SectionHeading>
            <DetailRow icon="pin" label="Objekt" value={device.work_site_name || "Kein festes Objekt"} />
            <DetailRow icon="note" label="Inventarnummer" value={device.inventory_number || "Nicht vergeben"} />
            <DetailRow icon="note" label="Seriennummer" value={device.serial_number || "Nicht erfasst"} />

            <SectionHeading>Wartung</SectionHeading>
            <DetailRow icon="calendar" label="Gekauft am" value={device.purchase_date ? formatShortDateDE(device.purchase_date) : "Nicht erfasst"} />
            <DetailRow icon="clock" label="Letzte Wartung" value={device.last_service_date ? formatShortDateDE(device.last_service_date) : "Nicht erfasst"} />
            <DetailRow icon="refresh" label="Intervall" value={device.service_interval_months ? `alle ${device.service_interval_months} Monate` : "Nicht festgelegt"} />

            {device.description ? (
              <>
                <SectionHeading>Beschreibung</SectionHeading>
                <p className="px-4 text-[15px] text-ink-800">{device.description}</p>
              </>
            ) : null}

            {device.notes ? (
              <>
                <SectionHeading>Letzte Meldung</SectionHeading>
                <p className="px-4 text-[15px] text-ink-800">{device.notes}</p>
              </>
            ) : null}

            <div className="space-y-3 px-4 pt-6">
              {defectOpen ? (
                <>
                  <textarea
                    value={defectNote}
                    onChange={(event) => setDefectNote(event.target.value)}
                    rows={3}
                    placeholder="Was ist kaputt? Was funktioniert nicht mehr?"
                    className="w-full rounded-xl border border-paper-200 px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="neutral" onClick={() => setDefectOpen(false)}>Abbrechen</Button>
                    <Button variant="danger" disabled={saving} onClick={() => report("defekt")}>{saving ? "Sende…" : "Defekt melden"}</Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="danger" onClick={() => setDefectOpen(true)}>Defekt melden</Button>
                  <Button variant="success" disabled={saving} onClick={() => report("wartung")}>Wartung erledigt</Button>
                </div>
              )}
            </div>
          </>
        ) : !loading && !error ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[16px] font-semibold text-ink-900">Gerät nicht gefunden</p>
            <p className="mt-1 text-[14px] text-ink-400">Der QR-Code zeigt auf ein Gerät, das es nicht mehr gibt.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
