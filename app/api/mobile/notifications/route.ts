import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const mode = clean(body.mode || "all").toLowerCase();
    const requestedEmployee = clean(body.employeeName);
    const employeeName = auth.isAdmin && requestedEmployee ? requestedEmployee : auth.profile.name;

    if (!employeeName) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter konnte nicht erkannt werden." }, { status: 400 });
    }

    if (mode !== "all") {
      return NextResponse.json({ ok: false, error: "Unbekannter Meldungs-Modus." }, { status: 400 });
    }

    const [notificationResult, chatResult] = await Promise.all([
      auth.supabase
        .from("admin_notifications")
        .update({ read: true })
        .eq("employee_name", employeeName),
      auth.supabase
        .from("chat_messages")
        .update({ read_by_employee: true })
        .eq("employee_name", employeeName)
        .eq("sender_role", "admin")
    ]);

    const firstError = notificationResult.error || chatResult.error;
    if (firstError) throw new Error(firstError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meldungen konnten nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
