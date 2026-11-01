import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

const BUCKET = "lohn-dokumente";

/**
 * Die eigenen Entgeltabrechnungen.
 *
 * Die eine Regel, an der hier alles hängt: **Welcher Mitarbeiter gemeint
 * ist, sagt nie die Anfrage.** Es ist immer das Profil, das zum angemeldeten
 * Konto gehört. Es gibt deshalb keinen Weg, die Abrechnung eines anderen
 * zu bekommen — auch nicht mit einer erratenen Kennung, denn jede Abfrage
 * ist zusätzlich an das eigene Profil gebunden.
 *
 * Auch das Büro liest hier nicht mit: Wer die Abrechnungen eines anderen
 * braucht, holt sie aus der Personalakte.
 *
 * GET  — die Liste, ohne Inhalt.
 * POST — eine Adresse zum Herunterladen, gültig für fünf Minuten. Sie wird
 *        nirgends gespeichert und bei jedem Tippen neu erzeugt.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { data, error } = await auth.supabase
      .from("lohn_dokumente")
      .select("id, jahr, monat, art, dateiname, groesse, hochgeladen_at, gesehen_at")
      .eq("employee_profile_id", auth.profile.id)
      .order("jahr", { ascending: false })
      .order("monat", { ascending: false })
      .limit(120);

    // Fehlt die Tabelle noch, ist die Liste leer statt kaputt.
    if (error) return NextResponse.json({ ok: true, dokumente: [], eingerichtet: false });

    return NextResponse.json({ ok: true, dokumente: data || [], eingerichtet: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Abrechnungen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Welche Abrechnung?" }, { status: 400 });

    // Beide Bedingungen zusammen: die Kennung UND das eigene Profil.
    const { data, error } = await auth.supabase
      .from("lohn_dokumente")
      .select("id, pfad, dateiname, jahr, monat")
      .eq("id", id)
      .eq("employee_profile_id", auth.profile.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Diese Abrechnung gibt es nicht." }, { status: 404 });

    const dokument = data as AnyRow;
    const signiert = await auth.supabase.storage
      .from(BUCKET)
      .createSignedUrl(clean(dokument.pfad), 300, { download: clean(dokument.dateiname) || "Entgeltabrechnung.pdf" });
    if (signiert.error || !signiert.data?.signedUrl) {
      throw new Error(signiert.error?.message || "Die Datei liegt nicht mehr da.");
    }

    // Festhalten, dass sie geöffnet wurde. Damit sieht das Büro, ob sie
    // angekommen ist, ohne nachfragen zu müssen.
    await auth.supabase.from("lohn_dokumente").update({ gesehen_at: new Date().toISOString() }).eq("id", dokument.id);

    return NextResponse.json({ ok: true, adresse: signiert.data.signedUrl, gueltigSekunden: 300 });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Die Abrechnung konnte nicht geöffnet werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
