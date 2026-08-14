# Platzhalter in den Rechtstexten

Alle Dateien in diesem Ordner sind **Entwürfe mit Beispieldaten**. Sie sind
inhaltlich vollständig aufgebaut, aber an keiner Stelle rechtlich geprüft.

## Was vor der Veröffentlichung ersetzt werden muss

Jeder Platzhalter steht in eckigen Klammern und beginnt mit `BEISPIEL`.
Suchen mit:

    grep -rn "\[BEISPIEL" rechtliches/

| Platzhalter | Was einzutragen ist |
|---|---|
| `[BEISPIEL-FIRMA]` | Vollständige Firmierung laut Handelsregister |
| `[BEISPIEL-RECHTSFORM]` | GmbH, UG (haftungsbeschränkt), Einzelunternehmen … |
| `[BEISPIEL-STRASSE]` | Straße und Hausnummer des Sitzes |
| `[BEISPIEL-PLZ-ORT]` | Postleitzahl und Ort |
| `[BEISPIEL-VERTRETER]` | Geschäftsführung oder Inhaber, vollständiger Name |
| `[BEISPIEL-REGISTERGERICHT]` | Zuständiges Amtsgericht |
| `[BEISPIEL-HRB]` | Handelsregisternummer, etwa HRB 12345 |
| `[BEISPIEL-USTID]` | Umsatzsteuer-Identifikationsnummer nach § 27a UStG |
| `[BEISPIEL-TELEFON]` | Telefonnummer, unter der jemand erreichbar ist |
| `[BEISPIEL-EMAIL]` | Kontaktadresse, tatsächlich gelesen |
| `[BEISPIEL-DSB]` | Datenschutzbeauftragte Person, falls bestellt |
| `[BEISPIEL-AUFSICHT]` | Zuständige Datenschutzaufsicht des Bundeslands |
| `[BEISPIEL-STAND]` | Datum der jeweils gültigen Fassung der AGB |
| `[BEISPIEL-ZAHLUNGSZIEL]` | Zahlungsziel in Tagen, üblich sind 14 |
| `[BEISPIEL-GERICHTSSTAND]` | Gerichtsstand, in der Regel der Sitz |
| `[BEISPIEL-KUNDE-FIRMA]` | Firma des Kunden im AV-Vertrag |
| `[BEISPIEL-KUNDE-ANSCHRIFT]` | Anschrift des Kunden im AV-Vertrag |
| `[BEISPIEL-STEUERBERATUNG]` | Steuerbüro, das die Buchführung übernimmt |
| `[BEISPIEL-KUNDENLISTE]` | Ablage der Kundenliste zum Verarbeitungsverzeichnis |
| `[BEISPIEL-AVV-NETLIFY]` | Ablage des abgeschlossenen Vertrags mit Netlify |
| `[BEISPIEL-AVV-RESEND]` | Ablage des abgeschlossenen Vertrags mit Resend |

## Was in welcher Datei steht

| Datei | Inhalt |
|---|---|
| `impressum.md` | Anbieterkennzeichnung nach § 5 DDG und § 18 MStV |
| `datenschutz.md` | Information nach Artikel 13 DSGVO |
| `agb.md` | Vertragsbedingungen, ausgelegt auf Unternehmerkunden |
| `auftragsverarbeitung.md` | Vertrag nach Artikel 28 DSGVO, Anlage 1 mit den technischen und organisatorischen Maßnahmen, Anlage 2 mit den Unterauftragsverarbeitern |
| `verarbeitungsverzeichnis.md` | Verzeichnis nach Artikel 30 DSGVO, getrennt nach eigener Verantwortung und Auftragsverarbeitung — dazu ein Muster für Kunden |

Alle fünf Texte erscheinen in der Anwendung unter **Verwaltung → Rechtliches**
und über die Fußzeile der Anmeldeseite. Die Markdown-Dateien sind die Quelle:
Wer hier etwas ändert, ändert die Seite.

## Was ein Anwalt ansehen sollte

Nicht alles hier ist Formsache. Diese Punkte hängen an Entscheidungen, die
niemand außerhalb des Unternehmens treffen kann:

**Kleinunternehmerregelung.** Ohne Umsatzsteuer-Identifikationsnummer
entfällt der entsprechende Abschnitt im Impressum, und die Preisangaben in
der Anwendung dürfen keine Umsatzsteuer ausweisen.

**Rechtsform und Vertretung.** Bei einer GmbH gehört die Geschäftsführung ins
Impressum, bei einem Einzelunternehmen der Inhaber. Ein fehlender Vertreter
ist ein häufiger Abmahngrund.

**Auftragsverarbeitung.** Die Anlagen zum AV-Vertrag beschreiben die
technischen und organisatorischen Maßnahmen. Was dort steht, muss stimmen —
eine Beschreibung, die den tatsächlichen Zustand übertrifft, ist schlimmer
als gar keine.

**Unterauftragsverarbeiter und Speicherort.** Netlify und Resend verarbeiten
Daten außerhalb der EU. Solange das so ist, müssen die
Standardvertragsklauseln mit beiden geschlossen und dokumentiert sein, bevor
ein Kunde echte Personaldaten einspielt.

Geplant ist ein Umzug auf ein Rechenzentrum in Deutschland vor dem
kostenpflichtigen Betrieb. Die Schrittfolge steht in Anlage 2 des
AV-Vertrags. Wichtig dabei: Die Texte beschreiben durchgehend den Zustand,
nicht das Vorhaben. Wer sie vor dem Umzug veröffentlicht, veröffentlicht
richtigerweise „liegt in den USA" — und ändert sie am Tag des Umzugs, nicht
davor.

**Widerrufsrecht.** Die AGB gehen davon aus, dass ausschließlich an
Unternehmer verkauft wird. Sobald ein Verbraucher Kunde werden kann, kommt
eine Widerrufsbelehrung hinzu, und die Haftungsklauseln sind zu prüfen.

## Umgebungsvariablen

Die Kontaktangaben gehören nicht in den Quelltext, weil sie sich ändern
können, ohne dass jemand die Anwendung neu baut. Sie werden beim Bauen gesetzt —
bei Netlify unter *Site configuration → Environment variables*:

| Variable | Wirkung |
|---|---|
| `VITE_KONTAKT_MAIL` | Adresse im Hilfebereich, im Hinweis zum Testablauf und in Fehlermeldungen. Ohne sie zeigt die Anwendung `kontakt@example.org` und weist im Hilfebereich sichtbar darauf hin. |
| `VITE_KONTAKT_TELEFON` | Optional. Ohne Wert erscheint die Telefonzeile gar nicht. |
| `VITE_KONTAKT_ZEITEN` | Optional. Erreichbarkeit als Klartext. |

Die Adresse sollte dieselbe sein wie `[BEISPIEL-EMAIL]` im Impressum —
sonst steht im Impressum eine andere Anlaufstelle als in der Anwendung.
