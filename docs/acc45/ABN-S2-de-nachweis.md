# ABN-S2-de — Auflagen für Pilot Form I (Nachweis und Abgrenzung)

Stand: 2026-11-25. Prozessstufe L3, Umfangsklasse SICHERHEIT-QUALITAET. Basis `origin/integration/release-v4`. Nur synthetische
Daten, keine Hosts, Adressen oder Schlüssel. Quelle: `SICHERHEITSBEWERTUNG-ABN-A2-S2.md` Abschnitte 2, 7, 7.1; `docs/CADDY-UND-XFF.md` Abschnitt 7.
Keine Änderung an Bremsgrenzen oder Betreiber-Auth; keine Angriffstests gegen die Produktion.

## 1. Abgleich: was ist Repo, was ist Betreiberhandlung

Das Paket ist laut SSOT eine **Betreiberhandlung** („Dateien: Betriebsumgebung des Betreibers, keine Repo-Dateien“). Claude kann
S2-d (Alarm oder tägliche Auswertung), S2-e (Betriebsregel bestätigen) und den Wert in der Betriebsumgebung nicht setzen und
nicht belegen. Im Repo ist vorhanden und wurde nur abgeglichen:

| Auflage | Im Repo bereits | Lücke im Repo | Ergebnis |
|---|---|---|---|
| Proxy-Vertrauensliste `CENTRIC_VERTRAUTE_PROXYS` | `server.mjs` liest sie, ungültiger Eintrag hält den Start an, leer: Warnung; `/einrichten/umgebung` meldet `vertrauteProxys`; `deploy/deploy.sh` bricht bei leerem Wert ab; Anleitung `docs/CADDY-UND-XFF.md` Abschnitt 7; `pruefungen/herkunft-xff.test.js` | keine | nichts zu tun; Nachweis des **gesetzten Werts in der Betriebsumgebung** bleibt beim Betreiber (3.) |
| S2-d Alarm `anmelden · gebremst (gesamt)` | Die Bremse protokolliert die Abweisung durch die Gesamtgrenze (`schutz.mjs`, Grund „ungewöhnlich hohes Aufkommen“, Dimension `gesamt`; `daten.mjs` schreibt `anmelden`/`gebremst` mit Zusatz „… (gesamt)“) und das Alarmwerkzeug `CENTRIC_ALARM_WEBHOOK` (`gesund.mjs`) existiert | **kein Test band den Alarmschlüssel**: ein Umbau des Texts hätte den Alarm des Betreibers still ins Leere laufen lassen | Test ergänzt (2.) |
| S2-e Betriebsregel frische Betreibersitzung | nur Text in der Bewertung (§ 7: organisatorisch, kein Schutz) | – | Betreiberbestätigung (3.) |

## 2. Umsetzung im Repo (nur der Alarmschlüssel)

`pruefungen/abn-a2-s2-sicherheit.test.js`, Test S2-2 (Stufe 1, 45 Herkünfte × 9 falsche Codes, echter Handler, echte Grenzwerte)
prüft jetzt zusätzlich: Nach der Flut steht in der Spur (`spurLesen`) mindestens eine Zeile `art = anmelden`, `ausgang = gebremst`,
Zusatz genau „ungewöhnlich hohes Aufkommen (gesamt)“; die Zeile enthält weder Zugangscode noch Herkunft.
Der Test ist ein Festhalten des Ist-Verhaltens (kein Fehler vorher, daher kein „rot vorher“); als Schutz belegt durch eine
Mutation: Textänderung des Grunds oder der Dimension in `schutz.mjs`, Weglassen des Protokolleintrags in `daten.mjs` — siehe 4.

## 3. Betreiberhandlung (Nachweis durch den Betreiber, Vorlage; nichts davon ist erledigt)

1. **S2-d:** Alarm (oder tägliche Auswertung) auf `anmelden · gebremst (gesamt)` einrichten. Lesenachweis: Datum, Kanal
   (ohne Adresse im Repo), „Alarm wurde in einer Probe ausgelöst / Auswertung gelesen“. Keine Angriffsprobe gegen Produktion.
2. **S2-e:** schriftliche Bestätigung der Betriebsregel „frische Betreibersitzung vor Eingriffen“ (Anmelden, bevor eingegriffen wird).
3. **Vertrauensliste:** Bestätigung, dass `CENTRIC_VERTRAUTE_PROXYS` in der Betriebsumgebung gesetzt ist und nur Caddys feste
   Adresse enthält; Beleg ohne Adresse im Repo (z. B. Log-Zeile `Herkunft: X-Forwarded-For wird von 1 vertrauten Einträgen
   angenommen.` und `vertrauteProxys: true` in `/einrichten/umgebung`, keine Zeile `WARNUNG: Anfrage mit X-Forwarded-For`).
   Ist sie leer, sperren schon 9 Fehlversuche einer Person Betreiber-Neuanmeldung und Einlösen (Bewertung § 2).

## 4. Prüfungen

Siehe Bericht des Koordinators: Lauf `pruefung:einladungen` (Datei `abn-a2-s2-sicherheit.test.js`) und Mutationen je Schutz einzeln.

## 5. Rückfragen (nichts erfunden)

- Keine Schwellwerte für den Alarm sind im Repo entschieden (ab wie vielen `gebremst (gesamt)` je Zeitraum ein Alarm ausgelöst
  wird). Vorschlag zur Entscheidung: schon ein einzelner Eintrag am Tag ist auffällig (Grenze 400 je 300 s heißt: ein Eintrag
  bedeutet eine ungewöhnliche Flut); Betreiber legt Kanal und Schwelle fest.
- S2-b (eigene Bremsart für das Einlösen, Gesamtgrenze „Vorschlag 200 je 300 s“) ist **nicht** Teil dieses Pakets und bleibt eine
  Betreiberentscheidung (Bewertung § 8 Nr. 3).
- Die Annahme von ABN-S2 für Pilot Form I (G9) ist Betreiberentscheidung und hier nicht vorweggenommen.
