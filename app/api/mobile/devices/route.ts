import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert, safeUpdateById } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

/**
 * Geräte und Inventar.
 *
 * Fehlt die Tabelle noch, antwortet die Schnittstelle mit einem verständlichen
 * Hinweis statt mit einem Datenbankfehler. Das Skript dafür liegt in
 * supabase/geraete_tabelle.sql.
 */

type AnyRow = Record<string, any>;

const SETUP_HINT = "Die Gerätetabelle fehlt noch. Bitte supabase/geraete_tabelle.sql einmal in Supabase ausführen.";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  const cleaned = text(value);
  return cleaned ? cleaned : null;
}

function uuidOrNull(value: unknown) {
  const cleaned = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned) ? cleaned : null;
}

function numberOrNull(value: unknown) {
  const number = Number(text(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function isMissingTable(message: string) {
  return /relation .*devices.* does not exist|Could not find the table|schema cache/i.test(message);
}

function devicePayload(body: AnyRow, siteName: string | null) {
  return {
    name: text(body.name),
    device_type: nullableText(body.deviceType || body.device_type),
    work_site_id: uuidOrNull(body.workSiteId || body.work_site_id),
    work_site_name: siteName,
    serial_number: nullableText(body.serialNumber || body.serial_number),
    inventory_number: nullableText(body.inventoryNumber || body.inventory_number),
    description: nullableText(body.description),
    purchase_date: nullableText(body.purchaseDate || body.purchase_date),
    last_service_date: nullableText(body.lastServiceDate || body.last_service_date),
    service_interval_months: numberOrNull(body.serviceIntervalMonths || body.service_interval_months),
    status: nullableText(body.status) || "aktiv",
    notes: nullableText(body.notes)
  };
}

async function siteNameFor(supabase: AnyRow, workSiteId: string | null, fallback: unknown) {
  if (!workSiteId) return nullableText(fallback);
  const result = await supabase.from("work_sites").select("name, site_name, object_name, customer_name").eq("id", workSiteId).maybeSingle();
  if (result.error || !result.data) return nullableText(fallback);
  const site = result.data as AnyRow;
  return nullableText(site.name || site.site_name || site.object_name || site.customer_name) || nullableText(fallback);
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const workSiteId = uuidOrNull(searchParams.get("workSiteId"));
    const deviceId = uuidOrNull(searchParams.get("id"));

    let query = auth.supabase.from("devices").select("*").order("name", { ascending: true }).limit(500);
    if (deviceId) query = auth.supabase.from("devices").select("*").eq("id", deviceId).limit(1);
    else if (workSiteId) query = query.eq("work_site_id", workSiteId);

    const result = await query;
    if (result.error) {
      if (isMissingTable(result.error.message)) {
        return NextResponse.json({ ok: true, devices: [], setupRequired: true, hint: SETUP_HINT });
      }
      throw new Error(result.error.message);
    }

    return NextResponse.json({ ok: true, devices: result.data || [], setupRequired: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geräte konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur Admins dürfen Geräte anlegen." }, { status: 403 });

    const body = (await request.json()) as AnyRow;
    if (!text(body.name)) return NextResponse.json({ ok: false, error: "Bitte eine Bezeichnung eintragen." }, { status: 400 });

    const workSiteId = uuidOrNull(body.workSiteId || body.work_site_id);
    const siteName = await siteNameFor(auth.supabase, workSiteId, body.workSiteName || body.work_site_name);

    try {
      const saved = await safeInsert(auth.supabase, "devices", devicePayload(body, siteName));
      return NextResponse.json({ ok: true, device: saved.data });
    } catch (insertError) {
      const message = insertError instanceof Error ? insertError.message : "";
      if (isMissingTable(message)) return NextResponse.json({ ok: false, error: SETUP_HINT, setupRequired: true }, { status: 409 });
      throw insertError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gerät konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json()) as AnyRow;
    const id = uuidOrNull(body.id);
    if (!id) return NextResponse.json({ ok: false, error: "Gerät fehlt." }, { status: 400 });

    // Mitarbeiter dürfen melden und Wartung eintragen, alles Weitere nur Admins.
    const reportOnly = !auth.isAdmin;
    const now = new Date().toISOString();
    let payload: AnyRow;

    if (reportOnly) {
      const action = text(body.action);
      if (action === "defekt") {
        payload = { status: "defekt", notes: nullableText(body.notes), updated_at: now };
      } else if (action === "wartung") {
        payload = { last_service_date: nullableText(body.lastServiceDate) || now.slice(0, 10), updated_at: now };
      } else {
        return NextResponse.json({ ok: false, error: "Als Mitarbeiter kannst du nur Defekt oder Wartung melden." }, { status: 403 });
      }
    } else {
      const workSiteId = uuidOrNull(body.workSiteId || body.work_site_id);
      const siteName = await siteNameFor(auth.supabase, workSiteId, body.workSiteName || body.work_site_name);
      payload = { ...devicePayload(body, siteName), updated_at: now };
      if (!payload.name) delete payload.name;
    }

    try {
      const saved = await safeUpdateById(auth.supabase, "devices", id, payload);
      if (reportOnly && text(body.action) === "defekt") {
        await auth.supabase.from("admin_notifications").insert({
          title: "Gerät als defekt gemeldet",
          message: `${auth.profile.name} hat ein Gerät als defekt gemeldet.${text(body.notes) ? ` ${text(body.notes)}` : ""}`,
          employee_name: auth.profile.name,
          notification_type: "device_defect",
          status: "open",
          read: false,
          created_at: now
        });
      }
      return NextResponse.json({ ok: true, device: saved.data });
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "";
      if (isMissingTable(message)) return NextResponse.json({ ok: false, error: SETUP_HINT, setupRequired: true }, { status: 409 });
      throw updateError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gerät konnte nicht geändert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
