import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  active: boolean | null;
  birthday: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function shouldRun(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

function berlinToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function matchesBirthday(birthday: string | null, todayIso: string) {
  const birthdayText = clean(birthday).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayText)) return false;
  return birthdayText.slice(5) === todayIso.slice(5);
}

async function notificationExists(supabase: any, employeeName: string, type: string, dayStartIso: string, dayEndIso: string) {
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id")
    .eq("employee_name", employeeName)
    .eq("notification_type", type)
    .gte("created_at", dayStartIso)
    .lt("created_at", dayEndIso)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function GET(request: Request) {
  try {
    if (!shouldRun(request)) {
      return NextResponse.json({ ok: false, error: "Cron nicht autorisiert." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const today = berlinToday();
    const todayDate = new Date(`${today}T00:00:00.000+01:00`);
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const dayStartIso = todayDate.toISOString();
    const dayEndIso = tomorrowDate.toISOString();

    const { data: employees, error } = await supabase
      .from("employee_profiles")
      .select("id, name, email, role, active, birthday")
      .eq("active", true)
      .not("birthday", "is", null)
      .order("name", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);

    const birthdayEmployees = ((employees || []) as EmployeeRow[]).filter((employee) => matchesBirthday(employee.birthday, today));
    let adminCreated = 0;
    let employeeCreated = 0;

    for (const employee of birthdayEmployees) {
      const name = clean(employee.name);
      if (!name) continue;

      const adminType = "birthday_today_admin";
      const employeeType = "birthday_greeting";

      const hasAdminNotice = await notificationExists(supabase, name, adminType, dayStartIso, dayEndIso);
      if (!hasAdminNotice) {
        const { error: insertError } = await supabase.from("admin_notifications").insert({
          title: `Geburtstag: ${name}`,
          message: `${name} hat heute Geburtstag. Bitte Geburtstagsgruß nicht vergessen.`,
          employee_name: name,
          notification_type: adminType,
          status: "open",
          read: false,
          created_at: new Date().toISOString()
        });
        if (insertError) throw new Error(insertError.message);
        adminCreated += 1;
      }

      const hasEmployeeGreeting = await notificationExists(supabase, name, employeeType, dayStartIso, dayEndIso);
      if (!hasEmployeeGreeting) {
        const { error: insertError } = await supabase.from("admin_notifications").insert({
          title: "Alles Gute zum Geburtstag 🎉",
          message: "Ich wünsche dir alles Gute, Gesundheit und einen schönen Tag!",
          employee_name: name,
          notification_type: employeeType,
          status: "open",
          read: false,
          created_at: new Date().toISOString()
        });
        if (insertError) throw new Error(insertError.message);
        employeeCreated += 1;
      }
    }

    return NextResponse.json({ ok: true, today, birthdays: birthdayEmployees.length, adminCreated, employeeCreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geburtstagsmeldungen konnten nicht erstellt werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
