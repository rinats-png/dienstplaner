# Handbuch: Leitung

Rolle `leitung`. Alle Rechte des Betriebs ([Übersicht](README.md)) — alles aus dem [Handbuch Planung](planung.md),
dazu:

| Aufgabe | Wo / Weg |
|---|---|
| Betriebsdaten, Einheiten, Standorte, Dienstarten | „Verwaltung“ → „Betrieb“, „Dienstarten“ |
| Zugänge ausgeben und Rollen vergeben; Zugänge zurückziehen (laufende Sitzungen enden mit) | Verwaltung |
| Standortprüfung beim Stempeln ein- oder ausschalten (Vorgabe aus) | Betriebseinstellungen |
| Jugendschutz-Einstellung „mehrschichtig“ (§ 14 Abs. 2 Nr. 2 JArbSchG) | Betriebseinstellungen |
| Kosten des Betriebs sehen (Preisgrundlage, nur lesend) | Kostenanzeige |
| Sicherung des Betriebs anlegen | Einstellungen → „Sicherung anlegen“, „Vorher sichern“ |
| Zu einer Sicherung zurückgehen | nur über die Schnittstelle `/api/sicherungen`, `/api/wiederherstellen` — keine Oberfläche im Integrationsstand ([RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md)) |
| Vollausgabe (ganzer Betrieb als Datei), Sicherungsschlüssel für die Vollausgabe außer Haus anlegen und widerrufen | „Datenmitnahme“ |
| Datenschutz-Anfragen betroffener Personen beantworten | „Datenschutz“ (eine Auskunft aus der Anwendung ist in Vorbereitung, WP-26) |

Mitteilungen über bestätigte Rechtsverstöße erzeugt der Server an die Leitung.

## Was Sie sehen — und was nicht

- Wie Planung den ganzen eigenen Betrieb, dazu die Preisgrundlage (Tarif, Preisgestaltung) zur Kostenanzeige.
- **Vollausgabe der Leitung:** eigener Betrieb nach Exportkatalog — ohne Notfallkontakt, Bank-, Steuer- und Lohnangaben.
  **Mit Sicherungsschlüssel** enthält sie diese zusätzlich (für die Sicherung außer Haus) — Schlüssel entsprechend
  verwahren.
- **Nicht:** übriger Vertrag und Rechnungen (Betreiber), andere Betriebe.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalten LT, VA-LT, VA-SK und Abschnitt 2.
