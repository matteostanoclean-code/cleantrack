import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { listeLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Urlaubsplaner: ein ganzes Jahr auf einen Blick.
 *
 * Liefert in einem Zug, was der Planer braucht — Mitarbeiter mit Anspruch,
 * ihre Abwesenheiten des Jahres, die Objekte und die Zeiträume, in denen beim
 * Kunden geschlossen ist.
 *
 * Angelegt werden Mitarbeiter-Abwesenheiten weiterhin über
 * /api/mobile/admin/vacation. Dort hängt die Stundengutschrift dran, und zwei
 * Wege in dieselbe Tabelle laufen früher oder später auseinander. Hier werden
 * nur die Schließzeiten der Kunden geschrieben, die es sonst nirgends gibt.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableDatum(value: unknown) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

const FEHLT = "Die Tabelle für Kundenurlaub fehlt noch. Bitte supabase/kundenurlaub.sql ausführen.";

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

    const jahr = Number(clean(new URL(request.url).searchParams.get("jahr"))) || new Date().getFullYear();
    const von = `${jahr}-01-01`;
    const bis = `${jahr}-12-31`;

    const [personen, abwesenheiten, objekte, schliessungen] = await Promise.all([
      supabase.from("employee_profiles").select("*").order("name", { ascending: true }),
      // Alles, was das Jahr berührt: Beginn davor, Ende danach zählt mit.
      supabase.from("absence_requests").select("*").lte("start_date", bis).gte("end_date", von).limit(2000),
      supabase.from("work_sites").select("id, name, customer_name, active, status").order("name", { ascending: true }).limit(500),
      supabase.from("site_closures").select("*").lte("von", bis).gte("bis", von).order("von", { ascending: true }).limit(1000)
    ]);

    if (personen.error) throw new Error(personen.error.message);

    // Die Abwesenheitsarten aus den Einstellungen, damit Planer und
    // Einstellungen dieselbe Liste zeigen.
    const arten = await listeLaden(supabase, "abwesenheitsarten");
    // Feiertage, damit im Planer sichtbar ist, wo ohnehin frei ist. Wer am
    // 1. Mai Urlaub nimmt, verschenkt einen Tag.
    const feiertage = (await listeLaden(supabase, "feiertage"))
      .map((zeile) => ({ name: clean(zeile.name), datum: clean((zeile.daten as AnyRow)?.datum).slice(0, 10) }))
      .filter((zeile) => zeile.datum.startsWith(String(jahr)));

    return NextResponse.json({
      ok: true,
      jahr,
      setupFehlt: Boolean(schliessungen.error && fehlendeTabelle(schliessungen.error)),
      mitarbeiter: ((personen.data || []) as AnyRow[])
        .filter((person) => clean(person.name) && person.active !== false)
        .map((person) => ({
          id: person.id,
          name: clean(person.name),
          rolle: clean(person.role),
          anspruch: Number(person.annual_vacation_days ?? person.vacation_days ?? 0) || 0
        })),
      abwesenheiten: abwesenheiten.error ? [] : (abwesenheiten.data || []),
      objekte: objekte.error ? [] : ((objekte.data || []) as AnyRow[]).filter((objekt) => objekt.active !== false && clean(objekt.status).toLowerCase() !== "passiv"),
      schliessungen: schliessungen.error ? [] : (schliessungen.data || []),
      arten: arten.map((zeile) => ({ name: clean(zeile.name), farbe: clean(zeile.farbe) })),
      feiertage
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Planer konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Kundenurlaub anlegen. */
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const objektId = uuidOrNull(body.work_site_id);
    const von = nullableDatum(body.von);
    const bis = nullableDatum(body.bis) || von;

    if (!objektId) return NextResponse.json({ ok: false, error: "Bitte ein Objekt wählen." }, { status: 400 });
    if (!von || !bis) return NextResponse.json({ ok: false, error: "Bitte einen Zeitraum angeben." }, { status: 400 });
    if (bis < von) return NextResponse.json({ ok: false, error: "Das Ende liegt vor dem Anfang." }, { status: 400 });

    const objekt = (await supabase.from("work_sites").select("name, customer_name").eq("id", objektId).maybeSingle()).data as AnyRow | null;

    const ergebnis = await safeInsert(supabase, "site_closures", {
      work_site_id: objektId,
      object_name: clean(objekt?.name) || null,
      customer_name: clean(objekt?.customer_name) || null,
      von,
      bis,
      grund: nullableText(body.grund),
      faellt_aus: body.faellt_aus !== false,
      notiz: nullableText(body.notiz),
      created_by: guard.auth.profile.name
    });

    return NextResponse.json({ ok: true, eintrag: ergebnis.data, uebersprungen: ergebnis.skipped });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Kundenurlaub konnte nicht angelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung." }, { status: 400 });

    const von = nullableDatum(body.von);
    const bis = nullableDatum(body.bis) || von;
    if (von && bis && bis < von) return NextResponse.json({ ok: false, error: "Das Ende liegt vor dem Anfang." }, { status: 400 });

    const ergebnis = await safeUpdateById(guard.auth.supabase, "site_closures", id, {
      von,
      bis,
      grund: nullableText(body.grund),
      faellt_aus: body.faellt_aus !== false,
      notiz: nullableText(body.notiz)
    });

    return NextResponse.json({ ok: true, eintrag: ergebnis.data });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung." }, { status: 400 });

    const ergebnis = await guard.auth.supabase.from("site_closures").delete().eq("id", id);
    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
