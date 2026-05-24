import { NextResponse } from "next/server";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string | null;
  site: string | null;
  customer_name: string | null;
  employee_name: string | null;
  task_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  done: boolean | null;
};

type PushRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  employee_name: string | null;
};

type ReminderType = "60min" | "15min";

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

function berlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string | null) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesUntilTask(task: TaskRow, today: string, nowMinutes: number) {
  const taskDate = clean(task.task_date);
  const start = timeToMinutes(task.start_time);
  if (!taskDate || start === null) return null;
  if (taskDate === today) return start - nowMinutes;
  if (taskDate === addDays(today, 1)) return start + 1440 - nowMinutes;
  return null;
}

function reminderWindow(diffMinutes: number): ReminderType | null {
  if (diffMinutes > 45 && diffMinutes <= 75) return "60min";
  if (diffMinutes >= 0 && diffMinutes <= 20) return "15min";
  return null;
}

function reminderText(type: ReminderType, task: TaskRow) {
  const title = clean(task.title) || "Einsatz";
  const site = clean(task.site || task.customer_name) || "Objekt";
  const time = clean(task.start_time) || "gleich";
  if (type === "60min") return `In ca. 60 Minuten: ${title} bei ${site} um ${time} Uhr.`;
  return `Gleich geht es los: ${title} bei ${site} um ${time} Uhr.`;
}

function shouldRun(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function sendReminderPushes(request: Request) {
  if (!shouldRun(request)) {
    return NextResponse.json({ ok: false, error: "Cron nicht autorisiert." }, { status: 401 });
  }

  configureWebPush();
  const supabase = getSupabaseAdmin();
  const now = berlinParts();
  const tomorrow = addDays(now.date, 1);

  const { data: tasks, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, site, customer_name, employee_name, task_date, start_time, end_time, status, done")
    .gte("task_date", now.date)
    .lte("task_date", tomorrow)
    .neq("done", true)
    .in("status", ["open", "planned", "pending", "active", "in_progress"])
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(300);

  if (taskError) throw new Error(taskError.message);

  const candidateTasks = ((tasks || []) as TaskRow[])
    .map((task) => ({ task, diff: minutesUntilTask(task, now.date, now.minutes) }))
    .filter((item): item is { task: TaskRow; diff: number } => typeof item.diff === "number")
    .map((item) => ({ ...item, reminderType: reminderWindow(item.diff) }))
    .filter((item): item is { task: TaskRow; diff: number; reminderType: ReminderType } => Boolean(item.reminderType && item.task.employee_name));

  let checked = candidateTasks.length;
  let alreadySent = 0;
  let sent = 0;
  let failed = 0;
  let noDevice = 0;

  for (const item of candidateTasks) {
    const task = item.task;
    const reminderType = item.reminderType;
    const employeeName = clean(task.employee_name);

    const { data: existing, error: existingError } = await supabase
      .from("task_push_reminders")
      .select("id")
      .eq("task_id", task.id)
      .eq("reminder_type", reminderType)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);
    if (existing?.id) {
      alreadySent += 1;
      continue;
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, employee_name")
      .eq("employee_name", employeeName)
      .eq("active", true);

    if (subscriptionError) throw new Error(subscriptionError.message);
    const pushRows = (subscriptions || []) as PushRow[];
    if (!pushRows.length) {
      noDevice += 1;
      continue;
    }

    const payload = JSON.stringify({
      title: reminderType === "60min" ? "Einsatz-Erinnerung" : "Einsatz startet bald",
      body: reminderText(reminderType, task),
      url: `/mitarbeiter/schedule?task=${task.id}`
    });

    let taskSent = 0;
    let taskFailed = 0;
    for (const subscription of pushRows) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload
        );
        sent += 1;
        taskSent += 1;
      } catch (pushError: any) {
        failed += 1;
        taskFailed += 1;
        const statusCode = pushError?.statusCode || pushError?.status;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", subscription.id);
        }
      }
    }

    if (taskSent > 0) {
      const { error: insertError } = await supabase.from("task_push_reminders").insert({
        task_id: task.id,
        employee_name: employeeName,
        reminder_type: reminderType,
        task_date: task.task_date,
        task_start_time: task.start_time,
        push_count: taskSent,
        failed_count: taskFailed,
        sent_at: new Date().toISOString()
      });
      if (insertError && !String(insertError.message || "").includes("duplicate")) throw new Error(insertError.message);
    }
  }

  return NextResponse.json({ ok: true, today: now.date, checked, sent, failed, alreadySent, noDevice });
}

export async function GET(request: Request) {
  try {
    return await sendReminderPushes(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Einsatz-Erinnerungen konnten nicht gesendet werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
