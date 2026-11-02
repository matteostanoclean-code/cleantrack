import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyRow = Record<string, any>;

const BUCKET = "lohn-dokumente";

/**
 * Entgeltabrechnungen aus dem Büro hochladen und ansehen.
 *
 * Der Lohn-Wächter legt sie von selbst ab, sobald die Mail vom Lohnbüro
 * kommt. Das hier ist der Weg von Hand: ein älterer Monat, eine Korrektur,
 * oder eine Abrechnung, die nicht über den üblichen Weg kam.
 *
 * Anders als beim Wächter sagt hier der Aufrufer, zu wem die Datei gehört —
 * deshalb nur fürs Büro, und deshalb steht der Name beim Hochladen gross
 * daneben. Die Datei landet im selben privaten Ablagefach; eine Adresse
 * dorthin erzeugt der Server nur auf Anfrage und nur für kurze Zeit.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function pruefen(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, antwort: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, antwort: NextResponse.json({ ok: false, error: "Nur fürs Büro." }, { status: 403 }) };
  return { ok: true as const, auth };
}

export async function GET(request: Request) {
  try {
    const wache = await pruefen(request);
    if (!wache.ok) return wache.antwort;

    const id = clean(new URL(request.url).searchParams.get("mitarbeiter"));
    if (!id) return NextResponse.json({ ok: false, error: "Welcher Mitarbeiter?" }, { status: 400 });

    const { data, error } = await wache.auth.supabase
      .from("lohn_dokumente")
      .select("id, jahr, monat, art, dateiname, groesse, hochgeladen_at, hochgeladen_von, gesehen_at")
      .eq("employee_profile_id", id)
      .order("jahr", { ascending: false })
      .order("monat", { ascending: false })
      .limit(120);

    // Fehlt die Tabelle noch, bleibt die Liste leer statt kaputt.
    if (error) return NextResponse.json({ ok: true, dokumente: [], eingerichtet: false });
    return NextResponse.json({ ok: true, dokumente: data || [], eingerichtet: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Abrechnungen konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const wache = await pruefen(request);
    if (!wache.ok) return wache.antwort;
    const supabase = wache.auth.supabase;

    const body = await request.json();
    const id = clean(body.employee_profile_id);
    const jahr = Number(body.jahr);
    const monat = Number(body.monat);
    const inhalt = clean(body.inhalt);

    if (!id) return NextResponse.json({ ok: false, error: "Welcher Mitarbeiter?" }, { status: 400 });
    if (!Number.isInteger(jahr) || jahr < 2020 || jahr > 2100) {
      return NextResponse.json({ ok: false, error: "Bitte ein Jahr angeben." }, { status: 400 });
    }
    if (!Number.isInteger(monat) || monat < 1 || monat > 12) {
      return NextResponse.json({ ok: false, error: "Bitte einen Monat angeben." }, { status: 400 });
    }
    if (!inhalt) return NextResponse.json({ ok: false, error: "Die Datei fehlt." }, { status: 400 });

    const datei = Buffer.from(inhalt, "base64");
    if (!datei.length || datei.length > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Die Datei ist leer oder größer als 10 MB." }, { status: 400 });
    }
    if (datei.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ ok: false, error: "Das ist keine PDF-Datei." }, { status: 400 });
    }

    const person = await supabase.from("employee_profiles").select("id, name").eq("id", id).maybeSingle();
    if (person.error) throw new Error(person.error.message);
    if (!person.data) return NextResponse.json({ ok: false, error: "Diesen Mitarbeiter gibt es nicht." }, { status: 404 });

    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "10MB" }).catch(() => undefined);

    const pfad = `${id}/${jahr}-${String(monat).padStart(2, "0")}.pdf`;
    const hoch = await supabase.storage.from(BUCKET).upload(pfad, datei, { contentType: "application/pdf", upsert: true });
    if (hoch.error) throw new Error(hoch.error.message);

    const gespeichert = await supabase
      .from("lohn_dokumente")
      .upsert(
        {
          employee_profile_id: id,
          employee_name: clean((person.data as AnyRow).name),
          jahr,
          monat,
          art: clean(body.art) || "entgeltabrechnung",
          pfad,
          dateiname: clean(body.dateiname) || `Entgeltabrechnung ${String(monat).padStart(2, "0")}-${jahr}.pdf`,
          groesse: datei.length,
          hochgeladen_at: new Date().toISOString(),
          hochgeladen_von: clean(wache.auth.profile.name) || "Büro",
          // Eine ersetzte Abrechnung gilt als ungesehen.
          gesehen_at: null
        },
        { onConflict: "employee_profile_id,jahr,monat,art" }
      )
      .select("id")
      .maybeSingle();
    if (gespeichert.error) throw new Error(gespeichert.error.message);

    return NextResponse.json({ ok: true, mitarbeiter: clean((person.data as AnyRow).name), jahr, monat });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Hochladen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/**
 * Eine Abrechnung wieder entfernen.
 *
 * Beim Hochladen von Hand ist der falsche Monat schnell gewählt, und dann
 * liegt sie beim Mitarbeiter in der App. Erst die Datei, dann der Eintrag:
 * Bleibt die Datei liegen, zahlt man für Platz, den niemand sieht.
 */
export async function DELETE(request: Request) {
  try {
    const wache = await pruefen(request);
    if (!wache.ok) return wache.antwort;
    const supabase = wache.auth.supabase;

    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Welche Abrechnung?" }, { status: 400 });

    const { data, error } = await supabase.from("lohn_dokumente").select("id, pfad, jahr, monat").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Diese Abrechnung gibt es nicht mehr." }, { status: 404 });

    const dokument = data as AnyRow;
    if (clean(dokument.pfad)) {
      await supabase.storage.from(BUCKET).remove([clean(dokument.pfad)]);
    }
    const weg = await supabase.from("lohn_dokumente").delete().eq("id", id);
    if (weg.error) throw new Error(weg.error.message);

    return NextResponse.json({ ok: true, jahr: dokument.jahr, monat: dokument.monat });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Eine Adresse zum Ansehen, fünf Minuten gültig. */
export async function PATCH(request: Request) {
  try {
    const wache = await pruefen(request);
    if (!wache.ok) return wache.antwort;

    const body = await request.json();
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Welche Abrechnung?" }, { status: 400 });

    const { data, error } = await wache.auth.supabase
      .from("lohn_dokumente")
      .select("id, pfad, dateiname")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ ok: false, error: "Diese Abrechnung gibt es nicht." }, { status: 404 });

    const dokument = data as AnyRow;
    const signiert = await wache.auth.supabase.storage
      .from(BUCKET)
      .createSignedUrl(clean(dokument.pfad), 300, { download: clean(dokument.dateiname) || "Entgeltabrechnung.pdf" });
    if (signiert.error || !signiert.data?.signedUrl) throw new Error(signiert.error?.message || "Die Datei liegt nicht mehr da.");

    return NextResponse.json({ ok: true, adresse: signiert.data.signedUrl });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Die Abrechnung konnte nicht geöffnet werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
