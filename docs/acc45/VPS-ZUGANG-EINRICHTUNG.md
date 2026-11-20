# VPS-Zugang für die lesende Produktionsinventur (REL-0)

Stand: 2026-11-20 · Paket: REL-0 „VPS-Zugang und Inventur“ · Status: REVIEW, Betreiberhandlung offen

**Ziel.** Ein kontrollierter, dauerhaft nutzbarer SSH-Zugang zum Produktions-VPS `srv-prod-01`. Der Zugang führt
**nur** das geprüfte Lese-Skript [`deploy/inventur.sh`](../../deploy/inventur.sh) aus. Er gibt keine Shell, keine
Weiterleitung und keine anderen Befehle. Das Skript führt V-1 bis V-9 aus
[PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) aus. Die Befehle der
Prüfpunkte stehen dort. Dieses Dokument wiederholt sie nicht.

**Anlass.** Ein Versuch mit dem lokalen Betreiberschlüssel als Konto `admin` endete mit
`Permission denied (publickey)`. Der lokale Schlüssel (Fingerabdruck beginnt mit `SHA256:+ky82R`) ist nicht der
GitHub-Deploy-Key. Den VPS bedient der Betreiber über die IONOS-Remotekonsole.

**Wer handelt.** Nur der Betreiber. Dieses Dokument beschreibt die Schritte. Es ändert selbst nichts auf dem VPS.

**Schreibweise.** `<vps-adresse>` ist die öffentliche Adresse aus dem DNS-Eintrag der Produktionsdomain. Sie wurde am
2026-11-20 mit den Host-Schlüsseln abgeglichen (Schritt 1e). Die Adresse steht absichtlich nicht in diesem
öffentlichen Repository. `<konto>` ist das Konto aus Schritt 1a (erwartet: `admin`).

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

### 0b. Neuen, eigenen Inventur-Schlüssel erzeugen

```bash
ssh-keygen -t ed25519 -f ~/.ssh/inventur_centric_ed25519 -C inventur-centric
```

- **Passphrase:** Empfohlen. Mit Passphrase laden Sie den Schlüssel vor Schritt 4 mit `ssh-add` in den Agenten
  (Schritt 4 nutzt `BatchMode=yes` und fragt nicht nach der Passphrase). Ohne Passphrase: siehe Entscheidungsfrage E-2.
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
- **Weiter nur wenn:** beide Verzeichnisse gehören **demselben** Konto. Dieses Konto heißt **`<konto>`**. Dann gilt
  Variante A (Abschnitt 2). Gehören sie verschiedenen Konten oder `root`: Variante B (Abschnitt 2.3).
- **Notieren:** Konten mit Login-Shell, Mitglieder von `docker` und `sudo`/`wheel`, `<konto>` und seine uid.
- **Rückweg:** keiner nötig.

### 1b. Wirksame sshd-Konfiguration

```bash
sshd -T | grep -iE '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|allowgroups|authorizedkeysfile|authenticationmethods)'
```

- **Erwartet:** `pubkeyauthentication yes`, `authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2`,
  `authenticationmethods any`. Gut: `passwordauthentication no`, `permitrootlogin no` oder `prohibit-password`.
- **Weiter nur wenn:** `pubkeyauthentication yes`, und `allowusers`/`allowgroups` fehlen **oder** schließen
  `<konto>` ein. Schließt eine Regel `<konto>` aus: STOPP. Eine Änderung der sshd-Konfiguration ist eine eigene
  Entscheidung und gehört nicht zu diesem Auftrag.
- **Notieren:** `port` (für Schritt 4) und alle Zeilen.
- **Rückweg:** keiner nötig.

### 1c. Autorisierte Schlüssel je Konto (ohne Inhalte)

```bash
for h in /root /home/*; do f=$h/.ssh/authorized_keys; [ -f $f ] && { echo == $f; stat -c '%U:%G %a' $f; ssh-keygen -lf $f; grep -oE '^(command="[^"]*"[^ ]*)' $f | sed 's/^/Optionen: /'; }; done
```

- **Erwartet:** je Datei `== <pfad>`, Besitzer und Rechte (zum Beispiel `admin:admin 600`), je Schlüssel eine Zeile
  `<bits> SHA256:… <kommentar> (<TYP>)`, dazu Zeilen `Optionen: command="…"` für Forced Commands. Es erscheint
  **kein** Schlüsselkörper (`AAAA…`).
- **Weiter nur wenn:** die Datei von `<konto>` existiert oder fehlt nachweislich (dann siehe 3c, Fall „Datei fehlt“).
  Erscheint ein Schlüsselkörper: STOPP, Ausgabe nicht weitergeben.
- **Notieren:** je Konto die Fingerabdrücke, Kommentare und Optionen.
- **Rückweg:** keiner nötig.

### 1d. Abgleich mit dem lokalen Betreiberschlüssel

Am **Arbeitsrechner**:

```bash
ssh-keygen -lf ~/.ssh/id_ed25519.pub
```

- **Erwartet:** `256 SHA256:+ky82R… <kommentar> (ED25519)`.
- **Prüfung:** Suchen Sie diesen Fingerabdruck in der Liste aus 1c.
  - Gefunden bei `<konto>`: Der Schlüssel ist autorisiert. Dann liegt die Ablehnung woanders (1b: `allowusers`,
    Rechte von `~/.ssh` nach 3c). Notieren Sie das.
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

## 2. Entscheidung und Konzept: getrennte Rechte

### 2.1 Zwei Rollen, zwei Schlüssel

| Rolle | Darf | Schlüssel | Eintrag | Stufe |
|---|---|---|---|---|
| INVENTUR | nur `inventur.sh` ausführen (lesen) | `inventur_centric_ed25519` (neu) | `command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty` | jetzt (REL-0) |
| DEPLOYMENT | nur `deploy.sh --ssh` (Freigabeliste, Digest) | `deploy_ed25519` (eigener Schlüssel) | `command="…/deploy.sh --ssh",restrict` | später (REL-Stufe), [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md) |

Die Rollen teilen keinen Schlüssel. Wer den Inventur-Schlüssel hat, kann nicht ausliefern. Der Deployment-Zugang ist
nicht Teil dieses Dokuments.

### 2.2 Warum die Inventur NICHT in die Gruppe `docker` kommt

Mitglieder der Gruppe `docker` steuern den Docker-Daemon. Der Daemon läuft als root. Ein Mitglied kann deshalb einen
Container mit dem Dateisystem des Hosts starten (zum Beispiel `docker run -v /:/host …`) und dort jede Datei lesen und
schreiben. Die Gruppe `docker` ist also gleichwertig mit root. Eine Lese-Rolle bekommt diese Gruppe nicht.

### 2.3 Zwei Varianten

**Variante A (empfohlen): Forced Command beim Konto `<konto>`.**
Sie hängen eine **zusätzliche** Zeile an `~<konto>/.ssh/authorized_keys` an:

```
command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty ssh-ed25519 AAAA… inventur-centric
```

- `command=…` erzwingt das Skript. Ein anderer Befehl des Clients wird abgewiesen (Rückgabe 2).
- `restrict` schaltet Weiterleitungen (Port, Agent, X11), PTY und `~/.ssh/rc` ab. `no-pty` steht zur Klarheit dabei.
- Es entsteht kein neues Konto, keine sudo-Regel, keine neue Gruppe. Bestehende Zeilen bleiben unverändert.
- Das Skript läuft mit den Rechten von `<konto>` (Docker-Zugriff, Besitz von `data/`). Die Grenze ist der Forced
  Command und der geprüfte Inhalt des Skripts. Das ist dasselbe Muster wie
  [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md).

**Variante B (nur wenn 1a kein passendes Konto zeigt): eigenes Konto mit sudo-Regel für genau einen Befehl.**
Ein neues Konto ohne `sudo` und ohne `docker` kann Docker nicht befragen und reicht deshalb nicht. Dann:

1. Konto `inventur` anlegen (ohne Passwort, ohne Gruppen).
2. Skript root-eigen außerhalb eines Kontoverzeichnisses ablegen, zum Beispiel
   `/usr/local/sbin/centric-inventur` (`root:root 0755`; das Verzeichnis gehört root).
3. Datei `/etc/sudoers.d/centric-inventur` (`root:root 0440`) mit genau dieser Zeile; das `""` verbietet Argumente:

   ```
   inventur ALL=(root) NOPASSWD: /usr/local/sbin/centric-inventur ""
   ```

   Prüfung: `visudo -c -f /etc/sudoers.d/centric-inventur` → `parsed OK`.
4. In `~inventur/.ssh/authorized_keys`:
   `command="sudo -n /usr/local/sbin/centric-inventur",restrict,no-pty ssh-ed25519 AAAA… inventur-centric`
5. Eventuell `AllowUsers` erweitern (1b) — das ist eine Änderung an sshd.

Unter sudo entfernt `env_reset` die Variable `SSH_ORIGINAL_COMMAND`. Ein anderer Befehl des Clients wird dann
**ignoriert** (es läuft immer die Inventur), nicht abgewiesen.

**Empfehlung: Variante A.** Begründung: Sie ändert genau eine Zeile in einer Datei und ist durch Löschen dieser Zeile
vollständig rückgängig. Variante B ändert ein Konto, sudoers und eventuell sshd und gibt einem neuen Konto Root-Rechte
für ein Skript. Das ist mehr Fläche für denselben Zweck. Variante B nur, wenn 1a sie erzwingt.

---

## 3. Installation (Variante A)

Alle Befehle in der Remotekonsole mit Root-Rechten. `<commit>` ist der Kopf-Commit des PR bzw. der Merge-Commit, der
`deploy/inventur.sh` enthält. Der Soll-Wert der Prüfsumme steht hier und im PR:

**SHA-256 von deploy/inventur.sh: `c08e928cca3790793c8f65088dcaff48bc7a59685589c472a95e5f6f0e44f72c`**

Die Prüfung `pruefungen/inventur-skript.test.js` stellt sicher, dass dieser Wert zur Datei im Repository passt.

### 3a. Skript holen (Weg 1: fester Commit, ohne Einfügen)

Das Repository ist öffentlich. Der VPS lädt die Datei eines festen Commits:

```bash
curl -fsSL -o /tmp/inventur.sh "https://raw.githubusercontent.com/rinats-png/dienstplaner/<commit>/deploy/inventur.sh"
sha256sum /tmp/inventur.sh
```

- **Erwartet:** `c08e928cca3790793c8f65088dcaff48bc7a59685589c472a95e5f6f0e44f72c  /tmp/inventur.sh`.
- **Weiter nur wenn:** die Prüfsumme stimmt Zeichen für Zeichen.
- **Sonst (Weg 2, Einfügen):** `nano /tmp/inventur.sh`, Inhalt aus dem Repository einfügen, speichern, erneut
  `sha256sum /tmp/inventur.sh`. Stimmt der Wert nicht (häufig: Tastaturbelegung der Konsole), Datei löschen
  (`rm /tmp/inventur.sh`) und Weg 1 erneut versuchen. Nie eine Datei mit falscher Prüfsumme installieren.
- **Rückweg:** `rm /tmp/inventur.sh`.

### 3b. Installieren und prüfen

```bash
bash -n /tmp/inventur.sh && echo SYNTAX-OK
install -o root -g root -m 0755 /tmp/inventur.sh /opt/apps/centric-dienstplanung/inventur.sh
stat -c '%n %U:%G %a' /opt/apps/centric-dienstplanung/inventur.sh
sha256sum /opt/apps/centric-dienstplanung/inventur.sh
rm /tmp/inventur.sh
```

- **Erwartet:** `SYNTAX-OK`; `/opt/apps/centric-dienstplanung/inventur.sh root:root 755`; Prüfsumme `c08e928cca3790793c8f65088dcaff48bc7a59685589c472a95e5f6f0e44f72c`.
- **Weiter nur wenn:** alle drei stimmen. `root:root 0755` heißt: `<konto>` darf lesen und ausführen, aber nicht
  ändern. Die Inventur-Rolle kann ohnehin nur den Forced Command ausführen.
- **Hinweis:** `<konto>` besitzt das Verzeichnis und könnte die Datei ersetzen. `<konto>` ist über die Gruppe
  `docker` aber ohnehin root-gleich (2.2). Der Schutz gilt dem Inventur-Schlüssel, nicht `<konto>`.
- **Rückweg:** `rm /opt/apps/centric-dienstplanung/inventur.sh`.

### 3c. Probelauf in der Konsole (lesend)

```bash
sudo -u <konto> /opt/apps/centric-dienstplanung/inventur.sh | head -n 40
```

- **Erwartet:** `=== Kopf ===`, `Produktionsinventur (nur lesend)`, danach `=== V-1 …`. Kein `Abschnitt gescheitert`
  in V-1.
- **Weiter nur wenn:** die Abschnittsköpfe erscheinen.
- **Rückweg:** keiner nötig (das Skript ändert nichts; /gesund legt im Container nur die Probe `data/.gesund` an,
  siehe §2.1 V-9).

### 3d. Sicherung von authorized_keys und Zustand prüfen

```bash
A=~<konto>/.ssh/authorized_keys
stat -c '%n %U:%G %a' ~<konto>/.ssh "$A"
cp -p "$A" "$A.vor-inventur-$(date -u +%Y%m%dT%H%M%SZ)"
ls -l "$A".vor-inventur-*
ssh-keygen -lf "$A" | wc -l
if [ -z "$(tail -c1 "$A")" ]; then echo "endet mit Zeilenumbruch"; else echo "STOPP: kein Zeilenumbruch am Ende"; fi
```

(`~<konto>` ausschreiben, zum Beispiel `~admin`.)

- **Erwartet:** `.ssh` gehört `<konto>` mit `700`; `authorized_keys` gehört `<konto>` mit `600` (oder `644`); eine
  Sicherungsdatei; Anzahl Schlüssel = **N** (notieren); `endet mit Zeilenumbruch`.
- **Weiter nur wenn:** Besitz und Rechte wie erwartet, Sicherung vorhanden, kein `STOPP`.
  Bei `STOPP: kein Zeilenumbruch am Ende`: zuerst `printf '\n' >> "$A"`, dann die letzte Zeile erneut prüfen.
- **Fall „Datei fehlt“** (1c): `install -d -o <konto> -g <konto> -m 700 ~<konto>/.ssh` und
  `install -o <konto> -g <konto> -m 600 /dev/null ~<konto>/.ssh/authorized_keys`; dann N = 0.
- **Rückweg:** Sicherungsdatei löschen (`rm "$A".vor-inventur-<zeit>`).

### 3e. Eine Zeile anhängen (nie überschreiben)

```bash
printf '%s\n' 'command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty PUB-INV' >> "$A"
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
  Anzahl N + 1; `1`; unter den Optionen
  `command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty`; Besitz und Rechte wie in 3d.
- **Weiter nur wenn:** alles stimmt. Weicht F-INV ab (Einfügefehler): Rückweg 3e, dann 3e erneut.
- **Rückweg:** genau diese Zeile entfernen (siehe Abschnitt 6, Schritt 6a). Danach `ssh-keygen -lf "$A" | wc -l`
  = N.

---

## 4. Nachprüfung vom Arbeitsrechner

### 4a. Host-Schlüssel vor der ersten Verbindung

```bash
ssh-keygen -F <vps-adresse> -l
```

- **Erwartet:** ein Eintrag mit `SHA256:eLwAqtKJ9LZLW334tonIA61Fcl26EvKiOyVIHWClW44` (ED25519) aus 1e.
- **Weiter nur wenn:** der Eintrag stimmt. Kein Eintrag: Bei der ersten Verbindung (4b ohne `StrictHostKeyChecking=yes`,
  stattdessen `-o StrictHostKeyChecking=ask`) zeigt ssh den Fingerabdruck. Antworten Sie nur `yes`, wenn er gleich
  dem Wert aus 1e ist. Abweichung: STOPP, `no`.
- **Rückweg:** `ssh-keygen -R <vps-adresse>` (entfernt nur den known_hosts-Eintrag dieser Adresse).

### 4b. Inventur über den Forced Command

Mit Passphrase vorher: `ssh-add ~/.ssh/inventur_centric_ed25519`.

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 \
    -p <port> <konto>@<vps-adresse> inventur > inventur-roh.txt; echo "Rückgabe: $?"
head -n 12 inventur-roh.txt
```

- **Erwartet:** `Rückgabe: 0` (oder `1`, wenn einzelne Abschnitte scheitern; die Liste steht am Ende unter
  `=== Ende ===`); `=== Kopf ===`, die Prüfsumme des Skripts aus 3b in der Zeile `Skript:`.
- **Weiter nur wenn:** Rückgabe 0 oder 1 und die Abschnitte `=== V-1` bis `=== V-9` sind vorhanden.
  `Permission denied (publickey)`: 1b (`allowusers`), 3d (Rechte), 3e (Zeile) prüfen.
- **Rückweg:** `rm inventur-roh.txt`.

### 4c. Negativproben (Forced Command wirkt)

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 \
    -p <port> <konto>@<vps-adresse> id; echo "Rückgabe: $?"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i ~/.ssh/inventur_centric_ed25519 \
    -p <port> -N -L 13000:127.0.0.1:3000 <konto>@<vps-adresse>
```

- **Erwartet:** Probe 1: `abgewiesen: nur der Befehl "inventur" ist erlaubt`, `Rückgabe: 2`, keine Ausgabe von `id`.
  Probe 2: beim Aufruf von `http://127.0.0.1:13000/` meldet ssh `administratively prohibited` (mit Strg+C beenden).
- **Weiter nur wenn:** beide Proben verweigern. Läuft `id` oder die Weiterleitung: STOPP und sofort Widerruf (6a).
- **Variante B:** Probe 1 zeigt statt der Abweisung die Inventur (der Befehl wird ignoriert, 2.3). Das ist dort
  erwartet.
- **Rückweg:** keiner nötig.

---

## 5. V-1 bis V-9 ausführen und ablegen

1. Lauf wie 4b. Das Skript führt V-1 bis V-9 nach
   [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) aus, dazu R-1
   (Ressourcen) und R-2 (Mounts, Compose-Projektpfad).
2. Die Ausgabe ist maskiert (Adressen, E-Mail, Tokens, Schlüssel, `NAME=Wert`). Prüfen Sie sie trotzdem vor der
   Ablage:

   ```bash
   grep -nE 'AAAA[0-9A-Za-z+/]{16}|PRIVATE KEY|@[A-Za-z0-9-]+\.[A-Za-z]{2,}|[0-9]{1,3}(\.[0-9]{1,3}){3}' inventur-roh.txt
   ```

   **Erwartet:** keine Zeile außer `127.x`/`0.0.0.0`-Treffern. Jede andere Zeile: nicht ablegen, melden.
3. Ablage als `docs/acc45/vps-inventur-<JJJJ-MM-TT>.md` über einen eigenen PR. **Achtung:** Das Repository ist
   öffentlich. Siehe Entscheidungsfrage E-5.
4. Das Ergebnis (Zustand A/B/C, fehlende `.env`-Schlüssel, `zustand/`, Sicherungen, Datum, prüfende Person) halten Sie
   fest wie in §2.1 „Ergebnis festhalten“ beschrieben.

---

## 6. Widerruf

Widerrufen Sie den Zugang, wenn der Schlüssel oder der Arbeitsrechner verloren ist, wenn eine Negativprobe (4c)
fehlschlägt oder wenn die Inventur nicht mehr gebraucht wird.

### 6a. Zeile entfernen (Remotekonsole)

```bash
A=~<konto>/.ssh/authorized_keys
cp -p "$A" "$A.vor-widerruf-$(date -u +%Y%m%dT%H%M%SZ)"
sed -i '\#^command="/opt/apps/centric-dienstplanung/inventur.sh",restrict,no-pty ssh-ed25519 [A-Za-z0-9+/=]* inventur-centric$#d' "$A"
ssh-keygen -lf "$A"
grep -c 'inventur-centric' "$A"
```

- **Erwartet:** F-INV fehlt in der Liste; die übrigen Fingerabdrücke sind unverändert (Anzahl N); `0`.
- **Weiter nur wenn:** F-INV fehlt und alle anderen Fingerabdrücke sind noch da. Fehlt ein anderer: Sicherung
  zurückspielen (`cp -p "$A.vor-widerruf-<zeit>" "$A"`) und melden.

### 6b. Skript entfernen (optional)

```bash
rm /opt/apps/centric-dienstplanung/inventur.sh
```

### 6c. Schlüssel am Arbeitsrechner löschen

```bash
rm ~/.ssh/inventur_centric_ed25519 ~/.ssh/inventur_centric_ed25519.pub
```

### 6d. Nachweis

Lauf wie 4b. **Erwartet:** `Permission denied (publickey)`.

---

## Entscheidungsfragen an den Betreiber

| Nr | Frage | Empfehlung |
|---|---|---|
| E-1 | Variante A (Forced Command bei `<konto>`) oder B (eigenes Konto + sudo-Regel)? | A, außer 1a erzwingt B |
| E-2 | Inventur-Schlüssel mit Passphrase (Agent nötig) oder ohne? | mit Passphrase; ohne nur, wenn der Arbeitsrechner verschlüsselt ist — der Schlüssel kann dann ohnehin nur die maskierte Inventur lesen |
| E-3 | Zusätzlich `from="<feste Betreiber-Adresse>"` in die Zeile? | nur bei fester Adresse des Arbeitsplatzes |
| E-4 | Skript `root:root 0755` im Betriebsverzeichnis (A) — einverstanden? | ja |
| E-5 | Inventurausgabe im **öffentlichen** Repository ablegen (`docs/acc45/vps-inventur-<datum>.md`) oder nur eine Zusammenfassung (Zustand A/B/C, fehlende Schlüsselnamen, ja/nein-Werte)? | nur Zusammenfassung; die Rohausgabe zeigt Pfade, Dateilisten, Ports und Fingerabdrücke |

## Bezüge

- [PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md §2.1](PRODUKTIONSWEG-VORBEREITUNG-2026-11-20.md) — V-1 bis V-9
- [PROD-DIGEST-ABWEICHUNG.md](PROD-DIGEST-ABWEICHUNG.md) — Zustand A/B/C
- [DEPLOY-AUTOMATISIERUNG.md §2.5](../DEPLOY-AUTOMATISIERUNG.md) — Muster Forced Command, Deployment-Zugang
- [`deploy/inventur.sh`](../../deploy/inventur.sh), Prüfung `pruefungen/inventur-skript.test.js`
