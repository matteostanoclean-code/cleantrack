import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Wie weit ist das Team eingerichtet.
 *
 * Vier Schritte je Person, in dieser Reihenfolge:
 *   1. Es steht ein Einsatz auf sie
 *   2. Sie hat einen Login bekommen
 *   3. Sie hat sich mindestens einmal angemeldet
 *   4. Sie hat mindestens einmal gestempelt
 *
 * Erst wenn alle vier stehen, arbeitet jemand wirklich mit der App. Ein
 * vergebener Login, den nie jemand benutzt, sieht in einer Liste aus wie
 * Fortschritt und ist keiner.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/** Anmeldungen aus der Benutzerverwaltung, seitenweise geholt. */
async function anmeldungen() {
  const treffer = new Map<string, string | null>();
  try {
    const admin = getSupabaseAdmin();
    for (let seite = 1; seite <= 10; seite += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
      if (error || !data?.users?.length) break;
      for (const nutzer of data.users) {
        const email = clean(nutzer.email).toLowerCase();
        if (email) treffer.set(email, (nutzer as AnyRow).last_sign_in_at || null);
      }
      if (data.users.length < 200) break;
    }
  } catch {
    /* Ohne Benutzerverwaltung bleibt der Schritt "angemeldet" leer. */
  }
  return treffer;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 });

    const supabase = auth.supabase;

    const [profileResult, tasksResult, entriesResult, pushResult] = await Promise.all([
      supabase.from("employee_profiles").select("id, name, email, role, auth_user_id, active, last_active").order("name", { ascending: true }),
      supabase.from("tasks").select("employee_name").limit(4000),
      supabase.from("time_entries").select("employee_name").limit(4000),
      supabase.from("push_subscriptions").select("employee_name").limit(500)
    ]);

    if (profileResult.error) throw new Error(profileResult.error.message);

    const mitEinsatz = new Set(((tasksResult.data || []) as AnyRow[]).map((row) => clean(row.employee_name).toLowerCase()).filter(Boolean));
    const mitStempel = new Set(((entriesResult.data || []) as AnyRow[]).map((row) => clean(row.employee_name).toLowerCase()).filter(Boolean));
    const mitPush = new Set(((pushResult.data || []) as AnyRow[]).map((row) => clean(row.employee_name).toLowerCase()).filter(Boolean));
    const angemeldetAm = await anmeldungen();

    const personen = ((profileResult.data || []) as AnyRow[])
      .filter((row) => clean(row.name) && row.active !== false && clean(row.role).toLowerCase() !== "admin")
      .map((row) => {
        const name = clean(row.name);
        const email = clean(row.email).toLowerCase();
        const einsatz = mitEinsatz.has(name.toLowerCase());
        const login = Boolean(clean(row.auth_user_id)) || angemeldetAm.has(email);
        const angemeldet = Boolean(email && angemeldetAm.get(email)) || Boolean(clean(row.last_active));
        const gestempelt = mitStempel.has(name.toLowerCase());
        const schritte = [einsatz, login, angemeldet, gestempelt];
        return {
          id: row.id,
          name,
          email: clean(row.email),
          einsatz,
          login,
          angemeldet,
          gestempelt,
          push: mitPush.has(name.toLowerCase()),
          zuletztAngemeldet: email ? angemeldetAm.get(email) || null : null,
          fortschritt: Math.round((schritte.filter(Boolean).length / schritte.length) * 100)
        };
      });

    const gesamt = personen.length;
    const zaehle = (pruefung: (person: AnyRow) => boolean) => personen.filter(pruefung).length;

    return NextResponse.json({
      ok: true,
      gesamt,
      personen,
      kennzahlen: {
        einsatz: zaehle((p) => p.einsatz),
        login: zaehle((p) => p.login),
        angemeldet: zaehle((p) => p.angemeldet),
        gestempelt: zaehle((p) => p.gestempelt),
        push: zaehle((p) => p.push),
        fertig: zaehle((p) => p.fortschritt === 100)
      }
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Einrichtungsstand konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
