import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { neuerSchluessel, pruefsumme } from "@/lib/geraeteSchluessel";

export const dynamic = "force-dynamic";

/**
 * Schlüssel für die Brutus-App verwalten.
 *
 * Nicht zu verwechseln mit /api/admin/geraete (Inventar und Abschreibung)
 * oder mit den Schlüsseln zu den Objekten. Hier geht es ausschließlich um
 * den Zugang, mit dem die App auf dem Handy hereinkommt.
 *
 * Bewusst **nur** mit der normalen Anmeldung erreichbar, nicht mit einem
 * Brutus-Schlüssel. Ein Schlüssel darf keine weiteren ausstellen — sonst
 * wäre ein verlorenes Handy genug, um sich dauerhaft einzunisten.
 */

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

const FEHLT = "Die Tabelle fehlt noch. Bitte supabase/geraete_schluessel.sql ausführen.";

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  }
  if (!auth.isAdmin) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  }
  return { ok: true as const, auth };
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const liste = await guard.auth.supabase
      .from("device_tokens")
      // Die Prüfsumme wird bewusst nicht mitgeschickt. Sie nützt niemandem
      // und hat im Browser nichts verloren.
      .select("id, bezeichnung, besitzer, erstellt_am, zuletzt_am, aktiv")
      .order("erstellt_am", { ascending: false })
      .limit(100);

    if (liste.error) {
      if (fehlendeTabelle(liste.error)) {
        return NextResponse.json({ ok: true, setupFehlt: true, schluessel: [] });
      }
      throw new Error(liste.error.message);
    }

    return NextResponse.json({ ok: true, setupFehlt: false, schluessel: liste.data || [] });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Die Schlüssel konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as AnyRow;
    const bezeichnung = clean(body.bezeichnung).slice(0, 80) || "Handy";

    const schluessel = neuerSchluessel();

    const angelegt = await guard.auth.supabase
      .from("device_tokens")
      .insert({
        pruefsumme: pruefsumme(schluessel),
        bezeichnung,
        profil_id: guard.auth.profile.id,
        besitzer: guard.auth.profile.name,
        erstellt_am: new Date().toISOString(),
        aktiv: true
      })
      .select("id, bezeichnung, erstellt_am")
      .maybeSingle();

    if (angelegt.error) {
      if (fehlendeTabelle(angelegt.error)) {
        return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
      }
      throw new Error(angelegt.error.message);
    }

    return NextResponse.json({
      ok: true,
      eintrag: angelegt.data,
      // Genau einmal. Danach steht nur noch die Prüfsumme in der Datenbank,
      // und die lässt sich nicht zurückrechnen.
      schluessel,
      hinweis: "Diesen Schlüssel jetzt ins Handy eintragen. Er wird nie wieder angezeigt."
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Schlüssel konnte nicht angelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = (await request.json().catch(() => ({}))) as AnyRow;
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Welcher Schlüssel?" }, { status: 400 });

    // Nicht löschen, sondern abschalten. So bleibt nachvollziehbar, dass es
    // den Schlüssel gab und wann er zuletzt benutzt wurde.
    const aus = await guard.auth.supabase
      .from("device_tokens")
      .update({ aktiv: false })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (aus.error) throw new Error(aus.error.message);

    return NextResponse.json({ ok: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Schlüssel konnte nicht abgeschaltet werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
