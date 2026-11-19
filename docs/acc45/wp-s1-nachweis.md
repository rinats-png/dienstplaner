# WP-S1 Nachweis — Staging-Vorbereitung (nur lokal)

Branch `feature/ready-kleinpakete`, Basis `9aac167`. Ausgeführt wurde **nichts gegen Staging und nichts gegen den
VPS**. Die Proben liefen lokal: `pruefungen/staging-proben.mjs` startet einen frischen Server auf
`127.0.0.1:3000` mit leerer Wegwerf-Ablage und räumt danach nur dessen Ablage auf.

## Was

1. **Lokale Gate-Proben gegen den aktuellen Integrationsstand** (Basis `9aac167` plus diese Pakete):

   | Probe | Ergebnis | Exit |
   |---|---|---|
   | `staging-smoke.mjs` | **51/51** bestanden | 0 |
   | `staging-geo.mjs` | **30/30** bestanden | 0 |
   | `staging-aufraeumen.mjs` (erster Lauf) | **19/19** bestanden | 0 |
   | Aufräumen, zweiter Lauf ohne Altlasten | **16/16** bestanden, nichts zu tun | 0 |
   | Aufräumen mit fremdem Inhalt unter einem Gate-Namen | verweigert, nichts gelöscht | 3 |
   | Smoke mit Altlasten | abgebrochen, nichts angelegt | 3 |
   | **Gesamt `staging-proben.mjs`** | **16/16 bestanden** | **0** |

   Rohausgabe: `scratchpad/proben-lokal.txt` (nicht im Repo). Die Proben gelten für den lokalen Stand, nicht
   für Staging. Staging-Bild und Digest sind nicht geprüft.

2. **Prüfung der Probenwerkzeuge** (`pruefungen/wp-s1-staging.test.js`, **4 Tests**, grün):
   - `staging-smoke.mjs`: Ziel fest `127.0.0.1:3000`, Argumente abgewiesen, Ziel-Umgebungsvariablen abgelehnt,
     Geheimnisse geschwärzt, Exit-Codes dokumentiert.
   - `staging-proben.mjs`: startet nur den lokalen Server; kein Aufruf gegen eine fremde Adresse (die fremden
     Adressen im Text sind Ablehnungsziele).
   - Abnahme-Checkliste deckt Testplan 3.1–3.4 ab, enthält keinen erledigten Haken und vermerkt
     „nicht gegen Staging gelaufen“.

3. **Abnahme-Checkliste für den Betreiber**: `docs/acc45/STAGING-ABNAHME-CHECKLISTE.md`. Sie folgt den Schritten
   von E-1 (`docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md`) und führt Testplan 3.1 (Oberfläche je Rolle und Gerät),
   3.2 (Zeiterfassung), 3.3 (Datenschutz) und 3.4 (Integration A+B) auf, dazu die offenen Browserpunkte aus E-1.
   Ohne Staging-Zugang, Tunnel oder Zugangscodes ausfüllbar nur durch den Betreiber.

## Nicht getan (bewusst)

- Kein Lauf von `staging-smoke.mjs`, `staging-geo.mjs` oder `staging-aufraeumen.mjs` gegen Staging oder den VPS.
- Kein Staging-Bild, keine Umstellung der Staging-`compose.yml`, keine Zugangscodes erzeugt.
- Die Abnahme 3.1–3.4 selbst ist E-1 und liegt beim Betreiber.

## Hinweis

Die Gate-Proben starten am lokalen Port 3000. Auf dem Entwicklungsrechner muss der Port frei sein; der Lauf
schrieb nur in ein Wegwerfverzeichnis unter dem Temp-Ordner.
