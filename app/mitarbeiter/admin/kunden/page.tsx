"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseClient";
import { UiIcon, cx } from "@/components/ui";

/**
 * Kunden.
 *
 * Der Kunde ist, wer die Rechnung bekommt. Wo gearbeitet wird, steht am
 * Objekt. Bei den meisten hier ist das dieselbe Anschrift, deshalb kann beim
 * Anlegen gleich ein Objekt mitentstehen.
 */

type Row = Record<string, any>;

const TAGS = [
  "Unterhaltsreinigung",
  "Glasreinigung",
  "Treppenhausreinigung",
  "Gartenarbeiten",
  "Bauendreinigung",
  "Wohnungsreinigung"
];

const leererKunde: Row = {
  id: "",
  name: "",
  customer_number: "",
  status: "aktiv",
  contact_person: "",
  email: "",
  phone: "",
  mobile: "",
  street: "",
  postal_code: "",
  city: "",
  country: "DE Deutschland",
  address_addition: "",
  contract_start_date: "",
  contract_end_date: "",
  payment_terms: "",
  notes: "",
  objekt_anlegen: true,
  tags: [] as string[]
};

function clean(value: unknown) {
  return String(value ?? "").trim();
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

export default function KundenSeite() {
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);

  const [reiter, setReiter] = useState<"alle" | "aktiv" | "passiv">("aktiv");
  const [suche, setSuche] = useState("");

  const [blattOffen, setBlattOffen] = useState(false);
  const [form, setForm] = useState<Row>({ ...leererKunde });

  const load = useCallback(async (currentToken?: string) => {
    const t = currentToken || token;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const antwort = await fetch("/api/admin/kunden", { cache: "no-store", headers: { Authorization: `Bearer ${t}` } });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Kunden konnten nicht geladen werden.");
      setCustomers(ergebnis.customers || []);
      setSites(ergebnis.sites || []);
    } catch (ladeFehler) {
      setError(ladeFehler instanceof Error ? ladeFehler.message : "Kunden konnten nicht geladen werden.");
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

  function anzahlObjekte(kundeId: string) {
    return sites.filter((objekt) => clean(objekt.customer_id) === kundeId).length;
  }

  const gefiltert = useMemo(() => {
    const needle = suche.trim().toLowerCase();
    return customers.filter((kunde) => {
      const aktiv = clean(kunde.status).toLowerCase() !== "passiv" && kunde.active !== false;
      if (reiter === "aktiv" && !aktiv) return false;
      if (reiter === "passiv" && aktiv) return false;
      if (!needle) return true;
      return `${clean(kunde.name)} ${clean(kunde.customer_number)} ${clean(kunde.address)} ${clean(kunde.contact_person)} ${clean(kunde.email)}`.toLowerCase().includes(needle);
    });
  }, [customers, reiter, suche]);

  const zaehler = useMemo(() => ({
    alle: customers.length,
    aktiv: customers.filter((k) => clean(k.status).toLowerCase() !== "passiv" && k.active !== false).length,
    passiv: customers.filter((k) => clean(k.status).toLowerCase() === "passiv" || k.active === false).length
  }), [customers]);

  const ohneObjekt = useMemo(() => customers.filter((k) => anzahlObjekte(k.id) === 0).length, [customers, sites]);

  function neu() {
    setForm({ ...leererKunde });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
  }

  function bearbeiten(kunde: Row) {
    setForm({
      ...leererKunde,
      ...kunde,
      status: clean(kunde.status) || (kunde.active === false ? "passiv" : "aktiv"),
      contract_start_date: clean(kunde.contract_start_date).slice(0, 10),
      contract_end_date: clean(kunde.contract_end_date).slice(0, 10),
      objekt_anlegen: false,
      tags: []
    });
    setBlattOffen(true);
    setError(null);
    setMessage(null);
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
      const antwort = await fetch("/api/admin/kunden", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const ergebnis = await antwort.json();
      if (!antwort.ok || !ergebnis.ok) throw new Error(ergebnis.error || "Speichern fehlgeschlagen.");

      if (ergebnis.objektHinweis) setError(ergebnis.objektHinweis);
      else setMessage(
        form.id ? "Kunde gespeichert."
          : ergebnis.objekt ? `Kunde und Objekt angelegt, Kundennummer ${clean(ergebnis.item?.customer_number)}.`
            : `Kunde angelegt, Kundennummer ${clean(ergebnis.item?.customer_number)}.`
      );

      if (weitere) setForm({ ...leererKunde });
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
              <UiIcon name="user" className="h-5 w-5" />
            </span>
            <h1 className="text-[26px] font-bold">Kunden</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/mitarbeiter/admin/objekte" className="rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-ink-700">Objekte</a>
            <button onClick={neu} className="rounded-xl bg-brand-600 px-4 py-2.5 text-[14px] font-semibold text-white">+ Kunde erstellen</button>
          </div>
        </header>

        {error ? <p className="mt-4 rounded-xl bg-rose-100 px-4 py-3 text-[14px] text-rose-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-xl bg-success-100 px-4 py-3 text-[14px] text-success-700">{message}</p> : null}

        {ohneObjekt > 0 ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-800">
            {ohneObjekt} {ohneObjekt === 1 ? "Kunde hat" : "Kunden haben"} noch kein Objekt. Ohne Objekt kann dort niemand eingeplant werden und nicht gestempelt.
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

        <div className="mt-4 flex w-full max-w-[320px] items-center gap-2 rounded-xl border border-paper-200 bg-white px-3.5 py-2.5">
          <UiIcon name="search" className="h-4 w-4 shrink-0 text-ink-300" />
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name, Nummer, Anschrift" className="w-full border-0 bg-transparent p-0 text-[15px] outline-none placeholder:text-ink-300" />
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-paper-200 bg-white">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-paper-200 bg-paper-100/60 text-[12px] font-bold uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3">Name</th>
                <th className="px-3 py-3">Nummer</th>
                <th className="px-3 py-3">Ansprechpartner</th>
                <th className="px-3 py-3">Anschrift</th>
                <th className="px-3 py-3 text-center">Objekte</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((kunde) => {
                const aktiv = clean(kunde.status).toLowerCase() !== "passiv" && kunde.active !== false;
                const objekte = anzahlObjekte(kunde.id);
                return (
                  <tr key={kunde.id} onClick={() => bearbeiten(kunde)} className="cursor-pointer border-b border-paper-200 last:border-0 hover:bg-paper-100/60">
                    <td className="px-4 py-3 text-[15px] font-semibold text-ink-900">{clean(kunde.name) || "Ohne Namen"}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(kunde.customer_number) || "–"}</td>
                    <td className="px-3 py-3 text-[14px] text-ink-600">{clean(kunde.contact_person) || "–"}</td>
                    <td className="px-3 py-3">
                      {clean(kunde.city) ? <span className="block text-[12px] text-ink-400">{[clean(kunde.postal_code), clean(kunde.city)].filter(Boolean).join(" ")}</span> : null}
                      <span className="text-[14px] text-ink-700">{clean(kunde.street) || clean(kunde.address) || "–"}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {objekte ? (
                        <span className="text-[14px] font-semibold text-ink-800">{objekte}</span>
                      ) : (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[12px] font-semibold text-amber-800">keins</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cx("rounded-md px-2.5 py-1 text-[12px] font-bold", aktiv ? "bg-success-500 text-white" : "bg-paper-300 text-ink-600")}>
                        {aktiv ? "Aktiv" : "Passiv"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!gefiltert.length && !loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-[14px] text-ink-400">Kein Kunde in dieser Auswahl.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {blattOffen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 md:items-center md:p-6" onClick={() => setBlattOffen(false)}>
          <div className="flex max-h-[92dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-3xl bg-white md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-paper-200 px-5 py-4">
              <p className="text-[19px] font-bold">{form.id ? "Kunde ändern" : "Kunde erstellen"}</p>
              <button onClick={() => setBlattOffen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-paper-300 text-ink-600" aria-label="Schließen">
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Name" pflicht><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={feldClass} /></Feld>
                <Feld label="Kundennummer" hinweis={form.id ? undefined : "Wird vergeben, wenn leer."}>
                  <input value={form.customer_number} onChange={(e) => setForm({ ...form, customer_number: e.target.value })} className={feldClass} />
                </Feld>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Ansprechpartner"><input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className={feldClass} /></Feld>
                <Feld label="Status">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={feldClass}>
                    <option value="aktiv">Aktiv</option>
                    <option value="passiv">Passiv</option>
                  </select>
                </Feld>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="E-Mail"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={feldClass} /></Feld>
                <Feld label="Telefon"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={feldClass} /></Feld>
              </div>

              <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                <p className="mb-2 text-[13px] font-semibold text-ink-700">Rechnungsanschrift</p>
                <div className="space-y-3">
                  <Feld label="Straße und Hausnummer"><input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className={feldClass} /></Feld>
                  <div className="grid grid-cols-2 gap-3">
                    <Feld label="Postleitzahl"><input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className={feldClass} /></Feld>
                    <Feld label="Stadt"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={feldClass} /></Feld>
                  </div>
                  <Feld label="Adresszusatz"><input value={form.address_addition} onChange={(e) => setForm({ ...form, address_addition: e.target.value })} className={feldClass} /></Feld>
                </div>
              </div>

              {/*
                Objekt gleich mitanlegen. Bei den meisten Kunden hier ist die
                Rechnungsanschrift auch der Ort, an dem gearbeitet wird. Ohne
                Objekt kann niemand eingeplant werden und nicht gestempelt.
              */}
              {!form.id ? (
                <div className="rounded-2xl border border-brand-500/30 bg-brand-50 p-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={form.objekt_anlegen !== false} onChange={(e) => setForm({ ...form, objekt_anlegen: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
                    <span>
                      <span className="block text-[14px] font-semibold text-ink-800">Objekt mit dieser Anschrift anlegen</span>
                      <span className="block text-[13px] text-ink-500">Der Standort wird dabei automatisch gesucht. Wird woanders gearbeitet, den Haken weglassen und das Objekt getrennt anlegen.</span>
                    </span>
                  </label>

                  {form.objekt_anlegen !== false ? (
                    <div className="mt-3">
                      <p className="mb-2 text-[13px] text-ink-500">Was dort gemacht wird</p>
                      <div className="flex flex-wrap gap-2">
                        {TAGS.map((tag) => {
                          const gesetzt = Array.isArray(form.tags) && form.tags.includes(tag);
                          return (
                            <button key={tag} type="button" onClick={() => tagUmschalten(tag)} className={cx("rounded-full border px-3 py-1.5 text-[13px]", gesetzt ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600")}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-paper-200 bg-paper-100/70 p-3">
                  <p className="text-[13px] font-semibold text-ink-700">Objekte</p>
                  <p className="mt-1 text-[14px] text-ink-600">
                    {anzahlObjekte(form.id) ? `${anzahlObjekte(form.id)} Objekt${anzahlObjekte(form.id) === 1 ? "" : "e"} hinterlegt.` : "Noch kein Objekt hinterlegt."}
                  </p>
                  <a href="/mitarbeiter/admin/objekte" className="mt-2 inline-block rounded-xl border border-brand-500/40 bg-brand-50 px-4 py-2 text-[13px] font-semibold text-brand-700">Zu den Objekten</a>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Feld label="Vertrag ab"><input type="date" value={form.contract_start_date} onChange={(e) => setForm({ ...form, contract_start_date: e.target.value })} className={feldClass} /></Feld>
                <Feld label="Vertrag bis" hinweis="Leer bei unbefristet."><input type="date" value={form.contract_end_date} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })} className={feldClass} /></Feld>
              </div>

              <Feld label="Zahlungsziel"><input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="z. B. 14 Tage netto" className={feldClass} /></Feld>
              <Feld label="Notiz"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={feldClass} /></Feld>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-paper-200 px-5 py-3">
              <span className="flex-1" />
              {!form.id ? (
                <button onClick={() => speichern(true)} disabled={saving} className="rounded-xl border border-paper-300 px-4 py-2.5 text-[14px] font-semibold text-ink-700 disabled:opacity-50">Weiteren erstellen</button>
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
