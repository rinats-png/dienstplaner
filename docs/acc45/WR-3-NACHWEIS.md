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
   (nur sechs Ziffern; Schritt wird verbraucht) und Verfahren der Identitätsprüfung (`persoenlich`, `rueckruf`,
   `schriftlich`; optional Aktenzeichen). Die zweite Freigabe liefert das Abschlusstoken genau einmal (256 bit, nur
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

## 4. Entscheidungen, wo die Vorgaben schweigen (jeweils die strengere Wahl)

1. **Gesperrt ausgeliefert** (`CENTRIC_KONTOWIEDERHERSTELLUNG=1`, Vorgabe aus): J sagt „produktive Aktivierung bleibt
   eine eigene Freigabe"; die Benachrichtigung (I.11) ist nicht gebaut.
2. **Träger braucht Personenbezug**: ohne Person ist „keine Selbstfreigabe über ein zweites Konto" nicht prüfbar.
3. **Antragsteller = Träger**; ein stellvertretender Antrag (I.2) ist nicht gebaut.
4. **Verfahren der Identitätsprüfung bei jeder Freigabe Pflicht** (nicht nur bei der zweiten); kein Freitext,
   Aktenzeichen nur `[A-Za-z0-9._/-]{1,40}`.
5. **Einheitsregel** zwischen den beiden Freigebenden, über Code-Einheit und Einheit der Person am Tag; „ALLE"/leer
   zählt nicht. Keine Regel zwischen Freigebenden und Träger (nicht vorgegeben).
6. **Sperre nach Ablehnung** 24 h für denselben Träger (J.3 nennt nur „nach der Sperre der Bremsart").
7. **Bei laufendem Fall** wird ein Wiederherstellungscode beim Anmelden abgewiesen, nicht verbraucht; nur TOTP zieht
   den Fall zurück (E nennt nur TOTP).
8. **Uhr zurückgestellt** um mehr als 5 s hinter einen gespeicherten Beginn: Fall/Token gilt als abgelaufen.
9. **Freigebende**: nur Zugangscodes mit aktivem Faktor; Konten (E-Mail/Passwort, auch mit Kontofaktor aus OPT-1-F)
   sind in WR-3 nicht freigabeberechtigt (J.2e: bis WR-9). Für OPT-2 ist dafür ein zweiter Aufrufer der Bibliothek nötig.
10. **Wirkung gescheitert** nach dem Verbrauch des Tokens: Token bleibt verbraucht, Faktor unverändert, neuer Fall nötig.
11. **Kein Betreiberprozess** (J.5/D8): Betreibercodes 403; das Kennzeichen „betreiberprozess" (Zählen geeigneter
    Leitungen) ist nicht gebaut — es öffnete ohnehin keinen Weg.

## 5. Offene Betreiberentscheidungen

- Freischaltung `CENTRIC_KONTOWIEDERHERSTELLUNG=1` (nach WR-5/WR-7, mit Benachrichtigung I.11).
- I.2 stellvertretender Antrag; I.3 Inhalt der Revision (Aktenzeichen Pflicht?); I.10 Interimsweg „neuer
  Zugangscode" umgeht Vier-Augen weiterhin; J.5 Betreiberprozess.
- Grenzwerte `GRENZEN.verlust` (I.12) bestätigen.

## 6. Restrisiken

- Sperren wirken im Prozess (Grenze H1 wie `zweifaktor.mjs`): genau ein Prozess je Ablage vorausgesetzt.
- Wer den Zugangscode des Trägers kennt, kann einen Fall eröffnen (Sitzungen enden) oder zurückziehen — Störung, kein
  Zugang; die Anmeldung mit TOTP zieht einen fremd eröffneten Fall zurück.
- Ohne Epochenbindung (`NODE_ENV=development/test`) schützt nur die absolute Frist vor zurückgespielten Ständen.
- Wer Serverzugang mit Pfeffer hat, ist nicht Gegenstand (WR-4).
