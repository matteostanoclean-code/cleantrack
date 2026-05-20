import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function validDate(value: unknown) {
  const date = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const absenceType = text(body.absenceType || body.absence_type || body.request_type) || "Urlaub";
    const startDate = validDate(body.startDate || body.start_date);
    const endDate = validDate(body.endDate || body.end_date);
    const reason = text(body.reason) || null;

    if (!startDate || !endDate) {
      return NextResponse.json({ ok: false, error: "Bitte Start- und Enddatum eintragen." }, { status: 400 });
    }

    if (new Date(`${endDate}T12:00:00`) < new Date(`${startDate}T12:00:00`)) {
      return NextResponse.json({ ok: false, error: "Das Enddatum darf nicht vor dem Startdatum liegen." }, { status: 400 });
    }

    const payload = {
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      request_type: absenceType,
      absence_type: absenceType,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: "open"
    };

    let insert = await auth.supabase.from("absence_requests").insert(payload).select("*").maybeSingle();

    if (insert.error) {
      const fallbackPayload = {
        employee_name: auth.profile.name,
        absence_type: absenceType,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "open"
      };
      insert = await auth.supabase.from("absence_requests").insert(fallbackPayload).select("*").maybeSingle();
    }

    if (insert.error) throw new Error(insert.error.message);

    const adminMessage = `${auth.profile.name} hat ${absenceType} vom ${startDate} bis ${endDate} eingereicht.`;
    await auth.supabase.from("admin_notifications").insert({
      employee_name: auth.profile.name,
      title: "Abwesenheitsantrag",
      message: adminMessage,
      notification_type: "absence_request",
      status: "open",
      absence_request_id: insert.data?.id || null
    });

    return NextResponse.json({ ok: true, absence: insert.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abwesenheit konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
