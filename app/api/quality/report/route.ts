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
    const checkedItems = Array.isArray(body.checked_items) ? body.checked_items.map(String).filter(Boolean) : [];
    const totalItems = Math.max(Number(body.total_items || checkedItems.length || 0), checkedItems.length);
    const notes = String(body.notes || "").trim();
    const photoUrl = String(body.photo_url || "").trim();

    let task = null;
    if (taskId) {
      const { data } = await supabaseAdmin.from("tasks").select("*").eq("id", taskId).maybeSingle();
      task = data;
    }

    if (task?.employee_name && task.employee_name !== profile.name) {
      return NextResponse.json({ error: "Dieser Einsatz gehört einem anderen Mitarbeiter." }, { status: 403 });
    }

    const payload = {
      employee_name: profile.name,
      task_id: task?.id || null,
      task_date: task?.task_date || new Date().toISOString().slice(0, 10),
      title: task?.title || "Qualitätsnachweis",
      customer_name: task?.customer_name || null,
      site: task?.site || body.site || null,
      work_site_id: task?.work_site_id || body.work_site_id || null,
      checked_items: checkedItems,
      total_items: totalItems,
      passed_items: checkedItems.length,
      notes: notes || null,
      photo_url: photoUrl || null,
      status: checkedItems.length >= totalItems && totalItems > 0 ? "complete" : "open",
    };

    const { error } = await supabaseAdmin.from("quality_reports").insert([payload]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabaseAdmin.from("admin_notifications").insert([{
      employee_name: profile.name,
      title: "Qualitätsnachweis eingereicht",
      message: `${profile.name} hat einen Qualitätsnachweis für ${payload.site || "ein Objekt"} eingereicht.`,
      notification_type: "quality_report",
      status: "open",
      task_id: payload.task_id,
      work_site_id: payload.work_site_id,
      site: payload.site,
    }]);

    return NextResponse.json({ success: true, message: "Qualitätsnachweis wurde gespeichert." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
