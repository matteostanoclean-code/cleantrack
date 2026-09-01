import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { VORGABEN, zusammenfuehren, LISTEN, istListe } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Betriebsweite Einstellungen lesen und schreiben.
 *
 * GET liefert alles auf einmal: die Werte und sämtliche Stammlisten. Das ist
 * eine Abfrage statt zehn, und der Einstellungs-Bildschirm springt zwischen
 * seinen Seiten, ohne jedes Mal neu zu laden.
 *
 * PATCH schreibt genau einen Schlüssel. Geschrieben wird immer der ganze Wert,
 * zusammengeführt mit dem, was schon dasteht — so kann ein Formular, das nur
 * die Hälfte der Felder kennt, die andere Hälfte nicht versehentlich löschen.
 */

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  return { ok: true as const, auth };
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const [werte, listen] = await Promise.all([
      supabase.from("app_settings").select("key, value"),
      supabase.from("settings_lists").select("*").order("sortierung", { ascending: true }).order("name", { ascending: true }).limit(2000)
    ]);

    const setupFehlt = Boolean(
      (werte.error && fehlendeTabelle(werte.error)) || (listen.error && fehlendeTabelle(listen.error))
    );

    if (werte.error && !fehlendeTabelle(werte.error)) throw new Error(werte.error.message);
    if (listen.error && !fehlendeTabelle(listen.error)) throw new Error(listen.error.message);

    // Nach Liste sortiert ausliefern, damit der Bildschirm nicht filtern muss.
    const nachListe: Record<string, AnyRow[]> = {};
    for (const name of LISTEN) nachListe[name] = [];
    for (const zeile of ((listen.data || []) as AnyRow[])) {
      const name = String(zeile.liste || "");
      if (istListe(name)) nachListe[name].push(zeile);
    }

    return NextResponse.json({
      ok: true,
      setupFehlt,
      werte: zusammenfuehren((werte.data || []) as AnyRow[]),
      listen: nachListe
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Einstellungen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const schluessel = String(body.schluessel || "").trim();
    if (!Object.prototype.hasOwnProperty.call(VORGABEN, schluessel)) {
      return NextResponse.json({ ok: false, error: `Unbekannte Einstellung: ${schluessel || "(leer)"}` }, { status: 400 });
    }
    const neu = body.wert;
    if (!neu || typeof neu !== "object" || Array.isArray(neu)) {
      return NextResponse.json({ ok: false, error: "Es wurden keine Werte mitgeschickt." }, { status: 400 });
    }

    const vorher = await supabase.from("app_settings").select("value").eq("key", schluessel).maybeSingle();
    if (vorher.error && fehlendeTabelle(vorher.error)) {
      return NextResponse.json({ ok: false, error: "Die Einstellungstabelle fehlt noch. Bitte supabase/einstellungen.sql ausführen." }, { status: 409 });
    }

    const alt = (vorher.data?.value && typeof vorher.data.value === "object" ? vorher.data.value : {}) as AnyRow;
    const zusammen = { ...(VORGABEN as AnyRow)[schluessel], ...alt, ...neu };

    const ergebnis = await supabase
      .from("app_settings")
      .upsert(
        { key: schluessel, value: zusammen, updated_at: new Date().toISOString(), updated_by: guard.auth.profile.name },
        { onConflict: "key" }
      )
      .select()
      .maybeSingle();

    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true, wert: ergebnis.data?.value ?? zusammen });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.";
    if (fehlendeTabelle(fehler)) {
      return NextResponse.json({ ok: false, error: "Die Einstellungstabelle fehlt noch. Bitte supabase/einstellungen.sql ausführen." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
