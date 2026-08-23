import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Chatverläufe für den Adminbereich.
 *
 * GET  liefert alle Mitarbeiter mit ihrem Verlauf, nicht nur offene Meldungen.
 *      Ohne diesen Endpunkt sah man im Adminbereich ausschließlich unbeantwortete
 *      Nachrichten der Mitarbeiter — eigene Antworten fehlten, der Verlauf war
 *      nicht nachvollziehbar.
 * POST markiert einen Verlauf als gelesen.
 */

type Row = Record<string, any>;

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

async function requireAdmin(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getEnv();
  const token = getBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 }), supabase: null, profil: null };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ ok: false, error: "Sitzung ungültig." }, { status: 401 }), supabase: null, profil: null };
  }

  const { data: profil } = await supabase
    .from("employee_profiles")
    .select("id, name, role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  const rolle = String(profil?.role || "").trim().toLowerCase();
  const erlaubt = rolle === "admin" || rolle === "objektleiter" || rolle === "object_lead" || rolle === "objectleader";
  if (!erlaubt) {
    return { error: NextResponse.json({ ok: false, error: "Nur für Administratoren." }, { status: 403 }), supabase: null, profil: null };
  }

  return { error: null, supabase, profil };
}

function inhalt(row: Row) {
  return row.message || row.body || row.text || "";
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const supabase = auth.supabase!;

    // Leichtgewichtige Abfrage nur für den Zähler in der Seitenleiste.
    if (new URL(request.url).searchParams.get("zaehler")) {
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .neq("sender_role", "admin")
        .or("read_by_admin.is.null,read_by_admin.eq.false");
      return NextResponse.json({ ok: true, ungelesen: count || 0 });
    }

    const { data: nachrichten, error } = await supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("employee_profiles")
      .select("name, active, role")
      .neq("active", false)
      .order("name", { ascending: true });

    // Verläufe je Mitarbeiter bilden. Auch Mitarbeiter ohne Nachricht
    // erscheinen, damit man von hier aus jemanden anschreiben kann.
    const verlaeufe = new Map<string, { name: string; nachrichten: Row[]; ungelesen: number; zuletzt: string | null }>();

    for (const p of profile || []) {
      const name = String(p?.name || "").trim();
      if (!name) continue;
      verlaeufe.set(name, { name, nachrichten: [], ungelesen: 0, zuletzt: null });
    }

    for (const row of nachrichten || []) {
      const name = String(row.employee_name || "").trim();
      if (!name) continue;
      if (!verlaeufe.has(name)) verlaeufe.set(name, { name, nachrichten: [], ungelesen: 0, zuletzt: null });
      const verlauf = verlaeufe.get(name)!;
      verlauf.nachrichten.push({
        id: row.id,
        von: String(row.sender_role || "") === "admin" ? "buero" : "mitarbeiter",
        absender: row.sender_name || name,
        text: inhalt(row),
        zeit: row.created_at || null,
      });
      verlauf.zuletzt = row.created_at || verlauf.zuletzt;
      if (String(row.sender_role || "") !== "admin" && row.read_by_admin === false) {
        verlauf.ungelesen += 1;
      }
    }

    const liste = [...verlaeufe.values()].sort((a, b) => {
      if (a.ungelesen !== b.ungelesen) return b.ungelesen - a.ungelesen;
      return String(b.zuletzt || "").localeCompare(String(a.zuletzt || ""));
    });

    return NextResponse.json({ ok: true, verlaeufe: liste });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Chat konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const supabase = auth.supabase!;

    const body = await request.json();
    const mitarbeiter = String(body.employeeName || "").trim();
    if (!mitarbeiter) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter fehlt." }, { status: 400 });
    }

    const { error } = await supabase
      .from("chat_messages")
      .update({ read_by_admin: true })
      .eq("employee_name", mitarbeiter)
      .neq("sender_role", "admin");

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Konnte nicht als gelesen markiert werden." },
      { status: 500 }
    );
  }
}
