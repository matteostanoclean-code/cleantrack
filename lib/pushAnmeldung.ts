/**
 * Das Gerät für Push anmelden.
 *
 * Liegt hier und nicht nur im Einstellungsbildschirm, weil die Anmeldung an
 * zwei Stellen gebraucht wird: einmal, wenn jemand den Knopf drückt, und
 * einmal beim Start der App.
 *
 * Der Start ist der wichtigere Fall. Nach einer Neuinstallation ist die
 * Erlaubnis oft noch da, die Anmeldung beim Server aber weg — dann wartet
 * jemand auf Nachrichten, die nirgends ankommen, und niemand merkt es. Ist
 * die Erlaubnis erteilt, meldet sich die App deshalb von selbst wieder an.
 *
 * Was nicht geht: die Erlaubnis selbst einholen, ohne dass jemand tippt. Das
 * verlangen die Browser, auf dem iPhone ausnahmslos. Dafür bleibt der Knopf.
 */

function schluesselAlsBytes(base64: string) {
  const voll = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const roh = window.atob(voll);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

export function pushMoeglich() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export type AnmeldeErgebnis =
  | { ok: true; neu: boolean }
  | { ok: false; grund: "nicht_moeglich" | "kein_schluessel" | "keine_erlaubnis" | "fehler"; text: string };

/**
 * Anmelden. Ohne `erlaubnisErfragen` wird nur gespeichert, wenn die Erlaubnis
 * schon erteilt ist — so lässt sich das beim Start gefahrlos aufrufen, ohne
 * jemandem ungefragt eine Abfrage vor die Nase zu setzen.
 */
export async function pushAnmelden(authToken: string, vapidPublicKey: string, erlaubnisErfragen = false): Promise<AnmeldeErgebnis> {
  if (!pushMoeglich()) return { ok: false, grund: "nicht_moeglich", text: "Dieser Browser kann keine Meldungen empfangen." };
  if (!vapidPublicKey) {
    return { ok: false, grund: "kein_schluessel", text: "Der Schlüssel NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt in Vercel. Ohne ihn kann kein Gerät angemeldet werden." };
  }

  try {
    let erlaubnis = Notification.permission;
    if (erlaubnis === "default" && erlaubnisErfragen) erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== "granted") {
      return {
        ok: false,
        grund: "keine_erlaubnis",
        text: erlaubnis === "denied" ? "Benachrichtigungen sind blockiert. Bitte in den Handy-Einstellungen erlauben." : "Benachrichtigungen wurden noch nicht erlaubt."
      };
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    /**
     * Eine bestehende Anmeldung nur weiterverwenden, wenn sie zum aktuellen
     * Serverschlüssel gehört. Sonst bleibt sie ewig stehen, nimmt Nachrichten
     * an und stellt nichts zu.
     */
    const vorhanden = await registration.pushManager.getSubscription();
    let subscription = vorhanden;
    let neu = false;
    if (vorhanden) {
      const roh = vorhanden.options?.applicationServerKey;
      const alsText = roh
        ? btoa(String.fromCharCode(...new Uint8Array(roh))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
        : "";
      if (alsText !== vapidPublicKey.replace(/=+$/, "")) {
        await vorhanden.unsubscribe().catch(() => {});
        subscription = null;
      }
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: schluesselAlsBytes(vapidPublicKey)
      });
      neu = true;
    }

    // Immer melden, auch wenn das Gerät meint, es sei schon angemeldet: ob der
    // Server es kennt, weiß nur der Server.
    const antwort = await fetch("/api/mobile/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ subscription })
    });
    const ergebnis = await antwort.json();
    if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Push konnte nicht gespeichert werden.");

    return { ok: true, neu };
  } catch (fehler) {
    return { ok: false, grund: "fehler", text: fehler instanceof Error ? fehler.message : "Push konnte nicht aktiviert werden." };
  }
}
