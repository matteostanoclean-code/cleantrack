"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabaseClient";

/**
 * Chat im Adminbereich.
 *
 * Ein Verlauf je Mitarbeiter, wie man es von einem Nachrichtendienst kennt:
 * links die Liste, rechts der Verlauf, unten das Eingabefeld. Eigene Antworten
 * stehen im selben Verlauf.
 */

type Nachricht = { id: string; von: "buero" | "mitarbeiter"; absender: string; text: string; zeit: string | null };
type Verlauf = { name: string; nachrichten: Nachricht[]; ungelesen: number; zuletzt: string | null };

function uhrzeit(wert: string | null) {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function tagestrenner(wert: string | null) {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return "";
  const heute = new Date();
  const gestern = new Date();
  gestern.setDate(heute.getDate() - 1);
  const gleich = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (gleich(d, heute)) return "Heute";
  if (gleich(d, gestern)) return "Gestern";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ChatSeite() {
  const [token, setToken] = useState("");
  const [ladeAuth, setLadeAuth] = useState(true);
  const [verlaeufe, setVerlaeufe] = useState<Verlauf[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>("");
  const [eingabe, setEingabe] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState("");
  const ende = useRef<HTMLDivElement | null>(null);

  const laden = useCallback(async (t: string, behalteAuswahl = true) => {
    try {
      const antwort = await fetch("/api/admin/chat", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Chat konnte nicht geladen werden.");
      setVerlaeufe(ergebnis.verlaeufe || []);
      if (!behalteAuswahl || !gewaehlt) {
        const erster = (ergebnis.verlaeufe || [])[0];
        if (erster) setGewaehlt(erster.name);
      }
      setFehler("");
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Chat konnte nicht geladen werden.");
    }
  }, [gewaehlt]);

  useEffect(() => {
    async function start() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const t = data.session?.access_token || "";
      setToken(t);
      setLadeAuth(false);
      if (t) await laden(t, false);
    }
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alle 20 Sekunden nachladen, damit neue Nachrichten von selbst erscheinen.
  useEffect(() => {
    if (!token) return;
    const uhr = setInterval(() => laden(token), 20000);
    return () => clearInterval(uhr);
  }, [token, laden]);

  const aktiv = useMemo(() => verlaeufe.find((v) => v.name === gewaehlt) || null, [verlaeufe, gewaehlt]);

  useEffect(() => {
    ende.current?.scrollIntoView({ behavior: "smooth" });
  }, [aktiv?.nachrichten.length, gewaehlt]);

  // Beim Öffnen eines Verlaufs als gelesen markieren.
  useEffect(() => {
    if (!token || !gewaehlt || !aktiv?.ungelesen) return;
    fetch("/api/admin/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ employeeName: gewaehlt }),
    }).then(() => laden(token));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gewaehlt, aktiv?.ungelesen, token]);

  async function senden() {
    const text = eingabe.trim();
    if (!text || !gewaehlt) return;
    setSendet(true);
    setFehler("");
    try {
      const antwort = await fetch("/api/mobile/admin/chat-reply", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName: gewaehlt, message: text }),
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Nachricht konnte nicht gesendet werden.");
      setEingabe("");
      await laden(token);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Nachricht konnte nicht gesendet werden.");
    } finally {
      setSendet(false);
    }
  }

  if (ladeAuth) return <div className="p-6 text-ink-500">Lädt…</div>;

  if (!token) {
    return (
      <div className="p-6">
        <p className="text-ink-700">Bitte zuerst anmelden.</p>
        <Link href="/mitarbeiter/admin" className="mt-3 inline-block text-brand-600 underline">Zur Anmeldung</Link>
      </div>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-600">Adminbereich</p>
        <h1 className="text-[26px] font-bold">Chat</h1>
        <p className="mt-1 text-[14px] text-ink-400">Ein Verlauf je Mitarbeiter.</p>

        {fehler ? (
          <div className="mt-4 rounded-xl border border-danger-500/30 bg-danger-100 px-4 py-3 text-[14px] text-danger-700">{fehler}</div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Mitarbeiterliste */}
          <div className="rounded-2xl border border-paper-200 bg-white p-2">
            {verlaeufe.length === 0 ? (
              <p className="p-3 text-[14px] text-ink-400">Keine Mitarbeiter gefunden.</p>
            ) : (
              <ul className="space-y-0.5">
                {verlaeufe.map((v) => {
                  const letzte = v.nachrichten[v.nachrichten.length - 1];
                  return (
                    <li key={v.name}>
                      <button
                        type="button"
                        onClick={() => setGewaehlt(v.name)}
                        className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                          gewaehlt === v.name ? "bg-brand-50" : "hover:bg-paper-100"
                        }`}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-200 text-[13px] font-semibold text-ink-600">
                          {v.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`truncate text-[14px] ${gewaehlt === v.name ? "font-semibold text-brand-700" : "text-ink-900"}`}>
                              {v.name}
                            </span>
                            {v.ungelesen > 0 ? (
                              <span className="shrink-0 rounded-full bg-danger-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                                {v.ungelesen}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-ink-400">
                            {letzte ? `${letzte.von === "buero" ? "Du: " : ""}${letzte.text}` : "Noch keine Nachricht"}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Verlauf */}
          <div className="flex min-h-[60vh] flex-col rounded-2xl border border-paper-200 bg-white">
            {!aktiv ? (
              <div className="grid flex-1 place-items-center p-8 text-[14px] text-ink-400">
                Links einen Mitarbeiter wählen.
              </div>
            ) : (
              <>
                <div className="border-b border-paper-200 px-5 py-3">
                  <p className="text-[15px] font-semibold">{aktiv.name}</p>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4" style={{ maxHeight: "58vh" }}>
                  {aktiv.nachrichten.length === 0 ? (
                    <p className="text-[14px] text-ink-400">Noch keine Nachrichten. Schreib die erste.</p>
                  ) : (
                    aktiv.nachrichten.map((n, i) => {
                      const vorher = aktiv.nachrichten[i - 1];
                      const neuerTag = !vorher || tagestrenner(vorher.zeit) !== tagestrenner(n.zeit);
                      return (
                        <div key={n.id || i}>
                          {neuerTag ? (
                            <p className="my-3 text-center text-[12px] text-ink-300">{tagestrenner(n.zeit)}</p>
                          ) : null}
                          <div className={`flex ${n.von === "buero" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                                n.von === "buero"
                                  ? "bg-brand-600 text-white"
                                  : "bg-paper-100 text-ink-900"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{n.text}</p>
                              <p className={`mt-0.5 text-right text-[11px] ${n.von === "buero" ? "text-white/70" : "text-ink-300"}`}>
                                {uhrzeit(n.zeit)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={ende} />
                </div>

                <div className="flex items-end gap-2 border-t border-paper-200 p-3">
                  <textarea
                    value={eingabe}
                    onChange={(e) => setEingabe(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        senden();
                      }
                    }}
                    rows={1}
                    placeholder={`Nachricht an ${aktiv.name}…`}
                    className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-paper-200 bg-paper-100 px-3.5 py-2.5 text-[15px] outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={senden}
                    disabled={sendet || !eingabe.trim()}
                    className="h-[44px] shrink-0 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white disabled:opacity-50"
                  >
                    {sendet ? "…" : "Senden"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
