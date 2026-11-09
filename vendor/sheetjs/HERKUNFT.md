# SheetJS Community Edition 0.20.3 (eingebunden)

- Herkunft: Herstellerdistribution https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz (nicht das npm-Paket `xlsx@0.18.5`, nicht aus npm).
- Bezogen am 2026-11-09, SHA-256 des Pakets und aller übernommenen Dateien: `PRUEFSUMMEN.txt`.
- Lizenz: Apache-2.0 (`LICENSE`, Urheber SheetJS LLC).
- Übernommen (unverändert, aus `package/`): `xlsx.mjs` (ES-Modul), `LICENSE`, `package.json`, `CHANGELOG.md`.
- Verwendung: nur Lesen, nur aus `server/lib/import/parser-kern.mjs`. Kein Laufzeit-Nachladen. Nicht Teil der Browser-App.
- Aktualisierung: neues Herstellerpaket laden, Dateien ersetzen, `PRUEFSUMMEN.txt` neu erzeugen, Advisories erneut prüfen, `docs/acc45/IMP-2-NACHWEIS.md` fortschreiben.
