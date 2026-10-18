import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

type PushSubscriptionBody = {
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as PushSubscriptionBody;
    const subscription = body.subscription;
    const endpoint = clean(subscription?.endpoint);
    const p256dh = clean(subscription?.keys?.p256dh);
    const authKey = clean(subscription?.keys?.auth);

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ ok: false, error: "Push-Subscription ist unvollständig." }, { status: 400 });
    }

    // Pflichtangaben, die es in jeder Fassung der Tabelle gibt.
    const kern = {
      employee_name: auth.profile.name,
      endpoint,
      p256dh,
      auth: authKey,
      updated_at: new Date().toISOString()
    };

    // Zusatzangaben. Fehlt eine Spalte, wird sie unten einzeln weggelassen,
    // statt die ganze Anmeldung scheitern zu lassen. Genau daran ist der
    // Versand bisher gescheitert: die Tabelle stammt aus einer älteren
    // Fassung, der Code schrieb Spalten hinein, die es dort nie gab — die
    // Anmeldung schlug jedes Mal fehl und kein Gerät war je eingetragen.
    const zusatz: Record<string, unknown> = {
      employee_profile_id: auth.profile.id,
      subscription: subscription,
      subscription_json: subscription,
      user_agent: request.headers.get("user-agent") || null,
      active: true
    };

    // Dasselbe Gerät kann sich erneut anmelden, etwa nach einem Namenswechsel.
    // Erst die alte Zeile zu diesem Gerät weg, dann neu schreiben. Das kommt
    // ohne eindeutigen Schlüssel auf endpoint aus, den es hier nicht gibt.
    await auth.supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    let felder = { ...zusatz };
    let versuch = 0;
    let gespeichert: unknown = null;

    while (versuch < 8) {
      versuch += 1;
      const { data, error } = await auth.supabase
        .from("push_subscriptions")
        .insert({ ...kern, ...felder })
        .select("id, employee_name, updated_at")
        .single();

      if (!error) {
        gespeichert = data;
        break;
      }

      /**
       * PostgREST nennt die unbekannte Spalte im Text, aber in mehreren
       * Formulierungen:
       *   Could not find the 'active' column of 'push_subscriptions' …
       *   column "active" of relation … does not exist
       *
       * Ein einzelnes Muster reicht dafür nicht. Schlimmer noch: ein Muster
       * auf "column <name>" trifft bei der ersten Fassung auf "column of" und
       * hält "of" für den Spaltennamen — dann wird nichts weggelassen und die
       * Anmeldung scheitert, obwohl sie es nicht müsste. Genau daran ist der
       * Push hier gescheitert.
       *
       * Deshalb: alle Namen einsammeln, die im Text vorkommen, und den ersten
       * nehmen, den wir wirklich schreiben wollten.
       */
      const namen = [
        ...error.message.matchAll(/'([a-z_]+)'/gi),
        ...error.message.matchAll(/"([a-z_]+)"/gi)
      ].map((treffer) => treffer[1]);

      const spalte = namen.find((name) => name in felder);
      if (spalte) {
        delete felder[spalte];
        continue;
      }
      throw new Error(error.message);
    }

    if (!gespeichert) throw new Error("Anmeldung konnte nicht gespeichert werden.");

    return NextResponse.json({ ok: true, subscription: gespeichert });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
