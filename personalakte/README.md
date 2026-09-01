# Personalakte

Zwei Ordner, mehr nicht:

```
personalakte/
├── vorlagen/      ← die Endfassung jedes Dokuments, ohne Namen, ohne Lohn, ohne Datum
├── mitarbeiter/   ← je Person ein Ordner mit den ausgefüllten Dokumenten
└── werkzeug/      ← füllt die Vorlagen mit den Daten einer Person
```

## Die Regel für `vorlagen/`

**Immer nur die Endfassung. Nie eine zweite Ausgabe daneben.**

Ein Dokument, eine Datei. Wird ein Vertrag überarbeitet, wird die vorhandene
Datei geändert — es entsteht kein `arbeitsvertrag-neu-final-2.md`. Die alten
Fassungen liegen in der Git-Historie und lassen sich jederzeit ansehen
(`git log -p personalakte/vorlagen/einstellung/arbeitsvertrag.md`). Damit gibt es
zu jeder Frage genau eine Antwort, und niemand unterschreibt versehentlich eine
Fassung von vorletztem Jahr.

In den Vorlagen steht **kein** Name, **kein** Lohn, **kein** Datum, keine
Anschrift. Überall dort, wo das hingehört, steht ein Platzhalter in doppelten
geschweiften Klammern, zum Beispiel `{{VORNAME}}` oder `{{STUNDENLOHN}}`.
Welche Platzhalter es gibt und woher ihr Wert kommt, steht in
[`vorlagen/platzhalter.md`](vorlagen/platzhalter.md).

## Die Regel für `mitarbeiter/`

Diese Ordner enthalten echte Personendaten und gehören deshalb **nicht** ins
Git-Repository. Sie sind in `.gitignore` ausgenommen: was dort entsteht, bleibt
auf dem Rechner beziehungsweise im gesicherten Ablageort der Firma. Eingecheckt
wird nur die leere Struktur.

Aufbau eines Personenordners: siehe [`mitarbeiter/README.md`](mitarbeiter/README.md).

## Der Ablauf bei einer Neueinstellung

Ein Satz genügt:

> „Lege die Personalakte für Maria Musterfrau an, Minijob, Start 01.10., 12 €
> die Stunde, 10 Stunden die Woche."

Was dann passiert:

1. Fehlende Angaben werden abgefragt — und nur die fehlenden.
2. Aus `vorlagen/einstellung/` wird jedes Dokument mit diesen Daten gefüllt.
3. Alles landet in `mitarbeiter/nachname-vorname/`.
4. Obendrauf liegt `00-checkliste.md`: was zu drucken, zu unterschreiben, ans
   Lohnbüro zu schicken und wieder abzuheften ist — mit Fristen.

Von Hand geht dasselbe:

```bash
node personalakte/werkzeug/anlegen.mjs personalakte/werkzeug/beispiel-daten.json
```

Einzelne Vorlage später nachziehen, etwa eine Lohnanpassung:

```bash
node personalakte/werkzeug/anlegen.mjs daten.json --vorlage aenderung/lohnanpassung.md
```

Das Werkzeug meldet am Ende jeden Platzhalter, der offen geblieben ist. Kein
Dokument geht mit einem `{{...}}` in den Druck.

## Was es an Dokumenten geben kann

Die Auflistung ist der eigentliche Plan hinter diesem Ordner. Angehakt ist, was
als Vorlage bereits liegt; der Rest ist die Liste, aus der man weiterbaut.

### Einstellung — läuft beim Anlegen der Akte automatisch mit

| Dokument | Datei | Zweck |
|---|---|---|
| ✅ Arbeitsvertrag | `einstellung/arbeitsvertrag.md` | Der Vertrag selbst, mit allen Punkten, die das Nachweisgesetz verlangt |
| ✅ Personalfragebogen | `einstellung/personalfragebogen.md` | Steuer-ID, Sozialversicherungsnummer, Krankenkasse, IBAN — alles, was das Lohnbüro braucht |
| ✅ Checkliste Unterlagen | `einstellung/checkliste-einstellung.md` | Ausweis, Arbeitserlaubnis, SV-Ausweis, Bescheinigungen — was vor dem ersten Tag da sein muss |
| ✅ Datenschutzinformation | `einstellung/datenschutz-information.md` | Pflichtinformation nach Art. 13 DSGVO für Beschäftigte |
| ✅ Einwilligung App und Standort | `einstellung/einwilligung-app-standort.md` | Die Stempeluhr prüft den Standort — das braucht eine eigene, freiwillige Erklärung |
| ✅ Verschwiegenheit | `einstellung/verschwiegenheit.md` | Kundenobjekte, Schlüssel, was in fremden Räumen gesehen wird |
| ✅ Sicherheitsunterweisung | `einstellung/sicherheitsunterweisung.md` | Erstunterweisung mit Gefahrstoffen und Hautschutz, vor dem ersten Einsatz |
| ✅ Empfang Arbeitskleidung und PSA | `einstellung/empfang-arbeitskleidung.md` | Was ausgegeben wurde, Rückgabe bei Austritt |
| ✅ Empfang Arbeitsmittel | `einstellung/empfang-arbeitsmittel.md` | Geräte, Handy, App-Zugang |
| ✅ Schlüsselquittung | `einstellung/schluesselquittung.md` | Papierform zusätzlich zur Schlüsselverwaltung in der App |
| ✅ Hinweis Arbeitszeiterfassung | `einstellung/hinweis-arbeitszeit.md` | Gebäudereinigung fällt unter die sofortige Aufzeichnungspflicht |
| ⬜ Willkommensschreiben | — | Erster Tag, Treffpunkt, Ansprechpartner, was mitzubringen ist |
| ⬜ Vermerk Ausweiskopie | — | Wer wann welchen Ausweis geprüft hat (Prüfpflicht bei ausländischen Beschäftigten) |
| ⬜ Fahrerlaubniskontrolle | — | Nur nötig, sobald jemand ein Firmenfahrzeug fährt |
| ⬜ Nebentätigkeit | — | Anzeige und Erlaubnis, besonders bei Minijobs neben einer Hauptbeschäftigung |

### Änderungen am Vertrag

| Dokument | Datei | Zweck |
|---|---|---|
| ✅ Änderungsvereinbarung | `aenderung/aenderungsvereinbarung.md` | Stunden, Tätigkeit, Einsatzort — beidseitig unterschrieben |
| ✅ Lohnanpassung | `aenderung/lohnanpassung.md` | Erhöhung mitteilen, auch bei Anhebung des Branchenmindestlohns |
| ✅ Verlängerung der Befristung | `aenderung/befristung-verlaengerung.md` | Muss vor dem Ablauftag unterschrieben sein, sonst wird der Vertrag unbefristet |
| ⬜ Versetzung / Objektwechsel | — | Wenn das Stammobjekt dauerhaft wechselt |
| ⬜ Aufstockung Minijob → Teilzeit | — | Sonderfall der Änderungsvereinbarung, mit Hinweis auf die Sozialversicherung |
| ⬜ Elternzeit: Antrag und Bestätigung | — | Antrag sieben Wochen vorher, schriftlich |
| ⬜ Ruhen des Arbeitsverhältnisses | — | Unbezahlte Freistellung |

### Laufendes Arbeitsverhältnis

| Dokument | Datei | Zweck |
|---|---|---|
| ✅ Abmahnung | `laufend/abmahnung.md` | Mit Vorstufe Ermahnung im selben Blatt |
| ✅ Aktenvermerk Personalgespräch | `laufend/aktenvermerk-gespraech.md` | Was besprochen und vereinbart wurde, mit Termin zur Nachschau |
| ✅ Arbeitgeberbescheinigung | `laufend/arbeitgeberbescheinigung.md` | Für Bank, Amt, Vermieter, Kita |
| ✅ Jährliche Sicherheitsunterweisung | `laufend/jahresunterweisung.md` | Einmal im Jahr Pflicht, Nachweis mit Unterschrift |
| ✅ Einladung zum BEM | `laufend/bem-einladung.md` | Pflicht ab sechs Wochen Krankheit in zwölf Monaten |
| ⬜ Urlaubsantrag | — | Läuft bereits in der App, Papierform nur als Rückfallebene |
| ⬜ Überstunden- und Ausgleichsvereinbarung | — | Wenn Mehrarbeit nicht ausgezahlt, sondern abgefeiert wird |
| ⬜ Zwischenzeugnis | — | Gleicher Aufbau wie das Endzeugnis, andere Zeitform |
| ⬜ Mitarbeitergespräch / Beurteilung | — | Einmal jährlich, als Grundlage für Lohnanpassungen |
| ⬜ Belehrung bei häufigen Kurzerkrankungen | — | Vorstufe zum BEM |
| ⬜ Prämie / Sonderzahlung | — | Mit Freiwilligkeitsvorbehalt, sonst entsteht ein Anspruch |

### Austritt

| Dokument | Datei | Zweck |
|---|---|---|
| ✅ Kündigung durch die Firma | `austritt/kuendigung-arbeitgeber.md` | Ordentlich und in der Probezeit, mit Hinweisen zur Zustellung |
| ✅ Bestätigung der Eigenkündigung | `austritt/kuendigungsbestaetigung.md` | Empfang und Enddatum bestätigen |
| ✅ Aufhebungsvertrag | `austritt/aufhebungsvertrag.md` | Einvernehmliches Ende, mit Warnung zur Sperrzeit |
| ✅ Rückgabeprotokoll | `austritt/rueckgabeprotokoll.md` | Schlüssel, Kleidung, Geräte, Handy |
| ✅ Checkliste Austritt | `austritt/checkliste-austritt.md` | App-Zugang sperren, Einsatzplan räumen, Lohnbüro melden |
| ✅ Arbeitszeugnis | `austritt/arbeitszeugnis.md` | Qualifiziert, mit Bausteinen für die Bewertung |
| ⬜ Freistellung bis zum Austritt | — | Unter Anrechnung des Resturlaubs |
| ⬜ Nachvertragliche Verschwiegenheit | — | Nur bei Bedarf, gehört sonst schon in den Vertrag |

## Was rechtlich dazugehört, aber nicht in diesen Ordner

- **Sofortmeldung zur Sozialversicherung.** In der Gebäudereinigung muss jede
  Einstellung *vor* Arbeitsaufnahme elektronisch gemeldet werden. Das macht das
  Lohnbüro; in der Checkliste steht es als Termin.
- **Arbeitsbescheinigung für die Agentur für Arbeit** beim Austritt: läuft
  elektronisch über das Lohnprogramm.
- **Gesundheitsdaten** — Krankmeldungen, BEM-Unterlagen, Schwerbehinderung —
  gehören in einen getrennten, verschlossenen Teil der Akte, nicht zu den
  Verträgen.

## Aufbewahrung

Richtwerte, im Zweifel mit dem Steuerberater abstimmen:

| Unterlage | Dauer |
|---|---|
| Lohnunterlagen, Lohnkonto | 6 Jahre, als Buchungsbeleg 10 Jahre |
| Sozialversicherungsunterlagen | bis zur nächsten Betriebsprüfung, mindestens 5 Jahre |
| Arbeitszeitnachweise (Mindestlohngesetz) | 2 Jahre |
| Vertrag und Nachträge | bis 3 Jahre nach Ende des Arbeitsverhältnisses |
| Unterlagen abgelehnter Bewerber | löschen nach etwa 6 Monaten |

## Bevor die Vorlagen benutzt werden

Die Texte sind sorgfältig gebaut, aber sie sind keine Rechtsberatung. Vor dem
ersten Einsatz gehören **Arbeitsvertrag, Aufhebungsvertrag und Kündigung**
einmal über den Tisch eines Fachanwalts für Arbeitsrecht oder des
Arbeitgeberverbands. Danach ist die Fassung die Endfassung — und genau die
liegt hier.

Der Rahmen- und Lohntarifvertrag Gebäudereinigung ist allgemeinverbindlich. Der
Mindestlohn der Lohngruppe 1 ändert sich regelmäßig; die Firmendaten in
`werkzeug/firma.json` und die Lohnangaben im Vertrag gehören deshalb einmal im
Jahr auf den Prüfstand.
