# Kalender-Feeds: Widerruf (A25) — Entscheidung und Folgearbeit

Stand 2026-11-05. Entscheidung des Betreibers:

1. **Abmelden und Passwortwechsel widerrufen bestehende Kalender-Feeds vorerst nicht.** Das entspricht dem Entwurf in `server/lib/feedherkunft.mjs`: Ein Kalender kann sich nicht erneut anmelden; wer einen Verweis zurückziehen will, tut das einzeln.
2. **„Alle Kalender-Verweise widerrufen“** wird nach dem aktuellen Release-Kandidaten als gezielte Erweiterung umgesetzt (eigene Aktion, nicht automatisch an Abmelden oder Passwortwechsel gekoppelt).
3. **Altfeeds ohne Herkunft** (aus der Zeit vor WP-24) werden **nicht allein wegen eines Datums automatisch deaktiviert.** Zuerst wird ihr produktiver Bestand ausschließlich lesend ermittelt; danach wird über die Abschaltung entschieden.

## Offene Arbeit (nach dem Release-Kandidaten)

- Aktion „Alle Kalender-Verweise widerrufen“ (Person und Leitung): Umfang, Berechtigung, Bestätigung, Protokoll, Tests.
- Lesende Zählung der Altfeeds im Produktionsbestand (Anzahl je Betrieb, Alter; keine Geheimnisse, keine Änderung).
- Entscheidung über die Abschaltung der Altfeeds auf Grundlage dieser Zählung.
