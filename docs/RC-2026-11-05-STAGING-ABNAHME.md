# Release-Kandidat rc-2026-11-05: Identität und Staging-Abnahme

Stand: 2026-11-05. **Keine Produktionsfreigabe.** Dieses Dokument beschreibt den Release-Kandidaten eindeutig und den Umfang der einmaligen Staging-Abnahme. Ausgeliefert wird nichts ohne ausdrückliche Betreiberfreigabe.

## 1. Identität (unveränderlich)

| | |
|---|---|
| Tag | `rc-2026-11-05` (annotiert, schreibgeschützt behandeln) |
| Commit | `265d575ba3163be76e2bd451bd29428a76914349` |
| Quelle | `integration/centric-complete` zum Zeitpunkt des Tags |
| Bild | `ghcr.io/rinats-png/dienstplaner:265d575ba3163be76e2bd451bd29428a76914349` |
| **Index-Digest (der Wert für die Freigabeliste)** | `sha256:98556e64fb1e83fdab8af70cb27700f1cb9a44e8d26694c5dbc8d8c77825f0da` |
| Plattform-Manifest linux/amd64 | `sha256:ea9696420fb7f8e96e176e80b2f022a88b4985ba50aa1c19ca3e84a59dfde0b7` |
| Bau | Workflow „Auslieferung“, Lauf `42000936348` (Gate `pruefung` und `sicherheit` grün, Job `bild` erfolgreich, Job `vps` übersprungen) |
| Revision-Label im Bild | `org.opencontainers.image.revision=265d575ba3163be76e2bd451bd29428a76914349` |

Der Digest-Typ ist derselbe wie bei den bisherigen Einträgen der Freigabeliste (Tag-Digest des Registry-Index; belegt am aktiven Eintrag `0b192927…` = Tag `274bfa0…`).

### Vorgänger (unverändert, nicht überschrieben)

| | |
|---|---|
| Tag | `rc-2026-11-04` |
| Commit | `466f624ef0856244bb89f2424dfca00a4ae9fa7c` |
| Index-Digest | `sha256:be3731d2a22049a41a2cd60a2f3a952fdb0e9d03982d138e43ecadc8b511f0e2` |
| Status | **ersetzt** (enthält den P0-Fehler „Sitzung ohne Rolle“). Nie ausgeliefert. Wird nicht für Produktion freigegeben. |

## 2. Inhalt gegenüber dem Vorgänger

| PR | Inhalt | Commit im RC |
|---|---|---|
| #93 | **P0:** Sitzung, Anmeldung und Demozugang ohne Rolle erhalten keinen Zugriff. Auswirkung: `docs/SITZUNG-OHNE-ROLLE-AUSWIRKUNG.md` | `355f396` |
| #95 | Social-Vorschau in der neuen C-Marke, `og:image` absolut (`https://app.centric-dienstplanung.de/vorschau.png`) | `265d575` |

**Nicht enthalten:** PR #91/#92 (V4-Oberfläche, isolierte Branches), PR #96 (Bestätigungsprotokoll im Aufbewahrungslauf, bleibt Entwurf), PR #94 (Entscheidungsvorlagen). Standardwerte unverändert: `CENTRIC_DEMO`, `CENTRIC_SELBSTSTART` aus; `CENTRIC_DATENSCHUTZLAUF` = `vorschau` (keine Löschung).

## 3. Vor dem Wechsel: ausschließlich lesende Bestandsprüfung (Betreiber)

Zugangscodes oder Betriebsmitgliedschaften **ohne Rolle** melden sich nach #93 nicht mehr an. Das Skript `rollenlose-zugaenge-lesen.mjs` findet sie lesend: kein Schreiben, keine Migration, keine Codes oder Prüfsummen in der Ausgabe. Es liegt als `deploy/rollenlose-zugaenge-lesen.mjs` neben den übrigen Betriebsskripten (nicht im Bild, damit das Bild unverändert bleibt). Aufruf, am besten gegen eine **Kopie** der Daten:

```
CENTRIC_APP=<Pfad zum entpackten Bild-Stand> CENTRIC_DATEN=<Kopie der Daten> CENTRIC_ABLAGE=dateien \
  node deploy/rollenlose-zugaenge-lesen.mjs
```

Oder im laufenden Container (liest nur): `docker exec -i <container> node --input-type=module < deploy/rollenlose-zugaenge-lesen.mjs`.

Getestet gegen eine Wegwerf-Ablage: Dateiliste, Prüfsummen und Zeitstempel vor und nach dem Lauf identisch. Ergebnis „keine“ bedeutet: #93 hat keine Auswirkung auf bestehende Zugänge. Andernfalls entscheidet der Betreiber je Zugang (Code mit ausdrücklicher Rolle neu ausstellen). Es gibt keine automatische Änderung.

## 4. Staging-Abnahme (einmalig, auf den Umfang begrenzt)

Geprüft wird das **tatsächlich vorgesehene Image** (Digest oben). Auf Änderungen und releasekritische Funktionen beschränkt; keine erneute Gesamtrevision.

| # | Prüfung | Weg | Erwartung |
|---|---|---|---|
| 1 | Bild-Identität | `docker pull ghcr.io/rinats-png/dienstplaner@sha256:98556e64fb1e83fdab8af70cb27700f1cb9a44e8d26694c5dbc8d8c77825f0da`; `docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' <ref>` | Label = `265d575ba3163be76e2bd451bd29428a76914349` |
| 2 | Start und Gesundheit | Staging mit genau diesem Digest starten; `GET /gesund` | 200, Dienst gesund |
| 3 | Gate-Probe im Bild | `docker exec <staging> node /app/werkzeug/staging-smoke.mjs`, danach `node /app/werkzeug/staging-aufraeumen.mjs` | Exit 0; Aufräumen Exit 0 |
| 4 | Standardschalter | `GET /api/demos`; öffentliche Registrierung und Selbststart | Demo-Liste leer; Registrierung und Selbststart aus |
| 5 | #93: Anmeldung je Rolle | je ein Testcode mit Rolle leitung, planer, subplaner, mitarbeiter, betriebsrat und betreiber anmelden | alle melden sich an, jede sieht ihre Oberfläche |
| 6 | #93: Datenschutz Stempel | als mitarbeiter und betriebsrat die Ist-Zeiten anderer Personen aufrufen | keine fremden Ist-Zeiten, keine fremden Stempel |
| 7 | #93: rollenloser Code (nur mit Kopie von Altdaten) | Code ohne Rolle anmelden | 403, keine Sitzung |
| 8 | #95: Vorschau | `curl -s https://<staging>/ \| grep -E 'og:image|twitter:image|og:url'`; `GET /vorschau.png` | absolute Adresse `https://app.centric-dienstplanung.de/…`; Bild 1200×630, PNG, neue Marke |
| 9 | Speichern und Konflikt | Betrieb speichern, Rückgängig, bewusster Konflikt (zwei Fenster) | erwartetes Verhalten, keine Fehlermeldung ohne Grund |
| 10 | Sicherung | Sicherung erstellen und prüfen (`ablage-pruefen`) | ohne Befund |

Hinweis zu 8: Die Adresse zeigt auf die Produktions-Domain. Das Bild erscheint dort erst nach dem Produktivwechsel; für Staging genügt, dass die Datei vom Staging-Host ausgeliefert wird.

## 5. Entscheidung nach der Abnahme (Betreiber)

Erst nach bestandener Staging-Abnahme und ausdrücklicher Freigabe: Eintrag in `deploy/FREIGEGEBENE-IMAGES.md` (Entwurf, **nicht** im Repository):

```
| `sha256:98556e64fb1e83fdab8af70cb27700f1cb9a44e8d26694c5dbc8d8c77825f0da` | `265d575ba3163be76e2bd451bd29428a76914349` | 2026-11-DD | docs/RC-2026-11-05-STAGING-ABNAHME.md | aktiv | Release-Kandidat rc-2026-11-05 (P0 Sitzung ohne Rolle behoben, Social-Vorschau) |
```

Dabei die bisherige Zeile `aktiv` (`0b192927…`, Commit `274bfa0…`) auf `vorherig` setzen. Rückweg: `deploy.sh … --bei-fehler=ruecksprung` auf `0b192927…`, sonst R0 (`abschalten.sh`).

## 6. Offene Punkte außerhalb dieses Release-Kandidaten

- PR #96 (Aufbewahrung Bestätigungsprotokoll), nach der Abnahme; keine automatische Löschung, Fristen je Datenkategorie erst fachlich und rechtlich absichern.
- A05 (Mutterschutz): im Pilot nicht erfassen oder verwenden.
- A25: „Alle Kalender-Verweise widerrufen“ nach dem RC; Altfeeds erst lesend zählen.
- V4 (PR #91/#92): isoliert, kein Merge vor Staging-Abnahme und Browserprüfung.
