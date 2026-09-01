---
name: personalakte
description: Personalakte anlegen und pflegen — Mitarbeiterordner mit allen Einstellungsdokumenten erzeugen, Vorlagen füllen (Arbeitsvertrag, Änderungsvereinbarung, Abmahnung, Kündigung, Zeugnis), Vorlagen ändern. Auslöser sind Sätze wie „lege die Personalakte für … an", „neuer Mitarbeiter", „Vertrag für … erstellen", „Abmahnung schreiben", „Kündigung vorbereiten", „Arbeitszeugnis", „Vorlage anpassen".
---

# Personalakte

Alles liegt in `personalakte/`: Endfassungen in `vorlagen/`, gefüllte Dokumente
in `mitarbeiter/`, das Werkzeug in `werkzeug/`. `personalakte/README.md` erklärt
den Aufbau, `vorlagen/platzhalter.md` die Platzhalter.

## Neue Person einstellen

1. **Daten sammeln.** Was in der Anfrage steht, wird übernommen. Fehlt etwas,
   in **einer** Rückfrage bündeln — nicht Feld für Feld nachhaken. Nötig sind:
   Vor- und Nachname, Geschlecht (für die Anrede und die Vertragsformen),
   Geburtsdatum und -ort, Anschrift, Anstellungsart, Vertragsbeginn,
   Stundenlohn, Wochenstunden und die Stunden je Wochentag, Tätigkeit.
   Steht die Person schon in der App, können die Werte aus `employee_profiles`
   kommen — die Feldnamen versteht das Werkzeug direkt.
2. **`daten.json` schreiben**, am besten nach
   `personalakte/werkzeug/beispiel-daten.json` als Muster. Ablage:
   `personalakte/mitarbeiter/<nachname>-<vorname>/daten.json` entsteht ohnehin.
3. **Erzeugen:**
   `node personalakte/werkzeug/anlegen.mjs <daten.json>`
4. **Nacharbeiten:**
   - Jeden offenen Platzhalter aus der Ausgabe füllen oder mit dem Nutzer klären.
     Fehlen Firmenangaben, einmal `personalakte/werkzeug/firma.json` ausfüllen —
     danach ist Ruhe.
   - **Unbefristeter Vertrag:** § 2 Befristung im Arbeitsvertrag streichen und
     die folgenden Paragrafen neu durchnummerieren.
   - Urlaubstage prüfen: berechnet wird der gesetzliche Mindesturlaub.
5. **Melden**, was der Nutzer jetzt tun muss: die Punkte aus
   `00-checkliste-einstellung.md`, allen voran die Sofortmeldung zur
   Sozialversicherung **vor** dem ersten Arbeitstag.

## Einzelnes Dokument später

```
node personalakte/werkzeug/anlegen.mjs personalakte/mitarbeiter/<ordner>/daten.json \
  --vorlage aenderung/lohnanpassung.md --setze AENDERUNG_AB=01.01.2027 --setze NEU="15,00 €"
```

Das Dokument landet im Unterordner, den die Vorlage im Kopf unter `ablage`
nennt, mit dem Datum im Dateinamen. Passende Vorlagen: `aenderung/`,
`laufend/`, `austritt/`.

Nach einer Änderung am Vertrag immer daran erinnern: **Stammdaten in der App
nachziehen und das Lohnbüro informieren.**

## Vorlage ändern

Die Datei in `vorlagen/` wird **geändert**, nicht kopiert. Es gibt keine zweite
Fassung, keinen Zusatz im Dateinamen, kein „alt"-Verzeichnis — die Historie
steht in Git. Beim Ändern:

- Keine Namen, Löhne, Daten in die Vorlage schreiben. Dort gehören Platzhalter
  hin, und jeder neue Platzhalter kommt in `vorlagen/platzhalter.md`.
- Den Kopf der Vorlage (`titel`, `nummer`, `ablage`, `unterschrift`, `ausgabe`,
  `hinweis`) mitpflegen.
- Kommt eine Vorlage für die Einstellung dazu, bekommt sie eine `nummer` und
  wird in `personalakte/README.md` und in der Checkliste ergänzt.

## Grenzen

- Die Vorlagen sind sorgfältig gebaut, aber keine Rechtsberatung. Bei
  Arbeitsvertrag, Aufhebungsvertrag und Kündigung darauf hinweisen, dass die
  Fassung einmal anwaltlich geprüft gehört — und danach nicht mehr.
- Bei einer Kündigung nie ohne die Prüfliste am Ende der Vorlage arbeiten:
  Frist, Zugang, besonderer Kündigungsschutz.
- **Nie** Dateien aus `personalakte/mitarbeiter/` einchecken, in eine
  Zusammenfassung kopieren oder nach außen geben. Sie stehen in `.gitignore`,
  und das bleibt so.
