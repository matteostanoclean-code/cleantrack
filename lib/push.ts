import webpush from "web-push";

/**
 * Push-Nachrichten an Mitarbeiter oder an das Büro.
 *
 * Vorher war der Versand nur in der Stempeluhr eingebaut. Antworten aus dem
 * Adminbereich und Nachrichten aus dem Chat kamen deshalb nie auf dem Handy an.
 *
 * Fehlen die VAPID-Schlüssel in der Umgebung, passiert nichts. Die Nachricht
 * ist dann trotzdem gespeichert und erscheint beim nächsten Öffnen der App.
 */

type Supabase = any;

function schluessel() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function istAdminRolle(rolle: unknown) {
  const wert = String(rolle || "").trim().toLowerCase();
  return wert === "admin" || wert === "objektleiter" || wert === "object_lead" || wert === "objectleader";
}

/** Verschickt an alle hinterlegten Geräte der genannten Personen. */
async function anNamen(supabase: Supabase, namen: string[], titel: string, text: string, ziel: string, art: string) {
  const env = schluessel();
  if (!env || !namen.length) return;

  const { data: abos } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("employee_name", namen);

  if (!abos || !abos.length) return;

  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  const inhalt = JSON.stringify({ title: titel, body: text, url: ziel, type: art });

  for (const abo of abos) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        inhalt
      );
    } catch (fehler) {
      const status = (fehler as { statusCode?: number }).statusCode;
      // Abgelaufene Anmeldungen aufräumen, sonst sammeln sich tote Geräte an.
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", abo.id);
      }
    }
  }
}

/** An einen einzelnen Mitarbeiter. */
export async function pushAnMitarbeiter(
  supabase: Supabase,
  name: string,
  titel: string,
  text: string,
  ziel = "/mitarbeiter/chat",
  art = "chat_message"
) {
  const sauber = String(name || "").trim();
  if (!sauber) return;
  await anNamen(supabase, [sauber], titel, text, ziel, art);
}

/** An alle Administratoren und Objektleiter. */
export async function pushAnBuero(
  supabase: Supabase,
  titel: string,
  text: string,
  ziel = "/mitarbeiter/admin/chat",
  art = "chat_message"
) {
  const { data: profile } = await supabase
    .from("employee_profiles")
    .select("name, role, active")
    .neq("active", false);

  const namen = (profile || [])
    .filter((row: any) => istAdminRolle(row.role))
    .map((row: any) => String(row.name || "").trim())
    .filter(Boolean);

  await anNamen(supabase, namen, titel, text, ziel, art);
}
