# WP-19.1 – Modul Posten (Sicherheitsdienst) – Nachweis

Branch `acc45/frontend/wp19-1-posten`, Basis `origin/integration/release-v4` @ `51a6dfc0`. Prozessstufe L3, SICHERHEIT-QUALITAET.

## Blocker-Klassifikation

Status BLOCKED, `pr: []`. Die einzige Abhängigkeit WP-19.0 ist INTEGRATED (#82), der Einhängepunkt `src/module/index.js` steht.
Der Blocker ist **bereits aufgehoben** (technische Voraussetzung erledigt); es blieb **echte Implementierung** (Plan Abschnitt 1:
Pflege, Einteilungsoberfläche, Alleinarbeit, Übernahme Bestand). Ein Teil bleibt **Betreiberentscheidung** (siehe Rückfragen).

## Abgleich Plan ↔ Repo-Ist

| Plan „Fehlt" | Ist vorher | Jetzt |
|---|---|---|
| Pflege Objekte/Posten | nur Server-Datenmodell | `PostenPflege` (Ort `betrieb`), Entwurf, `pruefeObjekte` vor Übernahme |
| Einteilungsoberfläche | nur Übersicht | Auswahlfeld je Person im Tagesbereich (nur mit Schreibweg) |
| Alleinarbeit (P4) | Feld fehlte | `alleinarbeit`, `gefaehrdungsbeurteilung` (Verweistext), Hinweis bei Einzelbesetzung, ohne Namen, ohne Notsignal-Zusage |
| Übernahme Bestand (G10 a) | fehlte | `objekteAusDienstarten`: nur Vorschlag, wiederholbar, ohne Pflicht |
| unbekannter Posten (Negativtest Plan) | Server prüfte nur Kennungsform | neue/geänderte Einträge müssen auf einen Posten der Objekte zeigen; Altbestand blockiert nicht |
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

## Tests (TZ=UTC, `--maxWorkers=1`)

Rot vor dem Code: `modul-posten-pflege.test.js` 23 von 25 rot. Grün danach: 25/25.

| Datei | Ergebnis |
|---|---|
| modul-posten-pflege (neu), modul-posten, modul-kern-oberflaeche, modul-wachbuch, modul-objektbericht, branchen-app | 25, 20, 14, 35, 17, 3 grün |
| modul-inert | 9 von 84 in 300 s Zeitgrenze durchgelaufen, kein Fehlschlag (Last des Rechners); Rest in CI |
| v4-3b-querschnitt-1/-2, v4-3b-selbsttest | je 14 grün, Messwert unverändert (keine neue Ansichtsdatei) |
| prozess-wachen | grün (Testdatei mit `// zeit-ok`) |
| modul-rechte-wp19 | 54 grün |
| modul-b1-schreibweg (16) mit modul-rechte-wp19 (54) | 70 grün |
| eslint, `tsc -p jsconfig.json`, `verdrahtung-pruefen`, `acc45-backlog pruefen` | sauber |

Angepasste bestehende Tests (Begründung): `modul-posten.test.js` Zeile „WP-19 B1 … speichert keine Rolle“: der Fall „nur Postenplan ohne Objekte“ trägt jetzt `m.objekte = OBJEKTE`. Grund: Ein Eintrag auf einen unbekannten Posten wird nun schon vorher als „unbekannter Posten“ abgewiesen; die Absicht des Tests (Modulsperre bei Status geplant) bleibt unverändert und stärker nicht abgeschwächt. Die V4-Tests blieben unverändert, weil die Oberfläche in der vorhandenen Datei `posten.jsx` bleibt und nur Token (`var(--v4-r-klein)`) nutzt.
`modul-kern-oberflaeche`: unverändert; deshalb hängt Pflege und Einteilung an der einen Posten-Oberfläche (Ort `tag`), nicht als zweiter Eintrag.

## Mutationen (je Schutz einzeln, Datei danach wiederhergestellt)

| Nr | Schutz | Mutation | Ergebnis |
|---|---|---|---|
| 1 | unbekannter Posten (Server) | Prüfung abgeschaltet | 4 Tests rot |
| 2 | Schreibweg nur Leitung/Planung | `subplaner` erlaubt | 1 rot |
| 3 | Entfernen nur ohne Einteilung | Sperre aus | 1 rot |
| 4 | Alleinarbeit ist Wahrheitswert | Prüfung aus | 1 rot |
| 5 | Hinweis nur bei genau einer Person | `anzahl < 1` | 1 rot |
| 6 | Einteilungsfelder nur mit Schreibweg | Bedingung entfernt | 2 rot |
