# WP-I30 Teil 1 — F5 Nachrichten-Werkstatt (Vorlagen, deterministisch, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; in diesem Stand gibt es **keinen** Modellaufruf (kein Gateway eingehängt, Anbieter aus).
Bereitschaftsanalyse: „gegen Attrappe; live E-25“.

## Was es ist

Die Planung/Leitung entwirft eine Mitteilung an Beschäftigte. Die Werkstatt liefert einen **Textentwurf** aus einem geschlossenen Katalog neutraler deutscher Vorlagen
und die **Liste der Personen, die angesprochen werden dürfen**. Sie **sendet, speichert und plant nichts** (`gesendet: false`).

| Vorlage | Parameter | Platzhalter |
|---|---|---|
| `schichtwechsel` | datum, dienstart, einheit | Datum, Dienstart, Uhrzeit (aus der Dienstart der Sicht), Einheit |
| `planaenderung` | datum, einheit | Datum, Einheit |
| `dienstplan_veroeffentlicht` | monat | Monat |
| `erinnerung_dienstplan` | monat | Monat |
| `dienstbeginn_erinnerung` | datum, dienstart, einheit | Datum, Dienstart, Uhrzeit, Einheit |

| Teil | Datei |
|---|---|
| Serverseitiger Kern | `server/lib/intelligence/funktionen/nachrichten-werkstatt.mjs` (`nachrichtenEntwurf`, `NACHRICHTEN_VORLAGEN`) |
| Tests | `pruefungen/intelligence-nachrichten-werkstatt.test.js` (läuft in `pruefung:intelligence`, keine Verdrahtung nötig) |

**Zugang: nur `leitung` und `planer`** (Positivliste F5, `rolleDarf`; die Positivliste enthält F5 für PLANUNG, sie wurde nicht geändert). Schichtverantwortung, Beschäftigte, Betriebsrat, Kunde, Betreiber, anderer Betrieb: `KI_ROLLE` bzw. `KI_NICHT_GEFUNDEN`, ohne dass etwas geladen wird.

## Regeln (per Test belegt)

- **Schalter aus (Vorgabe):** `gatewayAn(schalter)`, beide Ebenen `"an"`, sonst `KI_AUS` vor allem anderen; dazu Freigabe `F5` (`funktionenFreigegeben`), sonst `KI_FUNKTION`.
- **Nur Rollensicht und ausdrückliche Parameter:** Platzhalter werden ausschließlich aus `bestandFuerRolle` und der Anfrage gefüllt. Keine Namen, kein Freitext, keine Abwesenheit, kein Grund, keine Klärung, kein Betriebsratsdatum, keine Ist-Zeit.
- **Entwurfsregel:** ein Tag oder Monat, der für Beschäftigte noch Entwurf ist (`istEntwurfstag`), wird nicht in einen Text an Beschäftigte geschrieben: `abgelehnt`, Grund `entwurf`; ein Tag in der Vergangenheit: Grund `vergangen`. Ausgabe ohne Entwurf und ohne Empfänger.
- **Verbotsprüfung des endgültigen Textes und Betreffs** (auch des vom Modell polierten): Leck-Prüfung (`textPruefen`, Sperrliste aus den Personen der Sicht: Gesundheitsbegriffe, Kontaktdaten, Namen), zusätzliche Gesundheitsstämme (krank, Attest, Diagnose, Grippe, Chemo, Klinik, Schwangerschaft …) und harte Muster für E-Mail/Telefon/Adresse. Befund: Entwurf **verweigert** (`verbotener_inhalt`), nicht angezeigt. Ein Sweep über ein Jahr Tage und Monate zeigt, dass übliche Ausgaben nicht zu Unrecht abgelehnt werden (die Vorlagen sind so gesetzt, dass eine Jahreszahl nicht vor Fließtext steht: die Leck-Prüfung hielt „2026 gibt es …“ für eine IBAN).
- **Empfänger:** Beschäftigte (`mitarbeiter`, `subplaner`) des Betriebs in der Sicht, am Bezugstag im Dienstverhältnis, bei Tagesvorlagen aus der genannten Einheit; nie die Absenderin, Leitung/Planung, Betriebsrat, Ausgeschiedene. **Abwesenheiten, Krankmeldungen und Klärung ändern die Liste nie.** Höchstens 200 (`gekuerzt`), Betrieb höchstens 1000 Personen.
- **Gateway (optional, nur Attrappe/Gateway-Weg):** nur für `leitung`/`planer`; das Modell bekommt **die Vorlage mit Platzhaltern** (`{Datum}` …), nie ein Datum, eine Dienstart, eine Einheit oder einen Namen (Positivliste F5: keine Betriebsdaten). Der Rückgabetext zählt nur, wenn die Kennzeichnung stimmt, jeder Platzhalter vorkommt wie in der Vorlage und die Verbotsprüfung des gefüllten Textes besteht; sonst bleibt der deterministische Text. Ohne Gateway/Anbieter: `modell: nicht verfügbar`, der deterministische Entwurf wird gezeigt. Fehlertexte verlassen das Modul nie.
- **Grenzen:** Betreff höchstens `TITEL_MAX` (120), Text höchstens `TEXT_MAX` (500) der Mitteilungen; Empfänger 200; keine Wiederholung der Anfrage in einer Meldung; kein console, kein Schreiben, kein Netz, keine Umgebungsvariable (Quelltextprüfung).
- Keine Route, kein neues Recht: `RECHTEMATRIX.md` und das Routeninventar bleiben unverändert.
- **Mutationsprüfung:** Empfänger nach Krankabwesenheit filtern: 10 Tests schlagen an; Entwurfsregel entfernen: 4; Verbotsprüfung entfernen: 25.

## Erledigt / offen

| Punkt | Stand |
|---|---|
| Vorlagenkatalog, Empfängerliste, Entwurfsregel, Verbotsprüfung, Schalter, Rollen, Tests | erledigt (dieser Stand) |
| **Versand** | **offen (späteres Teilpaket, Produktentscheidung):** über das bestehende Mitteilungssystem (`mitteilungen.mjs`: Titel/Text-Grenzen; `zustellregeln.mjs`: Entwurfsregel, RB-4, neutrale Hinweise nach außen, Bremsen) mit eigenen Sperren; Zustimmung der Absenderin vor dem Anlegen; nichts wird automatisch gesendet oder geplant |
| **Route/Oberfläche** | **offen:** Eine Route nach dem Vorbild `/api/hilfe/*` (Arbeitssitzung, `bremse`, Schalter, `arbeitssitzung.test.js`, Routeninventar, `RECHTEMATRIX.md`) und eine Oberfläche (Entwurf bearbeiten, Empfänger wählen) sind nicht eingehängt; Betreiberfreigabe nötig |
| **Modelltext live (E-25/E-26)** | **offen:** nur gegen die Attrappe getestet; ein echter Anbieter erst nach E-25/E-26 und dem Gateway-Weg `/ki` |
| Freitext der Nutzerin („Entwurf aus Stichworten“, Übersetzung) | offen: braucht Eingabewarnung (Plan: Gesundheitswörter blockiert), Namenspolitik (`fremdtext`) und Gateway; hier bewusst nicht enthalten |
| Weitere Vorlagen (z. B. Schulung, Tauschaufruf) | offen: je Vorlage Platzhalter, Sicht und Verbotsprüfung neu prüfen |
| Positivliste F5 hat `felder: []` | unverändert; passt, weil dem Modell nur die Vorlage ohne Betriebsdaten gegeben wird |

## Nachtrag (Review)

- Verbotsprüfung gehärtet (lokale Zusatzliste, `leckpruefung.mjs` unverändert): zusätzliche Stämme quarant, psych, infekt, erkält, magen, isolation, urlaub, abwesen, fehlzeit und das Einzelwort „AU“; geprüft wird auch eine Fassung, in der aufeinanderfolgende Einzelbuchstaben zusammengezogen sind („K r a n k“, „K-r-a-n-k“, „A U“); Umlaute werden vorher normalisiert. Harmlose Namen (Früh, Station 3, Geschäftsstelle, Nachtwache, Wohnbereich Ost, Kurzdienst) bleiben zulässig (Negativtests).
- Wortlaut `dienstbeginn_erinnerung`: „… zum Dienstbeginn, falls Sie eingeteilt sind“ — wahr für alle Empfänger der Einheit.
- **Offen für den Versandschritt/die Oberfläche:** Die Empfängerliste einer Tagesvorlage ist „alle Beschäftigten der Einheit“, nicht „die Eingeteilten“. Der Versandschritt und die Oberfläche müssen diese Bedeutung der Empfänger der Absenderin eindeutig zeigen.
