# WP-I29 Teil 1 — Batch-Infrastruktur (Attrappe, Schalter aus)

Stand: Teil 1 implementiert und lokal getestet. Nicht integriert, nicht auf Staging geprüft, nicht fachlich freigegeben.
Echte Modellaufrufe mit Personendaten bleiben hinter E-25/E-26; es gibt in diesem Stand **keinen** Anbieteraufruf und **keine** Verdrahtung
(kein `process.env`, keine Route, kein Eintrag in `server.mjs`, Gateway-Prozessschalter nicht angeschlossen).
**Nicht Teil dieses Pakets:** die Funktionen F4 (Leitungsbriefing), F11 (Frühwarnungen), F12 (Abschluss-Assistent) selbst, der nächtliche Lauf, Wochenbriefing, Leitstand-Ansicht.

## Was es ist

Ein generischer Auftrag, der eine begrenzte Menge voneinander unabhängiger Intelligence-Anfragen (z. B. je Tag oder Einheit) deterministisch durch das
bestehende Gateway (WP-I13) ausführt. Jeder Eintrag ist eine gewöhnliche Gateway-Anfrage; das Faktenpaket entsteht dort aus Rollensicht ∩ Positivliste
(WP-I11/I17), Gesundheits-, Abwesenheits- und Betriebsratsdaten sind damit wie bei jeder Einzelanfrage ausgeschlossen. Der Batch liest keinen Bestand.

| Teil | Datei |
|---|---|
| Batch-Lauf (`erzeugeBatchLauf`, `batchSpecLesen`) | `server/lib/intelligence/funktionen/batch-lauf.mjs` |
| Tests (läuft in `pruefung:intelligence`) | `pruefungen/intelligence-batch.test.js` |

## Regeln (per Test belegt)

- **Schalter aus (Vorgabe):** `gatewayAn(schalter)`, beide Ebenen `"an"`, sonst `KI_AUS` vor allem anderen; kein Gateway-Aufruf, nichts gemerkt. Das Gateway prüft seinen eigenen Schalter zusätzlich.
- **Spec (geschlossenes Schema, `BATCH_GRENZEN`):** `schluessel` (8–64 Zeichen), `eintraege` (1–50), optional `maxIE` (1–500), `fristMs` (1 s–10 min, Vorgabe 120 s), `parallel` (1–2, Vorgabe 1); Gesamtgröße höchstens 64 KiB; jeder Eintrag nur `funktion`, `eingabe`, optional `bezug` und gültig nach `pruefeAnfrage`. Sonst `KI_EINGABE`, bevor etwas läuft.
- **Rollen:** Es gibt in der Positivliste keinen eigenen Eintrag für „Batch“. Gate: Rolle `leitung` oder `planer` (sonst `KI_ROLLE`, auch für Beschäftigte, Schichtverantwortung, Betriebsrat, Betreiber, Kunde) UND je Eintrag `rolleDarf(Positivliste)`; F4 daher nur Leitung. Funktionen mit Fremdtext (F5, F6, F7A, F9, F16) sind nicht batchfähig. Die Funktion muss freigegeben sein (`funktionenFreigegeben`), sonst `KI_FUNKTION`.
- **Isolation:** Jeder Eintrag läuft für sich; ein Fehler steht nur in seinem Ergebnis (`fehler` mit Code, nie Meldungstext oder Inhalte), ein Rückfall des Gateways ist `nicht_verfuegbar` mit Code. Andere Einträge laufen weiter.
- **Idempotenz:** gleicher Schlüssel + gleiche Spec (im selben Bestand/Betrieb/Person) liefert denselben Auftrag ohne zweite Ausführung (`neu: false`); gleicher Schlüssel + andere Spec: `KI_EINGABE`. Fremde Aufträge sind nicht lesbar (`KI_NICHT_GEFUNDEN`, keine Auskunft über Existenz).
- **Kontingent:** (a) vor dem Start: Rest = Monatskontingent − Verbrauch und Tagesbudget − Verbrauch (nominell, strenger als die 1,1-Toleranz des Gateways) muss für die Mindestkosten (1 IE je Eintrag) reichen, sonst Status `kontingent_zu_knapp`, null Gateway-Aufrufe; ohne `limits` läuft nichts. (b) vor JEDEM Eintrag erneut (laufende Einträge als Reserve); (c) optionales Auftragsbudget `maxIE`; (d) meldet das Gateway `KI_KONTINGENT` oder `KI_LIMIT`, endet der Auftrag mit `kontingent_erreicht` bzw. `limit_erreicht`, der Rest ist `nicht_ausgefuehrt`. Das Gateway reserviert und bucht weiterhin selbst; der Batch bucht nichts.
- **Abbruch/Frist/Notschalter:** `abbrechen()` (kein weiterer Eintrag startet), Frist `fristMs` (geprüft vor jedem Eintrag), Notschalter während des Laufs (`ausgeschaltet`). Statuswerte: `laeuft`, `fertig`, `abgebrochen`, `frist_abgelaufen`, `kontingent_erreicht`, `kontingent_zu_knapp`, `limit_erreicht`, `ausgeschaltet`.
- **Lesewege (Review F1):** `status`, `warten`, `ergebnis`, `abbrechen`, `verwerfen` prüfen bei jedem Aufruf Schalter (`KI_AUS`) und Rolle leitung/planer (`KI_ROLLE`); der Auftrag ist an Bestand, Betrieb, Person UND Rolle gebunden.
- **Kappen (F2):** höchstens 5 Aufträge je Person, 10 je Betrieb (laufende und gespeicherte), global 200 nur als Notbremse; Platz wird nur aus den eigenen beendeten Aufträgen geschaffen, sonst `KI_LIMIT` für den Verursacher, nie werden fremde Ergebnisse verdrängt. Gespeicherte Ergebnisse verfallen nach 1 Stunde (TTL).
- **Ablehnungen (F3):** `kontingent_zu_knapp` wird nicht gespeichert (`id: null`, Einträge direkt im Rückgabewert), belegt weder Platz noch Idempotenz-Schlüssel.
- **Rollenentzug (F4):** optionaler Haken `sitzungGueltig(sitzung)` wird vor jedem Eintrag aufgerufen; nicht `true` oder Wurf stoppt mit Status `nicht_mehr_berechtigt` (`KI_ROLLE`). Ohne Haken gilt die Sitzung des Starts (Verdrahtung muss den Haken liefern).
- **Fortschritt:** nur Zähler (`gesamt`, `fertig`, `nicht_verfuegbar`, `fehler`, `nicht_ausgefuehrt`, `laufend`), nie Inhalte. Es wird nichts protokolliert.
- **Determinismus:** Einträge laufen in Eingabereihenfolge, Ergebnisse stehen in Eingabereihenfolge (auch bei `parallel: 2`); gleiche Eingaben liefern gleiche Ergebnisse (die Alias-Bildung des Gateways ohne Ergebnis-Speicher hängt an dessen Auftrags-ID; im Test fest gesetzt).
- **Keine Schreibzugriffe:** das Modul hat keinen Store, keine Datei, kein Netz, keine Umgebung, kein Protokoll (Quelltextprüfung); Bestand bleibt gleich.
- **Anbieter aus:** ohne übergebenes Gateway ist jeder Eintrag `nicht_verfuegbar`, ohne Aufruf.

## Ergebnis-Format (Abweichung, begründet)

Der Ergebnis-Speicher (WP-I14) ist je Einzelanfrage über den Decision Fingerprint adressiert und für eine Auftragssammlung nicht gedacht. Die Auftragsergebnisse liegen daher
**nur im Prozessspeicher** (Kappen siehe oben, eigene älteste beendete werden verdrängt, `verwerfen()` gibt frei, Neustart leert alles), abrufbar nur für dieselbe Person im selben Bestand/Betrieb.
Legt der Aufrufer dem Gateway einen Ergebnis-Speicher bei, schreibt das Gateway seine Einzelergebnisse selbst unter den dort geltenden Regeln; der Batch ergänzt keine Persistenz.

## Offene Punkte

1. **Verdrahtung:** kein HTTP-Weg, kein Scheduler, kein Prozessschalter (Betreiberfreigabe). Der Lauf ist eine Funktion.
2. **F4/F11/F12:** Spezifikationen, Gateway-Funktionen (Schema, Prompt, Prüfer, Katalog), Schwellenkonfiguration und Leitstand-Ansicht fehlen; „kein Ereignis → kein Aufruf“ und der Rückfall auf Kennzahlen gehören in die Funktionen.
3. **Mindestkosten:** die tatsächliche Größenklasse (1/3/7 IE) steht erst nach dem Faktenpaket fest; der Vorabtest nutzt 1 IE je Eintrag, der Verbrauch wird je Eintrag nachgeprüft. Ein einzelner Eintrag kann `maxIE` daher um höchstens seine eigenen Kosten überschreiten.
4. **Gateway-Limits:** je Person/Stunde und Parallelität (Vorgabe 2 je Betrieb) bleiben die des Gateways; große Aufträge enden dann mit `limit_erreicht`. Eine Drosselung statt Abbruch wäre eine Produktentscheidung.
5. **Persistenz von Aufträgen** (Neustartfestigkeit, nächtlicher Lauf) braucht ein eigenes Löschkonzept und DSFA-Abgleich; bewusst nicht gebaut.
6. **Frist** wirkt zwischen den Einträgen; ein laufender Gateway-Aufruf wird durch dessen eigene Frist (`deadlineMs`) begrenzt.
7. **SSOT:** `docs/acc45/work-packages.json` (WP-I29) bleibt unverändert, da nur Teil 1 und kein Feature.
