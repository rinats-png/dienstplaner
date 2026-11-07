# Exportformat der Vollausgabe (Ist-Stand)

**ENTWURF, nur Beschreibung des Ist-Stands** (Code: 2026-11-07). Keine Rechtsauskunft; keine Aussage, ob und wie der EU Data Act (Verordnung (EU) 2023/2854) auf CENTRIC anwendbar ist. Die Einordnung und Fristen/Prozesse (O-15) stehen aus.

## Weg und Berechtigung

- `GET /api/vollausgabe` (`server/funktionen/daten.mjs`, Abschnitt „Vollausgabe“). Zugriff: Organisationsleitung (`leitung`) mit Sitzung, oder ein Sicherungsschlüssel (`nurSicherung`, darf ausschließlich diesen Weg). Betreiber, Demo-Sitzungen und andere Rollen: 403.
- Mengenbremse `vollausgabe` (`server/lib/schutz.mjs`), Eintrag im Protokoll (`vollausgabe`).
- Ausgabe: genau der **eigene Betrieb**, nicht der Raum.
- Gleichwertig in der Oberfläche: Datenmitnahme als CSV (`src/speicher.js`, Ansicht Sicherung außer Haus) und Personenauskunft (`/api/auskunft`, eigenes JSON je Person, nicht Gegenstand dieses Dokuments).

## Format

Eine JSON-Datei (`content-disposition: attachment`, Dateiname `centric-<raum>-<zeitstempel>.json`).

| Feld | Inhalt |
|---|---|
| `centric` | Konstante `"vollausgabe"` |
| `fassung` | Formatversion, derzeit `2` |
| `umfang` | `"betrieb"` |
| `inhalt` | `"leitung"` oder `"sicherung"` (Exportkatalog, siehe unten) |
| `erzeugt` | ISO-Zeitstempel |
| `raum`, `mandantId` | Kennungen von Raum und Betrieb |
| `stand` | Speicherstand (Konfliktzähler) |
| `bestand` | `{ version, stand, mandanten: [ <ein Betrieb> ] }` |

### Inhalt des Betriebs

`server/lib/sicherungen.mjs` (`exportBetrieb`, `EXPORT_BETRIEB`, `EXPORT_PERSON`) mit den Katalogen aus `server/lib/sicht.mjs` (`VOLL_BETRIEB`, `VOLL_PERSON`, `PERSONENFELDER`). Es ist ein Positivkatalog: Was nicht darin steht, geht nicht hinaus, auch kein neues Feld.

- **Betriebsfelder** (`VOLL_BETRIEB`, 76 Felder, Stand dieses Dokuments): Stammdaten und Regelwerk (`name`, `branche`, `bundesland`, `einheiten`, `dienstarten`, `zyklus`, `einstellungen`, `matrix`, `qualifikationen`, `tarifwerk`, `pakete`, `status` …), Personen, Abwesenheiten, Anfragen/Wünsche, Plan- und Freigabestände, Erfassung/Zeiten (`erfassung`, `einstempeln`, `monatsabschluss`), Kommunikation (`nachrichten`, `dienstbuch`, `uebergaben`, `aushaenge`), Aufbewahrungseinstellungen und **Moduldaten** (`objekte`, `postenPlan`, `bereichsPlan`, `wachbuch`, `bereitschaftStufen`, `bereitschaft`, `funktionsbereiche`, `funktionsPlan`, `rotationen`, `pflegeNiveaus`, `betriebsmittel`, `sondereinsaetze`). Maßgeblich ist immer die Liste im Code.
- **Personenfelder:** Umfang `leitung` = `VOLL_PERSON` ohne technische Geheimnisse; Umfang `sicherung` = alle `PERSONENFELDER` ohne technische Geheimnisse (zusätzlich Bank-, Steuer-, Sozialversicherungs-, Lohnangaben, Notfallkontakt, frühere E-Mail-Adresse).
- **Nie enthalten:** technische Geheimnisse (`kalenderGeheim`, `kalenderVerweis`, `kalenderStand`, `pushSchluessel`, `zustellung`), Betreiberinterna (`tarif`, `preisgestaltung`, `rabattGrund`, `seit`, `bis`, `testTage`, `selbstAngelegt`, `kontakt`, `kontaktName`, `anschrift`, `ustId`, `notiz`, `raum`), Daten anderer Betriebe, Sitzungen, Zugangscodes, Mail- und Protokollspuren des Servers.

## Prüfung

`pruefungen/vollausgabe.test.js` (Abschnitt „Vollständigkeit: alle Felder aus VOLL_BETRIEB“): jedes Katalogfeld erscheint unverändert in beiden Umfängen, jedes Personenfeld des Umfangs ebenso, die Moduldaten gehen hinaus; Geheimnisse und Betreiberinterna nicht.

## Lücken und offene Punkte

1. **Kein Schema.** Es gibt keine maschinenlesbare Schemadatei (JSON Schema/Datenwörterbuch); Feldnamen sind die internen Namen, ohne Typ- und Bedeutungsbeschreibung. Das Format ist ein Datenexport und ausdrücklich kein Wiederherstellungsformat (Kommentar in `sicherungen.mjs`).
2. **Nur JSON für den Gesamtbestand**, daneben CSV-Auszüge in der Oberfläche. Kein standardisiertes, gängiges Austauschformat (z. B. je Entität CSV mit Schema).
3. **Nicht enthalten** sind serverseitige Daten außerhalb des Bestands: Protokoll/Spur, Zustellprotokoll, Konten, Anmelde- und Sitzungsdaten, Sicherungskopien. Die Personenauskunft deckt einen Teil davon je Person ab.
4. **Maximalumfang `leitung` ohne Personaldaten** (Bank, Steuer-ID usw.): nur mit Sicherungsschlüssel (`sicherung`). Ob das für ein Herausgabeverlangen der Kundschaft passt, ist ungeklärt.
5. **Löschung nach Vertragsende, Fristen, Prozess** der Herausgabe sind nicht technisch geregelt (Betreiberentscheidung O-15, Rechtsprüfung offen).
6. Asynchrone/große Bestände: die Ausgabe erfolgt in einer Antwort; Grenzen für sehr große Betriebe sind nicht gemessen.
