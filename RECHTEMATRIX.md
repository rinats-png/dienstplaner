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
| Stempeldaten, Ortsurteil (seit Geo V1 `geoStart`/`geoEnde`: Status, gerundete Entfernung, Genauigkeit, Referenzstandort; nie Koordinaten) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
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

**Mitteilungen (Commit 4, A):** Zustellwege (`wege`) und Zustellstatus (`zugestellt`) schreibt kein Client.
Notruf- und Tauschmitteilungen erzeugt nur der Server aus dem fachlichen Vorgang (neuer eigener Notruf; neue
eigene Meldung auf ein offenes Tauschgesuch), mitgeschickte werden verworfen (`server/lib/mitteilungen.mjs`).
Andere Mitteilungen legen Planung, Leitung und die Schichtverantwortung (eigener Bereich) an — Titel ≤ 120,
Text ≤ 500 Zeichen. Beschäftigte und die Schichtverantwortung als Empfänger ändern an eigenen Mitteilungen nur
`gelesen`. An der Person wird höchstens der Merker `pushSchluessel: true` geschrieben.

## 2. Weitere Wege

| Weg | Wer | Was | |
|---|---|---|---|
| `PUT /api/bestand`: Dienstarten (`dienstarten`) anlegen, ändern, löschen | Leitung, Kundenrolle, Planung (`org.edit` oder `pattern.edit`) | WP-22 (Nutzerentscheidung, keine Funktionskürzung): Die Planung behält die Einrichtung — Dienstarten, Zeiten, Mindestbesetzung, Vorlagenzeiten, Checkliste. Alle anderen Rollen weist der Server ab (403), eine unveränderte Kopie stört nicht. Eine noch verwendete Dienstart (Schichtfolge, Einteilung ab heute) lässt sich nicht löschen | A |
| `PUT /api/bestand`: Einteilungen (`abweichungen`, mittelbar über Dienstzeiten, Schichtfolge, Einheiten, Personen) | jede schreibende Rolle im eigenen Umfang | WP-22: Der Server prüft neue Befunde mit derselben Fachprüfung wie die Oberfläche (`einteilungsBefunde`, `server/lib/fachpruefung.mjs`): sperrende (Katalogspalte `sperrt`) weist er ab (403); warnende nur mit einem neuen Eintrag im Bestätigungsprotokoll zu Person, Tag und Regel — oder, für Planung, Leitung und Kundenrolle, einer Sammelbestätigung je Regel, Einheit (Pflicht) und Zeitraum — nicht für Schutzregeln, die nur einzeln —, deren gedeckte Anzahl und tatsächlich betroffene Tage der Server einträgt; eine, die nichts deckt, wird nicht gespeichert (Review B1, S1) — im selben Speichervorgang, sonst 409 mit `fachbefunde` und `sammelVorschlag` (neutrale Texte aus dem Katalog, für Schutzbefunde immer „Schutz- oder Einsatzregel der Person“). Ein Dienst über zehn Stunden ist nur ein Hinweis (Nutzerentscheidung). Die Schichtverantwortung bekommt nie Befunde aus fremden Bereichen: Wirkt ihre Änderung dorthin, sperrt sie ohne Kennung (Review B4). Die Nachrechnung läuft in Häppchen (503 nach Zeitbudget, 429 bei mehr als 10 Strukturänderungen je Raum und Minute; Review B2). Schutzangaben einer Person werden immer gespeichert; widersprechende bestehende Einteilungen meldet der Server (Nachprüfung 9717ddf). Siehe ²¹ | A |
| `/api/vollausgabe` | Leitung; Sicherungsschlüssel | eigener Betrieb nach Exportkatalog (`server/lib/sicherungen.mjs`), Spalten VA-LT/VA-SK oben; kein Wiederherstellungsformat | A |
| `/api/sicherungsschluessel` (GET/POST/DELETE) | Leitung | nur Schlüssel des eigenen Betriebs; Widerruf nur über die vollständige Kennung; fremd wie unbekannt | A |
| `/api/sicherung`, `/api/sicherungen`, `/api/wiederherstellen` | Leitung | Sicherungen und Wiederherstellen je Betrieb, Kontingente je Betrieb, Geheimnisse und Vertrag aus dem heutigen Stand; ebenso Betreiberstamm und alles außerhalb der Sicht der Leitung (an bestehenden Personen etwa Bank-, Steuer- und Lohnangaben) — dieselbe Grenze wie beim Speichern | A |
| `/api/zugang-sperren` | Leitung (eigener Betrieb), Betreiber (raumweit) | ohne Existenz-Orakel | A |
| `/api/stempeln`, `/api/zeit-bestaetigen` | Person mit Zugang | nur die eigene Person, Antwort nur der eigene Eintrag. Geo V1: Urteil nur bei eingeschaltetem Betriebsschalter `einstellungen.geoPruefung` (Vorgabe aus; schalten nur Rollen mit `org.edit`, Zeitpunkt und Person setzt der Server); Rohkoordinate und exakte Entfernung werden nicht gespeichert. Offline (WP-07): `clientEventId` je Person idempotent (Kennung am Stempel, unter der Raumsperre), Ereignis mit fremdem `inhaber` → 409 `STEMPEL_FREMDE_SITZUNG`, Erfassungszeit plausibilisiert (`GERAETEZEIT_ABWEICHEND`, `OFFLINE_ALT` → Ist-Zeit zur Prüfung), `offlineStart`/`offlineEnde` Teil des unveränderlichen Originals | A |
| `/api/stempel-korrektur` | Leitung, Planung, Probierraum (`staff.edit`) | Ist-Zeit eines gestempelten Tages korrigieren — nur als Ereignis `{vorher, nachher, wer, wann, grund}` am Stempel (`server/lib/stempelintegritaet.mjs`, WP-06); das Original bleibt. Ein Originalstempel ist über `PUT /api/bestand` für **jede** Rolle unveränderlich (ändern, löschen, erfinden, Korrektur am Ereignisweg vorbei, Ist-Zeit eines gestempelten Tages ändern: 403 `STEMPEL_UNVERAENDERLICH`). Ausnahmen: Löschlauf der Leitung nach Ablauf der Aufbewahrungsfrist (mind. 24 Monate); Wiederherstellen behält alle heutigen Stempel samt Korrekturen. Die Ereignisse sieht nur, wer den Stempel sieht (`einstempeln` `NUR_EIGENE` für Beschäftigte, Schichtverantwortung, Betriebsrat) | A |
| `/api/anmelden`, `/api/demo`, `/api/demos` | öffentlich | Sitzung bzw. Name/Kennung der Demozugänge, keine Codes | A |
| `/api/account/*` | eigenes Konto | Mitgliedschaften des eigenen Kontos | A |
| `/api/zugaenge`, `/api/zugaenge-uebersicht`, `/api/raum-loeschen`, `/api/bestand-anlegen`, `/lage` | Betreiber | raumweit, ohne Codes und Prüfsummen | A |
| `/einrichten/*` | Verwalterschlüssel | Codes anlegen, Übersicht und Bindung ohne Codes | A |
| `/kalender/einrichten`, `/kalender/daten`, `/kalender/loeschen` | jede bekannte Rolle mit eigener Person (Betreiber nicht; unbekannte Rolle 403, D1e) | nur die eigene Person aus der Sitzung (Raum, Betrieb, Person); `personId` im Rumpf zählt nicht; ein aktiver Feed je Person (Index nur als Hash); fremde und unbekannte Geheimnisse ohne Wirkung und mit gleicher Antwort (Commit 3) | A |
| `/kalender/feed/<geheim>.ics` | wer das Geheimnis hat | liest den Feed (Bearer); ungültig nach erneutem Einrichten oder Löschen. Bei jedem Abruf zusätzlich: Raum, Betrieb (`mandantId`), Person in genau diesem Betrieb, nicht anonymisiert, nicht gesperrt, nicht ausgetreten, bekannte Rolle — sonst 404 wie unbekannt; Altfeed ohne `mandantId`: 404 und widerrufen (Commit D1f). Fehlt die Berechtigung, wird der Feed endgültig widerrufen (`feed:`, `feeddaten:`, genau zugehöriger `feedperson:`-Index) — kehrt die Person zurück, gilt der alte Verweis nicht wieder; ein Lesefehler der Ablage widerruft nicht (500) (Commit D1g). Konto, Mitgliedschaft und Codesperre noch nicht (Folgeschritt: Herkunft am Feed) | A |
| `/zustellung/senden` | Planung, Leitung (Betrieb); Schichtverantwortung (Bereich, eigene Vorgänge); Beschäftigte (nur eigene Vorgänge); nicht Betriebsrat, Betreiber | nimmt nur `{nachrichten:[id,…]}`; Empfänger, Adresse, Push-Anmeldung, Titel und Text aus dem gespeicherten Betrieb der Sitzung; Antwort je Kennung nur „erledigt"/„offen" — unbekannt, fremd, ohne Weg sehen gleich aus; atomarer Claim je Mitteilung, Kanal und Versuch verhindert parallelen Mehrfachversand, gesendet/übersprungen endgültig, Wiederholung bis 3 Versuche; Restschuld: nach einem Prozessabbruch zwischen Versand und Statusabschluss ist nach 15 Minuten ein erneuter Versand möglich (Commit 4) | A |
| `/zustellung/anmelden`, `/zustellung/abmelden` | eigene Person | Push-Register `push:<raum>:<mandantId>:<person>`; alter Schlüssel ohne Betrieb nur bei eindeutiger Zuordnung im Raum übernommen (Commit 4) | A |
| `PUT /api/bestand` (Notruf, Tauschmeldung) | wer den Vorgang auslöst | der Server erzeugt die Mitteilungen und stellt sie nach dem Speichern selbst zu; Notruf nur an die gültigen, geprüften Empfänger des Notrufs, ohne Ersatzempfänger (Commit 4a); ein Versandfehler ändert den Vorgang nicht (Commit 4) | A |

## 3. Bewusst offen

| Punkt | bis |
|---|---|
| Kalenderfeed nach Plan-/Dienständerungen automatisch aktualisieren (heute nur beim Einrichten hochgeladen) | eigener Funktionspunkt |
| Trockenlauf für den Verwalter: Kalenderfeeds je Raum und Person (ohne Geheimnisse), mehrdeutige Altfeeds | eigener Schritt |
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
