import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableUuid(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => clean(item)).filter(Boolean).slice(0, 100);
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as AnyRow;
    const taskId = nullableUuid(body.taskId);
    const workSiteId = nullableUuid(body.workSiteId);
    const checkedItems = normalizeList(body.checkedItems);
    const notes = clean(body.notes);
    const workSiteName = clean(body.workSiteName || body.siteName || body.objectName);

    if (!taskId && !workSiteId) {
      return NextResponse.json({ ok: false, error: "Bitte Einsatz oder Objekt auswählen." }, { status: 400 });
    }

    let task: AnyRow | null = null;
    if (taskId) {
      const { data, error } = await auth.supabase
        .from("tasks")
        .select("id, title, site, employee_name, work_site_id, status, done")
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      task = data;
      if (!task) return NextResponse.json({ ok: false, error: "Einsatz wurde nicht gefunden." }, { status: 404 });
      if (!auth.isAdmin && task.employee_name !== auth.profile.name) {
        return NextResponse.json({ ok: false, error: "Dieser Einsatz gehört nicht zu deinem Profil." }, { status: 403 });
      }
    }

    const siteLabel = workSiteName || clean(task?.site) || "Ohne Objekt";
    const reportPayload = {
      task_id: taskId,
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      work_site_id: workSiteId || nullableUuid(task?.work_site_id),
      work_site_name: siteLabel,
      checked_items: checkedItems,
      notes: notes || null,
      status: "submitted",
      created_at: new Date().toISOString()
    };

    let qualityReport: AnyRow | null = null;
    const reportResult = await auth.supabase
      .from("quality_reports")
      .insert(reportPayload)
      .select("*")
      .single();

    if (!reportResult.error) {
      qualityReport = reportResult.data;
    }

    const messageLines = [
      `${auth.profile.name} hat einen Qualitätsnachweis abgegeben${task?.title ? `: ${task.title}` : ""}.`,
      `Objekt: ${siteLabel}`,
      checkedItems.length ? `Erledigte Punkte: ${checkedItems.join(", ")}` : "Erledigte Punkte: keine Auswahl",
      notes ? `Notiz: ${notes}` : ""
    ].filter(Boolean);

    await auth.supabase.from("admin_notifications").insert({
      title: "Qualitätsnachweis eingereicht",
      message: messageLines.join("\n"),
      employee_name: auth.profile.name,
      work_site_name: siteLabel,
      object_name: siteLabel,
      site: siteLabel,
      read: false,
      status: "open",
      notification_type: "quality_report",
      task_id: taskId,
      work_site_id: workSiteId || nullableUuid(task?.work_site_id),
      created_at: new Date().toISOString()
    });

    if (taskId) {
      await auth.supabase
        .from("tasks")
        .update({ done: true, status: "done" })
        .eq("id", taskId);
    }

    return NextResponse.json({ ok: true, report: qualityReport, usedFallback: Boolean(reportResult.error) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
