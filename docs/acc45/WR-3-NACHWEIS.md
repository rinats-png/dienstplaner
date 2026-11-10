# WR-3 – Kontowiederherstellung, Verlust-Schnittstelle: Nachweis

Stand 2026-11-10 · Branch `sicherheit/wr-3` · Basis `origin/integration/release-v4` @ `c8c643fd`.
Vorgaben: `work-packages.json` (WR-3; Entscheidungen 1 bis 4 vom 2026-11-09), `ENTSCHEIDUNGSREGISTER.md` B-03/B-04,
`KONTO-WIEDERHERSTELLUNG.md` Abschnitte D, E, J (liegt auf `acc45/konto/entscheidung`, nicht in der Basis).
Bindend (Betreiber): OPT-1-F Option A bleibt; kein E-Mail-Weg; keine Betreiber-Freischaltung als Anmeldeweg; ein
Code oder Token allein ergibt nie eine Sitzung.

## 1. Umfang

| Datei | Inhalt |
|---|---|
| `server/lib/kontowiederherstellung.mjs` (neu) | Freigabemechanik ohne HTTP: Fall, Zustände, Fristen, Regeln an Freigebende, Token, Sperre je Träger, Schlüsselepoche. Für OPT-2 und das Offline-Werkzeug (WR-4) wiederverwendbar. |
| `server/lib/kontowiederherstellung-zugang.mjs` (neu) | Zugangscode-Weg: `zweifaktorAktion` `verlust-melden`, `verlust-zurueckziehen`, `verlust-freigeben`, `verlust-ablehnen`, `verlust-einloesen` auf `/api/anmelden`; Bremsen, Antworten ohne Auskunft, Protokoll. Schalter `CENTRIC_KONTOWIEDERHERSTELLUNG=1`. |
| `server/lib/zweifaktor.mjs` | `faktorEpoche` (gemeinsame Epochenquelle), `zweifaktorStand` + `ausVerlust`/`faktorKennung`, `zweifaktorNachVerlustNeu` (Faktor in einem Schreibvorgang durch eine ausstehende Einrichtung ersetzen), `zweifaktorBeginnen` überschreibt eine Einrichtung aus einem Verlustfall nie. |
| `server/lib/betreiber-zweifaktor.mjs` | Verteilung der Aktionen; laufender Fall sperrt Abschalten und Neugenerierung, Wiederherstellungscode wird abgewiesen (nicht verbraucht), Anmeldung mit TOTP zieht den Fall zurück; Einrichtung aus einem Verlustfall steht unter Pflicht. |
| `server/funktionen/daten.mjs` | übergibt Raum, Mandant, Person, wirksame Rolle, Bestand an den Weg (aus der Ablage, nie aus der Anfrage). |
| `server/lib/schutz.mjs` | `GRENZEN.verlust` (3/h, Sperre steigend bis 24 h, fail-closed). |
| `server/lib/rechte.mjs` | `einheitAm` exportiert (unverändert). |

Kein neuer Endpunkt, keine neue Route, keine neue Rolle, kein neues Zugriffsrecht außer der Freigabe durch Leitung.

## 2. Ablauf

1. Träger (Zugangscode Leitung/Planung/Kunde mit aktivem Faktor und Personenbezug): `verlust-melden` → Fall `F-…`
   (80 bit), alle Sitzungen des Zugangs enden; Antrag 24 h.
2. Zwei Leitungen desselben Raums, Mandanten und Betriebs: `verlust-freigeben` mit eigenem Zugangscode, frischem TOTP
   (nur sechs Ziffern; Schritt wird verbraucht), Verfahren der Identitätsprüfung (`persoenlich`, `rueckruf`,
   `schriftlich`; optional Aktenzeichen) und der **Personalnummer der geprüften Person** (H1, Review #191). Sie wird
   unter der Sperre gegen die Person des Falls im gespeicherten Bestand geprüft (zeitkonstant); passt sie nicht oder
   fehlt im Bestand eine Personalnummer: dasselbe „nein" wie bei einem unbekannten Fall. Erst nach Erfolg nennt die
   Antwort, wessen Fall es ist (Vor-/Nachname, Einheit). Die zweite Freigabe liefert das Abschlusstoken genau einmal (256 bit, nur
   SHA-256 gespeichert, gebunden an Fall, Träger, Faktorzustand), 15 min, nie über die 24 h hinaus.
3. Träger: `verlust-einloesen` → Fall unter der Sperre „eingeloest" geschrieben, dann Sitzungen beendet und der Faktor
   in einem Schreibvorgang durch eine neue **ausstehende** Einrichtung ersetzt (Geheimnis einmal). Keine Sitzung.
4. `bestaetigen` mit dem ersten Code → neue Wiederherstellungscodes; danach die gewöhnliche Anmeldung.

## 3. Akzeptanz und Prüfungen (rot vor grün)

Rot auf der Basis: `server/` ohne die Änderungen (git stash), beide Dateien ausgeführt — Kern-Datei lädt nicht
(Modul fehlt, 25 Tests), HTTP-Datei 12 von 12 rot (jede Verlust-Aktion 400 „Unbekannte Aktion").

| Akzeptanz | Prüfung |
|---|---|
| Antrag höchstens 24 h | Kern „Antrag: knapp vor 24 h …", „Token endet spätestens mit dem Antrag"; HTTP „Antrag nach 24 h abgelaufen …" |
| Token 15 min | Kern „Token: knapp vor 15 min einlösbar, ab 15 min nicht"; HTTP dito (knapp davor 200, ab Frist 401) |
| frischer TOTP je Freigabe | HTTP „wiederholter Code, veralteter Code und Wiederherstellungscode werden abgewiesen" |
| nur Leitung im selben Mandanten | Kern „nur Leitung im selben Raum, Mandanten und Betrieb"; HTTP „nur Leitung desselben Mandanten …" (X1 anderer Mandant, Y1 anderer Raum, Planung, Mitarbeiter, Leitung ohne Person, Code Leitung/Person Mitarbeiter) |
| keine Selbstfreigabe | Kern „keine Selbstfreigabe …"; HTTP T4 selbst, „zweites Konto derselben Person (T1/TB)" |
| Einheitszugehörigkeit | Kern „zweite Freigabe: … nicht dieselbe Einheit" (betriebsweit zählt nicht); HTTP L3 (e1 wie L1) |
| Mandantentrennung / keine Auskunft | Kern „Fremder Mandant: dieselbe Auskunft wie unbekannt"; HTTP Antworten byte-gleich (unbekannt, fremd, unzulässig; Token abgelaufen/kein Fall/falsch) |
| Gleichzeitigkeit | Kern „rennende Freigaben", „doppeltes Einlösen", „gleichzeitiges Eröffnen"; HTTP „zwei rennende zweite Freigaben …" |
| Fehler fail-closed | Kern „Schreibfehler bei der zweiten Freigabe", „Schreibfehler beim Einlösen", „scheitert die Wirkung …", „anderer Faktorzustand oder Schreibfehler: der aktive Faktor bleibt" |
| Sicherungsstände | Kern „zurückgespielte Ablage belebt weder …", „abgelaufen bleibt abgelaufen", „Epoche nicht feststellbar"; HTTP „Token aus einer anderen Epoche …" |
| Token/Code allein keine Sitzung | HTTP Ablauf: nach Einlösen Anmeldung ohne Code 403, `beginnen` 409, alter TOTP keine Sitzung |
| Bremse | HTTP „Bremse je Zugang (GRENZEN.verlust)" |
| gesperrt ausgeliefert | HTTP „ohne Schalter … jede Verlust-Aktion 403" |
| Protokoll ohne Geheimnisse | HTTP „Protokoll ohne Token, Geheimnis oder Codes" |
| H1 Bindung an die Träger-Identität | Kern „H1: ohne passende Träger-Identität …"; HTTP „H1: Wer den Zugangscode des Opfers kennt …" |
| M1 getrennte Zähler, Sitzungen erst nach Eröffnung | HTTP „M1: Eröffnen und Rückzug haben getrennte Zähler"; „verlust-ablehnen …" (gesperrter Aufruf beendet keine Sitzung) |
| M2 Sperre erst nach zwei Personen | Kern „Ablehnung beendet den Fall; Sperre erst nach zwei …"; HTTP „verlust-ablehnen …" |
| L1 jetzige Einheiten, Betriebsdatum | Kern „L1: … JETZIGEN Einheiten"; HTTP „L1: Einheit am Betriebsdatum (Europe/Berlin)" |
| L2 ungewisse Wirkung | Kern „L2: wirft die Wirkung …" |
| Abschalten gesperrt, Wiederherstellungscode nicht verbraucht | HTTP Ablauf (Abschalten 409) und „frischer TOTP …" (Code danach noch gültig) |

Nachtrag Review #191: Rot auf 0e8b26de (`server/` des Vorstands, neue Prüfungen): siehe Abschnitt 7.

## 4. Entscheidungen, wo die Vorgaben schweigen (jeweils die strengere Wahl)

1. **Gesperrt ausgeliefert** (`CENTRIC_KONTOWIEDERHERSTELLUNG=1`, Vorgabe aus): J sagt „produktive Aktivierung bleibt
   eine eigene Freigabe"; die Benachrichtigung (I.11) ist nicht gebaut.
2. **Träger braucht Personenbezug**: ohne Person ist „keine Selbstfreigabe über ein zweites Konto" nicht prüfbar.
3. **Antragsteller = Träger**; ein stellvertretender Antrag (I.2) ist nicht gebaut.
4. **Verfahren der Identitätsprüfung bei jeder Freigabe Pflicht** (nicht nur bei der zweiten); kein Freitext,
   Aktenzeichen nur `[A-Za-z0-9._/-]{1,40}`.
5. **Einheitsregel** zwischen den beiden Freigebenden, über Code-Einheit und Einheit der Person am Betriebsdatum
   (Europe/Berlin, `heuteBerlin`); bei der zweiten Freigabe mit den JETZIGEN Einheiten beider (L1). „ALLE"/leer zählt
   nicht. Keine Regel zwischen Freigebenden und Träger (nicht vorgegeben).
6. **Sperre nach Ablehnung** (M2): Jede Ablehnung beendet ihren Fall (J.3) und wird protokolliert (Fall, pseudonyme
   Kennung, Grund). Einen neuen Fall sperrt erst die zweite Ablehnung durch eine **andere Person** innerhalb von 24 h
   (Sperre bis 24 h nach der älteren); eine einzelne Leitung kann den Träger so nicht wiederholt aussperren, zwei
   unabhängige Leitungen schon. Daneben bleibt die Bremse `GRENZEN.verlust` auf dem Eröffnen.
6a. **Zähler** (M1): Eröffnen (`vl:`) und Rückzug (`vz:`) zählen getrennt; der Rückzug wird nach Erfolg entlastet.
   Sitzungen enden erst, wenn der Fall wirklich eröffnet ist; gelingt das Beenden nicht vollständig, wird der Fall
   zurückgezogen (503).
6b. **Bindung an die Person** (H1): Personalnummer des Trägers als Pflichtangabe jeder Freigabe und Ablehnung; ohne
   Personalnummer im Bestand ist der Fall nicht freigebbar (fail-closed).
7. **Bei laufendem Fall** wird ein Wiederherstellungscode beim Anmelden abgewiesen, nicht verbraucht; nur TOTP zieht
   den Fall zurück (E nennt nur TOTP).
8. **Uhr zurückgestellt** um mehr als 5 s hinter einen gespeicherten Beginn: Fall/Token gilt als abgelaufen.
9. **Freigebende**: nur Zugangscodes mit aktivem Faktor; Konten (E-Mail/Passwort, auch mit Kontofaktor aus OPT-1-F)
   sind in WR-3 nicht freigabeberechtigt (J.2e: bis WR-9). Für OPT-2 ist dafür ein zweiter Aufrufer der Bibliothek nötig.
10. **Wirkung gescheitert** nach dem Verbrauch des Tokens: Token bleibt verbraucht, neuer Fall nötig. Meldet die Wirkung
    selbst ein Nein, ist der Faktor unverändert; wirft sie (Schreibfehler), ist ungewiss, ob die neue Einrichtung schon
    steht (Fall `wirkung: "ungewiss"`, Antwort `verlust: "ungewiss"`, L2). Ihr Geheimnis wurde dann nie ausgegeben; sie
    läuft nach 15 min ab, danach ist ein neuer Fall möglich.
11. **Kein Betreiberprozess** (J.5/D8): Betreibercodes 403; das Kennzeichen „betreiberprozess" (Zählen geeigneter
    Leitungen) ist nicht gebaut — es öffnete ohnehin keinen Weg.

## 5. Offene Betreiberentscheidungen

- Freischaltung `CENTRIC_KONTOWIEDERHERSTELLUNG=1` (nach WR-5/WR-7, mit Benachrichtigung I.11).
- I.2 stellvertretender Antrag; I.3 Inhalt der Revision (Aktenzeichen Pflicht?); I.10 Interimsweg „neuer
  Zugangscode" umgeht Vier-Augen weiterhin; J.5 Betreiberprozess.
- Grenzwerte `GRENZEN.verlust` (I.12) bestätigen.

## 6. Restrisiken

- **Gestohlener Zugangscode + Token ergibt einen neuen Faktor.** Das Einlösen verlangt nur den ersten Faktor und das
  Token; wer beides hat, richtet sein Gerät ein. Was die Bindung (H1) davon abfängt: Ein Angreifer, der nur den
  Zugangscode des Opfers kennt, einen Fall eröffnet und sich selbst bei zwei Leitungen ausweist, bekommt kein Token —
  die Leitungen geben die Personalnummer der GEPRÜFTEN Person ein (aus ihren eigenen Unterlagen), und die passt nicht
  zur Person des Falls. Nicht abgefangen: Die Leitungen übernehmen die Personalnummer ungeprüft vom Anwesenden, oder
  der Angreifer täuscht die Identitätsprüfung selbst (Ausweis, Rückruf); oder das Token wird nach der Ausgabe an den
  echten Träger abgefangen. Gegenmittel organisatorisch: Personalnummer aus der Personalakte, Übergabe nur persönlich
  oder per Rückruf an die hinterlegte Nummer (J.4), Benachrichtigung des Trägers (I.11, noch nicht gebaut).
- Sperren wirken im Prozess (Grenze H1 wie `zweifaktor.mjs`): genau ein Prozess je Ablage vorausgesetzt.
- Wer den Zugangscode des Trägers kennt, kann einen Fall eröffnen (Sitzungen enden) oder zurückziehen — Störung, kein
  Zugang; die Anmeldung mit TOTP zieht einen fremd eröffneten Fall zurück.
- Ohne Epochenbindung (`NODE_ENV=development/test`) schützt nur die absolute Frist vor zurückgespielten Ständen.
- Wer Serverzugang mit Pfeffer hat, ist nicht Gegenstand (WR-4).

## 7. Schalter wieder ausschalten (L4)

Wird `CENTRIC_KONTOWIEDERHERSTELLUNG` bei laufenden Fällen ausgeschaltet, antworten alle `verlust-*`-Aktionen 403.
Laufende Fälle bleiben bestehen und laufen nach 24 h ab; bis dahin gelten für den Zugang weiter: kein Abschalten,
keine Neugenerierung, Wiederherstellungscode abgewiesen; die Anmeldung mit Code aus der App zieht den Fall zurück.
Eine schon eingelöste, ausstehende Einrichtung lässt sich weiter mit `bestaetigen` abschließen; läuft sie ab, gibt
es mit ausgeschaltetem Schalter keinen Netzweg mehr (`beginnen` bleibt verweigert). Rückweg dann: neuer Zugangscode
durch Leitung oder Betreiber (Interimsweg, I.10; der alte wird gesperrt). Ein Offline-Werkzeug für Rollencodes gibt
es nicht (`werkzeug/betreiber-2fa-zuruecksetzen.mjs` gilt nur für Betreibercodes; Erweiterung ist WR-4).

## 8. Rot vor grün, Nachtrag Review #191

Neue und geänderte Prüfungen gegen `server/` auf 0e8b26de (git stash): 11 rot, 34 grün — Kern: H1, M2, L1, L2;
HTTP: Ablauf (Anzeige des Trägers), Protokoll, TB-Selbstfreigabe (Grund), M1, H1, Ablehnen/M2, L1. Mit den
Änderungen: Kern 28/28, HTTP 17/17.
