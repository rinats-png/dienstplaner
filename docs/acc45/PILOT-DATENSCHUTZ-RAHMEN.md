# Pilot-Datenschutzrahmen: Stufenmodell für Demo, anonymisierte Daten und kontrollierte Echtdaten

Stand: 2026-11-03 · Branch `acc45/docs/pilot-erhebung` · Zieltermin Gesamtprodukt: 24.12.2026

**Status:** Organisatorischer Rahmen und Arbeitsentwurf des Betreibers. Dieses Dokument ist **keine Rechtsberatung** und
**keine rechtliche Freigabe**. Es behauptet nicht, dass eine Stufe rechtlich zulässig ist, und es sagt keinem Pilotbetrieb
Datenschutzkonformität zu. Alle Punkte, die eine rechtliche oder fachliche Prüfung brauchen, sind als **extern**
gekennzeichnet und müssen von der zuständigen Stelle (Kanzlei, Datenschutzbeauftragte/r, Betriebsrat/Mitbestimmung,
Steuerberatung oder Lohnbüro) geklärt werden. Bezug: `WP19-OFFENE-FACHNACHWEISE.md`, `EXTERNE-ABNAHMEN-UEBERGABE.md`,
Arbeitspakete `E-19` (Mitbestimmung), `E-18` (Rechtstexte), `E-24` (Pilot nach Endabnahme).

Geltungsbereich: Pilotbetrieb A (Pflegebetrieb) und Pilotbetrieb B (Sicherheitsunternehmen), beide Design- und
Testpartner. Die Pilotbetriebe werden in öffentlichen Unterlagen nicht namentlich genannt.

---

## 1. Grundregeln (gelten in jeder Stufe)

1. **Stufen werden der Reihe nach durchlaufen.** Eine höhere Stufe wird erst begonnen, wenn die Voraussetzungen der
   niedrigeren und der höheren Stufe **vollständig erfüllt und dokumentiert** sind. Es gibt keine Abkürzung und keine
   mündliche Zusage als Ersatz.
2. **Echtdaten erst nach Erfüllung aller Voraussetzungen der Stufe 3.** Vorher keine echten Namen, Zeiten, Gesundheits-
   oder Qualifikationsdaten im System, auch nicht „nur kurz zum Ausprobieren", nicht in Screenshots, Chats, Tickets,
   Fehlerberichten oder Testdateien.
3. **Keine Umgehung.** Es gibt keine Ausnahme für Eile, Termindruck (24.12.2026), Demonstrationen oder „interne" Nutzung.
   Ein fehlendes Dokument blockiert die Stufe; der Termin wird verschoben, nicht die Voraussetzung.
4. **Öffentliches Repository.** Im Repository stehen weder Echtdaten noch Daten, aus denen sich Pilotbetriebe,
   Beschäftigte, Bewohner/Klienten, Objekte oder Auftraggeber identifizieren lassen. Keine Hosts, IP-Adressen,
   Zugangsdaten oder Zugangscodes.
5. **Datensparsamkeit.** Es werden nur die Felder verarbeitet, die für das Pilotziel nötig sind. Kein Gesundheitsbezug in
   Planungsdaten, keine Bewohner-/Klientendaten, keine Fotos.
6. **Trennung.** Demo/anonymisiert/Echtdaten laufen in getrennten Mandanten/Umgebungen. Echtdaten werden nie in eine Demo-
   oder Entwicklungsumgebung kopiert. Produktion und Staging werden durch diese Doku nicht geändert.
7. **Rechte der Betroffenen** (Auskunft, Berichtigung, Löschung) müssen in Stufe 3 abbildbar sein (WP-26 serverseitig
   integriert); die tatsächliche Erfüllung im Pilot ist organisatorisch zu regeln (extern).
8. **Rückbau.** Zu jeder Stufe gehört ein beschriebener Ausstieg: Daten löschen oder zurückgeben, Zugänge entziehen,
   Bestätigung dokumentieren. Der Ausstieg ist vor dem Einstieg vereinbart.
9. **Dokumentation vor Datenfluss.** Jede Freigabe erfolgt schriftlich mit Datum, freigebender Person (Rolle), Stufe,
   Umfang und Gültigkeitsende. Mündliche Absprachen genügen nicht.
10. **Keine Zusage nach außen.** Es wird nicht behauptet, das Produkt sei „DSGVO-konform", „zertifiziert" oder
    „rechtssicher". Zulässig sind Aussagen über vorhandene technische Maßnahmen (siehe Produktdokumentation).

---

**Krankmeldungen (RB-2, Betreiberentscheidung 2026-11-11).** Eine eingehende Krankmeldung ist ein Fall mit Status
(eingegangen, vorläufig bestätigt, endgültig bestätigt). Die Schichtverantwortung sieht von Fällen ihres Bereichs nur
Zeitraum und Status — keine Anmerkung, keinen Verlauf; Fälle anderer Bereiche gar nicht. Betriebsrat und Betreiber
sehen keine Fälle; Beschäftigte nur die eigenen. Das Betriebsprotokoll hält je Schritt Kennung, Status, Rolle und Person
der handelnden Sitzung fest, keine Anmerkung und keinen Tag. Erst die endgültige Bestätigung durch Planung oder Leitung
macht die Krankheit wirksam (Abwesenheit, Sicht wie bisher). Einzelheiten: `RECHTEMATRIX.md` ³⁰ und Abschnitt 2.
Planung und Leitung können einen Fall ablehnen (nur Kennzeichen, kein Freitext), die meldende Person kann ihn
zurückziehen; beides ohne Wirkung. Der Löschlauf entfernt nicht wirksame Fälle nach der Frist der Gründe und nimmt
wirksamen die Anmerkung. Bekannte Eigenschaften mit offener Betreiberfrage: die Kundenrolle bestätigt wie die Leitung;
Planung und Leitung können die eigene Krankheit unmittelbar eintragen (ohne zweite Person). Ein unbestätigter Fall
löst keine Lücke und keine Ersatzsuche aus und benachrichtigt niemanden per Mail oder Push (nur Aufgabe in der Anwendung).

## 2. Stufenübersicht

| Stufe | Name | Daten | Mandant | Zweck | Einstieg |
|---|---|---|---|---|---|
| 0 | Vorgespräch | keine Systemdaten; Erhebungsbogen ohne Personendaten | keiner | Anforderungen verstehen | Betreiber und Betrieb einig über Gesprächsrahmen |
| 1 | Demo (synthetisch) | ausschließlich erfundene Daten (`PILOT-TESTSZENARIEN.md`) | Demomandant | Bedienung, Szenarien, Akzeptanz | Pilotvereinbarung Stufe 1 (kann formlos sein, siehe 3.1) |
| 2 | Anonymisiert | aus echtem Material abgeleitet, **nicht rückführbar** (Struktur, keine Personen) | getrennter Testmandant | Realitätsnähe (Dienstarten, Quoten, Volumina) | Voraussetzungen Stufe 2 (3.2) |
| 3 | Kontrollierte Echtdaten | echte Beschäftigtendaten im vereinbarten Umfang | eigener Pilotmandant (Staging/Produktion) | Pilotbetrieb | Voraussetzungen Stufe 3 (3.3) vollständig |

Zwischen den Stufen gibt es eine ausdrückliche **Freigabeentscheidung** des Betreibers (Stufenwechsel-Protokoll, Abschnitt 5).

---

## 3. Voraussetzungen je Stufe

Legende Spalte „Zuständig": B = Betreiber, P = Pilotbetrieb, X = extern (Kanzlei, Datenschutzbeauftragte/r,
Betriebsrat/Mitbestimmung, Steuerberatung). „Nachweis" ist das, was dokumentiert vorliegen muss.

### 3.1 Stufe 1: Demo (synthetisch)

| Nr | Voraussetzung | Zuständig | Nachweis |
|---|---|---|---|
| 1.1 | Pilotvereinbarung (leichte Fassung): Ziel, Zeitraum, Ansprechpartner-Rollen, Vertraulichkeit, keine Echtdaten, kein Anspruch auf Produktivbetrieb | B, P | unterzeichnete oder bestätigte Fassung |
| 1.2 | Alle Daten stammen aus dem synthetischen Datensatz (SD-P bzw. SD-S in `PILOT-TESTSZENARIEN.md`) | B | Datenherkunftsvermerk |
| 1.3 | Testkonten tragen keine realen Namen/Mailadressen; Pilotpersonen erhalten Konten mit Pseudonym | B | Kontenliste (ohne Zugangsdaten) |
| 1.4 | Demomandant ist von Produktion getrennt und als „Demo" erkennbar | B | Umgebungsvermerk |
| 1.5 | Teilnehmende werden darauf hingewiesen, keine Echtdaten einzugeben | B | Hinweis in der Einladung |
| 1.6 | Erhebungsbogen wird ohne Personendaten ausgefüllt und außerhalb des Repositories abgelegt | B | Ablagevermerk |

Hinweis: Auch wenn nur synthetische Daten verarbeitet werden, können Konten von Testteilnehmenden (Mailadresse für
Einladung) personenbezogen sein. Ob und wie das in Stufe 1 zu behandeln ist (z. B. Wegwerf-Adressen), ist durch B
festzulegen; rechtliche Bewertung **extern**.

### 3.2 Stufe 2: Anonymisiert

Anonymisiert bedeutet im Sinne dieses Rahmens: Aus dem Material ist **keine Person und kein Pilotbetrieb mehr
identifizierbar**, auch nicht durch Kombination von Merkmalen (Qualifikationskombination, seltene Dienstmuster, kleine
Gruppen). „Pseudonymisiert" (Namen durch Kürzel ersetzt, Zuordnungsliste existiert) ist **nicht** anonymisiert und fällt
unter Stufe 3.

| Nr | Voraussetzung | Zuständig | Nachweis |
|---|---|---|---|
| 2.1 | Alle Voraussetzungen von Stufe 1 | B, P | siehe 3.1 |
| 2.2 | Schriftliche **Anonymisierungsregel**: welche Felder entfallen, welche vergröbert werden (Zeiten auf Raster, Qualifikationen auf Stufen, Gruppen mindestens 3 Personen), keine Rückführungstabelle | B | Regeldokument |
| 2.3 | Anonymisierung erfolgt **beim Pilotbetrieb oder unter dessen Kontrolle**, bevor Material den Betrieb verlässt; Originale verlassen den Betrieb nicht | P, B | Bestätigung des Betriebs |
| 2.4 | **Prüfung auf Rückführbarkeit** durch eine zweite Person (Vier-Augen), bevor Material geladen wird | B, P | Prüfprotokoll |
| 2.5 | Bewertung, ob verbleibende Restrisiken (kleine Betriebe, wenige Personen mit seltener Qualifikation) eine Personenbezüglichkeit erhalten | X (Datenschutzbeauftragte/r) | Stellungnahme, **offen** |
| 2.6 | Material wird nur in den getrennten Testmandanten geladen, nicht ins Repository, nicht in Tickets/Chats | B | Ladeprotokoll |
| 2.7 | Beteiligung der Mitbestimmung/Vertretung, falls vorhanden und betroffen (z. B. wenn Auswertungsmuster der Belegschaft Rückschlüsse zulassen) | P, X | Bestätigung oder dokumentierte Entscheidung der zuständigen Stelle |
| 2.8 | Bei Unsicherheit über Anonymität: Stufe 2 wird **nicht** begonnen; das Material wird wie Stufe 3 behandelt oder verworfen | B | Entscheidungsvermerk |

### 3.3 Stufe 3: Kontrollierte Echtdaten

Alle folgenden Voraussetzungen müssen **vor dem ersten Datensatz** erfüllt sein. Fehlt eine, beginnt Stufe 3 nicht.

| Nr | Voraussetzung | Zuständig | Nachweis | Status |
|---|---|---|---|---|
| 3.1 | Alle Voraussetzungen der Stufen 1 und 2 (soweit zutreffend) | B, P | siehe oben | |
| 3.2 | **Auftragsverarbeitungsvertrag** zwischen Pilotbetrieb (Verantwortlicher) und Betreiber (Auftragsverarbeiter) mit technischen und organisatorischen Maßnahmen; Unterauftragsverarbeiter (z. B. Hosting) geklärt | B, P, X | unterzeichneter Vertrag mit Anlagen | **extern offen**: Muster und Prüfung durch Kanzlei |
| 3.3 | **Pilotvereinbarung** (Vollfassung): Zweck, Datenarten, Betroffenengruppen, Dauer, Ansprechpartner, Meldewege bei Vorfällen, Rückgabe/Löschung, Haftungs- und Kostenregelung | B, P, X | unterzeichnete Vereinbarung | **extern offen** |
| 3.4 | **Datenschutz-Freigabe** durch die zuständige Stelle des Pilotbetriebs (Verantwortlicher; ggf. Datenschutzbeauftragte/r): Rechtsgrundlage, Verzeichnis der Verarbeitungstätigkeiten, Information der Beschäftigten, Prüfung der Erforderlichkeit einer Datenschutz-Folgenabschätzung | P, X | schriftliche Freigabe mit Datum und Umfang | **extern offen** |
| 3.5 | **Betriebsrat/Mitbestimmung, falls vorhanden:** Beteiligung vor Einführung von Zeiterfassung und Planungssoftware, Betriebsvereinbarung oder dokumentierte Zustimmung/Entscheidung; falls kein Betriebsrat: dokumentierte Information und Einbeziehung der Beschäftigten nach den im Betrieb geltenden Regeln | P, X | Betriebsvereinbarung/Beschluss bzw. Vermerk (Prüfung **extern**, `E-19`) | **extern offen** |
| 3.6 | Für Pflege: Prüfung, ob zusätzliche Regeln für Gesundheits-/Bewohnerbezug oder kirchliche Datenschutzregelungen gelten. Für Sicherheit: Prüfung, ob Auftraggeberverträge Vorgaben zu Personalnachweisen/Datenweitergabe enthalten | P, X | Prüfvermerk | **extern offen** |
| 3.7 | Information der betroffenen Beschäftigten (Datenschutzhinweis, Zweck, Rechte, Ansprechstelle) | P | Hinweisdokument, Verteilnachweis | **extern**: Inhalt prüfen |
| 3.8 | Rechtstexte der Anwendung (Datenschutzerklärung, AGB) ohne Platzhalter | B, X | WP-36, `E-18` | **extern offen** (WP-36 blockiert) |
| 3.9 | **Pilotmandant technisch vorbereitet:** eigener Mandant, Rollen und Rechtematrix geprüft, Zugangswege abgesichert (personengebundene Konten, Betreiber-2FA), Sicherung und Wiederherstellung geprüft, Löschlauf und Auskunft funktionsfähig | B | Abnahmeprotokoll (Bezug: WP-18, WP-26, WP-32d, WP-04, WP-25, E-7, E-10) | teilweise offen, siehe `work-packages.json` |
| 3.10 | **Datenumfang schriftlich begrenzt:** welche Felder, welche Personengruppen, welcher Zeitraum; keine Gesundheitsdaten, keine Bewohner-/Klientendaten, keine Fotos | B, P | Umfangsliste | |
| 3.11 | **Meldewege bei Datenschutzvorfällen** vereinbart (Fristen, Kontakt-Rollen) | B, P, X | Vorfallregelung im AVV/Pilotvereinbarung | **extern** |
| 3.12 | **Ausstiegsplan** (Rückgabe/Löschung nach Pilotende, Bestätigung) | B, P | dokumentierter Plan | |
| 3.13 | **Freigabeentscheidung des Betreibers** (Stufenwechsel-Protokoll, Abschnitt 5) | B | Protokoll | |
| 3.14 | Pilotstart gemäß Gesamtfreigabe (Endabnahme, zwei Wochen ohne P0/P1 gemäß `E-24`) | B | Abnahmenachweis | offen |

---

## 4. Nicht erlaubt in allen Stufen

- Echte Namen, Kontaktdaten, Geburtsdaten, Gesundheitsangaben, Bewohner-/Klientendaten oder Sachkunde- bzw.
  Qualifikationsnachweise realer Personen in Stufe 1 und 2.
- Echtdaten in Repository, Issues, Pull-Requests, Chat-Verläufen, Fehlerberichten, Screenshots, Prompt-Eingaben an
  externe KI-Dienste oder lokalen Testdateien.
- Kopieren von Echtdaten aus Stufe 3 in Demo-, Entwicklungs- oder Testmandanten.
- Mündliche „Freigaben" als Ersatz für Dokumente.
- Aussagen gegenüber Dritten, das System sei rechtlich freigegeben oder datenschutzzertifiziert.
- Aktivierung von Intelligence-/KI-Funktionen mit Pilot-Echtdaten, solange die dafür vorgesehenen externen Prüfungen
  (Anbieter, Auftragsverarbeitung, DSFA, Einordnung; `E-25` bis `E-27`) nicht abgeschlossen sind.
- Umgehung durch Aufteilen in kleine Datenmengen, Anonymisierung „zum Schein" oder Verlagerung auf private Geräte/Konten.

---

## 5. Stufenwechsel-Protokoll (Vorlage)

Wird bei jedem Stufenwechsel ausgefüllt und außerhalb des öffentlichen Repositories abgelegt.

| Feld | Eintrag |
|---|---|
| Pilotbetrieb (A oder B, kein Klarname im Repository) | |
| Von Stufe → nach Stufe | |
| Datum, freigebende Person (Rolle) | |
| Voraussetzungen erfüllt (Nr. aus Abschnitt 3 mit Nachweis-Verweis) | |
| Offene externe Punkte (müssen leer sein für Stufe 3) | |
| Datenumfang und Zeitraum | |
| Gültig bis | |
| Ausstiegsplan vorhanden (ja/nein) | |
| Entscheidung (freigegeben / abgelehnt / zurückgestellt) | |

**Zurückstufung:** Wird eine Voraussetzung nachträglich hinfällig (Vertrag läuft aus, Betriebsvereinbarung gekündigt,
Vorfall), werden keine neuen Echtdaten mehr verarbeitet, bis die Voraussetzung wieder erfüllt ist; Löschung/Rückgabe
nach Ausstiegsplan.

---

## 6. Übersicht externer offener Punkte

Diese Punkte werden in diesem Dokument **nicht entschieden** und nicht als erledigt dargestellt.

| Nr | Punkt | Zuständig | Bezug |
|---|---|---|---|
| X1 | Muster Auftragsverarbeitungsvertrag, Unterauftragsverarbeiter, TOM-Anlage | Kanzlei | 3.2 |
| X2 | Muster Pilotvereinbarung (leicht und voll) | Kanzlei | 1.1, 3.3 |
| X3 | Rechtsgrundlagen der Verarbeitung im Pilotbetrieb, Notwendigkeit einer Datenschutz-Folgenabschätzung | Datenschutzbeauftragte/r, Kanzlei | 3.4 |
| X4 | Mitbestimmung (Betriebsrat, Mitarbeitervertretung, kirchliche Regelung falls zutreffend), Betriebsvereinbarung bzw. Einbeziehung der Beschäftigten | Pilotbetrieb, Kanzlei | 3.5, `E-19` |
| X5 | Anonymisierungsgüte und Restrisiko | Datenschutzbeauftragte/r | 2.5 |
| X6 | Besondere Vorgaben Pflege (Gesundheits-/Bewohnerbezug, kirchliche Datenschutzregelung) | Kanzlei | 3.6 |
| X7 | Besondere Vorgaben Sicherheit (Auftraggeberverträge, Personalnachweise) | Kanzlei | 3.6 |
| X8 | Rechtstexte der Anwendung | Kanzlei | 3.8, `E-18` |
| X9 | Aufbewahrungs- und Löschfristen für Wachbuch, Zeiterfassung, Lohnexport | Kanzlei, Steuerberatung | `WP19-OFFENE-FACHNACHWEISE.md` |
| X10 | Vorfallmeldewege und Verantwortlichkeiten im Pilot | Kanzlei, Datenschutzbeauftragte/r | 3.11 |

## 7. Fragen an den Betreiber

1. Gibt es bereits Muster für Auftragsverarbeitungsvertrag und Pilotvereinbarung oder soll die Kanzlei beauftragt werden?
2. Ist ein Datenschutzbeauftragter benannt (Betreiber) bzw. beim Pilotbetrieb (Verantwortlicher)?
3. Soll Stufe 2 (anonymisiert) für beide Piloten durchlaufen werden oder sollen Piloten direkt von Stufe 1 auf Stufe 3 gehen,
   sobald alle Voraussetzungen vorliegen?
4. Welcher Mandant (Staging oder Produktion) soll in Stufe 3 für die Piloten genutzt werden?
