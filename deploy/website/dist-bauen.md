# Website bauen und auf den VPS bringen

Quelle: das Website-Repository (`build.py`, `assets/`; liegt nur auf dem Laptop des Betreibers). Gebaut wird
auf dem Windows-Laptop. Es wird nichts ausgeliefert, was nicht unter `dist/` liegt.

## 1. Bauen (Laptop, im Website-Ordner)

```powershell
python build.py
```

`python build.py` laeuft **nur auf dem Laptop**. `dist/` ist danach vollstaendig: HTML-Seiten, `robots.txt`,
`sitemap.xml`, `assets/` (CSS, JS, Schriften, three.min.js). Der Ordner ist **ohne Python lauffaehig**: reine
statische Dateien, keine Build-Schritte und keine Python-Annahme auf dem Server, keine externen Ressourcen.
`index.html`, `404.html` und `assets/` muessen da sein; die Skripte pruefen das ohnehin.

## 2. Reproduzierbares Archiv (Laptop, Git-Bash oder WSL mit GNU tar)

Gleicher Inhalt ergibt dieselbe Pruefsumme: sortierte Namen, fester Zeitstempel, Eigentuemer 0, kein Name/Zeitstempel im gzip.

```bash
cd dist
tar --sort=name --mtime='2026-11-04 00:00:00' --owner=0 --group=0 --numeric-owner -cf - . | gzip -n -9 > ../centric-website-dist.tgz
cd ..
sha256sum centric-website-dist.tgz
```

(Der Zeitstempel ist ein fester Wert und darf bei jedem Bau gleich bleiben.) Referenzstand: 32 Dateien in 4 Verzeichnissen, 498032 Bytes,
sha256 `69f51e7031e0ea22bae9d542bbbd29904306cdb8b88409163fcfdb3cac6684c8`. Weicht die Summe bei unveraendertem `dist/`
ab, liegt es meist an einer anderen tar-/gzip-Version; die Summe, die ausgeliefert wird, ist immer die in `DIST-SHA256.txt`.

## 3. Pruefsumme und Quelle im Repository eintragen

- `deploy/website/DIST-SHA256.txt`: die neue Summe (eine Zeile, 64 Hexzeichen; Zeilen mit `#` sind Kommentar).
  Ohne passende Summe bricht `website-konsole.sh` ab, bevor etwas geaendert wird.
- `deploy/website/DIST-QUELLE.txt`: **optional** die Download-URL (nur `https://`, eine Zeile, ohne Anfuehrungszeichen und
  ohne Sonderzeichen wie `;`, `$`, Leerzeichen). Erlaubt ist nur der Host `raw.githubusercontent.com` (Allowlist im Skript); aktuell Branch `website/dist`. Leer = kein Download; dann muss die Datei
  `/root/centric-website-dist.tgz` auf dem Server liegen (oder der Pfad wird als Argument uebergeben).
- Beide Dateien gehoeren in den Zweig `deploy/hauptwebsite-docker`; die Konsole holt sie mit `git clone`.
- Die Veroeffentlichung des Archivs (Download-Ort) entscheidet der Betreiber; das Repository ist oeffentlich, das
  Archiv enthaelt nur die oeffentliche Website, keine Zugangsdaten oder Personendaten.

## 4. Auf den VPS bringen

Normalfall (Remotekonsole, ohne scp): `docs/DEPLOY-HAUPTWEBSITE.md`, Ablauf A (zwei Befehle). Das Skript prueft
Summe und Archivinhalt selbst, entpackt in ein frisches Temp-Verzeichnis und verlangt `JA`.

Fallback mit SSH-Zugang (Benutzer, Host und Schluessel stehen nicht im Repository):

```powershell
scp centric-website-dist.tgz <benutzer>@<vps>:/root/
```

danach auf dem VPS `bash /root/cs/deploy/website/website-konsole.sh`, oder von Hand (Ablauf B im Doku-Dokument) mit
`sha256sum -c` und `tar -xzf`. Das Ausliefern-Skript gibt ausserdem eine Pruefsumme ueber alle Dateien des dist-Ordners
aus (sha256 ueber die sortierte Liste der Datei-Pruefsummen); sie steht im Protokoll des Laufs.
