# WP-41 — Betriebs- und Nutzerdokumentation: Nachweis

Branch `acc45/infra/wp41-dokumentation`, Basis `integration/centric-complete` (b84de34).

## Ergebnis

| Akzeptanz | Dokument |
|---|---|
| Betriebshandbuch | [BETRIEBSHANDBUCH.md](../BETRIEBSHANDBUCH.md) — Einstieg mit Verweisen, Architektur, alle Umgebungsvariablen aus dem Code mit Vorgabe und Abgleich gegen `.env.example`, Routinen, Auslieferung und Rückweg, Schlüssel und Codes ohne Geheimnisse |
| Incident-Runbook | [INCIDENT-RUNBOOK.md](../INCIDENT-RUNBOOK.md) — elf Fälle (Ablage, Platz, Sicherung, Löschlauf, Fehlerhäufung, Zeitgrenze, unhealthy, Raum unlesbar, Bremse, Datenabfluss/kompromittierter Zugang, fehlgeschlagene Auslieferung), je Erkennen → Sofort → Diagnose (lesend zuerst) → Behebung → Nachbereitung; Hinweis Art. 33/34 DSGVO ohne Rechtsberatung |
| Restore-Anleitung | [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md) — vier Wege, Entscheidungsbaum, Probe-Restore-Routine; Schritte verweisen auf BETRIEB-SICHERUNG §4/§4a |
| Handbuch je Rolle | [handbuch/](../handbuch/README.md) — Mitarbeitende, Schichtverantwortung, Planung, Leitung, Kunde/Inhaber, Betriebsrat, Betreiber; je „Was Sie tun können“ und „Was Sie sehen — und was nicht“ |

Quellen: `src/App.jsx` (`MATRIX_STD`, `BEREICHE`, `NAV_BETREIBER`), `server/lib/rechte.mjs`, `server/lib/sicht.mjs`,
`RECHTEMATRIX.md`, `server/`-Lesestellen von `process.env`. Funktionen in Arbeit (WP-22, WP-26, WP-17) sind als „in
Vorbereitung“ gekennzeichnet, nicht beschrieben.

## Prüfung

`pruefungen/doku.test.js` (`npm run pruefung:doku`, CI-Schritt „Dokumentation“): alle WP-41-Dokumente vorhanden;
jeder relative Verweis zeigt auf eine vorhandene Datei; **jede Umgebungsvariable, die `server/` oder `server.mjs`
liest, steht im Betriebshandbuch** (eine neue Variable ohne Doku macht den Test rot); keine IP-Adressen außer
127.0.0.1, keine Digests, Zugangscodes, Verwalterschlüssel oder privaten Schlüssel in den Dokumenten. Ein
Markdown-Lint ist im Repository nicht eingerichtet.

## Festgestellte Abweichungen Doku ↔ Code und ihr Stand

| # | Befund | Stand |
|---|---|---|
| 1 | `.env.example` fehlten Variablen, die der Server liest (`CENTRIC_UEBERWACHUNG`, `CENTRIC_GESUND_TAKT_S`, `CENTRIC_GESUND_CACHE_MS`, `CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN`, `CENTRIC_GESUND_5XX_WARNUNG`, `CENTRIC_GESUND_ZEITGRENZE_MS`, `CENTRIC_ALARM_WIEDERHOLUNG_S`, `CENTRIC_SICHERUNG_STATUS`; Prüf-Variablen `CENTRIC_STATIK`, `CENTRIC_PRUEFLINK`) | **behoben:** alle ergänzt (auskommentiert, Vorgaben wie im Code; Prüf-Variablen unter „nie in Produktion“). Die Shell-Variablen von `deploy.sh` (`CENTRIC_DEPLOY_BEHALTEN` u. a.) stehen als Hinweis dabei und im Betriebshandbuch — die `.env` liest `deploy.sh` dafür nicht. `doku.test.js` prüft jetzt auch, dass jede vom Server gelesene Variable in `.env.example` steht. |
| 2 | `CENTRIC_VERTRAUTE_PROXYS`: `.env.example`, BEREITSTELLUNG und CADDY-UND-XFF §7 empfahlen das Subnetz, B1/`deploy.sh` nur Caddys feste Adresse | **behoben:** überall nur Caddys feste Adresse; das Subnetz ist als „nicht empfohlen“ (nur Übergang) gekennzeichnet; Platzhalter `<FESTE_ADRESSE_DES_CADDY_CONTAINERS>`; Test |
| 3 | Sicherungen eines Betriebs: Anlegen in der Oberfläche, Auflisten und Zurückspielen nur über die Schnittstelle | **→ WP-25.** Der Oberflächentext „auf die sich später zurückgehen lässt“ ist ehrlich angepasst: „Zurückspielen ist in der Oberfläche noch nicht möglich (in Vorbereitung).“ |
| 4 | Rechtetabelle gibt dem Betriebsrat `audit.view` und `export.data` ohne Wirkung | **→ WP-27**; das Rollenhandbuch beschreibt den tatsächlichen Stand |
| 5 | Staging-Proben verlangen `CENTRIC_ADMIN`, die Doku rät zum Entfernen | **behoben (Doku):** `.env.example`, Betriebshandbuch und PRE-PRODUCTION-GATE §8: nur auf Staging und nur für die Dauer der Proben; in Produktion nach dem ersten Verwalterkonto entfernen |
| 6 | Zeitgrenze der Zustandsprüfung (WP-05b) | **erledigt:** mit #37 integriert, im Betriebshandbuch und in `.env.example` |
| 7 | Auskunft nach Art. 15 DSGVO aus der Anwendung | in Vorbereitung (WP-26) |
| 8 | Review 18272f0: Entscheidungsbaum schickte bei unrettbarer Datei zu Weg A (die App antwortet dann 503); Runbook ohne geschützte Auslieferungs-Sicherung; `dmesg` braucht root; Art.-33-Satz ungenau | **behoben:** Baum unterscheidet Scherbe (beiseitelegen/`--fehlende-hinnehmen`, dann Weg A möglich) und Kern (`--kern-zurueck` aus Sicherung, sonst C/D); Runbook §2 nennt `.letzte-erfolgreiche` (ab WP-31b) und verbietet deren Löschen; Kernelmeldungen über `journalctl -k` oder Anbieter-Konsole; Art. 33 nah am Wortlaut („es sei denn … voraussichtlich nicht zu einem Risiko …“) |
| 9 | Nach WP-26 (#40): `CENTRIC_DATENSCHUTZLAUF` fehlte im Betriebshandbuch; Kopplung an `CENTRIC_AUFRAEUMEN`, Zurückschalten von `an` und Zurückspielen (N-3), Einschränkungen der Selbstauskunft (N-2, N-4) nicht beschrieben | **behoben:** Handbuch (Konfiguration und Routinen), `.env.example`, RECHTEMATRIX Fußnote ²⁶ |

Keine der Abweichungen ist ein offener Sicherheitsbefund; die Dokumente enthalten keine Adressen, Codes oder
Schlüssel.
