# Persönlicher SSH-Zugang vom Handy (REL-0c „Handy-SSH-Zugang“)

Stand: 2026-11-22 · Paket: REL-0c · Skript: [`deploy/handy-zugang.sh`](../../deploy/handy-zugang.sh) ·
Prüfung: `pruefungen/handy-zugang.test.js` · Werkzeug: `werkzeug/handy-zugang-bauen.mjs`

> **Status: NICHT zur Ausführung freigegeben.** Die Befehle gelten erst nach Review und Merge. Claude nennt Ihnen
> dann im Chat den 12-stelligen `<ref>` (Commit mit genau diesem Skriptstand) und den Sollwert. Jede Ausführung auf
> dem VPS braucht Ihre ausdrückliche Freigabe; Sie tippen die Befehle selbst.

**Zweck.** Sie melden sich später vom Android-Handy (Termius) per SSH am Produktions-VPS `srv-prod-01` an, um dort
in einem späteren, eigenen Schritt Claude Code zu starten. Dieses Skript legt dafür **genau ein neues Konto**
`centric-mobil` an:

- eigene Gruppe `centric-mobil`, **keine** weiteren Gruppen (nicht `sudo`, `admin`, `adm`, `docker`, `root`);
- Passwort gesperrt: Anmeldung nur mit Ihrem Schlüssel `CENTRIC-Mobile` (nur der öffentliche Teil steht im Skript);
- `~/.ssh` 0700, `authorized_keys` 0600, Eigentümer `centric-mobil`, Inhalt genau eine Zeile:

  ```text
  no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIZ+jYWmbhkIvEziHlLwU4UpvLWVGlUEfvj+Rvn2XsR2 CENTRIC-Mobile
  ```

**Warum diese Optionen.** Kein Forced Command und kein `no-pty`: Sie wollen eine interaktive Shell. Keine
Weiterleitungen: Port-Weiterleitung würde Dienste erreichbar machen, die nur auf `127.0.0.1` lauschen (zum Beispiel
die App auf Port 3000, an Caddy vorbei); Agent-Weiterleitung gäbe dem Server Zugriff auf Schlüssel im Handy;
X11 wird nicht gebraucht. `restrict` wird bewusst **nicht** gesetzt, weil es auch das Terminal (`pty`) abschaltet.

**Das Skript ändert nie:** bestehende Konten, Gruppen, Schlüssel oder `authorized_keys`; die sshd-Konfiguration;
Dienste (kein Start, Stopp, Neuladen); Pakete (nichts wird installiert, auch kein Claude Code). Es nutzt nach dem
Laden kein Netz, erzeugt und liest keine privaten Schlüssel und gibt keine Dateiinhalte aus (nur Pfadnamen und
Rechte). Ohne Schalter ist es ein **Probelauf** und ändert nichts.

## 1. Voraussetzungen

- IONOS-Remotekonsole von `srv-prod-01`, angemeldet als `root` (Prompt endet auf `#`).
- Ubuntu 24.04 (das Skript prüft das).
- Der VPS erreicht `raw.githubusercontent.com` (HTTPS).
- Von Claude im Chat (unabhängiger Kanal): `<ref>` (12 Zeichen) und der Sollwert (32 Hex-Zeichen). Er muss mit der
  Tabelle in Abschnitt 3 dieses Commits übereinstimmen.
- Auf dem Handy: Termius mit dem Schlüssel `CENTRIC-Mobile` (privater Teil bleibt im Handy, Passphrase oder
  Biometrie empfohlen).

## 2. Schrittfolge (genau so tippen)

| Schritt | Befehl (Abschnitt 3) | Weiter nur wenn |
|---|---|---|
| a | **1** laden | keine Meldung |
| b | optional **K1** (zeigt `1`) und **K2** (Zeilen, Bytes wie Abschnitt 3) | K1 zeigt `1`; K2 passt |
| c | **2** Probelauf | letzte Zeile `PROBELAUF OK: es wuerde centric-mobil angelegt (nichts geaendert)`; keine Zeile `STOPP:` |
| d | Foto des Probelaufs an Claude; Sie entscheiden | Claude hat die Ausgabe geprüft; Sie geben die Einrichtung frei |
| e | **3** Einrichtung (`--ja`) | letzte Zeile `EINGERICHTET: centric-mobil, Fingerabdruck SHA256:6hHuh73hxWXqsmUeD9XlfKnoD46dNOpLxEP2bYApJBQ` |
| f | optional **H** (Host-Schlüssel) | Fingerabdruck notieren (Abschnitt 4) |
| g | **4** `unset s` | – |

Zeigt der Probelauf eine Zeile `WARNUNG:`, endet er mit `… nur mit --ja-trotz-warnung (nichts geaendert)`. Dann
**nicht** Befehl 3 tippen: Befehl 3 bricht in diesem Fall ohne Änderung ab. Foto an Claude; erst nach Ihrer
Entscheidung (Risiko b in Abschnitt 8) Befehl **3W**.

> **Vor `Enter` bei Befehl 2, 3, 3W und R (10 Sekunden):**
> - `&&` sind zwei Zeichen. Ein `&` oder ein `;` statt `&&` startet das Skript **ohne** Prüfung.
> - Erscheint `[1] …` (eine Zahl in Klammern) oder fehlt `&&`: **STOPP.** Befehl 4, Foto an Claude.
> - Sollwert: genau 32 Zeichen tippen. Ein kürzerer Sollwert schwächt das Tor. Zählhilfe in Abschnitt 3: vier Blöcke
>   zu 8 Zeichen, ohne Leerzeichen tippen.
> - Zeichen zählen: die Zeichenzahl jeder Zeile steht in Abschnitt 3 (Befehl 2 hat 88 Zeichen, Befehl 3 hat 95).
> - Befehl 3 endet mit ` x --ja` (Leerzeichen, `x`, Leerzeichen, zwei Bindestriche, `ja`). Ohne ` x` wird `--ja`
>   nicht übergeben; dann läuft nur der Probelauf.
> - Empfohlen: zuerst **K1**. K1 muss `1` zeigen. K1 erkennt einen verkürzten Sollwert nicht; deshalb auch zählen.

Tippen Sie jede Zeile von Hand und prüfen Sie sie vor `Enter`. Auf manchen Tastaturbelegungen kommen `|`, `$`, `"`,
`'`, `^`, `(` oder `)` falsch an. Kein Pager (`more`, `less`): beide haben ein Shell-Escape.

Warum `<ref>` ein Commit ist, warum `printf %s "$s"` und warum das Tor genügt: wie in
[INVENTUR-KONSOLE.md](INVENTUR-KONSOLE.md) §2 und §9 (gleicher Ladeweg).

## 3. Sollwerte und Befehle (Skript in diesem Commit)

Das Werkzeug schreibt diese Tabellen (`node werkzeug/handy-zugang-bauen.mjs --bauen`); die Prüfung stellt sicher,
dass sie zum Skript passen. `<ref>` nennt Claude im Chat, erst nach Review und Merge.

<!-- HANDY-WERTE-ANFANG (werkzeug/handy-zugang-bauen.mjs --bauen) -->

| Wert | Soll |
|---|---|
| 32-Hex im Tor (Befehle 2, 3, 3W, R; Kontrolle K1) | `48a95bce9d7a103066187cb3a68ce0e3` |
| Zählhilfe (ohne Leerzeichen tippen) | `48a95bce 9d7a1030 66187cb3 a68ce0e3` |
| Zeilen: `556` | Kontrolle K2, erste Zahl |
| Bytes: `22607` | Kontrolle K2, zweite Zahl |
| SHA-256 (voll) | `48a95bce9d7a103066187cb3a68ce0e3fe3c72d87948c266c268ce6754475565` |
| Fingerabdruck des Schlüssels | `SHA256:6hHuh73hxWXqsmUeD9XlfKnoD46dNOpLxEP2bYApJBQ` |

Befehle (Zeichenzahl bei 12-stelligem `<ref>`; in der Tabelle steht `\|` nur wegen der Tabellenschreibweise, tippen Sie `|`):

| Nr | Zeichen | Befehl | Wirkung |
|---|---|---|---|
| 1 | 109 | `s=$(curl -fsSL https://raw.githubusercontent.com/rinats-png/dienstplaner/<ref>/deploy/handy-zugang.sh)` | lädt das Skript in die Variable `s` (keine Datei) |
| K1 | 72 | `printf %s "$s" \| sha256sum \| grep -c '^48a95bce9d7a103066187cb3a68ce0e3'` | optional: zeigt `1` (Treffer) oder `0` |
| K2 | 23 | `printf %s "$s" \| wc -lc` | optional: zeigt Zeilen und Bytes |
| 2 | 88 | `printf %s "$s" \| sha256sum \| grep -q '^48a95bce9d7a103066187cb3a68ce0e3' && bash -c "$s"` | Tor + **Probelauf**: prüft und zeigt nur, ändert nichts |
| 3 | 95 | `printf %s "$s" \| sha256sum \| grep -q '^48a95bce9d7a103066187cb3a68ce0e3' && bash -c "$s" x --ja` | Tor + **Einrichtung** (nur nach Probelauf ohne STOPP und ohne WARNUNG) |
| 3W | 109 | `printf %s "$s" \| sha256sum \| grep -q '^48a95bce9d7a103066187cb3a68ce0e3' && bash -c "$s" x --ja-trotz-warnung` | nur nach eigener Entscheidung: Einrichtung trotz WARNUNG |
| H | 48 | `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` | optional, nur lesend: Host-Schlüssel für den ersten Login |
| 4 | 7 | `unset s` | entfernt die Variable |
| R | 101 | `printf %s "$s" \| sha256sum \| grep -q '^48a95bce9d7a103066187cb3a68ce0e3' && bash -c "$s" x --rueckbau` | nur für den Rückbau: entfernt das Konto `centric-mobil` |

<!-- HANDY-WERTE-ENDE -->

## 4. Termius und erster Login

In Termius einen neuen Host anlegen:

| Feld | Wert |
|---|---|
| Hostname/Adresse | dieselbe öffentliche Adresse von `srv-prod-01`, die Sie im IONOS-Cloud-Panel sehen (hier bewusst nicht eingetragen) |
| Port | der Wert der Zeile `INFO: sshd port …` aus dem Probelauf. Hinweis: Ubuntu 24.04 nutzt Socket-Aktivierung; maßgeblich ist der Port, auf dem `ssh.socket` lauscht. Weicht er ab, nicht raten: Foto an Claude |
| Benutzername | `centric-mobil` |
| Schlüssel | `CENTRIC-Mobile` (in Termius unter Keychain) |
| Passwort | leer lassen (das Konto hat kein Passwort) |
| Agent-Weiterleitung, Port-Weiterleitung | aus (der Server erlaubt sie ohnehin nicht) |

**Erster Login: Host-Schlüssel prüfen.** Termius zeigt beim ersten Verbinden einen Fingerabdruck des Servers.
Vergleichen Sie ihn mit der Zeile `INFO: Host-Schluessel ED25519 SHA256:…` aus Befehl 2/3 oder mit Befehl **H**
in der Konsole (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`, nur lesend; zweite Spalte). Nur bei
Gleichheit „Accept“. Zeigt Termius einen anderen Schlüsseltyp (RSA, ECDSA), nicht annehmen: Foto an Claude.

Nach dem Login sehen Sie den Prompt `centric-mobil@srv-prod-01:~$`. Probe (nur lesend): `id` zeigt nur
`groups=…(centric-mobil)`. `sudo -v` muss scheitern.

Die IONOS-Firewall-Richtlinie (Cloud-Panel) muss den SSH-Port zulassen. Ob sie das tut, prüft das Skript nicht.

## 5. Meldungen

Jede Zeile beginnt mit einem festen Wort. Nur druckbare ASCII-Zeichen (Umlaute als ae/oe/ue).

| Anfang | Bedeutung |
|---|---|
| `OK:` | Prüfung bestanden |
| `INFO:` | nur Anzeige (zum Beispiel sshd-Werte, die nicht geändert werden: `passwordauthentication`, `permitrootlogin`, `port`) |
| `PLAN:` | nur im Probelauf: das würde geschehen |
| `WARNUNG:` | Risiko; Einrichtung nur mit `--ja-trotz-warnung` |
| `STOPP:` | Abbruch; Grund in derselben Zeile |
| `PROBELAUF OK: …` | letzte Zeile des Probelaufs, nichts geändert |
| `EINGERICHTET: centric-mobil, Fingerabdruck SHA256:…` | letzte Zeile nach Erfolg |
| `RUECKGEBAUT: …` | letzte Zeile nach Rückbau |

**Fehlertabelle**

| Anzeige | Bedeutung | Handlung |
|---|---|---|
| `curl: (6)` / `(7)` / `(22) … 404` | kein Netz bzw. `<ref>` falsch | Befehl 1 neu tippen; sonst Foto an Claude |
| Befehl 2 zeigt nichts (K1 `0`) | Prüfsumme passt nicht | Befehl neu tippen; bleibt es leer: STOPP, Befehl 4, Foto |
| `[1] <Zahl>` | `&` statt `&&` | STOPP, Befehl 4, Foto an Claude |
| `STOPP: nicht root …` | nicht als root angemeldet | als root anmelden, ab Befehl 1 |
| `STOPP: kein Ubuntu 24.04 …` | anderes System | Foto an Claude |
| `STOPP: Benutzer centric-mobil existiert bereits …` | Konto besteht (auch ein fremdes gleichen Namens) | Foto an Claude; das Skript ändert es nie |
| `STOPP: Gruppe centric-mobil existiert bereits …` / `… /home/centric-mobil existiert bereits …` | Kollision | Foto an Claude |
| `STOPP: eingebetteter Schluessel …` / `STOPP: Fingerabdruck … weicht vom Sollwert ab` | Skript nicht wie erwartet | STOPP, Befehl 4, Foto |
| `STOPP: sshd fehlt …` / `sshd -T … fehlgeschlagen` / `… nicht auswertbar` | sshd-Konfiguration nicht prüfbar (fail-closed) | nichts starten; Foto an Claude |
| `STOPP: sshd: pubkeyauthentication …`, `usepam …`, `permittty …`, `forcecommand …`, `authenticationmethods …`, `authorizedkeyscommand …`, `authorizedkeysfile …` | wirksame sshd-Konfiguration für `centric-mobil` passt nicht | Foto an Claude; die sshd-Konfiguration wird nicht geändert |
| `STOPP: sshd: allowusers/allowgroups … ausgeschlossen`, `denyusers/denygroups …` | Zugangslisten schließen das Konto aus (oder enthalten Muster) | Foto an Claude; Sie entscheiden über eine Änderung der sshd-Konfiguration in einem eigenen Schritt |
| `STOPP: ssh-Dienst nicht aktiv …` | weder `ssh.service` noch `ssh.socket` aktiv | nichts starten; Foto |
| `STOPP: /var/run/docker.sock ist fuer alle …` | Docker für jedes Konto offen | Foto an Claude |
| `STOPP: N Warnung(en); Einrichtung nur mit --ja-trotz-warnung …` | Befehl 3 bei Warnungen | Foto; Entscheidung, dann ggf. 3W |
| `STOPP: Konto centric-mobil angelegt, Nachpruefung gescheitert; KEIN Schluessel hinterlegt. Rueckbau: --rueckbau` (Rückgabe 3) | nach dem Anlegen: weitere Gruppe, sudo-Rechte, Zugriff auf `docker.sock`, Passwort nicht gesperrt, uid-Kollision o. ä. Das Konto ist ohne Schlüssel nicht anmeldbar | Foto; Rückbau (Abschnitt 6) |
| `STOPP: Schluessel nicht korrekt abgelegt und entfernt …` (Rückgabe 3) | Modi/Inhalt/Fingerabdruck nach dem Schreiben falsch | Foto; Rückbau |
| `STOPP: unerwarteter Fehler …` | Skriptfehler; vor der Änderung: nichts geändert, sonst Rückgabe 3 | Foto an Claude |

## 6. Rückbau

Befehl **R** (`… && bash -c "$s" x --rueckbau`) entfernt **nur** das eigene Konto mit `userdel -r centric-mobil`
(Konto, Gruppe, `/home/centric-mobil` mit allem darin, auch später dort abgelegten Dateien). Er verweigert den
Rückbau (`STOPP: … kein Rueckbau. Es wurde nichts geaendert.`), wenn:

- das Konto nicht existiert, eine uid unter 1000 hat oder nicht die Marke dieses Skripts trägt (Kommentarfeld
  `CENTRIC-Handy-Zugang handy-zugang.sh`, Heim `/home/centric-mobil`, Shell `/bin/bash`);
- `authorized_keys` vorhanden ist und nicht genau die Zeile dieses Skripts enthält (fehlt die Datei, etwa nach
  Rückgabe 3, ist der Rückbau erlaubt);
- Prozesse des Kontos laufen (vorher in Termius abmelden).

Der Rückbau ändert sonst nichts. Ein Neuladen von sshd ist nicht nötig (sshd liest `authorized_keys` bei jeder
Anmeldung).

## 7. Grenzen (ehrlich)

- Das Skript läuft als root. Schutz gegen ein falsches Skript ist allein das Tor (32 Hex = 128 Bit, Sollwert aus
  zwei Kanälen); Einzelheiten und die Grenzen `&`/`;` und verkürzter Sollwert wie in
  [INVENTUR-KONSOLE.md](INVENTUR-KONSOLE.md) §9.
- Die sshd-Prüfung nutzt `sshd -T -C user=centric-mobil,host=localhost,addr=127.0.0.1`. Match-Blöcke, die von der
  **Quelladresse** abhängen (`Match Address`, `Match Host`), werden damit nur für `127.0.0.1` ausgewertet. Vom Handy
  kommt eine andere Adresse. Eine solche Regel kann für das Handy andere Werte setzen, die das Skript nicht sieht;
  typische Folge: der Login scheitert trotz `OK`. Die Optionen in `authorized_keys` (keine Weiterleitungen) gelten
  unabhängig davon.
- `AllowUsers`/`AllowGroups`/`DenyUsers`/`DenyGroups` mit Mustern (`*`, `?`, `!`, `user@host`) wertet das Skript
  nicht nach; es bricht dann ab (fail-closed).
- Die Warnung „für alle lesbar“ prüft Dateinamen `.env*`, `*.pem`, `*.key`, `id_*` (ohne `*.pub`) bis Tiefe 5 unter
  `/opt/apps` und `/home` sowie alle Dateien in `…/data` und `…/zustand`, wenn diese Verzeichnisse für andere
  betretbar sind. Verzeichnisrechte darüber werden nicht verrechnet (eher zu viele Warnungen als zu wenige).
  Andere lesbare Dateien (zum Beispiel Protokolle) erkennt sie nicht.
- Der Docker-Test (`runuser -u centric-mobil -- test -r/-w /var/run/docker.sock`) prüft den Standard-Socket.
  Andere Wege (TCP-Socket, rootless Docker) prüft er nicht.
- Das Konto ist ein normales Linux-Konto: es kann lesen, was für alle lesbar ist (zum Beispiel `/etc/passwd`,
  Prozessliste mit Befehlszeilen anderer Konten, sofern `/proc` nicht mit `hidepid` eingehängt ist). Es kann keine
  Container steuern und kein root werden, solange keine Rechteausweitung im System existiert.
- Die Prüfvariablen `HANDY_PRUEFPFAD` und `HANDY_PRUEFWURZEL` dienen nur den Tests; die Remotekonsole setzt sie
  nicht.

## 8. Risiken (zur Entscheidung durch den Betreiber)

**(a) Neue Angriffsfläche.** Ein neues anmeldbares Konto auf dem Produktionsserver erweitert die Angriffsfläche.
Wer den privaten Schlüssel aus dem Handy erlangt (Diebstahl, Schadsoftware, Backup), kann sich als `centric-mobil`
anmelden. Gegenmaßnahmen: Termius-Schlüssel mit Passphrase oder Biometrie, Bildschirmsperre, kein Export des
Schlüssels; bei Verlust des Handys sofort Rückbau (Abschnitt 6) über die Remotekonsole.

**(b) Keine Geheimnisse lesbar.** Das Konto hat keine Gruppe `docker` und kein `sudo`; es kann aber alles lesen,
was „für alle lesbar“ ist. Das Skript warnt bei solchen Dateien (nur Pfadnamen). Zusätzlich empfohlen, nur lesend
in der Konsole vor Befehl 3:

```text
stat -c '%A %U:%G %n' /opt/apps/centric-dienstplanung /opt/apps/centric-dienstplanung/.env /opt/apps/centric-dienstplanung/data
```

Erwartung: `.env` ohne `r` an der vorletzten Stelle der Rechte (also `-rw-------` oder `-rw-r-----`), `data` ohne
`r-x` für andere. Das Skript zeigt dieselben Werte als `INFO:`-Zeilen.

**(c) Claude Code ist nicht Teil dieses Auftrags.** Die Installation von Claude Code auf dem VPS ist ein späterer,
eigener Schritt mit eigener Freigabe. Es liefe dann unter `centric-mobil` ohne `sudo` und ohne Docker, also ohne
Zugriff auf Container, `.env` und Betriebsdaten (sofern Risiko b geklärt ist). Die Anmeldung von Claude Code
(Remote Control) braucht einen Browser oder das Handy; ohne Port-Weiterleitung geht das nur über einen Weg mit
angezeigtem Code oder Link, nicht über einen Rückruf an `localhost`.

**(d) Öffentlicher Schlüssel im öffentlichen Repository.** Ein öffentlicher Schlüssel ist kein Geheimnis und
erlaubt keine Anmeldung. Er verknüpft aber die Bezeichnung `CENTRIC-Mobile` und den Fingerabdruck dauerhaft mit
diesem Projekt (öffentlich sichtbar, auch nach einem Rückbau im Verlauf). Eine Abfrage zur Laufzeit ist keine
Alternative, weil die Remotekonsole kein zuverlässiges Kopieren und Einfügen erlaubt (68 Zeichen Base64 abtippen).
Sie entscheiden, ob Sie das akzeptieren. Die Geheimnis-Scans melden den Schlüssel nicht als Geheimnis
(lokaler Lauf von `npm run sicherheit:geheimnisse`, siehe PR-Text).

## 9. Werkzeug (für Claude)

| Aufruf | Zweck |
|---|---|
| `node werkzeug/handy-zugang-bauen.mjs --hash` | Sollwerte (32 Hex, SHA-256, Zeilen, Bytes) nach `printf %s`-Semantik |
| `… --befehle <ref>` | genaue Betreibereingaben mit Zeichenzahl |
| `… --pruefen` | Schlüssel und Fingerabdruck (in Node berechnet), Optionen, ASCII, Doku-Sollwerte |
| `… --bauen` | Tabelle in Abschnitt 3 neu schreiben |
