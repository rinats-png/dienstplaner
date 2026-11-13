# Erkennung gestrandeter Betriebe — nur lesendes Skript

Stand: 2026-11-13. Grundlage: Betreiberentscheidung vom 2026-11-13 („zuerst ein streng nur lesendes
Erkennungsskript“), Spezifikation in `docs/acc45/MIGRATION-ERSTEINRICHTUNGSCODES.md` (PR #287, Abschnitte 1 und 2)
und `docs/acc45/WIEDERHERSTELLUNG-GESTRANDETE-BETRIEBE.md` (§1.4). Werkzeug: `werkzeug/erkennung-gestrandete-betriebe.mjs`,
Prüfung: `pruefungen/erkennung-gestrandete-betriebe.test.js` (`npm run pruefung:erkennung`).

> **Geltung.** Das Skript migriert nichts, rotiert keine Codes und ändert keine Zugänge. Getestet ist es nur mit
> synthetischen Daten und synthetischen Sicherungen. Ein Lauf auf einer Kopie einer **Produktionssicherung** braucht
> eine **gesonderte Freigabe des Betreibers** (E-D7, E-M1) und erfolgt unter den Zugriffs- und Datenschutzvorgaben
> unten.

## 1. Aufruf

Nur auf einer **Kopie**, auf einem Rechner ohne laufenden CENTRIC-Server, ohne Netz, ohne Pfeffer:

```sh
# 1. Sicherung ziehen (oder eine vorhandene nehmen) und prüfen
node werkzeug/ablage-sicherung.mjs pruefen --sicherung /pfad/centric-sicherung-<UTC>

# 2a. Erkennung direkt auf der geprüften Sicherung (empfohlen; liest nur daten/)
node werkzeug/erkennung-gestrandete-betriebe.mjs --sicherung /pfad/centric-sicherung-<UTC>

# 2b. oder auf einer in einen Wegwerfordner wiederhergestellten Kopie
node werkzeug/ablage-sicherung.mjs wiederherstellen --sicherung … --ziel /tmp/wegwerf --ohne-serverpruefung
node werkzeug/erkennung-gestrandete-betriebe.mjs --daten /tmp/wegwerf --kopie

# Optionen
#   --json                       maschinenlesbar statt Markdown
#   --ausgabe <Datei>            Ergebnis in eine NEUE Datei außerhalb der Eingabe (nie überschreiben)
#   --stichtag JJJJ-MM-TT        Stichtag für „aktive Leitung“ (Vorgabe: heute, Europe/Berlin)
#   --gespeicherte-kennungen     Betriebskennung wie gespeichert statt Pseudonym (siehe 4.)
# Umgebung
#   ERKENNUNG_LAUFSCHLUESSEL     32–128 Hex-Zeichen: gleiche Pseudonyme über mehrere Läufe (z. B. Delta-Lauf)
```

Ausgang: `0` kein Betrieb betroffen (nur M5/M6), `2` betroffene Betriebe (M1–M4), `1` Lesefehler, ungültige Sicherung
oder mindestens ein Betrieb „unklar“ (fail-closed, Go/No-Go 4.2 Punkt 2), `3` Aufruf abgelehnt.

Archive (tar/zip) liest das Skript nicht; vorher in einen leeren Wegwerfordner auspacken und `pruefen` laufen lassen.

## 2. Wie „nur lesend“ gesichert ist

| Maßnahme | Umsetzung |
|---|---|
| Kein Schreiben | Das Skript legt weder Zwischenkopie noch Temp-Datei an. Ausgaben: stdout/stderr und nur auf Wunsch `--ausgabe` (Anlage mit `wx`, nie in der Eingabe). |
| Leser der Anwendung | `bestandLesenStreng` (Kern, Scherben, Journal, Altbestand), `alleKontenStreng` (`konto:*` und Sammelblob `konten`), `aktivePerson`, `pruefen` aus `ablage-sicherung.mjs`. |
| Keine schreibfähige Ablage | `getStore()` wird **nicht** benutzt (legt beim Schreiben Ordner an, räumt `.tmp` weg). Die Leser bekommen eine eigene Ablage (`lesendeAblage`), die das Dateiformat von `server/lib/ablage.mjs` nur mit `readFile`/`readdir` liest; `set`, `setJSON`, `setJSONWennNeu`, `delete` werfen. Ein liegendes Journal wird von `bestand.mjs` nur im Speicher überlagert; die Raumsperre ist prozesslokal. |
| Keine Live-Ablage | `--daten` nur mit `--kopie`; nie der Pfad aus `CENTRIC_DATEN` bzw. `/data`; abgelehnt bei frischer Prozesssperre `.prozess` oder lebendem Halter auf diesem Rechner; eine veraltete Sperre nur in einer wiederhergestellten Kopie (`.wiederhergestellt.json`). |
| Schreiber während des Laufs | Abdruck (Namen, Größen, Änderungszeiten) der Eingabe vor und nach dem Lauf; Abweichung → Ausgang 1, Ergebnis verworfen. |
| Kein Geheimnis nötig | Kein Pfeffer, kein Netz, kein SSH. Zugänge werden nur über ihre Felder bewertet, Codes und Prüfsummen nie aufgelöst. |
| Belegt durch Tests | Inhalt aller Dateien der Eingabe bytegleich vorher/nachher; Temp- und Arbeitsordner des Laufs danach leer; Ablehnungen (frische Sperre, ohne `--kopie`, `CENTRIC_DATEN`, Ausgabe in der Eingabe, vorhandene Ausgabedatei). |

## 3. Klassen (Kurzfassung; maßgeblich ist PR #287, Abschnitt 1)

Begriffe: **Z0** = nutzbarer Leitungscode ohne Person, kein Demo, ohne Erstanmeldevermerk (nicht gesperrt, auch nicht über
die Kette `ersetztDurch`, nicht abgelaufen). **LA** = Personen mit Rolle `leitung`, die nach `aktivePerson` am Stichtag
gelten. **ZP** = nutzbare personengebundene Leitungscodes einer Person aus LA plus aktive Mitgliedschaften einer
Person aus LA. Erstanmeldevermerk wie PR #281 (`server/lib/erstleitung.mjs`, Kopf `227f633e`).

| Klasse | Bedingung (Vorrang von oben) |
|---|---|
| ausgeschlossen | Raum `ppg-gate-…`, Löschmarke `loeschung:<raum>`, Demoraum ohne Leitungs-Demozugang (nur gezählt) |
| unklar | doppelte Betriebskennung im Raum, Zugang ohne Betriebskennung in einem Raum mit mehreren Betrieben, Person als Zahl, Zugang ohne Rolle, Betrieb/Personen unlesbar, leerer Betrieb mit Z0 **und** Mitgliedschaft, leerer Betrieb ohne jeden Leitungszugang, aktive Leitung ohne jeden Zugang (Konzept „R“) |
| M6 | Demoraum mit Leitungs-Demozugang ohne Person (bzw. sonst nur Demozugang) |
| M1 | 0 Personen, Z0 ≥ 1, keine Mitgliedschaft; Unterklasse `M1-t` (Selbststart: `t-…`, `selbstAngelegt`, Liste `selbststarts`), sonst `M1-k`, wenn eine Schreibspur nicht ausgeschlossen ist |
| M5 | 0 Personen mit offenem Erstanmeldecode (`erstanmeldecode-offen`), oder Personen, LA ≥ 1, ZP ≥ 1, kein Z0 |
| M2 | Personen, LA ≥ 1, Z0 ≥ 1; Unterklasse `M2-ohne-anderen-zugang` (ZP = 0) / `M2-mit-anderem-zugang` |
| M3 | Personen, LA = 0, Z0 ≥ 1 |
| M4 | Personen, LA = 0, kein Z0 |
| M7 | nur Zähler: Erstanmeldecode mit `erstleitungVerbraucht.grund = "belegt"` ohne Person |

**Aussperrung durch E-D1/E-D2** je Betrieb: heute Leitungszugang = Z0 > 0 oder ZP > 0 oder offener Erstanmeldecode;
danach = ZP > 0 oder (offener Erstanmeldecode und 0 Personen). „Ausgesperrt“ = vorher ja, danach nein (Demo ist
Ausnahme und zählt nicht). Die Summe steht im Abschnitt „Aussperrung“ der Ausgabe.

## 4. Ausgabe und Datenschutz

- Je Betrieb: Raum-Pseudonym und Betriebs-Pseudonym (HMAC-SHA-256 mit Laufschlüssel, 12 Hex-Zeichen), Position im Raum,
  Klasse, Unterklasse, Gründe für „unklar“ (feste Kürzel), Personenzahl **auf 5 aufgerundet**, Zahl aktiver Leitungen,
  Codes je Art (mit Person, ohne Person, Erstanmeldung offen/eingelöst, belegt, gesperrt/abgelaufen, Demo, andere
  Rollen), Mitgliedschaften, Fensterzustand, Schreibspur, jüngster Z0-Monat (JJJJ-MM), Aussperrung ja/nein.
- **Nie** in der Ausgabe: Raum- und Betriebsnamen, Personennamen, E-Mail, Personen- oder Personalkennungen, Codes,
  Ablageschlüssel, Prüfsummen, `m.kontakt`, Anschrift, Pfade der Eingabe. Fehlermeldungen nennen nur die Art des Fehlers
  (Einzelheiten zu einer ungültigen Sicherung nur lokal mit `ablage-sicherung.mjs pruefen`). Belegt durch einen Test, der
  alle synthetischen Namen, Adressen, Codes, Prüfsummen und Kennungen in Markdown, JSON, Datei und stderr sucht.
- Laufschlüssel: ohne `ERKENNUNG_LAUFSCHLUESSEL` zufällig je Lauf (Pseudonyme nicht wiederholbar). Für einen späteren
  Delta-Lauf (Plan Schritt 10) einen eigenen Schlüssel erzeugen und **nur beim Betreiber** aufbewahren, nie neben der
  Ausgabe.
- `--gespeicherte-kennungen` gibt die gespeicherte Betriebskennung (`mandantId`) aus. Vorsicht: Sie kann dem Raumnamen
  gleichen (`leerbetrieb.mjs`) und damit einen Kunden erkennbar machen (Risiko R-8). Nur für den einzelnen
  Folgeschritt des Betreibers verwenden.
- **Ausgaben nie einchecken**, nicht in Tickets, Chats oder PRs kopieren; nur beim Betreiber ablegen, Aufbewahrung wie
  die Akzeptanzliste (E-M7). Die Kopie der Sicherung nach dem Lauf löschen.
- Produktionsdaten: Lauf nur nach Freigabe, auf einem Betreiberrechner, die Kopie verschlüsselt abgelegt und danach
  gelöscht; niemand außer dem Betreiber sieht die Rohdaten.

## 5. Grenzen der Klassifizierung

- **Schreibspur (M1-k)** wird nur aus dem Stand des Kerns geschätzt (Stand > 1 = „ja“, unzerlegter Altbestand =
  „unbekannt“ und damit vorsichtig M1-k). Protokoll (`centric-spur`) und Journale anderer Stände werden nicht ausgewertet.
- **Kundensitzungen** (`t:` in `centric-sitzungen`) liegen in keiner Sicherung; ein offenes Fenster mit Kundensitzung ist
  nicht erkennbar. Der Fensterzustand stützt sich nur auf `ersteinrichtung:<raum>`.
- **Accounts** des Kontowegs werden nicht auf Sperre geprüft; eine aktive Mitgliedschaft eines gesperrten Accounts zählt
  als ZP (zu günstig). Gleiches gilt für Mitgliedschaftsgenerationen (`mitgliedlauf:`).
- **Erstanmeldevermerk** ist nach PR #281 (`227f633e`) nachgebildet, weil das Modul auf `release-v4` fehlt. Ändert #281
  die Prädikate, ist das Skript nachzuziehen.
- **Rollen ohne Leitung** (Planung, Betriebsrat, SV, Beschäftigte) ohne Person werden nur gezählt (`andereRollenOhnePerson`),
  nicht klassifiziert (NT-4 betrifft den Server, nicht die Erkennung).
- **Demo** nur über den Raumnamen `demo-…` und `demo: true`; ein Demozugang außerhalb eines Demoraums zählt nicht als
  Kundenzugang.
- Ergebnis gilt für **den Stand der Sicherung**, nicht für die Live-Ablage. Für das Go (Plan 4.2) höchstens 24 h alt.
- Prüf- und Werkzeugräume außer `ppg-gate-…` (z. B. Wegwerfablagen aus `deploy/abnahme-7-9-staging.mjs`) werden nicht
  erkannt und normal klassifiziert.
