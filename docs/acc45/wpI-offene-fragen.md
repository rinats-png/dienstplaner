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

## Nachtrag 2026-11-06 (Review, I14, I15-Rest)

| # | Frage | Was im Code gilt | Wer |
|---|---|---|---|
| 15 | **Alias-Kontext bei Ergebnis-Speicher**: stabile Alias für gleiche Anfragen (Voraussetzung für Treffer) bedeuten, dass derselbe Mensch innerhalb Raum/Betrieb/Schlüssel in gleichen Anfragen denselben Alias trägt. Datenschutzrechtlich akzeptabel? | Nur aktiv, wenn `ergebnisSpeicher` übergeben wird; sonst zufälliger Kontext je Vorgang. | Datenschutz |
| 16 | **Fristen** Ergebnis 30 / Kontext 90 Tage und Speicherort `centric-ki-lauf` (Klasse C) | Spezifikationswerte, der Betreiber kann nur kürzen. | Betreiber/Recht |
| 17 | **Wer führt Löschlauf und Raumlöschung aus?** | `aufraeumen()`/`raumLoeschen()` existieren; nicht in `datenschutzlauf.mjs`/`raumloeschung.mjs` eingehängt. | Technik |
| 18 | **`schutz.mjs`-Eintrag `ki`/`ki-raum`** (Werte im Nachweis wp-i15) | Nur Vorschlag. | Technik |
| 19 | **Zeitzone der Tagesgrenzen / Monatswechsel** der Zähler | UTC. | Produkt |
| 20 | **Zahlen in anderen Sprachen** im Modelltext (z. B. französische Zahlwörter in lateinischer Schrift) | Nicht erkannt; die Antwortsprache ist per Anfrageschema „de“, der Prüfer kennt Deutsch und Englisch. | Review |
| 21 | **Haltezeit eines Adapters, der nie endet** (`haltenMaxMs`) | 5 Minuten, danach gilt der Platz als frei. | Betreiber |

| 22 | **Texte der Intelligence-Oberfläche** (Kennzeichnung "KI-Entwurf", Rückfall-, Pausen-, Fehlertexte) | Entwurfstexte in src/ansichten/intelligence/texte.js; Wortlaut der Pausenmeldung ohne "Ab [Uhrzeit]" (Wiederfreigabezeit kennt der Client nicht). Produkt und Mitbestimmung nicht abgestimmt. | Produkt/Mitbestimmung |
| 23 | **Serverpfade des Clients** (/ki/anfrage, /ki/auftrag/<id>) | Entwurf; Plan I13 nennt nur "/ki, /ki/*" mit 202 + Abfrage. | Technik |
| 24 | **Thinking Orb** (CI 5.4) | nicht gebaut; Fremdpaket, Prüfung/Pin nötig. | Technik |
