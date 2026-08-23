import qrcode from "qrcode-generator";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Druckbogen mit QR-Aufklebern für alle Geräte.
 *
 * Läuft auf dem Server: die QR-Codes werden hier als SVG erzeugt, das Handy
 * oder der Rechner muss nichts rechnen. Über Datei > Drucken landet der Bogen
 * auf Papier oder Etiketten.
 */

type Device = {
  id: string;
  name: string;
  device_type: string | null;
  work_site_name: string | null;
  inventory_number: string | null;
};

function qrSvg(value: string) {
  const generator = qrcode(0, "M");
  generator.addData(value);
  generator.make();
  // Ohne Rand, die Umrandung macht das Layout drumherum.
  return generator.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function baseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "https://cleantrack-xi.vercel.app";
}

export default async function DeviceLabelsPage() {
  let devices: Device[] = [];
  let problem: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("devices")
      .select("id, name, device_type, work_site_name, inventory_number")
      .order("work_site_name", { ascending: true })
      .order("name", { ascending: true })
      .limit(500);
    if (result.error) throw new Error(result.error.message);
    devices = (result.data || []) as Device[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    problem = /relation|schema cache|does not exist/i.test(message)
      ? "Die Gerätetabelle fehlt noch. Bitte supabase/geraete_tabelle.sql ausführen."
      : "Die Geräte konnten nicht geladen werden.";
  }

  const site = baseUrl();

  return (
    <main className="min-h-[100dvh] bg-paper-100 p-6 text-ink-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-[900px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8">
        <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-[24px] font-bold">Geräte-Aufkleber</h1>
            <p className="mt-1 text-[14px] text-ink-400">
              {devices.length} Etiketten. Über Drucken auf Papier oder Etikettenbogen ausgeben und aufs Gerät kleben.
              Gescannt wird mit der normalen Handy-Kamera.
            </p>
          </div>
          <a href="/mitarbeiter/admin/geraete" className="shrink-0 rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-ink-800">
            Zurück
          </a>
        </div>

        {problem ? (
          <div className="rounded-xl bg-amber-100 px-4 py-3 text-[15px] text-amber-700 print:hidden">{problem}</div>
        ) : null}

        {!problem && !devices.length ? (
          <div className="rounded-xl bg-white px-4 py-10 text-center print:hidden">
            <p className="text-[16px] font-semibold">Noch keine Geräte erfasst</p>
            <p className="mt-1 text-[14px] text-ink-400">Lege zuerst Geräte an, dann gibt es hier Aufkleber.</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
          {devices.map((device) => (
            <div key={device.id} className="break-inside-avoid rounded-xl border border-paper-300 bg-white p-3 text-center print:border-ink-200">
              <div
                className="mx-auto h-[120px] w-[120px]"
                dangerouslySetInnerHTML={{ __html: qrSvg(`${site}/mitarbeiter/geraet/${device.id}`) }}
              />
              <p className="mt-2 truncate text-[14px] font-bold">{device.name}</p>
              <p className="truncate text-[12px] text-ink-400">
                {[device.inventory_number, device.work_site_name].filter(Boolean).join(" · ") || device.device_type || "Schichtklar"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
