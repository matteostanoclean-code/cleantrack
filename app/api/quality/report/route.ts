import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  return { supabaseUrl, serviceRoleKey };
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return "";
  return authHeader.replace("Bearer ", "").trim();
}

function safeFileName(value: string) {
  return String(value || "foto.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

async function requireEmployee(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Sitzung ungültig. Bitte neu einloggen." }, { status: 401 }), supabaseAdmin: null, profile: null };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("employee_profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.active === false) {
    return { error: NextResponse.json({ error: "Mitarbeiterprofil ist nicht aktiv." }, { status: 403 }), supabaseAdmin: null, profile: null };
  }

  return { error: null, supabaseAdmin, profile };
}

async function uploadPhoto(supabaseAdmin: any, employeeName: string, taskId: string, photoBase64: string, photoName: string) {
  if (!photoBase64 || !photoBase64.startsWith("data:image/")) return "";

  const match = photoBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Fotoformat wird nicht unterstützt.");

  const contentType = match[1];
  const raw = match[2];
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const buffer = Buffer.from(raw, "base64");
  const bucket = "quality-photos";

  await supabaseAdmin.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  }).catch(() => null);

  const path = `${new Date().toISOString().slice(0, 10)}/${safeFileName(employeeName)}/${taskId || "ohne-einsatz"}-${Date.now()}-${safeFileName(photoName || `foto.${ext}`)}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  return data?.signedUrl || "";
}

export async function POST(request: Request) {
  try {
    const auth = await requireEmployee(request);
    if (auth.error) return auth.error;
    const supabaseAdmin = auth.supabaseAdmin;
    const profile = auth.profile;

    if (!supabaseAdmin || !profile) {
      return NextResponse.json({ error: "Mitarbeiter konnte nicht geladen werden." }, { status: 500 });
    }

    const body = await request.json();
    const taskId = String(body.task_id || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Einsatz fehlt." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ error: "Einsatz wurde nicht gefunden." }, { status: 404 });
    }

    if (task.employee_name && task.employee_name !== profile.name) {
      return NextResponse.json({ error: "Dieser Einsatz gehört einem anderen Mitarbeiter." }, { status: 403 });
    }

    const checkedItems = Array.isArray(body.checked_items) ? body.checked_items.map(String).filter(Boolean) : [];
    const configuredChecklist = Array.isArray(task.quality_checklist) ? task.quality_checklist.map(String).filter(Boolean) : [];
    const totalItems = Math.max(Number(body.total_items || configuredChecklist.length || checkedItems.length || 0), checkedItems.length);
    const photoBase64 = String(body.photo_base64 || "");
    const notes = String(body.notes || "").trim();

    if (configuredChecklist.length > 0 && checkedItems.length === 0) {
      return NextResponse.json({ error: "Bitte mindestens einen Checklistenpunkt abhaken." }, { status: 400 });
    }

    if (task.quality_photo_required && !photoBase64) {
      return NextResponse.json({ error: "Für diesen Einsatz ist ein Foto erforderlich." }, { status: 400 });
    }

    const photoUrl = await uploadPhoto(
      supabaseAdmin,
      profile.name || "mitarbeiter",
      task.id,
      photoBase64,
      String(body.photo_name || "foto.jpg")
    );

    const status = totalItems > 0 && checkedItems.length >= totalItems ? "complete" : "open";

    const payload = {
      employee_name: profile.name,
      task_id: task.id,
      task_date: task.task_date || new Date().toISOString().slice(0, 10),
      title: task.title || "Qualitätsnachweis",
      customer_name: task.customer_name || null,
      site: task.site || body.site || null,
      work_site_id: task.work_site_id || body.work_site_id || null,
      checked_items: checkedItems,
      total_items: totalItems,
      passed_items: checkedItems.length,
      notes: notes || null,
      photo_url: photoUrl || null,
      status,
    };

    const { error: insertError } = await supabaseAdmin.from("quality_reports").insert([payload]);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    await supabaseAdmin.from("admin_notifications").insert([{
      employee_name: profile.name,
      title: "Qualitätsnachweis eingereicht",
      message: `${profile.name} hat den Qualitätsnachweis für ${task.site || "einen Einsatz"} eingereicht.`,
      notification_type: "quality_report",
      status: "open",
      task_id: task.id,
      work_site_id: task.work_site_id || null,
      site: task.site || null,
    }]);

    return NextResponse.json({
      success: true,
      message: "Qualitätsnachweis wurde gespeichert.",
      photoUrl,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
