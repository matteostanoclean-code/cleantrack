# Platzhalter

Jeder Platzhalter steht in doppelten geschweiften Klammern: `{{VORNAME}}`.
Das Werkzeug ersetzt sie und meldet jeden, der offen geblieben ist.

Die Spalte „Feld" nennt die Spalte in `employee_profiles` (Supabase), aus der
der Wert kommt. Wo nichts steht, wird der Wert beim Anlegen abgefragt — er
existiert in der App nicht.

## Person

| Platzhalter | Feld | Beispiel |
|---|---|---|
| `{{ANREDE}}` | aus `gender` | Frau |
| `{{VORNAME}}` | `first_name` | Maria |
| `{{NACHNAME}}` | `last_name` | Musterfrau |
| `{{NAME}}` | berechnet | Maria Musterfrau |
| `{{GEBURTSDATUM}}` | `birthday` | 14.03.1988 |
| `{{GEBURTSORT}}` | — | Pforzheim |
| `{{STAATSANGEHOERIGKEIT}}` | — | deutsch |
| `{{STRASSE}}` | `street` | Hauptstraße 12 |
| `{{ADRESSZUSATZ}}` | `address_addition` | Hinterhaus |
| `{{PLZ}}` | `postal_code` | 75179 |
| `{{ORT}}` | `city` | Pforzheim |
| `{{LAND}}` | `country` | Deutschland |
| `{{ANSCHRIFT}}` | berechnet | Straße, Zusatz, PLZ Ort — mehrzeilig |
| `{{EMAIL}}` | `email` | maria@example.de |
| `{{TELEFON}}` | `phone` | 0170 1234567 |

## Vertrag

| Platzhalter | Feld | Beispiel |
|---|---|---|
| `{{MITARBEITERNUMMER}}` | `employee_number` | 042 |
| `{{ANSTELLUNGSART}}` | `employment_type` | Minijob |
| `{{MITARBEITERGRUPPE}}` | `employee_group` | Unterhaltsreinigung |
| `{{TAETIGKEIT}}` | — | Reinigungskraft in der Unterhaltsreinigung |
| `{{VERTRAGSBEGINN}}` | `contract_start` | 01.10.2026 |
| `{{VERTRAGSENDE}}` | `contract_end` | leer bei unbefristet |
| `{{BEFRISTUNG_GRUND}}` | — | leer bei unbefristet oder sachgrundlos |
| `{{PROBEZEIT_MONATE}}` | — | 6 |
| `{{LOHNART}}` | `wage_type` | Stundenlohn |
| `{{STUNDENLOHN}}` | `hourly_rate` | 14,25 € |
| `{{MONATSLOHN}}` | — | leer bei Stundenlohn |
| `{{WOCHENSTUNDEN}}` | `weekly_hours` | 10 |
| `{{STUNDEN_MO}}` … `{{STUNDEN_SO}}` | `hours_monday` … `hours_sunday` | 2 |
| `{{ARBEITSZEIT_TEXT}}` | berechnet | Mo 2, Di 2, Mi 2, Do 2, Fr 2 Stunden |
| `{{URLAUBSTAGE}}` | berechnet aus `weekly_hours` und Arbeitstagen | 12 |
| `{{KUENDIGUNGSFRIST}}` | — | vier Wochen zum 15. oder zum Monatsende |
| `{{EINSATZORT}}` | — | Objekte im Umkreis von Remchingen |
| `{{FAHRZEIT}}` | `travel_time_allowed` | ja / nein |

## Firma und Dokument

Diese Werte stehen ein einziges Mal in `werkzeug/firma.json` und gelten für
alle Dokumente.

| Platzhalter | Herkunft |
|---|---|
| `{{FIRMA_NAME}}` | firma.json |
| `{{FIRMA_INHABER}}` | firma.json |
| `{{FIRMA_STRASSE}}` | firma.json |
| `{{FIRMA_PLZ_ORT}}` | firma.json |
| `{{FIRMA_TELEFON}}` | firma.json |
| `{{FIRMA_EMAIL}}` | firma.json |
| `{{FIRMA_ANSPRECHPARTNER}}` | firma.json |
| `{{FIRMA_DATENSCHUTZ_KONTAKT}}` | firma.json |
| `{{FIRMA_BG}}` | firma.json — Berufsgenossenschaft |
| `{{FIRMA_LOHNBUERO}}` | firma.json |
| `{{ORT_UNTERSCHRIFT}}` | firma.json |
| `{{DATUM_HEUTE}}` | berechnet |

## Vom Werkzeug berechnet

Diese Werte müssen nicht angegeben werden. Wer sie doch in `daten.json`
schreibt, überschreibt die Berechnung.

| Platzhalter | wird gebildet aus |
|---|---|
| `{{NAME}}`, `{{ANSCHRIFT}}` | Vor- und Nachname, Straße, PLZ, Ort |
| `{{DATUM_HEUTE}}`, `{{JAHR}}` | dem heutigen Tag |
| `{{ANREDE}}` | `gender` — Frau, Herr, sonst beides |
| `{{ANREDE_GEN}}`, `{{ANREDE_AKK}}`, `{{ANREDE_DAT}}` | ihren/seinen, ihr/sein, ihr/ihm — für das Zeugnis |
| `{{ARBEITSZEIT_TEXT}}` | den Stunden je Wochentag |
| `{{URLAUBSTAGE}}` | Arbeitstage je Woche × 4 (gesetzlicher Mindesturlaub) |
| `{{VERGUETUNG_TEXT}}` | Lohnart, Stunden- oder Monatslohn |
| `{{MONAT_ENDE}}` | dem Beendigungsdatum, als Monatsname |

### Rollenbezeichnungen in der richtigen Form

Damit im Vertrag einer Reinigungskraft nicht „der Arbeitnehmer" steht, wenn
eine Frau unterschreibt. Gebildet aus `gender`; fehlt die Angabe, bleiben beide
Formen stehen und werden von Hand gestrichen.

| Platzhalter | weiblich | männlich |
|---|---|---|
| `{{AN_LABEL}}` | Arbeitnehmerin | Arbeitnehmer |
| `{{AN_NOM}}` / `{{AN_NOM_GROSS}}` | die Arbeitnehmerin / Die … | der Arbeitnehmer / Der … |
| `{{AN_AKK}}` | die Arbeitnehmerin | den Arbeitnehmer |
| `{{AN_DAT}}` | der Arbeitnehmerin | dem Arbeitnehmer |
| `{{AN_GEN}}` | der Arbeitnehmerin | des Arbeitnehmers |
| `{{MA_…}}` | dieselben Fälle mit „Mitarbeiterin" | „Mitarbeiter" |

## Nur in einzelnen Vorlagen

Diese Werte gehören zum Anlass, nicht zur Person. Das Werkzeug fragt sie beim
Erzeugen der jeweiligen Vorlage ab.

| Platzhalter | Vorlage |
|---|---|
| `{{ANLASS}}`, `{{SACHVERHALT}}`, `{{DATUM_VORFALL}}` | Abmahnung, Aktenvermerk |
| `{{AENDERUNG_AB}}`, `{{ALT}}`, `{{NEU}}` | Änderungsvereinbarung, Lohnanpassung |
| `{{KUENDIGUNGSDATUM}}`, `{{LETZTER_ARBEITSTAG}}` | Kündigung, Aufhebungsvertrag, Zeugnis |
| `{{RESTURLAUB}}` | Austrittsdokumente |
| `{{BEURTEILUNG_LEISTUNG}}`, `{{BEURTEILUNG_VERHALTEN}}` | Arbeitszeugnis |

## Schreibweise

- Datum immer `TT.MM.JJJJ`.
- Beträge mit Komma und Euro-Zeichen: `14,25 €`.
- Stunden mit Komma: `10,5`.
- Leere Felder erscheinen als `—`, nie als leere Zeile mitten im Satz.
