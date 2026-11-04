# V4 Glass — Integrationsauftrag und Freigabegates

## Reihenfolge

1. **Warten:** laufende Arbeitskette WP-16 → WP-48.1 / WP-48.2 → Release-Kandidat unverändert abschließen. V4 niemals in laufende Merge-Konflikte oder Releases hineinschieben.
2. Aktuellen Integrationsstand inventarisieren: alle Seiten, Unterseiten, Dialoge, leere/fehlerhafte/Ladezustände, Rollen, Berechtigungen, Mobil- und Offlinevarianten sowie öffentliche Website. Route-/Komponentenmatrix und Screenshots als Baseline festhalten.
3. Nach Stabilisierung separaten Branch anlegen und Markensystem, Tokens, UI-Grundbausteine und Theme-Switch implementieren. `design/v4-glass/index.html` ist visuelle Referenz, **nicht** produktiver Ersatz für `src/App.jsx`.
4. App und Betreiberkonsole modulweise migrieren. Logik, Tests, Rollen, Offline-Verhalten und bestehende Sicherheit unangetastet lassen; kleine reviewbare PRs bevorzugen.
5. Öffentliche Website separat umstellen, Copy/Produktversprechen/Preisangaben fachlich prüfen. Erst nach Approval auf live umstellen.
6. PWA- und Marketing-Branding auf C-Logo umstellen: Favicons, `public/icon.svg`, Apple Touch Icon, maskierbare Icons (Safe Areas), Manifest, Social Preview, Browser-Caching, Erklärfilm-/Werbevorlagen. Vorher Snapshot und Reverse-Migration.
7. Automatisierte und manuelle QA: vollständige CI, visuelle Regression Light/Dark, 320–1440 px, Android/PWA, Tastatur/Screenreader, Fokus, Kontrast, Reduced Motion/Transparency, Long-Text, leere/fehlerhafte/offline Daten, Rollenmatrix, Druck-/CSV-Exporte und kritische Bedienabläufe.
8. Freigabe: Staging/Demo vorlegen; erst nach technischer und fachlicher Prüfung sowie ausdrücklicher Freigabe deployen. Rollback bereitstellen. Alte V3-Gestaltungsartefakte erst entfernen, wenn ihre tatsächliche Verwendung eindeutig ermittelt ist.

## Keine stillschweigende Autorisierung

Der V4-Design-Branch darf ohne gesonderte Freigabe erstellt und geprüft werden. Er ist **keine** Autorisierung, produktive oder laufend integrierte Branches zu überschreiben, bestehende Daten zu verändern, WP-Gates zu lockern oder die Website live umzustellen.

## Abnahmekriterien

- Markenabgleich mit freigegebenem Videostandbild und SVG, ohne Dreibalken-Altlogo in neuen Screens.
- Für jeden tatsächlichen Bildschirm: sichtbarer Light- und Dark-Stand, Kontrast nachweisbar, Mobile-Screenshot ohne Überlauf.
- Vollständiger Funktionsvergleich zum letzten Release; keine geänderte Fachlogik allein durch V4.
- Dokumentierte Tests, Sicherheitsgates, Regressionsbefunde und Rollback.
- Eindeutige Trennung: Designfreigabe ist nicht Produktionsfreigabe.
