# Offene Betreiberangaben in den Rechtstexten

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten.

Alle Dateien in diesem Ordner sind Arbeitsentwürfe. Seit Revision R2 gilt: Offene Punkte stehen als `[ZU_KLAEREN: …]` (früher `[BEISPIEL-…]`). Ein Platzhalter heißt: Die Tatsache ist nicht belegt; sie wird nicht erfunden und nicht aus dem Quelltext geraten. Suchen mit:

    grep -rn "ZU_KLAEREN" rechtliches/

Bloßes Ersetzen der Platzhalter genügt nicht: Der Text muss danach gegen den tatsächlichen Produktivstand geprüft werden (die Texte beschreiben den Zustand, nicht das Vorhaben).

## Betreiberangaben, ohne die die Texte nicht fertig werden

| Nr. | Angabe | Betrifft |
|---|---|---|
| O-01 | Anbieter: Inhaber oder Firma, Rechtsform, Vertretung | Impressum, AGB, AVV, Datenschutz |
| O-02 | ladungsfähige Anschrift, gelesene E-Mail, zweiter Kommunikationsweg | Impressum |
| O-03 | Registergericht und Nummer, USt-ID oder W-ID, Steuerstatus | Impressum, AGB |
| O-04 | Datenschutzbeauftragte Person (falls Pflicht), zuständige Aufsichtsbehörde | Datenschutz, VVT |
| O-05 | Produktivstand: Image-Digest, 2FA-Stand, Domains, Rollenmigration | Datenschutz, AVV, TOM |
| O-06 | IONOS-Konto: Rechenzentrumsregion, aktueller AV-Vertrag, Unterauftragnehmer, Sicherheitsnachweise | AVV Anlage 2, Datenschutz |
| O-07 | Schalterstand der Umgebung (nur ja/nein, keine Werte): Resend-Schlüssel, Push (VAPID), KI, Löschlauf-Modus, Selbststart, Registrierung, Demo, Überwachung | Datenschutz, AVV, VVT |
| O-08 | Marketingwebsite: Cookies, Analyse, Einbettungen, Formulare | Datenschutz |
| O-09 | Sicherung außer Haus: Ziel, Region, Aufbewahrung, Wiederherstellungsprobe | AVV, TOM |
| O-10 | Verfügbarkeitszusage (ja/nein, Messung, Wartung, Rechtsfolgen) | AGB § 6 |
| O-11 | Preise, Tarife, Zahlungsziel, Kündigung, automatische Hochstufung | AGB |
| O-12 | Verträge und Regionen für Mail-, Push- und KI-Dienstleister | AVV Anlage 2 |
| O-13 | Branchen- und Tarifverträge, Bundesländer, Betriebsvereinbarungen der Pilotkunden | `branchen-arbeitszeitrecht.md` |
| O-14 | gewünschte Nutzung von Gesundheitsfeldern und Standortprüfung | `dsfa-screening.md` |
| O-15 | Export- und Wechselprozess, technische Grenzen | `data-act-wechsel-export.md` |
| O-16 | Dienstleister: Steuerberatung, Support, Monitoring, Alarm | VVT |
| O-17 | Gerichtsstand, Haftungsmodell | AGB |
| O-18 | Löschfristen je Datenart, Wachbuch-Fristtyp, Protokollfristen | `loeschkonzept.md` |

Bisherige Einzelplatzhalter (`[BEISPIEL-FIRMA]`, `-STRASSE`, `-PLZ-ORT`, `-VERTRETER`, `-REGISTERGERICHT`, `-HRB`, `-USTID`, `-TELEFON`, `-EMAIL`, `-DSB`, `-AUFSICHT`, `-STAND`, `-ZAHLUNGSZIEL`, `-GERICHTSSTAND`, `-KUNDE-FIRMA`, `-KUNDE-ANSCHRIFT`, `-STEUERBERATUNG`, `-KUNDENLISTE`, `-AVV-IONOS`, `-AVV-RESEND`) sind in den Dateien als `[ZU_KLAEREN: …]` aufgegangen. Verträge und Kundenlisten gehören nicht in das öffentliche Repository.

## Was in welcher Datei steht

| Datei | Inhalt |
|---|---|
| `README.md` | Index, Status, Revisionsnummer |
| `impressum.md` | Anbieterkennzeichnung nach § 5 DDG |
| `datenschutz.md` | Information nach Art. 13 und 14 DSGVO |
| `agb.md` | Vertragsbedingungen für Unternehmerkunden |
| `auftragsverarbeitung.md` | Vertrag nach Art. 28 DSGVO mit Anlagen (TOM, Unterauftragsverarbeiter, Module) |
| `verarbeitungsverzeichnis.md` | Verzeichnis nach Art. 30 DSGVO (Teil A, Teil B, Kundenmuster) |
| `tom-register.md` | Maßnahmen nach Art. 32 mit Ist, Soll, Nachweis |
| `loeschkonzept.md` | Löschmatrix als Vorschlag, Löschlauf, Sicherungen |
| `dsfa-screening.md` | Schwellenprüfung nach Art. 35 |
| `ki-verordnung-intelligence.md` | Einordnung der KI-Funktionen nach der KI-Verordnung |
| `branchen-arbeitszeitrecht.md` | Arbeitszeit- und Branchenmatrix, Fachtests |
| `data-act-wechsel-export.md` | Export, Anbieterwechsel, Lücken |
| `rechtsquellen.md` | Normen, Fundstellen, Prüfstatus |

## Wo die Texte in der Anwendung erscheinen

Fünf Dateien werden zur Bauzeit in die Anwendung eingebunden (`src/rechtstexte.jsx`, Import mit `?raw`): `impressum.md`, `datenschutz.md`, `agb.md`, `auftragsverarbeitung.md`, `verarbeitungsverzeichnis.md`. Wer sie ändert, ändert die Seite „Rechtliches“. Folgen für Autoren: Die Darstellung kennt nur Überschriften, Absätze, Listen, Tabellen, Trennlinien, Fett, Kursiv und Code; Zitate, verschachtelte Listen und Verweise werden nicht als solche dargestellt. Die Warnung „enthält noch Beispieldaten“ in der Anwendung prüft auf die alte Kennung `[BEISPIEL-`; sie erkennt `[ZU_KLAEREN` nicht. **Die Anwendung muss vor einer Veröffentlichung angepasst werden, sonst erscheinen Entwürfe ohne Warnbanner.** Die übrigen Dateien dieses Ordners werden nicht ausgespielt.

## Was ein Anwalt ansehen muss

- **AGB gesamt**, besonders Haftung (§ 8), Änderungsklausel und Zustimmungsfiktion (§ 10), automatische Hochstufung (§ 4 Abs. 3), Freistellung (§ 7 Abs. 7).
- **Rolle des Anbieters** je Datenfluss (Verantwortlicher oder Auftragsverarbeiter) und Rechtsgrundlagen je Prozess.
- **AVV** mit Anlagen, Drittlandbewertung, Auditrecht, Meldefrist.
- **Arbeitnehmerdatenschutz** (Standortprüfung, Gesundheitsdaten, Betriebsvereinbarung) und **KI-Verordnung**.
- **Steuerstatus** (Kleinunternehmer) und Rechnungsangaben.

## Umgebungsvariablen

Kontaktangaben gehören nicht in den Quelltext. Sie werden beim Bauen des Container-Bilds gesetzt (Repository-Variablen in GitHub Actions, `VITE_…`, siehe `BEREITSTELLUNG.md`):

| Variable | Wirkung |
|---|---|
| `VITE_KONTAKT_MAIL` | Adresse im Hilfebereich, im Hinweis zum Testablauf und in Fehlermeldungen. Ohne sie zeigt die Anwendung `kontakt@example.org`. |
| `VITE_KONTAKT_TELEFON` | Optional. Ohne Wert erscheint keine Telefonzeile. |
| `VITE_KONTAKT_ZEITEN` | Optional. Erreichbarkeit als Klartext. |

Die Adresse sollte mit der E-Mail-Adresse im Impressum übereinstimmen.
