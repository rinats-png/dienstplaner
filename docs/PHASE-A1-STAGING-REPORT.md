# Phase A.1 — Staging-Upgrade: Bericht

| | |
|---|---|
| Datum | 2026-10-10 (alle Zeiten UTC) |
| Umgebung | Staging, `/opt/apps/centric-staging`, Container `centric-staging-web`, nur intern (Netz `proxy`, keine veröffentlichten Ports) |
| Alter Stand | `223dd38548d1f4843dd3727d1ff33287470a213e` — Bild `ghcr.io/rinats-png/dienstplaner@sha256:0c6140b1e17f57d9b25355dcc01578847f4e2beaf8f74a6672504161438b3675` |
| Kandidat | `7a385d19cc1c7ead2595b0a4e27c337707fcbaf5` (Branch `fix/phase-a1-sitzungen`) — Bild `ghcr.io/rinats-png/dienstplaner@sha256:ef600d80d850be419d82f6306ed50032a44cafcf47ca88bc20ddbaf7671c11c0` |
| Production | `centric-dp-web` — nur lesend identifiziert, nicht angefasst |
| Urteil | **PHASE A.1 STAGING BESTANDEN** |

Geprüft wurde ohne Zeitmanipulation und ohne künstlich gealterte Dateien. Alle Testdaten waren
pseudonym (`@example.org`, eigene Testbetriebe). In diesem Bericht stehen keine Merkmale,
Zugangscodes, Passwörter oder vollständigen Sitzungs-Hashes.

Die Prüfungen liefen als Node-Proben über `docker exec` im Staging-Container gegen
`http://127.0.0.1:3000`. Die Oberfläche wurde über einen SSH-Tunnel geprüft, der nur an
`127.0.0.1` des Prüfrechners gebunden war.

---

## 1. Preflight

- Lokal: Branch `fix/phase-a1-sitzungen`, HEAD `7a385d19`, Arbeitsbaum sauber.
  `main`/`origin/main` = `223dd385`.
- CI auf `7a385d19` grün: `pruefung`, `sicherheit` (3 Jobs), `bild`. `vps` wurde
  übersprungen (`ausliefern=false`). Run `38001786017`.
- GHCR-Digests gegen den Lauf geprüft. Konfigurations-Digest der amd64-Variante = erwartete Image-ID.
- Staging vor dem Upgrade: `223dd385`, healthy.
- Production vorab und am Ende festgehalten (Id, StartedAt, RestartCount, Health, `/gesund`).

## 2. Sicherung vor dem Upgrade

- `sicherungen/centric-sicherung-20261010T201053Z` angelegt; `pruefen` meldete „In Ordnung“.
- Zusätzlich eine Rohkopie `data.vor-a1-upgrade-20261010T201052Z` und
  `compose.yml.vor-a1-20261010T201052Z`.
- Vorhandene Sicherungen blieben unangetastet:
  - `centric-sicherung-20261005T030754Z`
  - `data.vor-wiederherstellung-20261009T192942Z`
  - `restore-test/`

## 3. Sitzungen vor dem Upgrade

Angelegt mit dem alten Bild und vor dem Upgrade nicht gelöscht:

- A: Konto-Anmeldung ohne geöffneten Betrieb
- B, C, D: Konto-Anmeldung mit geöffnetem Betrieb
- E, F: Zugangscode-Sitzungen

## 4. Upgrade

- In `compose.yml` nur die Bildzeile auf den Kandidaten-Digest umgestellt, dann
  `docker compose up -d --pull never`.
- Ergebnis: healthy, 0 Neustarts.
- Mounts, Netz, Benutzer `1000:1000`, `read_only` und „keine Ports“ unverändert.
- Keine Datenmigration nötig; Bestände unverändert lesbar.

## 5. Regression F1 — Abmelden beendet alles

- Nach `POST /api/account/abmelden` antworten mit 401:
  - der Hauptpfad `/api/bestand`;
  - alle frühen Pfade: `zugaenge`, `zugaenge-uebersicht`, `zugang-sperren`, `raum-loeschen`, `bestand-anlegen`.
- `as:`, `t:` und die Bindungsmarker `ab:` sind entfernt.
- Ein verspäteter Aktivitätswriter (`az:`) erzeugt keine Autorität.
- Ein zweites Gerät desselben Kontos bleibt angemeldet und arbeitsfähig.

## 6. Regression F3 — frühe Pfade prüfen vollständig

- **Widerrufene Mitgliedschaft:** 401 auf `zugang-sperren` und allen frühen Pfaden; der Code wird nicht gesperrt.
- **Gültige Leitung:** `zugang-sperren` → 200.
- **Ungültiges Merkmal:** 401 auf allen Pfaden.
- **Abgelaufen (Untätigkeit):** real geprüft, siehe Abschnitt 10.

## 7. Regression R1 — Autorität ist unveränderlich

- Aktivität verändert `as:` nicht; die Aktivität steht getrennt in `az:`.
- Ein spätes `az:` nach dem Abmelden belebt die Sitzung nicht wieder.

## 8. Regression F4 — Zugangscode-Sitzungen

- `t:` bleibt unverändert; die Aktivität steht in `ta:`.
- Nach dem Sperren des Codes belebt ein spätes `ta:` nichts wieder; die Code-Anmeldung antwortet 403.

## 9. Ausrollen alter Sitzungen (BEREITSTELLUNG.md 5.7)

- A (Konto-Anmeldung ohne Betrieb) bleibt gültig; die Aktivität wird ab jetzt in `az:` geführt.
- B, C, D (Konto-Arbeitssitzungen aus dem alten Bild) antworten auf allen Pfaden 401, ohne
  Rückfall. Ihr `t:` wird entfernt; den Betrieb neu zu öffnen funktioniert.
- E, F (Zugangscode) bleiben gültig. Sie wurden später in den Tests F4 und Mandantentrennung
  durch Codesperren absichtlich beendet; der Aufräumlauf hat sie nicht entfernt.

## 10. Echtzeittests, 36 Minuten

**I — Aktivität:**
- Vorgehen: alle 4 Minuten eine erlaubte Anfrage, über 36 reale Minuten.
- Ergebnis: durchgehend 200.
- `az:` wurde fortgeschrieben; `as:` und `t:` blieben unverändert.
- Die Kontositzung wurde allein durch Arbeit im Betrieb gehalten, ohne direkte Kontoanfrage.

**J — Untätigkeit:** Nach 36 Minuten ohne jede Anfrage antworten mit 401:
- der Hauptpfad;
- alle fünf frühen Pfade;
- die Kontositzung.

Andere Betriebe blieben unberührt.

## 11. Aufräumlauf (GC)

**Lauf 1 (20:13:40, eine Minute nach dem Start):**
- Gelöscht: 9 `as:`, 4 `t:`, 51 `v:`; 0 Fehler, kein Abbruch.
- Alle 13 gelöschten Sitzungen waren nachweislich abgelaufen: letzte Aktivität am 09.10.,
  absolutes Ende am 10.10. um 07:29, plus 1 h Karenz.

**Lauf 2 (20:51:55, nach dem Recreate):**
- Gelöscht: 2 `az:`, 1 `ta:`, 2 `ab:` (verwaiste Reste beendeter Sitzungen) und 173 alte
  Zählfenster `v:`; 0 Fehler.

**Erhalten geblieben:**
- vorab gesetzte Prüfanker `stufe:` und `sk:`;
- alle gültigen Sitzungen (Konto, Arbeit, Code).

Der Vermerk `aufraeumen:letzter` nennt Zeit und Zahlen.

## 12. Transienter Lesefehler

Vorgehen: `t:`, `as:`, `az:` und `ta:` jeweils einzeln unlesbar gemacht (Dateirechte), danach
wiederhergestellt.

- Der Zugriff wird abgewiesen (fail closed).
- Die Datei wird nicht gelöscht, und es gibt keinen Rückfall auf eine andere Autorität.
- Nach der Wiederherstellung ist die Sitzung wieder gültig.

Die Antwort nach außen ist generisch, ohne Interna. Die Ursache steht im App-Protokoll
`centric-spur` (Art `fehler`). Ein unlesbares `t:` ergibt 500 statt 401; siehe Altbefund D.

## 13. Funktionsprüfung

**API:**
- Startseite, Assets, Manifest und Service Worker liefern 200; UTF-8.
- Bestand-Rundreise verlustfrei mit Umlauten: Personen, Qualifikationen, Abweichungen,
  Anträge, Tausche.
- Eine veraltete etag ergibt 409 statt stillem Überschreiben.
- Zeiterfassung (Stempeln Start/Ende), Datenexport des eigenen Raums, Kalender-Feed (ICS, Umlaute).
- Rollen: Mitarbeiter liest, Vollausgabe 403. `/lage` und Betreiberpfade für Leitung 403 (so vorgesehen).

**Oberfläche:**
- Zugangscode-Anmeldung funktioniert.
- Start, Monatsplan, Jahresansicht, Personal, Qualifikationen, Anträge und Tauschbörse
  rendern ohne Konsolenfehler.
- Service Worker steuert die Seite, Manifest vorhanden.
- Mobilansicht (390 px): kein horizontaler Überlauf.
- Eine in der Oberfläche angelegte Person wird serverseitig gespeichert (UTF-8 korrekt).

Zwischenfall während der Prüfung: Die Oberfläche brach zunächst ab. Ursache waren zu knapp
angelegte Testbestände der Probe: Es fehlten `anker`, Rechtematrix und Personenfelder, die das
Produkt beim Anlegen immer setzt. Nachdem die Bestände mit `baueLeerenBetrieb` und der
Personenform der App neu angelegt waren, lief die Oberfläche fehlerfrei. Das ist kein
Produktfehler.

## 14. Mandantentrennung

Leitung A gegen Betrieb B, jeweils abgewiesen oder wirkungslos:

- **Öffnen und Lesen:** B öffnen 403; Lesen mit manipulierten Parametern (`bestand`, `raum`, `betrieb`) bleibt im eigenen Raum.
- **Schreiben:** Schreibversuche mit fremdem Raum im Rumpf oder in der Query landen im eigenen Raum.
- **Verwaltung:** `zugaenge`, `raum-loeschen`, `zugaenge-uebersicht` und `bestand-anlegen` für B werden abgewiesen.
- **Codesperren:** `zugang-sperren` mit fremdem Raum sperrt in B nichts.
- **Export und Lage:** enthalten keine Daten von B.
- **Kalender:** Ein Kalender mit fremdem Bestand gehört zu A.

Ein Konto mit Mitgliedschaften in A und B erhält getrennte Merkmale je Betrieb. B war am Ende
bit-gleich.

## 15. Neustart und Recreate

- `docker compose restart`: gleiche Container-Id, neuer Start, healthy nach 8 s.
- `docker compose rm -f -s` und `up -d --pull never`: neue Id, healthy nach 8 s.
- Konfiguration unverändert.
- In beiden Fällen:
  - Bestehende Konto-, Arbeits- und Code-Sitzungen bleiben gültig.
  - Bestand A ist unverändert.
  - Neue Anmeldung, Betrieb öffnen und Abmelden (danach 401) funktionieren.

## 16. Sicherung nach dem Upgrade

`sicherungen/centric-sicherung-20261010T205221Z`:

- `pruefen`: „In Ordnung: 430 Dateien“ (plus 3 Metadateien).
- 314 578 Byte; Baumhash `9d0c9a46488cd64d0706caaae8cc5c6a5f207d44420a074230c1f0419784c41e`.
- Flüchtige Speicher (Sitzungen, Takt) bewusst nicht enthalten (Klasse C).

## 17. Isolierte Wiederherstellung

**Aufbau:**
- Neues Wegwerfverzeichnis; der laufende Datenbestand wurde nicht berührt.
- Kandidatenbild, `--network none`, ohne Ports, `--read-only`, `--cap-drop ALL`.

**Ergebnis:**
- `wiederherstellen` meldete 430 Dateien.
- Die Dateihashes von Sicherung und Wiederherstellung sind identisch (430/430).
- App-Container ohne Netz healthy.
- Konto-Anmeldung, Betrieb öffnen und Lesen funktionieren; der Pfeffer passt.
- Bestand A identisch; Code-Anmeldung B mit Umlauten funktioniert.
- Alte Sitzungen sind dort ungültig, wie vorgesehen (nicht gesichert).

Die Wegwerfumgebung wurde danach entfernt; die Sicherung bleibt.

## 18. Rollback auf 223dd385

Verfahren nach BEREITSTELLUNG.md 5.7:

1. Staging gestoppt.
2. Alle `t:` in `centric-sitzungen` und alles in `centric-accountsitzungen` beiseitegelegt
   (verschoben, nicht gelöscht). `sk:` blieb nachweislich an seinem Platz (1 vorher, 1 nachher).
3. Bildzeile auf den alten Digest umgestellt, Container neu erstellt.

Ergebnis mit dem alten Bild:

- healthy.
- Beiseitegelegte Sitzungen sind ungültig.
- Konto-Anmeldung, Betrieb öffnen, Lesen und Code-Anmeldung funktionieren.
- Bestand A und B bit-gleich zum Stand vor dem Rollback; 158 Dateien im Hauptspeicher.

## 19. Wieder vorwärts auf 7a385d19

- Bildzeile zurückgestellt, Container neu erstellt, healthy.
- Konto-Arbeitssitzung aus dem alten Bild: 401 (Ausrollregel). Code-Sitzung aus dem alten Bild:
  gültig. Betrieb mit derselben Anmeldung neu öffnen: 200.
- Kurzregression:
  - **F1:** 401 auf Haupt- und frühen Pfaden, Spuren entfernt.
  - **F3:** unbekanntes Merkmal 401.
  - **R1:** Aktivität nach mehr als 60 s; `az:` geschrieben, `as:`/`t:` unverändert, `t:` mit `herkunft`.
  - **F4:** `ta:` geschrieben, `t:` unverändert.
  - **Trennung:** fremden Betrieb öffnen 403.
- Daten bit-gleich zum Stand vor dem Rollback.
- Die Oberfläche liefert in beiden Bildern dasselbe Bundle; das Frontend ist zwischen
  223dd385 und 7a385d19 unverändert.

## 20. Production unverändert

`centric-dp-web` am Anfang und am Ende gleich:

- Id `ccad65996cb2…`, Start `2026-09-15T02:06:02Z`, 0 Neustarts, healthy, `/gesund` 200.
- Bild `sha256:0861adee…`.

Keine Änderung an Caddy oder DNS, kein `docker-deployment`, kein Merge, kein Rebase.

## 21. Offene Altbefunde (bestanden schon vor A.1)

| | Befund | Einstufung |
|---|---|---|
| A | Dialog „Person hinzufügen“: Nach dem ersten Zeichen springt der Fokus auf „Fertig“ | mittel, UX |
| B | `kalender.mjs` antwortet bei Fehlern mit 500, ohne zu protokollieren | niedrig |
| C | `POST /kalender/daten` prüft Termine nicht; fehlerhafte Termine führen erst beim ICS-Abruf zu 500 | niedrig |
| D | Unlesbares `t:` ergibt 500 statt 401 (fail closed wirkt) | niedrig |

Bewertung und Behebung: [PRE-PRODUCTION-GATE.md](PRE-PRODUCTION-GATE.md).

## 22. Urteil

**PHASE A.1 STAGING BESTANDEN**
