import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function createTemporaryPassword() {
  // Mindestens 12 Zeichen und gemischte Zeichentypen, damit Supabase die meisten Passwortregeln akzeptiert.
  return `Ct-${randomBytes(6).toString("base64url")}-A1!`;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Anmeldename fuer Leute ohne eigene E-Mail-Adresse.
 *
 * Supabase braucht zum Anmelden eine Adresse. Nicht jeder im Betrieb hat eine,
 * deshalb wird aus dem Namen eine gebaut: vorname.nachname@intern.matteostano-clean.de.
 * Dorthin geht nie eine Mail - weder beim Anlegen (email_confirm) noch spaeter.
 * Die Adresse ist nur der Anmeldename und wird ins Profil zurueckgeschrieben,
 * damit beim naechsten Mal dieselbe gilt.
 */
const INTERNE_DOMAENE = "intern.matteostano-clean.de";

function interneAdresse(name: string, employeeId: string) {
  const ersatz: Record<string, string> = { "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" };
  const klein = name.toLowerCase().replace(/[äöüß]/g, (z) => ersatz[z] || z);
  const teile = klein
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/[\s.-]+/)
    .filter(Boolean);
  // Reihenfolge im Profil ist "Nachname, Vorname", fuer die Adresse gedreht
  const basis = teile.length >= 2 ? `${teile[teile.length - 1]}.${teile[0]}` : teile[0] || "";
  if (!basis) return `mitarbeiter.${employeeId.slice(0, 8)}@${INTERNE_DOMAENE}`;
  return `${basis}@${INTERNE_DOMAENE}`;
}

/**
 * Anmeldekonto zu einer E-Mail suchen.
 *
 * Supabase bietet dafür keine direkte Abfrage, deshalb wird die Nutzerliste
 * seitenweise durchgegangen. Bei der Größe dieses Betriebs sind das ein bis
 * zwei Seiten. Die Adresse wird ohne Rücksicht auf Groß- und Kleinschreibung
 * verglichen, sonst findet "Matteo@" das Konto "matteo@" nicht.
 */
async function findAuthUserByEmail(supabase: any, email: string) {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users || [];
    const hit = users.find((user: any) => String(user.email || "").trim().toLowerCase() === wanted);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Nur Admins dürfen Mitarbeiter aktivieren." }, { status: 403 });
    }

    const body = await request.json();
    const employeeId = cleanString(body.employeeId);
    const customPassword = cleanString(body.password);

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter-ID fehlt." }, { status: 400 });
    }

    // Ein zu kurzes eigenes Passwort wurde frueher stillschweigend durch ein
    // zufaelliges ersetzt. Wer "Elona1" eintippt, bekam dann ein anderes und
    // merkte es nicht. Jetzt gibt es eine Ansage.
    if (customPassword && customPassword.length < 8) {
      return NextResponse.json({
        ok: false,
        error: "Das eigene Startpasswort braucht mindestens 8 Zeichen. Feld leer lassen, dann wird eines erzeugt."
      }, { status: 400 });
    }
    const password = customPassword || createTemporaryPassword();

    const { data: employee, error: employeeError } = await auth.supabase
      .from("employee_profiles")
      .select("id, auth_user_id, name, email, role, active")
      .eq("id", employeeId)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);
    if (!employee) {
      return NextResponse.json({ ok: false, error: "Mitarbeiter wurde nicht gefunden." }, { status: 404 });
    }

    const name = cleanString(employee.name) || "Mitarbeiter";
    const role = cleanString(employee.role) || "employee";
    // Ohne eigene Adresse wird eine interne gebaut. Sie ist nur der
    // Anmeldename, es geht nie eine Mail dorthin
    const vorhandeneEmail = cleanString(employee.email);
    const email = vorhandeneEmail || interneAdresse(name, employeeId);
    const emailErzeugt = !vorhandeneEmail;

    let authUserId = cleanString(employee.auth_user_id);

    if (authUserId) {
      const { error: updateAuthError } = await auth.supabase.auth.admin.updateUserById(authUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (updateAuthError) throw new Error(updateAuthError.message);
    } else {
      const { data: createdUser, error: createError } = await auth.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role }
      });

      if (createError) {
        const lowerMessage = createError.message.toLowerCase();
        const alreadyExists = lowerMessage.includes("already") || lowerMessage.includes("registered") || lowerMessage.includes("exists");
        if (!alreadyExists) throw new Error(createError.message);

        // Es gibt bereits ein Anmeldekonto mit dieser Adresse, meist ein
        // uebrig gebliebenes aus einer frueheren Testphase. Statt abzubrechen
        // wird es uebernommen: neues Passwort setzen und mit dem Profil
        // verknuepfen. Haengt es schon an einem anderen Profil, brechen wir ab.
        const existing = await findAuthUserByEmail(auth.supabase, email);
        if (!existing) {
          return NextResponse.json({
            ok: false,
            error: "Für diese E-Mail gibt es bereits ein Anmeldekonto, das sich nicht finden lässt. Bitte eine andere E-Mail verwenden."
          }, { status: 409 });
        }

        const inUse = await auth.supabase
          .from("employee_profiles")
          .select("id, name")
          .eq("auth_user_id", existing.id)
          .neq("id", employeeId)
          .maybeSingle();

        if (!inUse.error && inUse.data) {
          return NextResponse.json({
            ok: false,
            error: `Dieses Anmeldekonto gehört bereits zu ${inUse.data.name}. Bitte eine andere E-Mail verwenden.`
          }, { status: 409 });
        }

        const { error: takeoverError } = await auth.supabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: { name, role }
        });
        if (takeoverError) throw new Error(takeoverError.message);

        authUserId = existing.id;
      } else {
        authUserId = createdUser.user?.id || "";
      }
    }

    if (!authUserId) {
      return NextResponse.json({ ok: false, error: "Supabase hat keine Auth-ID zurückgegeben." }, { status: 500 });
    }

    const { data: updatedEmployee, error: updateProfileError } = await auth.supabase
      .from("employee_profiles")
      .update({
        auth_user_id: authUserId,
        active: true,
        must_change_password: true,
        // Die erzeugte Adresse ins Profil zurueck, sonst entsteht beim
        // naechsten Mal eine andere und der alte Zugang passt nicht mehr
        ...(emailErzeugt ? { email } : {})
      })
      .eq("id", employeeId)
      .select("id, auth_user_id, name, email, role, active, must_change_password")
      .single();

    if (updateProfileError) throw new Error(updateProfileError.message);

    return NextResponse.json({
      ok: true,
      employee: updatedEmployee,
      login: {
        email,
        password,
        mustChangePassword: true,
        emailErzeugt
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mitarbeiter konnte nicht aktiviert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
