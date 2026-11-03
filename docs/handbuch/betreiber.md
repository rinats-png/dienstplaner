# Handbuch: Betreiber

Rolle `betreiber` — der Anbieter von CENTRIC, nicht ein Betrieb. Anmeldung mit einem Betreibercode an der
Betreiberkonsole; Sitzung zwei Stunden ([Übersicht](README.md)). Den Dienst selbst betreiben: siehe
[BETRIEBSHANDBUCH.md](../BETRIEBSHANDBUCH.md).

## Was Sie tun können

| Aufgabe | Konsole |
|---|---|
| Mandanten (Betriebe) anlegen und kaufmännisch pflegen | „Mandanten“, „Neuer Mandant“ |
| Selbststarts und Demozugänge verwalten | „Selbststarts“, „Demozugänge“ |
| Rechnungen, Tarife, Preisrechner, Branchenpakete | „Rechnungen“, „Tarife“, „Rechner“, „Pakete“ |
| Adressänderungen der Anmeldeadressen beobachten (Kontoübernahmen erkennen) | „Adressänderungen“ |
| Zugänge raumweit zurückziehen; Datenräume anlegen und löschen | Konsole, `/api/zugaenge`, `/api/raum-loeschen` |
| Zwei-Faktor für den eigenen Betreibercode und für Verwalterschlüssel einrichten und abschalten | „Zwei-Faktor“ |

**Verwalterschlüssel** (`/einrichten`, für Skripte: Codes anlegen, Übersicht, Bindung) sind getrennt von der Konsole.
Ist für einen Verwalterschlüssel ein zweiter Faktor eingerichtet, gilt er für alle (Pflicht); Anlegen und Sperren von
Schlüsseln nur mit frischem Code. Optional macht `CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT=1` den zweiten Faktor auch für
Betreibercodes zur Pflicht (Einführungsreihenfolge: [wp32b-nachweis.md](../acc45/wp32b-nachweis.md) §4).

## Was Sie sehen — und was nicht

- **Je Betrieb nur das Kaufmännische** und ein Personengerüst für die Abrechnung: Rolle (auch im Verlauf), Status,
  Ein-/Austritt, Zugehörigkeit — **ohne Namen**, ohne Kontakt-, Gesundheits-, Lohn- oder Bankdaten, ohne Pläne, Zeiten,
  Abwesenheiten, Anträge, Nachrichten, Notrufe, Dienstbuch, Übergaben, Notizen.
- Adressänderungen des Betriebs als funktionale Ausnahme (alte und neue Anmeldeadresse; Maskierung ist offen).
- Schreiben nimmt der Server vom Betreiber nur für das Kaufmännische an.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalte BT und Fußnote 11.
