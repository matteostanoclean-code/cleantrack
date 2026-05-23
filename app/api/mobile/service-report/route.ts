import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const SIGNATURE_BUCKET = "service-signatures";
type AnyRow = Record<string, any>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableUuid(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

async function ensureSignatureBucket(supabase: AnyRow) {
  try {
    const { error } = await supabase.storage.createBucket(SIGNATURE_BUCKET, {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["image/png"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("service signature bucket warning:", error.message);
    }
  } catch (error) {
    console.warn("service signature bucket create failed:", error);
  }
}

function signatureBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function safePath(profileId: string, taskId: string | null) {
  return [
    profileId,
    new Date().toISOString().slice(0, 10),
    taskId || "ohne-einsatz",
    `${Date.now()}-${Math.random().toString(16).slice(2)}.png`
  ].join("/");
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const taskId = nullableUuid(body.taskId);
    const workSiteId = nullableUuid(body.workSiteId);
    const workSiteName = clean(body.workSiteName || body.siteName || body.objectName);
    const customerName = clean(body.customerName);
    const signerName = clean(body.signerName);
    const notes = clean(body.notes);
    const buffer = signatureBuffer(clean(body.signatureDataUrl));

    if (!taskId) {
      return NextResponse.json({ ok: false, error: "Bitte Einsatz auswählen." }, { status: 400 });
    }
    if (!buffer || buffer.length < 1000) {
      return NextResponse.json({ ok: false, error: "Bitte eine gültige Unterschrift erfassen." }, { status: 400 });
    }
    if (buffer.length > 2 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Unterschrift ist zu groß." }, { status: 400 });
    }

    const { data: task, error: taskError } = await auth.supabase
      .from("tasks")
      .select("id, title, site, employee_name, work_site_id, customer_name, task_date, start_time, end_time, status, done")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError) throw new Error(taskError.message);
    if (!task) return NextResponse.json({ ok: false, error: "Einsatz wurde nicht gefunden." }, { status: 404 });
    if (!auth.isAdmin && task.employee_name !== auth.profile.name) {
      return NextResponse.json({ ok: false, error: "Dieser Einsatz gehört nicht zu deinem Profil." }, { status: 403 });
    }

    await ensureSignatureBucket(auth.supabase);
    const path = safePath(auth.profile.id, taskId);
    const { error: uploadError } = await auth.supabase.storage
      .from(SIGNATURE_BUCKET)
      .upload(path, buffer, { contentType: "image/png", upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicData } = auth.supabase.storage.from(SIGNATURE_BUCKET).getPublicUrl(path);
    const signatureUrl = publicData?.publicUrl || null;
    const siteLabel = workSiteName || clean(task.site) || clean(task.customer_name) || "Ohne Objekt";
    const customerLabel = customerName || clean(task.customer_name) || siteLabel;

    const reportPayload = {
      task_id: taskId,
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      work_site_id: workSiteId || nullableUuid(task.work_site_id),
      work_site_name: siteLabel,
      customer_name: customerLabel,
      signer_name: signerName || null,
      signature_url: signatureUrl,
      notes: notes || null,
      status: "signed",
      created_at: new Date().toISOString()
    };

    const { data: report, error: reportError } = await auth.supabase
      .from("service_reports")
      .insert(reportPayload)
      .select("*")
      .single();
    if (reportError) throw new Error(reportError.message);

    await auth.supabase.from("admin_notifications").insert({
      title: "Leistungsnachweis unterschrieben",
      message: [
        `${auth.profile.name} hat einen Leistungsnachweis eingereicht.`,
        `Objekt: ${siteLabel}`,
        `Kunde: ${customerLabel}`,
        signerName ? `Unterschrieben von: ${signerName}` : "Unterschrieben: ja",
        notes ? `Notiz: ${notes}` : ""
      ].filter(Boolean).join("\n"),
      employee_name: auth.profile.name,
      work_site_name: siteLabel,
      object_name: siteLabel,
      site: siteLabel,
      read: false,
      status: "open",
      notification_type: "service_report",
      task_id: taskId,
      work_site_id: workSiteId || nullableUuid(task.work_site_id),
      created_at: new Date().toISOString()
    });

    await auth.supabase
      .from("tasks")
      .update({ done: true, status: "done" })
      .eq("id", taskId);

    return NextResponse.json({ ok: true, report, signatureUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Leistungsnachweis konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
