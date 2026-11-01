"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Objekte: wo gearbeitet wird.
 *
 * Ein Objekt ist der Ort, nicht der Kunde. Am Objekt hängt alles Weitere:
 * Einsätze, Geräte, Schlüssel, Material, NFC-Aufkleber und der Radius fürs
 * Stempeln. Deshalb steht es hier eigenständig und nicht als Reiter irgendwo.
 */

type Row = Record<string, any>;

/**
 * Die Leistungen kommen aus den Einstellungen (Auftragsarten). Diese Liste
 * hier ist nur das Netz darunter, falls der Server keine liefert — sonst
 * stünde die Maske ohne Auswahl da.
 */
const TAGS_ERSATZ = [
  "Unterhaltsreinigung",
  "Glasreinigung",
  "Treppenhausreinigung",
  "Gartenarbeiten",
  "Bauendreinigung",
  "Wohnungsreinigung"
];

const leeresObjekt: Row = {
  id: "",
  name: "",
  object_number: "",
  customer_id: "",
  object_manager: "",
  status: "aktiv",
  street: "",
  postal_code: "",
  city: "",
  country: "DE Deutschland",
  address_addition: "",
  tags: [] as string[],
  allowed_radius_m: "150",
  monthly_flat_rate: "",
  hourly_rate: "",
  latitude: "",
  longitude: "",
  notes: ""
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function zahlText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(".", ",");
}

function euro(value: unknown) {
  const zahl = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(zahl) || zahl === 0) return "–";
  return zahl.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/** 2026-12-24 wird zu 24.12.2026. */
function datumText(wert: unknown) {
  const text = clean(wert).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "–";
  return `${text.slice(8, 10)}.${text.slice(5, 7)}.${text.slice(0, 4)}`;
}

function tagsVon(wert: unknown) {
  return clean(wert).split(",").map((teil) => teil.trim()).filter(Boolean);
}

const feldClass = "w-full rounded-xl border border-paper-200 bg-white px-4 py-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-200 focus:border-brand-500";

function Feld({ label, pflicht, hinweis, children }: { label: string; pflicht?: boolean; hinweis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-ink-500">{label}{pflicht ? <span className="text-danger-500"> *</span> : null}</span>
      <div className="mt-1.5">{children}</div>
      {hinweis ? <span className="mt-1 block text-[12px] text-ink-400">{hinweis}</span> : null}
    </label>
  );
}

export default function ObjekteSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [sites, setSites] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [tags, setTags] = useState<string[]>(TAGS_ERSATZ);

  const [reiter, setReiter] = useState<"alle" | "aktiv" | "passiv">("aktiv");
  const [suche, setSuche] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const [blattOffen, setBlattOffen] = useState(false);
  const [schliessungen, setSchliessungen] = useState<Row[]>([]);
  const [urlaub, setUrlaub] = useState<Row>({ von: "", bis: "", grund: "", faellt_aus: true });
  const [urlaubLaeuft, setUrlaubLaeuft] = useState(false);
  const [urlaubHinweis, setUrlaubHinweis] = useState<string | null>(null);
  const [offeneVorschlaege, setOffeneVorschlaege] = useState(0);
  const [standortLaeuft, setStandortLaeuft] = useState(false);
  const [standortHinweis, setStandortHinweis] = useState<string | null>(null);
  const [form, setForm] = useState<Row>({ ...leeresObjekt });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/objekte", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Objekte konnten nicht geladen werden.");
      setSites(ergebnis.sites || []);
      setCustomers(ergebnis.customers || []);
      setEmployees(ergebnis.employees || []);
      setDevices(ergebnis.devices || []);
      setKeys(ergebnis.keys || []);
      if (Array.isArray(ergebnis.tags) && ergebnis.tags.length) setTags(ergebnis.tags);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Objekte konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token || "";
      setToken(sessionToken);
      setAuthLoading(false);
      if (sessionToken) await load(sessionToken);
    }
    init();
  }, [load]);

  /**
   * Aus der Auswertung heraus soll ein Objekt sofort aufgehen: ?objekt=<id>.
   * Sonst schickt man jemanden mit "trag da mal den Stundensatz nach" in eine
   * Liste von achtundzwanzig und lässt ihn suchen.
   *
   * Bewusst über window.location statt useSearchParams — das verlangte sonst
   * eine Suspense-Grenze um die ganze Seite.
   */
  const [direktGeoeffnet, setDirektGeoeffnet] = useState(false);
  useEffect(() => {
    if (direktGeoeffnet || !sites.length) return;
    const gesucht = new URLSearchParams(window.location.search).get("objekt");
    if (!gesucht) return;
    setDirektGeoeffnet(true);
    const treffer = sites.find((objekt) => clean(objekt.id) === gesucht);
    if (treffer) bearbeiten(treffer);
  }, [sites, direktGeoeffnet]);

  /**
   * Koordinaten vom Gerät übernehmen.
   *
   * Geschrieben wird nichts von allein — die Werte landen in den Feldern, und
   * gespeichert wird erst beim Speichern. Ein Knopf, der still den Standort
   * eines Objekts überschreibt, wäre zu leicht aus Versehen getroffen.
   *
   * Die Genauigkeit wird mitgesagt: Zeigt das Gerät 2000 Meter Unsicherheit,
   * ist der Punkt nichts wert, und das soll man sehen, bevor man speichert.
   */
  async function standortUebernehmen() {
    if (!navigator.geolocation) {
      setStandortHinweis("Dieses Gerät gibt keinen Standort her.");
      return;
    }
    setStandortLaeuft(true);
    setStandortHinweis(null);
    try {
      const position = await new Promise<GeolocationPosition>((erfolg, fehler) => {
        navigator.geolocation.getCurrentPosition(erfolg, fehler, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      const breite = Number(position.coords.latitude.toFixed(7));
      const laenge = Number(position.coords.longitude.toFixed(7));
      const genauigkeit = Math.round(position.coords.accuracy || 0);

      setForm((alt: Row) => ({ ...alt, latitude: String(breite), longitude: String(laenge) }));
      setStandortHinweis(
        genauigkeit > 50
          ? `Übernommen, aber das Gerät ist sich nur auf ${genauigkeit} m sicher. Draußen und mit ein paar Sekunden Wartezeit wird es genauer.`
          : `Übernommen, auf ${genauigkeit} m genau. Zum Speichern unten auf Speichern.`
      );
    } catch (fehler) {
      const code = (fehler as GeolocationPositionError)?.code;
      setStandortHinweis(
        code === 1
          ? "Der Standort ist für diese Seite nicht freigegeben. In den Browser-Einstellungen erlauben und noch einmal tippen."
          : code === 3
          ? "Das hat zu lange gedauert. Draußen noch einmal versuchen."
          : "Der Standort konnte nicht gelesen werden."
      );
    } finally {
      setStandortLaeuft(false);
    }
  }

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return sites.filter((objekt) => {
      const aktiv = clean(objekt.status).toLowerCase() !== "passiv" && objekt.active !== false;
      if (reiter === "aktiv" && !aktiv) return false;
      if (reiter === "passiv" && aktiv) return false;
      if (tagFilter && !tagsVon(objekt.tags).includes(tagFilter)) return false;
      if (!needle) return true;
      return `${clean(objekt.name)} ${clean(objekt.address)} ${clean(objekt.customer_name)} ${clean(objekt.object_number)} ${clean(objekt.tags)}`.toLowerCase().includes(needle);
    });
  }, [sites, reiter, suche, tagFilter]);

  const zaehler = useMemo(() => ({
    alle: sites.length,
    aktiv: sites.filter((o) => clean(o.status).toLowerCase() !== "passiv" && o.active !== false).length,
    passiv: sites.filter((o) => clean(o.status).toLowerCase() === "passiv" || o.active === false).length
  }), [sites]);

  const ohneStandort = useMemo(() => sites.filter((o) => o.latitude === null || o.longitude === null).length, [sites]);

  function anzahlGeraete(objektId: string) {
    return devices.filter((geraet) => clean(geraet.work_site_id) === objektId).length;
  }
  function anzahlSchluessel(objektId: string) {
    return keys.filter((schluessel) => clean(schluessel.work_site_id) === objektId).length;
  }

  function neu() {
    setForm({ ...leeresObjekt });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
    setSchliessungen([]);
    setUrlaub({ von: "", bis: "", grund: "", faellt_aus: true });
    setUrlaubHinweis(null);
  }

  function bearbeiten(objekt: Row) {
    setForm({
      ...leeresObjekt,
      ...objekt,
      object_number: String(objekt.object_number ?? ""),
      status: clean(objekt.status) || (objekt.active === false ? "passiv" : "aktiv"),
      tags: tagsVon(objekt.tags),
      allowed_radius_m: String(objekt.allowed_radius_m ?? "150"),
      monthly_flat_rate: zahlText(objekt.monthly_flat_rate),
      hourly_rate: zahlText(objekt.hourly_rate),
      latitude: objekt.latitude ?? "",
      longitude: objekt.longitude ?? "",
      customer_id: clean(objekt.customer_id)
    });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
    schliessungenLaden(clean(objekt.id));
  }

  /**
   * Wann der Kunde zumacht.
   *
   * Steht hier am Objekt, weil es hier auffällt: Wer die Objektmaske offen
   * hat, weiß gerade, dass die Praxis zwei Wochen zu hat. Der Urlaubsplaner
   * zeigt dieselben Zeiträume und kann sie für alle Objekte eines Kunden auf
   * einmal setzen — hier geht es immer nur um dieses eine.
   */
  async function schliessungenLaden(objektId: string) {
    setSchliessungen([]);
    if (!objektId || !token) return;
    try {
      const antwort = await fetch(`/api/admin/urlaubsplaner?objekt=${encodeURIComponent(objektId)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const ergebnis = await antwort.json();
      if (ergebnis.ok) setSchliessungen(ergebnis.schliessungen || []);
      else setUrlaubHinweis(ergebnis.error || null);
      // Ein Vorschlag aus einer Kundenantwort ist noch kein Zeitraum. Er
      // wird hier genannt, entschieden wird im Urlaubsplaner.
      const offen = ((ergebnis.schliessungen || []) as Row[]).filter((zeile) => zeile.bestaetigt === false).length;
      setOffeneVorschlaege(offen);
    } catch {
      setUrlaubHinweis("Die Schließzeiten konnten nicht geladen werden.");
    }
  }

  async function schliessungAnlegen() {
    if (!clean(form.id) || !clean(urlaub.von)) return;
    setUrlaubLaeuft(true);
    setUrlaubHinweis(null);
    try {
      const antwort = await fetch("/api/admin/urlaubsplaner", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          work_site_id: clean(form.id),
          von: urlaub.von,
          bis: clean(urlaub.bis) || urlaub.von,
          grund: clean(urlaub.grund),
          faellt_aus: urlaub.faellt_aus !== false
        })
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Konnte nicht gespeichert werden.");
      setUrlaub({ von: "", bis: "", grund: "", faellt_aus: true });
      await schliessungenLaden(clean(form.id));
    } catch (fehler) {
      setUrlaubHinweis(fehler instanceof Error ? fehler.message : "Konnte nicht gespeichert werden.");
    } finally {
      setUrlaubLaeuft(false);
    }
  }

  async function schliessungLoeschen(id: string) {
    setUrlaubLaeuft(true);
    try {
      await fetch("/api/admin/urlaubsplaner", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      });
      await schliessungenLaden(clean(form.id));
    } finally {
      setUrlaubLaeuft(false);
    }
  }

  /** Anschrift des Kunden übernehmen — das ist bei den meisten Objekten dieselbe. */
  function kundeGewaehlt(id: string) {
    const kunde = customers.find((row) => row.id === id);
    if (!kunde) { setForm({ ...form, customer_id: id }); return; }
    const leerAdresse = !clean(form.street) && !clean(form.postal_code) && !clean(form.city);
    setForm({
      ...form,
      customer_id: id,
      name: clean(form.name) || clean(kunde.name),
      street: leerAdresse ? clean(kunde.street) : form.street,
      postal_code: leerAdresse ? clean(kunde.postal_code) : form.postal_code,
      city: leerAdresse ? clean(kunde.city) : form.city
    });
  }

  function tagUmschalten(tag: string) {
    const aktuelle: string[] = Array.isArray(form.tags) ? form.tags : [];
    setForm({ ...form, tags: aktuelle.includes(tag) ? aktuelle.filter((t) => t !== tag) : [...aktuelle, tag] });
  }

  async function speichern(weitere = false) {
    if (!clean(form.name)) { setError("Bitte einen Namen eintragen."); return; }
    setSaving(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/objekte", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");

      if (ergebnis.hinweis) setError(ergebnis.hinweis);
      else setMessage(form.id ? "Objekt gespeichert." : `Objekt angelegt, Standort ${ergebnis.koordinatenGefunden ? "gefunden" : "offen"}.`);

      if (weitere) setForm({ ...leeresObjekt, customer_id: form.customer_id });
      else setBlattOffen(false);
      await load();
    } catch (fehler) {
      setError(fehler instanceof Error ? fehler.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Lade Anmeldung…</main>;
  if (!token) return <main className="grid min-h-[100dvh] place-items-center bg-paper-100 text-sm text-ink-400">Bitte zuerst im Adminbereich anmelden.</main>;

  return (
    <main className="min-h-[100dvh] bg-paper-100 text-ink-900">
      <div className="px-4 py-5 md:px-6 xl:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
              <UiIcon name="building" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Objekte</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/mitarbeiter/admin/nfc" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">NFC-Aufkleber</a>
            <button onClick={neu} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Objekt erstellen</button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        {ohneStandort > 0 ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
            {ohneStandort} {ohneStandort === 1 ? "Objekt hat" : "Objekte haben"} keinen Standort. Dort kann nicht gestempelt werden — Objekt öffnen und Anschrift prüfen.
          </p>
        ) : null}

        <div className="mt-4 flex gap-6 border-b border-paper-200">
          {([["alle", "Alle", zaehler.alle], ["aktiv", "Aktiv", zaehler.aktiv], ["passiv", "Passiv", zaehler.passiv]] as const).map(([wert, label, anzahl]) => (
            <button key={wert} onClick={() => setReiter(wert)} className={cx("relative -mb-px pb-3 text-[15px]", reiter === wert ? "font-semibold text-brand-700" : "text-ink-400")}>
              {label}{anzahl ? <span className="ml-1.5 text-[13px] text-ink-400">{anzahl}</span> : null}
              {reiter === wert ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex w-full max-w-[300px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
            <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Objekt, Kunde oder Anschrift" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
          </div>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-xl border border-paper-300 bg-white px-3.5 py-2.5 text-[14px] text-ink-700 outline-none">
            <option value="">Alle Leistungen</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[1040px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Objekt</th>
                <th className="px-3 py-3">Nr.</th>
                <th className="px-3 py-3">Objektleiter</th>
                <th className="px-3 py-3">Kunde</th>
                <th className="px-3 py-3">Leistungen</th>
                <th className="px-3 py-3 text-right">Abrechnung</th>
                <th className="px-3 py-3 text-center">Geräte</th>
                <th className="px-3 py-3 text-center">Schlüssel</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((objekt) => {
                const aktiv = clean(objekt.status).toLowerCase() !== "passiv" && objekt.active !== false;
                const ohneOrt = objekt.latitude === null || objekt.longitude === null;
                return (
                  <tr key={objekt.id} onClick={() => bearbeiten(objekt)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td className="px-4 py-3">
                      <span className="block text-[12px] text-ink-400">{clean(objekt.address) || "Keine Anschrift"}</span>
                      <span className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                        {clean(objekt.name) || "Ohne Namen"}
                        {ohneOrt ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">kein Standort</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(objekt.object_number) || "–"}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(objekt.object_manager) || "–"}</td>
                    <td className="px-3 py-3">
                      {clean(objekt.customer_number) ? <span className="block text-[12px] text-ink-400">{clean(objekt.customer_number)}</span> : null}
                      <span className="text-[14px] text-ink-600">{clean(objekt.customer_name) || "–"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex flex-wrap gap-1">
                        {tagsVon(objekt.tags).map((tag) => (
                          <span key={tag} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">{tag}</span>
                        ))}
                        {!tagsVon(objekt.tags).length ? <span className="text-[13px] text-ink-300">–</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-[14px] text-ink-600">
                      {Number(objekt.monthly_flat_rate) > 0 ? (
                        <span className="block font-semibold text-ink-800">{euro(objekt.monthly_flat_rate)} / Monat</span>
                      ) : null}
                      {Number(objekt.hourly_rate) > 0 ? (
                        <span className="block text-[13px]">{euro(objekt.hourly_rate)} / Std.</span>
                      ) : null}
                      {!Number(objekt.monthly_flat_rate) && !Number(objekt.hourly_rate) ? <span className="text-ink-300">–</span> : null}
                    </td>
                    <td className="px-3 py-3 text-center text-[14px] text-ink-600">{anzahlGeraete(objekt.id) || "–"}</td>
                    <td className="px-3 py-3 text-center text-[14px] text-ink-600">{anzahlSchluessel(objekt.id) || "–"}</td>
                    <td className="px-3 py-3">
                      <span className={cx("rounded-md px-2.5 py-1 text-[12px] font-bold", aktiv ? "bg-success-500 text-white" : "bg-paper-300 text-ink-600")}>
                        {aktiv ? "Aktiv" : "Passiv"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-[14px] text-ink-400">Kein Objekt in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">{form.id ? "Objekt ändern" : "Objekt erstellen"}</p>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Name" pflicht><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={feldClass} /></Feld>
                <Feld label="Nummer" hinweis={form.id ? undefined : "Wird vergeben, wenn leer."}>
                  <input inputMode="numeric" value={form.object_number} onChange={(e) => setForm({ ...form, object_number: e.target.value })} className={feldClass} />
                </Feld>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Kunde">
                  <select value={form.customer_id} onChange={(e) => kundeGewaehlt(e.target.value)} className={feldClass}>
                    <option value="">Ohne Kunde, eigenes Objekt</option>
                    {customers.map((kunde) => (
                      <option key={kunde.id} value={kunde.id}>{clean(kunde.customer_number) ? `${kunde.customer_number} · ` : ""}{clean(kunde.name)}</option>
                    ))}
                  </select>
                </Feld>
                <Feld label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={feldClass}>
                    <option value="aktiv">Aktiv</option>
                    <option value="passiv">Passiv</option>
                  </select>
                </Feld>
              </div>

              <Feld label="Objektleiter">
                <select value={form.object_manager} onChange={(e) => setForm({ ...form, object_manager: e.target.value })} className={feldClass}>
                  <option value="">Niemand</option>
                  {employees.map((person) => <option key={person.id} value={clean(person.name)}>{clean(person.name)}</option>)}
                </select>
              </Feld>

              <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                <p className="mb-2 text-[13px] font-semibold text-ink-700">Anschrift</p>
                <div className="space-y-3">
                  <Feld label="Straße und Hausnummer"><input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className={feldClass} /></Feld>
                  <div className="grid grid-cols-2 gap-3">
                    <Feld label="Postleitzahl"><input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Stadt"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={feldClass} /></Feld>
                  </div>
                  <Feld label="Adresszusatz"><input value={form.address_addition} onChange={(e) => setForm({ ...form, address_addition: e.target.value })} className={feldClass} /></Feld>
                  <p className="text-[12px] text-ink-400">
                    Der Standort wird beim Speichern aus der Anschrift geholt. Prüf ihn anschließend auf der Karte — 150 Meter Radius sind schnell daneben.
                  </p>
                  {form.id ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Feld label="Breite" hinweis="Nur ändern, wenn der Standort falsch sitzt.">
                          <input value={form.latitude ?? ""} onChange={(e) => setForm({ ...form, latitude: e.target.value })} className={feldClass} />
                        </Feld>
                        <Feld label="Länge">
                          <input value={form.longitude ?? ""} onChange={(e) => setForm({ ...form, longitude: e.target.value })} className={feldClass} />
                        </Feld>
                      </div>

                      {/*
                        Der Standort vom Handy, direkt am Objekt. Eine
                        Adresssuche trifft den Hinterhof, den Seiteneingang
                        oder den Sportplatz nicht — da hilft nur hingehen.
                      */}
                      <button type="button" onClick={standortUebernehmen} disabled={standortLaeuft} className="w-full rounded-xl border border-paper-300 bg-white px-4 py-3 text-[14px] font-semibold text-ink-700 disabled:opacity-50">
                        {standortLaeuft ? "Standort wird gelesen …" : "Standort von hier übernehmen"}
                      </button>
                      <p className="text-[12px] leading-relaxed text-ink-400">
                        Am Objekt stehen und antippen. Genauer als jede Adresssuche — und der Weg, falsche Koordinaten loszuwerden.
                      </p>
                      {standortHinweis ? <p className="text-[13px] text-ink-600">{standortHinweis}</p> : null}
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[13px] text-ink-500">Leistungen an diesem Objekt</p>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const gesetzt = Array.isArray(form.tags) && form.tags.includes(tag);
                    return (
                      <button key={tag} type="button" onClick={() => tagUmschalten(tag)} className={cx("rounded-full border px-3.5 py-2 text-[13px]", gesetzt ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 text-ink-600")}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px] text-ink-400">Die Auswahl kommt aus den Einstellungen, unter Auftragsarten.</p>
              </div>

              <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                <p className="mb-2 text-[13px] font-semibold text-ink-700">Abrechnung</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Feld label="Pauschale netto je Monat" hinweis="Leer heißt: nach Stunden.">
                    <input inputMode="decimal" value={form.monthly_flat_rate} onChange={(e) => setForm({ ...form, monthly_flat_rate: e.target.value })} placeholder="z. B. 450" className={feldClass} />
                  </Feld>
                  <Feld label="Stundensatz netto" hinweis="Gilt ohne Pauschale für alles, mit Pauschale für Stunden darüber.">
                    <input inputMode="decimal" value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} placeholder="z. B. 32,50" className={feldClass} />
                  </Feld>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Radius fürs Stempeln in Metern"><input inputMode="numeric" value={form.allowed_radius_m} onChange={(e) => setForm({ ...form, allowed_radius_m: e.target.value })} className={feldClass} /></Feld>
              </div>

              <Feld label="Notiz"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={feldClass} /></Feld>

              {/*
                Betriebsferien des Kunden. Erst wenn das Objekt steht, sonst
                gäbe es nichts, woran der Zeitraum hängt.
              */}
              {form.id ? (
                <div className="rounded-2xl border border-paper-200 p-4">
                  <p className="text-[15px] font-semibold text-ink-900">Kunde hat zu</p>
                  <p className="mt-0.5 text-[13px] text-ink-400">
                    Betriebsferien, Feiertagsschließung, Umbau. In dieser Zeit ist hier nichts zu tun — der Urlaubsplaner zeigt dann, wer dadurch frei wird.
                  </p>

                  {offeneVorschlaege ? (
                    <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-700">
                      {offeneVorschlaege === 1 ? "Ein Zeitraum aus einer Kundenantwort wartet" : `${offeneVorschlaege} Zeiträume aus Kundenantworten warten`} auf dich — im Urlaubsplaner.
                    </p>
                  ) : null}

                  {schliessungen.filter((zeile) => zeile.bestaetigt !== false).length ? (
                    <ul className="mt-3 space-y-2">
                      {schliessungen.filter((zeile) => zeile.bestaetigt !== false).map((zeile) => (
                        <li key={zeile.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper-100 px-3.5 py-2.5">
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold text-ink-800">
                              {datumText(zeile.von)} bis {datumText(zeile.bis)}
                            </span>
                            <span className="block truncate text-[12px] text-ink-500">
                              {clean(zeile.grund) || "ohne Grund"} · {zeile.faellt_aus === false ? "nur Hinweis, Einsätze bleiben" : "Reinigung fällt aus"}
                            </span>
                          </span>
                          <button type="button" onClick={() => schliessungLoeschen(clean(zeile.id))} disabled={urlaubLaeuft} className="shrink-0 text-[13px] font-semibold text-danger-600 disabled:opacity-40">
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-[13px] text-ink-400">Noch nichts eingetragen.</p>
                  )}

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Feld label="Von"><input type="date" value={urlaub.von} onChange={(e) => setUrlaub({ ...urlaub, von: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Bis" hinweis="Leer heißt: nur der eine Tag."><input type="date" value={urlaub.bis} onChange={(e) => setUrlaub({ ...urlaub, bis: e.target.value })} className={feldClass} /></Feld>
                  </div>
                  <div className="mt-3">
                    <Feld label="Grund"><input value={urlaub.grund} onChange={(e) => setUrlaub({ ...urlaub, grund: e.target.value })} placeholder="z. B. Betriebsferien" className={feldClass} /></Feld>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={urlaub.faellt_aus !== false} onChange={(e) => setUrlaub({ ...urlaub, faellt_aus: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
                    <span className="text-[13px] text-ink-600">Die Reinigung fällt in dieser Zeit aus. Ohne Haken bleibt sie stehen und es ist nur ein Hinweis.</span>
                  </label>

                  {urlaubHinweis ? <p className="mt-3 text-[13px] text-danger-600">{urlaubHinweis}</p> : null}

                  <button type="button" onClick={schliessungAnlegen} disabled={!clean(urlaub.von) || urlaubLaeuft} className="mt-3 rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-40">
                    {urlaubLaeuft ? "Einen Moment …" : "Zeitraum eintragen"}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weiteres erstellen</button>
              ) : null}
              <button onClick={() => speichern(false)} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
                {saving ? "Speichere…" : form.id ? "Speichern" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
