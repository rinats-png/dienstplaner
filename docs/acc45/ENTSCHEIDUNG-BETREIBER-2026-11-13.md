# Betreiberentscheidungen 2026-11-13

Quelle: Betreiber, Chat vom 2026-11-13. Verbindlich und genehmigt. Drei Entscheidungen; Umsetzung und Nachweis siehe unten.
Es gilt weiter: kein Merge nach `main`, kein Produktions-Deployment ohne ausdrückliche Freigabe.

## 1. Entwicklungsabhängigkeiten für die Browser-Abnahme (WP-33)

`@playwright/test` und `axe-core` sind als `devDependencies` **genehmigt**. Bedingungen:
- stabile, feste Versionen (keine Bereiche);
- vor Aufnahme Prüfung von Lizenz, bekannten Schwachstellen und Lieferkette (Eintrag in `docs/acc45/DEPENDENCIES.md`);
- Einbindung in die bestehende CI;
- keine Prüfung abschwächen oder entfernen;
- vorhandene Infrastruktur wiederverwenden; bereits integrierte Teile von WP-33 nicht neu bauen
  (`werkzeug/sammelpruefung.mjs`, `pruefung:verdrahtung`, `pruefung:ci-abdeckung`, `docs/acc45/TESTINFRASTRUKTUR.md`).

Ziel: WP-33 fortsetzen und automatisierte Browser-Abnahme für WP-21, WP-40 und weitere Pakete ermöglichen.
Die offene Frage "neue devDependencies, Entscheidung Betreiber/Koordinator" in WP-33 ist damit **beantwortet**.
Die Entscheidung selbst installiert nichts; die Aufnahme erfolgt in einem eigenen PR mit vollständiger CI.
Hinweis: Die frühere Notiz nennt `@axe-core/playwright`; genehmigt ist `axe-core`. Soll das Playwright-Paket
`@axe-core/playwright` zusätzlich verwendet werden, ist das bei der Aufnahme als Abweichung zu benennen.

## 2. Historische Direkt-Merges als Integrationsnachweis

Integrationen auf `integration/release-v4` **ohne PR** dürfen als gültiger Integrationsnachweis anerkannt werden,
**nur wenn alle fünf Bedingungen belegt** sind:
- (a) der konkrete Commit liegt im maßgeblichen Integrationsbranch;
- (b) die Umsetzung ist nachweisbar vorhanden;
- (c) die einschlägigen Tests wurden erfolgreich ausgeführt;
- (d) ein erforderliches unabhängiges Review ist dokumentiert;
- (e) offene Abnahmekriterien bleiben offen.

Fehlende PR-Nummern werden **nicht erfunden**. Die SSOT darf nach erfolgreichem Abgleich berichtigt werden;
Teilumsetzungen werden **nicht pauschal** auf INTEGRATED gesetzt. Gilt nur für die historischen Direkt-Merges;
künftige Änderungen laufen weiter mit PR, voller CI, Reviews und Merge-Gates.
Ergebnis des Abgleichs: `DIREKTMERGE-ABGLEICH-2026-11-13.md`.

## 3. Mehrere Schichtmodelle je Person

**Genehmigt.** Rahmen:
- jedes Schichtmodell hat eine eindeutige Identität und einen Gültigkeitszeitraum;
- die Gültigkeit wird serverseitig geprüft;
- für jede konkrete Planung muss das anzuwendende Modell eindeutig bestimmbar sein;
- Überschneidungen und Widersprüche werden nie stillschweigend aufgelöst;
- abgeschlossene und historische Pläne dürfen sich nicht rückwirkend ändern;
- Änderungen der Zuordnung werden nachvollziehbar protokolliert;
- eine Migration darf Daten nicht stillschweigend verändern oder löschen;
- fehlt eine eindeutige Zuordnung, ist eine kontrollierte Klärung erforderlich.

Ziel: **IMP-6** entwickeln (Schreiben der Modelle in den Bestand), danach die abhängigen Importpakete (**IMP-7**) freigeben.
Die bisherige "Datenmodell-Entscheidung" in IMP-6 ist damit getroffen. Neue Produktentscheidungen mit großer Wirkung auf
Rechte, Abrechnung, Datenschutz oder historische Daten gehen gesondert an den Betreiber.

## Auswirkung auf die SSOT

| Paket | Wirkung |
|-------|---------|
| WP-33 | devDependency-Frage geklärt; Status unverändert IN_PROGRESS; nächster Schritt: Aufnahme in eigenem PR, dann e2e/axe-Suite |
| IMP-6 | Datenmodellentscheidung getroffen (Rahmen oben); Status unverändert IN_PROGRESS; Schreiben der Modelle jetzt zulässig |
| IMP-7 | von der IMP-6-Entscheidung abhängig; bleibt BLOCKED bis IMP-6 das Schreiben integriert hat; Review Opus bleibt Pflicht |
| Direkt-Merge-Pakete | siehe `DIREKTMERGE-ABGLEICH-2026-11-13.md` |
