import qrcode from "qrcode-generator";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Adressen für die NFC-Aufkleber je Objekt.
 *
 * Auf jeden Aufkleber wird die hier gezeigte Adresse geschrieben. Legt ein
 * Mitarbeiter sein Telefon auf, öffnet das Betriebssystem die Adresse, die App
 * sucht den heutigen Einsatz an diesem Objekt und zeigt die Stempeluhr.
 *
 * Der QR-Code daneben enthält dieselbe Adresse. Wer keinen NFC-Aufkleber hat
 * oder ein Telefon ohne NFC, scannt stattdessen mit der Kamera.
 */

type Site = {
  id: string;
  name: string | null;
  address: string | null;
  allowed_radius_m: number | null;
};

function qrSvg(value: string) {
  const generator = qrcode(0, "M");
  generator.addData(value);
  generator.make();
  return generator.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

function baseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "https://cleantrack-xi.vercel.app";
}

function siteName(row: Site) {
  return row.name || "Ohne Namen";
}

export default async function NfcAufkleberSeite() {
  let sites: Site[] = [];
  let problem: string | null = null;

  try {
    const supabase = getSupabaseAdmin();
    const result = await supabase
      .from("work_sites")
      .select("id, name, address, allowed_radius_m")
      .order("name", { ascending: true })
      .limit(500);
    if (result.error) throw new Error(result.error.message);
    sites = (result.data || []) as Site[];
  } catch (error) {
    problem = error instanceof Error ? error.message : "Objekte konnten nicht geladen werden.";
  }

  const basis = baseUrl();

  return (
    <main className="min-h-[100dvh] bg-paper-100 p-6 text-ink-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-[900px] md:max-w-[1100px] md:mx-0 md:px-6 xl:px-8">
        <div className="mb-6 print:hidden">
          <h1 className="text-[24px] font-bold">NFC-Aufkleber je Objekt</h1>
          <p className="mt-1 max-w-[640px] text-[14px] leading-relaxed text-ink-400">
            {sites.length} Objekte. Schreib die jeweilige Adresse mit einer NFC-Schreib-App auf
            einen Aufkleber und bring ihn am Objekt an. Beim Auflegen des Telefons wird der
            Mitarbeiter direkt eingestempelt, ohne weiteres Tippen. Ausgestempelt wird bewusst nur
            auf Tippen, sonst würde ein zweites Vorbeigehen die Schicht beenden. Funktioniert auf
            iPhone und Android, die App muss nicht offen sein.
          </p>
        </div>

        {problem ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-700">{problem}</div>
        ) : null}

        <div className="space-y-3">
          {sites.map((row) => {
            const adresse = `${basis}/mitarbeiter/nfc/${row.id}`;
            return (
              <div
                key={row.id}
                className="flex items-center gap-4 rounded-2xl border border-paper-200 bg-white p-4 print:break-inside-avoid"
              >
                <div className="h-[76px] w-[76px] shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg(adresse) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold">{siteName(row)}</p>
                  <p className="truncate text-[13px] text-ink-400">
                    {row.address || "Keine Adresse hinterlegt"}
                    {row.allowed_radius_m ? ` · ${row.allowed_radius_m} m Radius` : ""}
                  </p>
                  <p className="mt-1 break-all font-mono text-[12px] text-ink-500">{adresse}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-paper-200 bg-white p-5 text-[14px] leading-relaxed text-ink-600 print:hidden">
          <p className="font-semibold text-ink-900">So beschreibst du die Aufkleber</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>NFC-Aufkleber besorgen, Typ NTAG213 reicht.</li>
            <li>Eine Schreib-App installieren, zum Beispiel „NFC Tools".</li>
            <li>Datensatz-Typ <strong>URL</strong> wählen, Adresse von oben einfügen, schreiben.</li>
            <li>Aufkleber am Objekt anbringen, gut erreichbar und nicht auf Metall.</li>
            <li>Einmal mit dem Telefon auflegen und prüfen, ob die Stempeluhr aufgeht.</li>
          </ol>
          <p className="mt-3">
            Aufkleber lassen sich sperren, damit niemand sie überschreibt. Erst sperren, wenn der
            Test geklappt hat, danach geht es nicht mehr rückgängig.
          </p>
        </div>
      </div>
    </main>
  );
}
