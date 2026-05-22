import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const requestedEmployee = clean(body.employeeName);
    const employeeName = auth.isAdmin && requestedEmployee ? requestedEmployee : auth.profile.name;
    const note = clean(body.note);
    const date = clean(body.date) || todayIso();
    const workedMinutes = Number(body.workedMinutes || 0);
    const plannedTasks = Number(body.plannedTasks || 0);
    const doneTasks = Number(body.doneTasks || 0);
    const openTasks = Number(body.openTasks || 0);
    const openTaskTitles = Array.isArray(body.openTaskTitles) ? body.openTaskTitles.map(clean).filter(Boolean).slice(0, 8) : [];

    if (!employeeName) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter konnte nicht erkannt werden." }, { status: 400 });
    }

    const hours = workedMinutes > 0 ? `${(workedMinutes / 60).toFixed(2)} Std.` : "0 Std.";
    const statusText = openTasks > 0 ? `${openTasks} Einsatz(e) offen` : "Alle Einsätze erledigt";
    const message = [
      `Tagesabschluss vom ${date}`,
      `Mitarbeiter: ${employeeName}`,
      `Arbeitszeit: ${hours}`,
      `Einsätze: ${doneTasks}/${plannedTasks} erledigt`,
      `Status: ${statusText}`,
      openTaskTitles.length ? `Offen: ${openTaskTitles.join(", ")}` : "",
      note ? `Notiz: ${note}` : ""
    ].filter(Boolean).join("\n");

    const { data, error } = await auth.supabase
      .from("admin_notifications")
      .insert({
        title: openTasks > 0 ? "Tagesabschluss mit offenen Einsätzen" : "Tagesabschluss erledigt",
        message,
        employee_name: employeeName,
        status: "open",
        read: false,
        notification_type: "day_close"
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, notification: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tagesabschluss konnte nicht gesendet werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
