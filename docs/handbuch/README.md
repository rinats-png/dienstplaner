# Handbuch je Rolle

Stand 2026-11-03, Integrationsstand b84de34 (WP-41). Beschrieben ist, was der Integrationsstand tatsächlich tut —
abgeleitet aus dem Code (`src/App.jsx`: Rechte `MATRIX_STD`, Navigation `BEREICHE`; `server/lib/rechte.mjs`,
`server/lib/sicht.mjs`) und der [RECHTEMATRIX.md](../../RECHTEMATRIX.md). Die Anwendung enthält zusätzlich ein
eigenes Handbuch und eine Einführungstour (Ansicht „Handbuch“).

| Rolle | Kennung | Handbuch |
|---|---|---|
| Mitarbeitende | `mitarbeiter` | [mitarbeitende.md](mitarbeitende.md) |
| Schichtverantwortung (Anzeige je Betrieb anpassbar, z. B. Stationsleitung) | `subplaner` | [schichtverantwortung.md](schichtverantwortung.md) |
| Planung | `planer` | [planung.md](planung.md) |
| Leitung | `leitung` | [leitung.md](leitung.md) |
| Kunde / Inhaber (ältere Codes ohne Rollenangabe) | `kunde` | [kunde-inhaber.md](kunde-inhaber.md) |
| Betriebsrat | `betriebsrat` | [betriebsrat.md](betriebsrat.md) |
| Betreiber (Anbieter von CENTRIC) | `betreiber` | [betreiber.md](betreiber.md) |

**Anmelden:** mit dem Zugangscode, den der Betrieb ausgibt (oder als Konto mit E-Mail und Passwort, wenn der Betrieb
eine Mitgliedschaft eingerichtet hat). Eine Sitzung gilt zwölf Stunden, beim Betreiber zwei. „Auf diesem Gerät
merken“ nur auf eigenen Geräten.

**In Vorbereitung** (im Integrationsstand noch nicht vollständig; hier nicht als Funktion beschrieben):
weitere Fachprüfungen der Einteilung auf dem Server (WP-22), eine Auskunft nach Art. 15 DSGVO aus der Anwendung
(WP-26), ein vom Server gesetztes Datum für Stempel und Fristen (WP-17).

**Datenschutz allgemein:** Jede Rolle bekommt vom Server nur, was ihre Positivliste erlaubt; was eine Rolle nicht
sieht, kann sie auch nicht überschreiben (der Server füllt es beim Speichern aus dem gespeicherten Stand). Gesundheits-
und Schutzmerkmale sehen nur Planung und Leitung; Bank-, Steuer- und Lohnangaben sowie der Notfallkontakt fremder
Personen stehen nur in der Vollausgabe mit Sicherungsschlüssel.
