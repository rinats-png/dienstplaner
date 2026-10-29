# Rechtematrix — Lesesicht und Verwaltungswege

Stand: Abschluss des Blocks 1e (Commits 1e.1, 1e.2, 1e.2a, 1e.3, 1e.4a, 1e.4b, 1e.4), Commit 3 (Kalender) und
Commit 4 (Versand und Zustellung auf dem Server) und C-Block C1–C3 (Bereichsbezug: Ausschreibungen,
Dienstbuch, Übergaben, Tagesnotizen).
Regressionstest: `pruefungen/rechtematrix.test.js` — jede Zeile der Tabelle unten ist dort ein Marker
mit Erwartung je Rolle und Lesepfad. **Matrix und Test werden zusammen geändert.**

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
Schichtverantwortung also außerhalb ihres Bereichs). Die eigene Person bekommt jede Rolle vollständig.

Spalten: **MA** Beschäftigte · **BR** Betriebsrat · **SV** Schichtverantwortung · **PL** Planung ·
**LT** Leitung (ebenso Kundenrolle) · **BT** Betreiber · **VA-LT** Vollausgabe der Leitung ·
**VA-SK** Vollausgabe mit Sicherungsschlüssel. ✓ = wird ausgeliefert, – = nicht.

| Datenklasse | MA | BR | SV | PL | LT | BT | VA-LT | VA-SK | |
|---|---|---|---|---|---|---|---|---|---|
| Personendaten für den Plan (Name, Zugehörigkeit, Rolle, Qualifikationen …) | ✓ | ✓ | ✓ | ✓ | ✓ | – ¹¹ | ✓ | ✓ | A |
| Personengerüst für die Betreiberabrechnung (Rolle auch im Verlauf, Status, Ein-/Austritt, Zugehörigkeit) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ ¹¹ | ✓ | ✓ | A |
| Kontakt: Telefon, Anschrift | – | – | – ¹ | ✓ | ✓ | – | ✓ | ✓ | A |
| Kontakt: E-Mail (Kontaktangabe für Planung und Leitung) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Notfallkontakt | – | – | – | – | – | – | – | ✓ | A |
| Bank, Steuer, Sozialversicherung, Lohn/Gehalt | – | – | – | – | – | – | – | ✓ | A |
| frühere Anmeldeadresse | – | – | – | – | – | – | – | ✓ | A |
| Gesundheits-/Schutzmerkmale (fremder Bereich) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Gesundheits-/Schutzmerkmale (eigener Bereich der SV) | – | – | nur abgeleitete Einsatzregeln ¹⁰ | ✓ | ✓ | – | ✓ | ✓ | A |
| Qualifikationen | ✓ ² | ✓ ² | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Zeiterfassung (fremd; Grund) | – | Zeiten ohne Grund | – ³ | ✓ | ✓ | – | ✓ | ✓ | A |
| Stempeldaten, Ortsurteil | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Abwesenheiten mit Anmerkung | „abwesend" | „abwesend" | „abwesend" ⁴ | ✓ | ✓ | – | ✓ | ✓ | A |
| Anträge (fremd) | nur offene Tauschgesuche | – | nur offene Tauschgesuche ⁵ | ✓ | ✓ | – | ✓ | ✓ | A |
| Nachrichten anderer | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Notrufe anderer | – | – | nur Bereich und an sie | ✓ | ✓ | – | ✓ | ✓ | A |
| Dienstbuch | – | – | nur eigene Einheit ⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Übergaben | – | – | nur eigene Einheit ⁸ | ✓ | ✓ | – | ✓ | ✓ | A |
| Tagesnotizen (`notizen` „tag\|…") | – | – | nur eigene Einheit ⁹ | ✓ | ✓ | – | ✓ | ✓ | A |
| `tagesnotizen` (totes Feld, keine Ansicht) | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Personennotizen (`notizen` „person\|…") | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Ausschreibungen: Kopf (Tag, Dienst, Status, verantwortende Einheit) | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | A |
| Ausschreibungen: Bewerbungen anderer | nur eigene | – | nur bei Ausschreibung der eigenen Einheit ⁷ | ✓ | ✓ | – | ✓ | ✓ | A |
| Kalendergeheimnis, -verweis, -stand | – | – | – | – | – | – | – | – | A |
| Push-Schlüssel, Zustelleinstellungen | – | – | – | – | – | – | – | – | A |
| Adressänderungen im Betrieb | – | – | – | ✓ | ✓ | ✓ ¹¹ | ✓ | ✓ | B ⁶ |
| Lohnarten | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Betriebsprotokoll | – | – | – | ✓ | ✓ | – | ✓ | ✓ | A |
| Billing: Konditionen, Vertrag, Rechnungsangaben, USt-ID | – | – | – | – | – | ✓ | – | – | A |
| Betreiberfelder: Raumkennung, Firmenstamm, Preisliste, Selbststarts | – | – | – | – | – | ✓ | – | – | A |
| Betriebsnotiz `notiz` (keine Oberfläche liest sie) | – | – | – | – | – | – ¹¹ | – | – | A |
| `session` ganz oben im Bestand — Legacy-Feld, kein Bestandsfeld mehr ¹² | – | – | – | – | – | – | – | – | A |
| `session` am Betrieb (`mandanten[].session`) — Legacy-Feld, kein Bestandsfeld mehr ¹³ | – | – | – | – | – | – | – | – | A |
| Rechnungen (eigener und anderer Betriebe) | – | – | – | – | – | ✓ | – | – | A |
| Betreiberprotokoll | – | – | – | – | – | ✓ | – | – | A |
| andere Betriebe des Raums | – | – | – | – | – | ✓ (gekürzt ¹¹) | – | – | A |
| unbekannte neue Felder (Person, Betrieb, oben) | – | – | – | – | – | – | – | – | A |

¹ im eigenen Bereich und Springer-Pool ✓ (Telefon, Mobil). ² ohne Status-Qualifikationen.
³ im eigenen Bereich Zeiten ohne Grund. ⁴ im eigenen Bereich Kategorie ohne Anmerkung.
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
¹³ Commit D1c: `mandanten[].session` hatte keinen Schreiber; die Oberfläche las daraus nur irrtümlich die eigene
Person (`bewirbDich`, `ziehBewerbungZurueck`, jetzt nur `sitz.person.id`). Planung und Leitung konnten dort
beliebige Daten ablegen, die alle Rollen des Betriebs — Beschäftigte und Betriebsrat eingeschlossen — und die
Vollausgabe zurückgaben. Jetzt: nie ausgeliefert (jede Rolle, Vollausgabe, 409, neue Sicherung), beim Schreiben
verworfen ohne Ablehnung der übrigen Änderung, Altinhalt beim nächsten Schreiben entfernt (auch im Drei-Wege-Abgleich
und bei der Wiederherstellung).

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

**Mitteilungen (Commit 4, A):** Zustellwege (`wege`) und Zustellstatus (`zugestellt`) schreibt kein Client.
Notruf- und Tauschmitteilungen erzeugt nur der Server aus dem fachlichen Vorgang (neuer eigener Notruf; neue
eigene Meldung auf ein offenes Tauschgesuch), mitgeschickte werden verworfen (`server/lib/mitteilungen.mjs`).
Andere Mitteilungen legen Planung, Leitung und die Schichtverantwortung (eigener Bereich) an — Titel ≤ 120,
Text ≤ 500 Zeichen. Beschäftigte und die Schichtverantwortung als Empfänger ändern an eigenen Mitteilungen nur
`gelesen`. An der Person wird höchstens der Merker `pushSchluessel: true` geschrieben.

## 2. Weitere Wege

| Weg | Wer | Was | |
|---|---|---|---|
| `/api/vollausgabe` | Leitung; Sicherungsschlüssel | eigener Betrieb nach Exportkatalog (`server/lib/sicherungen.mjs`), Spalten VA-LT/VA-SK oben; kein Wiederherstellungsformat | A |
| `/api/sicherungsschluessel` (GET/POST/DELETE) | Leitung | nur Schlüssel des eigenen Betriebs; Widerruf nur über die vollständige Kennung; fremd wie unbekannt | A |
| `/api/sicherung`, `/api/sicherungen`, `/api/wiederherstellen` | Leitung | Sicherungen und Wiederherstellen je Betrieb, Kontingente je Betrieb, Geheimnisse und Vertrag aus dem heutigen Stand | A |
| `/api/zugang-sperren` | Leitung (eigener Betrieb), Betreiber (raumweit) | ohne Existenz-Orakel | A |
| `/api/stempeln`, `/api/zeit-bestaetigen` | Person mit Zugang | nur die eigene Person, Antwort nur der eigene Eintrag | A |
| `/api/anmelden`, `/api/demo`, `/api/demos` | öffentlich | Sitzung bzw. Name/Kennung der Demozugänge, keine Codes | A |
| `/api/account/*` | eigenes Konto | Mitgliedschaften des eigenen Kontos | A |
| `/api/zugaenge`, `/api/zugaenge-uebersicht`, `/api/raum-loeschen`, `/api/bestand-anlegen`, `/lage` | Betreiber | raumweit, ohne Codes und Prüfsummen | A |
| `/einrichten/*` | Verwalterschlüssel | Codes anlegen, Übersicht und Bindung ohne Codes | A |
| `/kalender/einrichten`, `/kalender/daten`, `/kalender/loeschen` | jede bekannte Rolle mit eigener Person (Betreiber nicht; unbekannte Rolle 403, D1e) | nur die eigene Person aus der Sitzung (Raum, Betrieb, Person); `personId` im Rumpf zählt nicht; ein aktiver Feed je Person (Index nur als Hash); fremde und unbekannte Geheimnisse ohne Wirkung und mit gleicher Antwort (Commit 3) | A |
| `/kalender/feed/<geheim>.ics` | wer das Geheimnis hat | liest den Feed (Bearer); ungültig nach erneutem Einrichten oder Löschen. Bei jedem Abruf zusätzlich: Raum, Betrieb (`mandantId`), Person in genau diesem Betrieb, nicht anonymisiert, nicht gesperrt, nicht ausgetreten, bekannte Rolle — sonst 404 wie unbekannt; Altfeed ohne `mandantId`: 404 und widerrufen (Commit D1f). Konto, Mitgliedschaft und Codesperre noch nicht (Folgeschritt: Herkunft am Feed) | A |
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
