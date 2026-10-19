import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { neuesPortalToken, sauber } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * Den Portal-Zugang eines Kunden verwalten.
 *
 * Drei Dinge: einschalten (erzeugt den Link), erneuern (macht den alten
 * sofort ungültig) und ausschalten. Der Link wird nie geändert, ohne dass
 * jemand es ausdrücklich sagt — sonst steht ein Kunde plötzlich vor einer
 * toten Adresse und ruft an.
 */

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  return { ok: true as const, auth };
}

function fehlendeSpalte(fehler: unknown) {
  const text = String((fehler as Record<string, any>)?.message || fehler || "");
  return /portal_token|portal_aktiv|schema cache|does not exist/i.test(text);
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const id = sauber(body.id);
    const was = sauber(body.was);
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt der Kunde." }, { status: 400 });

    const vorher = await supabase.from("customers").select("id, name, portal_token, portal_aktiv").eq("id", id).maybeSingle();
    if (vorher.error && fehlendeSpalte(vorher.error)) {
      return NextResponse.json({ ok: false, error: "Die Portal-Spalten fehlen noch. Bitte supabase/kundenportal.sql ausführen." }, { status: 409 });
    }
    if (!vorher.data) return NextResponse.json({ ok: false, error: "Diesen Kunden gibt es nicht." }, { status: 404 });

    let token = sauber(vorher.data.portal_token);
    let aktiv = vorher.data.portal_aktiv === true;

    if (was === "aus") {
      aktiv = false;
    } else if (was === "erneuern") {
      token = neuesPortalToken();
      aktiv = true;
    } else {
      // Einschalten: vorhandenen Link behalten, damit ein schon verschickter
      // weiter funktioniert.
      if (!token) token = neuesPortalToken();
      aktiv = true;
    }

    const ergebnis = await supabase
      .from("customers")
      .update({ portal_token: token, portal_aktiv: aktiv, portal_erstellt_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, portal_token, portal_aktiv")
      .maybeSingle();

    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true, kunde: ergebnis.data });
  } catch (fehler) {
    if (fehlendeSpalte(fehler)) {
      return NextResponse.json({ ok: false, error: "Die Portal-Spalten fehlen noch. Bitte supabase/kundenportal.sql ausführen." }, { status: 409 });
    }
    const text = fehler instanceof Error ? fehler.message : "Der Zugang konnte nicht geändert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
