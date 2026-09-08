import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedMobileProfile, type MobileProfile } from "@/lib/mobileAuth";

/**
 * Geräteschlüssel.
 *
 * Die normale Anmeldung über Supabase läuft nach kurzer Zeit ab — im Browser
 * ist das richtig, für eine App auf dem Handy unbrauchbar. Ein Geräteschlüssel
 * ist langlebig, hängt an genau einem Profil und lässt sich einzeln abschalten,
 * ohne dass jemand sein Passwort ändern muss.
 *
 * Gespeichert wird nur die Prüfsumme. Wer die Tabelle liest, kann sich damit
 * nicht anmelden. Den Schlüssel selbst sieht man genau einmal: beim Erzeugen.
 */

type AnyRow = Record<string, any>;

/** Erkennbares Vorzeichen, damit ein Schlüssel nicht mit einem Login verwechselt wird. */
const VORZEICHEN = "bru_";

export function neuerSchluessel() {
  return VORZEICHEN + randomBytes(24).toString("base64url");
}

export function istGeraeteSchluessel(wert: string) {
  return wert.startsWith(VORZEICHEN);
}

export function pruefsumme(schluessel: string) {
  return createHash("sha256").update(schluessel).digest("hex");
}

/** Vergleich in gleichbleibender Zeit, damit sich ein Schlüssel nicht erraten lässt. */
export function gleich(a: string, b: string) {
  const links = Buffer.from(a);
  const rechts = Buffer.from(b);
  if (links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}

function bearer(request: Request) {
  const kopf = request.headers.get("authorization") || "";
  return kopf.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

/**
 * Meldet einen Aufruf an — entweder über die normale Anmeldung oder über
 * einen Geräteschlüssel.
 *
 * Die Reihenfolge ist Absicht: Die bestehende Anmeldung wird zuerst versucht
 * und bleibt völlig unverändert. Der Geräteschlüssel ist ein zusätzlicher
 * Weg hinein, kein Ersatz.
 */
export async function anmelden(request: Request) {
  const token = bearer(request);

  if (!token) {
    return { ok: false as const, status: 401, error: "Bitte anmelden." };
  }

  if (!istGeraeteSchluessel(token)) {
    return getAuthenticatedMobileProfile(request);
  }

  const supabase = getSupabaseAdmin();
  const gesucht = pruefsumme(token);

  const treffer = await supabase
    .from("device_tokens")
    .select("id, pruefsumme, profil_id, aktiv")
    .eq("pruefsumme", gesucht)
    .eq("aktiv", true)
    .maybeSingle();

  if (treffer.error) {
    return { ok: false as const, status: 500, error: treffer.error.message };
  }

  const eintrag = treffer.data as AnyRow | null;
  if (!eintrag || !gleich(String(eintrag.pruefsumme), gesucht)) {
    return { ok: false as const, status: 401, error: "Dieser Geräteschlüssel gilt nicht mehr." };
  }

  const profilTreffer = await supabase
    .from("employee_profiles")
    .select("*")
    .eq("id", eintrag.profil_id)
    .maybeSingle();

  const profil = profilTreffer.data as MobileProfile | null;
  if (!profil) {
    return { ok: false as const, status: 403, error: "Zu diesem Schlüssel gibt es kein Profil mehr." };
  }
  if ((profil as AnyRow).active === false) {
    return { ok: false as const, status: 403, error: "Dieses Profil ist deaktiviert." };
  }

  // Festhalten, wann zuletzt damit gearbeitet wurde. Nur so lässt sich später
  // erkennen, welcher Schlüssel tot ist und weg kann. Schlägt es fehl, ist das
  // kein Grund, den Aufruf abzulehnen.
  supabase
    .from("device_tokens")
    .update({ zuletzt_am: new Date().toISOString() })
    .eq("id", eintrag.id)
    .then(undefined, () => undefined);

  return {
    ok: true as const,
    supabase,
    user: null,
    profile: profil,
    isAdmin: String((profil as AnyRow).role || "").toLowerCase() === "admin",
    ueberGeraet: true
  };
}
