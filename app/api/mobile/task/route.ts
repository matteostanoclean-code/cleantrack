import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Aufgaben-ID fehlt." }, { status: 400 });
    }

    const { data: existingTask, error: readError } = await auth.supabase
      .from("tasks")
      .select("id, employee_name")
      .eq("id", id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existingTask) {
      return NextResponse.json({ ok: false, error: "Aufgabe wurde nicht gefunden." }, { status: 404 });
    }

    if (!auth.isAdmin && existingTask.employee_name !== auth.profile.name) {
      return NextResponse.json({ ok: false, error: "Diese Aufgabe gehört nicht zu deinem Profil." }, { status: 403 });
    }

    const done = Boolean(body.done);
    const { data, error } = await auth.supabase
      .from("tasks")
      .update({ done })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, task: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aufgabe konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
