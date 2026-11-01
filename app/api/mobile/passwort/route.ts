import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

/**
 * Nach dem Passwortwechsel den Merker loeschen.
 *
 * Das Passwort selbst aendert die App im Browser ueber Supabase
 * (supabase.auth.updateUser). Hier wird nur noch im Profil vermerkt, dass die
 * Pflicht erledigt ist - das Feld gehoert dem Betrieb, nicht dem Anmeldekonto.
 *
 * Bewusst ohne Passwort im Rumpf: Es soll nirgends durch unsere Server laufen.
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const profilId = auth.profile?.id;
    if (!profilId) {
      return NextResponse.json({ ok: false, error: "Kein Profil gefunden." }, { status: 404 });
    }

    const { error } = await auth.supabase
      .from("employee_profiles")
      .update({ must_change_password: false })
      .eq("id", profilId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
