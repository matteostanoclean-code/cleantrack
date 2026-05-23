import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:kontakt@matteostano-clean.de";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID-Schlüssel fehlen in Vercel. Bitte NEXT_PUBLIC_VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY setzen.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    configureWebPush();

    const { data, error } = await auth.supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("employee_profile_id", auth.profile.id)
      .eq("active", true);

    if (error) throw new Error(error.message);
    const subscriptions = (data || []) as PushRow[];
    if (!subscriptions.length) {
      return NextResponse.json({ ok: false, error: "Für dieses Gerät ist noch keine Push-Subscription gespeichert." }, { status: 404 });
    }

    let sent = 0;
    let failed = 0;
    for (const item of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } },
          JSON.stringify({
            title: "CleanTrack Pro",
            body: "Testmeldung erfolgreich. Push ist aktiv.",
            url: "/mitarbeiter/notifications"
          })
        );
        sent += 1;
      } catch (pushError: any) {
        failed += 1;
        const statusCode = pushError?.statusCode || pushError?.status;
        if (statusCode === 404 || statusCode === 410) {
          await auth.supabase.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", item.id);
        }
      }
    }

    return NextResponse.json({ ok: true, sent, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push-Test konnte nicht gesendet werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
