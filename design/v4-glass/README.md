# CENTRIC · V4 Glass mit neuer C-Marke

**Status:** vom Auftraggeber als visuelle Zielrichtung freigegeben; technische Umsetzung in der produktiven App und Website steht noch aus. Dies ist ein **nicht-produktives Designpaket**. Die bisherige V3/Hallmark-Konzeptlinie wird **als Zielgestaltung durch V4 Glass abgelöst**; keine Bestandsfunktion wird hiermit geändert.

## Bestandteile

- `design/v4-glass/index.html` — selbstständige, responsive, interaktive Konzeptvorschau mit Beispieldaten (keine Backend-Anbindung).
- `design/v4-glass/assets/*` — C-Logo in hell/dunkel und Bildmarke.
- `design/v4-glass/DESIGNSYSTEM.md` — visuelle Tokens, Verhalten, Qualitätsanforderungen.
- `design/v4-glass/MIGRATION.md` — schrittweise, konfliktarme Integrationsreihenfolge und Abnahme.
- `neues-logo/*` — kanonische, durch Pfade definierte Logo-SVGs für Anwendung, Website und Marketing.

## Markenfestlegung

Die neue Bildmarke zeigt ein dunkles, abgerundetes Quadrat mit offenem weißem **C** und kleinem türkisfarbenem Punkt in der Öffnung. Die Wortmarke **CENTRIC** ist aus Inter-650 in Vektorpfade umgewandelt, damit sie in allen Browsern konsistent erscheint. Der Claim „Planung mit Überblick.“ bleibt eigenständiger Text und gehört **nicht** zum Logo. Im dunklen Umfeld erhält die Wortmarke eine helle Variante, die Bildmarke bleibt gleich.

Die bisherige Dreibalken-Bildmarke soll bei der späteren Freigabe konsequent und atomar ersetzt werden (inklusive PWA-Icons, Manifest, Favicons, Vorschau, Marketing-Templates). Bis zu dieser Freigabe bleibt sie bewusst im laufenden Produkt bestehen.

## Wichtig

Dies ist **keine** fertige App und kein Deploy. Insbesondere enthält die Designvorschau keine echte Authentifizierung, Rechtsprüfung, Terminplanung, Mandantentrennung, Anbieterintegration oder Speicherung. Die spätere Entwicklung darf keine gesicherten Prozesse, Datenverträge, Schutzmaßnahmen oder Funktionen überschreiben.

Die bestehenden WP-16 / WP-48.1 / WP-48.2 / Release-Arbeiten haben uneingeschränkt Vorrang. V4 erst nach stabilem Release in einem eigenen Feature-Branch umsetzen, testen und separat reviewen. Keine automatischen Merges, keine Produktionsänderung durch dieses Designpaket.
