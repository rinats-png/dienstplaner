# Inventur über die Remotekonsole (REL-0, Methode „Konsole“)

Stand: 2026-11-21 · Paket: REL-0 · Skript: [`deploy/inventur-konsole.sh`](../../deploy/inventur-konsole.sh) ·
Prüfung: `pruefungen/inventur-konsole.test.js` · Werkzeug: `werkzeug/inventur-konsole-bauen.mjs`

**Zweck.** Sie haben vorerst keinen Arbeitsrechner und keinen SSH-Schlüssel. Sie sind aber als `root` in der
IONOS-Remotekonsole auf dem Produktions-VPS angemeldet. Mit sechs kurzen Befehlen holen Sie ein geprüftes Lese-Skript
in eine Variable, prüfen es und führen es aus. Es zeigt ein **Kurzprotokoll** für einen Bildschirm. Das Foto dieses
Bildschirms (oder die abgetippten Statuszeilen mit PRUEFCODE) senden Sie an Claude.

**Das Skript ändert nichts.** Es schreibt keine Datei (auch nicht in `/tmp`), installiert nichts, startet und stoppt
keinen Dienst und keinen Container, ändert keine Rechte und greift nach dem Laden nicht aufs Netz zu. Docker wird nur
gelesen (`inspect`, `images`, `version`, `stats`, `compose ps/config/version`; **kein** `docker exec`). Aus der `.env`
liest es nur Schlüsselnamen, nie Werte. Es zeigt keine Geheimnisse, Schlüsselkörper, Tokens, Mailadressen oder
Dateiinhalte. Es nutzt die Prüfungen V-1 bis V-9 aus [`deploy/inventur.sh`](../../deploy/inventur.sh) (eingebettet,
SHA-256 wird vor der Nutzung geprüft) und deren Maskierung als zweite Schicht.

**Unabhängig davon** bleibt der Weg mit eigenem SSH-Schlüssel und Forced Command
([VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md), REL-0-Installer). Diese Methode ersetzt ihn nicht und
richtet nichts dafür ein.

## 1. Voraussetzungen

- Remotekonsole des Servers `srv-prod-01`, angemeldet als `root` (Prompt endet auf `#`).
- Ubuntu 24.04, Betriebsverzeichnis `/opt/apps/centric-dienstplanung`; es und `…/data` gehören demselben Konto.
  Das Skript prüft das selbst und bricht sonst ab.
- Der VPS erreicht `raw.githubusercontent.com` (HTTPS). Ohne Netz: Abschnitt 7.
- Von Claude im Chat erhalten (unabhängiger Kanal): **`<ref>`** (12 Zeichen eines Commits) und die **Sollwerte**
  (16 Hex-Zeichen, Zeilen, Bytes). Sie müssen mit der Tabelle in Abschnitt 3 übereinstimmen. Nur wenn beide gleich
  sind, gelten sie.

## 2. Eingabe (genau so tippen)

Tippen Sie jede Zeile von Hand und prüfen Sie sie vor `Enter`. Auf manchen Tastaturbelegungen kommen `|`, `$`, `"`,
`(` oder `)` falsch an; dann zeigt die Zeile vor `Enter` ein anderes Zeichen.

| Nr | Befehl | Wirkung |
|---|---|---|
| 1 | `s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)` | lädt das Skript in die Variable `s` (keine Datei) |
| 2 | `printf %s "$s" \| sha256sum \| cut -c1-16` | zeigt 16 Hex-Zeichen |
| 3 | `printf %s "$s" \| wc -lc` | zeigt zwei Zahlen: Zeilen und Bytes |
| 4 (optional) | `printf %s "$s" \| more` | zeigt das Skript seitenweise (Leertaste weiter, `q` beendet) |
| 5 | `bash -c "$s"` | führt das Skript aus: Kurzprotokoll |
| 6 (nur auf Bitte) | `bash -c "$s" x --voll \| more` | ausführliches, maskiertes Protokoll |
| 7 | `unset s` | entfernt die Variable |

In der Tabelle steht `\|` nur wegen der Tabellenschreibweise. Tippen Sie einen einfachen senkrechten Strich `|`.

- **Warum `<ref>` ein Commit ist und kein Branchname:** Entscheidend ist die Prüfsumme (Befehl 2 und 3). Ein Branch
  kann sich nach unserer Nachricht ändern; dann stimmt die Prüfsumme nicht, und Sie müssten abbrechen. Ein Commit
  ändert sich nie. 12 Zeichen sind kurz genug zum Tippen; ein Tippfehler im Commit führt zu einem Fehler von `curl`
  (nichts geladen), nie zu einem anderen Skript mit gleicher Prüfsumme.
- **Warum `printf %s "$s"`:** `$( … )` entfernt die abschließenden Zeilenumbrüche. Die Sollwerte gelten genau für
  `printf %s "$s"` (ohne abschließenden Zeilenumbruch). `sha256sum` auf eine Datei mit Zeilenumbruch ergäbe einen
  anderen Wert.
- **Weiter nur wenn:** Befehl 1 meldet nichts; Befehl 2 zeigt genau die 16 Hex-Zeichen; Befehl 3 zeigt genau die
  Zeilen- und Bytezahl. Sonst: STOPP, Befehl 7, Foto an Claude. Führen Sie Befehl 5 nur aus, wenn alle drei stimmen.

## 3. Sollwerte (Skript in diesem Commit)

Das Werkzeug schreibt diese Tabelle (`node werkzeug/inventur-konsole-bauen.mjs --bauen`); die Prüfung stellt
sicher, dass sie zum Skript passt. Vergleichen Sie zusätzlich mit den Werten im Chat.

<!-- KONSOLE-WERTE-ANFANG (werkzeug/inventur-konsole-bauen.mjs --bauen) -->

| Wert | Soll |
|---|---|
| 16-Hex (Befehl 2) | `193f6803a09defbd` |
| Zeilen: `1063` | Befehl 3, erste Zahl |
| Bytes: `42314` | Befehl 3, zweite Zahl |
| SHA-256 (voll) | `193f6803a09defbd46be8a4e42411c633b9854217e4859f36e17a0c1b48a0438` |
| eingebettete inventur.sh | `d99207298c12` (Kopfzeile des Kurzprotokolls) |

<!-- KONSOLE-WERTE-ENDE -->

## 4. Erwartete Ausgabe (Befehl 5)

Die erste Zeile lautet immer `Dieses Skript ändert nichts.` Danach folgt das Kurzprotokoll: höchstens 25 Zeilen,
jede höchstens 70 Zeichen, nur ASCII. Je Prüfpunkt V-1 bis V-9 (dazu R-1, R-2) steht genau eine Zeile
`<Punkt> <STATUS> <Fakten>`:

| STATUS | Bedeutung |
|---|---|
| `OK` | entspricht dem erwarteten Zustand |
| `ABW` | weicht ab (Fakten in der Zeile) |
| `FEHLT` | Gesuchtes fehlt (Container, Datei, Verzeichnis, Eintrag) |
| `NICHT-PRUEFBAR` | konnte nicht geprüft werden (z. B. Docker nicht erreichbar) |

Die letzte Zeile `PRUEFCODE <12 Hex> ZEILEN <n>` ist eine Prüfsumme über alle Zeilen davor. Mit ihr erkennt Claude
Abtippfehler.

**BEISPIEL — alle Werte sind erfunden (Platzhalter), keine echten Daten:**

```text
Dieses Skript ändert nichts.
INVENTUR-KONSOLE 1 nur lesend Quelle inventur.sh aaaaaaaaaaaa
Host beispiel-vps Zeit 2026-01-01T00:00Z root ja ubuntu 24.04
Konto beispiel uid 1000 Verz+data gleich Docker 0.0.0
V-1 OK running healthy Neustarts 0 seit 2026-01-01 Bild 111111111111
V-2 OK Zustand A Digest 0b1929273a79 Label fehlt
V-3 OK .env DIGEST ja TAG nein Ref @0b1929273a79 gleich laufend
V-4 ABW Dateien 7/9+1 Summe 222222222222 compose 0.0.0 docker 0.0.0
    fehlt deploy-abgleich.mjs digest-pruefen.sh
V-5 FEHLT data 1000 755 zustand fehlt
V-6 ABW Namen 20 Pflicht fehlt 2 optional 4/70 extra 1
    fehlt Pflicht-Nr 3 9
V-7 FEHLT restic nein Cron 0/0 Verz 0/3 letzte keine
V-8 OK Dateien 2 Zeilen 3 ohne-Optionen 2 deploy-ssh 1 inventur 0
V-9 OK frei 10G von 20G belegt 50% data 1.0M gesund healthy
    letztes Ereignis 2026-01-01T00:00:00Z deploy.sh start
R-1 OK CPU 2 Last 0.10 RAM 4000M verfuegbar 2000M App 0.50% 100MiB
R-2 OK Mounts 1 data-rw ja Projekt beispiel Pfad-gleich ja
SUMME OK 6 ABW 2 FEHLT 2 NICHT-PRUEFBAR 0
PRUEFCODE 000000000000 ZEILEN 18
```

Bedeutung der Kurzformen:

| Zeile | Fakten |
|---|---|
| Kopf | Prüfsumme der eingebetteten `inventur.sh` (12 Zeichen), Rechner, Zeit (UTC), Selbstprüfung, Konto, Docker-Version |
| V-1 | Containerstatus, Health, Neustarts, Startdatum, Bild-ID (12) |
| V-2 | Zustand A/B/C nach [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §3, Digest (12), Revision-Label (12) oder `fehlt` |
| V-3 | `IMAGE_DIGEST`/`IMAGE_TAG` als Name in der `.env`, Referenz aus `compose config`, Vergleich mit dem laufenden Bild |
| V-4 | Betriebsdateien vorhanden/erwartet+weitere, Summe über ihre Prüfsummen (Claude vergleicht mit `--v4-summe <commit>`), Compose- und Docker-Version; Folgezeile: fehlende Dateien |
| V-5 | `data` und `zustand`: uid und Modus, Zahl der Einträge in `zustand` (erwartet: uid des Kontos, 700) |
| V-6 | Zahl der Schlüsselnamen; fehlende Pflichtnamen aus `.env.example` (Folgezeile: Nummern, Claude löst mit `--env-nr` auf); optionale vorhanden/gesamt; Namen außerhalb der Vorlage |
| V-7 | restic-Version, Cron-Skripte root/Konto, Sicherungsverzeichnisse vorhanden/3, letzte erfolgreiche Sicherung |
| V-8 | authorized_keys: Dateien, Schlüsselzeilen, Zeilen ohne Optionen, Forced Command `deploy.sh --ssh`, `centric-inventur` |
| V-9 | Platz (frei, gesamt, belegt), Größe `data`, Health-Status (aus V-1, kein `docker exec`); Folgezeile: letztes Ereignis im Betriebsprotokoll |
| R-1, R-2 | Ressourcen; Mounts, `data` beschreibbar, Compose-Projekt und Pfad = Betriebsverzeichnis |

## 5. Abbruchfälle

| Anzeige | Bedeutung | Handlung |
|---|---|---|
| `curl: (6) Could not resolve host` / `(7) Failed to connect` | kein Netz | Abschnitt 7 |
| `curl: (22) … 404` | `<ref>` falsch getippt | Befehl 1 neu tippen |
| `bash: curl: command not found` | curl fehlt | Abschnitt 7 |
| 16 Hex, Zeilen oder Bytes weichen ab | falscher Inhalt oder Tippfehler im Prüfbefehl | Befehl 2/3 neu tippen; bleibt es: STOPP, Befehl 7, Foto an Claude |
| `ABBRUCH: nicht root` | nicht als root angemeldet | als root anmelden, erneut ab Befehl 5 |
| `ABBRUCH: fremdes System …` | kein Ubuntu 24.04 | STOPP, Foto an Claude |
| `ABBRUCH: Besitz verschieden …` / `Besitzer ist root …` / `… fehlt` | Betriebsverzeichnis anders als bestätigt | STOPP, Foto an Claude |
| `ABBRUCH: eingebettete inventur.sh: Prüfsumme falsch` | Inhalt beschädigt | STOPP, Befehl 7, Foto an Claude |

Nach jedem `ABBRUCH` steht `Es wurde nichts geaendert.` Das Skript endet mit Rückgabe 2.

## 6. Ergebnis an Claude übermitteln

- **Bevorzugt:** ein Bildschirmfoto der Konsole mit allen Zeilen von `Dieses Skript ändert nichts.` bis `PRUEFCODE`.
- **Sonst:** die Zeilen `V-1` bis `V-9` und die Folgezeilen (eingerückt) abtippen, dazu die Zeile `PRUEFCODE`.
  Claude prüft die abgetippten Zeilen mit `node werkzeug/inventur-konsole-bauen.mjs --pruefcode` (Eingabe: alle
  Zeilen ab `INVENTUR-KONSOLE`). Stimmt der Code nicht, fragt Claude gezielt nach.
- Die Ausgabe enthält keine Geheimnisse. Sie enthält den Rechnernamen und den Kontonamen; beide gehören nicht ins
  öffentliche Repository (Zusammenfassung nach [VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md) §5).
- `--voll` nur, wenn Claude darum bittet. Es zeigt die ausführliche, maskierte Ausgabe der Abschnitte nur auf dem
  Bildschirm (Pfade, Dateilisten, Fingerabdrücke) und am Ende dasselbe Kurzprotokoll.

## 7. Ohne Netz oder ohne curl

- **curl fehlt, wget vorhanden:** Befehl 1 als
  `s=$(wget -qO- https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)`. Die
  Befehle 2 bis 7 bleiben gleich, ebenso die Sollwerte.
- **Kein Netz:** Ohne Eingabe des Skripts geht es nicht. Das Skript (rund 42 000 Zeichen) abzutippen ist nicht
  zumutbar. Die kleinste Alternative: die einzelnen lesenden Befehle aus
  [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) (V-1 bis V-9, je ein
  bis drei kurze Zeilen, ohne `cat .env` und ohne `docker exec`) einzeln tippen und je ein Foto senden. Oder warten,
  bis der Weg mit eigenem SSH-Schlüssel ([VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md)) möglich ist.

## 8. Rückweg

Nichts zu tun. Das Skript ändert nichts. Befehl 7 (`unset s`) entfernt die Variable aus der Sitzung; das Abmelden
aus der Konsole ebenso. Hinweis: Die Shell von root merkt sich die getippten Befehle in ihrer Befehlsgeschichte
(`~/.bash_history`). Die Befehle enthalten keine Geheimnisse.

## 9. Grenzen (ehrlich)

- Das Skript läuft als root. Schutz gegen ein falsches Skript ist allein der Vergleich der Sollwerte aus einem
  unabhängigen Kanal (Chat) vor Befehl 5. Ein Skript mit derselben SHA-256 zu bauen, ist praktisch unmöglich.
- `bash -c` liest beim Start `BASH_ENV`, bevor das Skript diese Variable entfernt. In der Remotekonsole setzt sie
  niemand. Prüfvariablen (`INVENTUR_*`, `CENTRIC_*`) dienen nur den Tests.
- `docker compose ps/config` liest die `.env`. Fehlertexte von Compose werden verworfen (wie in `inventur.sh`).
- Kommentare von SSH-Schlüsseln erscheinen nur im `--voll`-Protokoll und dort maskiert (zweite Schicht).

## 10. Werkzeug (für Claude)

| Aufruf | Zweck |
|---|---|
| `node werkzeug/inventur-konsole-bauen.mjs --hash` | Sollwerte (16 Hex, SHA-256, Zeilen, Bytes) nach `printf %s`-Semantik |
| `… --befehle <ref>` | genaue Betreibereingaben mit Zeichenzahl |
| `… --pruefen` | eingebettete `inventur.sh` und Vorlage aktuell, Allowlist/Sperrliste, Doku-Sollwerte (Prüfung im CI-Gate über `pruefung:querschnitt`) |
| `… --bauen` | erzeugten Block und Tabelle in Abschnitt 3 neu schreiben (nach Änderung an `inventur.sh` oder `.env.example`) |
| `… --pruefcode` | PRUEFCODE aus abgetippten Zeilen (stdin) |
| `… --env-nr 3,9` | Pflicht-Nr aus V-6 → Schlüsselnamen |
| `… --v4-summe <commit> [--ohne a,b]` | V-4-Summe der Betriebsdateien eines Commits (fehlende Dateien mit `--ohne`) |
