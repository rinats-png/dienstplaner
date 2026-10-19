# Rechtematrix — Lesesicht und Verwaltungswege

Stand: Abschluss des Blocks 1e (Commits 1e.1, 1e.2, 1e.2a, 1e.3, 1e.4a, 1e.4b, 1e.4), Commit 3 (Kalender) und
Commit 4 (Versand und Zustellung auf dem Server).
Regressionstest: `pruefungen/rechtematrix.test.js` — jede Zeile der Tabelle unten ist dort ein Marker
mit Erwartung je Rolle und Lesepfad. **Matrix und Test werden zusammen geändert.**

Einordnung je Zeile:

- **A** sauber
- **B** bewusst offen bis zu einem eigenen Schritt (siehe Fußnote; die Punkte „bis Commit 4" sind erledigt)
- **C** bewusst offen, bis die Sammlung einen Bereichsbezug (`einheitId`/`bereichId`) hat
- **S** dokumentierte technische/datenschutzrechtliche Schuld
- **D** neuer Befund — derzeit keiner

## 1. Was über `GET /api/bestand` (und die 409-Antwort von `PUT`) hinausgeht

Beide Antworten laufen über `bestandFuerRolle` (`server/lib/rechte.mjs`). Kataloge in
`server/lib/sicht.mjs`, alle als Positivliste: Beschäftigte und Betriebsrat (`BETRIEB`, `EIGENE_PERSON`,
`FREMD_MITARBEITER`), Schichtverantwortung (`SCHICHT`, gestuft nach eigen / Bereich / Springer-Pool /
fremd), Planung und Leitung samt Kundenrolle (`VOLL_BETRIEB`, `VOLL_PERSON`). Der Betreiber bekommt den
ganzen Bestand.

Die Spalten beziehen sich auf eine **fremde Person aus einem anderen Bereich** (für die
Schichtverantwortung also außerhalb ihres Bereichs). Die eigene Person bekommt jede Rolle vollständig.

Spalten: **MA** Beschäftigte · **BR** Betriebsrat · **SV** Schichtverantwortung · **PL** Planung ·
**LT** Leitung (ebenso Kundenrolle) · **BT** Betreiber · **VA-LT** Vollausgabe der Leitung ·
**VA-SK** Vollausgabe mit Sicherungsschlüssel. ✓ = wird ausgeliefert, – = nicht.

| Datenklasse | MA | BR | SV | PL | LT | BT | VA-LT | VA-SK | |
|---|---|---|---|---|---|---|---|---|---|
| Personendaten für den Plan (Name, Zugehörigkeit, Rolle, Qualifikationen …) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Kontakt: Telefon, Anschrift | – | – | – ¹ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Kontakt: E-Mail (Kontaktangabe für Planung und Leitung) | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Notfallkontakt | – | – | – | – | – | ✓ | – | ✓ | A |
| Bank, Steuer, Sozialversicherung, Lohn/Gehalt | – | – | – | – | – | ✓ | – | ✓ | A |
| frühere Anmeldeadresse | – | – | – | – | – | ✓ | – | ✓ | A |
| Gesundheits-/Schutzmerkmale (fremder Bereich) | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Gesundheits-/Schutzmerkmale (eigener Bereich der SV) | – | – | ✓ roh | ✓ | ✓ | ✓ | ✓ | ✓ | S |
| Qualifikationen | ✓ ² | ✓ ² | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Zeiterfassung (fremd; Grund) | – | Zeiten ohne Grund | – ³ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Stempeldaten, Ortsurteil | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Abwesenheiten mit Anmerkung | „abwesend" | „abwesend" | „abwesend" ⁴ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Anträge (fremd) | nur offene Tauschgesuche | – | nur offene Tauschgesuche ⁵ | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Nachrichten anderer | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Notrufe anderer | – | – | nur Bereich und an sie | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Dienstbuch | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C |
| Übergaben | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C |
| Tagesnotizen (`notizen` „tag\|…") | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C |
| Personennotizen (`notizen` „person\|…") | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Ausschreibungen mit Bewerbungen | nur eigene | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C |
| Kalendergeheimnis, -verweis, -stand | – | – | – | – | – | ✓ | – | – | A |
| Push-Schlüssel, Zustelleinstellungen | – | – | – | – | – | ✓ | – | – | A |
| Adressänderungen im Betrieb | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | B ⁶ |
| Lohnarten | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Betriebsprotokoll | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | A |
| Billing: Konditionen, Vertrag, Rechnungsangaben, USt-ID | – | – | – | – | – | ✓ | – | – | A |
| Betreiberfelder: interne Notiz, Raumkennung, Firmenstamm, Preisliste, Selbststarts | – | – | – | – | – | ✓ | – | – | A |
| Rechnungen (eigener und anderer Betriebe) | – | – | – | – | – | ✓ | – | – | A |
| Betreiberprotokoll | – | – | – | – | – | ✓ | – | – | A |
| andere Betriebe des Raums | – | – | – | – | – | ✓ | – | – | A |
| unbekannte neue Felder (Person, Betrieb, oben) | – | – | – | – | – | ✓ | – | – | A |

¹ im eigenen Bereich und Springer-Pool ✓ (Telefon, Mobil). ² ohne Status-Qualifikationen.
³ im eigenen Bereich Zeiten ohne Grund. ⁴ im eigenen Bereich Kategorie ohne Anmerkung.
⁵ im eigenen Bereich vollständig (zum Entscheiden). ⁶ Die Oberfläche schreibt sie beim Ändern der eigenen
Anmeldeadresse fort; ein Umbau dieses Schreibwegs steht aus.

Ganz oben im Bestand bekommen alle Rollen außer dem Betreiber nur `version`, `stand`, `session` und
genau den eigenen Betrieb (A).

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
| `/kalender/einrichten`, `/kalender/daten`, `/kalender/loeschen` | jede Rolle mit eigener Person (Betreiber nicht) | nur die eigene Person aus der Sitzung (Raum, Betrieb, Person); `personId` im Rumpf zählt nicht; ein aktiver Feed je Person (Index nur als Hash); fremde und unbekannte Geheimnisse ohne Wirkung und mit gleicher Antwort (Commit 3) | A |
| `/kalender/feed/<geheim>.ics` | wer das Geheimnis hat | liest den Feed (Bearer); ungültig nach erneutem Einrichten oder Löschen | A |
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
| Bereichsbezug für Dienstbuch, Übergaben, Tagesnotizen, Ausschreibungen | eigener Schritt |
| Rohe Schutzmerkmale für die Schichtverantwortung im eigenen Bereich statt abgeleiteter Aussagen | Schuld, mit der gemeinsamen Planrechnung |
| Adressänderungen im Betrieb (Schreibweg der eigenen Anmeldeadresse) | eigener Schritt |
| Wortlaut „Alle Daten dieses Betriebs, jederzeit vollständig" in der Ansicht Datenmitnahme | UX-Text |
| Ein eigener HR-/DSGVO-Export für eine berechtigte Leitung, Trennung `/api/datenexport` / `/api/externes-backup` | eigener Schritt |
| Weg des Betreibers zu Sicherungsschlüsseln | bei Bedarf |
