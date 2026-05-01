import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(phone: string) {
  let cleaned = phone.replace(/\s/g, "").replace(/-/g, "");

  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  if (cleaned.startsWith("0")) {
    cleaned = "+49" + cleaned.slice(1);
  }

  return cleaned;
}

function createToken() {
  return crypto.randomUUID() + "-" + Math.random().toString(36).slice(2);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phoneRaw = String(body.phone || "").trim();

    if (!name || !email) {
      return NextResponse.json(
        { error: "Name und E-Mail sind Pflicht." },
        { status: 400 }
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Bitte eine gültige E-Mail eintragen." },
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

    const token = createToken();
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const { error } = await supabaseAdmin.from("employee_invites").insert([
      {
        name,
        email,
        phone,
        token,
        used: false,
      },
    ]);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Einladung konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    const inviteLink = `${baseUrl}/mitarbeiter/aktivieren?token=${encodeURIComponent(
      token
    )}`;

    return NextResponse.json({
      inviteLink,
      email,
      phone,
      whatsappLink: phone
        ? `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(
            `Hallo ${name}, hier ist dein Aktivierungslink für CleanTrack: ${inviteLink}`
          )}`
        : "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serverfehler beim Erstellen der Einladung.",
      },
      { status: 500 }
    );
  }
}