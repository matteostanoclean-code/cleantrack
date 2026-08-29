import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Welche Objekte ein Mitarbeiter sieht.
 *
 * Ohne Zuordnung sieht er nur die Objekte, an denen ein Einsatz auf ihn läuft.
 * Wer regelmäßig an einem Objekt ist, soll es auch dann sehen, wenn gerade
 * kein Termin ansteht — für Material, Geräte und die Objektmappe.
 *
 * Umgekehrt ist die Zuordnung eine Grenze: Was nicht zugeordnet und nicht
 * eingeplant ist, taucht bei ihm nicht auf. Kundendaten fremder Objekte gehen
 * niemanden etwas an, der dort nicht arbeitet.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
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
    const { supabase } = guard.auth;

    const [mitarbeiter, objekte, zuordnungen, einsaetze] = await Promise.all([
      supabase.from("employee_profiles").select("id, name, role, active").order("name", { ascending: true }),
      supabase.from("work_sites").select("id, name, address, customer_name").order("name", { ascending: true }).limit(500),
      supabase.from("employee_work_sites").select("id, employee_name, work_site_id, site_name, active").limit(2000),
      // Objekte, an denen ohnehin Einsätze laufen. Die sieht der Mitarbeiter
      // auch ohne Zuordnung, das soll im Bildschirm sichtbar sein.
      supabase.from("tasks").select("employee_name, work_site_id").not("work_site_id", "is", null).limit(4000)
    ]);

    if (zuordnungen.error) {
      const text = String(zuordnungen.error.message || "");
      if (/relation|does not exist|schema cache/i.test(text)) {
        return NextResponse.json({ ok: false, error: "Die Tabelle employee_work_sites fehlt in der Datenbank." }, { status: 409 });
      }
      throw new Error(text);
    }

    const ausEinsaetzen = new Map<string, string[]>();
    for (const task of (einsaetze.data || []) as AnyRow[]) {
      const name = clean(task.employee_name);
      const objekt = clean(task.work_site_id);
      if (!name || !objekt) continue;
      const bisher = ausEinsaetzen.get(name) || [];
      if (!bisher.includes(objekt)) ausEinsaetzen.set(name, [...bisher, objekt]);
    }

    return NextResponse.json({
      ok: true,
      employees: ((mitarbeiter.data || []) as AnyRow[]).filter((row) => row.name && row.active !== false),
      sites: objekte.data || [],
      assignments: ((zuordnungen.data || []) as AnyRow[]).filter((row) => row.active !== false),
      fromTasks: Object.fromEntries(ausEinsaetzen)
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Zuordnung konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Setzt die Objekte eines Mitarbeiters auf genau die übergebene Liste. */
export async function PUT(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { supabase } = guard.auth;

    const body = await request.json();
    const employeeName = clean(body.employeeName);
    if (!employeeName) return NextResponse.json({ ok: false, error: "Mitarbeiter fehlt." }, { status: 400 });

    const gewuenscht = (Array.isArray(body.workSiteIds) ? body.workSiteIds : [])
      .map(uuidOrNull)
      .filter(Boolean) as string[];

    const profil = await supabase.from("employee_profiles").select("id, name").eq("name", employeeName).maybeSingle();
    if (profil.error) throw new Error(profil.error.message);
    const profilId = clean(profil.data?.id);
    if (!profilId) return NextResponse.json({ ok: false, error: `${employeeName} wurde nicht gefunden.` }, { status: 404 });

    const objekte = await supabase.from("work_sites").select("id, name").in("id", gewuenscht.length ? gewuenscht : ["00000000-0000-0000-0000-000000000000"]);
    const namen = new Map<string, string>();
    for (const site of (objekte.data || []) as AnyRow[]) namen.set(site.id, clean(site.name) || "Objekt");

    // Erst alles weg, dann neu schreiben. Einfacher und immer eindeutig, statt
    // Zeile für Zeile abzugleichen.
    const weg = await supabase.from("employee_work_sites").delete().eq("employee_name", employeeName);
    if (weg.error) throw new Error(weg.error.message);

    let angelegt = 0;
    if (gewuenscht.length) {
      const zeilen = gewuenscht.map((id) => ({
        employee_name: employeeName,
        employee_profile_id: profilId,
        work_site_id: id,
        site_name: namen.get(id) || null,
        active: true,
        created_at: new Date().toISOString()
      }));
      const neu = await supabase.from("employee_work_sites").insert(zeilen).select("id");
      if (neu.error) {
        // Ältere Fassung der Tabelle ohne employee_profile_id.
        const schlank = zeilen.map(({ employee_profile_id: _weg, ...rest }) => rest);
        const zweiter = await supabase.from("employee_work_sites").insert(schlank).select("id");
        if (zweiter.error) throw new Error(zweiter.error.message);
        angelegt = zweiter.data?.length || 0;
      } else {
        angelegt = neu.data?.length || 0;
      }
    }

    return NextResponse.json({ ok: true, employeeName, count: angelegt });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Zuordnung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
