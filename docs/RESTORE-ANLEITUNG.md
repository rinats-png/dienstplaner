# Wiederherstellung — welcher Weg wann

Stand 2026-11-03 (WP-41). Entscheidungshilfe; die Schritte selbst stehen in
[BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §4 (Ernstfall) und §4a (unlesbare Datei) sowie
[BEREITSTELLUNG.md](../BEREITSTELLUNG.md) 5.4 (Werkzeug `ablage-sicherung`).

## 1. Die vier Wege

| Weg | Umfang | Wer | Wann |
|---|---|---|---|
| **A. Wiederherstellen eines Betriebs (In-App-Sicherung)** | ein Betrieb, aus seinen Sicherungen in der Ablage (`sicherung:<raum>:…`) | Leitung. Anlegen, Auflisten und Zurückspielen gehen in der Oberfläche (Einstellungen → „Sicherung anlegen“, „Sicherungen“ → „Zurückspielen“; WP-25); darunter liegen `GET /api/sicherungen` und `POST /api/wiederherstellen`. Zurückgespielt wird nur der eigene Betrieb. **Bleibt** (aus dem jetzigen Stand): alle Stempel mit ihren Korrekturen und die zugehörigen Ist-Zeiten, das Protokoll, die Planänderungen, Vertrags- und Rechnungsangaben, Zustellwege, Bank-/Steuer-/Lohnangaben, anonymisierte Personen, andere Betriebe des Raums. **Geht auf den Stand der Sicherung zurück**: Plan und Freigaben, Personen (wer erst nach der Sicherung angelegt wurde, fehlt danach), Einstellungen, Dienstarten, Abwesenheiten, Anträge und alles, was seitdem eingetragen wurde. Der jetzige Stand wird vorher automatisch gesichert. Aufbewahrungsfristen gelten auch für Zurückgespieltes: Bei `CENTRIC_DATENSCHUTZLAUF=an` wird Fälliges entfernt, sonst nur gemeldet. Bei „nicht vollständig lesbar“ (503) ist Zurückspielen gesperrt — §4a in [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) | fachlicher Fehler in einem Betrieb (versehentlich gelöscht, falscher Plan), Ablage lesbar |
| **B. `ablage-pruefen`** | eine unlesbare Datei eines Raums | Betreiber auf dem VPS, Werkzeug im Bild | ein Raum antwortet mit 503 `BESTAND_UNLESBAR`, alle anderen arbeiten |
| **C. Vollständige Wiederherstellung** | die ganze Ablage aus einer lokalen Sicherung | Betreiber, R0 vorher | Ablage großflächig beschädigt, Sicherung lokal vorhanden (`deploy-sicherungen/`, `~/sicherung/lokal`) |
| **D. restic außer Haus** | die ganze Ablage aus dem Speicherziel | Betreiber, R0 vorher | VPS verloren, lokale Sicherungen unbrauchbar oder zu alt |

## 2. Entscheidungsbaum

    Ist die Ablage lesbar und nur EIN Betrieb fachlich betroffen?
    ├─ ja → Weg A (Leitung). Geheimnisse und Vertrag kommen aus dem heutigen Stand;
    │       was die Leitung nicht sieht (z. B. Bank- und Lohnangaben), bleibt unverändert.
    └─ nein
       Antwortet genau ein Raum mit 503 „nicht vollständig lesbar“?
       ├─ ja → Weg B: BETRIEB-SICHERUNG §4a (ablage-pruefen im Bild, nie als root).
       │       Solange eine Datei unlesbar ist, antwortet auch „Wiederherstellen“ in der App
       │       mit 503 — Weg A geht erst, wenn der Raum wieder lesbar ist.
       │       Welche Datei? (steht im Serverprotokoll)
       │       ├─ Scherbe (ein Monat), in keiner Sicherung → beiseitelegen
       │       │  (--beiseitelegen; fehlende nur mit --fehlende-hinnehmen <raum>:<monat>).
       │       │  Der Monat gilt dann als leer, der Raum ist wieder lesbar → danach ist
       │       │  Weg A möglich, um den Monat aus einer In-App-Sicherung zurückzuholen.
       │       └─ Kern → aus einer Sicherung (--aus-sicherung … --kern-zurueck);
       │          liegt er in keiner brauchbaren Sicherung → Weg C/D, nicht Weg A.
       └─ nein (mehrere Räume, ganze Ablage, Platte, VPS)
          R0 (./abschalten.sh). Liegt eine geprüfte lokale Sicherung vor, die neu genug ist?
          ├─ ja → Weg C: BEREITSTELLUNG 5.4, Weg 1 (wiederherstellen mit Pfeffer-Datei).
          └─ nein → Weg D: BETRIEB-SICHERUNG §4 (Snapshot wählen → erst proben → holen → wiederherstellen).

Immer gilt: **erst proben, dann zurückspielen** (`wiederherstellung-probe.sh --snapshot <ID>` bzw.
`ablage-sicherung.mjs pruefen`), altes `data/` nur beiseitelegen, nie löschen, bis die Kontrolle bestanden ist.

## 3. Was nach C oder D anders ist

- Alle müssen sich neu anmelden (Sitzungen sind flüchtig und werden nicht gesichert).
- Was seit der Sicherung geschah, ist zurückgenommen — auch Zugangsentzüge, Passwortänderungen, Sperren. Diese
  Liste (aus Protokollen) nach dem Start **erneut ausführen**.
- Derselbe `CENTRIC_PFEFFER` ist Pflicht; ohne ihn ist keine Sicherung gegenprüfbar.

## 4. Probe-Restore-Routine

| Wann | Was | Ergebnis |
|---|---|---|
| monatlich, automatisch (3., 04:15) | `wiederherstellung-probe.sh`: jüngsten Snapshot holen, prüfen, abgleichen, Pfeffer prüfen, Probecontainer ohne Netz | `~/sicherung/probe-status.json`, Ping |
| monatlich, von Hand (5 min) | `probe-status.json` lesen: `ergebnis`, `abweichend`/`fehlend` = 0, `healthy` | im Betriebsprotokoll vermerken |
| vierteljährlich | Probe mit einem **älteren** Snapshot (`--snapshot <ID>`) | Aufbewahrung wirkt wie geplant |
| nach jeder Änderung an Sicherung, Bild-Digest oder Pfeffer-Verwahrung | Probe von Hand | vor dem nächsten Ernstfall wissen, dass es geht |

Schlägt eine Probe fehl: [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §3 (Tabelle nach `schritt`).
