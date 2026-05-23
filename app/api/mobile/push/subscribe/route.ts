import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as PushSubscriptionBody;
    const subscription = body.subscription;
    const endpoint = clean(subscription?.endpoint);
    const p256dh = clean(subscription?.keys?.p256dh);
    const authKey = clean(subscription?.keys?.auth);

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ ok: false, error: "Push-Subscription ist unvollständig." }, { status: 400 });
    }

    const payload = {
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      endpoint,
      p256dh,
      auth: authKey,
      subscription_json: subscription,
      user_agent: request.headers.get("user-agent") || null,
      active: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await auth.supabase
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" })
      .select("id, employee_name, active, updated_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, subscription: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
