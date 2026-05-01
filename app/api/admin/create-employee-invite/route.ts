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
    const phoneRaw = String(body.phone || "").trim();

    if (!name || !phoneRaw) {
      return NextResponse.json(
        { error: "Name und Handynummer sind Pflicht." },
        { status: 400 }
      );
    }

    const phone = normalizePhone(phoneRaw);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const token = createToken();

    const { error } = await supabaseAdmin.from("employee_invites").insert([
      {
        name,
        phone,
        token,
        used: false,
      },
    ]);

    if (error) {
      return NextResponse.json(
        { error: "Einladung konnte nicht erstellt werden." },
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
      phone,
      whatsappLink: `https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(
        `Hallo ${name}, hier ist dein Aktivierungslink für CleanTrack: ${inviteLink}`
      )}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Serverfehler beim Erstellen der Einladung." },
      { status: 500 }
    );
  }
}