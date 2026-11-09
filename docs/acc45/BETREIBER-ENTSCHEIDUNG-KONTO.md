# Entscheidungsvorlage: Wiederherstellung des alleinigen Betreiberkontos

Stand 2026-11-09 · Basis Branch `acc45/konto/wiederherstellung-plan` @ `e51a1f9` · Nur Vorlage, keine Code-Änderung.
Gehört zu [`KONTO-WIEDERHERSTELLUNG.md`](KONTO-WIEDERHERSTELLUNG.md) (Abschnitte F, I.6, J). Zeilenangaben beziehen sich
auf den Baum dieses Branches. Aussagen über den Produktionszustand werden hier **nicht** gemacht.

> **Was heute gilt: GESPERRT.** Für das alleinige Betreiberkonto gibt es bis zur Entscheidung über diese Vorlage
> **keinen freigegebenen Wiederherstellungsweg**. Weder ein Netzweg noch ein organisatorischer Ersatzweg wird vorab
> eröffnet. Was in den Abschnitten 3–9 unter „Nach Entscheidung erlaubt“ steht, ist **nicht** in Kraft, solange die
> Entscheidung I.6 (KONTO-WIEDERHERSTELLUNG.md) nicht schriftlich getroffen und umgesetzt ist.

## 1. Ist-Stand (Repo, nicht Produktion)

1. Pflicht für den Betreiberfaktor in production, ohne Abschalter über das Netz: `server/lib/betreiber-zweifaktor.mjs:52–55`, `:216–220`.
2. Einziger technischer Rückweg bei Totalverlust: `werkzeug/betreiber-2fa-zuruecksetzen.mjs:1–34` → `betreiberZweifaktorZuruecksetzen` `server/lib/betreiber-zweifaktor.mjs:357–381`.
3. Voraussetzung des Werkzeugs: Datenordner (`CENTRIC_DATEN`), Pfeffer (`CENTRIC_PFEFFER`), Betreibercode über stdin, `--ja` (`werkzeug/betreiber-2fa-zuruecksetzen.mjs:51–57`); Server gestoppt (Prozesssperre `:59–61`).
4. Geprüft wird nur: Code existiert, nicht gesperrt, Rolle `betreiber` (`betreiber-zweifaktor.mjs:368–369`). **Keine** Identitätsprüfung, **keine** zweite Person, **keine** Wartezeit, **keine** Benachrichtigung, **kein** Abbruch.
5. Wirkung: Sitzungen enden, alter Faktor + Codes gelöscht, sofort neue ausstehende Einrichtung, Geheimnis einmal im Terminal (`betreiber-zweifaktor.mjs:371–380`; Werkzeug `:72–74`).
6. Protokoll: eine Warnzeile „offline zurückgesetzt“ ohne Akteur und ohne Aktenzeichen (`betreiber-zweifaktor.mjs:378–379`).
7. Die Rolle `betreiber` ist keine Mitgliedschaftsrolle (`server/lib/accounts.mjs:158`) und steht über allen Rollen (`server/lib/rollenvergabe.mjs:32–39`); kein Kunde kann einen Betreibercode prägen (Plan F, `daten.mjs:348–351`).

**Folgerung:** Das Werkzeug ist eine **Server-Wartungsfunktion**, kein Wiederherstellungsprozess. Wer Datenordner und
Pfeffer hat, beherrscht die Instanz ohnehin vollständig (Plan F). Jede in dieser Vorlage gewählte Schutzmaßnahme
(Vier-Augen, Wartezeit, Benachrichtigung) ist daher **nur so stark wie der Schutz des Serverzugangs**: Solange das
Werkzeug mit Serverzugang allein wirkt, kann der Inhaber des Serverzugangs jede netzseitige Regel umgehen. Die
Entscheidung muss deshalb **das Werkzeug mit einschließen** (Prüfpunkt 6 und 8).

## 2. Verbindliche Vorgaben (gelten für jede Option)

- **Keine versteckten Mastercodes**, kein Universaltoken, kein Umgebungsschalter, der Faktor oder Codes überspringt.
- **Keine universellen Notfallpasswörter.** Jeder Wiederherstellungsnachweis ist an genau ein Betreiberkonto, eine
  Faktor-Generation und einmalige Verwendung gebunden.
- **Keine automatische Wiederherstellung allein über E-Mail.** E-Mail darf benachrichtigen, nie freigeben.
- **Fail-closed:** Ist eine Voraussetzung nicht prüfbar (Ablage, Pfeffer, zweite Instanz), gilt „abgelehnt“, nie „durch“.
- **Kein vorgezogener Weg:** Keine Option wird teilweise vor der Entscheidung aktiviert. Bis dahin bleibt der Sonderfall
  gesperrt (Kasten oben); Netz-Aktionen für die Rolle `betreiber` antworten 403 (Plan F, feste Regel 1).
- Revision: Jede Wiederherstellung erzeugt einen Fall mit Aktenzeichen, Verfahren, beteiligten Kennungen und Zeitpunkten;
  keine Ausweiskopie und kein Klartextgeheimnis im System (Plan E, Fall-Datensatz).

## 3. Prüfpunkt: Sichere Offline-Wiederherstellungscodes

| Option | Vorteile | Nachteile | Risiken |
|---|---|---|---|
| A. Bestehende 10 Codes (Format w2 nach WR-1) ausdrucken, Ablage beim Betreiber (Tresor) | kein Dritter nötig; schon vorhanden | gleicher Ort wie Gerät → Totalverlust bei Brand/Diebstahl wahrscheinlich gemeinsam | Diebstahl des Ausdrucks = Übernahme mit Betreibercode |
| B. Codesatz versiegelt bei Vertrauensinstanz (Umschlag, Siegelnummer im Fall vermerkt) | räumlich getrennt; Öffnung nachweisbar | Instanz muss erreichbar sein; Siegelkontrolle organisatorisch | Instanz öffnet unbefugt; Austausch des Umschlags |
| C. Codes aufgeteilt (Hälfte A beim Betreiber, Hälfte B bei Instanz; ein Code gilt nur vollständig) | keiner allein kann wiederherstellen | Bau nötig (Teilprüfung), Bedienfehler | Verlust einer Hälfte = Verlust des Codes |

- **Verbrauch:** einmalig unter Sperre je id (Plan C); Verbrauch erzeugt Protokoll und Benachrichtigung (Prüfpunkt 7).
- **Erneuerung:** nur mit frischem TOTP (Plan D2); nach jedem Öffnen eines versiegelten Satzes Pflicht zur Neugenerierung
  und Neuversiegelung; alte Generation sofort ungültig (Plan T10).
- **Empfehlung:** **B**, ergänzt um eine zweite, beim Betreiber getrennt verwahrte Ausfertigung derselben Generation nur,
  wenn I.6 das ausdrücklich zulässt. C nur, wenn die Instanz dauerhaft erreichbar ist.

**Heute:** Codes existieren (Format v1, Lücken laut Plan A.3); kein Verfahren zu Aufbewahrung/Versiegelung beschlossen.
**Nach Entscheidung erlaubt:** gewählte Aufbewahrung; Neugenerierung nach WR-1/WR-2.

## 4. Prüfpunkt: Vorab registrierte zweite Vertrauensinstanz

| Option | Wer | Registrierung / Verifikation | Rotation | Bewertung |
|---|---|---|---|---|
| A. Zweiter personengebundener Betreiberzugang | Vertreter/Mitgesellschafter mit eigenem Code + eigenem Faktor | Anlage nur aus Betreibersitzung mit frischem Faktor; Identität beim Anlegen dokumentiert | bei Personalwechsel sofort sperren + neu | stärkste technische Lösung; braucht eine zweite verfügbare Person |
| B. Externe Instanz ohne Systemzugang | Notar, Steuerberater, Rechtsanwalt | schriftliche Vereinbarung, Hinterlegungsprotokoll, Rückrufnummer aus Vertrag | jährliche Bestätigung (Frist zu entscheiden) | kein Systemzugang = kein Missbrauch im System; nur Verwahrung/Bestätigung |
| C. Hosting-Anbieter | Rechenzentrum/Provider | dessen Kontoverfahren | – | prüft Serverzugang, **nicht** CENTRIC-Identität; nur ergänzend |

- **Empfehlung:** **A, sobald eine zweite Person verfügbar ist; bis dahin B.** C nie allein.
- Verifikation bei Inanspruchnahme: Rückruf über die bei Registrierung hinterlegte Nummer, nicht über eine im Antrag
  genannte.

**Heute:** keine Instanz registriert (Repo kennt kein Feld dafür). **Nach Entscheidung erlaubt:** Registrierung nach
gewählter Option, mit Fall-Aktenzeichen.

## 5. Prüfpunkt: Nachweisbare Identitätsprüfung

| Verfahren | Vorteile | Nachteile |
|---|---|---|
| Persönliche Vorsprache bei der Instanz mit Ausweis | hohe Sicherheit | Anreise, Zeit |
| Rückruf an hinterlegte Nummer + Kontrollfrage aus Hinterlegungsprotokoll | schnell | SIM-Tausch, Social Engineering |
| Schriftliche Bestätigung des Vertragspartners (Handelsregister-Vertretungsberechtigter) | gerichtsfest | langsam |

- **Dokumentation:** im System nur Aktenzeichen, Verfahren (Schlüssel aus fester Liste), Kennung der prüfenden Stelle,
  Zeitpunkt; die Akte selbst liegt außerhalb (Plan E).
- **Revision:** Fall-Datensatz unveränderlich nach Abschluss; Protokollzeile je Zustandswechsel.
- **Empfehlung:** Vorsprache **oder** Rückruf **plus** schriftliche Bestätigung; Rückruf allein reicht nicht.

**Heute:** keine Prüfung (Ist-Stand 4). **Nach Entscheidung erlaubt:** Freigabe nur mit dokumentiertem Verfahren.

## 6. Prüfpunkt: Vier-Augen bei alleinigem Betreiber – wer ist der Zweite?

| Option | Zweiter Freigebender | Vorteile | Nachteile / Risiken |
|---|---|---|---|
| A | Zweiter Betreiberzugang (Prüfpunkt 4A), frischer eigener Faktor | technisch erzwingbar | Absprache zweier Betreiber |
| B | Externe Instanz bestätigt Identität; technische Freigabe durch Betreiber selbst über Offline-Werkzeug | kein zweiter Systemnutzer | kein echtes Vier-Augen im System; Werkzeug bleibt Ein-Personen-Weg |
| C | Externe Instanz hält Hälfte eines Freigabenachweises (Prüfpunkt 3C) | Vier-Augen technisch, ohne Systemzugang | Bau nötig; Verlust einer Hälfte |
| D | Kein Zweiter, nur Wartezeit | einfach | **erfüllt Vier-Augen nicht** – nicht empfohlen |

- **Empfehlung:** **A**; ohne zweite Person **C**. B nur als Übergang mit ausdrücklichem Risikovermerk. D abgelehnt.
- Das Offline-Werkzeug muss dieselbe Zweitfreigabe verlangen (z. B. zweiter Betreibercode + dessen TOTP, oder Hälfte C),
  sonst ist die Regel über den Serverzugang umgehbar (Abschnitt 1, Folgerung).

**Heute:** gesperrt; Werkzeug ist Ein-Personen-Weg. **Nach Entscheidung erlaubt:** Wiederherstellung nur mit gewählter
Zweitfreigabe, netzseitig und offline gleich.

## 7. Prüfpunkt: Schutz vor unbefugter Übernahme

| Maßnahme | Ausgestaltung | Zweck |
|---|---|---|
| Zwei-Kanal | Antrag über System **und** Bestätigung über einen zweiten, vorab hinterlegten Kanal (Rückruf/Instanz) | ein kompromittierter Kanal reicht nicht |
| Wartezeit | zwischen Freigabe und Wirksamkeit; Dauer zu entscheiden (I.6) | echter Inhaber kann reagieren |
| Benachrichtigung | an alle hinterlegten Kanäle des Betreibers und an die Instanz, bei Eröffnung, Freigabe, Wirksamkeit; Inhalt ohne Geheimnisse | Entdeckung |
| Abbruch | Login mit gültigem TOTP oder gültigem Code zieht den Fall zurück (Plan E); Instanz kann abbrechen | Codedieb kann nicht aussperren |
| Sitzungen | beim Wirksamwerden enden alle Betreibersitzungen (Ist-Stand 5) | keine Altsitzung |

- **Empfehlung:** alle fünf Maßnahmen, keine einzeln abwählbar. E-Mail nur als Benachrichtigungskanal.

**Heute:** nur „Sitzungen enden“ (Werkzeug). **Nach Entscheidung erlaubt:** Wirksamkeit erst nach Ablauf der Wartezeit
ohne Abbruch.

## 8. Prüfpunkt: Verfahren bei Verlust sämtlicher Faktoren

Vorschlag (gilt erst nach Entscheidung):
1. Betreiber meldet Verlust bei der Instanz (Zwei-Kanal); Fall mit Aktenzeichen wird eröffnet.
2. Identitätsprüfung nach Prüfpunkt 5, dokumentiert.
3. Zweitfreigabe nach Prüfpunkt 6.
4. Wartezeit mit Benachrichtigung und Abbruchmöglichkeit (Prüfpunkt 7).
5. Ausführung: Offline-Werkzeug **mit** Zweitfreigabe (oder Netzweg, falls gebaut); Ergebnis ausstehende Einrichtung,
   nie „kein Faktor“ (Plan T13).
6. Bestätigung mit erstem TOTP, neue Codes, Neuversiegelung (Prüfpunkt 3), Abschluss des Falls.
7. Auswertung: Wie kam es zum Totalverlust? Schutz des Serverzugangs prüfen.

Verliert der Betreiber zusätzlich den Serverzugang, ist zuerst dieser über den Hosting-Anbieter wiederherzustellen
(Prüfpunkt 4C); CENTRIC kann das nicht ersetzen.

**Heute:** gesperrt; kein freigegebener Ablauf. Das Werkzeug ist im Repo vorhanden; seine Anwendung auf echte
Betreiberkonten ist nach Plan F nicht freigegeben.

## 9. Prüfpunkt: Zweite Vertrauensinstanz nicht erreichbar

| Option | Verhalten | Risiko |
|---|---|---|
| A. Sperrzustand bleibt | keine Wiederherstellung, bis Instanz erreichbar | Ausfall der Betreiberfunktionen; Kundenbetrieb läuft weiter, soweit er keine Betreiberaktion braucht |
| B. Eskalation an benannte Ersatzinstanz (vorab registriert) | nach Frist Ersatz | zweite Registrierung nötig |
| C. Rückfall auf Ein-Personen-Weg nach Frist | – | **unzulässig**: wäre ein vorhersehbarer Bypass |

- Fristen (Erreichbarkeit, Eskalation) sind Betreiberentscheidung; diese Vorlage nennt bewusst keine Zahlen.
- **Empfehlung:** **B mit A als Grundzustand**; C ausgeschlossen.

**Heute:** gesperrt (entspricht A). **Nach Entscheidung erlaubt:** Eskalation nur an vorab registrierte Ersatzinstanz.

## 10. Gesamtempfehlung

Zweiter personengebundener Betreiberzugang als Vier-Augen-Partner (ersatzweise geteilte Freigabe mit externer
Instanz), Offline-Codes versiegelt bei der Instanz, dokumentierte Identitätsprüfung, Wartezeit mit Benachrichtigung
und Abbruch; das Offline-Werkzeug erhält dieselbe Zweitfreigabe. Bis dahin: gesperrt.

## 11. Zu entscheiden (Teil von I.6 in KONTO-WIEDERHERSTELLUNG.md)

| # | Frage | Empfehlung |
|---|---|---|
| 6a | Aufbewahrung Offline-Codes (3) | B, versiegelt bei Instanz |
| 6b | Vertrauensinstanz (4) | A, sonst B; C nie allein |
| 6c | Identitätsprüfung (5) | Vorsprache oder Rückruf + schriftliche Bestätigung |
| 6d | Zweiter Freigebender (6) | A, sonst C |
| 6e | Wartezeit-Dauer, Benachrichtigungskanäle (7) | alle Maßnahmen; Dauer vom Betreiber zu beziffern |
| 6f | Offline-Werkzeug nachrüsten (Zweitfreigabe, Aktenzeichen im Protokoll) | ja, Voraussetzung für Aufhebung der Sperre |
| 6g | Nichterreichbarkeit (9): Fristen, Ersatzinstanz | B mit A als Grundzustand |
