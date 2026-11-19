# SI-P2 – Code-Sitzung endet, wenn die Person den Betrieb verlässt

Branch `acc45/sicherheit/si-p2`, Basis `integration/release-v4` (8be0420). Eigener Pull Request, unabhängig von
SI-P1 (#105) und den CI-Arbeiten des Hauptorchestrators (`fix/ci-baseline`).

## Auswahl

Nach SI-P1, SI-P8 und dem Wegfall der CI-Reparatur war SI-P2 das nächste unabhängige Pflichtpaket: SI-P3 (#101),
SI-P5/SI-P7 (Legal-PR #103) und SI-P4/SI-P6 (2FA-Bereich des Orchestrators) sind belegt, WP-27c wartet auf
Betreiberfragen. SI-P2 berührt nur `server/lib/arbeitssitzung.mjs`, `server/funktionen/kalender.mjs` und eine neue
Datei.

## Befund

Eine Arbeitssitzung aus einem Zugangscode (ohne Account-Anker) trägt `person`. Die Rolle wird bei jeder Anfrage aus
der Personalliste abgeleitet (`wirksameRolle`); fehlt die Person dort, fällt sie auf die Rolle des Codes zurück. Wer
aus dem Betrieb austrat, anonymisiert, gesperrt oder doppelt angelegt wurde, behielt so die Sitzung bis zum Ablauf.
Auch ein später gesperrter Zugangscode beendete eine bereits laufende Sitzung nur „bestenfalls“. Der Kalenderfeed
hatte die richtige Regel bereits (`feedPersonGilt`), die Sitzung nicht.

## Änderung

- `server/lib/personengueltig.mjs` (neu): `aktivePerson(mandant, personId, heute)` – genau ein Treffer, nicht
  anonym, Status leer oder `aktiv`, Austritt nicht vor heute. Eine Quelle für Feed und Sitzung.
- `server/funktionen/kalender.mjs`: `feedPersonGilt` nutzt `aktivePerson`, Verhalten unverändert.
- `server/lib/arbeitssitzung.mjs`, Zweig der Code-Sitzung in `arbeitssitzungPruefen`:
  - gesperrter Zugangscode → Sitzung beenden, `zugang-gesperrt`; Lesefehler → `zugang-fehler` (Anfrage abgelehnt,
    Sitzung bleibt);
  - personengebundene Sitzung (kein Betreiber, kein Sicherungsschlüssel, `person` gesetzt), Person nicht mehr gültig →
    Sitzung beenden, `person-fort`. `sitzungPersonGilt(bestand, sitzung, heute)` ist exportiert.

## Entscheidungen

- Lesefehler beenden nie eine Sitzung; fehlender Bestand oder fehlender Zugang-Datensatz ändern nichts.
- Der Austrittstag zählt noch (Vergleich `<`), wie im Feed.
- Rückkehr der Person macht die beendete Sitzung nicht wieder gültig (Sitzung ist gelöscht).
- Codes ohne Person, Betreiber, Sicherungsschlüssel und Konto-Sitzungen bleiben unberührt. Konto-Sitzungen sind
  Gegenstand eigener Anker (Mitgliedschaft) und hier nur beobachtet.
- Vertragsänderung: eine personengebundene Code-Sitzung liest pro Anfrage zusätzlich den Zugang und den Bestand.
  Der alte Test „keinerlei Zugriff“ wurde auf „nur Zugang, nie Account/Mitgliedschaft/Lauf“ präzisiert.

## Tests

- `pruefungen/code-sitzung-person.test.js` (34 Tests): sechs Ursachen je mit und ohne `mandantId`, Austrittstag,
  Rückkehr, Leitung mit Person, unberührte Fälle (Code ohne Person, mehrere Betriebe, Konto, Betreiber), gesperrter
  Zugang inkl. Lesefehler, Gleichheit von Feed- und Sitzungsregel.
- Angepasste Fixtures (nur Testdaten, keine Prüfung abgeschwächt): `arbeitssitzung.test.js`, `dsgvo-server.test.js`,
  `rollen-failclosed.test.js`, `verwaltungswege.test.js` nutzten Personen, die nicht im Bestand standen.
- Mutationen (alle rot): Anonym-Prüfung, Status-Prüfung, Austrittsvergleich, Eindeutigkeit, Sperrprüfung,
  Personenprüfung entfernt, Betreiber-Ausnahme entfernt (diese war zuerst nicht abgedeckt; Test ergänzt).
- Volle Suite: 8 vorbestehende Fehlschläge (gesund 3, server 1, wiederherstellen-ui 3, zugaenge-anlegen 1); ein
  weiterer (`intelligence-gateway-kern`, „globale Deadline“) war unter Last zeitabhängig und läuft einzeln grün.
- eslint auf den geänderten Dateien sauber; `tsc -p jsconfig.json`: dieselben 20 vorbestehenden Fehler, keiner in
  den geänderten Dateien.

## Review (unabhängig, Opus; Befunde 1–9, keiner kritisch oder hoch)

Behoben:
1. **Sperre bei umgeschlüsseltem Code (mittel):** `zugangGesperrt` folgt jetzt der Kette `ersetztDurch` (Tiefe 5,
   Kreisschutz) wie der Kalenderfeed; fehlender Nachfolger ist keine Absage. Tests: Kette, fehlender Nachfolger, Kreis.
2. **Lesefehler führte im Browser zum Abmelden (mittel):** Statt `zugang-fehler` (→ 401, der Browser meldet bei 401 ab)
   wird der Lesefehler als vorübergehend (`BESTAND_UNLESBAR`, → 503) weitergereicht, wie beim Bestandsweg. Test prüft den
   geworfenen Fehler; die Sitzungsdatei bleibt.
4. **Person `""` (niedrig):** wird wie `null` behandelt (nicht personengebunden); Test ergänzt.
5. **Lader im Lesezugriff-Test falsch geformt (niedrig):** korrigiert; neuer Gegenfall mit fehlender Person ergibt
   `person-fort`.
6. **Unnötige Fixture-Änderungen (niedrig):** `dsgvo-server.test.js` N-1/N-3/N-4 sind auf `l1` zurückgestellt; nur H3
   (Person nicht im Bestand) bleibt auf `null`.
7. **Mutationslücken (niedrig):** Sammelblob-Rückgriff, Stichtag über `jetzt` (jetzt durchgereicht an
   `sitzungPersonGilt`) und Kettenfolge sind nun durch Tests abgedeckt. Die Tiefenbegrenzung der Kette ist durch den
   Kreisschutz redundant abgesichert und daher nicht einzeln testbar.
8. Veraltete Kopfkommentare zu „null zusätzlichen Lesevorgängen“ angepasst.

Nicht in diesem Paket (bewusst):
3. **Sicherungsschlüssel einer ausscheidenden Leitung (mittel, Restlücke):** wird in SI-P1 (PR #105) gelöst
   (Ersteller-Bindung, Widerruf bei Sperre/Entfernung). SI-P2 nimmt `nurSicherung` weiterhin aus.
9. **Vorbestehend, keine Regression:** `eigenerMandant` fällt bei Index außerhalb des Bereichs auf `mandanten[0]` zurück;
   `laeuftAb` von Testraum-Codes prüft nur der Feed (Überhang höchstens die Sitzungsdauer); ein ISO-Zeitstempel als
   Austritt würde einen Tag zu früh greifen (Client schreibt reine Daten).

## Offene Punkte

- Konto-Sitzungen: Verlust der Mitgliedschaft wird dort über den Anker geprüft; eine zusätzliche Personenprüfung wäre
  ein eigenes Paket.
- Die bekannten roten CI-Checks (muster, Statische Prüfung, Typen, bild-scan, sicherung) sind vorbestehend und
  liegen beim Orchestrator.

## Folgepakete (Stand 2026-11-07): keines konfliktfrei verfügbar

Geprüft gegen die offenen PRs auf `integration/release-v4`; nicht begonnen, um nichts doppelt oder kollidierend zu bauen:

| Paket | Grund |
|---|---|
| SI-P3 Mailversand aus Testräumen | Dateien `server/lib/versand.mjs`, `server/funktionen/zustellung.mjs` werden in PR #101 (IONOS-SMTP-Adapter) geändert |
| SI-P4 2FA für Leitung/Planung/Kunde, SI-P6 Betreiber-Leitungscodes | 2FA-Bereich des Orchestrators |
| SI-P5 Matrix-/Sondenlücken | `RECHTEMATRIX.md` wird in PR #103 (Legal) geändert |
| SI-P7 Herkunftssperre/IPv6 | `server/lib/schutz.mjs` wird in PR #103 geändert |
| WP-27c | wartet auf Betreiberfragen |

Sobald #101 bzw. #103 integriert sind, sind SI-P3, SI-P5 und SI-P7 ohne Konflikt machbar.
