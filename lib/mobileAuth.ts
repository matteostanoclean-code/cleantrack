import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type MobileProfile = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  role: string | null;
  active: boolean | null;
  phone?: string | null;
  avatar_url?: string | null;
  monthly_hour_limit?: number | null;
  monthly_hours?: number | null;
  hourly_rate?: number | null;
  vacation_days?: number | null;
  annual_vacation_days?: number | null;
  birthday?: string | null;
};

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export async function getAuthenticatedMobileProfile(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, error: "Bitte anmelden." };
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: "Login ist ungültig oder abgelaufen." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("employee_profiles")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false as const, status: 500, error: profileError.message };
  }

  if (!profile) {
    return { ok: false as const, status: 403, error: "Für diesen Login gibt es noch kein Mitarbeiter-Profil." };
  }

  if (profile.active === false) {
    return { ok: false as const, status: 403, error: "Dieses Mitarbeiter-Profil ist deaktiviert." };
  }

  return { ok: true as const, supabase, user: userData.user, profile: profile as MobileProfile, isAdmin: String(profile.role || "").toLowerCase() === "admin" };
}
