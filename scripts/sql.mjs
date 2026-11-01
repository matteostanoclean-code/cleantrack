/**
 * Eine SQL-Datei gegen die Datenbank laufen lassen.
 *
 * Gebraucht fuer alles, was der REST-Zugang nicht kann: Tabellen und
 * Spalten anlegen. Bis hierher ging das nur von Hand im Supabase-Editor,
 * und dreimal kam eine Aenderung nicht an, obwohl der Editor fertig
 * meldete -- vermutlich ein Fenster auf einem anderen Projekt. Dieses
 * Skript nimmt immer die Datenbank aus der .env.local, also dieselbe, an
 * der die App haengt.
 *
 * Aufruf:
 *   node scripts/sql.mjs supabase/irgendwas.sql          # Vorschau
 *   node scripts/sql.mjs supabase/irgendwas.sql --wirklich
 *
 * Ohne --wirklich wird nur gezeigt, was ausgefuehrt wuerde. Das ist
 * Absicht: eine SQL-Datei kann alles, auch loeschen.
 *
 * Noetig in der .env.local:
 *   DATABASE_URL   aus Supabase: Project Settings > Database >
 *                  Connection string > Session pooler (URI)
 *
 * Das Kennwort darin wird nie ausgegeben, auch nicht in Fehlermeldungen.
 */

import { readFileSync } from "node:fs";
import pg from "pg";

const datei = process.argv[2];
const wirklich = process.argv.includes("--wirklich");

if (!datei) {
  console.error("Aufruf: node scripts/sql.mjs <datei.sql> [--wirklich]");
  process.exit(1);
}

const umgebung = {};
for (const zeile of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const treffer = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (treffer) umgebung[treffer[1]] = treffer[2].replace(/^["']|["']$/g, "");
}

const verbindung = umgebung.DATABASE_URL;
if (!verbindung) {
  console.error(
    "In .env.local fehlt DATABASE_URL.\n" +
      "Zu finden in Supabase unter Project Settings > Database >\n" +
      "Connection string > Session pooler, als URI."
  );
  process.exit(1);
}

/** Die Verbindung beschreiben, ohne das Kennwort zu zeigen. */
function ohneKennwort(text) {
  try {
    const adresse = new URL(text);
    return `${adresse.hostname}${adresse.port ? `:${adresse.port}` : ""}${adresse.pathname} als ${adresse.username}`;
  } catch {
    return "unlesbare Verbindungszeichenfolge";
  }
}

const inhalt = readFileSync(datei, "utf8");
console.log(`Datei:       ${datei} (${inhalt.split(/\r?\n/).length} Zeilen)`);
console.log(`Datenbank:   ${ohneKennwort(verbindung)}`);

if (!wirklich) {
  console.log("\nVorschau. Zum Ausfuehren noch einmal mit --wirklich.");
  process.exit(0);
}

const klient = new pg.Client({
  connectionString: verbindung,
  ssl: { rejectUnauthorized: false },
  application_name: "brutus-sql"
});

try {
  await klient.connect();

  // Zur Sicherheit erst sagen, wo wir gelandet sind. Genau diese Frage war
  // der Anlass fuer das Skript.
  const wo = await klient.query(
    "select current_database() as db, (select count(*) from public.tasks) as einsaetze"
  );
  console.log(`Verbunden:   ${wo.rows[0].db}, ${wo.rows[0].einsaetze} Einsaetze\n`);

  // Die ganze Datei in einem Rutsch. pg laesst mehrere Anweisungen zu und
  // gibt ein Ergebnis je Anweisung zurueck.
  const ergebnisse = await klient.query(inhalt);
  const liste = Array.isArray(ergebnisse) ? ergebnisse : [ergebnisse];

  for (const ergebnis of liste) {
    if (ergebnis.rows?.length) {
      console.table(ergebnis.rows);
    } else if (ergebnis.command) {
      console.log(`${ergebnis.command} ok`);
    }
  }
  console.log("\nFertig.");
} catch (fehler) {
  // Die Meldung von Postgres enthaelt kein Kennwort, der Stapel koennte es.
  console.error(`\nFEHLER: ${fehler.message}`);
  if (fehler.position) console.error(`An Zeichen ${fehler.position} der Datei.`);
  process.exitCode = 1;
} finally {
  await klient.end().catch(() => undefined);
}
