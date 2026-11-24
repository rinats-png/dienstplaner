# website/ - Quelle der oeffentlichen CENTRIC-Website

Stand: 2026-11-24 (Paket W1, Quelle sichern). Dies ist die Quelle der Seite
`https://centric-dienstplanung.de` (V3-Gestaltung), uebernommen unveraendert aus
dem bisherigen lokalen Ordner `centric-website` (Commit bd7d155 vom 2026-09-24,
ohne Remote). Die Anwendung unter `https://app.centric-dienstplanung.de` ist
getrennt und liegt in `src/` und `server/`.

Dieser Ordner aendert die Live-Seite nicht. Es gibt hier keine Auslieferung.

## Inhalt

| Pfad | Zweck |
|---|---|
| `build.py` | Generator: Seiten, Preise, CSS, JS, WebGL-Halle in einer Datei (nur Python-Standardbibliothek) |
| `assets/fonts/` | Jura, Instrument Sans, Geist Mono (OFL, mit Lizenztexten) |
| `assets/vendor/` | Drei.js r143 (MIT, mit Lizenztext) |
| `DIST-SHA256` | SHA-256 jeder erzeugten Datei (32 Dateien, Pfade relativ zu `dist/`) |
| `README-QUELLE.md` | Original-README der Quelle (Gestaltung, Seiten, Preise), nur LF-Zeilenenden angepasst |

Das Bauergebnis (`dist/`) ist ein Artefakt und liegt nicht im Repo. Die
Pruefsummenliste ersetzt es.

## Bauen

```bash
python build.py                      # schreibt nach website/dist/ (steht in .gitignore)
CENTRIC_OUT=/pfad/ausgabe python build.py   # anderes Ziel, ausserhalb des Repos
```

Python 3, keine weiteren Pakete, kein Netzzugriff. Der Bau ist deterministisch:
feste Daten, LF-Zeilenenden, keine Uhrzeit, keine Zufallswerte. Zwei Bauten
ergeben dieselben Bytes. Zwei Umgebungsvariablen setzen die einzigen absoluten
Adressen (`CENTRIC_APP`, `CENTRIC_WEBSITE`); ohne sie gelten die Live-Adressen.
Die Pruefung unten loescht beide Variablen vor dem Bau.

Schriften, Drei.js und Lizenztexte werden byte-genau kopiert. Deshalb steht in
`website/.gitattributes` fuer `assets/**` die Einstellung `-text`: kein
Zeilenenden-Umbau, auch nicht durch `core.autocrlf`. Die Lizenztexte tragen
CRLF und muessen es behalten.

## Pruefsummen

`DIST-SHA256` hat das Format `<sha256>  <pfad>` (zwei Leerzeichen, sortiert).
Es wurde am 2026-11-24 aus dem Bau dieser Quelle erzeugt. Es ist byte-gleich zu:

- dem bisherigen lokalen `dist/` (32 von 32 Dateien),
- dem Archiv `centric-website-dist.tgz` auf `origin/website/dist` (32 von 32 Dateien),
- der Live-Auslieferung (15 von 15 stichprobenartig gepruefte oeffentliche Dateien).

Die Archiv-Summe `69f51e70...84c8` (`SHA256SUMS` auf `website/dist`) gilt fuer das
tgz als Ganzes. Der tar-Container ist nicht Teil dieser Liste.

Pruefung im Repo: `pruefungen/website-quelle.test.js` (Teil von
`npm run pruefung:wcag-wp40`). Der Test baut zweimal in Temp-Ordner, vergleicht
jede Datei mit `DIST-SHA256` und stellt sicher, dass nichts im Repo-Baum entsteht.
Ohne Python 3 auf dem Rechner laeuft der Bau-Teil als `skip`; Umgebungsvariable
`WEBSITE_PYTHON` nennt dann den Interpreter.

Eine bewusste Aenderung an `build.py` oder an `assets/` aendert die Bytes. Dann
erzeugt man `DIST-SHA256` neu und nennt den Grund im PR:

```bash
CENTRIC_OUT=/tmp/web python website/build.py
(cd /tmp/web && find . -type f | LC_ALL=C sort | xargs sha256sum | sed -E 's#^([0-9a-f]{64}) [ *]\./#\1  #') > website/DIST-SHA256
```

## Auslieferung

Nicht Teil dieses Pakets. Der Weg liegt auf den Zweigen
`origin/deploy/hauptwebsite-auflagen` und `origin/deploy/hauptwebsite-docker`
(`deploy/website/*`, `docs/DEPLOY-HAUPTWEBSITE.md`), noch nicht in
`integration/release-v4` und nicht in `main`. Auslieferung nach Produktion ist
eine Freigabe-Kategorie und braucht den Betreiber.

## Offen (nicht in W1)

- Preise und Pakete: die Zahlen in `build.py` sind eine zweite Fassung neben
  `src/stufen.js`. Die Website nennt alle vier Paketpreise; die App bewirbt nach
  G9 nur Paketzustand 5. Entscheidung des Betreibers noetig (W4).
- V4-Gestaltung (Logo, Tokens, hell/dunkel): SSOT-Paket V4-5.
- Pruefsatz (axe, 320 px, Links, Header): Paket W2.
