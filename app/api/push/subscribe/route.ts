import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const employeeName = String(body.employeeName || "").trim();
    const subscription = body.subscription;

    if (!employeeName) {
      return NextResponse.json(
        { error: "Mitarbeitername fehlt." },
        { status: 400 }
      );
    }

    if (!subscription?.endpoint) {
      return NextResponse.json(
        { error: "Push-Subscription fehlt." },
        { status: 400 }
      );
    }

    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!p256dh || !auth) {
      return NextResponse.json(
        { error: "Push-Schlüssel fehlen." },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL fehlt." },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        employee_name: employeeName,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
      },
      {
        onConflict: "endpoint",
      }
    );

    if (error) {
      return NextResponse.json(
        { error: error.message || "Push konnte nicht gespeichert werden." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Push wurde aktiviert.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serverfehler beim Speichern der Push-Erlaubnis.",
      },
      { status: 500 }
    );
  }
}