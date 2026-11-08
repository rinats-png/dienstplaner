# Staging-Abnahme E-1: Prüfpunkte 3.1-3.4 (Vorbereitung WP-S1)

Stand: 2026-11-09. Quelle der Prüfpunkte: `docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md`, Eintrag E-1 (Schritte 6-9). **Keine Freigabe**; die Abnahme selbst ist E-1 (Betreiber, QA). Alles Folgende nutzt nur künstliche Testdaten.

## 1. Was ist automatisierbar

| Punkt | Automatisch belegt (Werkzeug / Prüfdatei) | Nur Betreiber/QA am Staging |
|---|---|---|
| 3.1 Rollen x Geräte | `staging-smoke` (Rollen, Mandantentrennung: keine fremden Daten per API); Prüfdateien `oberflaeche-render`, `kontrast`, `rechtematrix`, `sicht`, `pwa`; **neu** `staging-abnahme-3 --ziel`: `/gesund`, Startseite (Viewport, Manifest), Manifest, Service Worker, je unter 1 s | Bedienung je Rolle auf Desktop, Tablet, Telefon (390 px), Querscrollen, Konsolenfehler, Antwortzeit in der Oberfläche |
| 3.2 Zeiterfassung | `staging-smoke` (Start/Ende, zweiter Start 409), `staging-geo` (Nachtdienst, Altbestand); Prüfdateien `stempeln`, `stempel-integritaet` (403), `korrekturworkflow`, `monatsabschluss`, `ungeplante-dienste` | Stempeluhr mit Standortabfrage, Korrekturantrag und Monatsabschluss in der Oberfläche, Ist/Konto/CSV |
| 3.3 Datenschutz | `staging-smoke` (E1 je Rolle, Feed-Widerruf bei Sperre), `staging-geo` (Datenschutz); Prüfdateien `stempel-datenschutz`, `entwuerfe`, `dsgvo-server`, `aufbewahrung`, `br-auswertung`; **neu** live: ohne Sitzung 401, unbekannter Feed 404 | Entwürfe aus Beschäftigtensicht, Art.-15-Auskunft inkl. Stempel, Löschlauf mit Nachweis, Betriebsrat unter Mindestgruppe |
| 3.4 Integration A+B | `staging-smoke` (Speichern, Wiederherstellen ohne Verlust verborgener Felder); Prüfdateien `kette-a-rundreise`, `warnen`, `beschaeftigung`, `abnahme-a-b`, `abnahme-409` | Rundreise je Feld und Rolle in der Oberfläche; Verstoß, Bestätigung, Protokoll, Mitteilung an die Leitung |

`werkzeug/staging-abnahme-3.mjs` gibt je Punkt PASS, FAIL oder MANUELL aus (Exit 1 bei FAIL, 2 bei falschem Aufruf). PASS heißt nur „Vorprüfung ok“.

## 2. Aufruf (rein lesend)

```
node werkzeug/staging-abnahme-3.mjs                                  # Abdeckung, offline
node werkzeug/staging-abnahme-3.mjs --ziel http://127.0.0.1:<Port>   # plus GET-Proben über den SSH-Tunnel
```

- Nur `GET`, keine Anmeldung, keine Zugangscodes, keine Weiterleitungen; als Ziel nur Loopback (der Tunnel). Fremde Ziele und Adressen mit Zugangsdaten brechen ab.
- Der Server führt für Lesezugriffe einen Bremszähler (`centric-takt`); sonst bleibt die Ablage unverändert (durch `pruefungen/staging-abnahme-3.test.js` belegt).
- Das Werkzeug liegt bewusst nicht im Bild (Dockerfile unverändert); es läuft auf dem Rechner mit dem Tunnel.
- Die schreibenden Proben (`staging-smoke`, `staging-geo`, danach `staging-aufraeumen`) bleiben unverändert im Staging-Container (Wegwerfräume `ppg-gate-a`/`-b`/`-geo`, Kennzeichnung „PPG-GATE“).

## 3. Testdaten

Künstlich und ohne Personenbezug: die Wegwerfräume der Proben (Personen „m1“, „m2“ usw., Betriebe „Betrieb A/B“). Für die Browser-Abnahme legt der Betreiber Testzugänge je Rolle an; in Nachweisen steht nur „Testperson Rolle X“. Zugangscodes und Passwörter stehen weder in Berichten noch in Logs.

## 4. Stand dieses Arbeitspakets

- Lokal geprüft: Abdeckung PASS 3.1-3.4, Live-Proben gegen frischen lokalen Server PASS, Negativfälle (FAIL, Exit 2) getestet.
- **Staging-Lauf: offen.** Er braucht den Tunnel des Betreibers; ohne Ausgabe von Zugangsdaten nicht vom Agenten ausführbar.
