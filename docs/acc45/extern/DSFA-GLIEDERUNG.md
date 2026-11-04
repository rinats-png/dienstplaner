# DSFA: Gliederung (E-26, E-30, E-31)

Stand: 2026-11-04 · **Gerüst.** Nur Gliederung und aus dem Repository ableitbare Fakten. Ob eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO
erforderlich ist und für welche Verarbeitungen, ist **rechtlich zu prüfen** (Kanzlei, Datenschutzbeauftragte(r); Eintrag E-30). Dieses Dokument
bewertet nichts, behauptet keine Zulässigkeit und ersetzt keine Prüfung. Das Repository ist öffentlich: keine Personen- oder Betriebsdaten.

Zeitplan: [`../BETREIBER-AUFGABEN-WEIHNACHTEN.md`](../BETREIBER-AUFGABEN-WEIHNACHTEN.md) (E-26, E-30, E-31).

## 1. Verantwortlichkeit (offen)

- Verantwortlicher und Auftragsverarbeiter, Rollenverteilung Betreiber und Kunde: `<rechtlich zu prüfen, E-18>`.
- Datenschutzbeauftragte(r): Bestellpflicht `<rechtlich zu prüfen>`.
- Beteiligung Betriebsrat: siehe [`BETRIEBSVEREINBARUNG-THEMENLISTE.md`](BETRIEBSVEREINBARUNG-THEMENLISTE.md).

## 2. Systematische Beschreibung der Verarbeitungen (aus dem Repository)

| Verarbeitung | Zweck laut Produkt | Betroffene | Datenarten (Auswahl) | Quelle im Repository |
|---|---|---|---|---|
| Dienstplanung | Schichtplanung, Besetzung | Beschäftigte | Stammdaten, Qualifikation, Dienste, Abwesenheiten | Bestand, `RECHTEMATRIX.md` |
| Zeiterfassung | Stempel, Ist-Zeiten, Konto, Monatsabschluss, Lohnexport | Beschäftigte | Stempelzeiten, Korrekturen, Bestätigungen | `server/lib/zeiterfassung.mjs`, `stempelintegritaet.mjs` |
| Geo-Prüfung | Ortsurteil beim Stempeln (optional, Modi je Betrieb) | Beschäftigte | Standortabfrage am Gerät; der Befunde-Reiter zeigt laut E-4 nur gerundete Entfernung und Urteil; ob und wie lange Koordinaten gespeichert werden, ist anhand `wp20-nachweis.md` zu belegen; Löschfristen `<prüfen>` | `server/lib/geo.mjs`, `wp20-nachweis.md` |
| Schutzmerkmale | Mutterschutz, Jugendarbeitsschutz | einzelne Beschäftigte | Geburtsdatum, Einwilligungen; **Art. 9 möglich** | `RECHTEMATRIX.md` (Schutzmerkmale), `server/lib/schutzpruefung.mjs` |
| Betriebsrat-Auswertung | aggregierte Sicht mit Mindestgruppe | Beschäftigte | Aggregate | `server/lib/br-auswertung.mjs` |
| Kalender-Feed | eigener Dienstplan im Kalender | Beschäftigte | Termine je Person, geheimer Link | `server/lib/kalenderfeed.mjs` |
| Mitteilungen (Mail, Push) | Benachrichtigung | Beschäftigte | Adresse, Push-Anmeldung, Text | `server/lib/versand.mjs`, `webpush.mjs`; WP-30 offen |
| Auskunft und Löschung | Art. 15, Löschlauf | Beschäftigte | vollständige Eigendaten | `server/lib/auskunft.mjs`, `datenschutzlauf.mjs`, `aufraeumen.mjs` |
| Sicherung außer Haus | Wiederherstellung | alle | verschlüsselte Kopien des Bestands | `docs/BETRIEB-SICHERUNG.md` |
| Branchenmodule (WP-19) | Wachbuch, Posten, Pflegequalifikation u. a. | Beschäftigte, Dritte in Freitexten | je Modul; Hinweisbetrieb `provisional` | `docs/acc45/WP19-OFFENE-FACHNACHWEISE.md` |
| Intelligence (F7B u. a.) | Scan/PDF/Foto, Modellaufrufe | Beschäftigte, ggf. Gesundheitsangaben | nach Schwärzung; Anbieterfrage offen | `INTELLIGENCE-ENTWICKLUNGSPLAN.md` Abschnitt 7 |

## 3. Technische und organisatorische Maßnahmen (Ist laut Repository, ungeprüft)

Rollenkataloge und Personaldaten-Filter (WP-43, Positivliste), Mandantentrennung, Anmeldebremse, Sitzungen, Betreiber-2FA, Datenminimierung beim Geo-Urteil,
Mindestgruppe in der Betriebsrat-Auswertung, Löschläufe mit Fristen, verschlüsselte Sicherung, Protokollierung ohne Personendaten, Rechtstexte als Entwurf (WP-36).
Jede Maßnahme ist vom Prüfer gegen den Ist-Stand des Release-Kandidaten zu belegen; die Einträge hier sind **kein Nachweis**.

## 4. Gliederung des DSFA-Dokuments (Vorschlag)

1. Beschreibung der Verarbeitung (Zweck, Umfang, Kontext, Daten, Empfänger, Löschfristen)
2. Notwendigkeit und Verhältnismäßigkeit (Rechtsgrundlage: `<rechtlich zu prüfen>`, Datenminimierung, Speicherbegrenzung)
3. Risikobewertung für Betroffene (Quellen, Schwere, Eintrittswahrscheinlichkeit; insbesondere Leistungs-/Verhaltenskontrolle, Standort, Art.-9-Rückschlüsse)
4. Geplante Abhilfemaßnahmen und Restrisiko
5. Stellungnahme der/des Datenschutzbeauftragten `<offen>`, Einbeziehung Betroffener/Betriebsrat `<offen>`
6. Entscheidung des Verantwortlichen, Überprüfungsrhythmus

## 5. Bekannte Restrisiken aus den Repository-Nachweisen (Eingabe für Abschnitt 3 der DSFA)

- Die Schichtverantwortung sieht Einsatzfenster-Namen, die faktisch merkmalsspezifisch sind (Mutterschutz); in `RECHTEMATRIX.md` als „Punkt für die DSFA und die Betriebsvereinbarung (offen)“ geführt.
- Geo: Standortdaten verlassen das Gerät; Speicherung und Löschung sind anhand `wp20-nachweis.md` zu belegen (der Befunde-Reiter zeigt nur gerundete Entfernung); echte GPS-Genauigkeit vor Ort noch ungeprüft (E-4).
- Freitexte in Branchenmodulen können Daten Dritter enthalten (FN-02).
- Drittlandfragen bei Mail-/Alarm-/KI-Anbietern: [`KI-VO-UND-ANBIETER-PRUEFLISTE.md`](KI-VO-UND-ANBIETER-PRUEFLISTE.md).

## 6. Pilot und Testdatenschutz (E-31, Gerüst)

- Pilot ausschließlich mit Testpersonen und Testbetrieben; keine Echtdaten vor Freigabe (laut Übergabeliste).
- Zu regeln: Pilotvertrag, AV-Vertrag Pilot, Zweck und Dauer, Löschung nach Pilotende, Ansprechpartner, Meldeweg für Vorfälle, Beteiligung des Betriebsrats beim Pilotbetrieb `<rechtlich zu prüfen>`.
- Nachweise ohne Personendaten (Befundliste, Abschlussnotiz).

## 7. Vom Betreiber auszufüllen

Verantwortlicher · Datenschutzbeauftragte(r) · Rechtsgrundlagen (nach Kanzleiprüfung) · Löschfristen je Datenart · Auftragsverarbeiter und Unterauftragsverarbeiter · Ergebnis der Erforderlichkeitsprüfung.
