# Handbuch: Planung

Rolle `planer`. Rechte: alle außer Betriebsdaten verwalten (`org.edit`), Zugänge und Rollen vergeben
(`roles.assign`) und Kosten sehen (`billing.view`) ([Übersicht](README.md)).

## Was Sie tun können

| Aufgabe | Wo |
|---|---|
| Monatsplan aller Einheiten, Personaleinsatz, Jahresansicht, Bereitschaft, Sondereinsätze | „Planen“ |
| Schichtfolge bearbeiten, Dienstarten anlegen und ändern | „Schichtfolge“, „Dienstarten“ |
| Selbstplanungsrunden öffnen und übernehmen (mit Warndialog) | „Selbstplanung“ |
| Anträge aller Einheiten entscheiden, Abwesenheiten pflegen (auch für einen Tag aufheben) | „Anträge“ |
| Personal anlegen und bearbeiten: Qualifikationen, Nachweise, Kompetenzen, Einarbeitung, Beschäftigungsmodell | „Wer mitfährt“ |
| Prüfungen und Auswertungen: Prüfung, Untergrenzen, Lenkzeiten, Belastung, Planstand, Leistungsnachweis, Abrechnungsdaten | „Nachsehen“ |
| Betriebsprotokoll (im gelieferten Bestand enthalten) | — (Datenmitnahme und Vollausgabe sind der Leitung vorbehalten) |

**Warnen statt sperren:** Ein Befund der Stufe „Achtung“ lässt sich mit Bestätigung übergehen; das erzeugt einen
unveränderlichen Eintrag im Bestätigungsprotokoll (wer, wann, Grundart) und — bei einem Rechtsverstoß — eine
Mitteilung an die Leitung. Sperrende Befunde lassen sich nicht bestätigen; der Server prüft jede neue Einteilung
selbst nach und weist ab, was hart sperrt. Einige Regeln (Ruhezeit unter 11 h, Einschränkungen, Qualifikationen je
Gerät) prüft bisher nur die Oberfläche.

## Was Sie sehen — und was nicht

- Den ganzen eigenen Betrieb: Personendaten für den Plan, Kontakt (Telefon, Anschrift, E-Mail), Gesundheits- und
  Schutzmerkmale, Konten, Zeiten und Stempel (Ortsurteil ohne Koordinaten), Nachrichten, Notrufe, Dienstbuch,
  Übergaben, Notizen, Lohnarten.
- **Nicht:** Notfallkontakt, Bank-, Steuer-, Sozialversicherungs- und Lohnangaben, frühere Anmeldeadressen
  (nur Vollausgabe mit Sicherungsschlüssel), Preisgrundlage und Vertrag des Betriebs, andere Betriebe.

Einzelheiten: [RECHTEMATRIX.md](../../RECHTEMATRIX.md), Spalte PL.
