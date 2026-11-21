# VPS-Zugang für die lesende Produktionsinventur (REL-0)

Stand: 2026-11-20 · Paket: REL-0 „VPS-Zugang und Inventur“ · Status: REVIEW, Betreiberhandlung offen

**Ziel.** Ein kontrollierter, dauerhaft nutzbarer SSH-Zugang zum Produktions-VPS `<server-name>`. Der Zugang führt
**nur** das geprüfte Lese-Skript [`deploy/inventur.sh`](../../deploy/inventur.sh) aus. Er gibt keine Shell, keine
Weiterleitung, keinen Datei-Upload und keine anderen Befehle. Das Skript führt V-1 bis V-9 aus
[PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) aus. Die Befehle der
Prüfpunkte stehen dort. Dieses Dokument wiederholt sie nicht.

**Anlass.** Ein Versuch mit dem lokalen Betreiberschlüssel als Konto `admin` endete mit
`Permission denied (publickey)`. Der lokale Betreiberschlüssel (Fingerabdruck in der Notiz des Betreibers) ist nicht der
GitHub-Deploy-Key. Den VPS bedient der Betreiber über die IONOS-Remotekonsole.

**Zwei Phasen.**

| Phase | Was | Wann |
|---|---|---|
| 1 (jetzt) | Forced Command beim Konto `<konto>` (Variante A), Skript `/usr/local/sbin/centric-inventur.sh`. Weg für die erste manuelle Inventur. | Abschnitte 0 bis 6 |
| 2 (langfristig, bevorzugt) | eigenes Konto `inventur` **ohne** Docker-Rechte; root-Sammler legt die maskierte Inventur ab; das Konto liest nur diese Datei | Abschnitt 8 |

**Wer handelt.** Nur der Betreiber. Dieses Dokument beschreibt die Schritte. Es ändert selbst nichts auf dem VPS.

**Schreibweise.** `<vps-adresse>` ist die öffentliche Adresse aus dem DNS-Eintrag der Produktionsdomain. Sie wurde am
2026-11-20 mit den Host-Schlüsseln abgeglichen (Schritt 1e). Die Adresse steht absichtlich nicht in diesem
öffentlichen Repository. `<konto>` ist das Konto aus Schritt 1a (erwartet: `admin`). `<port>` kommt aus Schritt 1b.

## Betreiberentscheidungen (2026-11-20)

| Nr | Entscheidung |
|---|---|
| E-1 | **Variante A** (Forced Command). Keine sudo-Regel. Die frühere Variante B (eigenes Konto mit sudo-Regel für das Skript) ist **nicht gewählt** und hier nicht mehr beschrieben. |
| E-2 | Inventur-Schlüssel **mit Passphrase** für den manuellen Zugriff. Für spätere unbeaufsichtigte Nutzung: eigener zweiter Schlüssel, nur beschrieben (Abschnitt 8.6). |
| E-3 | Vorerst **keine** `from=`-Beschränkung. Nachrüsten, sobald eine feste Betreiber-Adresse nachgewiesen ist (Abschnitt 6e). |
| E-4 | Skript `root:root 0755`. Ablage root-eigen **außerhalb** des Betriebsverzeichnisses: `/usr/local/sbin/centric-inventur.sh` (Abschnitt 7.4). |
| E-5 | Rohinventur **nicht** ins öffentliche Repository. Nur eine maskierte Zusammenfassung ohne Adressen und ohne Pfadlisten (Abschnitt 5). |

## Regeln für alle Schritte

1. Führen Sie nur die Befehle in diesem Dokument aus.
2. Vergleichen Sie jede Ausgabe mit „Erwartet“.
3. Gehen Sie nur weiter, wenn „Weiter nur wenn“ erfüllt ist. Sonst: STOPP. Ändern Sie nichts. Melden Sie die Ausgabe.
4. Kopieren Sie nie einen privaten Schlüssel. Kopieren Sie nur Dateien mit der Endung `.pub`.
5. Geben Sie nie `cat .env` ein. Geben Sie nie Werte aus der `.env` weiter.
6. Jeder Schritt hat einen Rückweg. Der Rückweg stellt den Zustand vor dem Schritt wieder her.

---

## 0. Vorbereitung am Arbeitsrechner

Arbeitsrechner: Windows mit Git Bash. `~` ist Ihr Benutzerverzeichnis.

### 0a. Pfad prüfen (kein bestehender Schlüssel wird überschrieben)

```bash
for f in ~/.ssh/inventur_centric_ed25519 ~/.ssh/inventur_centric_ed25519.pub; do
  if [ -e "$f" ]; then echo "STOPP: $f existiert"; else echo "frei: $f"; fi
done
```

- **Erwartet:** zwei Zeilen `frei: …`.
- **Weiter nur wenn:** keine Zeile `STOPP`. Bei `STOPP`: Wählen Sie einen anderen Namen (zum Beispiel
  `inventur_centric_2_ed25519`) und verwenden Sie ihn in allen folgenden Schritten. Löschen Sie die vorhandene Datei
  nicht.
- **Rückweg:** keiner nötig (nur lesen).

### 0b. Neuen, eigenen Inventur-Schlüssel mit Passphrase erzeugen (E-2)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/inventur_centric_ed25519 -C inventur-centric
```

- **Passphrase:** Pflicht. Geben Sie eine Passphrase ein (mindestens 5 zufällige Wörter oder Passwortmanager).
- **Erwartet:** `Your identification has been saved in …/inventur_centric_ed25519` und
  `Your public key has been saved in …/inventur_centric_ed25519.pub`.
- **Weiter nur wenn:** beide Dateien sind da und `ssh-keygen` hat **nicht** gefragt `Overwrite (y/n)?`. Fragt es
  das, antworten Sie `n` und gehen Sie zurück zu 0a.
- **Rückweg:** `rm ~/.ssh/inventur_centric_ed25519 ~/.ssh/inventur_centric_ed25519.pub` (nur diese zwei Dateien).

### 0c. Fingerabdruck notieren

```bash
ssh-keygen -lf ~/.ssh/inventur_centric_ed25519.pub
```

- **Erwartet:** `256 SHA256:<43 Zeichen> inventur-centric (ED25519)`.
- **Weiter nur wenn:** Typ `ED25519` und Kommentar `inventur-centric`. Notieren Sie den Fingerabdruck als **F-INV**.
- **Rückweg:** keiner nötig.

### 0d. Nur den öffentlichen Teil anzeigen

```bash
cat ~/.ssh/inventur_centric_ed25519.pub
```

- **Erwartet:** genau eine Zeile `ssh-ed25519 AAAA… inventur-centric`.
- **Weiter nur wenn:** die Zeile beginnt mit `ssh-ed25519 AAAA` und die Datei endet auf `.pub`. Diese Zeile heißt
  im Folgenden **PUB-INV**. Sie ist nicht geheim.
- **Rückweg:** keiner nötig.

---

## 1. Bestandsaufnahme in der IONOS-Remotekonsole (nur lesen)

Melden Sie sich in der Remotekonsole an. Die Befehle brauchen Root-Rechte (Root-Shell oder `sudo` davor). In diesem
Abschnitt ändert kein Befehl etwas.

**Hinweis zur Remotekonsole:** Die Konsole überträgt eingefügten Text als Tastendrücke. Bei abweichender
Tastaturbelegung kommen Zeichen wie `|`, `{`, `}`, `>`, `~` falsch an. Prüfen Sie jede Zeile vor `Enter`.

### 1a. Konten, Gruppen, Besitz

```bash
getent passwd | awk -F: '$7 !~ /(nologin|false)$/'
getent group docker sudo wheel
id admin
stat -c '%n %U:%G %u:%g %a' /opt/apps/centric-dienstplanung /opt/apps/centric-dienstplanung/data
```

- **Erwartet:** Konten mit Login-Shell (mindestens `root`, `admin`). `docker:x:…:admin`. `admin` mit `uid=1000`.
  Beide Verzeichnisse gehören `admin:admin 1000:1000`.
- **Weiter nur wenn:** beide Verzeichnisse gehören **demselben** Konto. Dieses Konto heißt **`<konto>`**. Gehören sie
  verschiedenen Konten oder `root`: STOPP und melden (Variante A setzt ein solches Konto voraus).
- **Notieren:** Konten mit Login-Shell, Mitglieder von `docker` und `sudo`/`wheel`, `<konto>`, seine uid und seine
  Login-Shell (letztes Feld der Zeile in `getent passwd`).
- **Rückweg:** keiner nötig.

### 1b. Wirksame sshd-Konfiguration und Version

```bash
sshd -T | grep -iE '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|allowgroups|authorizedkeysfile|authenticationmethods|permituserenvironment|acceptenv|allowtcpforwarding|allowagentforwarding|x11forwarding|permittty|permittunnel|subsystem|strictmodes)'
dpkg -l openssh-server | tail -n 1
ssh -V
```

- **Erwartet:** `pubkeyauthentication yes`, `permituserenvironment no`, `strictmodes yes`,
  `authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2`, `authenticationmethods any`, `acceptenv LANG` und
  `acceptenv LC_*` (Debian/Ubuntu-Vorgabe), `subsystem sftp …`. Gut: `passwordauthentication no`,
  `permitrootlogin no` oder `prohibit-password`. Version von `openssh-server` mindestens 7.2 (Ubuntu 22.04: 8.9p1,
  Ubuntu 24.04: 9.6p1, Debian 12: 9.2p1).
- **Weiter nur wenn:**
  - `pubkeyauthentication yes`;
  - `permituserenvironment no` (sonst könnte eine Datei `~/.ssh/environment` Variablen setzen);
  - `acceptenv` nennt **nur** `LANG` und `LC_*` oder fehlt — kein `*`, kein `BASH_ENV`, kein `ENV`, kein `PATH`,
    kein `INVENTUR_*`, kein `CENTRIC_*`, kein `SSH_*` (Abschnitte 7.3 und 7.4 stützen sich darauf);
  - `allowusers`/`allowgroups` fehlen **oder** schließen `<konto>` ein;
  - Version ≥ 7.2 (`restrict` gibt es ab 7.2).

  Sonst: STOPP. Eine Änderung der sshd-Konfiguration ist eine eigene Entscheidung und gehört nicht zu Phase 1.
- **Notieren:** `port` (= `<port>`) und alle Zeilen.
- **Rückweg:** keiner nötig.

### 1c. Autorisierte Schlüssel je Konto (ohne Inhalte)

```bash
for h in /root /home/*; do f=$h/.ssh/authorized_keys; [ -f $f ] && { echo == $f; stat -c '%U:%G %a' $f; ssh-keygen -lf $f; grep -oE '^(command="[^"]*"[^ ]*)' $f | sed 's/^/Optionen: /'; }; done
```

- **Erwartet:** je Datei `== <pfad>`, Besitzer und Rechte (zum Beispiel `admin:admin 600`), je Schlüssel eine Zeile
  `<bits> SHA256:… <kommentar> (<TYP>)`, dazu Zeilen `Optionen: command="…"` für Forced Commands. Es erscheint
  **kein** Schlüsselkörper (`AAAA…`).
- **Weiter nur wenn:** die Datei von `<konto>` existiert oder fehlt nachweislich (dann siehe 3d, Fall „Datei fehlt“).
  Erscheint ein Schlüsselkörper: STOPP, Ausgabe nicht weitergeben.
- **Notieren:** je Konto die Fingerabdrücke, Kommentare und Optionen.
- **Rückweg:** keiner nötig.

### 1d. Abgleich mit dem lokalen Betreiberschlüssel

Am **Arbeitsrechner**:

```bash
ssh-keygen -lf ~/.ssh/id_ed25519.pub
```

- **Erwartet:** `256 SHA256:… <kommentar> (ED25519)`, gleich dem Fingerabdruck in Ihrer Notiz.
- **Prüfung:** Suchen Sie diesen Fingerabdruck in der Liste aus 1c.
  - Gefunden bei `<konto>`: Der Schlüssel ist autorisiert. Dann liegt die Ablehnung woanders (1b: `allowusers`,
    Rechte von `~/.ssh` nach 3d). Notieren Sie das.
  - Gefunden bei einem anderen Konto: Notieren Sie das Konto.
  - Nicht gefunden: Das erklärt `Permission denied (publickey)`.
- **Weiter nur wenn:** das Ergebnis ist notiert. Ändern Sie in keinem Fall etwas am Betreiberschlüssel. Der neue
  Inventur-Schlüssel ersetzt ihn nicht und erweitert seine Rechte nicht.
- **Rückweg:** keiner nötig.

### 1e. Host-Schlüssel des Servers

```bash
for k in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf $k; done
```

- **Erwartet:** genau diese drei Fingerabdrücke (Abgleich DNS/Host-Key vom 2026-11-20):

  | Typ | Fingerabdruck |
  |---|---|
  | ED25519 | `SHA256:eLwAqtKJ9LZLW334tonIA61Fcl26EvKiOyVIHWClW44` |
  | RSA | `SHA256:2BD4LsLn0EdUTOIukv2S7K7my8X+bKX8PE97B9Bq7bI` |
  | ECDSA | `SHA256:kh8XB71rytJ8iYVljCzyIdF8g3esG4XJWsUnw0fycHg` |

- **Weiter nur wenn:** alle drei stimmen Zeichen für Zeichen. Weicht einer ab: STOPP. Verbinden Sie sich nicht.
  Möglich sind ein falscher Server oder eine Neuinstallation.
- **Rückweg:** keiner nötig.

---

## 2. Konzept: getrennte Rechte

### 2.1 Zwei Rollen, zwei Schlüssel

| Rolle | Darf | Schlüssel | Eintrag | Stufe |
|---|---|---|---|---|
| INVENTUR | nur `centric-inventur.sh` ausführen (lesen) | `inventur_centric_ed25519` (neu, Passphrase) | Abschnitt 2.3 | jetzt (REL-0) |
| DEPLOYMENT | nur `deploy.sh --ssh` (Freigabeliste, Digest) | `deploy_ed25519` (eigener Schlüssel) | `command="…/deploy.sh --ssh",restrict` | später (REL-Stufe), [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md) |

Die Rollen teilen keinen Schlüssel. Wer den Inventur-Schlüssel hat, kann nicht ausliefern. Der Deployment-Zugang ist
nicht Teil dieses Dokuments.

### 2.2 Warum Mitgliedschaft in der Gruppe `docker` root-gleich ist

Mitglieder der Gruppe `docker` steuern den Docker-Daemon. Der Daemon läuft als root. Ein Mitglied kann deshalb einen
Container mit dem Dateisystem des Hosts starten (zum Beispiel `docker run -v /:/host …`) und dort jede Datei lesen und
schreiben. Die Gruppe `docker` ist also gleichwertig mit root. Eine Lese-Rolle bekommt diese Gruppe nie direkt.

In Phase 1 läuft das Skript als `<konto>`, und `<konto>` ist in der Gruppe `docker`. Die Grenze ist deshalb **allein**
der Forced Command mit dem geprüften Skript (Abschnitt 7.5). Phase 2 (Abschnitt 8) beseitigt das: Das Zugangskonto
hat dort keine Docker-Rechte.

### 2.3 Phase 1: Forced Command beim Konto `<konto>` (Variante A, gewählt)

Sie hängen eine **zusätzliche** Zeile an `~<konto>/.ssh/authorized_keys` an:

```
command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… inventur-centric
```

- `command=…` erzwingt das Skript, auch für Subsystem-Anfragen (sftp). Ein anderer Befehl des Clients wird
  abgewiesen (Rückgabe 2).
- `restrict` schaltet Port-, Agent- und X11-Weiterleitung, PTY und `~/.ssh/rc` ab. Die einzelnen `no-…`-Optionen
  wiederholen das ausdrücklich (Abschnitt 7.3).
- Es entsteht kein neues Konto, keine sudo-Regel, keine neue Gruppe. Bestehende Zeilen bleiben unverändert.
- Muster wie [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md).

---

## Einrichtung mit einem Befehl (REL-0-Installer)

> **Stand: vorbereitet, nicht aktiviert.** Der Installer bricht ohne eingetragenen öffentlichen Schlüssel immer ab
> (fail-closed). **Vorrang hat die Konsolen-Inventur** nach [INVENTUR-KONSOLE.md](INVENTUR-KONSOLE.md) (#449, bereits
> gemergt). Dieser Weg setzt Abschnitt 0 voraus (Schlüssel an einem Arbeitsrechner erzeugen); der Betreiber hat derzeit
> keinen Arbeitsrechner. Entscheidungen des Koordinators: BE-1 Konsolenweg hat Vorrang; BE-2 12-stelliger
> Commit-Präfix bewusst akzeptiert; BE-3 #447 wird als Vorrat gemergt (vorbereitet, nicht aktiviert). Eine Ausführung
> auf dem VPS braucht: Schlüssel-Commit, neues Delta-Review, CI auf dem exakten Kopf, Sollwert über einen zweiten
> Kanal, `--trocken` zuerst.

Dieser Weg **ersetzt die Schritte 3a bis 3e**. Der Weg von Hand in Abschnitt 3 bleibt als Alternative. Abschnitt 0
(Schlüssel am Arbeitsrechner), Abschnitt 1 (Bestandsaufnahme), Abschnitt 4 (Nachprüfung, Negativproben N-1 bis N-11)
und Abschnitt 6 (Widerruf) gelten unverändert.

**Was der Installer tut.** [`deploy/inventur-install.sh`](../../deploy/inventur-install.sh) prüft zuerst alles
(Liste unten). Bei jeder Abweichung bricht er ab und ändert nichts. Nur wenn alle Prüfungen bestehen:

1. Sicherung von `authorized_keys` nach `/root/centric-inventur-backup-<zeit>/` (root, `0700`, Dateien `0600`), mit
   Manifest für den Rückbau.
2. Das eingebettete `inventur.sh` (Prüfsumme geprüft) atomar nach `/usr/local/sbin/centric-inventur.sh`
   (`root:root 0755`, E-4).
3. **Genau eine** Zeile an `authorized_keys` des Kontos anhängen, wörtlich wie 3e (E-1, E-3: ohne `from=`). Jeder
   schreibende Zugriff auf `authorized_keys` (anlegen, anhängen, kürzen, Rechte, löschen) läuft mit den Rechten des
   Kontos (`setpriv --reuid`), nie als root. Tauscht jemand die Datei gegen einen symbolischen Link, schreibt der
   Installer damit höchstens mit den Rechten des Kontos (kein root-Schreiben über einen Link).
4. Selbstprüfung: Skript (Besitz, Modus, Prüfsumme), Zeile genau einmal, Altzeilen unverändert (SHA-256 vorher =
   nachher), Rechte von `authorized_keys` unverändert, `sshd -t`, Probelauf `centric-inventur.sh --hilfe` und
   Abweisung eines fremden SSH-Befehls (Rückgabe 2). Scheitert sie, nimmt der Installer 2. und 3. zurück und prüft
   jeden Rücknahmeschritt nach.

Der Installer ändert **nie** bestehende Zeilen, die sshd-Konfiguration, Dienste (kein Neustart, kein `reload`),
Konten, Gruppen, sudoers oder Docker-Rechte. Er liest keine `.env`, nutzt kein Netz und gibt keinen Schlüsselkörper aus.

**Vorabprüfungen** (alle vor jeder Änderung, Befunde gesammelt):

| Prüfung | Bestanden, wenn |
|---|---|
| Nutzdaten | eingebettetes `inventur.sh` hat die Soll-Prüfsumme; öffentlicher Schlüssel ist eingetragen, `ssh-ed25519`, Kommentar `inventur-centric`, Prüfsumme und Fingerabdruck stimmen |
| Rechte, Werkzeuge | läuft als root; `setpriv` (util-linux) vorhanden |
| System | `/etc/os-release`: Ubuntu 24.04. Abbruch bei jeder anderen Version: Die Bestandsaufnahme (1a–1e) und der Sicherheitsnachweis (7.3, OpenSSH 9.6p1) gelten dann nicht mehr |
| OpenSSH | `openssh-server` ≥ 7.2 (`restrict`) |
| Konto | `/opt/apps/centric-dienstplanung` und `data/` gehören demselben Konto, und das ist `admin` (uid 1000); Konto in `getent passwd`; Login-Shell nicht `nologin`/`false`; Heimatverzeichnis vorhanden, nicht für andere beschreibbar |
| sshd-Dateien | `/etc/ssh/sshd_config`, alle `/etc/ssh/sshd_config.d/*.conf` und alle `Include`-Ziele (auch außerhalb von `sshd_config.d`, relativ zu `/etc/ssh`) sind lesbar und enthalten **keine** Zeile `Match` (Groß/Klein, führende Leerzeichen). Grund: `sshd -T` ohne Verbindungsdaten wertet `Match`-Blöcke nicht aus; ein Block wie `Match User admin` mit `AcceptEnv *` bliebe sonst unsichtbar. Die Dateien werden nur gelesen |
| sshd | `sshd -T` **und** `sshd -T -C user=admin,host=localhost,addr=127.0.0.1` **und** `… addr=192.0.2.1`: je `pubkeyauthentication yes`, `permituserenvironment no`, `strictmodes yes`; `acceptenv` nur `LANG`, `LC_*` und (E-a) `COLORTERM`, `NO_COLOR`; `allowusers`/`allowgroups` fehlen oder schließen das Konto ein; `denyusers`/`denygroups` nennen es nicht; `authorizedkeysfile` gleich in allen drei Ausgaben und im Heimatverzeichnis; `sshd -t` gültig |
| Schlüsseldatei | `~/.ssh` gehört dem Konto, `700`; `authorized_keys` gehört dem Konto, Rechte `600`, `640` oder `644` (E-b; fehlt sie, wird sie mit `600` angelegt); kein Link; kein anderer Eintrag mit diesem Schlüssel, Kommentar oder Skriptpfad |
| Ziel | `/`, `/usr`, `/usr/local`, `/usr/local/sbin` root-eigen, nicht für andere beschreibbar; `/usr/local/sbin/centric-inventur.sh` fehlt oder ist identisch (`root 0755`) |
| Platz | mindestens 1 MiB frei unter `/root`, `/usr/local/sbin` und `~/.ssh` |

Sind die Zeile und das Skript schon genau so vorhanden, meldet der Installer „bereits eingerichtet“, prüft nur und
ändert nichts (Rückgabe 0).

**Entscheidungen zum Installer** (2026-11-21, vom Koordinator getroffen und begründet; jederzeit änderbar):

| Nr | Entscheidung | Grund |
|---|---|---|
| E-a | `acceptenv` darf zusätzlich genau `COLORTERM` und `NO_COLOR` enthalten | feste Namen der neueren Debian-Vorgabe; weder bash noch `inventur.sh` werten sie ausführbar aus; vermeidet einen Fehlalarm |
| E-b | `authorized_keys` mit `600`, `640` oder `644` ist zulässig, wenn sie dem Konto gehört | nicht für Gruppe/andere beschreibbar, von `StrictModes` akzeptiert; der Installer ändert keine Rechte; alles andere führt zum Abbruch |

### Voraussetzungen

- Abschnitt 0 erledigt; der öffentliche Schlüssel (PUB-INV, Zeile aus 0d) ist als `deploy/inventur-schluessel.pub`
  im Repository eingetragen (eigener kleiner Commit; der Installer wird mit
  `node werkzeug/inventur-install-bauen.mjs` neu erzeugt). **Ohne diese Datei bricht der Installer immer ab**
  („öffentlicher Inventur-Schlüssel fehlt …“).
- Abschnitt 1 erledigt, insbesondere 1e (Host-Schlüssel).
- Der Sollwert (Commit und Prüfsumme des Installers) liegt aus einem **zweiten Kanal** vor (PR-Freigabe oder Chat,
  wie Abschnitt 3). Claude erzeugt die Eingaben mit `node werkzeug/inventur-install-bauen.mjs --befehl <commit>`.

### Eingaben (Remotekonsole, als root, je eine Zeile)

**Eingabe 1 — Pflicht, zuerst: laden, prüfen, nur Vorabprüfungen** (ändert nichts; 255 Zeichen):

```bash
cd /root && rm -f rel0 && curl -fsSLo rel0 https://github.com/rinats-png/dienstplaner/raw/<commit>/deploy/inventur-install.sh && [[ $(sha256sum rel0) == "<installer-sha256>  rel0" ]] && bash rel0 --trocken
```

**Weiter nur wenn** die letzte Zeile `REL-0 TROCKEN OK: alle Vorabprüfungen bestanden. Es wurde nichts geändert.` ist.

**Eingabe 2 — einrichten** (dieselbe Datei, Prüfsumme erneut verglichen; 124 Zeichen):

```bash
cd /root && [[ $(sha256sum rel0) == "<installer-sha256>  rel0" ]] && bash rel0
```

- `<commit>`: die ersten 12 Zeichen des freigegebenen Commits. `<installer-sha256>`: 64 Zeichen. Zwischen Prüfsumme
  und `rel0` stehen **zwei** Leerzeichen.
- Warum so: Der Download kommt aus einem festen Commit. Ausgeführt wird nur, wenn die Prüfsumme Zeichen für Zeichen
  stimmt. Die Prüfsumme deckt alles ab: Der Installer enthält `inventur.sh` und den öffentlichen Schlüssel samt
  deren Prüfsummen und prüft sie vor der Installation. Der Installer selbst nutzt kein Netz.
- `rm -f rel0` am Anfang: Eine alte Datei aus einem früheren Versuch kann so nie ungeprüft weiterverwendet werden.
- Die Zeilen haben keine Pipe, keine Umlenkung und kein Semikolon. Die meisten Tippfehler (in Adresse, Prüfsumme,
  `[[`, `$(`, `"`) führen zu einem Fehler. **Grenze:** Wird aus `&&` ein einzelnes `&`, läuft der Teil davor im
  Hintergrund und `bash rel0 …` startet sofort, also **ohne** abgeschlossenen Prüfsummenvergleich. Eine Option wie
  `--trocken` schützt dann nicht: Eine ungeprüfte Datei könnte jede Option ignorieren. Es schützen nur zwei Dinge:
  `rm -f rel0` am Anfang (beim sofortigen Start fehlt die Datei meist noch, `bash` bricht ab) und die feste
  Commit-Quelle (eine fertig geladene Datei stammt aus genau diesem Commit). Prüfen Sie vor `Enter`
  jedes `&&`.
- Hex-Zeichen (`0-9`, `a-f`) sind auf deutscher und US-Tastaturbelegung gleich.
- **Kurz-SHA (12 Zeichen) statt 40:** weniger Tippaufwand. Risiko: Ein Branch oder Tag mit genau diesem Namen könnte
  die Adresse überdecken; anlegen können ihn nur Personen mit Schreibrecht auf das Repository. Die SHA-256-Prüfung
  fängt jede abweichende Datei ab (dann keine Ausführung).

**Soll-Prüfsumme des Installers im aktuellen Stand** (die Prüfung `pruefungen/inventur-install.test.js` stellt sicher,
dass sie zur Datei passt; sie ändert sich mit dem Schlüssel-Commit):

- **SHA-256 von deploy/inventur-install.sh: `11fcd584bfe603c754e07b017c1a622c5e517a2f186922e5f4d16587b8084410`**
  (noch ohne Schlüssel — dieser Stand bricht fail-closed ab)

### Erwartete Ausgabe

Erste Zeile `REL-0 Installer v1, Modus einrichten (inventur.sh sha256 d99207298c12…)`, danach je Prüfung eine Zeile
`ok …`, am Ende **genau eine** Ergebniszeile:

```
REL-0 OK: Inventurzugang eingerichtet. Fingerabdruck F-INV: SHA256:<43 Zeichen> Skript sha256: d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21
```

- **Weiter nur wenn:** die letzte Zeile beginnt mit `REL-0 OK:`, F-INV ist gleich dem Wert aus 0c, die Skript-
  Prüfsumme ist gleich dem Sollwert aus Abschnitt 3. Dann weiter mit Abschnitt 4 (Nachprüfung vom Arbeitsrechner).
- `/root/rel0` darf liegen bleiben. Für den Rückbau wird die Datei ohnehin neu geladen und geprüft.

### Abbruch- und Fehlermeldungen

Jeder Abbruch endet mit `REL-0 ABBRUCH: <Grund>. Es wurde nichts geändert.` (Rückgabe 1). Weitere Befunde stehen
darüber als Zeilen `FEHLER …`. Ändern Sie in keinem Fall selbst etwas am System. Melden Sie die Ausgabe.

| Grund (Anfang) | Bedeutung | Was tun |
|---|---|---|
| `öffentlicher Inventur-Schlüssel fehlt` | Schlüssel-Commit fehlt | PUB-INV (0d) an Claude geben; neuer Commit, neue Eingabe |
| `eingebettetes inventur.sh weicht …`, `eingebetteter Schlüssel weicht …`, `Fingerabdruck … weicht ab` | Installer beschädigt | STOPP; nicht erneut versuchen; melden |
| `Der Installer muss als root laufen` | kein root | `sudo -i`, dann Eingabe wiederholen |
| `setpriv fehlt` | util-linux unvollständig | STOPP; melden |
| `Betriebssystem ist nicht Ubuntu 24.04` | Server verändert | STOPP; Bestandsaufnahme 1a–1e neu |
| `OpenSSH … älter als 7.2` | `restrict` fehlt | STOPP; melden |
| `… gehören verschiedenen Konten`, `… gehört root`, `… erwartet admin` | Besitz anders als 1a | STOPP; 1a erneut, melden |
| `… keine Login-Shell`, `Konto … fehlt`, `Heimatverzeichnis …` | Konto nicht nutzbar | STOPP; melden (Entscheidung nötig) |
| `sshd-Konfiguration enthält Match-Blöcke`, `/etc/ssh/sshd_config fehlt …`, `… nicht lesbar` | Prüfung ohne Verbindungsdaten wäre unvollständig | STOPP; nur lesend `grep -inE '^[[:space:]]*match' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf` ausführen und melden; Entscheidung nötig |
| `sshd -T fehlgeschlagen: /run/sshd fehlt (Socket-Aktivierung …)` | Ubuntu 24.04 mit `ssh.socket`: `ssh.service` läuft nur bei Verbindungen, `/run/sshd` fehlt, `sshd -T`/`-t` scheitern | **Nichts starten, nichts anlegen.** Nur lesend prüfen: `ls -ld /run/sshd`, `systemctl is-active ssh.socket ssh.service`; Ausgabe melden. Entscheidung nötig |
| `sshd: …` (pubkeyauthentication, permituserenvironment, strictmodes, acceptenv, allowusers, allowgroups, denyusers, denygroups; je mit Kontext), `authorizedkeysfile …`, `sshd -T … fehlgeschlagen`, `sshd -t …` | sshd-Konfiguration passt nicht | STOPP. Eine sshd-Änderung ist eine eigene Entscheidung (1b) |
| `… erwartet Besitzer admin und 700`, `… erwartet Besitzer admin und 600, 640 oder 644` | Rechte von `~/.ssh` oder `authorized_keys` | melden; Korrektur nur nach Entscheidung |
| `… fehlt (wird nicht angelegt)` | `~/.ssh` fehlt | melden; Fall „Datei fehlt“ in 3d nach Entscheidung |
| `… abweichenden oder doppelten Eintrag …` | ein alter Inventur-Eintrag ist da | Abschnitt 6a (Widerruf), dann erneut |
| `… existiert und weicht vom eingebetteten inventur.sh ab`, `… nicht root 0755` | altes Skript | melden; nach Entscheidung 6b, dann erneut |
| `Inventur-Zeile vorhanden, aber … fehlt (teilweise eingerichtet)` | halbe Einrichtung | Abschnitt 6a, dann erneut |
| `zu wenig freier Speicher` | Platte voll | melden |
| `Sicherungsverzeichnis … konnte nicht angelegt werden` | gleicher Zeitstempel | eine Sekunde warten, erneut |

Fehler **nach** Beginn der Änderungen (selten):

- `REL-0 FEHLER: Einrichtung gescheitert, Änderungen zurückgenommen. Sicherung: …` (Rückgabe 3): Jeder
  Rücknahmeschritt wurde nachgeprüft; Zustand wie vorher. Melden.
- `REL-0 FEHLER: … Rücknahme unvollständig …` oder `REL-0 FEHLER: Rückbau unterbrochen …` (Rückgabe 4): STOPP.
  Sicherung im genannten Verzeichnis. Abschnitt 6a von Hand, melden.

### Rückweg

Die Datei wird dafür **neu geladen und mit derselben Prüfsumme geprüft** (nicht die vielleicht veraltete oder
gelöschte `/root/rel0` verwenden; 256 Zeichen):

```bash
cd /root && rm -f rel0 && curl -fsSLo rel0 https://github.com/rinats-png/dienstplaner/raw/<commit>/deploy/inventur-install.sh && [[ $(sha256sum rel0) == "<installer-sha256>  rel0" ]] && bash rel0 --rueckbau
```

- Entfernt genau die eine Zeile und das Skript, aber nur wenn `authorized_keys` byte-gleich „Sicherung + diese eine
  Zeile“ ist (SHA-256) und noch dem Konto gehört. Kürzen und Löschen laufen mit den Rechten des Kontos. Danach ist
  `authorized_keys` byte-gleich mit der Sicherung (nachgeprüft).
- **Erwartet:** letzte Zeile `REL-0 RUECKBAU OK: …`. Die Sicherung bleibt liegen.
- Hat sich `authorized_keys` seit der Einrichtung verändert (zum Beispiel ein weiterer Schlüssel):
  `REL-0 ABBRUCH: … wurde seit der Einrichtung verändert …`. Dann Widerruf von Hand nach Abschnitt 6a.

---

## 3. Installation Phase 1

**Alternative zum REL-0-Installer** (Abschnitt „Einrichtung mit einem Befehl“). Gilt, wenn der Installer nicht
genutzt werden kann.

Alle Befehle in der Remotekonsole mit Root-Rechten. `<commit>` ist der **volle 40-stellige SHA** des freigegebenen
Kopf-Commits des PR bzw. des Merge-Commits, nie ein Branchname (ein Branch kann sich ändern).

**Sollwert aus unabhängigem Kanal.** Gleichen Sie die Prüfsumme unten **vor** 3a mit dem Wert in der PR-Freigabe
(Review-Kommentar) bzw. der Freigabenachricht im Chat ab. Nur wenn beide gleich sind, gilt der Wert. Dieses Dokument
allein reicht nicht: Wer das Dokument ändern kann, kann auch den Wert ändern.

Soll-Werte der Prüfsummen (die Prüfung `pruefungen/inventur-skript.test.js` stellt sicher, dass
sie zu den Dateien im Repository passen):

- **SHA-256 von deploy/inventur.sh: `d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21`**
- **SHA-256 von deploy/inventur-sammler.sh: `10db2a1d6328ba02a169d14662bbfb8d309256957b56c4524d62a35cf87247a6`** (nur Phase 2)
- **SHA-256 von deploy/inventur-lesen.sh: `a2454b79eef621accd134b54335a16d788eec8cc3767beb9d44d68cf69f8d2ff`** (nur Phase 2)

### 3a. Skript holen (Weg 1: fester Commit, ohne Einfügen)

Das Repository ist öffentlich. Der VPS lädt die Datei eines festen Commits:

```bash
curl -fsSL -o /tmp/inventur.sh "https://raw.githubusercontent.com/rinats-png/dienstplaner/<commit>/deploy/inventur.sh"
sha256sum /tmp/inventur.sh
```

- **Erwartet:** `d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21  /tmp/inventur.sh`.
- **Weiter nur wenn:** die Prüfsumme stimmt Zeichen für Zeichen.
- **Sonst (Weg 2, Einfügen):** `nano /tmp/inventur.sh`, Inhalt aus dem Repository einfügen, speichern, erneut
  `sha256sum /tmp/inventur.sh`. Stimmt der Wert nicht (häufig: Tastaturbelegung der Konsole), Datei löschen
  (`rm /tmp/inventur.sh`) und Weg 1 erneut versuchen. Nie eine Datei mit falscher Prüfsumme installieren.
- **Rückweg:** `rm /tmp/inventur.sh`.

### 3b. Installieren (root-eigen, außerhalb des Betriebsverzeichnisses) und prüfen

```bash
bash -n /tmp/inventur.sh && echo SYNTAX-OK
install -o root -g root -m 0755 /tmp/inventur.sh /usr/local/sbin/centric-inventur.sh
rm /tmp/inventur.sh
namei -l /usr/local/sbin/centric-inventur.sh
sha256sum /usr/local/sbin/centric-inventur.sh
```

- **Erwartet:** `SYNTAX-OK`; `namei -l` zeigt für `/`, `/usr`, `/usr/local`, `/usr/local/sbin` jeweils
  `drwxr-xr-x root root` und für die Datei `-rwxr-xr-x root root`; Prüfsumme `d99207298c121d8af32f7d4bfcf048e6f8f47951305741753d8b5493ff533c21`.
- **Weiter nur wenn:** jede Zeile von `namei -l` zeigt `root root` und kein Verzeichnis ist für Gruppe oder andere
  beschreibbar; Prüfsumme stimmt. Dann kann `<konto>` das Skript ausführen, aber weder die Datei noch ein Verzeichnis
  auf dem Pfad ändern (Abschnitt 7.4).
- **Rückweg:** `rm /usr/local/sbin/centric-inventur.sh`.

### 3c. Probelauf in der Konsole (lesend)

```bash
sudo -u <konto> /usr/local/sbin/centric-inventur.sh | head -n 40
```

- **Erwartet:** `=== Kopf ===`, `Produktionsinventur (nur lesend)`, danach `=== V-1 …`. Kein `Abschnitt gescheitert`
  in V-1.
- **Weiter nur wenn:** die Abschnittsköpfe erscheinen.
- **Rückweg:** keiner nötig (das Skript ändert nichts; /gesund legt im Container nur die Probe `data/.gesund` an,
  siehe §2.1 V-9).

### 3d. Sicherung von authorized_keys und Zustand prüfen

```bash
A=~<konto>/.ssh/authorized_keys
stat -c '%n %U:%G %a' ~<konto> ~<konto>/.ssh "$A"
cp -p "$A" "$A.vor-inventur-$(date -u +%Y%m%dT%H%M%SZ)"
ls -l "$A".vor-inventur-*
ssh-keygen -lf "$A" | wc -l
if [ -z "$(tail -c1 "$A")" ]; then echo "endet mit Zeilenumbruch"; else echo "STOPP: kein Zeilenumbruch am Ende"; fi
```

(`~<konto>` ausschreiben, zum Beispiel `~admin`.)

- **Erwartet:** Heimatverzeichnis gehört `<konto>`, nicht für andere beschreibbar; `.ssh` gehört `<konto>` mit `700`;
  `authorized_keys` gehört `<konto>` mit `600` (oder `644`); eine Sicherungsdatei; Anzahl Schlüssel = **N**
  (notieren); `endet mit Zeilenumbruch`.
- **Weiter nur wenn:** Besitz und Rechte wie erwartet, Sicherung vorhanden, kein `STOPP`.
  Bei `STOPP: kein Zeilenumbruch am Ende`: zuerst `printf '\n' >> "$A"`, dann die letzte Zeile erneut prüfen.
- **Fall „Datei fehlt“** (1c): `install -d -o <konto> -g <konto> -m 700 ~<konto>/.ssh` und
  `install -o <konto> -g <konto> -m 600 /dev/null ~<konto>/.ssh/authorized_keys`; dann N = 0.
- **Rückweg:** Sicherungsdatei löschen (`rm "$A".vor-inventur-<zeit>`).

### 3e. Eine Zeile anhängen (nie überschreiben)

```bash
printf '%s\n' 'command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc PUB-INV' >> "$A"
```

`PUB-INV` ersetzen Sie durch die ganze Zeile aus 0d (`ssh-ed25519 AAAA… inventur-centric`). Verwenden Sie genau
`>>`. Ein einzelnes `>` würde die Datei überschreiben.

Prüfen:

```bash
ssh-keygen -lf "$A"
ssh-keygen -lf "$A" | wc -l
grep -c 'inventur-centric$' "$A"
grep -oE '^(command="[^"]*"[^ ]*)' "$A"
stat -c '%U:%G %a' "$A"
```

- **Erwartet:** die alten N Fingerabdrücke unverändert, dazu **F-INV** mit `inventur-centric (ED25519)`;
  Anzahl N + 1; `1`; unter den Optionen genau
  `command="/usr/local/sbin/centric-inventur.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc`;
  Besitz und Rechte wie in 3d.
- **Weiter nur wenn:** alles stimmt. Weicht F-INV ab (Einfügefehler): Rückweg 3e, dann 3e erneut.
- **Rückweg:** genau diese Zeile entfernen (Abschnitt 6a). Danach `ssh-keygen -lf "$A" | wc -l` = N.

---

## 4. Nachprüfung vom Arbeitsrechner

`HOST` ist der Name im known_hosts-Format: `<vps-adresse>` bei Port 22, sonst `[<vps-adresse>]:<port>`.
`SSHI` steht in diesem Abschnitt für:

```bash
HOST='<vps-adresse>'            # bei Port ≠ 22: HOST='[<vps-adresse>]:<port>'
SSHI="ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i $HOME/.ssh/inventur_centric_ed25519 -p <port>"
```

Vorher die Passphrase in den Agenten laden: `eval "$(ssh-agent -s)"` und `ssh-add ~/.ssh/inventur_centric_ed25519`.
Nie `StrictHostKeyChecking=no` verwenden.

### 4a. Host-Schlüssel vor der ersten Verbindung

```bash
ssh-keygen -F "$HOST" -l
```

- **Erwartet:** ein Eintrag mit `SHA256:eLwAqtKJ9LZLW334tonIA61Fcl26EvKiOyVIHWClW44` (ED25519) aus 1e.
- **Weiter nur wenn:** der Eintrag stimmt. Weicht er ab: STOPP.
- **Kein Eintrag — Weg 1 (erste Verbindung interaktiv, ohne `BatchMode`):**

  ```bash
  ssh -o StrictHostKeyChecking=ask -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 -p <port> <konto>@<vps-adresse> inventur > /dev/null
  ```

  ssh zeigt `ED25519 key fingerprint is SHA256:…`. Antworten Sie nur `yes`, wenn der Wert gleich dem ED25519-Wert aus
  1e ist. Abweichung: `no`, STOPP. (`BatchMode=yes` würde die Frage unterdrücken; deshalb hier ohne.)
- **Kein Eintrag — Weg 2 (Zeile selbst anlegen):** In der Remotekonsole `cat /etc/ssh/ssh_host_ed25519_key.pub`
  ablesen. Am Arbeitsrechner:

  ```bash
  printf '%s %s\n' "$HOST" 'ssh-ed25519 AAAA…(Inhalt aus der Konsole)' >> ~/.ssh/known_hosts
  ssh-keygen -F "$HOST" -l
  ```

  **Weiter nur wenn** `ssh-keygen -F` genau den ED25519-Fingerabdruck aus 1e zeigt (ein Tippfehler ergibt einen
  anderen Fingerabdruck).
- **Rückweg:** `ssh-keygen -R "$HOST"` (entfernt nur den known_hosts-Eintrag dieses Servers).

### 4b. Inventur über den Forced Command

Die Rohausgabe gehört **nicht** ins Repository (E-5). Sie liegt deshalb im Benutzerverzeichnis, nie im
Repository-Ordner; `.gitignore` enthält zusätzlich `inventur-roh*`.

```bash
$SSHI <konto>@<vps-adresse> inventur > ~/inventur-roh.txt; echo "Rückgabe: $?"
head -n 14 ~/inventur-roh.txt
```

- **Erwartet:** `Rückgabe: 0` (oder `1`, wenn einzelne Abschnitte scheitern; die Liste steht am Ende unter
  `=== Ende ===`); `=== Kopf ===`; `Agent-Weiterleitung: nicht gesetzt`; `Terminal: nein`; in der Zeile `Skript:`
  die Prüfsumme aus 3b.
- **Weiter nur wenn:** Rückgabe 0 oder 1 und die Abschnitte `=== V-1` bis `=== V-9` sind vorhanden.
  `Permission denied (publickey)`: 1b (`allowusers`), 3d (Rechte), 3e (Zeile) prüfen.
- **Rückweg:** `rm ~/inventur-roh.txt`.

### 4c. Negativproben (Forced Command und Einschränkungen wirken)

Legen Sie vorher eine harmlose Probedatei an: `echo probe > /tmp/inventur-probe.txt`.

| Nr | Befehl | Erwartet |
|---|---|---|
| N-1 | `$SSHI <konto>@<vps-adresse> id; echo "Rückgabe: $?"` | `abgewiesen: nur der Befehl "inventur" ist erlaubt`, `Rückgabe: 2`, keine Ausgabe von `id` |
| N-2 | `$SSHI <konto>@<vps-adresse> 'inventur; id'; echo "Rückgabe: $?"` | wie N-1 |
| N-3 | `$SSHI <konto>@<vps-adresse> 'inventur && ls'; echo "Rückgabe: $?"` | wie N-1 |
| N-4 | `$SSHI <konto>@<vps-adresse> INVENTUR; echo "Rückgabe: $?"` | wie N-1 |
| N-5 | `$SSHI -t <konto>@<vps-adresse> inventur \| grep -E '^Terminal:'` und dasselbe mit `-tt` | ssh meldet `PTY allocation request failed on channel 0`; Ausgabe `Terminal: nein` |
| N-6 | `$SSHI -N -L 13000:127.0.0.1:3000 <konto>@<vps-adresse>` und in zweitem Fenster `curl -sS http://127.0.0.1:13000/` | ssh meldet `channel …: open failed: administratively prohibited`; curl scheitert. Beenden mit Strg+C |
| N-7 | `scp -O -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 -P <port> /tmp/inventur-probe.txt <konto>@<vps-adresse>:/tmp/` | Abbruch mit Fehler (der Server führt statt `scp -t /tmp/` das Skript aus, das abweist) |
| N-8 | `scp -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 -P <port> /tmp/inventur-probe.txt <konto>@<vps-adresse>:/tmp/` (neues scp über sftp) | Abbruch mit Fehler, zum Beispiel `Connection closed` |
| N-9 | `echo 'put /tmp/inventur-probe.txt /tmp/' \| sftp -b - -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 -P <port> <konto>@<vps-adresse>` | Abbruch, zum Beispiel `Connection closed`; kein Upload |
| N-10 | `rsync -e "$SSHI" /tmp/inventur-probe.txt <konto>@<vps-adresse>:/tmp/` | Abbruch mit `protocol version mismatch` oder `connection unexpectedly closed` |
| N-11 | `$SSHI -A <konto>@<vps-adresse> inventur \| grep -E '^Agent-Weiterleitung:'` (Agent läuft lokal) | `Agent-Weiterleitung: nicht gesetzt` |

Danach in der Remotekonsole:

```bash
ls -l /tmp/inventur-probe.txt ~<konto>/inventur-probe.txt
```

- **Erwartet:** beide `No such file or directory`.
- **Weiter nur wenn:** alle Proben verweigern und keine Datei angekommen ist. Läuft `id`, eine Weiterleitung, ein
  Upload, zeigt N-5 `Terminal: ja` oder N-11 `gesetzt`: STOPP und sofort Widerruf (6a).
- **Rückweg:** `rm /tmp/inventur-probe.txt` am Arbeitsrechner.

---

## 5. V-1 bis V-9 ausführen und ablegen (E-5)

1. Lauf wie 4b. Das Skript führt V-1 bis V-9 nach
   [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) aus, dazu R-1
   (Ressourcen) und R-2 (Mounts, Compose-Projektpfad).
2. Die **Rohausgabe** `~/inventur-roh.txt` bleibt **lokal** beim Betreiber. Sie kommt **nicht** ins Repository (öffentlich).
   Sie enthält Pfade, Dateilisten, Ports und Fingerabdrücke. Löschen Sie sie, wenn die Zusammenfassung abgelegt ist.
3. Ins Repository kommt nur eine **Zusammenfassung** als `docs/acc45/vps-inventur-<JJJJ-MM-TT>.md` (eigener PR),
   ohne Adressen, ohne Pfad- und Dateilisten, ohne Fingerabdrücke, ohne Werte:

   | Feld | Inhalt |
   |---|---|
   | Datum, prüfende Person | — |
   | Prüfsumme `centric-inventur.sh` | aus Zeile `Skript:` |
   | Zustand A/B/C | nach [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) §3 (Digest-Präfix 12 Zeichen) |
   | Revision-Label vorhanden | ja / nein |
   | `IMAGE_DIGEST` in `.env` / `IMAGE_TAG` in `.env` | ja / nein |
   | Betriebsdateien = Repository | ja / nein je Datei (Vergleich lokal) |
   | `zustand/` vorhanden, uid 1000, 700 | ja / nein |
   | fehlende `.env`-Schlüsselnamen gegenüber `.env.example` | nur Namen |
   | Sicherung: restic, Cron, letzte erfolgreiche | ja / nein, Datum |
   | Forced Command `deploy.sh --ssh` / `centric-inventur` | Anzahl |
   | Platz frei / Datengröße / `/gesund` | Werte |
   | gescheiterte Abschnitte | Liste |

4. Prüfen Sie die Zusammenfassung vor dem PR:

   ```bash
   grep -nE 'AAAA[0-9A-Za-z+/]{16}|PRIVATE KEY|@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9]{1,3}(\.[0-9]{1,3}){3}|SHA256:|/opt/|/home/' docs/acc45/vps-inventur-*.md
   ```

   **Erwartet:** keine Zeile.
5. Das Ergebnis halten Sie außerdem fest wie in §2.1 „Ergebnis festhalten“ beschrieben.

---

## 6. Widerruf

Widerrufen Sie den Zugang, wenn der Schlüssel oder der Arbeitsrechner verloren ist, wenn eine Negativprobe (4c)
fehlschlägt oder wenn die Inventur nicht mehr gebraucht wird.

### 6a. Zeile entfernen (Remotekonsole)

```bash
A=~<konto>/.ssh/authorized_keys
cp -p "$A" "$A.vor-widerruf-$(date -u +%Y%m%dT%H%M%SZ)"
sed -E -i '\#^(from="[^"]*",)?command="/usr/local/sbin/centric-inventur\.sh",[a-zA-Z0-9,-]* ssh-ed25519 [A-Za-z0-9+/=]* inventur-centric$#d' "$A"
ssh-keygen -lf "$A"
grep -c 'inventur-centric' "$A"
```

- **Erwartet:** F-INV fehlt in der Liste; die übrigen Fingerabdrücke sind unverändert (Anzahl N); `0`.
- **Weiter nur wenn:** F-INV fehlt und alle anderen Fingerabdrücke sind noch da. Fehlt ein anderer: Sicherung
  zurückspielen (`cp -p "$A.vor-widerruf-<zeit>" "$A"`) und melden.

### 6b. Skript entfernen (optional)

```bash
rm /usr/local/sbin/centric-inventur.sh
```

### 6c. Schlüssel am Arbeitsrechner löschen

```bash
rm ~/.ssh/inventur_centric_ed25519 ~/.ssh/inventur_centric_ed25519.pub
```

### 6d. Nachweis

Lauf wie 4b. **Erwartet:** `Permission denied (publickey)`.

### 6e. Nachrüsten von `from=` (E-3, später)

Sobald eine feste Betreiber-Adresse nachgewiesen ist: dieselbe Zeile mit `from="<adresse>"` vor `command=` neu
eintragen (6a, dann 3e mit der ergänzten Zeile). Bis dahin keine `from=`-Beschränkung.

---

## 7. Sicherheitsnachweis

Belege: Quelltext [`deploy/inventur.sh`](../../deploy/inventur.sh), [`deploy/inventur-sammler.sh`](../../deploy/inventur-sammler.sh),
[`deploy/inventur-lesen.sh`](../../deploy/inventur-lesen.sh); Prüfungen `pruefungen/inventur-skript.test.js` und
`pruefungen/inventur-phase2.test.js` (im Skript `pruefung:querschnitt`, CI-Gate); shellcheck über `deploy/*.sh` im
Workflow „Betrieb: Deploy-Skripte“.

### 7.1 Keine `.env`-Werte: Schicht 1 ist maßgeblich, Maskierung nur zusätzlich

| Schicht | Was | Beleg (Test) |
|---|---|---|
| 1 Quelle (maßgeblich) | `.env` wird an genau einer Stelle gelesen (`env_namen`): awk gibt nur den Namen vor `=` aus, überspringt Folgezeilen mehrzeiliger Werte in Anführungszeichen, entfernt CR; danach lässt `grep` nur Bezeichner durch. Kein `cat`, kein `source`. `docker compose`-Fehlertexte (können `.env`-Zeilen zitieren) werden verworfen (`compose_lesen`). `compose config` nur `image:`-Zeilen. `docker inspect` nur mit festen Formaten: nie `.Config.Env`, nie `{{json .}}`/`{{json .Config}}`, Labels nur vier feste Namen. Sicherungsmarke `letzte-erfolgreiche.json` nur die festen Felder `zeit`, `dateien`, `bytes`, `snapshot_id`. Betriebsprotokoll nur Zeit, Skript, Ereignis. `authorized_keys` nur Optionen, Typ, Fingerabdruck. Dateien, die das Konto kontrolliert, nur wenn sie keine symbolischen Links sind. | „Schicht 1 (Quelle) ohne Maskierung“: Lauf mit `INVENTUR_MASKE=aus`; Docker-Stub gibt bei jedem nicht freigegebenen `inspect`-Format Umgebungswerte aus; Allowlist der Docker-Aufrufe zeichengenau. Fälle `export`, Leerzeichen, `"…"`, `'…'`, mehrzeilig, mehrzeilig mit `\"`, CRLF, Zugangsdaten in der Sicherungsmarke, Kommentar, Zeile ohne `=`, `compose`-Fehlertext, Docker nicht erreichbar. Quelltext-Wächter: genau zwei Zeilen mit `.env` |
| 2 Maskierung (nur zusätzlich) | `maskieren()` über die gesamte Ausgabe: Adressen, E-Mail, URL-Zugangsdaten, Tokens, Schlüsselkörper, `name=Wert` (jeder Bezeichner, auch klein; ausgenommen `IMAGE_DIGEST`, `IMAGE_TAG`, `command`), lange Base64-Folgen | „Schicht 2“: absichtlich geleakter Wert in einer ausgegebenen Datei ist ohne Maske sichtbar und mit Maske ersetzt |

Die Maskierung ist **keine** Begründung dafür, einen Wert zu lesen. Sie fängt nur Fehler von Schicht 1 ab.

### 7.2 Fremde SSH-Befehle werden zuverlässig abgewiesen

- Das Skript prüft `SSH_ORIGINAL_COMMAND` **als Erstes** nach der Härtung: erlaubt sind nur „fehlt“, „leer“ und genau
  `inventur`. Jeder andere Wert → Meldung auf stderr, Rückgabe 2, **kein** Abschnitt, kein Docker-Aufruf, nichts auf
  stdout. Der Wert wird nur verglichen, nie ausgeführt.
- Geprüfte Werte (Test „Forced Command: jeder fremde Befehl …“, Leser ebenso):
  `inventur; id`, `inventur && ls`, `inventur | cat`, `inventur⏎id`, `inventur⏎`, `inventur␠`, `␠inventur`,
  `⇥inventur`, `INVENTUR`, `Inventur`, `inventur --hilfe`, Steuerzeichen, nur Leerzeichen/Tab/Zeilenumbruch, `id`,
  `bash`, `sh -c id`, `scp -t /tmp`, `scp -f /etc/passwd`, `sftp`, `internal-sftp`, `/usr/lib/openssh/sftp-server`,
  `rsync --server …`, `cat .env`, `docker ps`. Ein Nullbyte kann in einer Umgebungsvariablen nicht vorkommen.
- Negativproben auf dem echten Server: 4c (N-1 bis N-10).

### 7.3 Keine Shell, kein PTY, keine Weiterleitung, kein Upload, keine Umgebungsübernahme

Quelle: OpenSSH-Handbuch sshd(8), Abschnitt „AUTHORIZED_KEYS FILE FORMAT“. `restrict` gibt es ab OpenSSH 7.2; auf
IONOS-Images üblich sind Ubuntu 22.04 (8.9p1), Ubuntu 24.04 (9.6p1), Debian 12 (9.2p1). Version prüft 1b.

| Gefahr | Mechanismus | Wortlaut sshd(8) (sinngemäß) | Nachweis |
|---|---|---|---|
| freie Shell | `command="…"` | Der vom Client gelieferte Befehl wird ignoriert; gilt für Shell-, Befehls- **und Subsystem**-Ausführung; der ursprüngliche Befehl steht in `SSH_ORIGINAL_COMMAND` | N-1 bis N-4 |
| PTY | `restrict`, `no-pty` | `restrict` schaltet u. a. die PTY-Zuteilung ab; `no-pty` verhindert sie ausdrücklich | N-5 (`Terminal: nein`) |
| Port-Weiterleitung | `restrict`, `no-port-forwarding` | verbietet TCP-Weiterleitung (`-L`, `-R`, `-D`) | N-6 |
| Agent-/X11-Weiterleitung | `restrict`, `no-agent-forwarding`, `no-X11-forwarding` | verbieten Agent- und X11-Weiterleitung | N-11 (`Agent-Weiterleitung: nicht gesetzt`); X11: Option in 3e geprüft |
| `~/.ssh/rc` | `restrict`, `no-user-rc` | verhindert die Ausführung von `~/.ssh/rc` | Option in 3e geprüft |
| Datei-Upload | `command="…"` überstimmt `scp -t`, das sftp-Subsystem und `rsync --server` | wie „freie Shell“ | N-7 bis N-10, Test der Werte in 7.2 |
| Umgebung vom Client | `PermitUserEnvironment no` (keine `~/.ssh/environment`, keine `environment=`-Option); `AcceptEnv` nur `LANG LC_*` | — | 1b; das Skript setzt `LC_ALL=C` selbst |

Grenze: Die Login-Shell von `<konto>` startet den Forced Command (`<shell> -c "<command>"`). Ist sie bash, liest
Debian/Ubuntu-bash bei Aufruf durch sshd zusätzlich `~<konto>/.bashrc` (Übersetzungsoption `SSH_SOURCE_BASHRC`,
**[angenommen]**, prüfen mit `grep -c SSH_SOURCE /usr/share/doc/bash/README.Debian.gz` oder durch Probe). Diese Datei
gehört `<konto>`; der Inhaber des Inventur-Schlüssels kann sie nicht ändern. Phase 2 nutzt `/bin/sh` (dash), das bei
`-c` keine Startdatei liest.

### 7.4 Schutz des Skripts und aller verwendeten Dateien

Härtung im Skript (Quelltext-Wächter „Härtung …“): Shebang `#!/bin/bash` (kein Suchpfad über `env`),
`set -euo pipefail`, `umask 077`, `LC_ALL=C`, `PATH=/usr/sbin:/usr/bin:/sbin:/bin` fest, `unset BASH_ENV ENV CDPATH`
— alles **vor** der Auswertung von `SSH_ORIGINAL_COMMAND`. Der Sammler startet die Inventur mit
`env -u BASH_ENV -u ENV -u SSH_ORIGINAL_COMMAND` (Test „die Inventur läuft ohne BASH_ENV …“).

Grenzen: bash liest `BASH_ENV` beim Start, also **bevor** `unset` wirkt. sshd setzt `BASH_ENV` nicht
(`PermitUserEnvironment no`, `AcceptEnv` nur `LANG LC_*`); systemd und cron auch nicht. Die Variablen
`INVENTUR_PRUEFPFAD`, `INVENTUR_MASKE`, `INVENTUR_PRUEF…` und `CENTRIC_…` dienen nur den Prüfungen; auf dem VPS setzt
sie niemand (gleiche Begründung). Zusätzlich verwirft das Skript (und der Leser `INVENTUR_PRUEFDATEI`) alle diese
Variablen, sobald `SSH_CONNECTION` gesetzt ist (Test „SSH-Sitzung …“).

Grenze `.env`: Endet ein doppelt zitierter mehrzeiliger Wert mit `\\"` (maskierter Backslash vor dem Schlusszeichen),
bleibt der Wert für `env_namen` offen. Folge sind höchstens fehlende Namen in V-6, nie Werte.

| Was | Pfad | Soll | Wer darf ändern |
|---|---|---|---|
| Inventur-Skript | `/usr/local/sbin/centric-inventur.sh` | `root:root 0755` | root |
| Sammler, Leser (Phase 2) | `/usr/local/sbin/centric-inventur-sammler.sh`, `…-lesen.sh` | `root:root 0755` | root |
| Verzeichnisse des Pfads | `/`, `/usr`, `/usr/local`, `/usr/local/sbin` | `root:root 0755` | root |
| Interpreter | `/bin/bash`, `/bin/sh` | `root:root 0755` | root |
| Programme (über festen PATH) | `docker`, `timeout`, `sed`, `awk`, `grep`, `sort`, `tr`, `cut`, `head`, `tail`, `ls`, `stat`, `sha256sum`, `du`, `df`, `nproc`, `uptime`, `free`, `id`, `uname`, `date`, `getent`, `ssh-keygen`, `crontab`, `restic`, `cat`, `env`, `mktemp`, `chmod`, `chown`, `mv` | `root:root`, nicht für Gruppe/andere beschreibbar, in `/usr/bin`, `/bin`, `/usr/sbin`, `/sbin` | root |
| Docker-CLI-Erweiterung | `/usr/libexec/docker/cli-plugins/docker-compose` (Paket) | `root:root 0755` | root |
| Docker-Socket | `/var/run/docker.sock` | `root:docker 0660` | root |
| gelesene Betriebsdaten | `/opt/apps/centric-dienstplanung/{.env,compose.yml,FREIGEGEBENE-IMAGES.md,*.sh,*.mjs,data,zustand,betrieb-protokoll.log,deploy-sicherungen}` | gehören `<konto>` | `<konto>` (werden nur gelesen, nicht ausgeführt) |
| gelesene Kontodaten | `~<konto>/.ssh/authorized_keys`, `~<konto>/sicherung/…`, `~<konto>/.docker/` | gehören `<konto>` | `<konto>` |

Prüfbefehle (Remotekonsole):

```bash
namei -l /usr/local/sbin/centric-inventur.sh
for b in bash sh docker timeout sed awk grep sort tr cut head tail ls stat sha256sum du df nproc uptime free id uname date getent ssh-keygen crontab cat env mktemp chmod chown mv; do
  w=$(PATH=/usr/sbin:/usr/bin:/sbin:/bin command -v "$b") && stat -L -c '%n %U:%G %a' "$w"
done
stat -c '%n %U:%G %a' /usr/libexec/docker/cli-plugins/docker-compose /var/run/docker.sock
find /usr/sbin /usr/bin /sbin /bin /usr/local/sbin -maxdepth 0 -perm /022 -printf 'STOPP beschreibbar: %p\n'
ls -la ~<konto>/.docker/cli-plugins 2>&1
```

- **Erwartet:** überall `root:root` (Socket `root:docker 660`), keine Zeile `STOPP beschreibbar`,
  `~<konto>/.docker/cli-plugins` fehlt.
- **Weiter nur wenn:** so. Liegt eine Erweiterung in `~<konto>/.docker/cli-plugins`: melden. Die Docker-CLI sucht
  Erweiterungen auch dort, und diese Datei gehört `<konto>`.

### 7.5 Ehrliche Bewertung Phase 1

- **Geschützt:** gegen den Inhaber des Inventur-Schlüssels. Er kann nur das root-eigene, geprüfte Skript starten.
  Er kann es nicht ändern, keine Shell öffnen, nichts hochladen, nichts weiterleiten und keine Umgebung setzen.
- **Nicht geschützt:** gegen `<konto>` selbst. `<konto>` ist über die Gruppe `docker` root-gleich (2.2) und besitzt
  `.env`, `~/.bashrc`, `~/.docker`. Wer `<konto>` übernimmt, braucht den Inventur-Zugang nicht.
- **Folge:** Phase 1 vergrößert die Angriffsfläche nur um den geprüften Lesebefehl. Phase 2 entfernt auch den
  Docker-Zugriff aus dem Zugangskonto.

---

## 8. Phase 2 (langfristig, bevorzugt): Konto `inventur` ohne Docker-Rechte

### 8.1 Aufbau

```
root (systemd-Timer)                         Konto inventur (SSH, Forced Command)
  centric-inventur-sammler.sh                  centric-inventur-lesen.sh
    └─ centric-inventur.sh (Docker als root)     └─ cat /var/lib/centric-inventur/aktuell.txt
         └─ schreibt atomar:                         (nur diese Datei, keine Argumente)
            /var/lib/centric-inventur/aktuell.txt  root:inventur 0640
```

- Nur root führt Docker-Befehle aus (über den Timer). Das Konto `inventur` ist nicht in `docker`, `sudo`, `wheel`.
- Der Sammler schreibt in eine Temporärdatei **im selben Verzeichnis** (`mktemp`) und benennt sie mit `mv` um. Leser
  sehen immer eine vollständige Datei. Scheitert die Inventur (Rückgabe außer 0/1), bleibt die alte Datei.
- Der Leser gibt nur diese Datei aus. Er prüft `SSH_ORIGINAL_COMMAND` wie das Inventur-Skript.

**Vorteile:** Das Zugangskonto hat keine Docker-Rechte und keine Schreibrechte im Betriebsverzeichnis. Ein gestohlener
Schlüssel liest nur eine bereits maskierte Datei. Für eine automatische Abfrage (8.6) ist das der richtige Zugang.

**Grenzen:** Aktualität = Timer-Abstand (Vorschlag 15 Minuten); die Zeile `Zeit (UTC)` im Kopf zeigt das Alter. Der
Sammler läuft als root, startet die Inventur aber mit `runuser` als Besitzer des Betriebsverzeichnisses (`<konto>`),
nie als root; ist root der Besitzer, bricht er ab (Rückgabe 5). Damit folgt kein root-Prozess Links, die `<konto>`
anlegt (`.env`, `betrieb-protokoll.log`, `letzte-erfolgreiche.json`), und `crontab -l` zeigt die Crontab von `<konto>`
(nicht die von root). Root öffnet nur die Zieldatei in `/var/lib/centric-inventur` (root-eigen). Die Inventur selbst
prüft zusätzlich auf symbolische Links (7.1). Verbleibende Grenze: `<konto>` ist über `docker` root-gleich und kann
die Inventur-Ausgabe über seine eigenen Dateien beeinflussen, aber die Datei des Kontos `inventur` nicht direkt
schreiben.

### 8.2 Warum die Login-Shell `/bin/sh` sein muss (nicht nologin)

sshd startet auch einen Forced Command über die Login-Shell des Kontos: `<shell> -c "<command>"`. Mit
`/usr/sbin/nologin` als Shell läuft stattdessen nologin. Es gibt „This account is currently not available.“ aus, und
der Forced Command läuft **nie**. Richtig ist:

- Login-Shell `/bin/sh` (dash: liest bei `-c` keine Startdatei);
- Passwort gesperrt (`passwd -l`), also keine Anmeldung an der Konsole;
- `authorized_keys` **root-eigen** (das Konto kann keine Schlüssel ergänzen) mit `restrict,command=…`;
- zusätzlich `Match User inventur` mit `ForceCommand` in sshd — wirkt auch für jeden Schlüssel ohne Optionen.

### 8.3 Einrichtung (Remotekonsole, root; erst nach Freigabe von Phase 2)

Jeder Schritt mit Prüfung; Rückweg 8.5.

```bash
# 1 Konto ohne Gruppen, Shell /bin/sh, Passwort gesperrt
useradd --create-home --shell /bin/sh --user-group inventur
passwd -l inventur
id inventur                       # erwartet: nur Gruppe inventur
getent group docker sudo wheel    # erwartet: inventur kommt nicht vor

# 2 Ablage für die Inventur
install -d -o root -g inventur -m 0750 /var/lib/centric-inventur

# 3 Skripte (Prüfsummen aus Abschnitt 3; Inventur-Skript siehe 3a/3b)
curl -fsSL -o /tmp/s.sh "https://raw.githubusercontent.com/rinats-png/dienstplaner/<commit>/deploy/inventur-sammler.sh"
curl -fsSL -o /tmp/l.sh "https://raw.githubusercontent.com/rinats-png/dienstplaner/<commit>/deploy/inventur-lesen.sh"
sha256sum /tmp/s.sh /tmp/l.sh     # erwartet: 10db2a1d6328ba02a169d14662bbfb8d309256957b56c4524d62a35cf87247a6 und a2454b79eef621accd134b54335a16d788eec8cc3767beb9d44d68cf69f8d2ff
install -o root -g root -m 0755 /tmp/s.sh /usr/local/sbin/centric-inventur-sammler.sh
install -o root -g root -m 0755 /tmp/l.sh /usr/local/sbin/centric-inventur-lesen.sh
rm /tmp/s.sh /tmp/l.sh

# 4 Timer (alle 15 Minuten)
printf '%s\n' '[Unit]' 'Description=CENTRIC lesende Inventur sammeln' '[Service]' 'Type=oneshot' \
  'ExecStart=/usr/local/sbin/centric-inventur-sammler.sh' 'Environment=HOME=/root' 'NoNewPrivileges=yes' 'PrivateTmp=yes' \
  > /etc/systemd/system/centric-inventur.service
printf '%s\n' '[Unit]' 'Description=CENTRIC Inventur alle 15 Minuten' '[Timer]' 'OnBootSec=5min' \
  'OnUnitActiveSec=15min' '[Install]' 'WantedBy=timers.target' > /etc/systemd/system/centric-inventur.timer
systemctl daemon-reload && systemctl enable --now centric-inventur.timer
systemctl start centric-inventur.service; systemctl status --no-pager centric-inventur.service | head -n 5
stat -c '%n %U:%G %a' /var/lib/centric-inventur /var/lib/centric-inventur/aktuell.txt
# erwartet: root:inventur 750 und root:inventur 640

# 5 Schlüssel root-eigen hinterlegen (eigener Schlüssel, nicht der aus Phase 1)
install -d -o root -g root -m 0755 /home/inventur/.ssh
printf '%s\n' 'command="/usr/local/sbin/centric-inventur-lesen.sh",restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc PUB-INV2' \
  > /home/inventur/.ssh/authorized_keys
chown root:root /home/inventur/.ssh/authorized_keys && chmod 0644 /home/inventur/.ssh/authorized_keys

# 6 sshd: Match-Block ans Ende, Syntax prüfen, neu laden
printf '%s\n' '' 'Match User inventur' '    ForceCommand /usr/local/sbin/centric-inventur-lesen.sh' \
  '    AllowTcpForwarding no' '    AllowAgentForwarding no' '    AllowStreamLocalForwarding no' \
  '    X11Forwarding no' '    PermitTTY no' '    PermitTunnel no' > /etc/ssh/sshd_config.d/90-centric-inventur.conf
sshd -t && systemctl reload ssh
sshd -T -C user=inventur,host=probe,addr=127.0.0.1 | grep -iE '^(forcecommand|allowtcpforwarding|permittty|x11forwarding)'
```

- `> datei` ist hier gewollt: Die Dateien sind neu und gehören nur zu Phase 2.
- `PUB-INV2` ist ein **eigener** öffentlicher Schlüssel (0b mit Namen `inventur_centric_p2_ed25519`).
- `sshd -t` muss ohne Ausgabe enden, bevor `reload` läuft. Liegt `Include /etc/ssh/sshd_config.d/*.conf` nicht am
  Anfang von `/etc/ssh/sshd_config` (Ubuntu/Debian-Vorgabe): STOPP und melden.
- `AllowUsers` aus 1b muss `inventur` zulassen; sonst ist das eine eigene sshd-Änderung (STOPP, Entscheidung).

### 8.4 Prüfung Phase 2

Wie 4b und 4c mit `inventur@<vps-adresse>` und dem Phase-2-Schlüssel. Zusätzlich:

```bash
sudo -u inventur docker ps            # erwartet: permission denied … docker.sock
sudo -u inventur test -w /opt/apps/centric-dienstplanung && echo STOPP || echo "kein Schreibrecht"
sudo -u inventur test -w /var/lib/centric-inventur/aktuell.txt && echo STOPP || echo "kein Schreibrecht"
```

### 8.5 Rückweg Phase 2

```bash
systemctl disable --now centric-inventur.timer
rm /etc/systemd/system/centric-inventur.service /etc/systemd/system/centric-inventur.timer && systemctl daemon-reload
rm /etc/ssh/sshd_config.d/90-centric-inventur.conf && sshd -t && systemctl reload ssh
userdel --remove inventur
rm -r /var/lib/centric-inventur
rm /usr/local/sbin/centric-inventur-sammler.sh /usr/local/sbin/centric-inventur-lesen.sh
```

### 8.6 Schlüssel für unbeaufsichtigte Nutzung (E-2, nur Konzept)

- **Eigener zweiter Schlüssel** ohne Passphrase, Kommentar `inventur-automatik`, nur für Automatisierung. Nie der
  persönliche Schlüssel aus 0b.
- **Ziel:** das Phase-2-Konto `inventur` (liest nur die Datei). Nicht `<konto>`.
- **Ablage:** nur als Secret der GitHub-Umgebung `produktion` (zum Beispiel `INVENTUR_SSH_KEY`, dazu
  `INVENTUR_KNOWN_HOSTS` mit dem ED25519-Host-Schlüssel aus 1e). Nie im Repository, nie in Logs. Die Umgebung hat
  Pflicht-Prüfer (siehe [DEPLOY-AUTOMATISIERUNG.md](../DEPLOY-AUTOMATISIERUNG.md) §3).
- **Rotation:** alle 90 Tage und bei jedem Personalwechsel: neuen Schlüssel erzeugen, Zeile ergänzen, Secret ersetzen,
  alten Schlüssel per 6a-Muster entfernen, Nachweis 6d mit dem alten Schlüssel.
- **Widerruf:** Zeile entfernen (Kommentar `inventur-automatik`), Secret löschen.
- Ein Workflow dafür ist **nicht** Teil von REL-0.

---

## Offene Punkte

- Betreiber: Abschnitte 0 bis 5 (Phase 1).
- Phase 2: eigene Freigabe (Abschnitt 8.3 ändert ein Konto, systemd und sshd).
- `SSH_SOURCE_BASHRC` auf dem VPS bestätigen (7.3, **[angenommen]**).

## Bezüge

- [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) — V-1 bis V-9
- [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) — Zustand A/B/C
- [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md) — Muster Forced Command, Deployment-Zugang
- [`deploy/inventur.sh`](../../deploy/inventur.sh), [`deploy/inventur-sammler.sh`](../../deploy/inventur-sammler.sh),
  [`deploy/inventur-lesen.sh`](../../deploy/inventur-lesen.sh)
