import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const message = text(body.message || body.body || body.text);

    if (!message) {
      return NextResponse.json({ ok: false, error: "Bitte eine Nachricht schreiben." }, { status: 400 });
    }

    const fullPayload = {
      employee_name: auth.profile.name,
      sender_name: auth.profile.name,
      sender_role: auth.isAdmin ? "admin" : "employee",
      message,
      body: message,
      text: message,
      read_by_admin: auth.isAdmin ? true : false,
      read_by_employee: auth.isAdmin ? false : true,
      status: "open",
      todo_status: "open",
      created_at: new Date().toISOString()
    };

    let insert = await auth.supabase.from("chat_messages").insert(fullPayload).select("*").maybeSingle();

    if (insert.error) {
      const fallbackPayload = {
        employee_name: auth.profile.name,
        sender_name: auth.profile.name,
        sender_role: auth.isAdmin ? "admin" : "employee",
        message,
        read_by_admin: auth.isAdmin ? true : false,
        read_by_employee: auth.isAdmin ? false : true,
        created_at: new Date().toISOString()
      };
      insert = await auth.supabase.from("chat_messages").insert(fallbackPayload).select("*").maybeSingle();
    }

    if (insert.error) throw new Error(insert.error.message);

    if (!auth.isAdmin) {
      await auth.supabase.from("admin_notifications").insert({
        employee_name: auth.profile.name,
        title: "Neue Chat-Nachricht",
        message: `${auth.profile.name}: ${message}`,
        notification_type: "chat_message",
        status: "open"
      });
    }

    return NextResponse.json({ ok: true, message: insert.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nachricht konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
