# CENTRIC Intelligence – eigener Entwicklungsblock (Plan)

Stand: 2026-11-03 · Status: **Vorschlag zur Freigabe, nichts davon ist beschlossen oder begonnen.** Dieser Plan ändert keinen Produktcode.
Grundlage: [`INTELLIGENCE-ABGLEICH.md`](INTELLIGENCE-ABGLEICH.md) (Ist-Stand gegen Code) und `docs/intelligence/*` (Fassung 7 hat Vorrang vor `INTELLIGENCE.md` und der Spezifikation 1.0).
Alle Aufwandszahlen sind **SCHÄTZUNGEN (nicht belegt)**; Einheit PT = Personentage menschliches Äquivalent wie in ACC45; Begründung und Unsicherheit stehen je Paket.

## 1. Abgrenzung zu ACC45

- Intelligence ist **kein ACC45-Paket**. Stand bei Abfassung: `work-packages.json` (46 Pakete, 165,5 PT offen laut damaligem `STATUS.md`) enthielt sie nicht; seit 2026-11-03 stehen die Pakete dort im eigenen Strang `intelligence` mit getrennter Summe (aktuelle Zahlen: `STATUS.md`, `GESAMTPLAN.md`); der kritische Pfad endet bei WP-42 ohne Intelligence. Diese Zählung bleibt unverändert; die Pakete hier heißen **WP-I1 … WP-I37** und werden nirgends in die ACC45-Summe eingerechnet.
- **Branch-Namensraum:** `intelligence/wp-iN-…` (nicht `acc45/…`). Statusführung seit 2026-11-03 in `work-packages.json` im eigenen Strang `intelligence` mit eigener Summe (die ACC45-Zahlen bleiben getrennt); siehe `GESAMTPLAN.md`.
- **Intelligence blockiert ACC45 nie.** Kein ACC45-Paket hängt an einem WP-I. Umgekehrt dürfen WP-I-Branches erst nach den ACC45-Gates, die sie berühren, in den Integrationsstand (Abschnitt 4).
- Der **Kern ohne KI** (Block K) ist in Teilen ACC45-Arbeit gewesen (WP-10, WP-11, WP-22, Andockpunkt A3 in WP-19). Was dort fertig ist, wird nicht doppelt gebaut; Block K setzt genau auf dem Rest auf (laut Abgleich: 4 von 8 Regelarten, Verwaltung interner Vorgaben, Planer-Kern, Live-Prüfung im Schichtfolge-Editor).

## 2. Leitplanken (Teil des Auftrags, für jedes WP-I verbindlich)

1. Der deterministische Rechenkern berechnet Regeln und Zahlen. Sprachmodelle lesen, strukturieren, erklären und schlagen Varianten vor.
2. Jede kritische Zahl stammt aus einem **geprüften Faktenpaket** oder einer **deterministischen Gegenrechnung**; ein Prüfer verwirft Antworten mit fremden Zahlen/Kennungen.
3. **Kein Modell veröffentlicht einen Dienstplan.** KI-Endpunkte schreiben höchstens Entwürfe; Wirksamkeit nur durch einen berechtigten Menschen über den normalen Rechte- und Auditpfad; jede Übernahme läuft erneut durch die Schutzprüfung.
4. **Keine unberechtigte Übermittlung** von Klarnamen oder Gesundheitsdaten an ein Modell (Alias statt Name, Positivliste, keine Abwesenheitsgründe/Schutzmerkmale/Kontaktdaten; Ausnahme nur F7B nach Schwärzung, Bestätigung und Freigabe).
5. **Vor produktiver Freigabe prüfen:** Anbieterbedingungen, DSGVO, Mitbestimmung, EU-KI-Verordnung (Abschnitt 8). Bis dahin nur Attrappe und synthetische Daten.
6. **Bei KI-Ausfall bleibt die Kernanwendung nutzbar** (degradierter Modus, CI 5.3); Test ist Abnahmepflicht.
7. Modellrouting (Haiku → Sonnet → Opus, nur nach oben), Kostenbegrenzung und Sicherheitsgrenzen sind aktiv, bevor das erste echte Modell läuft (Reihenfolge Abschnitt 6).
8. Kennzeichnung KI-gestützter Inhalte, Notschalter beim Betreiber, Betriebsrat-Pausierung (Abschnitt 7).

## 3. Phasen laut Spezifikation und Einordnung

| Phase | Quelle | Inhalt | Beginn nur wenn |
|---|---|---|---|
| **K** Kern ohne KI | Plan Abschnitt 8 (Schritte 1–3, 6), CI Abschnitt 9 „Neben den Phasen“ | Warnen/Sperren-Entscheidung, Live-Prüfung, interne Vorgaben, Planer-Kern | ACC45-Gates aus Abschnitt 4 erfüllt; unabhängig von Piloten |
| **0** | CI 9 | nur Kundengespräche (Phase-0-Fragen CI 13) | jetzt, ohne Entwicklung |
| **1** Plattform | CI 9, INTELLIGENCE.md §6 | Decision Engine, Faktenpaket, Gateway mit **Attrappe**, Router, Prüfer, Fingerprint, Registry, Limits, Schalter | P0 (Produktion, Rechtstexte, Überwachung, Sicherung) abgeschlossen, parallel zu ersten Piloten |
| **2** Echte Modelle für A und B | CI 9 | F7A/Altplan, F3/Funktion B, Testsätze, Schattenbetrieb, technischer Pilot 2–3 Betriebe (kostenlos), danach F1/F2/F9/F15/F16/F17 | ≥ 2 Piloten nutzen CENTRIC wöchentlich **und** A oder B als Schmerzpunkt bestätigt; Rechtsvoraussetzungen Abschnitt 8 |
| **2b** Sicherheitsbereich | CI 4.1 | F7B, F8 | DSFA, Zero-Data-Retention je Modell, Anbieterentscheidung (E-10), rechtliche Freigabe |
| **3** | CI 9 | weitere Funktionen nach Nachfrage, Preis/Kontingent | Phase-2-Kriterien erfüllt; F13/F18-Texte erst nach externer KI-VO-Einordnung |

Architecture Freeze (E-18): bis Ende Phase 1 keine neuen Funktionen in die Architektur; der Kern ohne KI ist ausgenommen.

## 4. Abhängigkeiten zu ACC45, Mitbestimmung und Recht

| Abhängigkeit | Wer hängt daran | Stand (2026-11-03) |
|---|---|---|
| **WP-11** Regelregister, eine Schutzprüfung | alle Faktenpakete (Regelkennung, Quelle, Fundstelle, Prüfstatus), Gegenrechnung | INTEGRATED |
| **WP-22** Fachprüfungen auf dem Server | I1, I12, I20 (Gegenrechnung serverseitig) | INTEGRATED |
| **WP-43** Personaldaten-Filter (Positivliste) | I11 Faktenpaket (CI 8.1 „Befund 1“ als Vorbedingung) | INTEGRATED |
| **WP-19** Branchenpakete / Baukasten-Andockpunkt A3 | I3 (gleiche Datei `server/lib/regelbaukasten.mjs`), I25 (Branchenregeln `provisional` dürfen nie als Recht erklärt werden) | IN_PROGRESS, wartet auf Fachentscheidungen |
| **WP-42** Endabnahme und Produktions-Rollout | alle I-Branches dürfen erst nach dem ACC45-Release in den Integrationsstand; kein I-Paket gehört in WP-42 | BLOCKED (hängt an WP-19) |
| **Fachentscheidung „warnen oder sperren“** (zurückgestellt, `STATUS.md`) | I1; Texte in F2/F17 | offen, vor Prod-Release vorzulegen |
| **Muster-BV / Mitbestimmung** (§ 87 BetrVG laut CI 8.2, Anlage 5) | I4 (interne Vorgaben), I9/I34 (Planvorschlag, Gutachten), I16 (Pausierung), I36 | Entwurf, Anwaltsprüfung nicht belegt |
| **P0 aus Roadmap** (Rechtstexte, Überwachung, Sicherung) | Beginn Phase 1 | laut `IST-STAND.md`/Roadmap offen |

## 5. Pakete

Spalten: **Ziel** · **Akzeptanz** (Kurzform; jedes Paket zusätzlich: bestehende Prüfungen grün, neue Tests in `npm run pruefung`, CI-Eintrag) · **Abhängig von** · **Dateibesitz / Konfliktzone** · **Sicherheit/Datenschutz** · **Entwicklungsmodell** · **PT (Schätzung)** mit Begründung und Unsicherheit (nied./mittel/hoch).

Neue Dateien liegen in konfliktfreien Verzeichnissen: `server/lib/intelligence/`, `server/lib/engine/`, `src/ki/`, `pruefungen/ki-*.test.js`.
**Geändert durch WP-I10** ([`ARCHITEKTUR-ABGLEICH.md`](../intelligence/ARCHITEKTUR-ABGLEICH.md), Stand 2026-11-03): Wo diese Tabellen noch `server/lib/ki/` nennen, gilt `server/lib/intelligence/` (Spezifikation und Plan-Erstfassung: `netlify/lib/ki/` bzw. `server/lib/ki/`). Der **Rechenkern liegt in `server/lib/engine/`** (reines ESM; `src/engine/index.js` nur als Re-Export), weil das Docker-Bild `src/` nicht enthält; wo die Tabellen `src/engine/…` für Rechenkern-Dateien nennen (I6, I7, I8, I12, I26, I28), gilt `server/lib/engine/…` mit Re-Export im Client. Architekturentscheidungen heißen **AD-01…** (nicht K-nn; K-nn bezeichnet die Konfigurationsparameter der Spezifikation). **Konfliktzonen** (Dateien, an denen auch ACC45 oder andere Pakete arbeiten): `src/App.jsx` (≈ 25.000 Zeilen; heiße Stellen: `Schichtfolge` 9229, `Import` 12332, `Prioritaeten` 16073, `Handbuch` 16428, `planeMonat` 3098, `ersatzVorschlaege` 2767, `BEFEHLE` 3786), `server/lib/regelbaukasten.mjs` und `src/regelregister.js` (WP-19), `server/lib/bestaetigungen.mjs`, `server/lib/rechte.mjs` + `RECHTEMATRIX.md`, `server/funktionen/daten.mjs`, `src/stufen.js`/`preisgestaltung.js`. Regel: Änderungen in `App.jsx` nur an benannten Stellen, nie am Stück verschieben außer in I12.

### Block K – Kern ohne KI

| WP | Ziel | Akzeptanz | Abh. | Dateibesitz / Konflikt | Sicherheit | Modell (Entw.) | PT |
|---|---|---|---|---|---|---|---|
| **I1** Warnen-oder-Sperren abschließen | Fachentscheidung umsetzen; `sperrt`-Flag je Befund konsistent mit E-19 oder dokumentierte Ausnahmen; Doku/Handbuch/Regelregister angleichen | Nach Entscheidung: kein Dialog bricht ohne Wahl ab ODER zwingende Sperren sind je Regel begründet; Test je Befundart; Texte behaupten nichts Falsches | Entscheidung (Frage zurückgestellt), WP-22 | `server/lib/bestaetigungen.mjs`, `schutzdurchsetzung.mjs`, `src/warnstufen.js`, REGELWERK-REGISTRY | serverseitige Sperrlogik = Rechte; Rechtswidriges wird durch Bestätigung nicht rechtmäßig | Sonnet; Review **Opus** (serverseitige Sperr-/Rechtelogik) | **2–6** · Bei „sperren bleibt“ nur Doku (0,5–2), bei „warnen“ Umbau von 2 Katalogzeilen plus Tests und Rechtematrix. Unsicherheit mittel (hängt an der Entscheidung) |
| **I2** Live-Prüfung Schichtfolge-Editor (Plan Schritt 2) | Beim Bearbeiten des Zyklusrasters laufend Ruhezeit, Höchstarbeitszeit, Ausgleich, Schutz gegen das Raster prüfen | Hinweise erscheinen beim Ändern ohne Speichern; gleiche Ergebnisse wie `pruefen`; Test mit Raster, das 8 h Ruhe erzeugt | WP-11 | `App.jsx` `Schichtfolge` 9229–10247 (Konfliktzone), nur diese Funktion | keine neuen Daten | Sonnet | **3–6** · eine Ansicht, vorhandene Prüffunktionen, aber monolithische Datei und UI-Tests. Unsicherheit mittel |
| **I3** Regelbaukasten vervollständigen | Muster-, Block-, Verteilungs-, Wunschregel im Rechenkern (4 → 8 Arten), Testlauf-Funktion | je Regelart Beispiel aus Plan 5.3 (Wochenend-Rotation) wird gerechnet; `offen` nie grün; Test je Art analog `regelbaukasten.test.js` | WP-11, WP-19 A3 (gleiche Datei) | `server/lib/regelbaukasten.mjs`, `src/regelbaukasten.js`, `src/regelregister.js` | Regelarten dürfen keine Personenbewertung enthalten (Plan 6.3) | Sonnet; Review Sonnet | **8–14** · vier neue Arten mit Zeiträumen/Kalenderlogik (Vorlage: 88 Testfälle der vier vorhandenen), Wunschregel mit Prioritäten. Unsicherheit mittel; Abstimmung mit WP-19 nötig |
| **I4** Interne Vorgaben: Verwaltung | Oberfläche zum Anlegen, Testen, Aktivieren; Geltung, Zeitraum, Stärke (Muss/Soll/Wunsch), Priorität, Grundlage, Ausnahmen; Stufengrenzen 5/25/∞ (E-21); Recht dafür | Vorgabe ohne KI anlegen, testen, aktivieren (Plan Abschn. 9); Rechtematrix-Zeile; Betriebsrat sieht nur Zahl/Text ohne Personen | I3, WP-22 | neue Ansicht in `App.jsx` (Konfliktzone), `rechte.mjs`, `RECHTEMATRIX.md`, `stufen.js` | neue Berechtigung = Rechte; Betriebsrat-Sicht neutral | Sonnet; Review **Opus** (Rechte) | **8–14** · neue Ansicht, Datenmodell, Migration, Rechte, Stufenzähler. Unsicherheit mittel |
| **I5** Vorgaben wirksam machen | Interne Vorgaben im Planungsassistenten, in der Ersatzsuche und in der Selbstplanung berücksichtigen; Prüffall Wochenend-Regel mit Ruhezeit-Hinweis am Montag | Plan 9: Wochenend-Regel wird geprüft, im Assistenten berücksichtigt, Nachtdienst-Wochenende erzeugt Ruhezeit-Hinweis | I3, I4 | `App.jsx` (`planeMonat`, `ersatzVorschlaege`), `server/lib/selbstplanung.mjs` | Selbstplanung nie still verwerfen | Sonnet | **4–8** · drei Einbindungsstellen in großen Funktionen, Regressionsrisiko. Unsicherheit mittel |
| **I6** Planungsreife | Prüfliste „Planungsreife“ (Personal, Vertragsstunden, Qualifikationen, Abwesenheiten, Dienstarten, Bedarf, Vorgaben, offener Zeitraum) mit genauen Lücken („Bei 3 Personen fehlen die Vertragsstunden“) | Jeder fehlende Punkt benannt; Test mit lückenhaftem und vollständigem Betrieb | – | neue Datei `src/engine/planungsreife.js`, Anzeige in `App.jsx` | keine Namen in Server-Logs | Sonnet | **3–5** · reine Prüflogik plus Anzeige. Unsicherheit niedrig |
| **I7** Planer-Kern (Rechnung) | Ganzer Plan: feste Punkte übernehmen, Blöcke vor Einzeltagen aufbauen, Verbessern mit festem Zeitbudget und festem Startwert; Rangfolge Gesetz > Besetzung > Tarif/BV/Muss > Soll > Verteilung > Wunsch > Stabilität | Gleicher Datenstand → gleicher Vorschlag (Test mit Wiederholung); setzt nie von sich aus einen Rechtsverstoß; Laufzeit < 1 Minute bei bis zu etwa 80 Personen (Plan 7.4, **im Pilot messen**) | I3, I5, I6 | `src/engine/planer.js` (neu), Anschluss an `planeMonat` | Einteilung nur nach Planfakten, keine Verhaltens-/Fehlzeitenprofile (KI-VO-Vermeidung) | Sonnet; Review Sonnet; **Opus nur**, falls Laufzeit-/Korrektheitsprobleme nach mehreren Versuchen | **14–26** · kombinatorisches Planungsproblem mit Heuristik, deterministischer Zufall, viele Regelarten; größte Unsicherheit des Kerns. Unsicherheit **hoch** |
| **I8** Varianten, Erfüllungsbericht, Konflikte mit Ursache | Bis zu drei Varianten (ausgewogen, wunschnah, stabil), Zählwert-Bericht ohne Prozent-Gesamtnote, „kleinste Ursache“ mit Wegen | Bericht nennt nur Zählwerte; je offenem Konflikt Wo/Warum/Wege; keine Scores je Person (D-16) | I7 | `src/engine/planer.js`, Anzeige `App.jsx` | keine Personenbewertung | Sonnet | **8–14** · Ursachensuche (Minimalmenge) ist aufwendig. Unsicherheit hoch |
| **I9** Verbessern-Modus, Änderungsliste, Übernahme | Plan begutachten → Änderungsliste mit Grund; Übernahme als Entwurf; einzelne Änderungen; „eigenen Plan trotzdem“ über Warndialog; Kennzeichnung „vorgeschlagen von CENTRIC, übernommen von …“ | Entwurf wird nie veröffentlicht und überschreibt nichts; Protokoll: Variante, angenommen/abgelehnt, wer bestätigt hat | I7, I8, `planfreigabe` | `server/lib/planfreigabe.mjs`, `bestaetigungen.mjs`, `App.jsx` | Datenintegrität (Entwurf vs. freigegeben), Rechte; **kein Schreibpfad ohne Mensch** | Sonnet; Review **Opus** (Datenintegrität/Veröffentlichung) | **7–12** · Zustands-/Journal-Anbindung und UI. Unsicherheit mittel |

### Block P – Plattform (Phase 1, ohne echtes Modell)

| WP | Ziel | Akzeptanz | Abh. | Dateibesitz / Konflikt | Sicherheit | Modell (Entw.) | PT |
|---|---|---|---|---|---|---|---|
| **I10** Architekturabgleich der Spezifikation auf den heutigen Stack | Spez. Teil B baut auf Netlify Functions, `@netlify/blobs`, Redis; Produktion ist VPS/Docker mit `server/funktionen` und Dateiablage. Prüfaufträge S-01…S-07 neu fassen, Zielstruktur `server/lib/intelligence/` festlegen | Bericht `docs/intelligence/ARCHITEKTUR-ABGLEICH.md` mit Entscheidungen AD-01… (WP-I10: nicht „K-01…“, K-nn sind die Konfigurationsparameter der Spezifikation); Rückfalllösungen je Prüfauftrag. **Erfüllt durch den Bericht vom 2026-11-03** (Review offen) | – | nur Doku | – | Sonnet (Lesen: Haiku) | **2–4** · Lesen/Abgleich, kein Code. Unsicherheit niedrig |
| **I11** Faktenpaket-Vertrag | Positivlisten je Funktion, **Alias statt Klarname**, keine Gründe/Schutzmerkmale/Kontakte, Kapselung von Fremdtext (zufällige Trennzeichen) gegen Prompt Injection, Versionen im Paket | Property-Test: kein Feld außerhalb der Positivliste, kein Klarname, kein Gesundheitsbegriff in irgendeinem Paket; Angriffs-Testsatz. **(WP-I10:)** Quelle ist die Sicht der auslösenden Rolle (`sicht.mjs`) **geschnitten** mit der Positivliste je Funktion, nie Rohbestand; Alias-Karte nur im Server; Leck-Prüfung schlägt fail closed zu; Vertrag `faktenpaket-0.1` (Entwurf in ARCHITEKTUR-ABGLEICH 2.2) wird eingefroren; Test je Rolle (Betriebsrat, Schichtverantwortung, Mitarbeiter) | WP-43, I10 | `server/lib/intelligence/{faktenpaket,alias,kapsel,schemas}.mjs` (neu), nutzt `sicht.mjs` | **Art. 9/Klarnamen: kritisch** | **Opus** (sensible Daten) | **6–10** · Positivlisten je Funktion, Pseudonymtabellen, Angriffstests. Unsicherheit mittel |
| **I12** Decision Engine | Rechenfunktionen verhaltensgleich nach `src/engine/` (und serverseitig verfügbar), Faktenberechnung aus dem gespeicherten Bestand, **Near-Miss-Kandidaten** | Alle bestehenden Tests unverändert grün; Engine-Ergebnisse server- und clientseitig gleich; Near-Miss-Beispiel aus CI 4.2. **(WP-I10:)** Ort `server/lib/engine/*.mjs` mit Re-Export `src/engine/index.js` (das Docker-Bild enthält `src/` nicht); **erster Teilschritt: Abhängigkeitsschließung messen** (`werkzeug/engine-schliessung.mjs`, Spez. S-07), danach Teilpakete ≤ 15 Funktionen; Test, dass die Engine im gebauten Bild lädt; kein Import aus `server/lib/intelligence/` | WP-11, WP-22, I10 | `App.jsx` (Funktionen ausschneiden, **höchste Konfliktgefahr**, einziger App.jsx-Schreiber), `server/lib/engine/*` (neu), `server/lib/*` | keine Rechenänderung | Sonnet; Review Sonnet; Opus nur bei Datenkonflikten | **14–24** · Spez. nennt XL (>10 PT); Abhängigkeitsschließung der Funktionen in einer 25.000-Zeilen-Datei unbekannt (Spez. S-07). Unsicherheit **hoch** |
| **I13** Gateway, Attrappe, Router, Prüfer | `server/lib/ki/`: einziger Weg zum Modell; `anbieter.mjs` mit Attrappe (Modi: ok, Fehler, Zeitüberschreitung, falsche Zahl); Router (Funktion → Startstufe, Sichtung); zweistufiger Prüfer (Struktur vor Text, Satzbausteine); Stufenkette nur nach oben; Model Registry | Komplette Kette gegen die Attrappe deterministisch getestet (CI 9 Architecture Freeze); Prüfer verwirft Fremdzahl; Eskalation nie abwärts. **(WP-I10:)** Route `server/funktionen/ki.mjs` (`/ki`, `/ki/*`, nicht unter `/api/`); Antwort 202 + Auftragskennung + Abfrage (Deadline 120 s liegt über den 60-s-Grenzen von Server und Caddy); kein interner Hintergrundaufruf; Aufträge werden journalisiert, nach Neustart werden offene Aufträge zu `rueckfall`; **Netzzugriff und Anbieter-Schlüssel nur in `anbieter.mjs`** (statischer Test), Live-Zweig erst I18; Importregeln (Engine importiert nie `intelligence/`) als Test; Ausnahme an der Route abgefangen, `/gesund` unberührt; Stores `centric-ki` (Klasse B) und `centric-ki-lauf` (Klasse C) in `werkzeug/ablage-sicherung.mjs` `STORES` eingeordnet; neue Variablen in `.env.example` und Betriebshandbuch (`pruefung:doku`); Kernprüfungen mit entfernter `intelligence/` bestehen | I11, I12 | neu `server/lib/intelligence/*`, `server/funktionen/ki.mjs` (neue Datei), eine Zeile je Store in `STORES` | Gateway liest nie den Rohbestand; Anbieterschlüssel nur aus Umgebung, **nicht angelegt** | Sonnet; Review **Opus** (Gateway = Sicherheitsgrenze) | **14–24** · Spez. nennt L; Prüfer, Bausteinkatalog, Registry, Zustandsmaschine mit Deadline. Unsicherheit hoch |
| **I14** Fingerprint, Ergebnis-Speicher, Decision Context | Decision Fingerprint (Fakten, Planstand, Regel-/Prompt-/Schema-/Modellversion, nie über Betriebsgrenzen), gespeicherte geprüfte Antwort, Evidenzauszug ohne Namen (90 Tage) | Treffer nur bei identischem Fingerprint; Invalidierungstest je Bestandteil; kein Betriebsübergriff. **(WP-I10:)** Ablage im Store `centric-ki-lauf` (Klasse C, nicht gesichert, Alias-Karten); Raumlöschung und Datenschutzlauf bereinigen die `ki:*`-Schlüssel des Raums; Löschlauf nach dem Muster `aufraeumen.mjs` mit Nachholen nach Neustart; Fristen konfigurierbar (Entwurfswerte, vom Betreiber zu bestätigen) | I13 | `server/lib/intelligence/{ergebnis,loeschlauf}.mjs` (neu); Ablage nutzt vorhandene atomare Schreiblogik (WP-45) | Mandantentrennung = Datenintegrität | Sonnet; Review **Opus** | **5–8** · Unsicherheit mittel |
| **I15** Kostenschutz, Limits, Deadline, degradierter Modus | Fünf Ebenen (je Vorgang, Person, Betrieb, gesamt, Anbieter), Business- und Security-Limits getrennt, Klasse A nie aus Kostengründen gesperrt, globale Deadline 120 s, degradierter Modus | Tests: Anbieter aus, Deckel erreicht, Notschalter → Kernfunktionen unverändert; Limit-Alarm; Klasse A läuft bei 120 % Kontingent. **(WP-I10:)** Zähler ohne Redis und ohne ETag: append-only Ereignisse plus Rollup unter Mutex im Prozess (neu rechenbar); Bremsart `ki` je Person als einzige Ergänzung in `schutz.mjs` `GRENZEN`; Alarme über `gesund.mjs`/Webhook; **ein Intelligence-Fehler setzt `/gesund` nie auf „kritisch“**; Rechenläufe nicht auf dem Event-Loop (Lasttest) | I13, WP-05 (Alarme) | `server/lib/intelligence/{limits,zaehler}.mjs` (neu); Vorbild `pruefungen/bremse.mjs`; kleine Ergänzungen `schutz.mjs`, `gesund.mjs` | Missbrauchsschutz, Fail-closed bei Zählerfehler nur für Nicht-Klasse-A | Sonnet; Review **Opus** | **8–14** · Zähler ohne Redis auf Dateiablage (Spez. S-05); Unsicherheit hoch |
| **I16** Betriebssteuerung und Transparenz | Schalter je Funktion, Frage „Betriebsrat/Personalrat/MAV?“ bei Einrichtung → **Pausierung**, Betreiber-Notschalter (alle/einzelne Betriebe/nur Opus-Stufe), KI-Kennzeichnung, Verzeichnis der Modelle, Mitarbeiterinformation | Bei „Ja“ kein Modellaufruf bis Bestätigung (serverseitig, Test); Notschalter wirkt sofort; jede KI-Ausgabe trägt Kennzeichnung. **(WP-I10:)** zwei Schalterebenen: Prozessschalter `CENTRIC_KI_MODUS` (Vorgabe `aus`) und Laufzeitschalter im Steuer-Store (Cache höchstens 30 s, Wirkung innerhalb einer Minute); beide fail closed (Schalter nicht lesbar → kein Aufruf); Fehlercode `KI_PAUSIERT`; Rollenmatrix je Rolle getestet (Betriebsrat löst nie aus; Schichtverantwortung Default nein); jede Änderung im Betriebsprotokoll | I13, I15 | `server/lib/intelligence/schalter.mjs` (neu), `rechte.mjs`, `RECHTEMATRIX.md`, Betreiberkonsole in `App.jsx` | Rechte + Mitbestimmung | **Opus** (Rechte/Mitbestimmung) | **8–14** · Unsicherheit mittel |
| **I17** Intelligence-Oberfläche Grundlage | Client, Hooks, Komponente „KI-Entwurf“, Rückfallanzeige („Zusätzliche Intelligence-Vorschläge sind gerade nicht verfügbar“), Thinking Orb (CI 5.4, Paket vorher prüfen und pinnen), Texte | Oberfläche rendert Attrappe-Antworten; Tastatur/Kontrast-Prüfungen (`gestalt.test`, `kontrast.test`) grün. **(WP-I10:)** CSP `connect-src 'self'` unverändert, der Client spricht nur `/ki/*`, keine Anbieteradresse im Browser (Test); jede KI-Ausgabe zeigt die Kennzeichnung | I13 | `src/ki/*` (neu), kleine Einhängepunkte in `App.jsx` (erst nach I12) | keine Fakten in `console.log` | Sonnet | **6–10** · Unsicherheit niedrig–mittel |

### Block 2 – Funktionen mit echtem Modell (Phase 2)

| WP | Ziel | Akzeptanz | Abh. | Dateibesitz / Konflikt | Sicherheit | Modell (Entw.) | PT |
|---|---|---|---|---|---|---|---|
| **I18** Anbieter live anbinden (technisch) | Live-Rauchtest, Parameter je Modell, Zero-Data-Retention je Modell klären (Anbieterauskunft), Kosten messen | Rauchtest manuell (nicht in CI); Werte in Konfiguration | I13, **Anbieterzugang und -entscheidung (extern)** | `server/lib/ki/anbieter.mjs` | Schlüssel nur Umgebung/Betreiber; **nicht anlegen** | Sonnet | **2–4** · Unsicherheit hoch (Anbieterauskunft) |
| **I19** Altplan-Übernahme (Funktion A, Stufe Excel/CSV = F7A) | Datei lesen, Maskierung, Kürzel → Dienstarten, Personen → Personal, Muster → vorhandenes Schichtsystem oder abgeleiteter Zyklus, Prüfung durch Rechenkern, Vorschau Original/Ergebnis mit „sicher/bitte prüfen/nicht erkannt“, Übernahme, Protokoll, Löschung | Spez. F7A-Akzeptanz („Nachn.“ → nachname ohne Klarnamen ans Modell); eindeutige Spalten → kein Aufruf; unzulässiger Altplan wird nicht „repariert übernommen“; Originaldatei nach Frist gelöscht (technisch erzwungen) | I13, I17, I12, Rechenkern | `App.jsx` `Import` 12332 (Konfliktzone), neu `server/lib/ki/import*.mjs` | Spaltenköpfe + maskierte Beispiele; Klarnamen nur lokal | Sonnet; Review **Opus** (Datenabfluss, Löschfrist) | **16–28** · Zyklus-Ableitung aus realen Altplänen ist der unbekannte Kern; XLSX-Lesen (neue Abhängigkeit, Spez. S-04); reale Altpläne erst mit Piloten. Unsicherheit **hoch** |
| **I20** Ausfall-Vorschlag (Funktion B / F3) | Lösungswege (Tauschkette, Teilung, Springer/anderer Standort mit Recht, Verschiebung, Bereitschaft, Mehrarbeit, „nicht lösbar ohne Regelabweichung“) **einzeln vom Rechenkern durchgerechnet**; Erklärung aus Satzbausteinen; Sofortanzeige gültiger Wege; SUB-Fenster; Klasse A | Spez. F3-Akzeptanz; Reihenfolge = Engine-Reihenfolge; kein Regelverstoß als zulässig dargestellt; Deadline 120 s; keine automatische Benachrichtigung | I12 (Near-Miss), I13, I15, I17 | `App.jsx` Ersatzliste (11040/12749), `server/lib/ki/` | Aliasnamen; keine Merkmale wie Fehlzeitenquote | Sonnet; Review **Opus** (Rechte SUB-Bereich) | **16–28** · Lösungswege rechnen heißt neue deterministische Algorithmen (Tauschkette, Teilung). Unsicherheit hoch |
| **I21** Testsätze, Schattenbetrieb, Regression-Gate | Gold-Testsatz je Funktion aus anonymisierten Pilotdaten, Schattenbetrieb der Stufen, Pilotauswertung, Regression-Gate für Startstufen | Kriterien aus CI 9: Prüferquote ≥ 98 %, Zahlentreue 100 %, Antwortzeit Klasse A p90 ≤ 90 s, Kosten je Vorgang gemessen | I19, I20, Piloten | `pruefungen/ki-*`, `werkzeug/` | Pilotdaten nur anonymisiert | Sonnet | **8–14** · hängt an Pilotdaten. Unsicherheit hoch |
| **I22** F1 Plan-Erklärer + F2 KI-Ausbau | „Warum?“-Knopf, Erklärung Einzelbefund (Klasse A), Sammelbefund (Batch, ein Aufruf je Regelart) | Spez. F1/F2-Akzeptanz; Regelkennung nur aus Paket; `provisional`-Regeln nie als geltendes Recht | I12, I13, I17 | `App.jsx` Planzelle/Prüfung | keine Wertung von Personen | Sonnet | **8–14** · Unsicherheit mittel |
| **I23** F9 Hilfe-Assistent | Frage → Antwort nur aus Handbuch/Tour mit Quellen | Spez. F9; „Das steht nicht im Handbuch.“ ohne Treffer | I13, I17 | `src/handbuch-inhalt.js`, `Hilfe` | keine Betriebsdaten | Haiku (Recherche) + Sonnet | **4–7** · Unsicherheit niedrig |
| **I24** F15 Änderungsübersicht | deterministische Ereignisliste „seit deinem letzten Besuch“ (auch ohne KI sichtbar) + Text | Spez. F15; Planer nur eigener Bereich | I12, I13, I17 | `App.jsx` Leitstand, `m.aenderungen` | Bereichsgrenzen = Rechte | Sonnet | **5–9** · Unsicherheit mittel |
| **I25** F16 Regel-Übersetzer | Satz → Eintrag im Baukasten, Rückfragen, Gesundheitsbegriffe erkennen und ablehnen, Darstellbarkeits-/Gesetzeswiderspruchsprüfung, Testlauf | Plan 6.2; Beispiel Wochenend-Regel; Gesundheitsbegriff → Bitte um Weglassen | I3, I4, I13 | `server/lib/ki/`, Vorgaben-Ansicht | Eingaben können Gesundheitsangaben enthalten (Eingabewarnung, Prüfer) | Sonnet | **7–12** · Unsicherheit mittel |
| **I26** F17 Regel-Konflikte erklären | Rechenkern findet kleinste Ursache, Intelligence erklärt Vorrang/Nachgeben | Plan 6.2; Erklärung enthält nur Kennungen aus dem Paket | I3, I8, I13 | `src/engine/`, `server/lib/ki/` | wie I25 | Sonnet | **8–14** · Ursachensuche gemeinsam mit I8 nutzbar. Unsicherheit mittel |

### Block 2b – Sicherheitsbereich und Analyse

| WP | Ziel | Akzeptanz | Abh. | Dateibesitz / Konflikt | Sicherheit | Modell (Entw.) | PT |
|---|---|---|---|---|---|---|---|
| **I27** F7B Scan/PDF/Foto | Eigene Upload-Strecke und Endpunkt, Browser-Schwärzung (Hilfsmittel, nicht alleiniger Schutz), Quarantäne (Typ, Größe, Schadsoftware), Analyse über geeigneten Anbieterpfad, Vorschau, Audit-Ereignisse, Löschung sofort/7 Tage/24 h **technisch erzwungen**, Schalter standardmäßig aus | Spez. F7B-Akzeptanz (unleserlich → „nicht erkannt“, nichts erfunden; Abbruch → sofort gelöscht); Zeitgeber-Test; Schalter `f7b.freigegeben=false` bis rechtliche Freigabe | I19, I16, **DSFA, ZDR je Modell, Anbieterentscheidung (extern)** | neue Strecke `server/funktionen/` + `server/lib/ki/dokument*.mjs`; Quarantäne neu | **höchste Sensibilität** (Art. 9 möglich) | **Opus** | **20–34** · Spez. nennt L; Upload-Sicherheit, Schwärzungs-UI, Löschzeitgeber, Audit. Unsicherheit hoch |
| **I28** F8 Schichtmodell-Analyse | Modell normalisieren, Legalität/Machbarkeit/Robustheit aus Engine, Ansicht „Schichtmodell“ | Spez. F8; Zustand je Ebene = Engine-Zustand; keine Euro-Darstellung | I12, I13, I19 | `App.jsx` neue Ansicht, `src/engine/` | – | Sonnet | **12–20** · Spez. nennt XL gemeinsam mit F10. Unsicherheit hoch |

### Block 3 – weitere Funktionen und Abschluss (Phase 3)

| WP | Ziel | Akzeptanz | Abh. | Dateibesitz | Sicherheit | Modell (Entw.) | PT |
|---|---|---|---|---|---|---|---|
| **I29** Batch-Infrastruktur + F4, F11, F12 | nächtlicher Lauf, Wochenbriefing, Frühwarnungen (Schwellen in Konfiguration), Abschluss-Prüfliste | Spez. F4/F11/F12; Batch-Verzug → Rückfall auf Kennzahlen; „kein Ereignis → kein Aufruf“ | I13, I15, I12 | `server/lib/ki/batch*`, `App.jsx` Leitstand | keine Vorhersage individueller Krankheit/Kündigung | Sonnet | **18–30** · Unsicherheit mittel–hoch |
| **I30** F5 Nachrichten-Werkstatt | Entwurf aus Stichworten, Übersetzung, kein Versand | Spez. F5; Gesundheitswörter blockiert | I13, I17 | `Nachrichten` 11224 | Eingabewarnung | Sonnet | **4–8** · Unsicherheit niedrig |
| **I31** F6 Fragen an Daten | geprüfte Abfrageliste, zwei Schritte, Rollenbegrenzung, Alias | Spez. F6; Frage nach Krankheitsgründen abgelehnt; Tabelle = Engine-Ergebnis | I12, I13 | `server/lib/ki/abfragen.mjs`, Kommandoleiste | Rechte je Rolle (Planer eigener Bereich) | Sonnet; Review **Opus** (Rollenbegrenzung) | **9–15** · Unsicherheit mittel |
| **I32** F10 Personalansatz | Kennzahlen + Text, keine Aussage über Stellen | Spez. F10; Sperrwörter | I28 | `App.jsx` neue Ansicht | keine Personenbezüge, Mitbestimmung | Sonnet | **5–9** · Unsicherheit mittel |
| **I33** F14 Was-wäre-wenn | Parametermodell, Varianten, Differenzen aus Engine | Spez. F14; zweiter Lauf identisch | I28 | `App.jsx` neue Ansicht | – | Sonnet | **8–14** · Unsicherheit mittel |
| **I34** F18 Plan-Gutachten + F13 Planvorschlag (Texte, Varianten-Abwägung) | Gutachtentext aus Satzbausteinen, Erklärung der Varianten | Gutachten nennt nur Zahlen aus Rechenkern; nie „rechtssicher“; **produktiv erst nach externer KI-VO-Einordnung** | I8, I9, I13, **externe Einordnung** | `server/lib/ki/` | Mitbestimmung, kein Personen-Scoring | Sonnet; Review **Opus** | **8–14** · Unsicherheit mittel (Text) / Freigabe extern |
| **I36** Governance-Ansichten | Transparenzansicht, Erklärblatt, Änderungsblatt, Betriebsrat-Einsicht in Planer-Gewichtung und Zahl bestätigter Rechtsverstöße ohne Namen | Muster-BV Anlage 5 abbildbar | I9, I16 | `App.jsx` | Rechte Betriebsrat | Sonnet | **5–9** · Unsicherheit niedrig |
| **I37** Intelligence-Abnahme und Rollout | Endabnahme analog WP-42: Pentest-Erweiterung (Prompt Injection, Mandantentrennung), Kosten-/Lasttest, Runbook, Restore, Dokumentenabgleich | Abschnitt 10 vollständig erfüllt | alle | `docs/`, `werkzeug/` | unabhängiger Review | **Opus** (kritischer Review), Rest Sonnet | **5–9** · Unsicherheit mittel |
| **I35** (bedingt) Kontingent, Preise, Zukauf | nur nach Phase-3-Entscheidung (D-08/D-11/D-27; Fair Use vs. Kontingent) | nur wenn beschlossen | I15, Entscheidung | `src/stufen.js`, `preisgestaltung.js`, Rechnung | Preisversprechen nur nach § 5 UWG-Linie (CI 13) | Sonnet | **15–28** · nur bedingt; **nicht in Gesamtsumme** |

### Aufwandssummen (SCHÄTZUNG, nicht belegt)

| Block | Pakete | PT |
|---|---|---|
| K Kern ohne KI | I1–I9 | **57–105** |
| P Plattform | I10–I17 | **63–108** |
| 2 Funktionen mit Modell | I18–I26 | **74–130** |
| 2b Sicherheitsbereich/Analyse | I27–I28 | **32–54** |
| 3 Weitere Funktionen und Abschluss | I29–I34, I36–I37 | **62–108** |
| **Gesamt ohne bedingtes I35** | | **288–505** |
| bedingt: I35 | | 15–28 |
| **Bis zum ersten technischen Piloten** (K + P + I18–I21) | | **162–287** |

Einordnung: Die grobe Vorab-Schätzung vom 2026-11-03 (Vorbefund) lag bei 175–310 PT. Dieser Plan ist höher, weil er F7B, Planer-Kern mit Varianten/Konflikten, Betriebssteuerung, Testsätze, F8–F14 und Abnahme einzeln trägt. **Nicht in PT enthalten:** Anwaltsprüfung, AVV-Verhandlung, DSFA, externe KI-VO-Einordnung, Pilotbetriebe, Kundengespräche, Wartezeiten externer Stellen. **Hauptunsicherheiten:** I7/I8 (Planungsalgorithmus), I12 (Extraktion aus `App.jsx`), I19/I20 (reale Altpläne und neue Lösungswege), Abhängigkeit von Pilotdaten (I21). Die Spezifikation selbst nennt nur Größen (S ≈ 1–2, M ≈ 3–5, L ≈ 6–10, XL > 10 PT, „keine Zusage“); sie dienten nur als Gegenprobe, nicht als Rechenbasis. Bis zu den ersten gemessenen Paketen sollte die Schätzung nach I7 und I12 neu gerechnet werden.

## 6. Vorschlag zur Reihenfolge

1. **Kern ohne KI zuerst** (unabhängig von Piloten, Plan Abschnitt 8): I1 (nach Fachentscheidung) → I2 → I3 → I4 → I5 → I6 → I7 → I8 → I9. Reihenfolge dort: interne Vorgaben, Planer-Kern deterministisch, Live-Prüfung (I2 kann vorgezogen werden, weil klein).
2. **Plattform mit Attrappe** (Phase 1, nach P0): I10 → I11 → I12 → I13 → I14/I15/I16 → I17. Kein echtes Modell, kein Anbieter-Zugang. Erst wenn die Kette mit der Attrappe deterministisch und vollständig getestet ist, werden echte Modelle zugeschaltet (CI 9).
3. **KI-Funktionen** (Phase 2/2b/3): I18 → I19 und I20 (Schwerpunkt E-2) → I21 → I22–I26 → I27/I28 → I29–I34 → I36 → I37.

Parallelität: I3/I6, I11/I12 und I23/I24 sind weitgehend unabhängig; `App.jsx` begrenzt echte Parallelität (jeweils eine Konfliktzone zur selben Zeit bearbeiten).

## 7. Sicherheits- und Datenschutzanforderungen (querschnittlich)

| Anforderung | Umsetzung in Paketen | Prüfung |
|---|---|---|
| Klarnamen/Gesundheitsdaten nie zum Modell | I11 Positivliste + Alias; I19/I27 Sonderfall F7B | Property-Test über alle Paketarten; Angriffs-Testsatz |
| Faktenpaket | I11, I12 | Jedes Paket aus Engine; keine Rohdaten |
| Deterministische Gegenrechnung | I13 Prüfer, I20 je Weg durch Rechenkern | Fremdzahl wird verworfen (Attrappe-Modus) |
| Kennzeichnung KI-Inhalte | I16, I17 | UI-Test: jede KI-Ausgabe gekennzeichnet |
| Notschalter beim Betreiber | I16 | Test: wirkt sofort für alle/einzelne Betriebe/Opus |
| Betriebsrat-Pausierung | I16 | Test: „Ja“ → kein Aufruf bis Bestätigung |
| Kostenlimits | I15 | fünf Ebenen getestet, Klasse A nie aus Kostengründen gesperrt |
| Modellrouting (Laufzeit) | I13 | Haiku: lesen/ordnen/formulieren aus Fakten; Sonnet: Lösungswege, schwere Dokumente; Opus: letzte Instanz, nur nach oben; Startstufe im Pilot manuell (CI 6.3) |
| KI-Ausfall | I15 | Anbieter aus → Kern unverändert, Hinweistext |
| Kein autonomes Veröffentlichen | I9, alle KI-Pfade | KI-Endpunkte haben keinen Schreibzugriff auf freigegebene Pläne |
| Löschfristen F7B | I27 | Zeitgeber-Test, Audit |
| Anbieter-Zugangsdaten | – | **werden nicht benötigt und nicht angelegt**; erst I18, durch den Betreiber |

## 8. Rechtliche Freigabebedingungen (alle „zu prüfen“; keine Rechtsberatung, keine eigenen Rechtsgrundlagen)

Quellen sind die Repo-Dokumente; ihre rechtliche Richtigkeit ist nicht geprüft.

| Gegenstand | Bedingung vor produktiver Freigabe | Quelle |
|---|---|---|
| **Mitbestimmung** | Muster-Betriebsvereinbarung (§ 87 Abs. 1 Nr. 6 BetrVG; für interne Vorgaben Nr. 2; öffentlicher Dienst/kirchlich nach CI 8.2: BPersVG/LPersVG, MAVO, MVG) **anwaltlich prüfen**, um Stufenkette, EU-Hosting/ZDR, Audit-Stichprobe, F7B-Fristen, degradierten Modus ergänzen; Beteiligung **vor** Einführung | CI 8.2, 8.4; `MUSTER-BETRIEBSVEREINBARUNG.md` (Anlage 5) |
| **Auftragsverarbeitung / Anbieterbedingungen** | AVV mit Anbieter; Unterauftragsverarbeiter in AVV Anlage 2 (alle drei Modelle benannt); Verarbeitungsort, Drittlandgrundlage, „kein Training“, **Zero Data Retention je Modell** schriftlich zugesichert; Anbieterentscheidung E-10; keine Kundenaussage „Daten verlassen die EU nie“ ohne Beleg | CI 8.2, 14 Punkt 4, 10 |
| **DSGVO** | Datenschutzerklärung und Verarbeitungsverzeichnis angepasst; Information der Beschäftigten | CI 8.2 |
| **DSFA (Art. 35 DSGVO)** | vor F7B (Art. 9 DSGVO bei Gesundheitsangaben im Dokument); Mustertext für Kunden | CI 8.2, 8.1 |
| **EU-KI-Verordnung** | interne Vorprüfung nur für A und B (E-3/E-17); **externe Bestätigung** vor Produktivbetrieb; F13/F18 ausdrücklich in die externe Einordnung (Anhang III Nr. 4 Buchst. b ist hier als Prüfpunkt benannt, Einordnung **nicht entschieden**); erneut prüfen bei neuer zuweisender Funktion, Anbieterwechsel, Rechtsänderung | CI 8.3 |
| **DSGVO Art. 22** (automatisierte Entscheidung) | **zu prüfen** für Planvorschlag und Gutachten; in den Intelligence-Dokumenten nicht erwähnt (Abgleich 0 Treffer). Bewusst nur als Prüfauftrag aufgenommen | dieser Plan |
| **Werbeaussagen** | keine Zusagen „geprüft und zulässig“, „rechtssicher“, „fehlerfrei“, keine Termine/Dauerpreise (§ 5 UWG-Linie) | CI 13 |
| **Rechtstexte allgemein** | AGB, AVV, Datenschutz, Impressum sind laut `IST-STAND.md` Entwurf mit Platzhaltern; Anwaltsprüfung nicht erfolgt | `IST-STAND.md` D |

## 9. Externe Voraussetzungen

- **Kanzlei:** Muster-BV, AVV, Datenschutztexte, DSFA-Unterstützung, externe KI-VO-Einordnung (CI 8.3/8.4/14).
- **Piloten laut `INTELLIGENCE.md` §6:** mindestens 2 Betriebe nutzen CENTRIC wöchentlich **und** Altplan-Übernahme oder Ausfall ist als Schmerzpunkt bestätigt (Phase-0-Fragen CI 13, 10–15 Gespräche).
- **API-Zugang des Anbieters:** erst ab I18, durch den Betreiber; für Bau und CI genügt die Attrappe. **Es werden keine Anbieter-Zugangsdaten benötigt und keine angelegt.**
- Anbieter-Auskünfte: ZDR je Modell, Parameter, Preise, Modellverfügbarkeit (CI 14 Punkte 4, 6).
- Anonymisierte echte Altpläne und Ausfälle für Testsätze (I21).

## 10. Widersprüche zwischen Dokumenten und Empfehlung

| Nr. | Widerspruch | Fundstellen | Empfehlung |
|---|---|---|---|
| W1 | Marktanalyse: Intelligence „nicht im Base Case“, separat als Upside/höherer Tarif; Roadmap/E-5: eingeplant (P2/P3), vorerst kein gesonderter Preis | `centric-marktanalyse/MARKET-VALIDATION-REPORT.md:60,66,642`; `docs/ROADMAP.md` §3–4; CI 10 | Intelligence aus Umsatzplanung/Base Case herauslassen (kein Widerspruch bei Umsatz); Roadmap-Satz „kein Umsatzbeitrag im Base Case“ ergänzen; Preisfrage erst nach Pilotkosten (I35 bedingt) |
| W2 | Preis: Code 89/159/279 €; Spez. D-07 99/199/399 €; Marktanalyse M8 (nach Mitarbeitern); Kontingent D-08/D-11/D-27 vs. „Fair Use ohne Zahl“ | `src/stufen.js`; CI 10; `ROADMAP.md` §6 | Code-Preise gelten bis Markttest; Pilot ohne Aufpreis und ohne Zusage danach; Entscheidung nach Phase 3 mit gemessenen Kosten |
| W3 | Löschfrist Originaldatei: „spätestens nach 7 Tagen“ vs. „sofort nach bestätigter Übernahme, höchstens 7 Tage bei offenem Import, 24 h bei Audit-Stichprobe“ vs. Spez. F7B „nach Abschluss oder nach 24 h“ (`stundenBisLoeschung: 24`) | `INTELLIGENCE.md` §3; CI 4.1/E-16; Spez. F7B, Anhang A | CI 4.1 (E-16) gilt; „7 Tage“ nur als Höchstgrenze bei offenem Import; Werte konfigurierbar, im DSFA festschreiben; `INTELLIGENCE.md` §3 angleichen |
| W4 | Fassung 6 vs. 7: `INTELLIGENCE.md` verweist auf „Fassung 6“ und sagt „F13 (Optimierer) bleibt eigenes spätes Projekt“; CI Fassung 7 (E-20) nimmt F13 (Planvorschlag) und F18 in den Katalog; Spez. D-01/D-24 sagen „nicht Teil“ | `INTELLIGENCE.md` Kopf, §5; CI Kopf, 4.3, E-20 | CI Fassung 7 hat Vorrang (Rangfolge CI Kopf); `INTELLIGENCE.md` und Spezifikation (Fassung 1.1, CI 14 Punkt 25) nachziehen |
| W5 | E-19 „keine Regel verhindert eine Planungsentscheidung“ / Spez. F3 „nie gesperrt“ (meint Kontingent) vs. Code `sperrt: true` und „strenge Variante“ (Ruhezeit < 11 h sperrt) vs. WP-19-Entscheidungen („Grundsatz warnen; bestehende zwingende Sperren bleiben“) | CI 4.4, E-19; `bestaetigungen.mjs:44-45`; `REGELWERK-REGISTRY.md:245-256`; `WP19-PRODUKTENTSCHEIDUNGEN…md` Z. 21, 32; `STATUS.md` (zurückgestellt) | Entscheidung vor dem Produktiv-Release vorlegen (ACC45-Fragen 4/6/7); bis dahin Intelligence-Texte (F2/F17) nur auf Basis des `sperrt`-Flags des Befunds, nie „CENTRIC sperrt nie“; Begriffe trennen: „Regelsperre“ vs. „Kontingentsperre Klasse A“ |
| W6 | EU-KI-VO: `INTELLIGENCE.md` E-3 und Roadmap §4 „geprüft, zulässig“ vs. CI 8.3/E-17/13 „intern vorgeprüft, extern bestätigen, nicht ‚geprüft und zulässig‘ sagen“ | `INTELLIGENCE.md` §2; `ROADMAP.md` §4; CI 8.3, 13 | CI gilt; Roadmap und `INTELLIGENCE.md` angleichen; Kundenaussage nach § 5 UWG-Linie |
| W7 | Stack: Spezifikation Teil B (Netlify Functions, `@netlify/blobs`, Redis) vs. Produktion (VPS/Docker, `server/funktionen`, Dateiablage, kein Netlify-Verzeichnis im Repo) | Spez. Abschnitt 24/25/42; `README.md`; Repo-Struktur | I10 zuerst; Teil B nicht wörtlich übernehmen |
| W8 | Standardmäßig aktiv (E-1) vs. Pilot manuell/kostenlos vs. Rechtsvoraussetzungen offen | `INTELLIGENCE.md` §2; CI 6.3 | „Standardmäßig an“ erst, wenn alle sechs Bedingungen aus CI 8.2 erfüllt sind; bis dahin Opt-in je Betrieb |
| W9 | Nummerierung: Spez. F1–F15 (F13 = Optimierer, kein F16–F18), WP-00…25 kollidieren mit ACC45-WP-Nummern; „spätere Kurzfassung nummerierte anders“ | `INTELLIGENCE.md` §5; Spez. 41 | F-Nummern der CI (F1–F18) gelten; Pakete heißen WP-I1…, Spez.-WPs nur als „Spez. WP-nn“ zitieren |

## 11. Abnahmekriterien: „Intelligence gilt erst als erledigt, wenn …“

Spezifiziert zu sein genügt nie. Intelligence ist erledigt, wenn **alle** Punkte belegt sind:

1. **Jede Funktion F1–F18 in Klasse 1** (Abgleich): Code im Repo, Akzeptanzkriterien der Spezifikation als Tests grün, Gold-Sätze je Funktion, in einem Pilotbetrieb benutzt. Eine Funktion, die nur spezifiziert oder nur als Attrappe läuft, zählt nicht.
2. **Kern ohne KI vollständig**: 8 von 8 Regelarten, Verwaltung interner Vorgaben, Planer-Kern (deterministisch, reproduzierbar), Live-Prüfung; Entscheidung „warnen oder sperren“ gefällt und in Code und Texten konsistent (W5).
3. **KI-Ausfall getestet**: Anbieter aus, Deckel erreicht, Notschalter → Planung, Prüfung, Ersatzliste unverändert nutzbar.
4. **Datenschutz belegt**: Property-Test zeigt, dass kein Faktenpaket Klarnamen, Abwesenheitsgründe, Schutzmerkmale oder Kontaktdaten enthält; Datenfluss entspricht der Dokumentation und der AVV-Anlage.
5. **Kein Modell veröffentlicht einen Plan**: nachgewiesen für alle KI-Pfade; jede Übernahme läuft durch die Schutzprüfung und das Protokoll.
6. **Zahlentreue**: Prüfer verwirft jede Zahl und Regelkennung außerhalb des Pakets; im Pilot Zahlentreue 100 %, Prüferquote ≥ 98 %, Antwortzeit Klasse A p90 ≤ 90 s und nie über der Deadline (CI 9).
7. **Betriebssteuerung**: Schalter je Funktion, Betriebsrat-Pausierung, Notschalter, KI-Kennzeichnung, Verzeichnis der Modelle getestet.
8. **Kosten**: Kosten je Vorgang gemessen, fünf Limit-Ebenen mit Alarm getestet, Annahmen aus CI 7.8 durch Messwerte ersetzt.
9. **Recht**: AVV unterzeichnet, Muster-BV anwaltlich geprüft, DSFA (F7B) vorliegend, externe EU-KI-VO-Einordnung (einschließlich F13/F18) vorliegend, Art. 22 DSGVO bewertet, Anbieterbedingungen und ZDR je Modell schriftlich geprüft.
10. **Pilot**: Voraussetzungen aus Abschnitt 9 erfüllt, Phase-2-Kriterien gemessen, nicht angenommen.
11. **Release-Gate (I37)**: unabhängiger Opus-Review der Rechte- und Datenschutzpfade, Pentest-Erweiterung (Prompt Injection, Mandantentrennung), Runbook und Restore, Dokumentenwidersprüche W1–W9 aufgelöst.

## 12. Statusführung

Pro Paket: Status und Statusstufen in `docs/acc45/work-packages.json` (Strang `intelligence`, Pakete `WP-I1` … `WP-I37`), Branch `intelligence/wp-iN-…`, Nachweisdatei `docs/intelligence/wp-iN-nachweis.md`. Die Zählung „x von 18 Funktionen je Klasse“ steht in `docs/acc45/STATUS.md` (Abschnitt „CENTRIC Intelligence – eigener Entwicklungsblock“) und wird bei jeder Integration eines WP-I neu aus dem Code abgeglichen, nicht aus der Spezifikation fortgeschrieben.

## 13. Entscheidungen, die vor Start nötig sind

1. Intelligence als eigener Block freigeben (dieser Plan) und Reihenfolge bestätigen (Abschnitt 6).
2. Fachentscheidung „warnen oder sperren“ (Voraussetzung für I1).
3. Beginn Phase 1 erst nach P0 und nach dem ACC45-Release (WP-42)?
4. Anwalts- und Anbieterschritte beauftragen (Abschnitt 9), Art. 22 DSGVO aufnehmen.
5. Preis- und Dokumentenangleichung W1–W9 anordnen.
