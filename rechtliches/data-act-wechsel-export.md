# Datenexport und Anbieterwechsel (Data Act)

**Status: ENTWURF — nicht veröffentlichen.** Revision R2, Stand 2026-11-07. Keine Rechtsberatung, kein Kanzleigutachten. Ob und in welchem Umfang Kapitel VI der Verordnung (EU) 2023/2854 (Wechsel zwischen Datenverarbeitungsdiensten) auf CENTRIC anwendbar ist, wurde **nicht** gegen die amtliche Fassung geprüft; es werden hier keine Fristen, Entgeltregeln oder Ausnahmen der Verordnung behauptet. [ZU_KLAEREN: Anwendbarkeit, Pflichtinhalte der Verträge, Wechselfristen, Entgelte, Ausnahmen]

## 1. Ist-Stand der Exportfunktionen (Quelltext)

| Funktion | Beschreibung | Wer darf | Quelle |
|---|---|---|---|
| Vollausgabe | Betriebsbestand als eine JSON-Datei (Fassung 2, Umfang „betrieb“); zwei Kataloge: „leitung“ (Lesesicht der Leitung ohne Zustellgeheimnisse) und „sicherung“ (zusätzlich Personaldaten wie Bank, Steuer, Sozialversicherung, Lohn, Notfallkontakt); technische Geheimnisse und Betreiberinterna sind ausgeschlossen. Ausdrücklich ein Datenexport, **kein Wiederherstellungsformat** | Leitung; Sicherungsschlüssel (nur Lesen, befristbar, widerrufbar); nicht Demo-Sitzungen | `server/funktionen/daten.mjs`, `server/lib/sicherungen.mjs` |
| Auskunft je Person | JSON-Datei mit dem Datensatz der Person (Art. 15, 20); Leitung auch für andere Personen im eigenen Betrieb | Person selbst; Leitung | `daten.mjs` (`/api/auskunft`) |
| Datenmitnahme | CSV-Tabellen (Personen und weitere Tabellen) aus der Oberfläche | Rolle mit Verwaltungsrecht | `src/lib/fachlogik.js` (`vollExport`, `tabelleCSV`), Ansicht Datenmitnahme |
| Monatsplan-CSV, Auswertung Betriebsrat (CSV) | Teilausgaben | je Rolle | `src/App.jsx` |
| Lohnausgabe | Monatsabschluss-Ausgabe (DATEV-nahe CSV) | Verwaltung | `src/lib/fachlogik.js` |
| Kalender-Feed | eigene Dienste einer Person als Abonnement | Person | `server/lib/kalenderfeed.mjs` |
| Sicherung außer Haus | verschlüsselter Bestand per restic (Betriebsvorgang, nicht Kundenfunktion) | Betreiber | `docs/BETRIEB-SICHERUNG.md` |

## 2. Lücken gegenüber einem geordneten Anbieterwechsel

- Kein veröffentlichtes Formatschema (Feldkatalog, Versionierung) für die JSON-Vollausgabe; kein Importwerkzeug für einen anderen Anbieter. [ZU_KLAEREN: ob Dokumentation des Formats geschuldet ist]
- Der Export ist nicht als Wiederherstellungs- oder Migrationsformat zugesagt; Zeit- und Änderungsprotokolle, Anhänge und Branchenmodule: Vollständigkeit der Vollausgabe je Modul nicht geprüft. [ZU_KLAEREN: Vollständigkeitsprüfung je Modul, besonders Zeiterfassung, Wachbuch, Branchenmodule]
- Kein dokumentierter Wechselprozess (Ankündigung, Übergangsphase, parallele Unterstützung, Löschbestätigung). [ZU_KLAEREN]
- Keine festgelegte Abrufzeit nach Vertragsende (Altbestand: 30 Tage, danach 60 Tage Löschung einschließlich Sicherungskopien) und kein Nachweis, dass die Löschung einschließlich Sicherungen technisch umgesetzt ist (`loeschkonzept.md`).
- Entgeltfragen für Wechsel und Export (falls solche erhoben werden sollen) sind nicht geregelt. [ZU_KLAEREN]
- Der Zugriff auf die Vollausgabe setzt ein Leitungs- oder Sicherungsschlüssel-Konto voraus; fällt der Kundenzugang weg, gibt es keinen dokumentierten Notweg. [ZU_KLAEREN]

## 3. Vertragliche Verknüpfung

- AGB § 5 Abs. 5 und § 11 verweisen auf zwingende Wechselrechte, ohne Fristen zu nennen.
- AVV § 11: Rückgabe oder Löschung nach Weisung; Fristen offen.
- Rechnungs- und Vertragsunterlagen des Anbieters sind getrennt zu behandeln.

## 4. Abnahmetests

- Vollständigkeit: Export eines Testbetriebs enthält alle Datenarten aller aktiven Module und lässt sich maschinell einlesen.
- Rollen: Leitung erhält den Katalog „leitung“, Sicherungsschlüssel den Katalog „sicherung“, Demo erhält nichts.
- Löschung nach Export und Ablauf der vereinbarten Frist, einschließlich Sicherungen.
- Kollision mit Aufbewahrungspflichten des Kunden wird vor Löschung gemeldet.
