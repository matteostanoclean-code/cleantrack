import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type AnyRow = Record<string, any>;

/**
 * Gemeinsames fürs Kundenportal.
 *
 * Der Zugang hängt an einem geheimen Wert in der Adresse, sonst an nichts.
 * Deshalb gelten hier zwei Regeln ohne Ausnahme:
 *
 * 1. Jede Anfrage schlägt den Kunden über diesen Wert nach. Nie wird eine
 *    Kundennummer oder eine Kennung aus der Adresse als Auswahl benutzt —
 *    sonst könnte jemand mit einem gültigen Link die Daten der anderen lesen,
 *    indem er die Nummer hochzählt.
 * 2. Zurückgegeben wird nur, was der Kunde sehen darf. Stunden, Löhne und
 *    Deckungsbeiträge kommen hier gar nicht erst vor, auch nicht versteckt.
 */

export function sauber(wert: unknown) {
  return String(wert ?? "").trim();
}

/** Ein Wert, den man nicht rät: 32 Zeichen aus dem Zufallsgenerator. */
export function neuesPortalToken() {
  const zeichen = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => zeichen[byte % zeichen.length]).join("");
}

export type PortalKunde = {
  id: string;
  name: string;
  objekte: AnyRow[];
};

/**
 * Den Kunden zum Link finden. Gibt null zurück, wenn es ihn nicht gibt oder
 * das Portal abgeschaltet ist — in beiden Fällen sieht der Aufrufer dasselbe,
 * damit sich aus der Antwort nichts ableiten lässt.
 */
export async function kundeZumToken(token: string): Promise<PortalKunde | null> {
  const wert = sauber(token);
  // Kurze Werte gar nicht erst nachschlagen: das wäre ein Rateversuch.
  if (wert.length < 24) return null;

  const supabase = getSupabaseAdmin();
  const treffer = await supabase
    .from("customers")
    .select("id, name, portal_aktiv")
    .eq("portal_token", wert)
    .maybeSingle();

  if (treffer.error || !treffer.data || treffer.data.portal_aktiv === false) return null;

  const objekte = await supabase
    .from("work_sites")
    .select("id, name, street, postal_code, city, address, tags, active, status")
    .eq("customer_id", treffer.data.id)
    .order("name", { ascending: true })
    .limit(100);

  return {
    id: treffer.data.id,
    name: sauber(treffer.data.name),
    objekte: ((objekte.data || []) as AnyRow[]).filter(
      (objekt) => objekt.active !== false && sauber(objekt.status).toLowerCase() !== "passiv"
    )
  };
}
