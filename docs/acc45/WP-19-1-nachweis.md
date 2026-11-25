# WP-19.1 – Modul Posten (Sicherheitsdienst) – Nachweis

Branch `acc45/frontend/wp19-1-posten`, Basis `origin/integration/release-v4` @ `51a6dfc0`. Prozessstufe L3, SICHERHEIT-QUALITAET.

## Blocker-Klassifikation

Status BLOCKED, `pr: []`. Die einzige Abhängigkeit WP-19.0 ist INTEGRATED (#82), der Einhängepunkt `src/module/index.js` steht.
Der Blocker ist **bereits aufgehoben** (technische Voraussetzung erledigt); es blieb **echte Implementierung** (Plan Abschnitt 1:
Pflege, Einteilungsoberfläche, Alleinarbeit, Übernahme Bestand). Ein Teil bleibt **Betreiberentscheidung** (siehe Rückfragen).

## Abgleich Plan ↔ Repo-Ist

| Plan „Fehlt" | Ist vorher | Jetzt |
|---|---|---|
| Pflege Objekte/Posten | nur Server-Datenmodell | `PostenPflege` (`src/module/posten-pflege.js`, am Ort `tag` unter der Übersicht), Entwurf, `pruefeObjekte` vor Übernahme |
| Einteilungsoberfläche | nur Übersicht | Auswahlfeld je Person im Tagesbereich (nur mit Schreibweg) |
| Alleinarbeit (P4) | Feld fehlte | `alleinarbeit`, `gefaehrdungsbeurteilung` (Verweistext), Hinweis bei Einzelbesetzung, ohne Namen, ohne Notsignal-Zusage |
| Übernahme Bestand (G10 a) | fehlte | `objekteAusDienstarten`: nur Vorschlag, wiederholbar, ohne Pflicht |
| unbekannter Posten (Negativtest Plan) | Server prüfte nur Kennungsform | neue/geänderte Einträge müssen auf einen Posten der Objekte zeigen; Altbestand blockiert nicht; nicht auf dem Ausnahmeweg Art. 16/17 (dort prüft das Wertschema, F6) |
| verwaiste Einteilung | Entfernen eines Posten über `objekte` ließ Einteilungen zurück | Server: ein Posten, der in diesem Schreibvorgang entfällt, darf keine Einteilung behalten (Review-Hinweis, billig) |
| Aufwandsbudget (#561/#563/#566) | `postenLage` je Posten ein Durchlauf über alle Personen | ein Durchlauf über die Personen |
| Postenwechsel im Dienst | fehlte | **nicht gebaut** (Rückfrage 1) |
| SV schreibt Einteilung im Bereich | Server: Leitung vorbehalten | **unverändert geschlossen** (Rückfrage 2) |
| E2E | – | gehört zu WP-19.13 (SSOT-Feld `tests`), hier nicht |

## Sicherheit

- Schreibweg der Oberfläche nur für Leitung und Planung (`postenSchreibenFuer`, fail-closed), nur die Felder `objekte` und `postenPlan`; der Server prüft unverändert (SV/MA/BR: abgewiesen).
- Sicht unverändert (Positivkatalog): Beschäftigte nur eigene Einteilung und Objekte mit Einteilung, BR nichts. Einteilungsfelder stehen nur dort, wo Namen ohnehin sichtbar sind.
- Kein neuer Import-/Wiederherstellungsweg: die Übernahme läuft über den gewöhnlichen, geprüften Speicherweg (`postenZusammen`).
- Modul bleibt `geplant`/Vorgabe AUS; nichts aktiviert. Keine Registerregel, keine Workflow-Änderung.

## Rückfragen an den Betreiber

1. **Postenwechsel innerhalb eines Dienstes (06–14 erst Pforte, ab 10 Uhr Streife)?** Heute ein Posten je Person und Tag (`Person|Tag`). Zeitabschnitte brauchen ein neues Datenmodell mit Folgen für Sicht, Auskunft, Wachbuch, Objektbericht (Opus-Review). Empfehlung: erst nach Pilot-Bedarf; bis dahin zwei Tagesposten nicht abbildbar. Alternative: Abschnitte als zweite Einteilungsebene `Person|Tag|Abschnitt` (abwärtskompatibel). Ersparnis ohne: ca. 1 PT.
2. **Darf die Schichtverantwortung im eigenen Bereich am Tag einteilen?** Plan-Lesart ja, Rechtematrix und Test: nein. Empfehlung: geschlossen lassen (Aufenthaltsort-Schutz). Alternative: wie `bereichsPlanSchicht` (nur eigener Bereich am Tag).
3. P3-Aufwertung der Qualifikationshinweise und § 34a-Zuordnung bleiben bei Rechts-/Fachprüfung (unverändert).

## Aufbau nach Review #569 (V4-Pins)

`pruefungen/v4-3b-branchenmodule.test.js` fixiert `kern.jsx` und `posten.jsx` byte-genau gegen die Basis. Deshalb:
- `posten.jsx` ist **unverändert** (Basis). Alleinarbeit, Einteilung und Pflege stehen in der neuen Datei `src/module/posten-pflege.js` (kein JSX, zählt nicht zu den 13 Ansichtsdateien des V4-Inventars; nur Token `var(--v4-r-klein)`).
- `kern.jsx` hat drei Ein-Zeilen-Änderungen (das Aktionsobjekt `akt` an die Oberflächen durchreichen). Der Test setzt genau diese Stellen in der Rückrechnung auf den Basistext zurück (`WP191_RUECK`, je genau einmal): Der Beleg „sonst byte-gleich zur Basis“ bleibt voll; Messwerte (876 Zeilen, 115 Inline-Stile, 13 Dateien) sind unverändert. Das ist die einzige Änderung an dieser Testdatei, nichts abgeschwächt.
- Die Prüfung „bekannter Posten“ greift nicht auf dem Ausnahmeweg Art. 16/17 (`rechte.mjs`: `postenZusammen(…, { bekannt: moduldatenAusnahme === undefined })`). `modul-kern-nachtrag3` (F6) bleibt unverändert grün.

## Tests (TZ=UTC, `--maxWorkers=1`, einzeln, Ausgabe je Datei)

Rot vor dem Code: `modul-posten-pflege.test.js` 23 von 25 rot.

Alle `pruefungen/v4-3b-*.test.js` einzeln gelaufen, alle grün (betreiber 12, branchenmodule 12, einstellungen 10, einstieg 14, import 13, lage 8, personal 21, plan 11, querschnitt-1 14, querschnitt-2 14, selbsttest 14, speicherlage 12, telefonschale 13, zeit 8; `v4-3b-branchenmodule` zuvor 4 rot in CI, jetzt 12/12).
Weiter grün: modul-kern-nachtrag 41, -2 37, -3 25 (F6 unverändert), -handler 3, -4 17, -4-handler 2, -5-handler 5, -5-speicher 6; modul-posten-pflege 28 (neu); modul-posten 20; modul-kern-oberflaeche 14; prozess-wachen 15; modul-rechte-wp19 54; modul-b1-schreibweg 16, modul-wachbuch 35, modul-objektbericht 17, branchen-app 3 (frühere Läufe). `modul-inert`: nur teilweise (Zeitgrenze, kein Fehlschlag), Rest CI. eslint, `tsc -p jsconfig.json`, `verdrahtung-pruefen`, `acc45-backlog pruefen` sauber.

Angepasste bestehende Tests (Begründung):
- `modul-posten.test.js`, Fall „WP-19 B1 … speichert keine Rolle“: der Fall „nur Postenplan“ trägt `m.objekte = OBJEKTE`. Grund: Ein Eintrag auf einen unbekannten Posten wird nun vor der Modulsperre abgewiesen; die Testabsicht (Modulsperre bei Status geplant) bleibt.
- `v4-3b-branchenmodule.test.js`: Rückrechnung um die drei kern.jsx-Stellen erweitert (oben).

## Mutationen (je Schutz einzeln, Datei danach wiederhergestellt)

| Nr | Schutz | Mutation | Ergebnis |
|---|---|---|---|
| 1 | unbekannter Posten (Server) | Prüfung abgeschaltet | 4 Tests rot |
| 2 | Schreibweg nur Leitung/Planung | `subplaner` erlaubt | 1 rot |
| 3 | Entfernen nur ohne Einteilung | Sperre aus | 1 rot |
| 4 | Alleinarbeit ist Wahrheitswert | Prüfung aus | 1 rot |
| 5 | Hinweis nur bei genau einer Person | `anzahl < 1` | 1 rot |
| 6 | Einteilungsfelder nur mit Schreibweg | Bedingung entfernt | 2 rot |
| 7 | verwaiste Einteilung beim Entfernen eines Posten (Review-Hinweis) | Prüfung aus | 1 rot |
Ausnahmeweg-Umgehung der Bekannt-Prüfung: durch den unveränderten F6-Test und den neuen Fall `bekannt: false` belegt.

Nicht blockierende Hinweise des Reviews: E2E und Postenwechsel/SV-Schreibweg bleiben offen (Rückfragen unverändert).
