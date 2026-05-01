import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const employeeName = String(body.employeeName || "").trim();
    const title = String(body.title || "CleanTrack");
    const message = String(body.message || "Du hast eine neue Nachricht.");
    const url = String(body.url || "/mitarbeiter");

    if (!employeeName) {
      return NextResponse.json(
        { error: "Mitarbeitername fehlt." },
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

    if (
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    ) {
      return NextResponse.json(
        { error: "VAPID Umgebungsvariablen fehlen." },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: subscriptions, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("employee_name", employeeName);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: "Keine Push-Registrierung für diesen Mitarbeiter gefunden." },
        { status: 404 }
      );
    }

    const payload = JSON.stringify({
      title,
      body: message,
      url,
    });

    const results = await Promise.allSettled(
      subscriptions.map((item) =>
        webpush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: {
              p256dh: item.p256dh,
              auth: item.auth,
            },
          },
          payload
        )
      )
    );

    const failed = results.filter((result) => result.status === "rejected");

    return NextResponse.json({
      success: true,
      sent: subscriptions.length - failed.length,
      failed: failed.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Push konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}