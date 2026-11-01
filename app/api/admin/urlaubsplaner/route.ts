import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";
import { listeLaden } from "@/lib/einstellungen";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Urlaubsplaner: ein ganzes Jahr auf einen Blick.
 *
 * Liefert in einem Zug, was der Planer braucht — Mitarbeiter mit Anspruch,
 * ihre Abwesenheiten des Jahres, die Objekte und die Zeiträume, in denen beim
 * Kunden geschlossen ist.
 *
 * Angelegt werden Mitarbeiter-Abwesenheiten weiterhin über
 * /api/mobile/admin/vacation. Dort hängt die Stundengutschrift dran, und zwei
 * Wege in dieselbe Tabelle laufen früher oder später auseinander. Hier werden
 * nur die Schließzeiten der Kunden geschrieben, die es sonst nirgends gibt.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableDatum(value: unknown) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function fehlendeTabelle(fehler: unknown) {
  const text = String((fehler as AnyRow)?.message || fehler || "");
  return /relation|does not exist|schema cache/i.test(text);
}

const FEHLT = "Die Tabelle für Kundenurlaub fehlt noch. Bitte supabase/kundenurlaub.sql ausführen.";

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
    const supabase = guard.auth.supabase;

    /**
     * Kleine Auskunft für die Objektmaske: alle Schließzeiten eines Objekts,
     * ohne das ganze Jahr mit Personal und Abwesenheiten zu laden. Dort geht
     * es nur um die eine Frage "wann hat dieser Kunde zu".
     */
    const nurObjekt = uuidOrNull(new URL(request.url).searchParams.get("objekt"));
    if (nurObjekt) {
      const treffer = await supabase
        .from("site_closures")
        .select("*")
        .eq("work_site_id", nurObjekt)
        .order("von", { ascending: true })
        .limit(200);
      if (treffer.error) {
        if (fehlendeTabelle(treffer.error)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
        throw new Error(treffer.error.message);
      }
      return NextResponse.json({ ok: true, schliessungen: treffer.data || [] });
    }

    const jahr = Number(clean(new URL(request.url).searchParams.get("jahr"))) || new Date().getFullYear();
    const von = `${jahr}-01-01`;
    const bis = `${jahr}-12-31`;

    const [personen, abwesenheiten, objekte, schliessungen] = await Promise.all([
      supabase.from("employee_profiles").select("*").order("name", { ascending: true }),
      // Alles, was das Jahr berührt: Beginn davor, Ende danach zählt mit.
      supabase.from("absence_requests").select("*").lte("start_date", bis).gte("end_date", von).limit(2000),
      supabase.from("work_sites").select("id, name, customer_name, active, status").order("name", { ascending: true }).limit(500),
      supabase.from("site_closures").select("*").lte("von", bis).gte("bis", von).order("von", { ascending: true }).limit(1000)
    ]);

    if (personen.error) throw new Error(personen.error.message);

    // Die Abwesenheitsarten aus den Einstellungen, damit Planer und
    // Einstellungen dieselbe Liste zeigen.
    const arten = await listeLaden(supabase, "abwesenheitsarten");
    // Feiertage, damit im Planer sichtbar ist, wo ohnehin frei ist. Wer am
    // 1. Mai Urlaub nimmt, verschenkt einen Tag.
    const feiertage = (await listeLaden(supabase, "feiertage"))
      .map((zeile) => ({ name: clean(zeile.name), datum: clean((zeile.daten as AnyRow)?.datum).slice(0, 10) }))
      .filter((zeile) => zeile.datum.startsWith(String(jahr)));

    const offeneObjekte = objekte.error
      ? []
      : ((objekte.data || []) as AnyRow[]).filter((objekt) => objekt.active !== false && clean(objekt.status).toLowerCase() !== "passiv");

    /**
     * Wer wird durch Kundenurlaub frei?
     *
     * Ist beim Kunden zu, fallen die Einsätze dort aus. Diese Übersicht nennt
     * die Personen, die dadurch an dem Tag Zeit haben — und ob sie ganz frei
     * sind oder nur ein Stück. Genau das ist die Frage beim Urlaubsplanen:
     * Wen kann ich wegschicken, ohne dass ein Kunde es merkt.
     */
    const schliessungenAktiv = (schliessungen.error ? [] : ((schliessungen.data || []) as AnyRow[]))
      .filter((eintrag) => eintrag.faellt_aus !== false);

    let freigestellt: AnyRow[] = [];
    if (schliessungenAktiv.length) {
      const erster = schliessungenAktiv.reduce((min, e) => (clean(e.von) < min ? clean(e.von) : min), clean(schliessungenAktiv[0].von));
      const letzter = schliessungenAktiv.reduce((max, e) => (clean(e.bis) > max ? clean(e.bis) : max), clean(schliessungenAktiv[0].bis));

      // Nur die Tage laden, die von einer Schließung berührt werden.
      const aufgaben = await supabase
        .from("tasks")
        .select("id, employee_name, work_site_id, task_date, planned_minutes, max_minutes, site, title, status, done")
        .gte("task_date", erster < von ? von : erster)
        .lte("task_date", letzter > bis ? bis : letzter)
        .limit(4000);

      const alleAufgaben = (aufgaben.error ? [] : (aufgaben.data || [])) as AnyRow[];

      // Je Tag: was ist geplant, und was fällt davon weg.
      const jeTag = new Map<string, AnyRow[]>();
      for (const aufgabe of alleAufgaben) {
        const tag = clean(aufgabe.task_date).slice(0, 10);
        if (!tag) continue;
        jeTag.set(tag, [...(jeTag.get(tag) || []), aufgabe]);
      }

      const gesammelt = new Map<string, AnyRow>();
      for (const schliessung of schliessungenAktiv) {
        const objektId = clean(schliessung.work_site_id);
        const lauf = new Date(`${clean(schliessung.von)}T12:00:00`);
        const ende = new Date(`${clean(schliessung.bis)}T12:00:00`);
        if (Number.isNaN(lauf.getTime()) || Number.isNaN(ende.getTime())) continue;

        while (lauf <= ende) {
          const tag = `${lauf.getFullYear()}-${String(lauf.getMonth() + 1).padStart(2, "0")}-${String(lauf.getDate()).padStart(2, "0")}`;
          lauf.setDate(lauf.getDate() + 1);
          if (tag < von || tag > bis) continue;

          const amTag = jeTag.get(tag) || [];
          const entfallen = amTag.filter((aufgabe) => clean(aufgabe.work_site_id) === objektId && !aufgabe.done);
          if (!entfallen.length) continue;

          const eintrag = gesammelt.get(tag) || { datum: tag, objekte: [] as AnyRow[], personen: new Map<string, AnyRow>() };
          eintrag.objekte.push({
            name: clean(schliessung.object_name) || "Objekt",
            grund: clean(schliessung.grund) || "Geschlossen",
            einsaetze: entfallen.length
          });

          for (const aufgabe of entfallen) {
            const person = clean(aufgabe.employee_name);
            if (!person) continue;
            const minuten = Number(aufgabe.planned_minutes) || Number(aufgabe.max_minutes) || 0;
            const bisher = eintrag.personen.get(person) || { name: person, entfallen: 0, bleibt: 0, objekte: [] as string[] };
            bisher.entfallen += minuten;
            bisher.objekte.push(clean(schliessung.object_name) || clean(aufgabe.site) || "Objekt");
            eintrag.personen.set(person, bisher);
          }
          gesammelt.set(tag, eintrag);
        }
      }

      // Was bleibt der Person an dem Tag sonst noch? Erst damit ist klar, ob
      // sie ganz frei ist oder nur früher Feierabend hat.
      const geschlosseneObjekteJeTag = new Map<string, Set<string>>();
      for (const schliessung of schliessungenAktiv) {
        const lauf = new Date(`${clean(schliessung.von)}T12:00:00`);
        const ende = new Date(`${clean(schliessung.bis)}T12:00:00`);
        if (Number.isNaN(lauf.getTime()) || Number.isNaN(ende.getTime())) continue;
        while (lauf <= ende) {
          const tag = `${lauf.getFullYear()}-${String(lauf.getMonth() + 1).padStart(2, "0")}-${String(lauf.getDate()).padStart(2, "0")}`;
          lauf.setDate(lauf.getDate() + 1);
          const menge = geschlosseneObjekteJeTag.get(tag) || new Set<string>();
          menge.add(clean(schliessung.work_site_id));
          geschlosseneObjekteJeTag.set(tag, menge);
        }
      }

      for (const [tag, eintrag] of gesammelt) {
        const zu = geschlosseneObjekteJeTag.get(tag) || new Set<string>();
        for (const aufgabe of jeTag.get(tag) || []) {
          const person = clean(aufgabe.employee_name);
          const treffer = eintrag.personen.get(person);
          if (!treffer || aufgabe.done) continue;
          if (zu.has(clean(aufgabe.work_site_id))) continue;
          treffer.bleibt += Number(aufgabe.planned_minutes) || Number(aufgabe.max_minutes) || 0;
        }
      }

      freigestellt = Array.from(gesammelt.values())
        .map((eintrag) => ({
          datum: eintrag.datum,
          objekte: eintrag.objekte,
          personen: Array.from((eintrag.personen as Map<string, AnyRow>).values()).sort((a, b) => b.entfallen - a.entfallen)
        }))
        .sort((a, b) => a.datum.localeCompare(b.datum));
    }

    return NextResponse.json({
      ok: true,
      jahr,
      setupFehlt: Boolean(schliessungen.error && fehlendeTabelle(schliessungen.error)),
      freigestellt,
      // Für die Auswahl „ganzer Kunde" im Formular.
      kunden: Array.from(
        new Map(
          offeneObjekte
            .filter((objekt) => clean(objekt.customer_name))
            .map((objekt) => [clean(objekt.customer_name), { name: clean(objekt.customer_name) }])
        ).values()
      ).sort((a, b) => a.name.localeCompare(b.name)),
      mitarbeiter: ((personen.data || []) as AnyRow[])
        .filter((person) => clean(person.name) && person.active !== false)
        .map((person) => ({
          id: person.id,
          name: clean(person.name),
          rolle: clean(person.role),
          anspruch: Number(person.annual_vacation_days ?? person.vacation_days ?? 0) || 0
        })),
      abwesenheiten: abwesenheiten.error ? [] : (abwesenheiten.data || []),
      objekte: offeneObjekte,
      schliessungen: schliessungen.error ? [] : (schliessungen.data || []),
      arten: arten.map((zeile) => ({ name: clean(zeile.name), farbe: clean(zeile.farbe) })),
      feiertage
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Der Planer konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Kundenurlaub anlegen. */
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const objektId = uuidOrNull(body.work_site_id);
    const kunde = clean(body.customer_name);
    const von = nullableDatum(body.von);
    const bis = nullableDatum(body.bis) || von;

    if (!objektId && !kunde) return NextResponse.json({ ok: false, error: "Bitte einen Kunden oder ein Objekt wählen." }, { status: 400 });
    if (!von || !bis) return NextResponse.json({ ok: false, error: "Bitte einen Zeitraum angeben." }, { status: 400 });
    if (bis < von) return NextResponse.json({ ok: false, error: "Das Ende liegt vor dem Anfang." }, { status: 400 });

    /**
     * Ein Kunde kann mehrere Objekte haben — MG hat Nobel und Carl, die
     * Kirchengemeinde St. Martin und den Kindergarten. Macht der Kunde zu,
     * macht er überall zu. Deshalb wird je Objekt eine Zeile geschrieben:
     * später lässt sich eines davon einzeln wieder aufmachen.
     */
    let ziele: AnyRow[] = [];
    if (objektId) {
      const objekt = (await supabase.from("work_sites").select("id, name, customer_name").eq("id", objektId).maybeSingle()).data as AnyRow | null;
      if (!objekt) return NextResponse.json({ ok: false, error: "Dieses Objekt wurde nicht gefunden." }, { status: 404 });
      ziele = [objekt];
    } else {
      const treffer = await supabase
        .from("work_sites")
        .select("id, name, customer_name, active, status")
        .eq("customer_name", kunde)
        .limit(50);
      ziele = ((treffer.data || []) as AnyRow[]).filter((objekt) => objekt.active !== false && clean(objekt.status).toLowerCase() !== "passiv");
      if (!ziele.length) return NextResponse.json({ ok: false, error: `Zu ${kunde} gibt es kein aktives Objekt.` }, { status: 404 });
    }

    const angelegt: AnyRow[] = [];
    for (const objekt of ziele) {
      const ergebnis = await safeInsert(supabase, "site_closures", {
        work_site_id: objekt.id,
        object_name: clean(objekt.name) || null,
        customer_name: clean(objekt.customer_name) || null,
        von,
        bis,
        grund: nullableText(body.grund),
        faellt_aus: body.faellt_aus !== false,
        notiz: nullableText(body.notiz),
        created_by: guard.auth.profile.name
      });
      if (ergebnis.data) angelegt.push(ergebnis.data);
    }

    return NextResponse.json({ ok: true, eintraege: angelegt, anzahl: angelegt.length, objekte: ziele.map((o) => clean(o.name)) });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Kundenurlaub konnte nicht angelegt werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const id = clean(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung." }, { status: 400 });

    const von = nullableDatum(body.von);
    const bis = nullableDatum(body.bis) || von;
    if (von && bis && bis < von) return NextResponse.json({ ok: false, error: "Das Ende liegt vor dem Anfang." }, { status: 400 });

    const ergebnis = await safeUpdateById(guard.auth.supabase, "site_closures", id, {
      von,
      bis,
      grund: nullableText(body.grund),
      faellt_aus: body.faellt_aus !== false,
      notiz: nullableText(body.notiz)
    });

    return NextResponse.json({ ok: true, eintrag: ergebnis.data });
  } catch (fehler) {
    if (fehlendeTabelle(fehler)) return NextResponse.json({ ok: false, error: FEHLT }, { status: 409 });
    const text = fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const id = clean(new URL(request.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ ok: false, error: "Es fehlt die Kennung." }, { status: 400 });

    const ergebnis = await guard.auth.supabase.from("site_closures").delete().eq("id", id);
    if (ergebnis.error) throw new Error(ergebnis.error.message);
    return NextResponse.json({ ok: true });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
