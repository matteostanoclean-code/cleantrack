import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function requireAdmin(request: Request) {
  const auth = await getAuthenticatedMobileProfile(request);
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ ok: false, error: auth.error }, { status: auth.status }) };
  if (!auth.isAdmin) return { ok: false as const, response: NextResponse.json({ ok: false, error: "Nur Admins dürfen Freigaben bearbeiten." }, { status: 403 }) };
  return { ok: true as const, auth };
}

function isOpen(row: AnyRow) {
  const status = String(row.status || row.todo_status || "open").toLowerCase();
  return !["done", "approved", "rejected", "resolved", "closed", "abgelehnt", "genehmigt", "erledigt"].includes(status);
}

export async function GET(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { supabase } = guard.auth;

    const [absenceResult, materialResult, chatResult, notificationResult, qualityResult, serviceResult, employeeResult] = await Promise.all([
      supabase
        .from("absence_requests")
        .select("id, employee_name, request_type, absence_type, start_date, end_date, reason, status, created_at, admin_response, decided_at")
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("material_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("chat_messages")
        .select("id, employee_name, sender_name, sender_role, message, body, text, status, todo_status, read_by_admin, read_by_employee, created_at, resolved_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("admin_notifications")
        .select("id, title, message, employee_name, work_site_name, object_name, site, read, status, notification_type, created_at, overtime_minutes, task_id, work_site_id, admin_response, resolved_at, material_product_id, material_name, absence_request_id")
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("quality_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("service_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("employee_profiles")
        .select("id, name, email, role, active")
        .order("name", { ascending: true })
    ]);

    const errors = [absenceResult.error, materialResult.error, chatResult.error, notificationResult.error, qualityResult.error, serviceResult.error, employeeResult.error].filter(Boolean);
    if (errors.length) throw new Error(errors[0]?.message || "Daten konnten nicht geladen werden.");

    const openAbsences = (absenceResult.data || []).filter(isOpen);
    const openMaterialReports = (materialResult.data || []).filter(isOpen);
    const openChats = (chatResult.data || []).filter((row: AnyRow) => {
      const senderRole = String(row.sender_role || "").toLowerCase();
      const unread = row.read_by_admin === false || row.todo_status === "open" || row.status === "open";
      return senderRole !== "admin" && unread;
    });
    const openNotifications = (notificationResult.data || []).filter(isOpen);
    const openQualityReports = (qualityResult.data || []).filter(isOpen);
    const openServiceReports = (serviceResult.data || []).filter(isOpen);

    return NextResponse.json({
      ok: true,
      absences: openAbsences,
      materialReports: openMaterialReports,
      chatMessages: openChats,
      notifications: openNotifications,
      qualityReports: openQualityReports,
      serviceReports: openServiceReports,
      employees: employeeResult.data || []
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin-Daten konnten nicht geladen werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;
    const { supabase, profile } = guard.auth;
    const body = await request.json();
    const type = text(body.type);
    const id = text(body.id);
    const action = text(body.action).toLowerCase();
    const adminResponse = text(body.adminResponse || body.admin_response || body.note);

    if (!id || !type) {
      return NextResponse.json({ ok: false, error: "Typ oder ID fehlt." }, { status: 400 });
    }

    if (type === "absence") {
      const status = action === "reject" || action === "rejected" ? "rejected" : "approved";
      const { data, error } = await supabase
        .from("absence_requests")
        .update({
          status,
          admin_response: adminResponse || (status === "approved" ? "Genehmigt" : "Abgelehnt"),
          decided_at: new Date().toISOString()
        })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Abwesenheitsantrag wurde nicht gefunden." }, { status: 404 });

      await supabase
        .from("admin_notifications")
        .update({ status: "resolved", read: true, resolved_at: new Date().toISOString(), admin_response: adminResponse || status })
        .eq("absence_request_id", id);

      await supabase.from("chat_messages").insert({
        employee_name: data.employee_name,
        sender_name: profile.name,
        sender_role: "admin",
        message: `Dein Abwesenheitsantrag wurde ${status === "approved" ? "genehmigt" : "abgelehnt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        body: `Dein Abwesenheitsantrag wurde ${status === "approved" ? "genehmigt" : "abgelehnt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        text: `Dein Abwesenheitsantrag wurde ${status === "approved" ? "genehmigt" : "abgelehnt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        read_by_admin: true,
        read_by_employee: false,
        status: "open",
        todo_status: "open",
        created_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "material") {
      const status = action === "reject" || action === "rejected" ? "rejected" : action === "done" || action === "resolved" ? "done" : "approved";
      let update = await supabase
        .from("material_reports")
        .update({ status })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (update.error) throw new Error(update.error.message);
      if (!update.data) return NextResponse.json({ ok: false, error: "Materialmeldung wurde nicht gefunden." }, { status: 404 });

      const employeeName = update.data.employee_name;
      const materialName = update.data.material_name || update.data.product_name || "Material";
      const objectName = update.data.object_name || update.data.site || "Objekt";
      const reply = status === "rejected" ? "abgelehnt" : status === "done" ? "erledigt" : "freigegeben";

      await supabase.from("admin_notifications").insert({
        title: "Materialmeldung bearbeitet",
        message: `${profile.name} hat die Materialmeldung ${reply}: ${materialName} bei ${objectName}.`,
        employee_name: employeeName,
        notification_type: "material_report_update",
        status: "resolved",
        read: true,
        material_product_id: update.data.material_product_id || update.data.material_id || null,
        material_name: materialName,
        object_name: objectName,
        admin_response: adminResponse || reply,
        resolved_at: new Date().toISOString()
      });

      await supabase.from("chat_messages").insert({
        employee_name: employeeName,
        sender_name: profile.name,
        sender_role: "admin",
        message: `Deine Materialmeldung wurde ${reply}.${adminResponse ? ` ${adminResponse}` : ""}`,
        body: `Deine Materialmeldung wurde ${reply}.${adminResponse ? ` ${adminResponse}` : ""}`,
        text: `Deine Materialmeldung wurde ${reply}.${adminResponse ? ` ${adminResponse}` : ""}`,
        read_by_admin: true,
        read_by_employee: false,
        status: "open",
        todo_status: "open",
        created_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, item: update.data });
    }

    if (type === "chat") {
      const { data, error } = await supabase
        .from("chat_messages")
        .update({ read_by_admin: true, status: "resolved", todo_status: "done", resolved_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Chat-Nachricht wurde nicht gefunden." }, { status: 404 });

      await supabase
        .from("admin_notifications")
        .update({ status: "resolved", read: true, resolved_at: new Date().toISOString(), admin_response: adminResponse || "Gelesen" })
        .eq("employee_name", data.employee_name)
        .eq("notification_type", "chat_message");

      return NextResponse.json({ ok: true, item: data });
    }


    if (type === "quality") {
      const status = action === "reject" || action === "rejected" ? "rejected" : action === "approve" || action === "approved" ? "approved" : "done";
      const { data, error } = await supabase
        .from("quality_reports")
        .update({ status })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Qualitätsnachweis wurde nicht gefunden." }, { status: 404 });

      await supabase.from("chat_messages").insert({
        employee_name: data.employee_name,
        sender_name: profile.name,
        sender_role: "admin",
        message: `Dein Qualitätsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        body: `Dein Qualitätsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        text: `Dein Qualitätsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        read_by_admin: true,
        read_by_employee: false,
        status: "open",
        todo_status: "open",
        created_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, item: data });
    }


    if (type === "service") {
      const status = action === "reject" || action === "rejected" ? "rejected" : action === "approve" || action === "approved" ? "approved" : "done";
      const { data, error } = await supabase
        .from("service_reports")
        .update({ status })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Leistungsnachweis wurde nicht gefunden." }, { status: 404 });

      await supabase.from("chat_messages").insert({
        employee_name: data.employee_name,
        sender_name: profile.name,
        sender_role: "admin",
        message: `Dein Leistungsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        body: `Dein Leistungsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        text: `Dein Leistungsnachweis wurde ${status === "rejected" ? "abgelehnt" : status === "approved" ? "freigegeben" : "erledigt"}.${adminResponse ? ` ${adminResponse}` : ""}`,
        read_by_admin: true,
        read_by_employee: false,
        status: "open",
        todo_status: "open",
        created_at: new Date().toISOString()
      });

      await supabase
        .from("admin_notifications")
        .update({ status: "resolved", read: true, resolved_at: new Date().toISOString(), admin_response: adminResponse || status })
        .eq("task_id", data.task_id)
        .eq("notification_type", "service_report");

      return NextResponse.json({ ok: true, item: data });
    }

    if (type === "notification") {
      const { data, error } = await supabase
        .from("admin_notifications")
        .update({ status: "resolved", read: true, resolved_at: new Date().toISOString(), admin_response: adminResponse || "Erledigt" })
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ ok: false, error: "Meldung wurde nicht gefunden." }, { status: 404 });
      return NextResponse.json({ ok: true, item: data });
    }

    return NextResponse.json({ ok: false, error: "Unbekannter Freigabe-Typ." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Freigabe konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
