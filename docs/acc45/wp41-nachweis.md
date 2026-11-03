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

## Festgestellte Abweichungen Doku ↔ Code

| # | Befund | Wo | Vorschlag |
|---|---|---|---|
| 1 | `.env.example` fehlen sieben Variablen, die der Server liest: `CENTRIC_UEBERWACHUNG`, `CENTRIC_GESUND_TAKT_S`, `CENTRIC_GESUND_CACHE_MS`, `CENTRIC_GESUND_LOESCHLAUF_WARNUNG_STUNDEN`, `CENTRIC_GESUND_5XX_WARNUNG`, `CENTRIC_ALARM_WIEDERHOLUNG_S`, `CENTRIC_SICHERUNG_STATUS` (letztere nur in `deploy/compose.yml`, auskommentiert). Mit WP-05b kommt `CENTRIC_GESUND_ZEITGRENZE_MS` hinzu. | `.env.example` | als auskommentierte Zeilen ergänzen (Vorgaben sind brauchbar) |
| 2 | `.env.example` und BEREITSTELLUNG empfehlen für `CENTRIC_VERTRAUTE_PROXYS` das **Subnetz** des Netzes `proxy` (Platzhalter `<SUBNETZ_DES_NETZES_PROXY>`); die Review-Auflage B1 und `deploy.sh` empfehlen **nur Caddys feste Adresse** | `.env.example`, `BEREITSTELLUNG.md`, `docs/CADDY-UND-XFF.md` §7 | Platzhalter und Text auf „Caddys feste Adresse (Subnetz nur übergangsweise)“ vereinheitlichen |
| 3 | Sicherungen eines Betriebs lassen sich in der Oberfläche **anlegen** („Sicherung anlegen“, „Vorher sichern“, Text: „auf die sich später zurückgehen lässt“), aber **nicht auflisten oder zurückspielen** — dafür gibt es nur die Schnittstelle (`GET /api/sicherungen`, `POST /api/wiederherstellen`); `SP.sicherungen()` hat keinen Aufrufer | `src/App.jsx`, `src/speicher.js` | Oberfläche für die Leitung ergänzen oder Text anpassen |
| 4 | Die Rechtetabelle der Oberfläche gibt dem Betriebsrat `audit.view` und `export.data`; beide Rechte prüft die Oberfläche nirgends, der Server liefert dem Betriebsrat kein Betriebsprotokoll (RECHTEMATRIX: –), und Datenmitnahme/Vollausgabe verlangen `org.edit` bzw. Leitung | `src/App.jsx` `MATRIX_STD`, `RECHTE_GRUPPEN` | Rechte entfernen oder fachlich entscheiden; die Anzeige der Rechte irreführt sonst |
| 5 | `werkzeug/staging-smoke.mjs` und `staging-geo.mjs` verlangen `CENTRIC_ADMIN` in der Umgebung des Servers; Betriebshandbuch, `.env.example` und `/einrichten/umgebung` raten, ihn nach dem ersten Verwalterkonto zu entfernen | `werkzeug/staging-*.mjs` | im Staging bewusst setzen und danach entfernen — in PRE-PRODUCTION-GATE festhalten, oder die Proben auf einen Verwalterschlüssel umstellen |
| 6 | Die Zeitgrenze der Zustandsprüfung (WP-05b) ist im Integrationsstand b84de34 noch nicht enthalten; das Runbook beschreibt sie mit Hinweis | `server/lib/gesund.mjs` | erledigt sich mit der Integration von WP-05b |
| 7 | Die Ansicht „Datenschutz“ verweist Anfragen betroffener Personen an den Betrieb; eine Auskunft aus der Anwendung ist erst in Vorbereitung (WP-26) | `src/App.jsx` | mit WP-26 |

Keine der Abweichungen ist ein offener Sicherheitsbefund; die Dokumente enthalten keine Adressen, Codes oder
Schlüssel.
