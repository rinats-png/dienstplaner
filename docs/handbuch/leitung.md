# Handbuch: Leitung

Rolle `leitung`. Alle Rechte des Betriebs ([Übersicht](README.md)) — alles aus dem [Handbuch Planung](planung.md),
dazu:

| Aufgabe | Wo / Weg |
|---|---|
| Betriebsdaten, Einheiten, Standorte, Dienstarten | „Verwaltung“ → „Betrieb“, „Dienstarten“ |
| Zugänge ausgeben und Rollen vergeben; Zugänge zurückziehen (laufende Sitzungen enden mit) | Verwaltung |
| Standortprüfung beim Stempeln ein- oder ausschalten (Vorgabe aus); Prüfmodus „Hinweis“ oder „verpflichtend“ (nur mit Bestätigung zu Datenschutz und Mitbestimmung) | Betriebseinstellungen |
| Einsatzorte (Kunde, Baustelle) anlegen; je Dienstart festlegen, worauf sich die Standortprüfung bezieht: Standort der Einheit, Einsatzort oder Außendienst (kein fester Ort) | Betriebseinstellungen, Dienstarten |
| Jugendschutz-Einstellung „mehrschichtig“ (§ 14 Abs. 2 Nr. 2 JArbSchG) | Betriebseinstellungen |
| Kosten des Betriebs sehen (Preisgrundlage, nur lesend) | Kostenanzeige |
| Sicherung des Betriebs anlegen | Einstellungen → „Sicherung anlegen“, „Vorher sichern“ |
| Zu einer Sicherung zurückgehen (nur Leitung; die Kundenrolle sieht die Liste) | Einstellungen → „Sicherungen“ → „Zurückspielen“, mit Bestätigung. Es wird nur der eigene Betrieb zurückgesetzt; Stempel mit Korrekturen, Protokoll und Vertragsangaben bleiben, Plan, Personen und Einstellungen gehen auf den Stand der Sicherung zurück. Der jetzige Stand wird vorher gesichert. Was genau bleibt und was nicht, steht im Dialog und in der [RESTORE-ANLEITUNG.md](../RESTORE-ANLEITUNG.md). Bei „nicht vollständig lesbar“ (503) ist Zurückspielen nicht möglich — den Betreiber verständigen (Abschnitt 4a „Unlesbare Datei“) |
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
