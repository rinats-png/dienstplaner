# WP-I18 (Teil) – Nachweis: technische Auflagen aus dem Review von PR #146

Stand 2026-11-12 · Branch `feature/wp-i18-auflagen` · Basis `origin/integration/release-v4` @ 0b3c3ab7.

**Ergebnis: keine Codeänderung.** Alle technischen Auflagen aus dem Review von PR #146 (WP-I13) sind bereits
mit PR #162 (WP-I18 Kern, gemergt 2026-11-09) in `integration/release-v4` umgesetzt und getestet. Die Zeile
„WP-I18 … technische Auflagen aus dem Review von PR #146 (Modellregistry Pflicht, Schlüsselbund) ausführbar“ in
`BEREITSCHAFTSANALYSE-2026-11-12.md` (und der Punkt in `WIEDERAUFNAHME.md`) ist damit überholt; die Korrektur
dieser Dateien und von `work-packages.json` bleibt bei der Koordination. Dieser Branch ändert nur dieses Dokument.

Produktive Anbieteraufrufe bleiben deaktiviert. Kein Netz, kein Schlüssel, keine neue Abhängigkeit; der
Gateway-Schalter ist weder an `server.mjs` noch an die Umgebung verdrahtet.

## Quelle der Auflagen

- GitHub: PR #146 hat weder Reviews noch Zeilenkommentare; der einzige Kommentar (Xalgorix-Bot) meldet nur
  „Couldn't complete the review right now“. Daraus folgt keine Auflage.
- Das Opus-Review von PR #146 ist in der SSOT festgehalten (`work-packages.json`, WP-I18, `notiz`) und in
  `WP-I18-KERN-NACHWEIS.md` zitiert: (1) Modellregistry Pflicht, Modellkennung aus der Registry an den Adapter
  (`modellFuer()` wurde nirgends aufgerufen; mittel); (2) Gateway und Speicher nur über `erzeugeSchluesselbund`,
  Alias- gegen MAC-Schlüssel getrennt (niedrig); Restrisiko: Anbieterschlüssel fehlt im Trennungsvergleich.

## Abgleich je Auflage

| Auflage | Stand | Beleg |
|---|---|---|
| (1) Registry Pflicht; Modellkennung je Stufe aus `registry.modellFuer(stufe)`; ohne Kennung kein Aufruf | erledigt (PR #162) | `gateway.mjs` G19/G20, `registry.mjs` R1–R4; `intelligence-gateway-i18.test.js` Block A, `intelligence-gateway-i13.test.js` (ungültige Registries → `KI_INTERN`) |
| Registry lehnt unbekannte/ungültige Einträge ab (Lücke in den Stufen, leere Version, Adresse statt Kennung, fremde Felder, nachgebaute Registry, Ort ≠ Adapter) | erledigt | `registry.mjs` R1–R4, `registryPruefen` (Marke) |
| (2) Gateway und Ergebnis-Speicher nur mit Schlüsselbund; Alias ≠ MAC; MAC-Rotation | erledigt (PR #162) | `schluessel.mjs` K1–K7, `ergebnis.mjs` E10, `gateway.mjs` G21; Block B |
| Restrisiko: Anbieterschlüssel im Trennungsvergleich | erledigt (PR #162, Review-Auflage C) | `anbieter-live.mjs` `schluesselBrauchbar`; Block „Review-Auflagen B/C“ |
| Schlüssel nie in Log, Fehler, JSON, String, inspect, Stack | erledigt | K4 (Schlüsselbund), L4 (Live-Adapter); Test „L4: Anbieterschlüssel in keinem JSON, String, inspect oder Fehler“ |
| Konfiguration fail closed (fehlend, kein Hex, zu kurz, Platzhalter, Prototypkette) | erledigt | K1, K3, K5; L1–L3 |
| Kein `process.env` im Modul; Umgebung nur übergeben | erledigt | K-Kopf, L3 (Suche im Gateway-Verzeichnis: `process.env` nur in Kommentaren); Netz- und Verdrahtungsgrenzen `intelligence-gateway-grenzen.test.js` |
| Ausgabegrenze an den Adapter, Nachprüfung, fester Rückfall je Fehlerklasse | erledigt (PR #162) | G20/G22, Review-Auflage A |

Gegenprobe am 2026-11-12 auf 0b3c3ab7 (Skript außerhalb des Repos, nur Laufzeit-Platzhalter aus `randomBytes`,
Transport wirft einen Fehler mit dem Platzhalter-Schlüssel im Text): Alias-, MAC- und Anbieterschlüssel erscheinen
in keinem `util.inspect` (showHidden), `JSON.stringify`, `String`, `error.message` oder `error.stack`; fehlende,
nicht-hexadezimale und nicht getrennte Schlüssel werfen; vier ungültige Registries werden abgelehnt;
`modellFuer` liefert für unbekannte Stufen und Nicht-Ganzzahlen `null`.

Bewusst **nicht** neu eingeführt (keine Auflage des Reviews, würde gemergtes Verhalten ändern):
Pflicht einer Versionsangabe in jeder Modellkennung und eine Zulassungsliste „Modell je Funktion“. Heute steuert der
Router die Stufe je Funktion, die Registry begrenzt die Stufenkette; echte Kennungen setzt der Betreiber erst nach
E-25. Wer eine Versionspflicht für Kennungen will, entscheidet das mit der Anbieterwahl (siehe unten).
Konfigurationsdateien für Schlüssel gibt es nicht; Schlüssel kommen nur über die übergebene Umgebung.

## Tests (2026-11-12, Basis 0b3c3ab7)

| Lauf | Ergebnis |
|---|---|
| `npx vitest run pruefungen/intelligence-gateway-i18.test.js pruefungen/intelligence-gateway-i13.test.js pruefungen/intelligence-gateway-grenzen.test.js` | 3 Dateien, 98 / 98 |

## Weiter BLOCKED durch E-25 – Entscheidungen des Betreibers

Erst nach diesen Entscheidungen darf ein Anbieter angebunden werden (Transport mit Anbieterformat, Route,
`.env.example`, Betriebshandbuch, Verdrahtung des Schalters):

1. **Anbieter und AVV:** Welcher Anbieter; AV-Vertrag nach Art. 28 DSGVO abgeschlossen (Datum = `konfig.avv.datum`).
2. **Zero-Data-Retention:** schriftlich zugesichert ja/nein; ohne ZDR keine Freigabe von Freitext-Funktionen.
3. **Region / Drittland:** Verarbeitung nur EU/EWR, oder Drittland mit Rechtsgrundlage (Angemessenheitsbeschluss bzw.
   Standardvertragsklauseln plus Transfer-Folgenabschätzung).
4. **Schlüsselverwahrung:** wer den Anbieterschlüssel erzeugt, wo er liegt (nur Server-Umgebung des VPS, nicht im
   Repo, nicht in Backups/Logs), ein Schlüssel je System oder je Betrieb, Rotationsintervall und Widerruf bei Vorfall.
5. **Budgetgrenze:** Monatsbudget (Betrag) und Anbindung an die Verbrauchsbuchung (WP-I15), damit ein erreichtes Budget
   den Live-Pfad sperrt (offene Auflage aus PR #162; ohne diese Anbindung keine Verdrahtung).
6. **DSFA:** Datenschutz-Folgenabschätzung für den KI-Anschluss abgeschlossen (Grundlage `WP-I18-LOESCHKONZEPT.md`).
7. **Mitbestimmung:** Beteiligung des Betriebsrats (§ 87 Abs. 1 Nr. 6 BetrVG) bzw. Betriebsvereinbarung je Pilotbetrieb.
8. **Echte Modellkennungen** für die Registry (Stufen 1–3) einschließlich der Frage, ob Kennungen versioniert
   (festgepinnt) sein müssen.

Bis dahin gilt: Freigabe-Gate geschlossen (Vorgabe), kein Server erzeugt den Live-Adapter, kein Transport existiert.
