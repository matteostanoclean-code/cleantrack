# Mitarbeiterordner

Hier entsteht je Person ein Ordner. **Der Inhalt wird nicht eingecheckt** — er
enthält Namen, Anschriften, Löhne und Bankdaten. `.gitignore` lässt nur diese
Beschreibung durch.

## Aufbau

```
mitarbeiter/
└── musterfrau-maria/
    ├── 00-checkliste.md            ← was noch zu tun ist, mit Fristen
    ├── 01-arbeitsvertrag.md
    ├── 02-personalfragebogen.md
    ├── …                           ← alles Weitere aus vorlagen/einstellung/
    ├── daten.json                  ← die Werte, mit denen gefüllt wurde
    ├── laufend/                    ← Abmahnungen, Vermerke, Bescheinigungen
    ├── aenderungen/                ← Nachträge zum Vertrag, Lohnanpassungen
    ├── gesundheit/                 ← getrennt halten: AU, BEM, Schwerbehinderung
    └── austritt/                   ← Kündigung, Zeugnis, Rückgabeprotokoll
```

Die Nummern vorn halten die Reihenfolge stabil, in der die Blätter auf den
Tisch kommen: Vertrag zuerst, dann die Erklärungen, zuletzt die Quittungen.

`daten.json` bleibt liegen. Wer später eine Lohnanpassung oder ein Zeugnis
braucht, füllt daraus, statt alles neu zu tippen.

## Warum getrennt von der App

Die App führt die Stammdaten — Anschrift, Stunden, Lohn. Dieser Ordner führt
die **Papiere**: was unterschrieben wurde, wann, von wem. Beides hat einen
eigenen Zweck, und keins ersetzt das andere. Ändert sich etwas am Vertrag,
gehört es an beide Stellen: als Nachtrag hierher, als Feld in die App.
