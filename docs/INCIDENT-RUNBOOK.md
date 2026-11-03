# Incident-Runbook

Stand 2026-11-03 (WP-41). Je Symptom: **Erkennen → Sofortmaßnahme → Diagnose (zuerst nur lesend) → Behebung →
Nachbereitung**. Befehle gelten im Verzeichnis der Anwendung auf dem VPS als Benutzer `admin`, ohne sudo. Keine
Adressen, keine Zugangsdaten in diesem Dokument.

Grundregeln:

1. **Erst lesen, dann handeln.** Jede Diagnose beginnt mit Befehlen, die nichts verändern.
2. **R0 vor Experiment.** Ist unklar, ob Daten Schaden nehmen: `./abschalten.sh --trocken`, dann `./abschalten.sh`.
3. **Kein `sudo`, kein root-Container** auf `data/` — Dateien gehörten sonst root, der Dienst (uid 1000) könnte sie
   nicht lesen.
4. **Alles ins Protokoll:** Zeitpunkte, Beobachtungen, Befehle, Entscheidungen — die Grundlage für Nachbereitung und
   eine etwaige Meldung.

Lesende Grundbefehle (in allen Fällen zuerst):

    docker compose ps                                   # Zustand, healthy?
    docker compose logs --since 30m centric-dp-web      # Serverprotokoll (ohne Klartextadressen)
    docker exec centric-dp-web node -e "fetch('http://127.0.0.1:3000/gesund?detail=1').then(r=>r.text()).then(console.log)"
    df -h . && du -sh data                              # Platz
    tail -n 50 betrieb-protokoll.log                    # Auslieferungen, R0, Rücksprung
    cat ~/sicherung/status.json ~/sicherung/probe-status.json

Die Detailansicht von /gesund ist nur per `docker exec` erreichbar; nach außen steht nur die Stufe
([BETRIEB-UEBERWACHUNG.md](BETRIEB-UEBERWACHUNG.md) §1).

---

## 1. Ablage kritisch (`ablage`, /gesund 503, Alarm „kritisch“)

- **Erkennen:** Alarm mit `betroffen: ["ablage"]`, externer Check rot, Container unhealthy; Detail `ablage.text`
  („Probe gescheitert (EACCES/ENOSPC/EROFS …)“).
- **Sofort:** Schreibt der Dienst nicht verlässlich, keine weiteren Eingriffe in `data/`. Nutzer:innen ggf. kurz
  informieren. Bei Verdacht auf Datenträgerschaden: R0.
- **Diagnose (lesend):** `ls -ld data data/.gesund`, Eigentümer (uid 1000) und Modus; `df -h .`; `dmesg | tail`
  (Dateisystem schreibgeschützt?), `mount | grep " $(df --output=target . | tail -1) "`.
- **Behebung:** Ursache beheben (Rechte zurück auf uid 1000 — ohne root nur, wenn `admin` Eigentümer ist; Platz
  schaffen, siehe 2; Dateisystem prüfen lassen). Danach `docker compose restart` nur, wenn die Raumsperre hängt.
- **Nachbereitung:** Detailansicht wieder „ok“; Sicherung von Hand anstoßen; Ursache dokumentieren.

## 2. Platz knapp oder kritisch (`platz`)

- **Erkennen:** Alarm `platz`; nach außen `warnung` (auch bei „kritisch“ — ein Neustart hilft nicht).
- **Sofort:** Keine Auslieferung — `deploy.sh` wechselt bei kritischem Platz ohnehin nicht.
- **Diagnose:** `df -h .`, `du -sh data/* deploy-sicherungen/* ~/sicherung/* 2>/dev/null | sort -h | tail`,
  `docker system df`.
- **Behebung:** alte Sicherungen unter `deploy-sicherungen/` (deploy.sh behält die jüngsten 5) und
  `~/sicherung/lokal` prüfen; ungenutzte Bilder entfernen — **nie** das laufende Bild, nie `vorherig`, und den Digest der
  Sicherung außer Haus (`CENTRIC_PROD_IMAGE`) nachziehen, wenn er sich ändert. Plattenvergrößerung beim Anbieter.
- **Nachbereitung:** Wachstum beobachten; Schwellen nur bewusst ändern.

## 3. Sicherung zu alt (`sicherung`) oder Alarm der Sicherung außer Haus

- **Erkennen:** Alarm `sicherung` (wenn eingerichtet) oder Totmannschalter der Sicherung.
- **Sofort:** nichts löschen; keine Auslieferung, bis eine Sicherung steht.
- **Diagnose und Behebung:** [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §3 — Feld `schritt` in `status.json` nennt die
  Stelle, die Tabelle dort die Abhilfe.
- **Nachbereitung:** Lauf von Hand, `status.json` „ok“, Alarm grün.

## 4. Löschlauf überfällig oder mit Fehlern (`loeschlauf`)

- **Erkennen:** Detail `loeschlauf.alterStunden` > 26 oder `fehler` > 0.
- **Diagnose:** `docker compose logs centric-dp-web | grep -i löschlauf`; Ist `CENTRIC_AUFRAEUMEN=aus` gesetzt?
- **Behebung:** Ein Raum, bei dem etwas liegen blieb, wird beim nächsten Lauf erneut versucht. Bleibt derselbe Fehler:
  Raum mit `ablage-pruefen` (siehe 8) prüfen. Nie von Hand Dateien eines Raums löschen.
- **Nachbereitung:** Vermerk prüfen (Detailansicht).

## 5. Fehlerhäufung (`fehler`: 5xx, unlesbar, Journal, Bremse)

- **Erkennen:** Detail `fehler` mit Zählern der letzten 15 min.
- **Diagnose:** `docker compose logs --since 30m centric-dp-web | grep -E "Interner Fehler|nicht lesbar|Journal|bremse-ausfall"`.
- **Behebung je Zähler:** `unlesbar` → 8; `bremse-ausfall` → 9; `journal` (abgebrochene Schreibvorgänge zu Ende
  geschrieben) ist allein harmlos, gehäuft ein Hinweis auf Abbrüche (Platte, Speichergrenze 512 MB?); `5xx` → Logzeilen
  lesen, ggf. jüngste Auslieferung im Verdacht → R0 oder Rücksprung.
- **Nachbereitung:** Zähler fallen nach 15 min von selbst.

## 6. Zeitgrenze der Prüfung („Ablage kritisch: Zeitgrenze“)

- **Erkennen:** Detail `ablage.text = "Zeitgrenze"` — die Prüfung brauchte länger als die Grenze, meist hängendes
  Dateisystem oder extrem langsame Platte. *(Die Zeitgrenze ist mit WP-05b eingeführt; ist sie im laufenden Stand
  noch nicht enthalten, zeigt sich dasselbe als hängende Detailansicht.)*
- **Sofort:** wie 1. Nicht wiederholt neu starten.
- **Diagnose:** `dmesg | tail`, `iostat`/`vmstat 1 5` falls vorhanden, `docker stats --no-stream`.
- **Behebung:** Ursache am Datenträger/Anbieter; bei Hängern eines Netz-Dateisystems dieses zuerst.

## 7. Container unhealthy oder Dienst nicht erreichbar

- **Erkennen:** externer Check rot; `docker compose ps` zeigt `unhealthy` oder `exited`.
- **Diagnose:** Logs (Start verweigert wegen Prozesssperre? ungültige `CENTRIC_VERTRAUTE_PROXYS`? fehlender Pfeffer?),
  `docker inspect --format '{{json .State.Health}}' centric-dp-web`.
- **Behebung:** Konfiguration korrigieren; nach hartem Abbruch bis ~50 s warten (Prozesssperre). Kam es mit einer
  Auslieferung: R0 oder Rücksprung ([BETRIEBSHANDBUCH.md](BETRIEBSHANDBUCH.md) §4).
- **Nachbereitung:** Freigabeliste (ggf. `gesperrt` mit Grund).

## 8. Ein Raum antwortet mit 503 „nicht vollständig lesbar“ (`BESTAND_UNLESBAR`)

- **Erkennen:** Betroffene melden 503 beim Öffnen/Speichern; andere Räume arbeiten; Zähler `unlesbar`.
- **Sofort:** Nichts im Raum erzwingen. Das 503 ist Absicht (ein Bestand mit Lücke würde beim Speichern Daten löschen).
- **Diagnose und Behebung:** [BETRIEB-SICHERUNG.md](BETRIEB-SICHERUNG.md) §4a — `ablage-pruefen.mjs` im Bild des
  Dienstes, nie als root; Entscheidung nach [RESTORE-ANLEITUNG.md](RESTORE-ANLEITUNG.md).
- **Nachbereitung:** Ursache (Abbruch, Platte) klären; Sicherung prüfen.

## 9. Bremse arbeitet fail-closed (`bremse-ausfall`)

- **Erkennen:** Log „bremse-ausfall (art): … zähle im Prozessspeicher weiter“; Zähler `bremse-ausfall`.
- **Bedeutung:** Die Zählerablage (`centric-takt`) war nicht lesbar/schreibbar; die Bremse zählt im Prozess weiter und
  lässt nicht durch. Anmeldungen können strenger gebremst werden.
- **Diagnose:** Rechte und Platz (`ls -ld data/centric-takt`, 1 und 2).
- **Behebung:** Ursache beheben; ein Neustart leert die prozesslokalen Zähler.

## 10. Verdacht auf Datenabfluss oder kompromittierten Zugang

Beispiele: unbekannte Anmeldungen, ein Code taucht außerhalb auf, ein Verwalterschlüssel ist abhandengekommen,
ungewöhnliche Lesezugriffe, fremde Änderungen an Rollen.

- **Sofort (in dieser Reihenfolge):**
  1. Betroffene Zugänge sperren: Zugangscode zurückziehen (Leitung bzw. Betreiberkonsole; laufende Sitzungen enden
     mit), Verwalterschlüssel sperren, Konto deaktivieren. Zwei-Faktor-Geheimnis bei Verdacht neu einrichten.
  2. Bei Verdacht auf Server- oder Repositorykompromittierung: R0, Zugänge zum VPS und zu GitHub prüfen und rotieren.
  3. **Beweise sichern, bevor etwas gelöscht wird:** Logs (`docker compose logs > …`), `betrieb-protokoll.log`,
     Betriebs- und Betreiberprotokoll in der Anwendung, Zeitpunkte.
- **Diagnose (lesend):** Betreiberprotokoll und Protokoll der Anmeldungen (Spur ohne Klartextadressen), Verwalterliste
  (`GET /einrichten/verwalter`), Zugangsübersicht der Konsole.
- **Behebung:** Ursache schließen, neue Codes ausgeben, Betroffene informieren.
- **Meldepflicht (Hinweis, keine Rechtsberatung):** Bei einer Verletzung des Schutzes personenbezogener Daten sieht
  Art. 33 DSGVO eine Meldung an die zuständige Aufsichtsbehörde **binnen 72 Stunden nach Bekanntwerden** vor, sofern
  kein geringes Risiko besteht; Art. 34 regelt die Benachrichtigung Betroffener bei hohem Risiko. CENTRIC verarbeitet
  Personaldaten im Auftrag der Betriebe — die Betriebe sind Verantwortliche und unverzüglich zu informieren
  (Auftragsverarbeitung, Art. 33 Abs. 2). Die Bewertung trifft der Verantwortliche, ggf. mit Datenschutzbeauftragten
  und rechtlicher Beratung. Ein Zeitprotokoll ab dem ersten Hinweis erleichtert die Frist.
- **Nachbereitung:** Bericht (was, wann, wer betroffen, Maßnahmen), Restrisiken in [SICHERHEIT.md](../SICHERHEIT.md)
  aktualisieren.

## 11. Fehlgeschlagene Auslieferung

- `deploy.sh` meldet und führt R0 bzw. Rücksprung selbst aus; Exit 8 heißt: R0 nicht sicher erreicht — **sofort** von
  Hand nachsehen (`docker compose ps`, `./abschalten.sh`).
- Danach: [DEPLOY-AUTOMATISIERUNG.md](DEPLOY-AUTOMATISIERUNG.md) §1, Freigabeliste nachziehen.
