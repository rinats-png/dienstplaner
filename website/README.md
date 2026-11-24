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
Stand W4 (2026-11-24): erzeugt aus dem Bau dieser Quelle nach der Umstellung der
Branchenpakete auf "In Vorbereitung" (siehe unten). Sieben Dateien haben sich gegenueber
dem Stand W1 geaendert: `index.html`, `branchen.html`, `preise.html`, `funktionen.html`,
`faq.html`, `ueber-uns.html` (Paketpreise, Paketschalter und "enthalten"-Aussagen entfernt,
"In Vorbereitung" ergaenzt) und `assets/style.css` (eine Zeile: Status im Branchenband
bricht unter den Text um). Alle anderen 25 Dateien sind unveraendert. Der Stand W1
(2026-11-24, vor W4) war byte-gleich zu:

- dem bisherigen lokalen `dist/` (32 von 32 Dateien),
- dem Archiv `centric-website-dist.tgz` auf `origin/website/dist` (32 von 32 Dateien),
- der Live-Auslieferung (15 von 15 stichprobenartig gepruefte oeffentliche Dateien).

Die Live-Seite (V3) ist die Referenz und bleibt bis zu einer Auslieferung unveraendert; die
sechs Seiten und `style.css` weichen seit W4 bewusst von ihr ab. Eine Auslieferung ist ein
eigener Freigabeschritt (Entscheidung P2-44).

Die Archiv-Summe `69f51e70...84c8` (`SHA256SUMS` auf `website/dist`) gilt fuer das
tgz als Ganzes. Der tar-Container ist nicht Teil dieser Liste.

Pruefung im Repo: `pruefungen/website-quelle.test.js` (Teil von
`npm run pruefung:smoke-tageswechsel`). Der Test baut zweimal in Temp-Ordner, vergleicht
jede Datei mit `DIST-SHA256` und stellt sicher, dass nichts im Repo-Baum entsteht.
Ohne Python 3 auf dem Rechner laeuft der Bau-Teil lokal als `skip`; Umgebungsvariable
`WEBSITE_PYTHON` nennt dann den Interpreter. In der CI (Umgebungsvariable `CI`
gesetzt) ist fehlendes Python ein Fehler, kein stilles Ueberspringen.

## Pruefsatz (Paket W2)

`e2e/website-pruefsatz.spec.mjs` (Projekt `website` in `playwright.config.mjs`, laeuft
in `npm run e2e`; lokal `npx playwright test --project=website`, `WEBSITE_PYTHON`
setzen). Er baut diese Quelle in einen Temp-Ordner, bedient ihn auf 127.0.0.1 und
prueft alle 15 Seiten bei 320, 390, 768 und 1280 px: kein Seitenscroll, keine
Konsolenfehler und keine fremden Anfragen, axe (WCAG 2.x A/AA, hell und dunkel),
interne Links, `mailto:`-Format, Pflichtseiten im Footer, Preise gegen
`src/stufen.js` und `src/standorte.js`.

Bestehende Verstoesse der V3-Seite stehen in `e2e/website-axe-ausnahmen.json`
(Grund "V3-Bestand", Behebung in W5); die ausgelieferten Bytes aendert der
Pruefsatz nicht. Neue Verstoesse oder mehr betroffene Knoten schlagen fehl. Die
Branchenpakete folgen seit W4 dem Paketzustand der Anwendung (siehe unten): kein Preis
und kein Schalter fuer ein Paket unter Zustand 5; der Test wird rot, sobald ein Paket
freigegeben wird und die Website nicht bewusst nachzieht.

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

## Branchenpakete: "In Vorbereitung" (Paket W4)

Betreiberentscheidung 2026-11-24 (P2-39, Option A): Nicht verfuegbare oder nicht
buchbare Module und Tarife sind als "In Vorbereitung" gekennzeichnet. In `build.py`
steht die Tabelle `PAKET_ZUSTAND` (Paket -> Zustand 1 bis 5, wie `paketZustand` in
`server/lib/paketstand.mjs`). Nur Zustand 5 zeigt einen Preis, einen Schalter im
Preisrechner und die Aussage "Zwei Branchenpakete enthalten". Alles andere, auch ein
Paket ohne Eintrag oder mit ungueltigem Wert, ist "In Vorbereitung - noch nicht
buchbar" (fail-closed). Preisrechner, Tabellen, Karten und Texte werden aus dieser
Tabelle erzeugt; die Zielpreise (`zielpreis`) werden nur ueber `paket_preis()` gedruckt.
Wird ein Paket in der Anwendung freigegeben (`PAKET_FREIGABEN`), aendert man bewusst
nur diese Tabelle; `pruefungen/website-quelle.test.js` (Block W4) und der
Pruefsatz W2 verlangen dann Preis und Schalter gleich dem Zielpreis der Anwendung.

## Offen

- Preise: die Tarifzahlen in `build.py` sind eine zweite Fassung neben
  `src/stufen.js` (App-seitig test-fixiert). Die Paketpreise erscheinen erst wieder,
  wenn ein Paket Zustand 5 hat.
- V4-Gestaltung (Logo, Tokens, hell/dunkel): SSOT-Paket V4-5.
- Kopfzeilen (Caddy-Site-Datei) und Auslieferung: Paket W3; der Pruefsatz W2 liegt in `e2e/website-pruefsatz.spec.mjs`.
