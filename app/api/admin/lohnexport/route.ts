import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

type Row = Record<string, any>;

// Spalten und Reihenfolge wie in der bisherigen Sammeldatei der Lohnbuchhaltung.
const SPALTEN = [
  "Datum",
  "Beginn",
  "Ende",
  "Pause",
  "Unterbrechung",
  "Einsatzort",
  "Abwesenheit",
  "Bemerkung",
  "Soll (manuell)",
  "Soll",
  "Ist",
  "AZKonto",
];

const KOPFZEILE = 4;
const KOPF_FARBE = "FFDDEBF7";

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return { supabaseUrl, serviceRoleKey };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

async function requireAdmin(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }), supabaseAdmin: null };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 }), supabaseAdmin: null };
  }

  const { data: profile } = await supabaseAdmin
    .from("employee_profiles")
    .select("role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  const role = String(profile?.role || "").trim().toLowerCase();
  if (role !== "admin") {
    return { error: NextResponse.json({ error: "Nur für Administratoren." }, { status: 403 }), supabaseAdmin: null };
  }

  return { error: null, supabaseAdmin };
}

function monatsBereich(month: string) {
  const normalized = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [jahr, monat] = normalized.split("-").map(Number);
  const start = new Date(jahr, monat - 1, 1);
  const ende = new Date(jahr, monat, 1);
  return {
    month: normalized,
    jahr,
    monat,
    startDate: start.toISOString().slice(0, 10),
    endDate: ende.toISOString().slice(0, 10),
  };
}

/** Uhrzeit aus einem Zeitstempel oder einer bereits korrigierten Angabe. */
function uhrzeit(korrigiert: unknown, zeitstempel: unknown) {
  const fest = String(korrigiert || "").trim();
  if (/^\d{1,2}:\d{2}/.test(fest)) return fest.slice(0, 5);
  if (!zeitstempel) return "";
  const d = new Date(String(zeitstempel));
  if (Number.isNaN(d.getTime())) return "";
  return d.toTimeString().slice(0, 5);
}

function stunden(minuten: unknown) {
  const wert = Number(minuten || 0);
  if (!Number.isFinite(wert) || wert === 0) return 0;
  return Math.round((wert / 60) * 100) / 100;
}

function datumDeutsch(wert: unknown) {
  const text = String(wert || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [j, m, t] = text.split("-");
  return `${t}.${m}.${j}`;
}

function blattName(name: string, vergeben: Set<string>) {
  // Excel erlaubt 31 Zeichen und keine der Zeichen : \ / ? * [ ]
  let sauber = String(name || "Unbekannt").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Unbekannt";
  let kandidat = sauber;
  let zaehler = 2;
  while (vergeben.has(kandidat.toLowerCase())) {
    const kuerzung = sauber.slice(0, 28);
    kandidat = `${kuerzung} ${zaehler}`;
    zaehler += 1;
  }
  vergeben.add(kandidat.toLowerCase());
  return kandidat;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const supabaseAdmin = auth.supabaseAdmin!;

    const url = new URL(request.url);
    const bereich = monatsBereich(String(url.searchParams.get("month") || ""));

    // Zeiten des Monats
    const { data: eintraege, error: fehler } = await supabaseAdmin
      .from("time_entries")
      .select("*")
      .gte("work_date", bereich.startDate)
      .lt("work_date", bereich.endDate)
      .order("work_date", { ascending: true });

    if (fehler) return NextResponse.json({ error: fehler.message }, { status: 500 });

    // Abwesenheiten des Monats, damit Urlaub und Krankheit in der Spalte stehen
    const { data: abwesenheiten } = await supabaseAdmin
      .from("absence_requests")
      .select("*")
      .lte("start_date", bereich.endDate)
      .gte("end_date", bereich.startDate);

    // Alle aktiven Mitarbeiter, damit auch Leute ohne Zeiten ein Blatt bekommen
    const { data: profile } = await supabaseAdmin
      .from("employee_profiles")
      .select("name, active")
      .neq("active", false)
      .order("name", { ascending: true });

    const namen = new Set<string>();
    for (const p of profile || []) if (p?.name) namen.add(String(p.name));
    for (const e of eintraege || []) if (e?.employee_name) namen.add(String(e.employee_name));

    const mappe = new ExcelJS.Workbook();
    mappe.creator = "Schichtklar";
    mappe.created = new Date();

    const vergeben = new Set<string>();

    for (const name of [...namen].sort((a, b) => a.localeCompare(b, "de"))) {
      const blatt = mappe.addWorksheet(blattName(name, vergeben));

      blatt.getCell("A1").value = "Matteo Stano Clean Gebäudereinigung";
      blatt.getCell("A1").font = { bold: true, size: 12 };
      blatt.getCell("A2").value = `Arbeitszeiten ${String(bereich.monat).padStart(2, "0")}/${bereich.jahr}`;
      blatt.getCell("A3").value = name;
      blatt.getCell("A3").font = { bold: true };

      SPALTEN.forEach((titel, i) => {
        const zelle = blatt.getCell(KOPFZEILE, i + 1);
        zelle.value = titel;
        zelle.font = { bold: true };
        zelle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: KOPF_FARBE } };
        zelle.border = { bottom: { style: "thin" } };
      });

      const meine = (eintraege || [])
        .filter((e: Row) => String(e.employee_name || "") === name)
        .sort((a: Row, b: Row) => String(a.work_date || "").localeCompare(String(b.work_date || "")));

      const meineAbwesenheiten = (abwesenheiten || []).filter(
        (a: Row) => String(a.employee_name || "") === name
      );

      let zeile = KOPFZEILE + 1;
      let sollSumme = 0;
      let istSumme = 0;
      let konto = 0;

      for (const e of meine) {
        const soll = stunden(e.planned_minutes);
        const ist = stunden(e.worked_minutes || e.payroll_minutes);
        konto += ist - soll;
        sollSumme += soll;
        istSumme += ist;

        const tag = String(e.work_date || "").slice(0, 10);
        const abwesend = meineAbwesenheiten.find(
          (a: Row) => String(a.start_date || "") <= tag && String(a.end_date || "") >= tag
        );

        const werte = [
          datumDeutsch(e.work_date),
          uhrzeit(e.corrected_start_time, e.check_in_at),
          uhrzeit(e.corrected_end_time, e.check_out_at),
          stunden(e.pause_minutes),
          stunden(e.travel_minutes),
          String(e.work_site_name || e.site || ""),
          abwesend ? String(abwesend.absence_type || abwesend.type || "Abwesend") : "",
          String(e.note || ""),
          "",
          soll,
          ist,
          Math.round(konto * 100) / 100,
        ];

        werte.forEach((wert, i) => {
          const zelle = blatt.getCell(zeile, i + 1);
          zelle.value = wert as any;
          if (typeof wert === "number") zelle.numFmt = "0.00";
        });
        zeile += 1;
      }

      // Summenzeile
      const summe = [
        "Summe", "", "", "", "", "", "", "", "",
        Math.round(sollSumme * 100) / 100,
        Math.round(istSumme * 100) / 100,
        Math.round(konto * 100) / 100,
      ];
      summe.forEach((wert, i) => {
        const zelle = blatt.getCell(zeile, i + 1);
        zelle.value = wert as any;
        zelle.font = { bold: true };
        zelle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: KOPF_FARBE } };
        if (typeof wert === "number") zelle.numFmt = "0.00";
      });

      blatt.columns.forEach((spalte, i) => {
        spalte.width = i === 5 || i === 7 ? 26 : 13;
      });
      blatt.views = [{ state: "frozen", ySplit: KOPFZEILE }];
    }

    const puffer = await mappe.xlsx.writeBuffer();
    const dateiname = `Arbeitszeiten_${bereich.jahr}-${String(bereich.monat).padStart(2, "0")}.xlsx`;

    return new NextResponse(puffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${dateiname}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export fehlgeschlagen." },
      { status: 500 }
    );
  }
}
