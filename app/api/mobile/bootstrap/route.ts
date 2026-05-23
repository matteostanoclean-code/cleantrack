import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type SupabaseResult<T> = { data: T[] | null; error: { message: string } | null };

function monthStartIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function byName<T extends { name?: string | null }>(items: T[], name?: string | null) {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return items.find((item) => (item.name || "").trim().toLowerCase() === wanted);
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { supabase, profile, isAdmin } = auth;
    const { searchParams } = new URL(request.url);
    const requestedEmployee = searchParams.get("employee");

    const employeesResult = (await supabase
      .from("employee_profiles")
      .select("id, auth_user_id, name, email, role, active, phone, avatar_url, monthly_hour_limit, monthly_hours, vacation_days, annual_vacation_days")
      .order("name", { ascending: true })) as SupabaseResult<any>;

    if (employeesResult.error) throw new Error(employeesResult.error.message);

    const employees = (employeesResult.data || []).filter((employee) => employee.name);
    const activeEmployees = employees.filter((employee) => employee.active !== false);

    const selectedEmployee = isAdmin
      ? byName(activeEmployees, requestedEmployee) || byName(employees, requestedEmployee) || activeEmployees[0] || profile
      : profile;

    if (!selectedEmployee) {
      return NextResponse.json({ ok: true, isAdmin, employees: isAdmin ? employees : [profile], employee: null, tasks: [], timeEntries: [], absences: [], notifications: [], chatMessages: [], materialProducts: [], materialReports: [], employeeWorkSites: [], workSites: [], cleaningPlans: [], cleaningPlanItems: [], qualityReports: [], serviceReports: [] });
    }

    const employeeName = selectedEmployee.name;
    const fromDate = dateOffset(-90);
    const toDate = dateOffset(365);

    const [tasksResult, timeEntriesResult, absencesResult, notificationsResult, chatMessagesResult, employeeWorkSitesResult] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, site, employee_name, task_date, done, created_at, start_time, end_time, max_minutes, work_site_id, planned_minutes, overtime_requested, notes, status, priority, identifier, due_date, customer_id, customer_name, task_type, schedule_type, break_minutes, approved_overtime_minutes, overtime_status, item_type, task_category, paid_minutes, wage_minutes, quality_required, quality_photo_required, quality_checklist")
        .eq("employee_name", employeeName)
        .gte("task_date", fromDate)
        .lte("task_date", toDate)
        .order("task_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("time_entries")
        .select("id, task_id, employee_name, employee_id, work_site_id, work_site_name, action, latitude, longitude, distance_m, allowed_radius_m, success, error_message, created_at, expected_start_time")
        .eq("employee_name", employeeName)
        .gte("created_at", monthStartIso())
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("absence_requests")
        .select("id, employee_name, request_type, absence_type, start_date, end_date, reason, status, created_at, admin_response")
        .eq("employee_name", employeeName)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("admin_notifications")
        .select("id, title, message, employee_name, work_site_name, object_name, site, read, status, notification_type, created_at, overtime_minutes, task_id, work_site_id, admin_response")
        .eq("employee_name", employeeName)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("chat_messages")
        .select("id, employee_name, sender_name, sender_role, message, body, text, status, todo_status, read_by_admin, read_by_employee, created_at")
        .eq("employee_name", employeeName)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("employee_work_sites")
        .select("id, employee_name, work_site_id, site_name, active, created_at")
        .eq("employee_name", employeeName)
        .order("site_name", { ascending: true })
    ]);

    const results = [tasksResult, timeEntriesResult, absencesResult, notificationsResult, chatMessagesResult, employeeWorkSitesResult] as Array<{ data: any[] | null; error: { message: string } | null }>;
    const error = results.find((result) => result.error)?.error;
    if (error) throw new Error(error.message);

    const workSiteIds = Array.from(new Set([
      ...((tasksResult.data || []).map((task: any) => task.work_site_id).filter(Boolean)),
      ...((employeeWorkSitesResult.data || []).map((site: any) => site.work_site_id).filter(Boolean))
    ]));

    let cleaningPlans: any[] = [];
    let cleaningPlanItems: any[] = [];
    let qualityReports: any[] = [];
    let serviceReports: any[] = [];
    let workSites: any[] = [];

    if (workSiteIds.length) {
      const sitesResult = await supabase
        .from("work_sites")
        .select("*")
        .in("id", workSiteIds);
      if (!sitesResult.error) workSites = sitesResult.data || [];

      const plansResult = await supabase
        .from("cleaning_plans")
        .select("id, name, customer_id, customer_name, work_site_id, site_name, description, comments, status, language, template_type, created_at, updated_at")
        .in("work_site_id", workSiteIds)
        .order("updated_at", { ascending: false });
      if (!plansResult.error) {
        cleaningPlans = plansResult.data || [];
        const planIds = cleaningPlans.map((plan: any) => plan.id).filter(Boolean);
        if (planIds.length) {
          const itemsResult = await supabase
            .from("cleaning_plan_items")
            .select("id, plan_id, area, task_title, task_description, interval_type, weekdays, quantity, unit, notes, active, sort_order, calculation_minutes, created_at, updated_at")
            .in("plan_id", planIds)
            .neq("active", false)
            .order("sort_order", { ascending: true });
          if (!itemsResult.error) cleaningPlanItems = itemsResult.data || [];
        }
      }
    }

    const qualityResult = await supabase
      .from("quality_reports")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!qualityResult.error) qualityReports = qualityResult.data || [];

    const serviceResult = await supabase
      .from("service_reports")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!serviceResult.error) serviceReports = serviceResult.data || [];

    let materialProducts: any[] = [];
    let materialReports: any[] = [];

    const productResult = await supabase
      .from("material_products")
      .select("*")
      .order("name", { ascending: true })
      .limit(100);
    if (!productResult.error) materialProducts = productResult.data || [];

    const reportResult = await supabase
      .from("material_reports")
      .select("*")
      .eq("employee_name", employeeName)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!reportResult.error) materialReports = reportResult.data || [];

    return NextResponse.json({
      ok: true,
      isAdmin,
      employees: isAdmin ? employees : [profile],
      employee: selectedEmployee,
      tasks: tasksResult.data || [],
      timeEntries: timeEntriesResult.data || [],
      absences: absencesResult.data || [],
      notifications: notificationsResult.data || [],
      chatMessages: chatMessagesResult.data || [],
      materialProducts,
      materialReports,
      employeeWorkSites: employeeWorkSitesResult.data || [],
      workSites,
      cleaningPlans,
      cleaningPlanItems,
      qualityReports,
      serviceReports
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Supabase-Fehler";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
