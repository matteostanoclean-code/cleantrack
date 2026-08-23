import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
};

type PushRow = {
  id: string;
  employee_profile_id: string | null;
  employee_name: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushBody = {
  target?: "employee" | "all";
  employeeProfileId?: string;
  employeeName?: string;
  title?: string;
  message?: string;
  url?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:kontakt@matteostano-clean.de";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID-Schlüssel fehlen in Vercel. Bitte NEXT_PUBLIC_VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY setzen.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return auth;
  if (!auth.isAdmin) {
    return { ok: false as const, status: 403, error: "Nur Admins dürfen Push-Nachrichten senden." };
  }
  return auth;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { data: employees, error: employeeError } = await auth.supabase
      .from("employee_profiles")
      .select("id, name, email, role, active")
      .eq("active", true)
      .order("name", { ascending: true });

    if (employeeError) throw new Error(employeeError.message);

    const { data: subscriptions, error: subscriptionError } = await auth.supabase
      .from("push_subscriptions")
      // Nur Spalten, die es in der Tabelle wirklich gibt. employee_profile_id
      // und active fehlen dort — die Abfrage lief deshalb in einen Fehler und
      // die Push-Zentrale zeigte null angemeldete Geräte.
      .select("id, employee_name");

    if (subscriptionError) throw new Error(subscriptionError.message);

    const subscriptionRows = (subscriptions || []) as Array<{ employee_profile_id?: string | null; employee_name: string | null }>;
    const employeesWithCounts = ((employees || []) as EmployeeRow[]).map((employee) => {
      const employeeName = clean(employee.name);
      const pushCount = subscriptionRows.filter((subscription) =>
        (subscription.employee_profile_id && subscription.employee_profile_id === employee.id) ||
        (employeeName && clean(subscription.employee_name) === employeeName)
      ).length;
      return { ...employee, push_count: pushCount };
    });

    const { data: recent, error: recentError } = await auth.supabase
      .from("admin_notifications")
      .select("id, title, message, employee_name, notification_type, created_at, status, read")
      .eq("notification_type", "admin_push")
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentError) throw new Error(recentError.message);

    return NextResponse.json({ ok: true, employees: employeesWithCounts, recent: recent || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push-Zentrale konnte nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    configureWebPush();

    const body = (await request.json()) as PushBody;
    const target = body.target === "all" ? "all" : "employee";
    const title = clean(body.title) || "Meldung vom Büro";
    const message = clean(body.message);
    const url = clean(body.url) || "/mitarbeiter/notifications";
    const employeeProfileId = clean(body.employeeProfileId);
    const employeeName = clean(body.employeeName);

    if (!message) {
      return NextResponse.json({ ok: false, error: "Bitte eine Nachricht eintragen." }, { status: 400 });
    }

    let employeeQuery = auth.supabase
      .from("employee_profiles")
      .select("id, name, email, role, active")
      .eq("active", true);

    if (target === "employee") {
      if (employeeProfileId) employeeQuery = employeeQuery.eq("id", employeeProfileId);
      else if (employeeName) employeeQuery = employeeQuery.eq("name", employeeName);
      else return NextResponse.json({ ok: false, error: "Bitte einen Mitarbeiter auswählen." }, { status: 400 });
    }

    const { data: employees, error: employeeError } = await employeeQuery.order("name", { ascending: true });
    if (employeeError) throw new Error(employeeError.message);

    const targetEmployees = ((employees || []) as EmployeeRow[]).filter((employee) => clean(employee.name));
    if (!targetEmployees.length) {
      return NextResponse.json({ ok: false, error: "Kein aktiver Mitarbeiter gefunden." }, { status: 404 });
    }

    const employeeIds = new Set(targetEmployees.map((employee) => employee.id));
    const employeeNames = new Set(targetEmployees.map((employee) => clean(employee.name)));

    const notifications = targetEmployees.map((employee) => ({
      title,
      message,
      employee_name: clean(employee.name),
      notification_type: "admin_push",
      status: "open",
      read: false,
      created_at: new Date().toISOString()
    }));

    const { error: notificationError } = await auth.supabase
      .from("admin_notifications")
      .insert(notifications);

    if (notificationError) throw new Error(notificationError.message);

    const { data: subscriptions, error: subscriptionError } = await auth.supabase
      .from("push_subscriptions")
      .select("id, employee_name, endpoint, p256dh, auth");

    if (subscriptionError) throw new Error(subscriptionError.message);

    const pushRows = ((subscriptions || []) as PushRow[]).filter((subscription) =>
      (subscription.employee_profile_id && employeeIds.has(subscription.employee_profile_id)) ||
      (clean(subscription.employee_name) && employeeNames.has(clean(subscription.employee_name)))
    );

    const employeesWithDevice = new Set(pushRows.map((subscription) => clean(subscription.employee_name)).filter(Boolean));
    const employeesWithoutDevice = targetEmployees.filter((employee) => !employeesWithDevice.has(clean(employee.name))).length;

    let sent = 0;
    let failed = 0;
    const payload = JSON.stringify({ title, body: message, url });

    for (const subscription of pushRows) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload
        );
        sent += 1;
      } catch (pushError: any) {
        failed += 1;
        const statusCode = pushError?.statusCode || pushError?.status;
        if (statusCode === 404 || statusCode === 410) {
          await auth.supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      target,
      employeeCount: targetEmployees.length,
      notificationCount: notifications.length,
      deviceCount: pushRows.length,
      employeesWithoutDevice,
      sent,
      failed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push-Nachricht konnte nicht gesendet werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
