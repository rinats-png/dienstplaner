# Intelligence-Gateway — offene Fragen (fachlich/rechtlich), Stand 2026-11-06

Aus WP-I13 / WP-I15 (Attrappe-Stand). Nichts davon ist im Code „entschieden“; wo eine Annahme nötig war, steht sie hier.

| # | Frage | Was im Code gilt bis zur Entscheidung | Wer |
|---|---|---|---|
| 1 | **Startstufen** für F6, F13, F16, F17, F18 fehlen in Spez. 6.3; F8/F7B hängen an der Sichtung. | Router liefert `null`, Gateway verweigert die Funktion (`KI_FUNKTION`). | Produkt (Betreiber) |
| 2 | **Limit für Beschäftigte (F9 Hilfe-Assistent)**: Spez. 7.3 nennt nur Planer/Leitung/Sub-Planer. | Rolle `mitarbeiter` hat kein Limit-Eintrag → gesperrt. (Schichtverantwortung ist ohnehin nicht zugelassen, positivliste B-5.) | Produkt |
| 3 | **Satzbausteinkatalog** je Funktion (Spez. 5, „Bausteine und Ergänzungsregeln“) liegt nicht vor. | Prüfer lehnt jeden Baustein ohne Katalog ab; Text ist nur nach den strengen Prüfregeln (nur Paketwerte) zulässig. | Fachlich + Rechtstexte |
| 4 | **Prüfer P-01…P-10**: die Spezifikation führt keine nummerierte Liste mit Inhalt. | Interne Codes P-01…P-09 (Bedeutung in `pruefer.mjs`); nicht mit Spezifikation abgestimmt. | Review |
| 5 | **Liste verbotener Merkmale** (Gesundheit, Leistung, Fehlzeiten, Zuverlässigkeit …) | Startliste von Wortstämmen in `pruefer.mjs`; Sperrliste des Betriebs ergänzt. Vollständigkeit/Rechtsprüfung offen. | Datenschutz/Recht |
| 6 | **Kostenrechnung**: Preise je Token/Modell sind unbestätigt (Spez. 7.8 „Schätzung“). | Es werden nur Intelligence-Einheiten (IE) gezählt, keine Geldbeträge. Euro-Tagesbudget (7.5) nicht umgesetzt. | Betreiber |
| 7 | **Klasse A ohne Obergrenze?** Spez. 7.4: „darf bis 50 % über das Kontingent gehen … Keine Abschaltung mitten im Einsatz ohne Prüfung durch einen Menschen.“ | Geschäftslimits sperren A nie; Hinweis `ueberKontingent` ab 150 %. Als Notbremse ein **absolutes Tagesdach** `gesamtHartTagesIE` (nicht in der Spezifikation; technische Sicherung gegen Zählfehler/Missbrauch). Wert muss der Betreiber setzen. | Produkt + Betreiber |
| 8 | **Erstattung bei technischem Ausfall**: gehen IE zurück, wenn der Anbieter nichts geliefert hat? | Ja (einmal); Prüferabweisung zählt. Spez. 7.4 sagt nur „eine Aktion zählt einmal“. | Produkt |
| 9 | **Pausierung (Betriebsrat/Personalrat/MAV)** — Mitbestimmung vor Modellaufruf (WP-I16). | Haken `betriebAktiv(sitzung)`; Vorgabe `false` → `KI_PAUSIERT`. Die Fachlogik (Frage bei Einrichtung, Bestätigung) fehlt. | Recht/Mitbestimmung |
| 10 | **Persistenz der Zähler** (append-only + Rollup, WP-I15): bis dahin Prozessspeicher. | Nach Neustart beginnen Zähler bei 0 — vor Live-Anbieter ersetzen. | Technik |
| 11 | **Tageszeitzone**: Tages-/Monatsgrenzen für Limits | UTC (`toISOString`). Fachlich eher Europe/Berlin. | Produkt |
| 12 | **Modellort „lokal“** (kein Drittland): Datenminimierung lockert sich laut WP-I11 nur dort. | Attrappe und Live-Stumpf melden „extern“ (strengster Pfad); Konfiguration des Orts allein beim Betreiber. | Betreiber/Recht |
| 13 | **Zahlwörter** „halb“, „Dutzend“, „Viertel“, römische Ziffern im Modelltext | Nicht erkannt (Prüfer-Lücke, dokumentiert). | Review |
| 14 | **Namensbenennung der Nachweise**: Auftrag nennt `wpI<nn>-nachweis.md`, die Konvention im Repo ist `wp-i11-nachweis.md`. | Es gilt die Repo-Konvention (`wp-i13-…`, `wp-i15-…`). | Orchestrator |

Voraussetzungen für einen späteren Anbieteranschluss (WP-I18) stehen in `wp-i11-nachweis.md` und `wp-i13-nachweis.md` — **Betreiberfreigabe erforderlich**, nichts davon ist hier vorweggenommen.
