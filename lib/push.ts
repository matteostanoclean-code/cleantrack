import webpush from "web-push";
// Liegt getrennt, damit die App den Namen benutzen kann, ohne die
// Versand-Bibliothek in den Browser zu ziehen.
export { absenderName } from "@/lib/absender";

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

/**
 * Was beim Versand herauskam.
 *
 * Bisher ist der Versand still gescheitert: keine Schlüssel, kein Gerät, kein
 * Hinweis. Dann wartet jemand auf eine Nachricht, die nie losgeschickt wurde.
 * Wichtige Meldungen geben den Bericht deshalb bis in die Oberfläche durch.
 */
export type PushBericht = {
  geraete: number;
  zugestellt: number;
  fehler: number;
  grund: "ok" | "keine_schluessel" | "kein_empfaenger" | "kein_geraet" | "zustellung_fehlgeschlagen";
};

/** Verschickt an alle hinterlegten Geräte der genannten Personen. */
async function anNamen(supabase: Supabase, namen: string[], titel: string, text: string, ziel: string, art: string): Promise<PushBericht> {
  const env = schluessel();
  if (!env) return { geraete: 0, zugestellt: 0, fehler: 0, grund: "keine_schluessel" };
  if (!namen.length) return { geraete: 0, zugestellt: 0, fehler: 0, grund: "kein_empfaenger" };

  const { data: abos } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("employee_name", namen);

  if (!abos || !abos.length) return { geraete: 0, zugestellt: 0, fehler: 0, grund: "kein_geraet" };

  webpush.setVapidDetails(env.subject, env.publicKey, env.privateKey);
  const inhalt = JSON.stringify({ title: titel, body: text, url: ziel, type: art });

  let zugestellt = 0;
  let fehler = 0;
  for (const abo of abos) {
    try {
      await webpush.sendNotification(
        { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
        inhalt
      );
      zugestellt += 1;
    } catch (grund) {
      fehler += 1;
      const status = (grund as { statusCode?: number }).statusCode;
      // Abgelaufene Anmeldungen aufräumen, sonst sammeln sich tote Geräte an.
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", abo.id);
      }
    }
  }

  return {
    geraete: abos.length,
    zugestellt,
    fehler,
    grund: zugestellt > 0 ? "ok" : "zustellung_fehlgeschlagen"
  };
}

/** Klartext für die Oberfläche, wenn eine wichtige Nachricht nicht rausging. */
export function pushKlartext(bericht: PushBericht, empfaenger: string) {
  if (bericht.grund === "ok") {
    return bericht.fehler
      ? `Push an ${empfaenger}: ${bericht.zugestellt} von ${bericht.geraete} Geräten erreicht.`
      : null;
  }
  if (bericht.grund === "keine_schluessel") return "Push ist auf dem Server nicht eingerichtet (VAPID-Schlüssel fehlen). Die Meldung steht nur in der App.";
  if (bericht.grund === "kein_geraet") return `${empfaenger} hat kein Gerät für Push angemeldet. Einmal in der App unter Einstellungen Push aktivieren.`;
  if (bericht.grund === "kein_empfaenger") return "Für die Meldung war niemand hinterlegt.";
  return `Die Push-Nachricht an ${empfaenger} wurde von keinem Gerät angenommen.`;
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
  if (!sauber) return { geraete: 0, zugestellt: 0, fehler: 0, grund: "kein_empfaenger" } as PushBericht;
  return anNamen(supabase, [sauber], titel, text, ziel, art);
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

  return anNamen(supabase, namen, titel, text, ziel, art);
}
