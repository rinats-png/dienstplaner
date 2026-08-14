# Verzeichnis von Verarbeitungstätigkeiten

Nach Artikel 30 DSGVO. Entwurf mit Beispieldaten — siehe `PLATZHALTER.md`.

Dieses Verzeichnis führt der **Anbieter** von CENTRIC. Es enthält zwei Teile,
weil der Anbieter in zwei verschiedenen Rollen auftritt:

- **Teil A** — Verarbeitungen, für die der Anbieter selbst Verantwortlicher
  ist (Artikel 30 Abs. 1): eigene Website, Testzugänge, Abrechnung.
- **Teil B** — Verarbeitungen im Auftrag von Kunden (Artikel 30 Abs. 2):
  die Beschäftigtendaten in den Betrieben.

Kunden brauchen ein **eigenes** Verzeichnis für ihre Verarbeitung
„Dienstplanung und Arbeitszeiterfassung". Ein Muster dafür steht am Ende.

## Verantwortlicher

    [BEISPIEL-FIRMA] [BEISPIEL-RECHTSFORM]
    [BEISPIEL-STRASSE], [BEISPIEL-PLZ-ORT]
    Vertreten durch: [BEISPIEL-VERTRETER]
    E-Mail: [BEISPIEL-EMAIL]
    Datenschutzbeauftragte Person: [BEISPIEL-DSB]

---

# Teil A — Eigene Verarbeitungen

## A1 Bereitstellung der Website

| | |
|---|---|
| **Zweck** | Auslieferung der öffentlichen Seiten und der Anwendung |
| **Betroffene** | Besucher der Website |
| **Datenkategorien** | Abgerufene Adresse, Zeitpunkt, übertragene Menge, Statuscode, Browserkennung, IP-Adresse ausschließlich als Hashwert |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an einem sicheren und funktionsfähigen Angebot |
| **Empfänger** | Netlify, Inc. (Hosting, USA) |
| **Drittland** | USA, Standardvertragsklauseln (EU) 2021/914 |
| **Löschfrist** | 30 Tage |
| **Maßnahmen** | TLS, HSTS, Content-Security-Policy, selbst ausgelieferte Schriftarten, keine Cookies zu Werbe- oder Messzwecken |

## A2 Selbststart eines Testzugangs

| | |
|---|---|
| **Zweck** | Einrichtung eines befristeten Testbetriebs, Zustellung der Zugangscodes |
| **Betroffene** | Ansprechpartner interessierter Unternehmen |
| **Datenkategorien** | Betriebsname, Branche, Bundesland, E-Mail-Adresse, Zeitpunkt, Ablaufdatum |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO — vorvertragliche Maßnahme |
| **Empfänger** | Netlify, Inc.; Resend, Inc. (E-Mail-Versand, USA) |
| **Drittland** | USA, Standardvertragsklauseln |
| **Löschfrist** | 90 Tage nach Ablauf des Testzeitraums |
| **Maßnahmen** | Zugangscodes nur als HMAC gespeichert, Versand nur an die hinterlegte Adresse, Mengenbegrenzung je Netzadresse |

## A3 Anmeldung, Sitzungsverwaltung, Missbrauchsabwehr

| | |
|---|---|
| **Zweck** | Prüfung der Zugangsberechtigung, Abwehr automatisierter Anmeldeversuche |
| **Betroffene** | Nutzer der Anwendung |
| **Datenkategorien** | Zugangscode als HMAC, Sitzungsschlüssel als Hashwert, Zeitpunkt, Rolle, Betriebskennung, IP-Adresse als Hashwert |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. f DSGVO — Sicherheit der Verarbeitung; Art. 32 DSGVO |
| **Empfänger** | Netlify, Inc. |
| **Löschfrist** | Sitzungen: 12 Stunden, bei Untätigkeit 30 Minuten. Fehlversuchsvermerke: 30 Tage |
| **Maßnahmen** | zeitkonstanter Vergleich, ansteigende Sperrdauer, sofortiger Widerruf einzelner Zugänge |

## A4 Vertrags- und Abrechnungsdaten

| | |
|---|---|
| **Zweck** | Vertragsverwaltung, Rechnungsstellung, Buchführung |
| **Betroffene** | Ansprechpartner der Kunden |
| **Datenkategorien** | Firma, Anschrift, Ansprechpartner, Tarif, Standorte, Rechnungsbeträge |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b DSGVO; für die Aufbewahrung Art. 6 Abs. 1 lit. c i. V. m. § 147 AO, § 257 HGB |
| **Empfänger** | [BEISPIEL-STEUERBERATUNG] |
| **Löschfrist** | 10 Jahre nach Ablauf des Kalenderjahres der Rechnungsstellung |

## A5 Anfragen per E-Mail

| | |
|---|---|
| **Zweck** | Beantwortung von Anfragen |
| **Betroffene** | Anfragende Personen |
| **Datenkategorien** | Name, E-Mail-Adresse, Inhalt der Anfrage |
| **Rechtsgrundlage** | Art. 6 Abs. 1 lit. b oder lit. f DSGVO |
| **Löschfrist** | 24 Monate nach abschließender Bearbeitung, soweit keine Aufbewahrungspflicht besteht |

---

# Teil B — Verarbeitung im Auftrag (Art. 30 Abs. 2)

## B1 Betrieb der Dienstplanung für Kunden

| | |
|---|---|
| **Verantwortliche** | Die jeweiligen Kunden. Eine Liste wird gesondert geführt: `[BEISPIEL-KUNDENLISTE]` |
| **Kategorien der Verarbeitung** | Speichern, Auslesen, Verändern, Auswerten, Übermitteln an vom Kunden bestimmte Empfänger, Löschen |
| **Datenkategorien** | Siehe § 2 des AV-Vertrags: Stamm-, Vertrags-, Planungs-, Zeit-, Qualifikations- und Abwesenheitsdaten, Schutzangaben, Nachrichten, Protokolle |
| **Besondere Kategorien** | Gesundheitsdaten (Abwesenheitsgründe, Mutterschutz, Schwerbehinderung), soweit vom Kunden erfasst |
| **Betroffene** | Beschäftigte der Kunden |
| **Empfänger** | Netlify, Inc.; Resend, Inc. |
| **Drittland** | USA, Standardvertragsklauseln (EU) 2021/914 |
| **Löschfristen** | Nach Weisung des Kunden; Voreinstellungen siehe Anlage 1 zum AV-Vertrag |
| **Maßnahmen** | Anlage 1 zum AV-Vertrag |

---

# Muster für Kunden

Wer CENTRIC einsetzt, trägt in sein eigenes Verzeichnis eine Verarbeitung
ein. Ein brauchbarer Ausgangspunkt:

## Dienstplanung und Arbeitszeiterfassung

| | |
|---|---|
| **Zweck** | Planung und Dokumentation von Schichtdiensten, Erfassung der Arbeitszeit, Verwaltung von Abwesenheiten und Qualifikationen, Einhaltung arbeitszeitrechtlicher Grenzen |
| **Betroffene** | Beschäftigte einschließlich Auszubildender und Aushilfen |
| **Datenkategorien** | Stammdaten, Arbeitszeitmodell, Schichtzuweisungen, Kommen- und Gehen-Zeiten, Stundenkonten, Urlaub, Abwesenheiten, Qualifikationsnachweise, Schutzangaben |
| **Besondere Kategorien** | Gesundheitsdaten, soweit Abwesenheitsgründe, Mutterschutz oder Schwerbehinderung erfasst werden — Art. 9 Abs. 2 lit. b DSGVO i. V. m. § 26 Abs. 3 BDSG |
| **Rechtsgrundlage** | § 26 Abs. 1 BDSG i. V. m. Art. 88 DSGVO (Durchführung des Beschäftigungsverhältnisses); Art. 6 Abs. 1 lit. c DSGVO i. V. m. § 16 Abs. 2 ArbZG, JArbSchG, MuSchG, SGB IX; gegebenenfalls Betriebsvereinbarung als Rechtsgrundlage nach Art. 88 Abs. 1 DSGVO |
| **Empfänger** | [Anbieter] als Auftragsverarbeiter; Lohnbuchhaltung; Arbeitnehmervertretung im Rahmen ihrer Aufgaben |
| **Drittland** | Ja — siehe AV-Vertrag § 7 |
| **Löschfristen** | Plandaten 24 Monate, Stammdaten 6 Monate nach Austritt (danach Anonymisierung), Abwesenheitsgründe 3 Monate; abweichende Einstellung im Betrieb möglich |
| **Maßnahmen** | Anlage 1 zum AV-Vertrag; ergänzend die eigenen Maßnahmen des Kunden (Vergabe und Entzug von Zugängen, Schulung, Bildschirmsperre) |

**Zusätzlich zu klären, bevor echte Daten eingegeben werden**

1. AV-Vertrag nach Artikel 28 DSGVO geschlossen.
2. Betriebs- oder Personalrat nach § 87 Abs. 1 Nr. 6 BetrVG beteiligt —
   insbesondere zu Zeiterfassung und Standortprüfung beim Stempeln.
3. Beschäftigte nach Artikel 13 DSGVO informiert.
4. Prüfung, ob eine Datenschutz-Folgenabschätzung nach Artikel 35 DSGVO
   erforderlich ist. Die Verarbeitung von Beschäftigtendaten mit
   Standortbezug spricht dafür; die Liste der Aufsichtsbehörden zu Artikel 35
   Abs. 4 DSGVO führt „Verarbeitung von Beschäftigtendaten zur
   Verhaltens- oder Leistungskontrolle" ausdrücklich auf.
5. Festlegung, welche Rollen welche Angaben sehen — insbesondere, wer
   Abwesenheitsgründe lesen darf.
