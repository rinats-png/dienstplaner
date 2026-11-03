# WP-19 Branchenpakete — Module, Schnitt und Akzeptanzkriterien

Stand: 3. November 2026 · Branch `acc45/frontend/wp19-branchenpakete`

> **Alle Akzeptanzkriterien in diesem Dokument sind vorläufig bis zur Nutzerentscheidung.** Sie beschreiben,
> was ein Modul fachlich leisten soll, nicht, welche Grenzwerte gelten. Zahlen, Faktoren und Fristen werden erst
> mit der Entscheidung eingetragen; bis dahin ist jede Branchenregel `provisional` und erzeugt höchstens einen
> Hinweis. Kein Modul sperrt eine Einteilung.

## 1. Die zwölf Module

Verkauft über die Pakete in `src/stufen.js` (`PAKETE`). Die Merkmale `geofence`, `fachkraftquote`, `uebergabe`
und `sperreEigen` sind bereits gebaut und nicht Teil von WP-19.

| Modul | Paket | Bestand im Code (Ausgangspunkt) | Was fehlt |
|---|---|---|---|
| `posten` Objektbezogene Posten | Sicherheit | Dienstart mit `posten: true` und `quelle` (Vorlage, Besetzung je Posten, Dienstarten-Editor in `src/App.jsx`) | Objekt als eigener Datensatz mit Posten, Sollbesetzung und Anforderungen je Posten; Einteilung auf Posten statt nur auf Dienst |
| `wachbuch` Wachbuch | Sicherheit | Dienstbuch (Einträge Übergabe, Vorkommnis, Hinweis; Sicht der Schichtverantwortung auf die eigene Einheit) | Objektbezug, Uhrzeit, Kontrollgänge, Nachtrag statt Änderung, Aufbewahrung, Ausgabe |
| `objektbericht` Objektbericht | Sicherheit | Leistungsnachweis (Ansicht und Ausgabe je Betrieb) | Bericht je Objekt und Zeitraum für Auftraggeber: Soll/Ist je Posten, optional Wachbuchauszug |
| `bereichsplan` Bereichs- und Wachabteilungsplanung | Pflege | Einheiten mit Branchenbegriff (Wohnbereich, Wachabteilung), Therapieplanung je Einheit | Zuordnung der Personen eines Dienstes zu Bereichen (Tageseinsatzplan), Besetzung je Bereich |
| `pflegequal` Pflegequalifikationen | Pflege | Pflegekatalog in `server/lib/branchen.mjs` (Pflegefachkraft, Betreuungskraft § 43b, Pflegeassistenz), Fachkraftquote, PpUGV/PPP-RL-Rechner | Qualifikationsniveaus in der Besetzung; Betreuungskräfte in der Besetzung je Dienst |
| `bereitschaftsdienst` Bereitschaft mit Anrechnung | Klinik | Dienstformen Bereitschaft/Rufbereitschaft mit Faktor, Aufenthaltsbindung, Lohnarten; Rufbereitschaft ruhezeitneutral (WP-22) | Bereitschaftsstufen, Inanspruchnahme, Anrechnung auf Höchstarbeitszeit und Konto |
| `geteilterdienst` Geteilte Dienste | Klinik | Dienstform „geteilt", `zweiterAbschnitt`, Dauerberechnung | Bearbeitung, Prüfung je Abschnitt (Ruhezeit, Pausen, Besetzung), Stempeln je Abschnitt |
| `funktionsdienst` Funktionsdienste | Klinik | – (nur Freitext `funktion` an der Person) | Funktionsbereiche mit eigener Besetzung und Qualifikation |
| `rotation` Rotationen | Klinik | Zugehörigkeit einer Person über Zeiträume (`zugehoerigkeit`), Schichtmodelle | geplante Einsatzrotation zwischen Einheiten über Zeiträume |
| `anlagen` Anlagenbindung | Industrie | Betriebsmittel, Kompetenzen „Pflicht für Dienst", Einweisung je Gerät (Befund `kompetenz`) | Anlage als Einsatzort mit Mindestbesetzung und Laufzeitkalender |
| `maschinenqual` Maschinenqualifikationen | Industrie | Kompetenzen und Kompetenznachweise, Staplerschein/Gefahrstoffe im Katalog | Matrix Person × Anlage mit Ablauf und Unterweisung |
| `kontimodelle` Kontischichtmodelle | Industrie | Schichtmodelle mit `vollkonti`, Gruppen, Versatz (Vorlagen in `src/App.jsx`) | Assistent für Gruppen und Versatz, Jahresarbeitszeit und Freischichten |

## 2. Gemeinsamer Kern (gebaut in diesem Stand)

| Baustein | Datei | Vertrag |
|---|---|---|
| Modul-Registry | `server/lib/branchenmodule.mjs` (`BRANCHENMODULE`) | je Modul Kennung = Merkmal, Pakete (gegen `PAKETE` getestet), Status `geplant` / `vorlaeufig` / `freigegeben`, Abhängigkeiten, Parameter mit Typ und Vorgabe, Regelkennungen, Datenfelder |
| Aktivierung je Betrieb | `modulAktiv(m, id)` | gebucht (Paket, Vertrag) **und** nicht `geplant` **und** vom Betrieb eingeschaltet (Vorgabe: aus) **und** Abhängigkeiten aktiv |
| Moduleinstellungen | `einstellungen.branchenmodule[id] = { an, parameter }` | schreiben nur Rollen mit `org.edit`; feste Form; Wann/Wer vom Server (`branchenmoduleZusammen`, eingebunden in `server/lib/rechte.mjs`) |
| Katalog-Erweiterungspunkt | `server/lib/branchenkatalog.mjs` (`REGELN_BRANCHEN`, im Register Teil von `REGELN`) | `branchenregel()` erzwingt `provisional`, kein Regelstand, Deckel Hinweis; `pruefeBranchenkatalog()` |
| Befundform | `alsEinteilungsBefund(regel, ergebnis)` | Befund in der Form von `einteilungsBefunde`, Befundart `branche` (Hinweis, sperrt nie) |
| Testhilfe | `pruefungen/hilfen/branchenbetrieb.mjs` | Betrieb mit Paketen und Moduleinstellungen, Schreiben als Rolle über den Serverweg |
| Vertragstest | `pruefungen/branchenmodule.test.js` (`npm run pruefung:branchenmodule`) | Registry, Aktivierung, Rechte, Katalog, Befundform |

Noch nicht angedockt (nach dem Merge von WP-22): Befundart `branche` im Befundkatalog, Branchenbefunde in
`einteilungsBefunde`, Regelbaukasten auf dem Server. Bis dahin erzeugt kein Modul einen Befund.

### Regeln für jedes Modul

1. Fachregeln sind Einträge im Regelregister (`branchenregel()`), gerechnet von den Regelarten des Baukastens.
   Kein Modul bringt eine eigene Prüf- oder Stufenlogik mit.
2. Neue Daten eines Moduls brauchen vorher einen Eintrag im Positivkatalog (`server/lib/sicht.mjs`), eine Zeile in
   `RECHTEMATRIX.md` und Rechteprüfungen je Rolle.
3. Ein Modul wird erst `vorlaeufig` (einschaltbar), wenn seine Akzeptanzkriterien unten erfüllt sind; `freigegeben`
   erst nach Abnahme durch den Nutzer.
4. Je Modul ein Teil-PR mit eigener Prüfung `pruefungen/modul-<id>.test.js`, Oberfläche in `src/module/<id>.jsx`.
5. Ausschalten des Moduls oder Abbestellen des Pakets nimmt keine Daten weg; das Modul wirkt nur nicht mehr.

## 3. Akzeptanzkriterien je Modul (vorläufig bis Nutzerentscheidung)

Für jedes Modul gelten zusätzlich: Modul ist ohne gebuchtes Paket und ohne Einschalten unsichtbar und wirkungslos;
Rechte je Rolle sind geprüft (Unit und HTTP); Darstellung ohne Querscrollen bei 360 px; vorhandene Prüfungen
bleiben grün.

**posten**
- Die Leitung legt Objekte mit Posten an; je Posten Sollbesetzung je Wochentag und optional erforderliche Qualifikationen.
- Die Planung teilt Personen auf Posten ein; die Planprüfung zeigt unterbesetzte Posten und fehlende Qualifikationen als Hinweis.
- Bestehende Betriebe mit Posten-Dienstarten werden ohne Datenverlust übernommen.

**wachbuch**
- Wer im Dienst ist, trägt Vorkommnisse und Kontrollgänge mit Uhrzeit und Objekt ein.
- Ein gespeicherter Eintrag wird nicht geändert, sondern durch einen Nachtrag ergänzt; Verfasser und Zeit setzt der Server.
- Lesen nach Rolle wie festgelegt; Ausgabe je Objekt und Zeitraum.

**objektbericht**
- Für ein Objekt und einen Zeitraum entsteht ein Bericht mit Soll- und Ist-Besetzung je Posten.
- Was über Personen im Bericht steht, folgt der Nutzerentscheidung (Namen, Kürzel oder nur Zahlen).
- Der Bericht ist reproduzierbar (gleicher Zeitraum, gleiche Daten → gleiches Ergebnis).

**bereichsplan**
- Die Schichtleitung ordnet die Personen eines Dienstes Bereichen zu; je Bereich ist die Besetzung sichtbar.
- Unterbesetzte Bereiche erscheinen als Hinweis; der Plan bleibt speicherbar.

**pflegequal**
- Qualifikationen tragen ein Niveau; die Besetzung je Dienst zeigt die Verteilung nach Niveau.
- Betreuungskräfte werden in der Besetzung gesondert ausgewiesen und nicht als Pflegekräfte gezählt.

**bereitschaftsdienst**
- Bereitschaftsdienste tragen eine Stufe mit Anrechnungsfaktor; Inanspruchnahme wird erfasst.
- Die Anrechnung auf Arbeitszeit und Konto ist nachvollziehbar ausgewiesen; Grenzen der Höchstarbeitszeit erscheinen als Hinweis.

**geteilterdienst**
- Ein geteilter Dienst lässt sich mit zwei Abschnitten anlegen und einteilen.
- Dauer, Ruhezeit und Besetzung werden je Abschnitt richtig berechnet; Stempeln ist je Abschnitt möglich.

**funktionsdienst**
- Funktionsbereiche lassen sich anlegen und mit eigener Besetzung und Qualifikation planen.
- Die Planprüfung zeigt fehlende Besetzung oder Qualifikation im Funktionsbereich als Hinweis.

**rotation**
- Für eine Person lässt sich eine Folge von Einsätzen in Einheiten über Zeiträume planen.
- Zugehörigkeit und Plan folgen der Rotation ohne händisches Umbuchen; Überschneidungen werden gemeldet.

**anlagen**
- Anlagen werden als Einsatzort mit Mindestbesetzung und Laufzeiten geführt.
- Ruhende Anlagen erzeugen keinen Besetzungsbedarf; unterbesetzte laufende Anlagen erscheinen als Hinweis.

**maschinenqual**
- Eine Matrix zeigt je Person und Anlage Qualifikation, Ablauf und letzte Unterweisung.
- Einteilung an einer Anlage ohne gültige Qualifikation erscheint als Hinweis (bis zur Entscheidung über die Stufe).

**kontimodelle**
- Ein Assistent erzeugt aus Gruppenzahl, Dienstfolge und Versatz eine Schichtfolge und zeigt Wochenstunden und längste Serien.
- Abweichungen von der Jahresarbeitszeit werden ausgewiesen; der Ausgleich (Freischichten) folgt der Entscheidung.

## 4. Reihenfolge und Parallelität

- **Sofort umsetzbar** (keine offene Fachfrage im Kern des Moduls): `geteilterdienst`, `kontimodelle`, `anlagen`,
  danach `maschinenqual`; `posten` (Datenmodell).
- **Nach Entscheidung**: `wachbuch`, `objektbericht`, `bereitschaftsdienst`, `pflegequal`, `bereichsplan`,
  `funktionsdienst`, `rotation`.
- Höchstens drei Implementierungsstränge parallel: Sicherheit (`posten` → `wachbuch` → `objektbericht`),
  Klinik/Pflege (`geteilterdienst` → `bereitschaftsdienst` → `funktionsdienst`, `rotation`, `bereichsplan`,
  `pflegequal`), Industrie (`kontimodelle` → `anlagen` → `maschinenqual`).
