# Rechtematrix — Lesesicht und Verwaltungswege

Stand: Abschluss des Blocks 1e (Commits 1e.1, 1e.2, 1e.2a, 1e.3, 1e.4a, 1e.4b, 1e.4), Commit 3 (Kalender) und
Commit 4 (Versand und Zustellung auf dem Server) und C-Block C1–C3 (Bereichsbezug: Ausschreibungen,
Dienstbuch, Übergaben, Tagesnotizen).
Regressionstest: `pruefungen/rechtematrix.test.js` — jede Zeile der Tabelle unten ist dort ein Marker
mit Erwartung je Rolle und Lesepfad. Dazu liest `pruefungen/rechtematrix-zeilen.test.js` (WP-43) die Tabelle
in Abschnitt 1 aus dieser Datei und prüft jede Zelle gegen die Antwort des Servers — eine Zeile oder ein
Zellenwortlaut ohne Prüfung macht ihn rot. **Matrix und Test werden zusammen geändert.**

Einordnung je Zeile:

- **A** sauber
- **B** bewusst offen bis zu einem eigenen Schritt (siehe Fußnote; die Punkte „bis Commit 4" sind erledigt)
- **C** bewusst offen, bis die Sammlung einen Bereichsbezug (`einheitId`/`bereichId`) hat — seit Commit C3 keine mehr
- **S** dokumentierte technische/datenschutzrechtliche Schuld
- **D** neuer Befund — derzeit keiner (`session` oben: D1a/D1b; `session` am Betrieb: D1c)

## 1. Was über `GET /api/bestand` (und die 409-Antwort von `PUT`) hinausgeht

Beide Antworten laufen über `bestandFuerRolle` (`server/lib/rechte.mjs`). Kataloge in
`server/lib/sicht.mjs`, alle als Positivliste: Beschäftigte und Betriebsrat (`BETRIEB`, `EIGENE_PERSON`,
`FREMD_MITARBEITER`), Schichtverantwortung (`SCHICHT`, gestuft nach eigen / Bereich / Springer-Pool /
fremd), Planung und Leitung samt Kundenrolle (`VOLL_BETRIEB`, `VOLL_PERSON`). Der Betreiber bekommt seit
Commit D1 ebenfalls eine Positivliste (`BETREIBER_*`, Fußnote ¹¹).

Die Spalten beziehen sich auf eine **fremde Person aus einem anderen Bereich** (für die
Schichtverantwortung also außerhalb ihres Bereichs). Die eigene Person bekommen Planung, Leitung und
Kundenrolle vollständig; Beschäftigte, Betriebsrat und Schichtverantwortung den Katalog `EIGENE_PERSON`
(Plan, Konten, Nachweise, Kontakt- und Notfallangaben, Einstellungen — ohne die Notiz der Leitung, die
frühere Anmeldeadresse, Rohfelder der Schutzmerkmale und Bank-, Steuer- und Lohnangaben).

Spalten: **MA** Beschäftigte · **BR** Betriebsrat · **SV** Schichtverantwortung · **PL** Planung ·
**LT** Leitung (ebenso Kundenrolle) · **BT** Betreiber · **VA-LT** Vollausgabe der Leitung ·
**VA-SK** Vollausgabe mit Sicherungsschlüssel. ✓ = wird ausgeliefert, – = nicht.

| Datenklasse | MA | BR | SV | PL | LT | BT | VA-LT | VA-SK | |
|---|---|---|---|---|---|---|---|---|---|
| Personendaten für den Plan (Name, Zugehörigkeit, Rolle, Qualifikationen …) | ✓ | ✓ | ✓ | ✓ | ✓ | – ¹¹ | ✓ | ✓ | A |
| Personengerüst für die Betreiberabrechnung (Rolle auch im Verlauf, Status, Ein-/Austritt, Zugehörigkeit) | ohne Rollenverlauf ¹⁶ | ohne Rollenverlauf ¹⁶ | ohne Rollenverlauf ¹⁶ | ✓ | ✓ | ✓ ¹¹ | ✓ | ✓ | A |
| Kontakt: Telefon, Anschrift | – | – | – ¹ | ✓ | ✓ | – | ✓ | ✓ | A |
| Kontakt: E-Mail (Kontaktangabe für Planung und Leitung) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Notfallkontakt | – | – | – | – | – | – | – | ✓ | A |
| Bank, Steuer, Sozialversicherung, Lohn/Gehalt | – | – | – | – | – | – | – | ✓ | A |
| frühere Anmeldeadresse | – | – | – | – | – | – | – | ✓ | A |
| Gesundheits-/Schutzmerkmale (fremder Bereich) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Gesundheits-/Schutzmerkmale (eigener Bereich der SV) | – | – | nur abgeleitete Einsatzregeln ¹⁰ | ✓ | ✓ | – | ✓ | ✓ | A |
| Qualifikationen | ✓ ² | ✓ ² | ✓ ² | ✓ | ✓ | – | ✓ | ✓ | A |
| Qualifikationsnachweise (`qualNachweise`: Datei, Status-Nachweise) | nur Qualifikation und Ablauf | nur Qualifikation und Ablauf | nur Qualifikation und Ablauf ²⁰ | ✓ | ✓ | – | ✓ | ✓ | A |
| Kompetenznachweise (`kompetenzNachweise`) | – | ✓ | – ¹⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Zuständigkeitsbereich, Verfügbarkeit, operative Einschränkungen (`bereich`, `verfuegbarkeit`, `einschraenkungen` ohne Wiedereingliederung) | – | – | – ¹⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Konten, Wünsche, Einarbeitung (`stundenuebertrag`, `urlaubsanspruch`, `urlaubsuebertrag`, `wunschfrei`, `einarbeitung`) | – | – | – ¹⁹ | ✓ | ✓ | – | ✓ | ✓ | A |
| Beschäftigungsmodell und Monatsstundengrenze (`beschaeftigungsmodell`, `stundenGrenzeMonat`) | – | – | – ²³ | ✓ | ✓ | – | ✓ | ✓ | A |
| Personalnummer (`personalnummer`, Lohnexport) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Zuschläge an der Person (`zuschlaege`) — fachliche Entscheidung offen (Lohnbestandteil?) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | B |
| Verwaltungsangaben zur Person (`nachweise`, `urlaubshinweis`, `neuerZugang`, `anonymSeit`) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Einstellungen der Anwendung an der Person (`weckzeit`, `benachrichtigung`, `thema`, `dichte`, `kontrastmodus`, `feldmodus`, `tour`, `einfuehrung`, `handbuch`, `startansicht`, `wenigerBewegung`) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Zeiterfassung (fremd; Grund) | – | – ¹⁴ | – ³ ¹⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Stempeldaten, Ortsurteil (seit Geo V1 `geoStart`/`geoEnde`: Status, gerundete Entfernung, Genauigkeit, Referenzstandort; nie Koordinaten) ²⁸ | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Einsatzorte (`einsatzorte`: Name, Koordinate, Umkreis; WP-20) ²⁸ | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Stempeldaten der eigenen Person (für die eigene Zeiterfassung) | ✓ | ✓ ¹⁴ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Abwesenheiten mit Anmerkung | „abwesend" (Urlaub/frei offen) | „abwesend" (Urlaub/frei offen) | „abwesend" (Urlaub/frei offen) ⁴ ¹⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Anträge (fremd) | nur offene Tauschgesuche | – | nur offene Tauschgesuche ⁵ ¹⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Nachrichten anderer | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Notrufe anderer | – | – | nur Bereich und an sie ¹⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Dienstbuch | – | – | nur eigene Einheit ⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Übergaben | – | – | nur eigene Einheit ⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Tagesnotizen (`notizen` „tag\|…") | – | – | nur eigene Einheit ⁹ | ✓ | ✓ | – | ✓ | ✓ | A |
| `tagesnotizen` (totes Feld, keine Ansicht) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Personennotizen (`notizen` „person\|…"; Notiz der Leitung `notiz` an der Person) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Ausschreibungen: Kopf (Tag, Dienst, Status, verantwortende Einheit) | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Ausschreibungen: Bewerbungen anderer | nur eigene | – | nur bei Ausschreibung der eigenen Einheit ⁷ | ✓ | ✓ | – | ✓ | ✓ | A |
| Selbstplanung: Einträge anderer samt `hinweise` | nur Tag und Dienst ²² | – | nur eigener Bereich am Tag ¹⁵ ²² | ✓ | ✓ | – | ✓ | ✓ | A |
| Selbstplanung: nicht übernommene Einträge (`nichtUebernommen`) und unbekannte Felder am Rundenkopf | nur eigene ²⁵ | – | nur eigener Bereich am Tag ²⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Bestätigungsprotokoll (`bestaetigungen`: bewusst bestätigte Abweichungen) | – | nur Zählwerte je Monat, Regel und Stufe ²¹ | nur eigener Bereich am Tag ²¹ | ✓ | ✓ | – | ✓ | ✓ | A |
| Bereiche an der Einheit (`einheiten[].bereiche`: Name, Soll je Dienstart; Branchenmodul Bereichsplan) | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Objekte und Posten (`objekte`: Name, Sollbesetzung, verlangte Qualifikationen; Branchenmodul Posten) — Sicht der Beschäftigten fachlich offen | nur eingeteilte Objekte | – | nur Objekte mit Einteilung im eigenen Bereich | ✓ | ✓ | – | ✓ | ✓ | B |
| Einteilung auf Posten (`postenPlan`; Branchenmodul Posten) | nur eigene ²⁷ | – | nur eigener Bereich am Tag | ✓ | ✓ | – | ✓ | ✓ | A |
| Zuordnung zu Bereichen (`bereichsPlan`; Branchenmodul Bereichsplan) | nur eigene ²⁷ | – | nur eigener Bereich am Tag | ✓ | ✓ | – | ✓ | ✓ | A |
| Branchenmodule: Schalter, Parameter, Zeitpunkte (`einstellungen.branchenmodule`: `an`, `parameter`, `geaendertAm`, `mitbestimmung.bestaetigtAm`) ²⁹ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Branchenmodule: wer geschaltet, bestätigt oder geprüft hat, Grundlage der Mitbestimmung, Modulprotokoll (`geaendertVon`, `mitbestimmung.grundlage`/`bestaetigtVon`, `regelwerte[].geprueftVon`/`geaendertVon`, `einstellungen.modulprotokoll`) ²⁹ | – | ✓ | – | ✓ | ✓ | – | ✓ | ✓ | B |
| Betriebliche Regelwerte (`einstellungen.regelwerte`: Wert, Quelle, Fundstelle, Fassung, Gültigkeit, Prüfstatus, Stufe, Prüf- und Änderungszeitpunkt) ²⁹ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Kalendergeheimnis, -verweis, -stand | – | – | – | – | – | – | – | – | A |
| Push-Schlüssel, Zustelleinstellungen | – | – | – | – | – | – | – | – | A |
| Adressänderungen im Betrieb | – | – | – | ✓ | ✓ | ✓ ¹¹ | ✓ | ✓ | B ⁶ |
| Lohnarten | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Betriebsprotokoll | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Billing: Preisgrundlage des eigenen Betriebs (`tarif`, `preisgestaltung`, `rabattGrund`; oben nur der eigene Tarifeintrag) — nur lesend, für die Kostenanzeige (B2) | – | – | – | – | ✓ | ✓ | – | – | A |
| Billing: übriger Vertrag, Rechnungsangaben, USt-ID | – | – | – | – | – | ✓ | – | – | A |
| Betreiberfelder: Raumkennung, Firmenstamm, Preisliste, Selbststarts | – | – | – | – | – | ✓ | – | – | A |
| Betriebsnotiz `notiz` (keine Oberfläche liest sie) | – | – | – | – | – | – ¹¹ | – | – | A |
| `session` ganz oben im Bestand — Legacy-Feld, kein Bestandsfeld mehr ¹² | – | – | – | – | – | – | – | – | A |
| `session` am Betrieb (`mandanten[].session`) — Legacy-Feld, kein Bestandsfeld mehr ¹³ | – | – | – | – | – | – | – | – | A |
| Rechnungen (eigener und anderer Betriebe) | – | – | – | – | – | ✓ | – | – | A |
| Betreiberprotokoll | – | – | – | – | – | ✓ | – | – | A |
| andere Betriebe des Raums | – | – | – | – | – | ✓ (gekürzt ¹¹) | – | – | A |
| unbekannte neue Felder (Person, Betrieb, oben) | – | – | – | – | – | – | – | – | A |

¹ im eigenen Bereich und Springer-Pool ✓ (Telefon, Mobil). ² ohne Status-Qualifikationen (für die Schichtverantwortung
bei fremden Personen; im eigenen Bereich und Pool vollständig).
³ im eigenen Bereich Zeiten ohne Grund. ⁴ im eigenen Bereich Kategorie ohne Anmerkung — und nur die Kategorien von vor
Kette A (Urlaub, Krank, Schulung, Freistellung, Sonstiges, Freizeitausgleich; `ABWESENHEITSARTEN_SV`). Die neuen Arten
(Mutterschutz/Beschäftigungsverbot, Eltern-, Pflege-, Familienpflegezeit, Arbeitsverhinderung, Berufsschule u. a.)
sieht sie nur als „abwesend", auch in Hinweisen der Selbstplanung (Review WP-11, F1).
⁵ im eigenen Bereich vollständig (zum Entscheiden). ⁶ Die Oberfläche schreibt sie beim Ändern der eigenen
Anmeldeadresse fort; ein Umbau dieses Schreibwegs steht aus. ⁷ Commit C1: `einheitId` ist die verantwortende
Einheit (legt die Schichtverantwortung an, setzt der Server ihre eigene; Planung/Leitung auch `null` = betriebsweit).
Bei fremder Einheit, `null` oder Altbestand ohne `einheitId` sieht die Schichtverantwortung nur die eigene Bewerbung —
nicht die von Personen ihres Bereichs; der Springer-Pool zählt nicht als eigener Bereich. Schreiben: anlegen, vergeben
(nur an Personen des eigenen Bereichs) und zurückziehen nur bei der eigenen Einheit; sonst nur die eigene Bewerbung.
⁸ Commit C2: Einträge tragen `einheitId` (bekannte Einheit oder `null` = betriebsweit). Die Schichtverantwortung sieht
nur ihre eigene Einheit — nicht fremde, Pool, `null` oder Altbestand ohne `einheitId` (keine Ableitung). Sie hängt neue
Dienstbucheinträge und Übergaben der eigenen Einheit an (Einheit, Autor, Zeit setzt der Server) und ergänzt nur Übergaben
der eigenen Einheit. Eine Übergabe ist eindeutig je Tag, Dienstart und Einheit.
⁹ Commit C3: Jeder Eintrag in `notizen["tag|…"]` trägt `einheitId` (bekannte Einheit oder `null` = betriebsweit) und
`vonId`. Die Schichtverantwortung sieht nur Einträge ihrer eigenen Einheit — nicht fremde, Pool, `null` oder Altbestand
ohne `einheitId`; ohne gültigen eigenen Bereich keine. Sie hängt neue an (Einheit, Autor, Zeit setzt der Server) und
löscht nur selbst verfasste ihrer Einheit; Bestehendes ist unveränderlich. Die Rückfüllung führt Listen je Schlüssel
über die Kennung zusammen (verborgene Notizen desselben Tages bleiben).
¹⁰ Commit S1: Mutterschutz, Schwerbehinderung, Geburtsdatum, Vorsorgedatum und die Wiedereingliederung gehen an die
Schichtverantwortung (Bereich und Pool) nicht mehr hinaus. Stattdessen trägt die Person `planungsregeln` — Einsatzregeln
ohne Grund (Nacht, Tagesdauer, Wochenende, Sonntag, über 8 h, Wochenstundengrenze), mit Zeitraum, bei jedem Lesen aus dem
gespeicherten Datensatz abgeleitet und nie gespeichert. Befunde dazu sind neutral, ohne Diagnose und ohne Gesetz; fehlen
die Regeln, sperrt die Prüfung („Schutzprüfung nicht möglich"). Vorsorgehinweise sieht die Schichtverantwortung nicht.
Seit Commit S2 gilt dieselbe Schutzprüfung auch bei der Einteilung (Ersatzsuche, Vergabe, Vorschläge, Selbstplanung:
`hindernisse`): harte Regeln sperren, weiche sind Hinweise, ohne Einsatzregeln sperrt sie.

¹¹ Commit D1: Der Betreiber bekommt eine eigene Positivliste (`bestandSichtBetreiber` in `server/lib/sicht.mjs`) statt
des ganzen Raums: oben seine Felder (Firmenstamm, Preisliste, Rechnungen, Betreiberprotokoll, Pakete, Adressänderungen,
Selbststarts), je Betrieb das Kaufmännische, Einheiten `{id, name, standortId, pool}`, Standorte `{id, name}`,
Dienstarten `{id}`, den Zeitpunkt der letzten Änderung und je Person nur das Gerüst `{id, rolle, rolleSeit, rolleVerlauf,
status, eintritt, austritt, zugehoerigkeit}` — ohne Namen, Kontakt-, Gesundheits-, Lohn- oder Bankdaten, ohne Pläne, Zeiten,
Abwesenheiten, Anträge, Nachrichten, Notrufe, Dienstbuch, Übergaben, Notizen und ohne unbekannte Felder. Die Adressänderungen
des Betriebs bleiben als funktionale Ausnahme (die Konsole erkennt daran Kontoübernahmen), keine allgemeine
Personalberechtigung. Schreiben nimmt der Server vom Betreiber nur das Kaufmännische an.
Commit D1a: `session` immer `null`; die Betriebsnotiz `notiz` geht nicht hinaus; Adressänderungen nur als
`{personId, zeit, von, nach}`.
¹² Commit D1b: `session` ganz oben ist ein Legacy-Feld. Die Sitzung lebt im Browser und auf dem Server getrennt vom
Bestand. Lesen: `bestandFuerRolle` liefert jeder Rolle `session: null` (GET und 409-Antwort). Schreiben:
`zusammenfuehren` und — für jeden Schreibweg — `bestandSchreiben` setzen `session: null`; ein mitgeschickter Inhalt
wird verworfen, ein gespeicherter Altinhalt beim nächsten Schreiben bereinigt. Vorher konnte eine Rolle in Betrieb A
dort Daten ablegen, die Rollen in Betrieb B desselben Raums zurückbekamen.
¹⁴ Commit E1: Der Betriebsrat bekommt keine personenbezogenen Ist-Zeiten und Stempelereignisse mehr, Beschäftigte nur die
eigenen. Die Antwort trägt für beide `sichtIstDaten` (`{umfang: "eigene", person}` bzw. `{umfang: "keine"}`); die Oberfläche
zeigt dann „nicht verfügbar" statt die Planzeit als Ist-Zeit (`src/istdaten.js`). Eine aggregierte Auswertung für den
Betriebsrat ist ein eigenes Thema.
**Ausnahme (Commit 6bd706b, fachlich bestätigt am 2026-11-02):** Ein Betriebsratsmitglied im Schichtdienst stempelt die
eigene Arbeitszeit (`/api/stempeln` nimmt nur die eigene Person der Sitzung an) und bekommt dafür die **eigenen**
Stempelereignisse (`sicht.mjs`: `einstempeln` `NUR_EIGENE`, wie Beschäftigte) — sonst sähe es den eigenen offenen
Beginn nicht und bekäme erneut „Einstempeln" angeboten. Ausdrücklich **nicht** dazu gehören: fremde Stempelvorgänge,
personenbezogene Ist-Zeiten anderer, personenbezogene Ist-Auswertungen (auch die eigene Erfassung bleibt weg,
`sichtIstDaten` bleibt `{umfang: "keine"}`) und zusätzliche Verwaltungsrechte (Schreibumfang weiter „nein"; gestempelt
wird nur über `/api/stempeln`). Geprüft in `pruefungen/rechtematrix.test.js` (Zeilen „Stempel: eigener (Betriebsrat)",
„Zeiterfassung: eigene (Betriebsrat)"), `stempel-datenschutz.test.js`, `geo.test.js` und `oberflaeche-render.test.js`.
**Klarstellung WP-14b (N4):** Am eigenen Stempel hängen seit WP-06/WP-14 die Korrekturereignisse (`korrekturen[].vorher/
nachher`) und Korrekturanträge (`antraege[].ist`, `vorschlag`) — sie nennen Zeiten der **eigenen** Person. Der Betriebsrat
sieht sie für den eigenen Stempel wie Beschäftigte (er stellt und verfolgt seinen eigenen Antrag). Das ist keine Ist-Sicht
auf andere und keine Auswertung: `erfassung` bleibt weg, `sichtIstDaten` bleibt `{umfang: "keine"}`. Bewusst so belassen
(nur eigene Daten); Entfernen würde den eigenen Korrekturantrag für den Betriebsrat unbenutzbar machen.
¹³ Commit D1c: `mandanten[].session` hatte keinen Schreiber; die Oberfläche las daraus nur irrtümlich die eigene
Person (`bewirbDich`, `ziehBewerbungZurueck`, jetzt nur `sitz.person.id`). Planung und Leitung konnten dort
beliebige Daten ablegen, die alle Rollen des Betriebs — Beschäftigte und Betriebsrat eingeschlossen — und die
Vollausgabe zurückgaben. Jetzt: nie ausgeliefert (jede Rolle, Vollausgabe, 409, neue Sicherung), beim Schreiben
verworfen ohne Ablehnung der übrigen Änderung, Altinhalt beim nächsten Schreiben entfernt (auch im Drei-Wege-Abgleich
und bei der Wiederherstellung).
¹⁵ WP-43, tagesgenau: Zum eigenen Bereich (und Pool) der Schichtverantwortung gehört eine Person im Sichtfenster
(`SICHTFENSTER`, 60 Tage zurück, 90 voraus) — das gilt für die Person selbst (Personenliste, Telefon, Konten,
Einsatzregeln). Für Einträge, die an einem Tag hängen — Zeiterfassung, Fahrzeiten, Wünsche, Einsprünge, Notrufe,
Planänderungen (`aenderungen`), Selbstplanung, Sondereinsätze (ohne Tag nur die eigenen) —, zählt zusätzlich die Zugehörigkeit an genau diesem Tag
(`zugehoerigkeit[{einheitId, ab}]`); bei Zeiträumen (Abwesenheiten, Wünsche der Urlaubsrunde) an mindestens einem
Tag darin, bei Anträgen am ersten Tag (wie beim Entscheiden). Nach einer Versetzung sieht die Schichtverantwortung
des alten Bereichs die Tage im neuen Bereich also wie bei einer fremden Person. Tagesgenau schränkt nur ein: Was
das Sichtfenster verschließt, bleibt zu; ohne gültigen Tag gilt ein Eintrag als fremd. Ein Bereich „ALLE" ist kein
Bereich. Für versetzte Personen nennt die Antwort in `sichtIstDaten.zeitraeume` die Tage mit zugänglicher
Erfassung; an allen anderen Tagen und in Auswertungen, deren Zeitraum (Monat, Kontojahr, Jahr, Ausgleichszeitraum)
nicht ganz darin liegt, zeigt die Oberfläche „nicht verfügbar", nie die Planzeit (`src/istdaten.js`). Der Schreibweg der SV prüft dieselbe Zugehörigkeit am Tag und lehnt ohne gültigen
Tag ab (`einheitZusammen`). Geprüft in `pruefungen/sicht-tagesgenau.test.js` und `pruefungen/istdaten.test.js`.
¹⁸ WP-43: im eigenen Bereich und im Springer-Pool ✓ (`einschraenkungen` nur `keinAlleindienst`,
`maxDiensteWoche`; „keine Nacht“ seit der Nachprüfung 9717ddf nur als Einsatzregel `keinNachtdienst` mit Nachtfenster und Schwelle des Betriebs (948a4ba, A1 — dieselbe Bewertung wie Planung und Server), die Wiedereingliederung nur als Einsatzregel, ¹⁰).
¹⁹ WP-43: im eigenen Bereich ✓, im Springer-Pool nicht.
²⁰ WP-43: fremde Personen ohne Datei und ohne Status-Nachweise (²); im eigenen Bereich und Pool Qualifikation, Ablauf
und `vorhanden` (auch für Status-Nachweise, am Einsatz-Gate), nie die Datei.
²¹ WP-10 (Kette A, Warnen statt sperren): Wer eine Einteilung trotz Befund der Stufe „Achtung" oder „Rechtsverstoß"
vornimmt, hinterlässt einen Eintrag im Bestätigungsprotokoll (Person, Tag, Dienst, Stufe, Befunde, freiwilliger Grund,
wer bestätigt hat, Regelstand). **Lesen:** Beschäftigte nicht (es nennt fremde Personen und Gründe). Der Betriebsrat je
Regel und Tag ohne Namen (Muster-BV, Anlage 5): `personId` und `durchId` leer, statt des Namens nur die Rolle, kein
Freitext zum Grund (nur die Grundart — ein Freitext kann Namen tragen); Befunde aus individuellen Schutz- oder
Einsatzregeln nur als „individuelle Schutz- oder Einsatzregel betroffen", Befunde zu einer aufgehobenen Abwesenheit
nur als „abwesend" (wie Abwesenheiten anderer, ²⁴). Die Schichtverantwortung sieht Einträge zu
sich und zu Personen, die am Tag des Eintrags zu ihrem Bereich gehören (tagesgenau wie ¹⁵; Pool und fremd nicht).
**Schreiben:** nur anhängen, für jede schreibende Rolle gleich (`bestaetigungenZusammen` in `server/lib/rechte.mjs`):
Person des Betriebs, gültiger Tag, bekannte Dienstart, Stufe „achtung" oder „recht" (bei „recht" ausdrücklich gelesen),
bekannte Grundart oder keine. Wer (Name, Kennung, Rolle) und Zeit setzt der Server. Bestehende Einträge sind
unveränderlich; geändert oder weggelassen mitgeschickt bleibt der gespeicherte. Die Schichtverantwortung bestätigt nur
für sich und Personen ihres Bereichs am Tag; Beschäftigte und Betriebsrat schreiben das Protokoll nicht. Bei einem
bestätigten Rechtsverstoß erzeugt der Server die Mitteilung an die Leitung (`server/lib/bestaetigungen.mjs`, Kennung
`n-bestaetigung-…`, Zustellung nach dem Speichern) — nicht die Oberfläche. Geprüft in
`pruefungen/rechtematrix-zeilen.test.js`, `pruefungen/kette-a-rundreise.test.js` und `pruefungen/warnen.test.js`.
**Nach dem Review (M1, N1, H1) gilt abweichend davon:** Befunde werden nur als Kennung aus dem Befundkatalog
(`BEFUND_KATALOG`, `server/lib/bestaetigungen.mjs`) mit Stufe angenommen und gespeichert — kein Text, keine
Fundstelle vom Client; angezeigt wird der Text des Katalogs. Die **Stufe** bestimmt der Katalog, nicht der Client
(Nachprüfung N3). Ein sperrender Befund (Katalogspalte `sperrt`, dieselbe Tabelle wie `SPERR_REGELN` der Oberfläche)
lässt sich nicht bestätigen; der Server weist ab. In der strengen Variante sperrt jeder Befund der Stufe
„Rechtsverstoß" — ein bestätigter Rechtsverstoß entsteht derzeit nicht. Höchstens 50 neue Einträge je Speichern,
höchstens 200 je bestätigender Person und Tag, höchstens 5000 insgesamt — an der Gesamtgrenze werden **neue Einträge
abgewiesen, alte nie verdrängt** (Nachprüfung B1). Auslagern in ein Monatsarchiv und Löschen nach Frist (§ 16 Abs. 2
ArbZG: zwei Jahre) sind ein eigener, protokollierter Aufbewahrungslauf — offen. Die Mitteilung an die Leitung nimmt
den Text aus dem Katalog. Der **Betriebsrat** bekommt, weil ihm der Plan (`abweichungen`) vollständig vorliegt und
schon Tag, Dienst, Aktion, Rolle oder die Reihenfolge einzelner Einträge die Person wiederfinden ließen, **nur
Zählwerte** je Monat, Regel und Stufe (`{monat, regel, stufe, anzahl}`, Nachprüfung M1-Rest); unter der
Mindestgruppengröße 3 steht „<3". Keine Einträge, keine Kennungen, kein Name, kein Freitext; Schutz- und
Einschränkungsbefunde nur als `schutz`, Altbestand mit Text nie im Wortlaut (`sonstiges`). Fachlich offen: Reicht das
der Mitbestimmung, und welche Mindestgröße? Geprüft zusätzlich in `pruefungen/review-wp10.test.js`.
**Server-Durchsetzung (WP-11):** Der Server prüft jede neue oder geänderte Einteilung in `abweichungen` mit derselben
Schutzprüfung wie die Oberfläche (`schutzEinsatz`, `server/lib/schutzpruefung.mjs`, auf den gespeicherten Rohdaten —
für die Schichtverantwortung gleichwertig zu ihren Einsatzregeln) und weist ab, was hart sperrt, ebenso „nicht im
Bestand" (`server/lib/schutzdurchsetzung.mjs`); bestehende Einteilungen bleiben unberührt. Die Dienstart kommt aus
dem neuen Stand; eine unbekannte sperrt (fail-closed). Ändert eine Übermittlung Dienstzeiten, Schichtfolge (`zyklus`,
`anker`), Einheiten (Versatz) oder Zugehörigkeit, Springer oder Schichtdienst einer Person, rechnet der Server für
jede geschützte Person die nächsten 120 Tage vorher und nachher nach (Abweichung, sonst Schichtfolge) und weist ab,
wenn dadurch ein sperrender Befund **neu** entsteht (Review F2); ein schon bestehender blockiert nicht. Grenzen dieser
Nachrechnung: Teilzeit und Posten bleiben außer Acht (im Zweifel streng), Abwesenheiten zählen nicht als frei, Tage
jenseits von 120 prüft nur die Planprüfung der Oberfläche. Eine Bestätigung zu einer
solchen Einteilung weist er ab, auch wenn der Client nur warnende Befunde nennt. **Seit WP-22 überholt (Abschnitt 2):** Bis dahin nur in der Oberfläche
durchgesetzt waren: Ruhezeit unter 11 Stunden, keine Nacht / kein Alleindienst / Höchstzahl Dienste aus
`einschraenkungen`, gesetzliche Qualifikationen und Einweisungen je Gerät — sie brauchen die Planlogik (Rotation,
Besetzung, Nachtfenster des Betriebs) auf dem Server — jetzt `server/lib/fachpruefung.mjs`. Geprüft in `pruefungen/schutzpruefung-eine.test.js`.
**Nachprüfung WP-11:** Jugendliche ab 16 Jahren sperrt die Prüfung nur noch für 23–6 Uhr (auch Beginn vor 6 Uhr);
20–23 Uhr ist „Achtung" (bestätigungspflichtig) oder — mit der Betriebseinstellung `einstellungen.jugendschutz`
`{ mehrschichtig: true }` (§ 14 Abs. 2 Nr. 2 JArbSchG) — ein Hinweis. Die Einstellung schreiben Rollen mit
`org.edit` oder `pattern.edit` (Leitung, Kundenrolle, Planung — Nutzerentscheidung); für alle anderen bleibt der gespeicherte Wert, eine andere Form als
`{ mehrschichtig: boolean }` weist der Server ab, Zeitpunkt und Person (`geaendertAm`, `geaendertVon`) setzt er selbst
(`jugendschutzZusammen`, `server/lib/rechte.mjs`). Die Schichtverantwortung bekommt dafür die neutrale Einsatzregel
`nachtAb23NichtZulaessig` (vor dem 16. Geburtstag `nachtNichtZulaessig`). Eine Dienstart, die in der Schichtfolge
oder in einer Einteilung ab heute noch verwendet wird, lässt sich nicht löschen — für alle Personen gleich, die
Meldung nennt Person und Tag, kein Merkmal (N1). Eine neu angelegte Person, ein Ein- oder Austritt und ein Statuswechsel gelten als Strukturänderung: Der Server rechnet ihre Dienste aus der Schichtfolge nach (Review U1). Einwilligungen nach dem Mutterschutzgesetz an der Person (`mutterschutzEinwilligungen`, Nutzerentscheidung) lesen und schreiben wie die Schutzmerkmale nur Planung, Leitung und Kundenrolle, die eigene Person liest ihre eigenen; Form, `geaendertAm` und `geaendertVon` prüft bzw. setzt der Server (`einwilligungenZusammen`). Das Ende ist Pflicht; dass sich Einwilligungen geändert haben, steht ohne Inhalt im Betriebsprotokoll. Die Schichtverantwortung bekommt daraus nur Abschnitte ab heute, ohne vergangene Grenzen und unter Namen, die kein Merkmal nennen (`einsatzfensterBis22`, `sonntagFreigegeben`; Review M1). **Restrisiko (ehrlich):** Die Namen sind faktisch merkmalsspezifisch — nur der Mutterschutz erzeugt heute `einsatzfensterBis22` und `sonntagNurMitFreigabe`/`sonntagFreigegeben`; bei einer erwachsenen Person kann die Schichtverantwortung aus der Sonntagsregel oder dem Muster der Regeln auf einen Mutterschutz schließen. Das ist ein Punkt für die DSFA und die Betriebsvereinbarung (offen). Eine Änderung an Mutterschutz, Einwilligung oder Geburtsdatum wird **immer gespeichert** — die Erfassung des Schutzes blockiert nichts (Nachprüfung 9717ddf, M2). Der Server rechnet bestehende Einteilungen im Horizont nach (auch aus der Schichtfolge); widersprechen welche, bekommen Planung und Leitung eine dringende Mitteilung (Person, Tag, „Einteilung widerspricht Schutz- oder Einsatzregel der Person“), und die Planprüfung zeigt den sperrenden Befund, bis umgeplant ist. Neue widersprechende Einteilungen bleiben gesperrt (403). Offene Konflikte bleiben sichtbar, bis umgeplant ist: Pflichtaufgabe auf der Startseite von Planung und Leitung, Markierung der Zelle im Monatsplan; gerechnet wird die Schichtfolge ein Jahr voraus und jede künftige ausdrückliche Einteilung (948a4ba, A2). Werden Schutzangaben entfernt, steht das ohne Inhalt im Betriebsprotokoll und die Leitung bekommt eine Mitteilung ohne Person. Eine neue Einwilligung beginnt frühestens heute; bestehende Einteilungen vor ihrem Beginn werden nicht nachträglich zulässig. Geprüft in `pruefungen/nachpruefung-wp11.test.js`.
²² WP-10 d.3 (Kette A): Ein Eintrag in der Selbstplanung trägt seit „Warnen statt sperren" die Hinweise, die bei der
Eintragung gegen den Dienst sprachen (`hinweise`, z. B. „dieser Dienst ist bereits gedeckt") — die Person darf sich
trotzdem eintragen, die Planung entscheidet bei der Übernahme mit dem Warndialog und prüft dort neu. Beschäftigte sehen
von anderen nur Tag und Dienst, die Schichtverantwortung Einträge aus ihrem Bereich am Tag vollständig. Schreiben:
Beschäftigte und Schichtverantwortung nur die eigenen Einträge einer offenen Runde (`selbstplanungZusammen`); `hinweise`
nur als Liste von höchstens 12 Texten mit je höchstens 300 Zeichen, sonst fällt das Feld weg (die Eintragung bleibt).
²³ WP-10 d.2 (Kette A, Beschäftigungsmodelle): `beschaeftigungsmodell` (Minijob, Midijob, Werkstudent, kurzfristig …)
und `stundenGrenzeMonat` sind Vertragsangaben mit Lohnbezug (Entgeltgrenze). Die eigene Person sieht sie
(`EIGENE_PERSON`), ändern kann sie sie nicht (nicht in `SELBST_FELDER`); Planung, Leitung und Kundenrolle lesen und
schreiben sie (`VOLL_PERSON`), beide Vollausgaben enthalten sie. Die Schichtverantwortung bekommt sie — im Zweifel
restriktiv — auch im eigenen Bereich nicht; ob sie für die Einteilung eine neutrale Monatsgrenze braucht (wie die
Wochenstundengrenze in `planungsregeln`, ¹⁰), ist eine offene fachliche Frage. Beschäftigte und Betriebsrat sehen sie
bei fremden Personen nicht. Seit WP-11 pflegt die Oberfläche die Felder (Personalakte, nur mit `staff.edit`);
die Kataloge (WP-10 d.2) nehmen sie auf, Rundreisen in `pruefungen/kette-a-rundreise.test.js`.
²⁴ WP-10 d.5 (Kette A): **Abwesenheit für einen Tag aufheben.** Teilt der Warndialog eine Abwesenheit, um eine
Person an einem Tag einzuteilen (`abwesenheitTagAufheben`, `src/warnstufen.js`), ändert das einen bestehenden
Eintrag in `abwesenheiten` und legt für den Rest einen neuen an. Schreibumfang: Planung, Leitung und Kundenrolle
(wie jede Pflege von Abwesenheiten). Die Schichtverantwortung nicht — der Server lehnt Änderungen bestehender
Abwesenheiten über ihren Zugang ab (`einheitZusammen`, Fall `abwesenheiten`), der Warndialog bietet es ihr nicht
an. Beschäftigte nicht (nur neue eigene Krankmeldungen). Protokoll: der Eintrag im Bestätigungsprotokoll (Befund
„abwesend", Stufe Achtung, ²¹), die Planänderung (`aenderungen`) und die Mitteilung an die Person. Der Server
erzwingt den Protokolleintrag zu einer geteilten Abwesenheit bisher nicht (offen, WP-11).
²⁵ Review WP-10, K1 (Art. 9 DSGVO): Beim Übernehmen einer Runde hielt die Oberfläche bis dahin „nicht übernommen"
samt Wortlaut des Befunds fest („MuSchG § 5 …", „abwesend (Krank)"), und der Rundenkopf ging per `{...r}` an
Beschäftigte und Schichtverantwortung — auch aus fremden Bereichen. Jetzt: Der Grund ist eine Kennung
(`fehlt`, `schutz`, `abwesend`, `befund`, `auswahl`; `server/lib/selbstplanung.mjs`) — Schutz- und Einsatzregeln
heißen alle „Schutz- oder Einsatzregel", eine Abwesenheit nur „abwesend". Der Server nimmt `nichtUebernommen` nur als
`{personId, datum, dienstId, grund}` mit bekannter Kennung an (sonst `befund`). Gelesen wird der Rundenkopf für
Beschäftigte und Schichtverantwortung per Positivliste (`RUNDENKOPF`); `nichtUebernommen` Beschäftigte nur die eigenen,
die Schichtverantwortung nur eigene und Bereich am Tag (tagesgenau, ¹⁵), jeweils nur als Kennung — auch ältere,
noch als Text gespeicherte Gründe gehen nur als „befund" hinaus. Der Betriebsrat bekommt die Selbstplanung nicht.
²⁶ WP-26, Präzisierung, keine neue Leserecht-Spalte: **Auskunft nach Art. 15 DSGVO** (`GET /api/auskunft`,
`server/lib/auskunft.mjs`, eigene Bremse). Eine Person mit Personenbezug in der Sitzung bekommt *über sich selbst*
ihre gespeicherten Daten, auch Felder, die sie in `GET /api/bestand` nicht sieht (z. B. Notfallkontakt, Bank,
Steuer). Dazu kommen:
- eigene Stempel mit Ortsbefund, Ist-Zeiten, Plan, Abwesenheiten mit Anmerkung, eigene Anträge ganz;
- fremde Anträge, an denen sie als Tauschpartner beteiligt ist, nur im Gerüst (`id`, `typ`, `von`, `bis`, `status`,
  `personId`, `partnerId`; wie `sicht.mjs`);
- Planänderungen, Mitteilungen, die eigenen Einträge der Sammlungen, die `/api/bestand` ihr allein zeigt, Einträge im
  Betriebsprotokoll mit ihrer Kennung, das eigene Konto ohne Geheimnisse;
- ihre Protokollzeilen (nur desselben Betriebs: `mandantId`; ältere Zeilen ohne Betrieb nur in Räumen mit einem
  Betrieb) samt der Auskünfte, die die Leitung über sie erteilt hat;
- ob Push-Anmeldung und Kalenderverweis bestehen.

Zwei Einschränkungen der Selbstauskunft (WP-26): Zeilen „Auskunft durch die Leitung über mich“ gehen nur als
`{ zeit, art, rolle }` hinaus — ohne Herkunft und ohne Person der Leitung (N-2). Bestätigungen aus dem
Bestätigungsprotokoll (`bestaetigungen`, WP-10) **über** die Person kommen mit den Feldern des Eintrags, aber ohne die
bestätigende Person (`durch`, `durchId`) — nur deren Rolle (N-4). Bestätigungen, die die Person selbst für andere
abgab, und die Zählwerte des Betriebsrats sind nicht Teil der Auskunft.

Leitung und `kunde` bekommen *für eine Person des eigenen Betriebs* (`?person=`) genau ihre eigene Sicht
(`bestandFuerRolle`): **kein** Protokoll (das sieht sonst nur der Betreiber), **kein** Push-, Kalender- oder
Kontostatus. Andere Rollen bekommen eine Auskunft nur über die eigene Person, der Betreiber keine. Jede Auskunft steht
im Protokoll.
²⁸ WP-20, Präzisierung der Zeilen „Stempeldaten, Ortsurteil“ und „Einsatzorte“, keine neue Spalte: **Einsatzorte und Prüfmodus.** Eine Dienstart
kann einen eigenen Referenzort haben (`ortModus`: `standort` = Standort der Einheit, `einsatzort`, `aussendienst`). Der
Server entscheidet; die Koordinate des Geräts ist nur Eingabe und wird weder gespeichert noch zurückgegeben. Gespeichert
werden Status, Grund, Genauigkeit, Referenz (Art, Kennung, Name) und die **Abstandsklasse** (innerhalb, bis 1 km, bis 5 km,
darüber); die auf 50/100 m gerundete Entfernung nur am Standort der Einheit, bei Einsatzorten nie. **Einsatzorte** liegen in
`m.einsatzorte` (getrennt von Standorten, die Preis und Feiertage bestimmen); Koordinaten und Umkreis sehen nur Planung und
Leitung (`sicht.mjs`: für Beschäftigte, Betriebsrat und Schichtverantwortung `WEG`). Der **Prüfmodus**
(`einstellungen.geoModus`: `hinweis` = Vorgabe, `pflicht`) wirkt nur bei eingeschalteter Standortprüfung; schalten darf nur
`org.edit`, „pflicht“ nur mit der Bestätigung zu Datenschutz und **Mitbestimmung** (technischer Nachweis, keine
Einwilligung; Wann/Wer setzt der Server). „pflicht“ lehnt nie ab (E3): Ein Stempel mit nicht bestätigtem Ort bekommt die
Markierung `ORT_PRUEFEN` für die Klärung durch die Leitung; beim Außendienst gibt es keinen Ort, also keine Markierung.
Stempelergebnisse fremder Personen sehen weiter nur Leitung und Planung (`einstempeln` `NUR_EIGENE`, Schichtverantwortung
und Betriebsrat ohne Zugriff). **Aufbewahrung:** Standort-Ergebnisse (`geoStart/-Ende`, `ortStart/-Ende`, `innerhalb…`,
`geprueft…`) gehen mit der Frist der Gründe (`gruendeMonate`, Vorgabe 3 Monate) aus den Stempeln; Zeiten und Kennzeichen
bleiben bis zur Plandatenfrist (`aufbewahrung.mjs`). Geprüft in `pruefungen/geo-einsatzorte*.test.js`.
**Offenes Risiko (Review M1): Planung kann bestätigten Pflichtmodus über Dienstart-Zuordnung/Koordinaten aushebeln.** Dienstarten
und Einsatzorte pflegen Planung und Leitung (`pattern.edit`/`org.edit`); die Planung kann dadurch den Referenzort einer
Dienstart (`ortModus`, `einsatzortId`) oder Koordinate und Umkreis eines Einsatzorts ändern und so die Prüfung des
Pflichtmodus umgehen. Das Recht bleibt unverändert (Entscheidung der Leitung offen); die Änderung trägt Wann/Wer vom Server
(`ortGeaendertAm/-Von` an der Dienstart, `einsatzorteGeaendertAm/-Von` am Betrieb). Details: `docs/acc45/wp20-nachweis.md`.
²⁷ WP-23, Präzisierung der Zeile „Plan“ (Einteilungen, `abweichungen`), keine neue Spalte: **Entwürfe.** Ein Monatsplan
ist ein Entwurf, bis die Planung ihn freigibt (`freigaben[JJJJ-MM]`). **Beschäftigte** bekommen die Einteilungen
eines nicht freigegebenen Monats nach heute nicht (`planOhneEntwurf`, `server/lib/sicht.mjs`) — weder die eigenen noch die
anderer. Sichtbar sind die Einteilungen freigegebener Monate und jeder Tag bis einschließlich heute (Berliner Zeit):
Was heute oder früher liegt, ist in Kraft und kein Entwurf; „Mein Dienst heute“, das Einstempeln und die Ist-Ansichten
brauchen es. Ein Eintrag ohne gültigen Tag im Schlüssel geht nicht hinaus. Der **Betriebsrat** behält
den ganzen Plan: Die Mitbestimmung bei Beginn, Ende und Verteilung der Arbeitszeit setzt voraus, dass er den Entwurf
vor der Freigabe prüfen kann. Schichtverantwortung, Planung, Leitung und Kundenrolle planen selbst und sehen ihn.
Dasselbe gilt für `postenPlan` und `bereichsPlan` (Einteilungen „Person|Tag“) und die daraus abgeleiteten `objekte`: Für
Beschäftigte gehen nur die eigenen Einteilungen freigegebener Monate und vergangener Tage hinaus (`eigenOhneEntwurf`,
`objekteEigene` in `sicht.mjs`); sonst verriete ein Objekt oder ein Bereich die Entwurfsplanung. Die Zeile „Plan“
(`abweichungen`) ist für Beschäftigte VOLL und wird nur über diese Fußnote gefiltert; ihre Zellen in den Zeilen Posten und
Bereiche tragen deshalb den Verweis ²⁷.
**Übergangsregel und ihre Kehrseite:** Der Filter wirkt nur, solange der Betrieb die Pflicht eingeschaltet hat oder mindestens
einen Monat freigegeben hat. Deshalb bekommen neue Betriebe die Pflicht von Anfang an, und die Leitung
bekommt die Aufgabe „Planfreigabe aktivieren“, solange sie fehlt. **Freigaben zurücknehmen (WP-23b, M2):** Die Oberfläche
hat keine Rücknahme, die API erlaubte sie aber bisher: Wer `freigaben` leer, als Liste oder gar nicht schickte, nahm einem
Betrieb ohne Pflicht den Filter. Jetzt prüft der Server die Form (Objekt, neue Schlüssel `JJJJ-MM`, sonst abgewiesen),
erhält entfernte Freigaben für alle ohne `org.edit` stillschweigend (Planung, Beschäftigte, Schichtverantwortung) und
lässt den Filter einrasten: Nimmt die Leitung (`org.edit`) die letzte Freigabe zurück, setzt der Server
`planFreigabePflicht` auf true, Wann/Wer vom Server; die Rücknahme steht im Betriebsprotokoll („freigabe-zurueckgenommen“,
nur die Zahl). Ob ein Monat nach der Rücknahme für Beschäftigte, die ihn schon sahen, wieder Entwurf wird, ist fachlich
offen (siehe Nachweis). **Einstellungen weglassen (Delta-Review):** Fehlt `einstellungen` in der Übermittlung oder ist es kein
Objekt (null, Text, Zahl), gilt der gespeicherte Stand der Einstellungen (Pflicht samt Wann/Wer und alles Übrige); auch hier
schaltet die Planung den Schutz nicht ab, und bei der Leitung entfällt die Pflicht nicht ohne Wann/Wer.
**Bewusste Ausnahme (N1, offene Entscheidung):** Die eigene Vergabe einer Ausschreibung (`vergebenAn`/`vergebenZeit`) bleibt
für die betroffene Person auch an Entwurfstagen sichtbar (Sonde MK-VERGEBEN-EIGEN, `rechtematrix.test.js`). Das passt nicht
zum Wortlaut „weder eigenen noch fremden Entwurf“ oben; es ist nicht geändert, sondern wird fachlich entschieden.
**Weitere Sammlungen mit Datum (WP-23b):** `ausschreibungen` — „vergeben an/Zeit“ nur, wenn es die eigene Person war
(sonst null); `sondereinsaetze` — unter `zugeteilt` nur die eigene Person (ob Sondereinsätze der Planfreigabe unterliegen,
ist fachlich offen und nicht entschieden); `unterschreitungen` — Einträge der Entwurfstage fehlen für Beschäftigte
(freier Grund, kann Namen tragen); `einspruenge` und `selbstplanung` — nur die eigenen, bewusst auch an Entwurfstagen
(keine Planung, sondern Äußerung der Person); der Betriebsrat sieht `unterschreitungen` unverändert (Entscheidung zu
Betriebsrat/Schichtverantwortung offen).
Gespeichert wird nichts anders: Beschäftigte schreiben `abweichungen` nicht (`eigenesZusammen`).
**Wann der Filter wirkt (Übergang):** nur wenn der Betrieb die Freigabe benutzt (mindestens ein freigegebener Monat)
oder `einstellungen.planFreigabePflicht === true` (`server/lib/planfreigabe.mjs`, `planFreigabeAktiv`). Sonst sähen
Beschäftigte eines bestehenden Betriebs ohne Freigaben nach dem Ausrollen keinen Einsatz mehr. Den Schalter setzt nur
`org.edit` (Leitung, Kundenrolle); Form und Wann/Wer prüft und setzt der Server (`planFreigabeZusammen`,
`planFreigabePflichtGeaendertAm/Von`). Neue Betriebe (Selbststart, Erstbefüllung, Provisionierung, Testräume) starten
mit `true`. Solange der Filter bei einem bestehenden Betrieb aus ist, bekommt die Leitung die dringende Aufgabe
„Planfreigabe aktivieren“. Die abgeleitete Antwortmarke `sichtEntwuerfe` (nie gespeichert) sagt der Oberfläche, dass
der Filter wirkt; sie zeigt dann „noch nicht veröffentlicht“ statt eines aus der Schichtfolge gerechneten Dienstes.
**Bewusst nicht gefiltert — Selbstauskunft (Art. 15):** `auskunft.mjs` liefert die eigenen Abweichungen und den Plan der
nächsten 62 Tage auch aus Entwurfsmonaten. Es sind die eigenen Daten der Person, der Auskunftsanspruch ist nicht
auf freigegebene Stände beschränkt (Alternative im Nachweis `docs/acc45/wp23-nachweis.md`). **Offen:** Der
Kalender-Feed (`kalender.mjs`) hat keine Serversperre — der Client rechnet die Termine —, das ist ein Folgepunkt von
WP-24. Der Betriebsrat behält den ganzen Plan (fachlich offen, siehe Nachweis). Geprüft in
`pruefungen/entwuerfe.test.js` und `pruefungen/entwuerfe-oberflaeche.test.js`.
Jedes Feld aus `PERSONENFELDER` (`server/lib/sicht.mjs`) ist in `pruefungen/rechtematrix-zeilen.test.js` genau einer
Zeile zugeordnet; ein neues Feld ohne Zuordnung macht den Test rot. Ausgenommen sind nur die abgeleiteten Felder
`sichtbereich` und `planungsregeln` — sie entstehen in der Antwort und werden nie gespeichert.
¹⁶ WP-43, Präzisierung (vorher stand hier ✓, geprüft war schon immer –): Beschäftigte, Betriebsrat und
Schichtverantwortung bekommen von fremden Personen Rolle, Status, Ein-/Austritt und Zugehörigkeit (Katalog `PLAN`),
nicht aber `rolleSeit` und `rolleVerlauf`. Ob sie den Verlauf brauchen, ist offen; geöffnet wird er nicht ohne Entscheidung.

Ganz oben im Bestand bekommen alle Rollen außer dem Betreiber nur `version`, `stand`, `session` und
genau den eigenen Betrieb (A).

**Unbekannte Rolle (Commit D1d, A):** Die Spalten oben sind abschließend — `betreiber`, `leitung`, `planer`,
`subplaner`, `mitarbeiter`, `betriebsrat` und `kunde` (ältere Codes; ohne Rollenangabe gilt `kunde`).
Eine Sitzung mit einer anderen Rolle bekommt keinen Bestand: `bestandFuerRolle` und `zusammenfuehren` geben
`null`, jeder Endpunkt von `/api` außer `abmelden` antwortet 403. Bis dahin fiel sie auf den eigenen Betrieb im
Rohzustand durch. `/einrichten` nimmt nur diese Rollen an (sonst 400).
Commit D1e: Eine solche Sitzung entsteht nicht mehr — Anmeldung mit Code, Demozugang und Kontoanmeldung
(Mitgliedschaft) antworten 403 ohne Sitzung und ohne die Rolle zu nennen. Eine bestehende bekommt auch auf
`/kalender/*` und `/zustellung/*` 403 (ausgenommen das Abmelden des eigenen Geräts). Geprüft wird die
gespeicherte Rolle der Sitzung: Eine unbekannte Kontorolle wird nicht dadurch gültig, dass die gebundene Person
im Betrieb eine bekannte Rolle hat.

**Schreibweg dazu (A):** Was eine Rolle nicht sieht, kommt beim Speichern aus dem gespeicherten Stand
(Rückfüllung: `schichtRueckfuellen`, `vollRueckfuellen`); mitgeschickte verborgene Werte sind wirkungslos
oder werden abgewiesen. Betreiberfelder oben und im Betrieb schreibt nur der Betreiber (1e.2a).

**Branchenmodule (WP-19, A):** Welche Pakete gebucht sind (`pakete`), bleibt Vertragsfeld des Betreibers.
Innerhalb gebuchter Pakete schaltet der Betrieb die Module in `einstellungen.branchenmodule` — schreiben
dürfen nur Rollen mit `org.edit` (Leitung, Kundenrolle); für alle anderen bleibt der gespeicherte Stand.
Form `{ an: boolean, parameter?: {…} }` je bekanntem Modul, Parameter nach Typ und Grenzen der Registry;
Einschalten nur, wenn das Paket gebucht und das Modul nicht mehr „geplant" ist, Ausschalten immer; Wann und
Wer setzt der Server (`branchenmoduleZusammen`, `server/lib/branchenmodule.mjs`). Lesen wie die übrigen
Einstellungen. Daten, die ein Modul später anlegt, bekommen vorher je eine eigene Zeile in dieser Matrix.
Geprüft in `pruefungen/branchenmodule.test.js`.
- *Kontimodelle* (`server/lib/modul-kontimodelle.mjs`): keine neuen Daten. Der Assistent rechnet nur; was er
  übernimmt, schreibt die Oberfläche in die bestehenden Felder `zyklus`, `anker`, `einheiten` (wie bisher
  `pattern.edit`). Parameter `sollWochenstunden`, `stundenJeFreischicht` in `einstellungen.branchenmodule`.
  Geprüft in `pruefungen/modul-kontimodelle.test.js`.
- *Anlagen* (`server/lib/modul-anlagen.mjs`): keine neuen Betriebsfelder. Eine Anlage ist ein Eintrag in
  `betriebsmittel` mit `art: "anlage"` und den Feldern `mindestBesetzung`, `laufzeit`; Lesen und Schreiben wie
  Betriebsmittel (Positivkatalog `betriebsmittel` in `server/lib/sicht.mjs`: Beschäftigte und
  Schichtverantwortung sehen nicht ausgegebene Betriebsmittel, also auch Anlagen; Betriebsrat nicht). Der Server
  weist eine falsche Form ab (`anlagenZusammen`). Befunde nur als Hinweis und nur bei aktivem Modul.
  Geprüft in `pruefungen/modul-anlagen.test.js`.
- *Maschinenqualifikationen* (`server/lib/modul-maschinenqual.mjs`): keine neuen Betriebsfelder. Liest
  `kompetenzen` und `kompetenzNachweise` wie bisher (Positivkatalog unverändert: Beschäftigte nur eigene
  Zuweisung, Schichtverantwortung ohne fremde Kompetenznachweise ¹⁸); neues Feld `befaehigtePerson` (Ja/Nein) an
  der Kompetenz, Form vom Server geprüft (`maschinenqualZusammen`). Die Matrix Person × Anlage wird in der Oberfläche
  nur aus dem gerechnet, was die Rolle ohnehin ausgeliefert bekommt (vorgesehen für Planung und Leitung). Befunde nur als Hinweis und nur bei aktivem Modul
  (setzt aktives Modul „anlagen" voraus). Geprüft in `pruefungen/modul-maschinenqual.test.js`.
- *Geteilte Dienste* (`server/lib/modul-geteilterdienst.mjs`): keine neuen Betriebsfelder. Das Feld `zweiterAbschnitt` einer
  Dienstart gibt es im Bestand; Dienstarten ändern nur Rollen mit `org.edit` oder `pattern.edit` (WP-22). Der Server
  weist eine falsche Form des zweiten Abschnitts ab (`geteilterdienstZusammen`: Uhrzeiten, Lücke, höchstens 24 Stunden
  Spanne). Parameter `hoechstSpanneStunden` in `einstellungen.branchenmodule` (nur `org.edit`). Befunde nur als
  Hinweis, nur bei aktivem Modul; die Rechnung braucht nur die Dienstart und die Dienste der Nachbartage. Das Stempeln je Abschnitt ist
  rechnerisch vorbereitet (`istJeAbschnitt`), die Ablage zweier Stempelpaare je Tag noch nicht angebunden.
  Geprüft in `pruefungen/modul-geteilterdienst.test.js`.
- *Posten* (`server/lib/modul-posten.mjs`): zwei neue Betriebsfelder. `objekte` (Objekte mit Posten, Sollbesetzung
  und verlangten Qualifikationen; keine Personendaten) liefert der Server Planung und Leitung voll, Beschäftigten und der
  Schichtverantwortung nur mit Einteilung (eigene Einteilung bzw. Einteilung im eigenen Bereich am Tag), dem Betriebsrat
  nicht — **Nutzerentscheidung W3 offen**, bis dahin konservativ. `postenPlan`
  (Einteilung auf Posten, Schlüssel „Person|Tag“) sehen Beschäftigte nur für sich selbst, die Schichtverantwortung
  im eigenen Bereich am Tag (`schichtSchluessel`, tagesgenau), Betriebsrat und Betreiber nicht; Planung und
  Leitung voll. Beide schreiben nur Planung und Leitung (Voll-Schreibweg); der Server prüft die Form
  (`postenZusammen`: Kennungen, Soll 0 bis 99, Schlüssel mit echtem Tag, nur Neues oder Geändertes streng). Die
  Selbstauskunft nach Art. 15 DSGVO nennt die eigenen Einteilungen auf Posten (`postenzuordnungen`). Befunde nur
  als Hinweis und nur bei aktivem Modul. Die Posten-Dienstarten des Bestands (`posten: true`) bleiben unverändert.
  Geprüft in `pruefungen/modul-posten.test.js`.
- *Bereichsplan* (`server/lib/modul-bereichsplan.mjs`): ein neues Betriebsfeld und ein Feld an der Einheit. Die Bereiche
  (`einheiten[].bereiche`: Kennung, Name, Soll je Dienstart; keine Personendaten) liefert der Server mit den Einheiten
  an alle Rollen. `bereichsPlan` (Zuordnung, Schlüssel „Person|Tag“ → Bereich) sehen Beschäftigte nur für sich selbst,
  die Schichtverantwortung im eigenen Bereich am Tag (`schichtSchluessel`), Betriebsrat und Betreiber nicht; Planung und
  Leitung voll. Schreiben: Planung und Leitung über den Voll-Schreibweg (`bereichsplanZusammen`, nur Neues oder
  Geändertes streng, Tage höchstens zwei Jahre von heute entfernt); die Schichtverantwortung ordnet Personen ihres Bereichs am Tag Bereichen der eigenen Einheit zu
  oder hebt die Zuordnung auf (`einheitZusammen`, Fall `bereichsPlan`; höchstens 500 Änderungen je Speichern, Tage wie oben; Unsichtbares fremder Bereiche bleibt durch die
  Rückfüllung erhalten, Fremdes wird abgewiesen — Nutzerentscheidung B2 b, vorläufig). Beschäftigte schreiben nicht.
  Die Selbstauskunft nach Art. 15 DSGVO nennt die eigenen Zuordnungen (`bereichszuordnungen`). Befunde nur als Hinweis
  und nur bei aktivem Modul. Geprüft in `pruefungen/modul-bereichsplan.test.js`.

²⁹ WP-19.0 (gemeinsamer Kern der Branchenmodule), drei neue Zeilen, keine neue Spalte. **Aktivierung, Mitbestimmung,
Regelwerte.** Die Moduleinstellungen stehen in `einstellungen` (Zeile bisher ohne eigene Matrixzeile, für alle Rollen voll).
Seit WP-19.0 kürzt `moduleinstellungenSicht` (`server/lib/branchenmodule.mjs`, eingebunden in `sicht.mjs`, Zeile
`einstellungen`) für **Beschäftigte und Schichtverantwortung**: Schalter, Parameter, Zeitpunkte und Regelwerte gehen hinaus
(die Oberfläche braucht sie, um Module anzuzeigen und Befunde zu rechnen); wer geschaltet, bestätigt oder geprüft hat, die
Grundlage der Mitbestimmung und das Modulprotokoll nicht. Der **Betriebsrat** bekommt alles davon: Er prüft Einführung und
Anwendung technischer Einrichtungen (§ 87 Abs. 1 Nr. 6 BetrVG) und muss sehen, welches Modul wann mit welcher Grundlage
eingeschaltet wurde (Entscheidung G6/G7). Die Daten der Module selbst (`objekte`, `postenPlan` …) haben eigene Zeilen;
für weitere Module folgt die Sicht des Betriebsrats je Modul (G7, FN-33). Einordnung **B** für die Zeile „wer …“: Ob der
Betriebsrat auch die Personenkennung der handelnden Leitung braucht, ist fachlich offen (FN-33). **Schreiben:** nur mit
`org.edit` (Leitung, Kundenrolle) über `branchenmoduleZusammen`; Planung, Beschäftigte, Betriebsrat: gespeicherter Stand
bleibt, Schichtverantwortung: abgewiesen (`einheitZusammen`). Wann/Wer, Prüfvermerk und Modulprotokoll setzt nur der Server;
fehlende Felder lassen den gespeicherten Stand stehen. Einschalten eines mitbestimmungsrelevanten Moduls (Wachbuch,
Objektbericht) nur mit Bestätigung und Grundlage; ein Regelwert hebt eine Branchenregel höchstens auf „Achtung“, nur
geprüft mit Quelle, Fundstelle, Fassung und Gültigkeit, nie auf „recht“ und nie zur Sperre. **Nach dem Abschalten** sind die
Datenfelder des Moduls nur lesbar (`modulschreibwege.mjs`, `moduldatenZusammen`) — erst nach echtem Einschalten (`eingeschaltetAm`, ein Zeitpunkt ohne Person, für alle Rollen wie `geaendertAm`). Gelöscht wird über den Löschlauf (`aufbewahrung.mjs`: Zuordnungen anonymisierter Personen, Einträge hinter der Plandatenfrist, Modulprotokoll nach `MODULPROTOKOLL_FRIST`, Entwurfswert) und über den Ausnahmeweg Art. 16/17 DSGVO der Leitung (`moduldatenAusnahme`, nur genau benannte Einträge, protokolliert ohne Personenbezug). Neu angelegte Betriebe (Betreiber, `/api/bestand-anlegen`) bringen keine Moduleinstellungen mit (Nachtrag Opus-Review).
**Wiederherstellen** lässt Schalter, Bestätigungen, Regelwerte und Modulprotokoll, wie sie heute sind. Die Selbstauskunft nach
Art. 15 DSGVO nennt die eigenen Einträge im Modulprotokoll (`modulhandlungen`); das Betriebsprotokoll des Servers nur Modul
und Art (WP-14b, M1). Geprüft in `pruefungen/modul-kern.test.js`, `pruefungen/rechtematrix-zeilen.test.js`.

**Mitteilungen (Commit 4, A):** Zustellwege (`wege`) und Zustellstatus (`zugestellt`) schreibt kein Client.
Notruf- und Tauschmitteilungen erzeugt nur der Server aus dem fachlichen Vorgang (neuer eigener Notruf; neue
eigene Meldung auf ein offenes Tauschgesuch), mitgeschickte werden verworfen (`server/lib/mitteilungen.mjs`).
Andere Mitteilungen legen Planung, Leitung und die Schichtverantwortung (eigener Bereich) an — Titel ≤ 120,
Text ≤ 500 Zeichen. Beschäftigte und die Schichtverantwortung als Empfänger ändern an eigenen Mitteilungen nur
`gelesen`. An der Person wird höchstens der Merker `pushSchluessel: true` geschrieben.

## 2. Weitere Wege

| Weg | Wer | Was | |
|---|---|---|---|
| `GET /api/br-auswertung` (abgeleitet, nicht im Bestand; dauerhaft gespeichert nur das eingefrorene Ist je Monat) | Nur Betriebsrat mit `audit.view` (serverseitig; alle anderen Rollen 403) | WP-27: Summen je Monat und Einheit aus dem vollständigen Bestand (Dienste, Nacht-, Sonntagsdienste, Dienste über 10 h, Ruhezeit unter 11 h nach Plan), sechs Monate zurück, zwei voraus. Unter 3 Personen keine Zahlen („<3“); ist eine Einheit gesperrt, fehlt auch die Gesamtzeile des Monats (Zweitsperre). **Ist-Zeiten** (bestätigte Stunden und ihre Zahl) nur, wenn der Monat abgeschlossen und die Frist zum nachträglichen Bestätigen (14 Tage) vorbei ist **und** mindestens 3 Personen bestätigt haben; trägt in einem Monat eine Einheit mit 1–2 Personen bei, fehlt das Ist auch in der Gesamtzeile (Review F1). Keine Person, kein Name, keine Kennung (`server/lib/br-auswertung.mjs`). Gerechnet wird im Hintergrund in Häppchen, im Prozessspeicher je Raum, Betrieb und Tag gemerkt und höchstens alle 5 Minuten neu; das letzte Ergebnis wird mit Zeitstempel ausgeliefert, bis zum ersten „wird berechnet“ (202) (F2, F3, N1). Das Ist eines Monats wird beim ersten Ausgeben als Ganzes eingefroren — ein Schlüssel je Raum, Betrieb und Monat (`brist:<raum>:<betrieb>:<monat>`), atomar angelegt, danach nur der gespeicherte Rahmen ausgegeben; Zeilen, die dabei fehlten, bleiben dauerhaft ohne Ist (`istNichtVerfuegbar`, ‡), spätere Korrekturen der Planung stehen nur als Hinweis (`istKorrigiert`, †) an der Zeile (WP-27b, B1). Geschrieben wird nur unter der Raumsperre und solange der Raum besteht; aufgeräumt gezielt beim Monatswechsel und mit der Raumlöschung. Ist-Stunden rechnen wie das Stundenkonto (`istZeitFuer`: korrigierte Pause, bestätigte ungeplante Dienste); Rufbereitschaft (`form: ruf`, `rufbereitschaft`, `ruhezeitNeutral`) zählt weder als langer Dienst noch bei der Ruhezeit (B5). Ein Betrieb ohne Kennung: 409 statt endlos 202 (B6). `export.data` schaltet nur die Schaltfläche für den CSV-Export frei; der Export enthält genau diese Zahlen, nichts darüber hinaus (F4, dokumentiert). Die Oberfläche sperrt für den Betriebsrat Ansichten, die ohne seine Daten falsch oder leer wären (Leistungsnachweis, Sondereinsätze, Betriebsmittel, Lenkzeiten) und zeigt den Ausgleichszeitraum ohne Ist-Daten als „nicht bewertbar“ | A |
| `PUT /api/bestand`: Dienstarten (`dienstarten`) anlegen, ändern, löschen | Leitung, Kundenrolle, Planung (`org.edit` oder `pattern.edit`) | WP-22 (Nutzerentscheidung, keine Funktionskürzung): Die Planung behält die Einrichtung — Dienstarten, Zeiten, Mindestbesetzung, Vorlagenzeiten, Checkliste. Alle anderen Rollen weist der Server ab (403), eine unveränderte Kopie stört nicht. Eine noch verwendete Dienstart (Schichtfolge, Einteilung ab heute) lässt sich nicht löschen | A |
| `PUT /api/bestand`: Einteilungen (`abweichungen`, mittelbar über Dienstzeiten, Schichtfolge, Einheiten, Personen) | jede schreibende Rolle im eigenen Umfang | WP-22: Der Server prüft neue Befunde mit derselben Fachprüfung wie die Oberfläche (`einteilungsBefunde`, `server/lib/fachpruefung.mjs`): sperrende (Katalogspalte `sperrt`) weist er ab (403); warnende nur mit einem neuen Eintrag im Bestätigungsprotokoll zu Person, Tag und Regel — oder, für Planung, Leitung und Kundenrolle, einer Sammelbestätigung je Regel, Einheit (Pflicht) und Zeitraum — nicht für Schutzregeln, die nur einzeln —, deren gedeckte Anzahl und tatsächlich betroffene Tage der Server einträgt; eine, die nichts deckt, wird nicht gespeichert (Review B1, S1) — im selben Speichervorgang, sonst 409 mit `fachbefunde` und `sammelVorschlag` (neutrale Texte aus dem Katalog, für Schutzbefunde immer „Schutz- oder Einsatzregel der Person“). Ein Dienst über zehn Stunden ist nur ein Hinweis (Nutzerentscheidung). Die Schichtverantwortung bekommt nie Befunde aus fremden Bereichen: Wirkt ihre Änderung dorthin, sperrt sie ohne Kennung (Review B4). Die Nachrechnung läuft in Häppchen (503 nach Zeitbudget, 429 bei mehr als 10 Strukturänderungen je Raum und Minute; Review B2). Schutzangaben einer Person werden immer gespeichert; widersprechende bestehende Einteilungen meldet der Server (Nachprüfung 9717ddf). Siehe ²¹ | A |
| `/api/vollausgabe` | Leitung; Sicherungsschlüssel | eigener Betrieb nach Exportkatalog (`server/lib/sicherungen.mjs`), Spalten VA-LT/VA-SK oben; kein Wiederherstellungsformat | A |
| `/api/sicherungsschluessel` (GET/POST/DELETE) | Leitung | nur Schlüssel des eigenen Betriebs; Widerruf nur über die vollständige Kennung; fremd wie unbekannt | A |
| `/api/sicherung`, `/api/sicherungen`, `/api/wiederherstellen` | Leitung | Sicherungen und Wiederherstellen je Betrieb, Kontingente je Betrieb, Geheimnisse und Vertrag aus dem heutigen Stand; ebenso Betreiberstamm und alles außerhalb der Sicht der Leitung (an bestehenden Personen etwa Bank-, Steuer- und Lohnangaben) — dieselbe Grenze wie beim Speichern | A |
| `/api/zugang-sperren` | Leitung (eigener Betrieb), Betreiber (raumweit) | ohne Existenz-Orakel | A |
| `/api/stempeln`, `/api/zeit-bestaetigen` | Person mit Zugang | nur die eigene Person, Antwort nur der eigene Eintrag. Geo V1: Urteil nur bei eingeschaltetem Betriebsschalter `einstellungen.geoPruefung` (Vorgabe aus; schalten nur Rollen mit `org.edit`, Zeitpunkt und Person setzt der Server); Rohkoordinate und exakte Entfernung werden nicht gespeichert. Offline (WP-07): `clientEventId` je Person idempotent (Kennung am Stempel, unter der Raumsperre), Ereignis mit fremdem `inhaber` → 409 `STEMPEL_FREMDE_SITZUNG`, Erfassungszeit plausibilisiert (`GERAETEZEIT_ABWEICHEND`, `OFFLINE_ALT`, und — ohne Betriebsschalter `einstellungen.offlineStempelVertrauen` (nur `org.edit`, Wann/Wer vom Server, Vorgabe aus) — jede offline erfasste Zeit, die 15 min oder später eingeht → Ist-Zeit zur Prüfung `OFFLINE_PRUEFEN`); gleiche Kennung mit anderer Art → 422 `STEMPEL_EREIGNIS_WIDERSPRUCH`, `offlineStart`/`offlineEnde` Teil des unveränderlichen Originals | A |
| `/api/stempel-korrektur` | Leitung, Planung, Probierraum (`staff.edit`) | Ist-Zeit eines gestempelten Tages korrigieren — nur als Ereignis `{vorher, nachher, wer, wann, grund}` am Stempel (`server/lib/stempelintegritaet.mjs`, WP-06); das Original bleibt. Ein Originalstempel ist über `PUT /api/bestand` für **jede** Rolle unveränderlich (ändern, löschen, erfinden, Korrektur am Ereignisweg vorbei, Ist-Zeit eines gestempelten Tages ändern: 403 `STEMPEL_UNVERAENDERLICH`). Ausnahmen: Löschlauf der Leitung nach Ablauf der Aufbewahrungsfrist (mind. 24 Monate); Wiederherstellen behält alle heutigen Stempel samt Korrekturen. Die Ereignisse sieht nur, wer den Stempel sieht (`einstempeln` `NUR_EIGENE` für Beschäftigte, Schichtverantwortung, Betriebsrat) | A |
| `/api/korrektur-antrag` | Person mit Zugang (auch Schichtverantwortung, Betriebsrat) | Antrag auf Korrektur der Ist-Zeit am **eigenen** Stempel der letzten 62 Tage (Beginn, Ende, Pause, Grund ≥ 10 Zeichen); ein offener Antrag je Stempel; liegt am Stempel (`einstempeln[k].antraege`) und folgt dessen Sicht — die Schichtverantwortung sieht fremde nicht (H8+). Der Stempel bleibt unverändert (`server/lib/korrekturworkflow.mjs`, WP-14) | A |
| `/api/korrektur-entscheiden` | Leitung, Planung, Probierraum (`staff.edit`); Zurückziehen nur die antragstellende Person | genehmigen (→ Korrekturereignis am Stempel mit Antrags-Kennung und Regelhinweisen, Ist ändert sich), ablehnen (Begründung ≥ 10 Zeichen) oder zurückziehen; nicht Schichtverantwortung, Beschäftigte, Betriebsrat, Betreiber (403) | A |
| `/api/anmelden`, `/api/demo`, `/api/demos` | öffentlich | Sitzung bzw. Name/Kennung der Demozugänge, keine Codes | A |
| `/api/account/*` | eigenes Konto | Mitgliedschaften des eigenen Kontos | A |
| `/api/zugaenge`, `/api/zugaenge-uebersicht`, `/api/raum-loeschen`, `/api/bestand-anlegen`, `/lage` | Betreiber | raumweit, ohne Codes und Prüfsummen | A |
| `/einrichten/*` | Verwalterschlüssel | Codes anlegen, Übersicht und Bindung ohne Codes | A |
| `/kalender/einrichten`, `/kalender/daten`, `/kalender/loeschen` | jede bekannte Rolle mit eigener Person (Betreiber nicht; unbekannte Rolle 403, D1e) | nur die eigene Person aus der Sitzung (Raum, Betrieb, Person); `personId` im Rumpf zählt nicht; ein aktiver Feed je Person (Index nur als Hash); fremde und unbekannte Geheimnisse ohne Wirkung und mit gleicher Antwort (Commit 3) | A |
| `/kalender/feed/<geheim>.ics` | wer das Geheimnis hat | liest den Feed (Bearer); ungültig nach erneutem Einrichten oder Löschen. Bei jedem Abruf zusätzlich: Raum, Betrieb (`mandantId`), Person in genau diesem Betrieb, nicht anonymisiert, nicht gesperrt, nicht ausgetreten, bekannte Rolle — sonst 404 wie unbekannt; Altfeed ohne `mandantId`: 404 und widerrufen (Commit D1f). Fehlt die Berechtigung, wird der Feed endgültig widerrufen (`feed:`, `feeddaten:`, genau zugehöriger `feedperson:`-Index) — kehrt die Person zurück, gilt der alte Verweis nicht wieder; ein Lesefehler der Ablage widerruft nicht (500) (Commit D1g). **WP-24:** Der Feed ist live — die Termine rechnet der Server bei jedem Abruf aus dem aktuellen Bestand (`server/lib/kalenderfeed.mjs`), nicht das Gerät; nur die eigenen Dienste der Person; Abwesenheit nur als ganztägiger Termin, die Art nur bei Urlaub, Schulung, Freizeitausgleich, Freistellung (alles andere, auch Krankheit und Mutterschutz, heißt „abwesend“); keine Schutzmerkmale, keine Kollegen; `DTSTAMP` ist der Stand des Bestands. Der Feed trägt seine Herkunft (Konto + Mitgliedschaft + Generation, oder Zugangscode): Sperre des Kontos, Entzug der Mitgliedschaft, gesperrter Zugangscode widerrufen ihn beim nächsten Abruf (`server/lib/feedherkunft.mjs`); Feeds aus der Zeit davor werden über die Person geprüft und von der Sperre des Kontos (`accountSperren`) oder Zugangscodes (`/api/zugang-sperren`) über den `feedperson:`-Index der gebundenen Person widerrufen (`server/lib/feedwiderruf.mjs`). Ein neuer Feed ohne ableitbare Herkunft wird nicht eingerichtet (403); ein abgelaufener Testraum-Code (`laeuftAb`) und ein ersetzter Code-Eintrag (`ersetztDurch` nach der Umschlüsselung, die ganze Kette) gelten nicht. Entwürfe (WP-23): dieselbe Regel wie die Sicht (`planfreigabe.mjs`: `planFreigabeAktiv`, `istEntwurfstag`; Rolle der Person im Bestand, ohne Angabe `mitarbeiter`) — Beschäftigte sehen keine Einteilung eines nicht freigegebenen künftigen Monats, stattdessen den Hinweis „Plan noch nicht veröffentlicht“; Betriebsrat, Schichtverantwortung, Planung und Leitung sehen den Entwurf. **Rollen-Sonde:** `pruefungen/kalender-feed-live.test.js`, „Rollen-Sonde Kalender-Feed (MA, BR, SV, PL, LT)“ (nur eigene Dienste, keine fremden Marker, Entwürfe je Rolle wie `bestandFuerRolle`) und „Entwurfsregel des Feeds = Sicht“ (11 Betriebsformen × 6 Rollenangaben × 205 Tage). `cache-control: private`. `raumLoeschen` räumt auch die `feedperson:`-Indizes; alte Geräte-Termine `feeddaten:*` räumt der Datenschutzlauf (Vorschau zählt, `an` löscht) | A |
| `/zustellung/senden` | Planung, Leitung (Betrieb); Schichtverantwortung (Bereich, eigene Vorgänge); Beschäftigte (nur eigene Vorgänge); nicht Betriebsrat, Betreiber | nimmt nur `{nachrichten:[id,…]}`; Empfänger, Adresse, Push-Anmeldung, Titel und Text aus dem gespeicherten Betrieb der Sitzung; Antwort je Kennung nur „erledigt"/„offen" — unbekannt, fremd, ohne Weg sehen gleich aus; atomarer Claim je Mitteilung, Kanal und Versuch verhindert parallelen Mehrfachversand, gesendet/übersprungen endgültig, Wiederholung bis 3 Versuche; Restschuld: nach einem Prozessabbruch zwischen Versand und Statusabschluss ist nach 15 Minuten ein erneuter Versand möglich (Commit 4) | A |
| `/zustellung/anmelden`, `/zustellung/abmelden` | eigene Person | Push-Register `push:<raum>:<mandantId>:<person>`; alter Schlüssel ohne Betrieb nur bei eindeutiger Zuordnung im Raum übernommen (Commit 4) | A |
| `PUT /api/bestand` (Notruf, Tauschmeldung) | wer den Vorgang auslöst | der Server erzeugt die Mitteilungen und stellt sie nach dem Speichern selbst zu; Notruf nur an die gültigen, geprüften Empfänger des Notrufs, ohne Ersatzempfänger (Commit 4a); ein Versandfehler ändert den Vorgang nicht (Commit 4) | A |

## 3. Bewusst offen

| Punkt | bis |
|---|---|
| Trockenlauf für den Verwalter: Kalenderfeeds je Raum und Person (ohne Geheimnisse), mehrdeutige Altfeeds | eigener Schritt |
| Kalender-Feeds ohne Herkunft (vor WP-24): außer bei einer Sperre (Konto, Code) nur über die Person geprüft. Vorschlag (b): Stichtag — 60 Tage nach dem Ausrollen von WP-24 gilt ein Feed ohne Herkunft nicht mehr (404, Hinweis zum Neu-Einrichten in den Versionshinweisen); (c): bis dahin zählt der Trockenlauf (Datenschutzlauf, Vorschau) die Feeds ohne Herkunft je Raum, damit die Leitung weiß, wen sie ansprechen muss | Entscheidung bis 2026-12-01, Stichtag frühestens 60 Tage nach Produktions-Rollout WP-24 |
| Kalender-Feed: Passwortwechsel und Abmelden widerrufen den Feed nicht (ein Kalender meldet sich nicht neu an; Rückzug einzeln über `/kalender/loeschen`) | Produktentscheidung (offen) |
| Kalender-Feed: Posten (Dienste aus Gruppendiensten) stehen nicht im Feed (rechnet nur die Oberfläche) | Grenze, eigener Schritt |
| Kalender-Feed: jeder gültige Abruf liest den vollen Bestand (Bremse „lesen“ 300/min je Geheimnis) — eigene Art „feed“ (12–30/min) und Ergebnis-Zwischenspeicher je Raum/Stand | WP-47b |
| Ältere vollständige Push-Anmeldungen an Personen im Bestand (vor Commit 4 geschrieben): werden nicht mehr gelesen noch fremd ausgeliefert, bleiben aber bis zur nächsten Änderung der Person gespeichert | eigener Bereinigungsschritt |
| Alte Push-Schlüssel `push:<raum>:<person>` bei mehrdeutiger Kennung im Raum: nie benutzt, nicht gelöscht | Trockenlauf/Bereinigung für den Verwalter |
| Versandwarteschlange und mehrere Geräte je Person | bei Bedarf |
| Crash-Fenster beim Versand: Abbruch nach externem Versand und vor Statusabschluss — nach 15 Minuten erneuter Versand möglich | Restschuld, ohne Queue/Transaktion |
| Rückfall-Alarmierung, wenn ein Notruf keinen gültigen Empfänger hat (heute: keine Mitteilung) | Produktentscheidung |
| Altbestand von Dienstbuch, Übergaben und Tagesnotizen ohne `einheitId` einer Einheit zuordnen (heute nur für Planung/Leitung sichtbar) | eigener Schritt |
| Restrückschluss aus einzelnen Einsatzregeln (Sonntag nur mit Freigabe; über 8 h nur nach Absprache) auf das Merkmal (Commit S1, bewusst) | Schuld S |
| `/api/zugaenge-uebersicht` liefert den Zugangsnamen (meist der Personenname) — neutraler Anzeigename prüfen | Minimierung, bei Bedarf |
| Toter Code `zugangsUebersicht()` in der Oberfläche (liest Namen und E-Mail, ohne Aufrufer) | Aufräumen |
| Adressänderungen: der Betreiber sieht alte und neue Anmeldeadresse im Klartext (die Konsole zeigt sie) — Maskierung prüfen | Minimierung, bei Bedarf |
| `adressaenderungen` ganz oben: weder gelesen noch geschrieben von einer Oberfläche (Altfeld) | Aufräumen |
| Adressänderungen im Betrieb (Schreibweg der eigenen Anmeldeadresse) | eigener Schritt |
| Wortlaut „Alle Daten dieses Betriebs, jederzeit vollständig" in der Ansicht Datenmitnahme | UX-Text |
| Ein eigener HR-/DSGVO-Export für eine berechtigte Leitung, Trennung `/api/datenexport` / `/api/externes-backup` | eigener Schritt |
| Weg des Betreibers zu Sicherungsschlüsseln | bei Bedarf |
