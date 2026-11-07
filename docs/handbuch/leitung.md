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
  Wird ihr Zugang oder Konto gesperrt, scheidet sie aus, wird sie herabgestuft, ändert sie ihr Passwort oder wird die
  Sicherheit ihres Kontos zurückgesetzt, endet der Schlüssel **dauerhaft** — auch eine spätere Entsperrung oder ein
  zurückgespielter früherer Stand bringt ihn nicht zurück. Automatische Sicherungen, die so einen Schlüssel benutzen,
  fallen dann aus: Das Skript bekommt „401 Sicherungsschlüssel widerrufen“ mit dem Grund (bei `curl -f` ein Fehlercode
  ungleich 0), und die Liste zeigt den Schlüssel unter „Widerrufene Schlüssel“. Lege dann einen neuen an und trage ihn in
  der Sicherung ein. Neue Schlüssel gelten standardmäßig **90 Tage**, höchstens ein Jahr (die längere Laufzeit wählst du
  ausdrücklich), und es gibt höchstens **fünf aktive Schlüssel** je Betrieb; beim sechsten musst du erst einen widerrufen.
  Es wird nichts automatisch gelöscht. Eine Leitung legt einen neuen Schlüssel an. Das Abmelden der Person beendet
  ihn nicht. In der Datenmitnahme steht beim Schlüssel, wer ihn angelegt hat; „verwaist“ heißt: er gilt nicht mehr.
  Spielt der Betreiber die Daten aus einer Sicherung zurück (vollständige Wiederherstellung), gelten **alle**
  früheren Sicherungsschlüssel nicht mehr (Grund „Daten wiederhergestellt“). Lege danach neue an und stelle die
  Sicherung kontrolliert um: neuen Schlüssel eintragen, einen Lauf prüfen, dann den alten Eintrag entfernen.
- **Nicht:** übriger Vertrag und Rechnungen (Betreiber), andere Betriebe.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalten LT, VA-LT, VA-SK und Abschnitt 2.
