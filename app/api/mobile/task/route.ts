import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ ok: false, error: "Aufgaben-ID fehlt." }, { status: 400 });
    }

    const done = Boolean(body.done);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
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
