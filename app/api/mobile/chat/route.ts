import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { pushAnBuero, pushAnMitarbeiter } from "@/lib/push";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Erkennt, ob ein Fehler daher kommt, dass eine Spalte in der Tabelle fehlt.
 * Nur dann lohnt ein zweiter Versuch mit weniger Feldern.
 */
function istSpaltenfehler(fehler: unknown) {
  const f = fehler as { code?: string; message?: string };
  const code = String(f?.code || "");
  const text = String(f?.message || "").toLowerCase();
  return code === "PGRST204" || code === "42703" || text.includes("column") || text.includes("schema cache");
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const message = text(body.message || body.body || body.text);

    if (!message) {
      return NextResponse.json({ ok: false, error: "Bitte eine Nachricht schreiben." }, { status: 400 });
    }

    // Der Verlauf haengt am Mitarbeiter. Schreibt das Buero, muss die Nachricht
    // im Verlauf des Mitarbeiters landen, nicht im eigenen. Vorher ging jede
    // Admin-Nachricht an den Admin selbst und kam nie an.
    const requestedEmployee = text(body.employeeName);
    const threadEmployee = auth.isAdmin && requestedEmployee ? requestedEmployee : auth.profile.name;

    if (auth.isAdmin && requestedEmployee && requestedEmployee !== auth.profile.name) {
      const target = await auth.supabase.from("employee_profiles").select("name").eq("name", requestedEmployee).maybeSingle();
      if (target.error) throw new Error(target.error.message);
      if (!target.data) {
        return NextResponse.json({ ok: false, error: `Mitarbeiter ${requestedEmployee} wurde nicht gefunden.` }, { status: 404 });
      }
    }

    const fullPayload = {
      employee_name: threadEmployee,
      sender_name: auth.profile.name,
      sender_role: auth.isAdmin ? "admin" : "employee",
      message,
      body: message,
      text: message,
      read_by_admin: auth.isAdmin ? true : false,
      read_by_employee: auth.isAdmin ? false : true,
      status: "open",
      todo_status: "open",
      created_at: new Date().toISOString()
    };

    let insert = await auth.supabase.from("chat_messages").insert(fullPayload).select("*").maybeSingle();

    // Zweiter Versuch nur, wenn eine Spalte fehlt. Vorher wurde bei jedem
    // beliebigen Fehler erneut geschrieben — auch dann, wenn die erste
    // Zeile längst angelegt war. Ergebnis: jede Nachricht stand doppelt drin.
    if (insert.error && istSpaltenfehler(insert.error)) {
      const fallbackPayload = {
        employee_name: threadEmployee,
        sender_name: auth.profile.name,
        sender_role: auth.isAdmin ? "admin" : "employee",
        message,
        read_by_admin: auth.isAdmin ? true : false,
        read_by_employee: auth.isAdmin ? false : true,
        created_at: new Date().toISOString()
      };
      insert = await auth.supabase.from("chat_messages").insert(fallbackPayload).select("*").maybeSingle();
    }

    if (insert.error) throw new Error(insert.error.message);

    if (!auth.isAdmin) {
      await auth.supabase.from("admin_notifications").insert({
        employee_name: auth.profile.name,
        title: "Neue Chat-Nachricht",
        message: `${auth.profile.name}: ${message}`,
        notification_type: "chat_message",
        status: "open"
      });

      // Zusätzlich eine Push-Nachricht. Ohne sie steht die Meldung nur im
      // Dashboard und wird oft erst Stunden später gesehen.
      await pushAnBuero(
        auth.supabase,
        "Neue Chat-Nachricht",
        `${auth.profile.name}: ${message}`,
        "/mitarbeiter/admin/chat"
      );
    } else if (threadEmployee !== auth.profile.name) {
      // Schreibt das Büro über diesen Weg, bekommt der Mitarbeiter die Meldung.
      await pushAnMitarbeiter(
        auth.supabase,
        threadEmployee,
        "Nachricht vom Büro",
        message,
        "/mitarbeiter/chat"
      );
    }

    return NextResponse.json({ ok: true, message: insert.data, thread: threadEmployee });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nachricht konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
