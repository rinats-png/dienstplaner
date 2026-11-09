# WP-I18 – Datenschutz- und Löschkonzept für den KI-Anbieteranschluss (Entwurf)

Stand: Entwurf. Alle Fristen sind **Entwurfswerte** und **Betreiberentscheidungen**; dieses Dokument legt keine Frist fest, es führt Optionen mit Empfehlung auf. Es ist keine Rechtsberatung; Rechtsfragen sind als „offen für den Betreiber“ markiert (Kanzlei, E-25). Keine Personendaten, keine Hosts, keine Zugangsdaten.

Grundlage im Repo: `server/lib/intelligence/gateway/ergebnis.mjs` (Fristen 30/90 Tage, E4/E7/E9), `zaehlerspeicher.mjs`, `audit.mjs`, `server/lib/raumloeschung.mjs`, `docs/acc45/wp-i11-nachweis.md` (Positivliste, Alias, Leck-Prüfung), `wp-i14-nachweis.md`, `INTELLIGENCE-ENTWICKLUNGSPLAN.md` (I14, I18).

## 1. Datenarten im KI-Pfad

| Nr. | Datenart | Inhalt | Ablage | Personenbezug |
|---|---|---|---|---|
| D1 | Anfrage | Funktion, Rolle, Bezug, Zeitraum, Sprache | nur im Arbeitsspeicher des Vorgangs | keine Namen; Bezug nur als Alias/Kennung |
| D2 | Faktenpaket | Schnitt aus Rollensicht und Positivliste; Personen und Dienstarten als Alias (keyed HMAC) | Arbeitsspeicher; geht an den Anbieter | pseudonym, nicht anonym (A5 in wp-i11: Rückschluss bei kleinem Team offen) |
| D3 | Alias-Karte | Zuordnung Alias zu Person | nur im Server, nie im Paket, Protokoll oder JSON | ja, bleibt lokal; Schlüssel nur Umgebung/Betreiber |
| D4 | Anbieterantwort | Rohtext des Modells | Arbeitsspeicher | Alias-Form |
| D5 | Ergebnis-Speicher | geprüfte Antwort, Alias-Form | Store `centric-ki-lauf`, Schlüssel `ki:erg:<raum>:<fingerprint>` | pseudonym |
| D6 | Decision Context | Zahlen, Regelkennungen, Versionen, Stufen, Prüfcodes | `ki:ktx:<raum>:<ctxId>` | keine Namen, keine Alias, keine Texte (E3) |
| D7 | Zähler | append-only Ereignisse plus Rollup, Betrieb nur als Hash | `ki:zaehler:ev:*`, `ki:zaehler:roll` | keine Person, kein Raum im Klartext |
| D8 | KI-Protokoll | Weißlisten-Ereignis: Art, Funktion, Rolle, Ergebniscode, Auftragskennung, Betriebs-Hash, Stufe, Dauer | Protokollsenke des Betriebs | keine Person, kein Text, kein Raum (U1) |
| D9 | Anbieterseitig | Anfrage/Antwort beim Anbieter | beim Anbieter | Pseudonym; Frist und Training vertraglich (E-25) |

## 2. Aufbewahrung: Optionen und Empfehlung (alle Fristen Entwurf)

| Datenart | Option A | Option B | Option C | Empfehlung (Entwurf) |
|---|---|---|---|---|
| D1/D2/D4 | Ende des Vorgangs, nichts persistieren | – | – | A (heutiger Stand) |
| D5 Ergebnis | 30 Tage (Code-Vorgabe und Obergrenze) | 7 Tage | keine Speicherung | A; Betreiber kann kürzen, nie über die Obergrenze |
| D6 Kontext | 90 Tage (Code-Vorgabe und Obergrenze) | 30 Tage | – | A, da ohne Namen |
| D7 Zähler | Ereignisse bis zur Faltung, Rollup mit Monatswerten 13 Monate | 3 Monate | – | A als Entwurf; personenfrei, Frist ist Abrechnungsfrage (Abrechnung serverseitig und unveränderlich: Betreiber/Steuer prüfen) |
| D8 Protokoll | Frist des Betriebsprotokolls übernehmen | eigene kürzere Frist | – | A; Betreiber entscheidet, ob Revisionsinteresse längere Frist trägt |
| D9 Anbieter | Zero-Data-Retention (keine Speicherung) | kurze Missbrauchsprüfung beim Anbieter | – | A als Ziel; B nur nach schriftlicher Zusicherung und Betreiberfreigabe (E-25) |

Durchsetzung heute: Löschlauf in `ergebnis.mjs` (E4/E7/E9) für `ki:erg`/`ki:ktx`, Vorgabe „an“, höchstens stündlich beim Schreiben; abgelaufene Einträge sind beim Lesen unerreichbar; das Gateway startet nicht mit einem Modus ungleich „an“. Gelöscht wird nur Gelesenes, das abgelaufen oder beschädigt ist.

## 3. Löschwege

### 3.1 Raumlöschung
`raumLoeschen` (`server/lib/raumloeschung.mjs`) setzt zuerst die Marke `loeschung:<raum>`, räumt Scherben, Stände, Sicherungen, Konten, Mitgliedschaften, Push, Zustellung u. a. ab und meldet Fehler mit Schlüssel statt sie zu verschlucken; `vollstaendig` erst, wenn nichts mehr da ist. Aufrufer: Betreiberkonsole (`server/funktionen/daten.mjs`), automatischer Löschlauf (`aufraeumen.mjs`), Rückbau der Provisionierung (`provisionierung.mjs`).

**Lücke (Stand dieses Branches):** Die Schlüssel `ki:erg:<raum>:*` und `ki:ktx:<raum>:*` liegen im eigenen Store `centric-ki-lauf`; `raumLoeschen` räumt sie nicht ab. Bis dahin wirkt nur die Frist (30/90 Tage). Der Plan (I14, WP-I10) sieht vor: Raumlöschung bereinigt die `ki:*`-Schlüssel des Raums über einen Löschlauf (`loeschlauf.mjs`, PR 159) mit Nachholen nach Neustart.

**Verdrahtung nicht Teil dieses PR:** `loeschlauf.mjs` liegt im Integrationsbranch nicht vor (`server/lib/intelligence/gateway/` enthält es nicht). Der Haken `kiBereinigen` wird deshalb hier nicht an die drei Aufrufstellen von `raumLoeschen` übergeben. Nach dem Merge von PR 159 nachzuholen, jeweils mit zuerst rotem Test. Das Präfix `ki:erg:<url-kodierter Raum>:` trifft nie einen anderen Raum (E1). Zähler (D7) tragen nur den Betriebs-Hash; ihre Löschung bei Raumlöschung ist **offene Entscheidung** (Betreiber: Abrechnungsnachweis gegen Löschpflicht).

### 3.2 Kündigung
Kündigung beendet die KI-Nutzung; Raumlöschung nach der vereinbarten Rückgabefrist (Betreiberentscheidung, Betriebs-AVV) mit denselben Wegen wie 3.1. Option A: sofortige Bereinigung der `ki:*`-Schlüssel des Betriebs zum Kündigungsstichtag, Rest nach Frist. Option B: alles zusammen mit der Raumlöschung. Empfehlung: A (Personenbezug früher weg, Rollup bleibt). Beim Anbieter: schriftliche Löschbestätigung einfordern (offen, E-25).

### 3.3 Auf Anfrage (Betroffene, Betrieb)
- Löschersuchen laufen über den Betrieb (Verantwortlicher); der Betreiber ist Auftragsverarbeiter.
- Ergebnisse (D5) sind pseudonym und nicht personenweise adressierbar; die Alias-Karte (D3) ist die einzige Zuordnung. Wird die Person im Betrieb gelöscht, verfallen D5 nach Frist; vorzeitig: `ki:*`-Einträge des Raums bereinigen (Wirkung wie 3.1, nur `ki:*`). Personenweises Löschen einzelner Ergebnisse ist heute nicht möglich (offen).
- Ein Alias-Schlüsselwechsel entkoppelt gespeicherte Alias von Personen; alte Einträge werden über den Fingerprint unerreichbar (wp-i14).

## 4. Nachweise für das Löschen

| Nachweis | Quelle |
|---|---|
| Löschlauf-Ergebnis `{ modus, geprueft, faellig, geloescht, fehler }` | `ergebnis.mjs` (E4/E9) |
| Raumlöschung: `{ raum, geloescht, vollstaendig, fehler[] }`, Marke `loeschung:<raum>` bis zum Ende | `raumloeschung.mjs` |
| Zweiter Aufruf auf gelöschten Raum folgenlos | `raumloeschung.mjs` |
| Tests zu Fristen, Isolation, Löschlauf | Prüfungen zu WP-I14 (siehe wp-i14-nachweis.md) |
| Protokoll ohne Personendaten (Auftragskennung, Betriebs-Hash) | `audit.mjs` |
| Stichprobe nach Löschung: Auflisten von `ki:erg:<raum>:` und `ki:ktx:<raum>:` leer | Betreiberverfahren (Entwurf; nach Verdrahtung automatisierbar) |
| Anbieter: schriftliche Löschbestätigung, ZDR-Zusicherung | extern, E-25 offen |

## 5. Datenschutz-Checkliste (Entwurf, offen für den Betreiber)

Legende: [x] technisch im Code umgesetzt und getestet; [ ] offen (Betreiber/Kanzlei).

**Zweck**
- [x] Zweckbindung je Funktion über Funktionsregister und Rollenmatrix; Betriebsrat/Betreiber lösen nie aus (wp-i11).
- [ ] Zweckbeschreibung für Verzeichnis der Verarbeitungstätigkeiten und Mitarbeiterinformation.
- [ ] Rechtsgrundlage und Mitbestimmung je Betrieb.

**Minimierung**
- Darf an den Anbieter: Alias statt Namen, Dienstart-Alias, Zahlen, Zeiten, Daten, Regelkennungen; nur Felder der Positivliste im Schnitt mit der Rollensicht.
- Nie an den Anbieter: Klarnamen, Kontaktdaten, Abwesenheitsgründe (nur „abwesend“), Schutz-/Gesundheitsmerkmale (bei externem Modellort ohne Person), Schlüssel, Zugangsdaten, Alias-Karte, Freitexte aus Fremdquellen.
- [x] Leck-Prüfung fail closed vor dem Anbieteraufruf und vor dem Speichern (E2); ohne Sperrliste kein Paket, kein Schreiben.
- [ ] Restrisiko Rückschluss auf Personen bei kleinen Teams (A5): rechtlich zu prüfen.

**Auftragsverarbeitung**
- [ ] AVV mit dem KI-Anbieter, Unterauftragsverarbeiter benannt.
- [ ] Zero-Data-Retention je Modell schriftlich zugesichert (Betreiberfreigabe E-25); „kein Training“ zugesichert.
- [ ] AVV Betreiber–Betrieb deckt den KI-Pfad (Entwurf mit Platzhaltern, Anwaltsprüfung nicht erfolgt).
- [ ] Technisch-organisatorische Maßnahmen des Anbieters geprüft.

**Drittlandübermittlung (offener Betreiberpunkt)**
- [ ] Verarbeitungsort und Unterauftragsverarbeiter; falls Drittland: Grundlage und Transfer-Folgenabschätzung durch die Kanzlei.
- [ ] Keine Kundenaussage „Daten verlassen die EU nie“ ohne Beleg.
- [x] Gateway fail closed: ohne Betreiberschalter (`CENTRIC_KI_MODUS`, Vorgabe aus) kein Anbieteraufruf.

**Betroffenenrechte**
- [ ] Auskunft: Betrieb liefert; D5/D6 sind pseudonym, Zuordnung nur serverseitig (Verfahren offen).
- [ ] Löschung/Berichtigung: Wege nach 3.3; personenweise Einzellöschung offen.
- [ ] Widerspruch, Einschränkung, Art. 22 (kein Pfad veröffentlicht ohne Mensch; rechtliche Bewertung offen).
- [ ] DSFA (F7B/F8) und Fristenbestätigung durch den Betreiber.

## 6. Offene Betreiberpunkte
1. Bestätigung der Fristen D5 bis D9 (Entwurf 30/90 Tage u. a.).
2. E-25: AVV, Zero-Data-Retention je Modell, Drittland, Löschbestätigung des Anbieters.
3. Löschung der Zähler (D7) bei Raumlöschung/Kündigung.
4. Personenweise Einzellöschung (Verfahren, Aufwand).
5. Verdrahtung `kiBereinigen` nach Merge von PR 159 (technisch, aufgeschoben).
6. Rechtsprüfung: Rückschluss auf Personen (A5), Art. 22, Mitbestimmung.
