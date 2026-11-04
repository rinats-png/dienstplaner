# CENTRIC — freigegebene neue C-Marke

**Status:** Teil des freigegebenen V4-Glass-Designpakets. Bereit zur Integration nach Abschluss des laufenden Release-Auftrags; noch nicht live angewendet.

## SVG-Dateien

- `centric-logo.svg`: Dunkle Wortmarke und konstantes C-Icon für helle Oberflächen.
- `centric-logo-hell-auf-dunkel.svg`: Helle Wortmarke mit unverändertem C-Icon für dunkle Oberflächen.
- `centric-bildmarke.svg`: Quadratische C-Marke für PWA, Favicons und kompakte UI.
- `centric-wortmarke.svg`: Wortmarke in dunkler Farbe.
- `centric-wortmarke-hell.svg`: Wortmarke für dunkle Hintergründe.

Die Wortmarke ist als SVG-Pfad auf Basis der im Marketingprojekt vorhandenen Schrift **Inter 650** umgesetzt; sie braucht zur Anzeige keinen Schriftfont. Sie ist der vom Auftraggeber bestätigte Nachbau anhand des Videostandbilds, **nicht** eine extrahierte Originalvektordatei des Videogenerators.

**Markenfarben:** Quadrat und Wortmarke `#10222A`, weißes C `#FFFFFF`, türkisfarbener Punkt `#0B7C7C`. Helle Wortmarke `#F1F6F7`. Claim „Planung mit Überblick.“ ist eigenständiger Text und gehört nicht zur SVG-Marke.

Die vorhandene Dreibalken-Marke in `public/` und `src/marke.jsx` bleibt bis zur kontrollierten V4-Produktintegration unangetastet. Sie wird **erst dort** samt abgeleiteten Icons/Manifest, Brand Assets und Cache-Strategie ersetzt. Siehe `design/v4-glass/MIGRATION.md`.
