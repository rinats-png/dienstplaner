# Website bauen und auf den VPS bringen

Quelle: das Website-Repository (`build.py`, `assets/`). Gebaut wird auf dem Windows-Laptop des
Betreibers. Es wird nichts ausgeliefert, was nicht unter `dist/` liegt.

## 1. Bauen (Laptop, im Website-Ordner)

```powershell
python build.py
```

`dist/` ist danach vollstaendig: 15 HTML-Seiten, `robots.txt`, `sitemap.xml`, `assets/`
(CSS, JS, Schriften, three.min.js). Der Ordner ist **ohne Python lauffaehig**: reine statische
Dateien, keine Build-Schritte auf dem Server, keine externen Ressourcen. Python wird nur zum Bauen
gebraucht, nicht zum Ausliefern.

Kurzer Blick vorher (optional): `index.html`, `404.html` und `assets/` muessen da sein; das
Auslieferungsskript prueft das ohnehin und bricht sonst ab.

## 2. Packen und Pruefsumme (Laptop, PowerShell)

```powershell
tar -czf centric-website-dist.tgz -C dist .
Get-FileHash -Algorithm SHA256 centric-website-dist.tgz
```

Die Pruefsumme (64 Zeichen) notieren; sie dient dem Abgleich nach der Uebertragung.

## 3. Uebertragen (unter Betreiberkontrolle)

Mit dem eigenen SSH-Zugang des Betreibers; Benutzer, Host und Schluessel stehen nicht im Repository.
Nur das Archiv wird uebertragen; die Skripte holt der VPS aus dem oeffentlichen Repository
(siehe `docs/DEPLOY-HAUPTWEBSITE.md`, Schritt 2).

```powershell
scp centric-website-dist.tgz <benutzer>@<vps>:~/
```

## 4. Auf dem VPS entpacken und pruefen

```bash
echo "<pruefsumme>  centric-website-dist.tgz" | sha256sum -c -
mkdir -p ~/website-dist && tar -xzf centric-website-dist.tgz -C ~/website-dist
```

Weiter mit `docs/DEPLOY-HAUPTWEBSITE.md` (Vorpruefung, Ausliefern). Das Skript gibt ausserdem eine
Pruefsumme ueber alle Dateien des dist-Ordners aus (sha256 ueber die sortierte Liste der
Datei-Pruefsummen); sie steht im Protokoll des Laufs.
