import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

/** Nur bei fehlender Spalte lohnt ein zweiter Versuch mit weniger Feldern. */
function istSpaltenfehler(fehler: unknown) {
  const f = fehler as { code?: string; message?: string };
  const code = String(f?.code || "");
  const inhalt = String(f?.message || "").toLowerCase();
  return code === "PGRST204" || code === "42703" || inhalt.includes("column") || inhalt.includes("schema cache");
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Nur Admins dürfen als Büro antworten." }, { status: 403 });
    }

    const body = await request.json();
    const employeeName = text(body.employeeName || body.employee_name);
    const message = text(body.message || body.body || body.text);
    const sourceMessageId = text(body.sourceMessageId || body.source_message_id);

    if (!employeeName) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter fehlt." }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ ok: false, error: "Bitte eine Antwort schreiben." }, { status: 400 });
    }

    const payload = {
      employee_name: employeeName,
      sender_name: auth.profile.name,
      sender_role: "admin",
      message,
      body: message,
      text: message,
      read_by_admin: true,
      read_by_employee: false,
      status: "open",
      todo_status: "open",
      created_at: new Date().toISOString()
    };

    let insert = await auth.supabase.from("chat_messages").insert(payload).select("*").maybeSingle();

    // Zweiter Versuch nur bei fehlender Spalte, sonst entstehen Doppelungen.
    if (insert.error && istSpaltenfehler(insert.error)) {
      const fallbackPayload = {
        employee_name: employeeName,
        sender_name: auth.profile.name,
        sender_role: "admin",
        message,
        read_by_admin: true,
        read_by_employee: false,
        created_at: new Date().toISOString()
      };
      insert = await auth.supabase.from("chat_messages").insert(fallbackPayload).select("*").maybeSingle();
    }

    if (insert.error) throw new Error(insert.error.message);

    if (sourceMessageId) {
      await auth.supabase
        .from("chat_messages")
        .update({ read_by_admin: true, status: "resolved", todo_status: "done", resolved_at: new Date().toISOString() })
        .eq("id", sourceMessageId);
    }

    await auth.supabase.from("admin_notifications").insert({
      title: "Admin-Antwort gesendet",
      message: `${auth.profile.name} hat ${employeeName} geantwortet.`,
      employee_name: employeeName,
      notification_type: "chat_reply",
      status: "resolved",
      read: true,
      admin_response: message,
      resolved_at: new Date().toISOString()
    });

    // Push aufs Handy des Mitarbeiters. Ohne diesen Schritt kam eine Antwort
    // aus dem Büro erst beim nächsten Öffnen der App an.
    await pushAnMitarbeiter(
      auth.supabase,
      employeeName,
      "Nachricht vom Büro",
      message,
      "/mitarbeiter/chat"
    );

    return NextResponse.json({ ok: true, message: insert.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Antwort konnte nicht gesendet werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
