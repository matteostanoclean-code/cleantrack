import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SupabaseAdmin = any;

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

async function requireEmployee(request: Request): Promise<{ error: NextResponse | null; supabaseAdmin: SupabaseAdmin | null; profile: any | null }> {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: "Nicht angemeldet. Sitzung fehlt." }, { status: 401 }), supabaseAdmin: null, profile: null };
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
    .select("id, name, role, active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: "Mitarbeiterprofil wurde nicht gefunden." }, { status: 403 }), supabaseAdmin: null, profile: null };
  }

  return { error: null, supabaseAdmin, profile };
}

export async function POST(request: Request) {
  try {
    const auth = await requireEmployee(request);
    if (auth.error) return auth.error;

    const supabaseAdmin = auth.supabaseAdmin!;
    const profile = auth.profile!;
    const body = await request.json();

    const taskId = String(body.task_id || "").trim();
    const done = body.done === true || body.done === "true";

    if (!taskId) {
      return NextResponse.json({ error: "Aufgaben-ID fehlt." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, employee_name, item_type, task_type")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ error: taskError?.message || "Aufgabe wurde nicht gefunden." }, { status: 404 });
    }

    const isActionTask = task.item_type === "task" || task.task_type === "task";
    const isOwner = String(task.employee_name || "").trim().toLowerCase() === String(profile.name || "").trim().toLowerCase();
    const isAdmin = profile.role === "admin";

    if (!isActionTask) {
      return NextResponse.json({ error: "Das ist ein Einsatz, keine separate Aufgabe." }, { status: 400 });
    }

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Diese Aufgabe ist mir nicht zugewiesen." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("tasks")
      .update({ done, status: done ? "done" : "open" })
      .eq("id", taskId)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, task: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Aufgabe konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }
}
