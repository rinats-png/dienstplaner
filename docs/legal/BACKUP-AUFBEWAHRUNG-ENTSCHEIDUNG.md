# Backup-Aufbewahrung und Löschzusage: Entscheidungsvorlage

**Status: ENTSCHEIDUNGSVORLAGE für den Betreiber, Stand 2026-11-07.** Keine Rechtsberatung, kein Kanzleigutachten. Sie beschreibt, was die Technik heute nach Repository-Stand tut, wo das mit einer früheren Zusage nicht zusammenpasst und welche Wege es gibt. Entscheiden tut der Betreiber; rechtliche Wirksamkeit der Formulierungen ist mit Kanzlei oder Datenschutzbeauftragten zu klären (oder, nach Entscheidung vom 2026-11-07, vorläufig als Restrisiko zu tragen, siehe `docs/FREIGABEPAKET-BETREIBER.md` F.8).

**Vorgabe des Betreibers (2026-11-07):** Die Aufbewahrungstechnik bleibt **unverändert**. Diese Vorlage ändert weder Skripte noch Werte noch Texte; sie bereitet nur die Entscheidung über die **Aussage** vor.

Belegt wird aus dem Repository (Branch `docs/betreiber-schritte`), Betriebszustand auf dem VPS ist unbelegt (kein Serverzugriff). Belegstellen in Klammern.

## 1. Wo liegen Kopien von Betriebsdaten wirklich?

| Weg | Was | Wie lange | Wirkt heute? | Beleg |
|---|---|---|---|---|
| **restic, Sicherung außer Haus** | Vollsicherung der Ablage, täglich, Host-Kennung `centric` | `forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune`, also bis rund 12 Monate (ein Monatsstand je Monat); der älteste Stand bleibt, solange eine Regel freie Plätze hat | **Unbelegt**: Einrichtung nicht nachgewiesen (`BETRIEB-SICHERUNG.md`: „Bis dahin ist nichts eingerichtet“; F.3). Der feste Wert ist im Skript eingebaut | `deploy/sicherung/sicherung-ausser-haus.sh` Zeile 158, `docs/BETRIEB-SICHERUNG.md` Zeile 25 und 379, CI-Nachrechnung `deploy/sicherung/ci/aufbewahrung-erwartet.py` |
| **In-App-Sicherungen** (Leitung legt an; automatisch vor kritischen Vorgängen) | Betriebs- oder raumweite Sicherung als Datei in derselben Ablage (`sicherung:<raum>:…`) | Beim Anlegen: je Kontingent die 20 neuesten, von älteren Tagen je die jüngste, **ohne Altersgrenze** (`auszuduennen`). Im Datenschutzlauf zusätzlich: täglich bis 14 Tage, wöchentlich bis 90 Tage, Höchstalter 90 Tage, **die 20 neuesten je Kontingent bleiben auch über 90 Tage** (`SICHERUNGS_PLAN`, `sicherungsPlan`) | Ja, im Betrieb. Das Löschen nach Alter geschieht aber **nur im Modus „an“**; in den Modi „aus“ und „vorschau“ (Vorgabe im Quelltext: „vorschau“) wird nur gezählt (`sicherungenFaellig`) und nichts gelöscht | `server/lib/sicherungen.mjs`, `server/lib/datenschutzlauf.mjs` (Zeilen 70, 103 bis 125, 205 bis 210), `server/lib/aufbewahrung.mjs` (`datenschutzModus`), `server/funktionen/daten.mjs` Zeile 200 |
| **Dateisystem- oder VPS-Snapshots des Anbieters** | – | – | **Nicht dokumentiert.** Keine Repo-Datei beschreibt Snapshots, Backup-Optionen oder Objektspeicher bei IONOS (F.3). Ob im IONOS-Konto etwas gebucht ist, kann nur der Betreiber nachsehen | – |
| **Lokale Sicherungen auf dem VPS** | `~/sicherung/lokal`, `deploy-sicherungen/` (Weg C der Restore-Anleitung), Datenordnerkopien vor Eingriffen (Vorschlag in F.2) | keine automatische Löschung dokumentiert | Je nach Betreiberhandeln; Umfang unbelegt | `docs/RESTORE-ANLEITUNG.md` Weg C, `BETRIEB-SICHERUNG.md` |
| **Logs** | `~/sicherung/log/sicherung-<UTC>.log` (60 Tage); Container-Log mit `json-file`, 10 MB mal 3 Dateien; Protokoll des Löschlaufs in der Ablage | Sicherungslogs 60 Tage; Containerlog rotiert nach Größe | Logs enthalten laut Doku keine Geheimnisse; ob sie Personenbezug haben, ist hier nicht geprüft | `docs/BETRIEB-SICHERUNG.md` Zeile 30 und 136, `deploy/compose.yml` Zeilen 78 bis 82 |

Zusätzlich ist der restic-Datenbestand ein **Vollabbild**: Er enthält alle Betriebe der Ablage, nicht einzelne Personen. Ein einzelner Betrieb oder eine einzelne Person lässt sich daraus nicht herauslöschen, ohne das Abbild zu verändern (Annahme aus der Funktionsweise von restic; ein gezieltes Entfernen einzelner Dateien aus alten Snapshots ist nicht dokumentiert).

## 2. Was passiert mit bereits gelöschten Daten bei einer Wiederherstellung?

- **In-App-Wiederherstellung (Weg A):** Der Betrieb wird auf den Stand der Sicherung gesetzt, danach wird mit den **heutigen** Fristen des Betriebs geräumt (`betriebWiederherstellen`, `raeumen`). Das geschieht **nur bei `CENTRIC_DATENSCHUTZLAUF=an`**. Bei „aus“ oder „vorschau“ wird nur gemeldet, was fällig wäre; Gelöschtes kommt dann zurück (im Quelltext als bewusste Grenze dokumentiert). Das ist die technische Seite von **RET-007** („Wiederherstellung bringt gelöschte Gesundheits- und Austrittsangaben nicht dauerhaft zurück“, `rechtliches/loeschkonzept.md`, Branch `legal/compliance-v1`; `docs/legal/TECHNISCHE-FOLGEAUFGABEN.md` T-16). RET-007 gilt damit **nur im Modus „an“** und nur für den In-App-Weg.
- **Vollständige Wiederherstellung aus restic (Weg C/D):** Die ganze Ablage geht auf den Sicherungsstand zurück (`docs/RESTORE-ANLEITUNG.md` §3). „Was seit der Sicherung geschah, ist zurückgenommen“, ausdrücklich auch Zugangsentzüge und Sperren; die Anleitung verlangt, diese Liste **aus Protokollen** erneut auszuführen. Eine entsprechende Anweisung für **Löschungen personenbezogener Daten** steht dort nicht. Ob der Löschlauf nach dem Start ohne weiteres alles wieder entfernt, hängt wieder vom Modus „an“ ab und davon, ob die Fristen aus den gesicherten Daten selbst folgen (Annahme, nicht geprüft).
- **Ein Löschprotokoll, das eine Wiederherstellung überlebt, gibt es nicht:** Das Protokoll des Löschlaufs liegt in der Ablage und geht mit dem Restore auf den Sicherungsstand zurück (Folge aus der Bauweise, Annahme). Ein von den Daten getrenntes Löschprotokoll (nur Kennungen und Datum, keine Inhalte) existiert nach Repository-Stand nicht.

## 3. Der Widerspruch zur früheren Zusage

Der Altbestand der Verträge sah vor: Herausgabe in 30 Tagen, danach **Löschung einschließlich Sicherungskopien binnen 60 Tagen** nach Vertragsende (Altbestand: AVV und AGB § 11; im Entwurf `legal/compliance-v1` heute: AVV „Herausgabe und Löschfristen“ und AGB § 11 Abs. 3).

Das passt **nicht** zur Technik, sobald die restic-Sicherung eingerichtet ist:
- restic hält bis zu 12 Monatsstände; ein Betrieb, der am Vertragsende gelöscht wird, bleibt in älteren Monatsständen bis zu rund einem Jahr enthalten.
- Die In-App-Sicherungen können, auch nach dem Höchstalter von 90 Tagen, wegen der „20 neuesten“ bestehen bleiben.
- Gelöschtes kann durch einen Restore zurückkommen (§ 2).

Der **Entwurf** in `legal/compliance-v1` ist darum neutral: Die Zusage „Sicherungskopien binnen 60 Tagen“ wird ausdrücklich **nicht** gegeben; Sicherungskopien „folgen dem dokumentierten Lebenszyklus“; AVV und AGB tragen `[ZU_KLAEREN]`. Er ist Entwurf, nicht veröffentlicht. Zu prüfen ist zusätzlich, ob die Formulierung im AVV-Entwurf zu Sicherungskopien („stellt … die Löschung nach Wiederherstellung wieder her“) heute technisch belegt ist: Das gilt nur im Modus „an“ und nur für den In-App-Weg (§ 2).

## 4. Optionen

### Option A: Aussage an die Technik anpassen (empfohlen als Mindeststand)

**Inhalt.** Technik bleibt unverändert. Die Verträge sagen ehrlich: Löschung im Produktivbestand binnen einer genannten Frist; **Sicherungskopien werden nach ihrem Lebenszyklus gelöscht, bei der Sicherung außer Haus bis zu 12 Monate nach der Erstellung**; Daten, die nach Vertragsende noch in Sicherungen liegen, werden **nicht** aktiv genutzt und bei einer Wiederherstellung unverzüglich erneut gelöscht (Wiederanwendung des Löschauftrags).
- **Vorteile.** Sofort umsetzbar, keine Technikänderung, ehrlich und prüfbar; deckt sich mit der verbreiteten Praxis, Backups nach festem Plan zu rotieren (die rechtliche Einordnung ist nicht geprüft).
- **Nachteile.** Längere Frist als die frühere Zusage; Kunden mit strengen Löschwünschen können widersprechen. Die „erneute Löschung nach Wiederherstellung“ ist nur belastbar, wenn ein Weg dafür belegt ist (siehe Option C). Bis dahin als Pflicht in Betriebsanleitung und Vertrag benennen, nicht als technisch erzwungen.
- **Aufwand.** Textänderung in AVV, AGB, Datenschutzerklärung, Löschkonzept und TOM (kleiner Aufwand, Agent); Prüfung durch Kanzlei oder DSB bleibt offen (kostenpflichtig, nach Entscheidung vom 2026-11-07 vorläufig nicht beauftragt, Restrisiko beim Betreiber).

### Option B: Retention auf eine kürzere Staffel ändern (Technikänderung, Betreiberentscheid)

**Inhalt.** Der Skriptwert wird gekürzt, zum Beispiel auf 7 tägliche, 4 wöchentliche und 2 bis 3 monatliche Stände (rund 60 bis 90 Tage). Dann lässt sich die Zusage „binnen 60 bis 90 Tagen“ technisch tragen. Der Wert ist im Skript fest eingebaut (`--keep-daily 7 --keep-weekly 4 --keep-monthly 12` in `sicherung-ausser-haus.sh`, im Test `pruefungen/rechtstexte.test.js` (Branch `legal/compliance-v1`), `BETRIEB-SICHERUNG.md`, `aufbewahrung-erwartet.py`).
- **Vorteile.** Zusage und Technik stimmen überein; kleineres Datenschutzrisiko durch weniger alte Kopien; geringerer Speicherbedarf.
- **Nachteile.** Weniger weit zurückreichende Wiederherstellungspunkte: Fehler, die erst nach Monaten auffallen (falscher Plan, unbemerkter Datenfehler), sind nicht mehr rückholbar. Widerspricht deiner Vorgabe vom 2026-11-07 („Technik unverändert“), ist also nur eine spätere Option. Einmalige Änderung an Skript, Doku, CI-Nachrechnung und Tests; vorhandene Sicherungen im Repository rotieren erst über die Zeit.
- **Aufwand.** Mittel: Änderung in Skript, `BETRIEB-SICHERUNG.md`, `aufbewahrung-erwartet.py`, Tests und Löschkonzept; Agentenarbeit nach Entscheidung, keine Aktivierung durch den Agenten. Erst nach Betreiberfreigabe.

### Option C: Löschprotokoll und Re-Löschung nach Restore als Pflichtschritt

**Inhalt.** Neben der Aufbewahrung wird ein **Löschprotokoll außerhalb der gesicherten Daten** geführt (nur Kennungen und Datum, keine Inhalte, Aufbewahrung begründet und kurz). Nach **jedem** Restore (Weg A, C, D) ist die erneute Anwendung dieses Protokolls ein Pflichtschritt der Restore-Anleitung, mit Nachweis. Ergänzend: `CENTRIC_DATENSCHUTZLAUF=an` als Voraussetzung eines produktiven Restores.
- **Vorteile.** Löst das Kernproblem (Gelöschtes kommt nicht unbemerkt zurück), unabhängig von der Länge der Aufbewahrung; auch mit Option A kombinierbar; stärkt die Zusage „wird nach Wiederherstellung erneut gelöscht“.
- **Nachteile.** Neue Technik und neuer Prozess: Wo liegt das Protokoll (außerhalb der Sicherung, damit es den Restore überlebt)? Wer führt es aus? Das Protokoll selbst enthält Kennungen und ist Personenbezug in kleinem Maß. Bei eingeschaltetem Löschlauf ist die Wiederanwendung für die In-App-Wiederherstellung bereits eingebaut; für den restic-Weg fehlt sie.
- **Aufwand.** Hoch im Vergleich: Konzept, Code im Löschlauf, Ergänzung der Restore-Anleitung, Tests, Restore-Probe auf dem VPS. Dient auch der Dokumentation für den Pilot.

## 5. Empfehlung (nicht bindend)

1. **Kurzfristig A**, weil es mit deiner Vorgabe „Technik unverändert“ vereinbar ist: Die Rechtstexte nennen die tatsächliche Frist („bis zu 12 Monate in Sicherungen“) und die Pflicht, den Löschauftrag nach einem Restore erneut anzuwenden. Bis die Einrichtung der Sicherung außer Haus belegt ist (F.3), bleibt die Aussage über sie als `[ZU_KLAEREN]` markiert.
2. **Mittelfristig C ergänzen**, vor einem Pilot mit echten Beschäftigtendaten (Form II): erst dann ist die Aussage „nach Wiederherstellung erneut gelöscht“ technisch belegbar.
3. **B nur, wenn** Kunden oder Rechtsprüfung eine kürzere Frist verlangen; dann als eigene Technikentscheidung.
4. Unabhängig davon vor dem Produktiv-Restore sicherstellen, dass `CENTRIC_DATENSCHUTZLAUF=an` gilt (Vorgabe im Quelltext ist „vorschau“; der Produktivwert ist unbelegt, F.1 O-07).

## 6. Offene Punkte, die nur der Betreiber beantworten kann

- Ist die Sicherung außer Haus eingerichtet (Ziel, Region, Cron)? Wenn nein, gilt heute nur der In-App-Teil.
- Ist im IONOS-Konto ein Snapshot, Backup oder Objektspeicher gebucht? Falls ja, dessen Aufbewahrungsdauer und Löschbarkeit prüfen und hier ergänzen.
- Welcher Modus ist produktiv eingestellt (`CENTRIC_DATENSCHUTZLAUF`)?
- Welche Frist sollen die Verträge nennen: nur „Produktivbestand“ oder auch „Sicherungen“?
- Wer führt nach einem Restore die erneute Löschung aus, und wo wird das vermerkt?

**Nicht Teil dieser Vorlage:** Änderung von Skripten, Aktivierung der Sicherung, Änderung von AVV/AGB-Texten im Branch `legal/compliance-v1` (das ist ein eigener Arbeitsschritt nach der Entscheidung).
