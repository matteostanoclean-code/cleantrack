import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRow = Record<string, any>;

const BUCKET = "lohn-dokumente";

/**
 * Eine Entgeltabrechnung für einen Mitarbeiter ablegen.
 *
 * Gegenstelle für den Lohn-Wächter im Büro: Dort wird das Sammel-PDF der
 * Lohnbuchhaltung zerlegt, hier landet die einzelne Seite. Danach sieht der
 * Mitarbeiter sie in der App unter "Meine Abrechnungen".
 *
 * Drei Dinge, die hier anders sind als sonst:
 *
 * 1. Der Bucket ist **privat**. Keine öffentliche Adresse, nie — eine
 *    Entgeltabrechnung nennt Verdienst, Steuerklasse und SV-Nummer. Zum
 *    Lesen erzeugt der Server eine Adresse mit kurzer Gültigkeit.
 * 2. Der Mitarbeiter wird hier bestimmt, nicht vom Aufrufer mitgeschickt:
 *    Name und Personalnummer stehen auf der Seite selbst, beides muss auf
 *    genau ein Profil passen. Trifft es keines oder mehrere, wird nichts
 *    abgelegt und das Büro bekommt es gemeldet.
 * 3. Eigener Schlüssel, nicht der Service-Schlüssel der Datenbank. Dieses
 *    Ende kann nichts weiter als Abrechnungen ablegen.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/** Namen vergleichbar machen: Umlaute, Groß- und Kleinschreibung, Reihenfolge. */
function schluesselVon(name: unknown) {
  return clean(name)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export async function POST(request: Request) {
  try {
    const schluessel = process.env.LOHN_SCHLUESSEL;
    if (!schluessel) {
      return NextResponse.json({ ok: false, error: "Dieses Ende ist nicht eingerichtet." }, { status: 503 });
    }
    if (clean(request.headers.get("authorization")) !== `Bearer ${schluessel}`) {
      return NextResponse.json({ ok: false, error: "Nicht berechtigt." }, { status: 401 });
    }

    const body = await request.json();
    const name = clean(body.name);
    const personalnummer = clean(body.personalnummer);
    const jahr = Number(body.jahr);
    const monat = Number(body.monat);
    const inhalt = clean(body.inhalt);

    if (!name) return NextResponse.json({ ok: false, error: "Name fehlt." }, { status: 400 });
    if (!Number.isInteger(jahr) || jahr < 2020 || jahr > 2100) {
      return NextResponse.json({ ok: false, error: "Jahr fehlt oder ist unbrauchbar." }, { status: 400 });
    }
    if (!Number.isInteger(monat) || monat < 1 || monat > 12) {
      return NextResponse.json({ ok: false, error: "Monat fehlt oder ist unbrauchbar." }, { status: 400 });
    }
    if (!inhalt) return NextResponse.json({ ok: false, error: "Die Datei fehlt." }, { status: 400 });

    const datei = Buffer.from(inhalt, "base64");
    if (!datei.length || datei.length > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Die Datei ist leer oder zu groß." }, { status: 400 });
    }
    // Es muss ein PDF sein. Sonst landet irgendwann etwas anderes in einem
    // Ordner, aus dem heraus Leute Dateien öffnen.
    if (datei.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ ok: false, error: "Das ist keine PDF-Datei." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Den Mitarbeiter bestimmen. Der Name muss passen, und wenn eine
    // Personalnummer dabei ist, darf sie nicht widersprechen.
    const personen = await supabase.from("employee_profiles").select("id, name, active, employee_number");
    if (personen.error) throw new Error(personen.error.message);

    const gesucht = schluesselVon(name);
    const treffer = ((personen.data || []) as AnyRow[]).filter(
      (person) => person.active !== false && schluesselVon(person.name) === gesucht
    );

    if (!treffer.length) {
      return NextResponse.json({ ok: false, error: `Kein aktives Profil für "${name}".`, unbekannt: true }, { status: 404 });
    }
    if (treffer.length > 1) {
      // Zwei gleiche Namen: hier wird nicht geraten. Im Betrieb gab es das
      // schon (zwei Ilonas), und eine Abrechnung beim Falschen ist ein
      // Datenschutzvorfall, kein Schönheitsfehler.
      return NextResponse.json(
        { ok: false, error: `"${name}" passt auf ${treffer.length} Profile. Bitte im Büro zuordnen.`, mehrdeutig: true },
        { status: 409 }
      );
    }

    const person = treffer[0];
    const hinterlegt = clean(person.employee_number);
    if (personalnummer && hinterlegt && personalnummer !== hinterlegt) {
      return NextResponse.json(
        {
          ok: false,
          error: `Die Personalnummer auf der Abrechnung (${personalnummer}) passt nicht zu ${clean(person.name)} (${hinterlegt}).`,
          widerspruch: true
        },
        { status: 409 }
      );
    }

    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "10MB" }).catch(() => undefined);

    const pfad = `${person.id}/${jahr}-${String(monat).padStart(2, "0")}.pdf`;
    const hochgeladen = await supabase.storage.from(BUCKET).upload(pfad, datei, {
      contentType: "application/pdf",
      upsert: true
    });
    if (hochgeladen.error) throw new Error(hochgeladen.error.message);

    const eintrag = {
      employee_profile_id: person.id,
      employee_name: clean(person.name),
      jahr,
      monat,
      art: clean(body.art) || "entgeltabrechnung",
      pfad,
      dateiname: clean(body.dateiname) || `Entgeltabrechnung ${String(monat).padStart(2, "0")}-${jahr}.pdf`,
      groesse: datei.length,
      personalnummer: personalnummer || null,
      hochgeladen_at: new Date().toISOString(),
      hochgeladen_von: clean(body.von) || "Lohn-Wächter",
      // Bei einer ersetzten Abrechnung soll "gesehen" nicht stehen bleiben.
      gesehen_at: null
    };

    const gespeichert = await supabase
      .from("lohn_dokumente")
      .upsert(eintrag, { onConflict: "employee_profile_id,jahr,monat,art" })
      .select("id")
      .maybeSingle();
    if (gespeichert.error) throw new Error(gespeichert.error.message);

    return NextResponse.json({ ok: true, mitarbeiter: clean(person.name), jahr, monat });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Abrechnung konnte nicht abgelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
