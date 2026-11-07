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
  verwahren. Ein Sicherungsschlüssel gilt nur, solange die Person, die ihn angelegt hat, Leitung dieses Betriebs ist:
  Wird ihr Zugang gesperrt, scheidet sie aus, wird sie herabgestuft oder ändert sie ihr Passwort, endet der Schlüssel
  mit der nächsten Anfrage, und zwar endgültig (auch eine spätere Entsperrung bringt ihn nicht zurück). „Endgültig“
  gilt ab dem Augenblick, in dem die Absage einmal festgestellt wurde: beim ersten Gebrauch des Schlüssels, beim Öffnen
  der Schlüsselliste, und beim Sperren eines Zugangscodes sofort. Wird ein gesperrtes Konto oder die Personalliste
  vorher wieder auf den alten Stand gebracht, ruht der Schlüssel nur und gilt wieder. Ein Skript sieht sonst nur
  „Nicht angemeldet“ (401). Eine Leitung legt einen neuen Schlüssel an. Das Abmelden der Person beendet
  ihn nicht. In der Datenmitnahme steht beim Schlüssel, wer ihn angelegt hat; „verwaist“ heißt: er gilt nicht mehr.
- **Nicht:** übriger Vertrag und Rechnungen (Betreiber), andere Betriebe.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalten LT, VA-LT, VA-SK und Abschnitt 2.
