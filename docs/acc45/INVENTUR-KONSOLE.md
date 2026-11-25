# Inventur über die Remotekonsole (REL-0, Methode „Konsole“)

Stand: 2026-11-21 · Paket: REL-0 · Skript: [`deploy/inventur-konsole.sh`](../../deploy/inventur-konsole.sh) ·
Prüfung: `pruefungen/inventur-konsole.test.js` · Werkzeug: `werkzeug/inventur-konsole-bauen.mjs`

**Zweck.** Sie haben vorerst keinen Arbeitsrechner und keinen SSH-Schlüssel. Sie sind aber als `root` in der
IONOS-Remotekonsole auf dem Produktions-VPS angemeldet. Mit drei Befehlen holen Sie ein geprüftes Lese-Skript
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
- Von Claude im Chat erhalten (unabhängiger Kanal): **`<ref>`** (12 Zeichen eines Commits) und den **Sollwert**
  (32 Hex-Zeichen, dazu Zeilen und Bytes). Er muss mit der Tabelle in Abschnitt 3 übereinstimmen. Nur wenn beide
  gleich sind, gilt er.

## 2. Eingabe (genau so tippen)

Pflicht sind nur drei Befehle: **1** laden, **2** Tor und Ausführung, **3** aufräumen. Die genauen Zeilen mit dem
aktuellen Sollwert und ihrer Zeichenzahl stehen in Abschnitt 3.

1. `s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)` —
   lädt das Skript in die Variable `s` (keine Datei).
2. `printf %s "$s" | sha256sum | grep -q '^<32-Hex>' && bash -c "$s"` — **Tor**: Die Maschine vergleicht die ersten
   32 Hex-Zeichen (128 Bit) der Prüfsumme mit dem Sollwert. Nur bei Gleichheit startet `bash` das Skript. Ein
   Tippfehler im Sollwert oder ein anderer Inhalt führt dazu, dass **nichts** ausgeführt wird (keine Ausgabe).
   Das gilt nur, wenn `&&` richtig steht und der Sollwert vollständig ist (siehe Kasten).
3. `unset s` — entfernt die Variable.

> **Vor `Enter` bei Befehl 2, V1, V2 (10 Sekunden):**
> - `&&` sind zwei Zeichen. Ein `&` oder ein `;` statt `&&` startet das Skript **ohne** Prüfung.
> - Erscheint `[1] …` (eine Zahl in Klammern) oder fehlt `&&`: **STOPP.** Befehl 3, Foto an Claude.
> - Sollwert: genau 32 Zeichen tippen. Ein kürzerer Sollwert schwächt das Tor. Zählhilfe: 4 Blöcke zu 8 Zeichen,
>   `dc707bf7 bc96a83d 90329b5f 0291d3a3` (ohne Leerzeichen tippen; Werte aus Abschnitt 3).
> - Vor `Enter` zählen: Befehl 2 hat genau 88 Zeichen. V1 hat 110 Zeichen, V2 hat 124 Zeichen (Abschnitt 3).
> - Empfohlen: zuerst **K1** tippen. K1 muss `1` zeigen. Zeigt K1 `0`: Befehl 2 nicht tippen.
>   K1 erkennt einen verkürzten Sollwert nicht. Deshalb immer auch die Zeichen zählen.

Optional, als zusätzliche sichtbare Kontrolle vor Befehl 2: **K1** zeigt `1` (Prüfsumme passt) oder `0`; **K2** zeigt
Zeilen und Bytes. K1 vor Befehl 2 ist empfohlen (Kasten oben). Nur auf Bitte von Claude: **V1**/**V2** zeigen das
ausführliche Protokoll in Blöcken zu 60 Zeilen.

Tippen Sie jede Zeile von Hand und prüfen Sie sie vor `Enter`. Auf manchen Tastaturbelegungen kommen `|`, `$`, `"`,
`'`, `^`, `(` oder `)` falsch an; dann zeigt die Zeile vor `Enter` ein anderes Zeichen.

- **Kein Pager:** Verwenden Sie für die Ausgabe nicht `more` oder `less`. Beide haben ein Shell-Escape (`!`), mit
  dem aus dem Pager heraus beliebige Befehle als root laufen. Das Skript muss nicht angesehen werden; Schutz ist der
  Maschinenvergleich in Befehl 2.
- **Warum `<ref>` ein Commit ist und kein Branchname:** Entscheidend ist die Prüfsumme im Tor. Ein Branch kann sich
  nach unserer Nachricht ändern; dann passt die Prüfsumme nicht, und es läuft nichts. Ein Commit ändert sich nie.
  12 Zeichen sind kurz genug zum Tippen; ein Tippfehler im Commit führt zu einem Fehler von `curl` (nichts geladen).
- **Warum `printf %s "$s"`:** `$( … )` entfernt die abschließenden Zeilenumbrüche. Der Sollwert gilt genau für
  `printf %s "$s"` (ohne abschließenden Zeilenumbruch). `sha256sum` auf eine Datei mit Zeilenumbruch ergäbe einen
  anderen Wert.
- **Weiter nur wenn:** Befehl 1 meldet nichts. Befehl 2 zeigt als erste Zeile `Dieses Skript ändert nichts.` Zeigt
  Befehl 2 **nichts**: Sollwert prüfen und Befehl 2 neu tippen; bleibt es leer: STOPP, Befehl 3, Foto an Claude.

## 3. Sollwerte und Befehle (Skript in diesem Commit)

Das Werkzeug schreibt diese Tabellen (`node werkzeug/inventur-konsole-bauen.mjs --bauen`); die Prüfung stellt
sicher, dass sie zum Skript passen. Vergleichen Sie zusätzlich mit den Werten im Chat. `<ref>` nennt Claude im Chat.

<!-- KONSOLE-WERTE-ANFANG (werkzeug/inventur-konsole-bauen.mjs --bauen) -->

| Wert | Soll |
|---|---|
| 32-Hex im Tor (Befehl 2, Kontrolle K1) | `7fee4bb956c538c591d58023a0d70b1e` |
| Zeilen: `1076` | Kontrolle K2, erste Zahl |
| Bytes: `42781` | Kontrolle K2, zweite Zahl |
| SHA-256 (voll) | `7fee4bb956c538c591d58023a0d70b1e704d92027e173c9407d2a932bde1032a` |
| eingebettete inventur.sh | `d99207298c12` (Kopfzeile des Kurzprotokolls) |

Befehle (Zeichenzahl bei 12-stelligem `<ref>`; in der Tabelle steht `\|` nur wegen der Tabellenschreibweise, tippen Sie `|`):

| Nr | Zeichen | Befehl | Wirkung |
|---|---|---|---|
| 1 | 113 | `s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)` | lädt das Skript in die Variable `s` (keine Datei) |
| K1 | 72 | `printf %s "$s" \| sha256sum \| grep -c '^7fee4bb956c538c591d58023a0d70b1e'` | optional: zeigt `1` (Treffer) oder `0` |
| K2 | 23 | `printf %s "$s" \| wc -lc` | optional: zeigt Zeilen und Bytes |
| 2 | 88 | `printf %s "$s" \| sha256sum \| grep -q '^7fee4bb956c538c591d58023a0d70b1e' && bash -c "$s"` | Tor + Ausführung: nur bei passender Prüfsumme läuft das Skript (Kurzprotokoll) |
| V1 | 110 | `printf %s "$s" \| sha256sum \| grep -q '^7fee4bb956c538c591d58023a0d70b1e' && bash -c "$s" x --voll \| head -n 60` | nur auf Bitte: ausführlich, Zeilen 1–60 |
| V2 | 124 | `printf %s "$s" \| sha256sum \| grep -q '^7fee4bb956c538c591d58023a0d70b1e' && bash -c "$s" x --voll \| tail -n +61 \| head -n 60` | nur auf Bitte: Zeilen 61–120 (weiter mit +121 usw.) |
| 3 | 7 | `unset s` | entfernt die Variable |

<!-- KONSOLE-WERTE-ENDE -->

## 4. Erwartete Ausgabe (Befehl 2)

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
| Befehl 2 zeigt nichts (K1 zeigt `0`; K2 andere Zahlen) | Prüfsumme passt nicht: falscher Inhalt oder Tippfehler im Sollwert | Befehl 2 neu tippen; bleibt es leer: STOPP, Befehl 3, Foto an Claude |
| `[1] <Zahl>` nach Befehl 2, V1 oder V2 (später `[1]+ Done` oder `[1]+ Exit 1`) | `&` statt `&&` getippt: Skript lief ungeprüft | STOPP, Befehl 3, Foto an Claude |
| `ABBRUCH: nicht root` | nicht als root angemeldet | als root anmelden, erneut ab Befehl 1 |
| `ABBRUCH: fremdes System …` | kein Ubuntu 24.04 | STOPP, Foto an Claude |
| `ABBRUCH: Besitz verschieden …` / `Besitzer ist root …` / `… fehlt` | Betriebsverzeichnis anders als bestätigt | STOPP, Foto an Claude |
| `ABBRUCH: eingebettete inventur.sh: Prüfsumme falsch` | Inhalt beschädigt | STOPP, Befehl 3, Foto an Claude |

Nach jedem `ABBRUCH` steht `Es wurde nichts geaendert.` Das Skript endet mit Rückgabe 2.

## 6. Ergebnis an Claude übermitteln

- **Bevorzugt:** ein Bildschirmfoto der Konsole mit allen Zeilen von `Dieses Skript ändert nichts.` bis `PRUEFCODE`.
- **Sonst:** die Zeilen `V-1` bis `V-9` und die Folgezeilen (eingerückt) abtippen, dazu die Zeile `PRUEFCODE`.
  Claude prüft die abgetippten Zeilen mit `node werkzeug/inventur-konsole-bauen.mjs --pruefcode` (Eingabe: alle
  Zeilen ab `INVENTUR-KONSOLE`). Stimmt der Code nicht, fragt Claude gezielt nach.
- Die Ausgabe enthält keine Geheimnisse. Sie enthält den Rechnernamen und den Kontonamen; beide gehören nicht ins
  öffentliche Repository (Zusammenfassung nach [VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md) §5).
- `--voll` (Befehle V1, V2) nur, wenn Claude darum bittet. Es zeigt die ausführliche, maskierte Ausgabe der
  Abschnitte nur auf dem Bildschirm (Pfade, Dateilisten, Fingerabdrücke ohne Kommentarspalte, nur druckbare
  ASCII-Zeichen) und am Ende dasselbe Kurzprotokoll. **Sehen Sie `--voll`-Fotos vor dem Senden durch.** Schwärzen
  Sie, was Ihnen nicht zur Weitergabe geeignet erscheint (zum Beispiel Namen in Dateinamen oder Pfaden).

## 7. Ohne Netz oder ohne curl

- **curl fehlt, wget vorhanden:** Befehl 1 als
  `s=$(wget -qO- https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/inventur-konsole.sh)`. Die
  Befehle 2 und 3 bleiben gleich, ebenso der Sollwert.
- **Kein Netz:** Ohne Eingabe des Skripts geht es nicht. Das Skript (rund 42 000 Zeichen) abzutippen ist nicht
  zumutbar. Die kleinste Alternative: die einzelnen lesenden Befehle aus
  [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) (V-1 bis V-9, je ein
  bis drei kurze Zeilen, ohne `cat .env` und ohne `docker exec`) einzeln tippen und je ein Foto senden. Oder warten,
  bis der Weg mit eigenem SSH-Schlüssel ([VPS-ZUGANG-EINRICHTUNG.md](VPS-ZUGANG-EINRICHTUNG.md)) möglich ist.

## 8. Rückweg

Nichts zu tun. Das Skript ändert nichts. Befehl 3 (`unset s`) entfernt die Variable aus der Sitzung; das Abmelden
aus der Konsole ebenso. Hinweis: Die Shell von root merkt sich die getippten Befehle in ihrer Befehlsgeschichte
(`~/.bash_history`). Die Befehle enthalten keine Geheimnisse.

## 9. Grenzen (ehrlich)

- Das Skript läuft als root. Schutz gegen ein falsches Skript ist allein das Tor in Befehl 2: Die Maschine vergleicht
  die ersten 32 Hex-Zeichen (128 Bit) der SHA-256 mit dem Sollwert aus einem unabhängigen Kanal (Chat). Für einen
  gezielt passenden anderen Inhalt (zweites Urbild) bräuchte ein Angreifer nach heutigem Wissen rund 2^128
  Versuche; das gilt als nicht durchführbar. Das Tor schützt nicht, wenn der Sollwert selbst falsch übermittelt
  wurde; deshalb muss er aus dem Chat UND aus Abschnitt 3 dieses Commits stammen und gleich sein.
- Der Vergleich prüft nur den Anfang (`grep -q '^…'`). Ein Tippfehler **im Sollwert** führt dazu, dass nichts
  läuft. Das gilt nur für den Sollwert und nur bei vollständigem Sollwert:
  - **`&` oder `;` statt `&&` (A-7):** Dann ist das Tor umgangen. Das Skript läuft ungeprüft, auch bei falschem
    Inhalt. Bei `&` meldet die Shell `[1] <PID>`; später folgt `[1]+ Done` oder `[1]+ Exit 1`. Bei `;` gibt es
    nach Enter kein Erkennungszeichen; nur die Kontrolle vor Enter hilft. `&&` sind zwei Zeichen; erscheint
    `[1] …` oder fehlt `&&`: STOPP.
  - **Verkürzter Sollwert (A-8):** Ein kürzerer Sollwert (z. B. `'^dc'`) ist ein kürzerer Präfixvergleich und
    schwächt das Tor. Tippen Sie genau 32 Zeichen. Kontrolle: Befehl 2 hat genau 88 Zeichen (Abschnitt 3).
    K1 erkennt einen verkürzten Sollwert nicht (wer `'^dc'` auch in K1 tippt, sieht ebenfalls `1`).
- `<ref>` ist ein 12-stelliger Präfix eines Commits. Ein Commit (auch in einem Fork) mit gleichem Präfix und anderem
  Inhalt wird vom Tor abgefangen (andere Prüfsumme, nichts läuft).
- V1 endet mit `| head -n 60`. Nach 60 Zeilen beendet `head` die Pipe; das Skript bricht per SIGPIPE ab. Das hat
  keine Schreibwirkung (das Skript schreibt nichts); die restlichen Zeilen zeigt V2.
- `bash -c` liest beim Start `BASH_ENV`, bevor das Skript diese Variable entfernt. In der Remotekonsole setzt sie
  niemand. Prüfvariablen (`INVENTUR_*`, `CENTRIC_*`) dienen nur den Tests.
- `docker compose ps/config` liest die `.env`. Fehlertexte von Compose werden verworfen (wie in `inventur.sh`).
- Kommentare von SSH-Schlüsseln (oft Namen oder Rechnernamen) erscheinen nirgends: Die Konsolenfassung kürzt die
  Ausgabe von `ssh-keygen -lf` auf Bits, Fingerabdruck und Typ. Das Kurzprotokoll enthält sie ohnehin nicht.
- `--voll` filtert Steuerzeichen (zum Beispiel ESC-Folgen aus Dateinamen) mit `tr -cd '\11\12\40-\176'`.
- **Folgeaufgaben (Review #449, bewusst nicht in diesem Stand, damit der Skript-Hash stabil bleibt):** A-3
  Allowlist-Lücken im Werkzeug schließen (`date -s`, `sort -o`, `umask`-Argumente, `printf -v`, `mapfile -C`,
  `read` ohne Umlenkung, awk `system`/Pipe, Datei-Argumente von `grep`/`head`/`tail`/`awk`); A-6 laut Review #449.
  A-7 und A-8 sind nur in dieser Anleitung behoben (Hinweise oben und in Abschnitt 2), nicht technisch.
  Das Skript selbst nutzt keine dieser Formen schreibend (Review: Zeile für Zeile geprüft).

## 10. Werkzeug (für Claude)

| Aufruf | Zweck |
|---|---|
| `node werkzeug/inventur-konsole-bauen.mjs --hash` | Sollwerte (32 Hex für das Tor, volle SHA-256, Zeilen, Bytes) nach `printf %s`-Semantik |
| `… --befehle <ref>` | genaue Betreibereingaben (Pflicht 1, 2, 3; optional K1, K2, V1, V2) mit Zeichenzahl |
| `… --pruefen` | eingebettete `inventur.sh` und Vorlage aktuell, Allowlist/Sperrliste, Doku-Sollwerte (Prüfung im CI-Gate über `pruefung:querschnitt`) |
| `… --bauen` | erzeugten Block und Tabellen in Abschnitt 3 neu schreiben (nach Änderung an `inventur.sh` oder `.env.example`) |
| `… --pruefcode` | PRUEFCODE aus abgetippten Zeilen (stdin) |
| `… --env-nr 3,9` | Pflicht-Nr aus V-6 → Schlüsselnamen |
| `… --v4-summe <commit> [--ohne a,b]` | V-4-Summe der Betriebsdateien eines Commits (fehlende Dateien mit `--ohne`) |
