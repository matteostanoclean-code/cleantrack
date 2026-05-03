import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SupabaseAdmin = any;

type InviteRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  used: boolean;
};

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL fehlt.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");

  return { supabaseUrl, serviceRoleKey };
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

async function findAuthUserByEmail(supabaseAdmin: SupabaseAdmin, email: string) {
  const normalizedEmail = normalizeEmail(email);

  // Supabase hat in der Admin-API keinen zuverlässigen direkten E-Mail-Filter.
  // Deshalb lesen wir die User seitenweise und suchen die E-Mail sauber selbst.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const user = data.users.find((item: any) => normalizeEmail(item.email || "") === normalizedEmail);
    if (user) return user;

    if (data.users.length < 1000) break;
  }

  return null;
}

async function createOrUpdateAuthUser(
  supabaseAdmin: SupabaseAdmin,
  invite: InviteRow,
  password: string
) {
  const email = normalizeEmail(invite.email);
  const metadata = {
    name: invite.name,
    phone: invite.phone,
    role: "employee",
  };

  const existingUser = await findAuthUserByEmail(supabaseAdmin, email);

  if (existingUser?.id) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) throw error;
    return data.user || existingUser;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (!error && data.user) return data.user;

  // Falls Supabase trotzdem "User already exists" meldet, suchen wir nochmal
  // und setzen dann einfach das Passwort für den vorhandenen Auth-User neu.
  const duplicateMessage = String(error?.message || "").toLowerCase();
  if (duplicateMessage.includes("already") || duplicateMessage.includes("registered") || duplicateMessage.includes("exists")) {
    const duplicateUser = await findAuthUserByEmail(supabaseAdmin, email);
    if (duplicateUser?.id) {
      const { data: updatedData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(duplicateUser.id, {
        password,
        email_confirm: true,
        user_metadata: metadata,
      });

      if (updateError) throw updateError;
      return updatedData.user || duplicateUser;
    }
  }

  throw error || new Error("Mitarbeiter konnte in Supabase Auth nicht erstellt werden.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token = String(body.token || "").trim();
    const password = String(body.password || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Aktivierungslink fehlt." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Das Passwort muss mindestens 6 Zeichen haben." }, { status: 400 });
    }

    const { supabaseUrl, serviceRoleKey } = getEnv();
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("employee_invites")
      .select("id, name, email, phone, used")
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Aktivierungslink wurde nicht gefunden." }, { status: 400 });
    }

    if (invite.used) {
      return NextResponse.json({ error: "Dieser Aktivierungslink wurde bereits verwendet." }, { status: 400 });
    }

    const email = normalizeEmail(invite.email || "");
    if (!email) {
      return NextResponse.json({ error: "Bei dieser Einladung fehlt die E-Mail." }, { status: 400 });
    }

    const authUser = await createOrUpdateAuthUser(supabaseAdmin, { ...invite, email }, password);

    const { data: existingProfile } = await supabaseAdmin
      .from("employee_profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    const profilePayload = {
      auth_user_id: authUser.id,
      name: invite.name,
      email,
      phone: invite.phone || null,
      role: "employee",
      active: true,
      must_change_password: false,
    };

    const profileResult = existingProfile?.id
      ? await supabaseAdmin.from("employee_profiles").update(profilePayload).eq("id", existingProfile.id)
      : await supabaseAdmin.from("employee_profiles").insert([profilePayload]);

    if (profileResult.error) {
      return NextResponse.json(
        { error: profileResult.error.message || "Mitarbeiterprofil konnte nicht erstellt werden." },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("employee_invites")
      .update({ used: true })
      .eq("id", invite.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unbekannter Serverfehler bei der Aktivierung." },
      { status: 500 }
    );
  }
}
