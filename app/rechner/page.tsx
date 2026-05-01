"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Bereich =
  | "Unterhaltsreinigung"
  | "Grundreinigung"
  | "Bauendreinigung"
  | "Containerreinigung"
  | "Glasreinigung";

type Raum = {
  id: number;
  name: string;
  gruppe: string;
  flaeche: number;
  einsaetze: number;
  leistung: number;
};

const bereiche: Bereich[] = [
  "Unterhaltsreinigung",
  "Grundreinigung",
  "Bauendreinigung",
  "Containerreinigung",
  "Glasreinigung",
];

const raumgruppen = {
  Unterhaltsreinigung: [
    { label: "A – Büro- und Verwaltungsräume", leistung: 160 },
    { label: "TR – Treppenhaus", leistung: 180 },
    { label: "SN – Sanitärräume", leistung: 90 },
    { label: "FN – Flure / Verkehrswege", leistung: 250 },
    { label: "KG – Kindergarten", leistung: 140 },
    { label: "PR – Praxis / sensibler Bereich", leistung: 120 },
  ],
  Grundreinigung: [
    { label: "Hartboden Grundreinigung", leistung: 45 },
    { label: "Beschichtung entfernen", leistung: 25 },
    { label: "Maschinelle Bodenreinigung", leistung: 60 },
  ],
  Bauendreinigung: [
    { label: "Baufeinreinigung", leistung: 55 },
    { label: "Baugrobreinigung", leistung: 80 },
    { label: "Nachreinigung", leistung: 100 },
  ],
  Containerreinigung: [
    { label: "Bürocontainer", leistung: 120 },
    { label: "Sanitärcontainer", leistung: 70 },
    { label: "Aufenthaltscontainer", leistung: 100 },
  ],
  Glasreinigung: [
    { label: "Glas innen & außen", leistung: 25 },
    { label: "Rahmenreinigung", leistung: 18 },
    { label: "Schaufenster", leistung: 35 },
  ],
};

const euro = (wert: number) =>
  wert.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });

function einsatzText(wert: number) {
  if (wert === 0.5) return "alle 2 Wochen";
  if (wert === 1) return "1x pro Woche";
  if (wert === 2) return "2x pro Woche";
  if (wert === 3) return "3x pro Woche";
  if (wert === 4) return "4x pro Woche";
  if (wert === 5) return "täglich Mo–Fr";
  if (wert >= 6) return "täglich inkl. Wochenende";
  return `${wert}x pro Woche`;
}

function margeStatus(marge: number) {
  if (marge < 8) return { label: "Kritisch", text: "Kampfpreis", color: "text-red-400", bg: "bg-red-950/40", border: "border-red-900", dot: "bg-red-400" };
  if (marge < 15) return { label: "Niedrig", text: "Wettbewerbsdruck", color: "text-orange-400", bg: "bg-orange-950/40", border: "border-orange-900", dot: "bg-orange-400" };
  if (marge < 22) return { label: "Standard", text: "Gesunde Kalkulation", color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-900", dot: "bg-yellow-400" };
  if (marge < 30) return { label: "Gut", text: "Stabile Marge", color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-900", dot: "bg-emerald-400" };
  return { label: "Premium", text: "Sehr hohe Marge", color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-900", dot: "bg-emerald-400" };
}

export default function RechnerPage() {
  const [bereich, setBereich] = useState<Bereich>("Unterhaltsreinigung");

  const [stundenlohn, setStundenlohn] = useState(15);
  const [lohnnebenkosten, setLohnnebenkosten] = useState(22);
  const [produktivitaet, setProduktivitaet] = useState(85);
  const [gemeinkosten, setGemeinkosten] = useState(20);

  const [raeume, setRaeume] = useState<Raum[]>([
    {
      id: 1,
      name: "Bürofläche EG",
      gruppe: "A – Büro- und Verwaltungsräume",
      flaeche: 320,
      einsaetze: 1,
      leistung: 160,
    },
  ]);

  const [entfernung, setEntfernung] = useState(12);
  const [kilometerpreis, setKilometerpreis] = useState(0.3);
  const [fahrtzeitEinsatz, setFahrtzeitEinsatz] = useState(0.8);
  const [marge, setMarge] = useState(18);

  const [detailOffen, setDetailOffen] = useState(false);
  const [logistikOffen, setLogistikOffen] = useState(false);

  const aktiveGruppen = raumgruppen[bereich];

  const lohnkostenProStunde = stundenlohn * (1 + lohnnebenkosten / 100);
  const direkterLohnsatz = lohnkostenProStunde / (produktivitaet / 100);
  const selbstkostenProStunde = direkterLohnsatz * (1 + gemeinkosten / 100);

  const daten = useMemo(() => {
    const stundenMonat = raeume.reduce((sum, raum) => {
      const stundenProEinsatz = raum.flaeche / raum.leistung;
      const einsaetzeProMonat = (raum.einsaetze || 1) * 4.33;
      return sum + stundenProEinsatz * einsaetzeProMonat;
    }, 0);

    const maxEinsaetze = Math.max(...raeume.map((r) => r.einsaetze || 1), 0);
    const einsaetzeMonat = maxEinsaetze * 4.33;

    const sachkostenMonat = entfernung * 2 * einsaetzeMonat * kilometerpreis;
    const fahrzeitMonat = fahrtzeitEinsatz * einsaetzeMonat;
    const interneFahrtBewertung = fahrzeitMonat * selbstkostenProStunde;

    const produktiveObjektkosten = stundenMonat * selbstkostenProStunde;
    const kalkulationsbasis = produktiveObjektkosten + sachkostenMonat;
    const gewinn = kalkulationsbasis * (marge / 100);
    const angebotNetto = kalkulationsbasis + gewinn;

    const gesamtstunden = stundenMonat + fahrzeitMonat;
    const deckungsbeitrag = angebotNetto > 0 ? (gewinn / angebotNetto) * 100 : 0;
    const verrechnungssatz = stundenMonat > 0 ? angebotNetto / stundenMonat : 0;
    const gewinnProStunde = gesamtstunden > 0 ? gewinn / gesamtstunden : 0;
    const logistikAnteilPreis = angebotNetto > 0 ? (sachkostenMonat / angebotNetto) * 100 : 0;
    const logistikAnteilIntern =
      kalkulationsbasis > 0
        ? ((sachkostenMonat + interneFahrtBewertung) / kalkulationsbasis) * 100
        : 0;
    const fahrzeitbelastung =
      gesamtstunden > 0 ? (fahrzeitMonat / gesamtstunden) * 100 : 0;
    const produktivzeitAnteil =
      gesamtstunden > 0 ? (stundenMonat / gesamtstunden) * 100 : 0;
    const logistikProEinsatz =
      einsaetzeMonat > 0
        ? (sachkostenMonat + interneFahrtBewertung) / einsaetzeMonat
        : 0;

    return {
      stundenMonat,
      einsaetzeMonat,
      sachkostenMonat,
      fahrzeitMonat,
      interneFahrtBewertung,
      produktiveObjektkosten,
      kalkulationsbasis,
      gewinn,
      angebotNetto,
      gesamtstunden,
      deckungsbeitrag,
      verrechnungssatz,
      gewinnProStunde,
      logistikAnteilPreis,
      logistikAnteilIntern,
      fahrzeitbelastung,
      produktivzeitAnteil,
      logistikProEinsatz,
    };
  }, [raeume, entfernung, kilometerpreis, fahrtzeitEinsatz, marge, selbstkostenProStunde]);

  const status = margeStatus(marge);

  function wechselBereich(neuerBereich: Bereich) {
    const ersteGruppe = raumgruppen[neuerBereich][0];

    setBereich(neuerBereich);
    setRaeume([
      {
        id: 1,
        name: neuerBereich,
        gruppe: ersteGruppe.label,
        flaeche: 100,
        einsaetze: neuerBereich === "Unterhaltsreinigung" ? 1 : 0.25,
        leistung: ersteGruppe.leistung,
      },
    ]);
  }

  function updateRaum(id: number, feld: keyof Raum, wert: string | number) {
    setRaeume((prev) =>
      prev.map((raum) => {
        if (raum.id !== id) return raum;

        if (feld === "gruppe") {
          const gruppe = aktiveGruppen.find((g) => g.label === wert);
          return {
            ...raum,
            gruppe: String(wert),
            leistung: gruppe?.leistung || raum.leistung,
          };
        }

        return {
          ...raum,
          [feld]: wert,
        };
      })
    );
  }

  function addRaum() {
    const nextId = Math.max(...raeume.map((r) => r.id), 0) + 1;
    const ersteGruppe = aktiveGruppen[0];

    setRaeume([
      ...raeume,
      {
        id: nextId,
        name: `Raum ${nextId}`,
        gruppe: ersteGruppe.label,
        flaeche: 100,
        einsaetze: 1,
        leistung: ersteGruppe.leistung,
      },
    ]);
  }

  function removeRaum(id: number) {
    setRaeume((prev) => prev.filter((raum) => raum.id !== id));
  }

  return (
    <main className="min-h-screen bg-[#020817] text-white">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#081225] px-4 py-4 lg:hidden">
  <h1 className="text-xl font-bold">StanoClean</h1>
  <p className="text-sm text-slate-400">Reinigungs-Kalkulator</p>
</header>
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-800 bg-[#081225] lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <h1 className="text-2xl font-bold">StanoClean</h1>
            <p className="mt-1 text-sm text-slate-400">Pro</p>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            <Link href="/dashboard" className="block rounded-2xl px-4 py-3 text-slate-300 hover:bg-slate-800">
              Dashboard
            </Link>
            <Link href="/rechner" className="block rounded-2xl bg-blue-600/20 px-4 py-3 font-medium text-blue-300">
              Kalkulator
            </Link>
          </nav>
        </aside>

        <section className="flex-1 space-y-6 p-6 md:p-8">
          <div>
            <h1 className="text-4xl font-bold">Reinigungs-Kalkulator</h1>
            <p className="mt-2 text-slate-400">
              Kalkuliere Objektflächen, Leistungswerte, Logistik, Marge und Angebotspreis.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {bereiche.map((item) => (
              <button
                key={item}
                onClick={() => wechselBereich(item)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                  bereich === item
                    ? "border-blue-700 bg-blue-600/20 text-blue-300"
                    : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <Card title="👷 Kostenbasis" badge={`${selbstkostenProStunde.toFixed(2)} €/h`}>
            <p className="mb-6 text-sm text-slate-400">
              Lege deine echten Lohn- und Unternehmenskosten fest.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Stundenlohn (€)" value={stundenlohn} onChange={setStundenlohn} />
              <Input label="Lohnnebenkosten (%)" value={lohnnebenkosten} onChange={setLohnnebenkosten} />
              <Input label="Produktivität (%)" value={produktivitaet} onChange={setProduktivitaet} />
              <Input label="Gemeinkosten (%)" value={gemeinkosten} onChange={setGemeinkosten} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <Mini label="Stundenlohn" value={euro(stundenlohn)} />
              <Mini label="Lohnkosten/h" value={euro(lohnkostenProStunde)} />
              <Mini label="Direkter Lohnsatz" value={`${direkterLohnsatz.toFixed(2)} €/h`} blue />
              <Mini label="Selbstkosten/h" value={`${selbstkostenProStunde.toFixed(2)} €/h`} green />
            </div>
          </Card>

          <Card title={`🏢 ${bereich}`} badge={`${daten.stundenMonat.toFixed(1)} h/Mo`}>
            <p className="mb-6 text-sm text-slate-400">
              Berechne den Aufwand nach Fläche, Leistungswert und Einsätzen pro Woche.
            </p>

            <div className="space-y-4">
             {raeume.map((raum, index) => {
  const hProEinsatz = raum.flaeche / raum.leistung;
  const hProMonat = hProEinsatz * ((raum.einsaetze || 1) * 4.33);
  const kosten = hProMonat * selbstkostenProStunde;

  return (
    <div key={raum.id} className="rounded-3xl border border-slate-700 bg-slate-800/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Position {index + 1}
        </p>

        <button
  type="button"
  onPointerUp={(e) => {
    e.preventDefault();
    removeRaum(raum.id);
  }}
  className="rounded-xl border border-red-900 px-3 py-2 text-sm text-red-400 hover:bg-red-950"
>
  Entfernen
</button>
      </div>

      <input
        value={raum.name}
        onChange={(e) => updateRaum(raum.id, "name", e.target.value)}
        className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3"
      />

      <label className="mb-2 block text-sm text-slate-300">Leistungsgruppe</label>
      <select
        value={raum.gruppe}
        onChange={(e) => updateRaum(raum.id, "gruppe", e.target.value)}
        className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3"
      >
        {aktiveGruppen.map((gruppe) => (
          <option key={gruppe.label} value={gruppe.label}>
            {gruppe.label}
          </option>
        ))}
      </select>

      <div className="grid gap-4 md:grid-cols-3">
        <Input
          label="Fläche (m²)"
          value={raum.flaeche}
          onChange={(v) => updateRaum(raum.id, "flaeche", v)}
        />

        <div>
          <Input
            label="Einsätze pro Woche"
            value={raum.einsaetze || 1}
            onChange={(v) => updateRaum(raum.id, "einsaetze", v || 1)}
          />

          <p className="mt-1 text-xs text-slate-500">
            {einsatzText(raum.einsaetze || 1)}
          </p>
        </div>

        <Input
          label="m²/Std."
          value={raum.leistung}
          onChange={(v) => updateRaum(raum.id, "leistung", v)}
        />
      </div>

      <div className="mt-4 flex justify-between rounded-2xl border border-cyan-900 bg-cyan-950/40 px-4 py-3 text-sm">
        <span>{hProMonat.toFixed(1)} h/Mo</span>
        <span className="font-semibold text-cyan-300">
          {euro(kosten)} /Mo
        </span>
      </div>
    </div>
  );
})}

              <button
  type="button"
  onPointerUp={(e) => {
    e.preventDefault();
    addRaum();
  }}
  className="w-full rounded-2xl border border-dashed border-cyan-800 bg-cyan-950/20 px-4 py-4 text-cyan-300 hover:bg-cyan-950/40"
>
  + Position hinzufügen
</button>
            </div>
          </Card>

          <Card title="🚗 Logistik- und Zeitaufwand" badge={`${euro(daten.sachkostenMonat)} Sachkosten/Mo`}>
            <p className="mb-6 text-sm text-slate-400">
              Erfasse Entfernung und Fahrtkosten je Einsatz.
            </p>

            <div className="mb-6 rounded-2xl border border-yellow-900 bg-yellow-950/30 px-4 py-4">
              <div className="flex justify-between">
                <span className="font-medium">Einsätze pro Monat</span>
                <span className="text-2xl font-bold text-yellow-400">
                  {daten.einsaetzeMonat.toFixed(1)}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input label="Entfernung (km, einfach)" value={entfernung} onChange={setEntfernung} />
              <Input label="Kilometerpreis (€ / km)" value={kilometerpreis} onChange={setKilometerpreis} />
              <Input label="Fahrzeit / Einsatz (h)" value={fahrtzeitEinsatz} onChange={setFahrtzeitEinsatz} />
            </div>

            <div className="mt-6 rounded-3xl border border-yellow-900 bg-yellow-950/20 p-5">
              <h3 className="font-semibold">Einsatzmobilität</h3>
              <Row label="Fahrzeit / Einsatz" value={`${fahrtzeitEinsatz.toFixed(2)} h`} />
              <Row label="Fahrzeit gesamt / Monat" value={`${daten.fahrzeitMonat.toFixed(1)} h`} />
              <Row label="Kilometerkosten / Monat" value={euro(daten.sachkostenMonat)} />
              <Row label="Interne Bewertung" value={euro(daten.interneFahrtBewertung)} />
              <p className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-400">
                Dieser Wert ist nicht Bestandteil des Angebotspreises und dient nur der internen Effizienzanalyse.
              </p>
            </div>
          </Card>

          <Card title="💰 Preisgestaltung & Marge">
            <p className="mb-6 text-sm text-slate-400">
              Bestimme deinen Gewinnaufschlag und erhalte den fertigen Angebotspreis.
            </p>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-bold">💰 Gewinnmarge</h3>
                  <p className="mt-1 text-sm text-slate-400">Aufschlag auf Selbstkosten</p>
                </div>

                <div className={`min-w-36 rounded-2xl border px-5 py-3 text-right ${status.bg} ${status.border}`}>
                  <div className={`text-4xl font-bold leading-none ${status.color}`}>
                    {marge}%
                  </div>

                  <div className={`mt-2 flex items-center justify-end gap-2 text-sm font-semibold ${status.color}`}>
                    <span className={`h-3 w-3 rounded-full ${status.dot}`} />
                    <span>{status.label}</span>
                  </div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-5 gap-1">
                <div className="h-1 rounded-full bg-red-900" />
                <div className="h-1 rounded-full bg-orange-900" />
                <div className="h-1 rounded-full bg-yellow-500" />
                <div className="h-1 rounded-full bg-emerald-800" />
                <div className="h-1 rounded-full bg-emerald-500" />
              </div>

              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={marge}
                onChange={(e) => setMarge(Number(e.target.value))}
                className="w-full accent-white"
              />

              <div className="mt-2 grid grid-cols-5 text-xs text-slate-500">
                <span>0%</span>
                <span>8%</span>
                <span>15%</span>
                <span>22%</span>
                <span className="text-right">35%</span>
              </div>

              <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${status.bg} ${status.border} ${status.color}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${status.dot}`} />
                  {status.text}
                </div>
              </div>
            </div>
          </Card>

          <div className="rounded-3xl border border-emerald-900 bg-emerald-950/30 p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Angebotspreis netto / Monat
            </p>

            <p className="mt-4 text-6xl font-bold text-emerald-400">
              {euro(daten.angebotNetto)}
            </p>

            <p className="mt-3 text-slate-400">
              Kalkulationsbasis {euro(daten.kalkulationsbasis)} + {marge}% Marge
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <Mini label="Gewinn/Monat" value={euro(daten.gewinn)} green />
              <Mini label="Gewinn/Stunde" value={euro(daten.gewinnProStunde)} />
              <Mini label="Deckungsbeitrag" value={`${daten.deckungsbeitrag.toFixed(1)}%`} green />
              <Mini label="Verrechnungssatz" value={`${daten.verrechnungssatz.toFixed(2)} €/h`} />
            </div>
          </div>

          <button
            onClick={() => setDetailOffen(!detailOffen)}
            className="w-full rounded-2xl border border-emerald-900 bg-emerald-950/30 px-4 py-4 font-semibold text-emerald-300 hover:bg-emerald-950/50"
          >
            📋 Detailanalyse {detailOffen ? "▲" : "▼"}
          </button>

          {detailOffen && (
            <div className="rounded-3xl border border-emerald-900 bg-emerald-950/20 p-6">
              <h3 className="mb-5 text-sm font-bold uppercase tracking-widest text-slate-400">
                Kostenstruktur · Analyse
              </h3>

              <div className="grid gap-4 md:grid-cols-2">
                <AnalyseBox label="Angebotspreis/Mo" value={euro(daten.angebotNetto)} color="text-emerald-400" />
                <AnalyseBox label="Strukturanteil/Mo" value={euro(daten.gewinn)} color="text-emerald-400" />
                <AnalyseBox label="Effizienzrest/Stunde" value={`${(daten.gewinn / daten.stundenMonat).toFixed(2)} €/h`} color="text-violet-400" />
                <AnalyseBox label="Kostenverteilung" value={`${daten.deckungsbeitrag.toFixed(1)}%`} color="text-emerald-400" />
                <AnalyseBox label="Stundenverrechnungssatz" value={`${daten.verrechnungssatz.toFixed(2)} €/h`} color="text-yellow-400" />
                <AnalyseBox label="Gesamtstunden/Mo" value={`${daten.gesamtstunden.toFixed(1)} h`} color="text-white" />
              </div>

              <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <h3 className="mb-5 text-sm font-bold uppercase tracking-widest text-slate-400">
                  Operative Sicht · Angebotspreis
                </h3>

                <DetailRow
                  label={`Produktive Objektzeit (${daten.stundenMonat.toFixed(1)} h × ${selbstkostenProStunde.toFixed(2)} €/h)`}
                  value={euro(daten.produktiveObjektkosten)}
                  color="text-violet-400"
                />

                <DetailRow
                  label={`km-Sachkosten Logistik (${daten.einsaetzeMonat.toFixed(1)} Einsätze/Mo)`}
                  value={euro(daten.sachkostenMonat)}
                  color="text-yellow-400"
                />

                <DetailRow label="Kalkulationsbasis gesamt" value={euro(daten.kalkulationsbasis)} color="text-red-400" bold />

                <DetailRow
                  label="Einsatzmobilität · intern bewertet (nicht im Preis)"
                  value={euro(daten.interneFahrtBewertung)}
                  color="text-slate-500"
                />

                <DetailRow label={`+ ${marge}% Aufschlag`} value={euro(daten.gewinn)} color="text-emerald-400" />
                <DetailRow label="Angebotspreis gesamt" value={euro(daten.angebotNetto)} color="text-emerald-400" bold />
              </div>
            </div>
          )}

          <button
            onClick={() => setLogistikOffen(!logistikOffen)}
            className="w-full rounded-2xl border border-yellow-900 bg-yellow-950/30 px-4 py-4 font-semibold text-yellow-300 hover:bg-yellow-950/50"
          >
            🚗 Logistik-Wirtschaftlichkeit {logistikOffen ? "▲" : "▼"}
          </button>

          {logistikOffen && (
            <div className="rounded-3xl border border-yellow-900 bg-yellow-950/20 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">🟡 Wirtschaftlichkeitsanalyse · Logistik</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Kontextbasierte Bewertung der Fahrt- und Logistikkosten.
                  </p>
                </div>

                <span className="rounded-xl border border-yellow-800 bg-yellow-950/40 px-3 py-2 text-sm font-bold text-yellow-400">
                  {daten.logistikAnteilIntern > 30 ? "Erhöht" : "Stabil"}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <AnalyseBox label="Logistikanteil intern" value={`${daten.logistikAnteilIntern.toFixed(1)}%`} color="text-yellow-400" />
                <AnalyseBox label="km-Anteil am Preis" value={`${daten.logistikAnteilPreis.toFixed(1)}%`} color="text-yellow-400" />
                <AnalyseBox label="Fahrzeitbelastung" value={`${daten.fahrzeitbelastung.toFixed(1)}%`} color="text-orange-400" />
              </div>

              <div className="mt-6 rounded-2xl bg-slate-950/50 p-5 text-sm text-slate-300">
                Der Logistikanteil zeigt, wie stark Fahrtzeit und Kilometerkosten die Wirtschaftlichkeit belasten.
                Eine Tourenbündelung mit weiteren Objekten auf gleicher Route kann die Kosten je Objekt senken.
              </div>

              <div className="mt-6">
                <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-slate-400">
                  Kostenstruktur · Angebotspreis
                </h3>

                <div className="flex h-4 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="bg-violet-400"
                    style={{ width: `${Math.min(daten.produktivzeitAnteil, 100)}%` }}
                  />
                  <div
                    className="bg-yellow-400"
                    style={{ width: `${Math.min(daten.logistikAnteilPreis, 100)}%` }}
                  />
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${Math.min(daten.deckungsbeitrag, 100)}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="text-violet-300">Produktivzeit {daten.produktivzeitAnteil.toFixed(1)}%</span>
                  <span className="text-yellow-300">km-Sachkosten {daten.logistikAnteilPreis.toFixed(1)}%</span>
                  <span className="text-emerald-300">Gewinn {daten.deckungsbeitrag.toFixed(1)}%</span>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
                <h3 className="mb-5 text-sm font-bold uppercase tracking-widest text-slate-400">
                  Kontextbezogene Verhältnisse
                </h3>

                <DetailRow
                  label="Logistik ÷ Produktivzeit"
                  value={`${((daten.sachkostenMonat + daten.interneFahrtBewertung) / daten.produktiveObjektkosten * 100).toFixed(1)}%`}
                  color="text-yellow-400"
                />

                <DetailRow
                  label="Produktivstunden ÷ Gesamtstunden"
                  value={`${daten.produktivzeitAnteil.toFixed(1)}%`}
                  color="text-violet-400"
                />

                <DetailRow
                  label="Logistikkosten je Einsatz intern"
                  value={euro(daten.logistikProEinsatz)}
                  color="text-yellow-400"
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        {badge && <span className="rounded-xl bg-slate-800 px-3 py-1 text-sm text-slate-300">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  function handleChange(raw: string) {
    const cleaned = raw.replace(",", ".");
    const number = Number(cleaned);

    if (cleaned === "") {
      onChange(0);
      return;
    }

    if (!Number.isNaN(number)) {
      onChange(number);
    }
  }

  return (
    <div>
      <label className="mb-2 block text-sm text-slate-300">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={String(value ?? "")}
        onChange={(e) => handleChange(e.target.value)}
        onInput={(e) => handleChange(e.currentTarget.value)}
        className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-4 text-base outline-none focus:border-blue-500"
      />
    </div>
  );
}

function Mini({ label, value, blue, green }: { label: string; value: string; blue?: boolean; green?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${green ? "border-emerald-900 bg-emerald-950/30" : "border-slate-800 bg-slate-800/50"}`}>
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-bold ${green ? "text-emerald-400" : blue ? "text-cyan-400" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 flex justify-between border-b border-slate-700 pb-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function AnalyseBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-slate-950/50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function DetailRow({ label, value, color, bold = false }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex justify-between border-b border-slate-800 py-4 text-sm last:border-b-0">
      <span className={bold ? "font-bold text-white" : "text-slate-300"}>{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}