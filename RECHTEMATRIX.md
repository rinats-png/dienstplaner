# Rechtematrix — Lesesicht und Verwaltungswege

Stand: Abschluss des Blocks 1e (Commits 1e.1, 1e.2, 1e.2a, 1e.3, 1e.4a, 1e.4b, 1e.4).
Regressionstest: `pruefungen/rechtematrix.test.js` — jede Zeile der Tabelle unten ist dort ein Marker
mit Erwartung je Rolle und Lesepfad. **Matrix und Test werden zusammen geändert.**

Einordnung je Zeile:

- **A** sauber
- **B** bewusst offen bis Commit 4 (Versand und Empfängerauflösung auf dem Server)
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
| Kontakt: E-Mail | – | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | B |
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
| Push-Schlüssel, Zustelleinstellungen | – | – | – | ✓ | ✓ | ✓ | – | – | B |
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
| `/kalender/*` | jede Sitzung | `einrichten` nimmt die Person aus dem Rumpf; ein Geheimnis erlaubt Lesen und Überschreiben des Feeds | offen bis **Commit 3** |
| `/zustellung/senden` | jede Sitzung | sendet mit freiem Text an jede Person des eigenen Betriebs (Empfänger löst der Server auf) | **B** |

## 3. Bewusst offen

| Punkt | bis |
|---|---|
| Kalender-Endpunkte an die eigene Person binden | Commit 3 |
| Versand und Zustellung auf dem Server; danach `pushSchluessel`, `zustellung`, `email` aus fremden Personensichten von Planung und Leitung entfernen; die Schichtverantwortung erzeugt Mitteilungen derzeit ohne Mail-/Push-Weg | Commit 4 |
| Bereichsbezug für Dienstbuch, Übergaben, Tagesnotizen, Ausschreibungen | eigener Schritt |
| Rohe Schutzmerkmale für die Schichtverantwortung im eigenen Bereich statt abgeleiteter Aussagen | Schuld, mit der gemeinsamen Planrechnung |
| Adressänderungen im Betrieb (Schreibweg der eigenen Anmeldeadresse) | eigener Schritt |
| Wortlaut „Alle Daten dieses Betriebs, jederzeit vollständig" in der Ansicht Datenmitnahme | UX-Text |
| Ein eigener HR-/DSGVO-Export für eine berechtigte Leitung, Trennung `/api/datenexport` / `/api/externes-backup` | eigener Schritt |
| Weg des Betreibers zu Sicherungsschlüsseln | bei Bedarf |
