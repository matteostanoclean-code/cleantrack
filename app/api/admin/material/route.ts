import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

/**
 * Materialwesen: Artikelstamm und Bestellungen.
 *
 * Eine Bestellung besteht aus mehreren Zeilen in material_reports, eine je
 * Artikel. Zusammengehalten werden sie über order_group. Vorher wurden sie
 * über Zeitpunkt und Objekt wieder zusammengesucht — das hält, solange
 * niemand zweimal in derselben Minute bestellt.
 *
 * Das Objekt hängt an jeder Zeile. Kommt die Bestellung über einen
 * NFC-Aufkleber, steht das Objekt schon fest, bevor jemand tippt.
 */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const text = clean(value);
  return text ? text : null;
}

function nullableZahl(value: unknown) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const zahl = Number(text);
  return Number.isFinite(zahl) ? zahl : null;
}

function uuidOrNull(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

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

    const [artikel, zeilen, objekte, personen] = await Promise.all([
      supabase.from("material_products").select("*").order("article_number", { ascending: false }).limit(500),
      supabase.from("material_reports").select("*").order("created_at", { ascending: false }).limit(2000),
      supabase.from("work_sites").select("id, name, address, customer_name").order("name", { ascending: true }).limit(500),
      supabase.from("employee_profiles").select("id, name, active").order("name", { ascending: true })
    ]);

    if (artikel.error) throw new Error(artikel.error.message);

    return NextResponse.json({
      ok: true,
      articles: artikel.data || [],
      lines: zeilen.data || [],
      sites: objekte.data || [],
      employees: ((personen.data || []) as AnyRow[]).filter((row) => clean(row.name) && row.active !== false),
      eigenerName: guard.auth.profile.name
    });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Materialdaten konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Artikel anlegen oder eine Bestellung aufgeben. */
export async function POST(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const art = clean(body.was);

    if (art === "artikel") {
      const name = clean(body.name);
      if (!name) return NextResponse.json({ ok: false, error: "Bitte einen Namen eintragen." }, { status: 400 });

      // Nächste Hausnummer.
      const letzte = await supabase.from("material_products").select("article_number").order("article_number", { ascending: false }).limit(1);
      const nummer = nullableZahl(body.article_number) ?? Number(letzte.data?.[0]?.article_number || 0) + 1;

      const objektId = uuidOrNull(body.work_site_id);
      const objekt = objektId ? await supabase.from("work_sites").select("name").eq("id", objektId).maybeSingle() : null;

      const ergebnis = await safeInsert(supabase, "material_products", {
        name,
        article_number: nummer,
        external_number: nullableText(body.external_number),
        unit: nullableText(body.unit),
        supplier: nullableText(body.supplier),
        category: nullableText(body.category),
        current_stock: nullableZahl(body.current_stock) ?? 0,
        min_stock: nullableZahl(body.min_stock) ?? 0,
        minimum_stock: nullableZahl(body.min_stock) ?? 0,
        description: nullableText(body.description),
        notes: nullableText(body.description),
        image_url: nullableText(body.image_url),
        work_site_id: objektId,
        object_name: objekt?.data?.name || null,
        purchase_price: nullableZahl(body.purchase_price),
        sale_price: body.billable === true ? nullableZahl(body.sale_price) : null,
        billable: body.billable === true,
        active: true
      });

      return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
    }

    if (art === "bestellung") {
      const objektId = uuidOrNull(body.work_site_id);
      if (!objektId) return NextResponse.json({ ok: false, error: "Bitte ein Objekt wählen." }, { status: 400 });

      const posten = (Array.isArray(body.items) ? body.items : [])
        .map((zeile: AnyRow) => ({
          id: uuidOrNull(zeile.id),
          name: clean(zeile.name),
          menge: Math.max(1, Math.round(Number(zeile.menge) || 1))
        }))
        .filter((zeile: AnyRow) => zeile.id || zeile.name);

      if (!posten.length) return NextResponse.json({ ok: false, error: "Bitte mindestens einen Artikel hinzufügen." }, { status: 400 });

      const objekt = await supabase.from("work_sites").select("id, name").eq("id", objektId).maybeSingle();
      const objektName = clean(objekt.data?.name) || "Ohne Objekt";

      // Nächste Bestellnummer.
      const letzte = await supabase.from("material_reports").select("order_number").order("order_number", { ascending: false }).limit(1);
      const nummer = Number(letzte.data?.[0]?.order_number || 0) + 1;

      const gruppe = crypto.randomUUID();
      const jetzt = new Date().toISOString();
      const kommentar = nullableText(body.comment);
      const person = nullableText(body.employee_name) || guard.auth.profile.name;

      const stamm = posten.filter((p: AnyRow) => p.id).length
        ? await supabase.from("material_products").select("*").in("id", posten.filter((p: AnyRow) => p.id).map((p: AnyRow) => p.id))
        : { data: [] as AnyRow[] };

      const zusammenfassung = posten.map((p: AnyRow) => {
        const artikel = (stamm.data || []).find((row: AnyRow) => row.id === p.id);
        return `${p.menge} x ${p.name || clean(artikel?.name) || "Material"}`;
      }).join(", ");

      const angelegt: AnyRow[] = [];
      for (const p of posten) {
        const artikel = (stamm.data || []).find((row: AnyRow) => row.id === p.id) || null;
        const ergebnis = await safeInsert(supabase, "material_reports", {
          order_group: gruppe,
          order_number: nummer,
          employee_name: person,
          material_id: p.id,
          material_product_id: p.id,
          material_name: p.name || clean(artikel?.name) || "Material",
          product_name: p.name || clean(artikel?.name) || "Material",
          // Preise werden abgeschrieben, nicht verwiesen. Steigt der Einkauf
          // im Dezember, darf die Novemberbestellung sich nicht ruecklaeufig
          // aendern.
          unit_price: nullableZahl(artikel?.purchase_price),
          sale_unit_price: artikel?.billable === true ? nullableZahl(artikel?.sale_price) : null,
          billable: artikel?.billable === true,
          supplier: clean(artikel?.supplier) || null,
          work_site_id: objektId,
          object_name: objektName,
          site: objektName,
          quantity: p.menge,
          quantity_requested: p.menge,
          message: `Bestellung ${nummer} für ${objektName}: ${zusammenfassung}`,
          comment: kommentar,
          notes: kommentar,
          status: "open",
          source: clean(body.source) || "buero",
          created_at: jetzt
        });
        angelegt.push(ergebnis.data);
      }

      await supabase.from("admin_notifications").insert({
        title: "Materialbestellung angelegt",
        message: `Bestellung ${nummer} für ${objektName}: ${zusammenfassung}`,
        employee_name: person,
        work_site_id: objektId,
        object_name: objektName,
        notification_type: "material_report",
        status: "open",
        created_at: jetzt
      });

      return NextResponse.json({ ok: true, order_number: nummer, order_group: gruppe, items: angelegt });
    }

    return NextResponse.json({ ok: false, error: "Unbekannter Vorgang." }, { status: 400 });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Vorgang konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}

/** Artikel ändern oder den Zustand einer ganzen Bestellung setzen. */
export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const supabase = guard.auth.supabase;

    const body = await request.json();
    const art = clean(body.was);

    if (art === "artikel") {
      const id = clean(body.id);
      if (!id) return NextResponse.json({ ok: false, error: "Artikel-ID fehlt." }, { status: 400 });

      const objektId = uuidOrNull(body.work_site_id);
      const objekt = objektId ? await supabase.from("work_sites").select("name").eq("id", objektId).maybeSingle() : null;

      const ergebnis = await safeUpdateById(supabase, "material_products", id, {
        name: clean(body.name) || undefined,
        article_number: nullableZahl(body.article_number),
        external_number: nullableText(body.external_number),
        unit: nullableText(body.unit),
        supplier: nullableText(body.supplier),
        category: nullableText(body.category),
        current_stock: nullableZahl(body.current_stock) ?? 0,
        min_stock: nullableZahl(body.min_stock) ?? 0,
        minimum_stock: nullableZahl(body.min_stock) ?? 0,
        description: nullableText(body.description),
        notes: nullableText(body.description),
        image_url: nullableText(body.image_url),
        work_site_id: objektId,
        object_name: objekt?.data?.name || null,
        purchase_price: nullableZahl(body.purchase_price),
        sale_price: body.billable === true ? nullableZahl(body.sale_price) : null,
        billable: body.billable === true
      });

      return NextResponse.json({ ok: true, item: ergebnis.data, uebersprungen: ergebnis.skipped });
    }

    if (art === "bestellung") {
      const gruppe = clean(body.order_group);
      if (!gruppe) return NextResponse.json({ ok: false, error: "Bestellung fehlt." }, { status: 400 });

      const zustand = clean(body.status).toLowerCase();
      if (!["open", "ordered", "done", "billed"].includes(zustand)) {
        return NextResponse.json({ ok: false, error: "Unbekannter Zustand." }, { status: 400 });
      }

      const jetzt = new Date().toISOString();
      const payload: AnyRow = { status: zustand === "done" || zustand === "billed" ? "done" : "open" };
      if (zustand === "ordered") payload.ordered_at = jetzt;
      if (zustand === "done") payload.delivered_at = jetzt;
      if (zustand === "billed") payload.billed_at = jetzt;

      // Erst mit allen Feldern, dann ohne die, die es vielleicht nicht gibt.
      let ergebnis = await supabase.from("material_reports").update(payload).eq("order_group", gruppe).select("id");
      if (ergebnis.error) {
        ergebnis = await supabase.from("material_reports").update({ status: payload.status }).eq("order_group", gruppe).select("id");
      }
      if (ergebnis.error) throw new Error(ergebnis.error.message);

      // Beim Liefern den Lagerbestand am Objekt hochschreiben, sonst bleibt er
      // für immer auf dem Stand von vor der Bestellung.
      if (zustand === "done") {
        const zeilen = await supabase.from("material_reports").select("material_product_id, material_id, quantity, quantity_requested").eq("order_group", gruppe);
        for (const zeile of (zeilen.data || []) as AnyRow[]) {
          const artikelId = uuidOrNull(zeile.material_product_id || zeile.material_id);
          if (!artikelId) continue;
          const menge = Math.max(0, Math.round(Number(zeile.quantity ?? zeile.quantity_requested) || 0));
          if (!menge) continue;
          const stand = await supabase.from("material_products").select("current_stock").eq("id", artikelId).maybeSingle();
          const neu = Math.max(0, Math.round(Number(stand.data?.current_stock || 0))) + menge;
          await supabase.from("material_products").update({ current_stock: neu }).eq("id", artikelId);
        }
      }

      return NextResponse.json({ ok: true, geaendert: ergebnis.data?.length || 0 });
    }

    return NextResponse.json({ ok: false, error: "Unbekannter Vorgang." }, { status: 400 });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Änderung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
