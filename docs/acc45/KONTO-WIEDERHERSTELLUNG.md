# Kontowiederherstellung bei verpflichtender 2FA – Umsetzungsplan

Stand 2026-11-09 · Basis `origin/integration/release-v4` @ `47ca6ea` · Nur Plan, keine Code-Änderung.
Zeilenangaben ohne Vorsatz beziehen sich auf diese Basis. **Δ** = Branch `acc45/sicherheit/si-p4-delta` @ `ac1e06d`
(lokal; inhaltsgleich mit `origin/acc45/sicherheit/si-p4-auflagen`, auf `origin` unter dem Delta-Namen noch nicht vorhanden).

Freigegeben ist der **technische Weg** (Konzept Punkte 1–4). Nicht freigegeben: produktive Aktivierung, Änderung echter
Betreiberkonten, Ausstellung echter Freigaben. Alles, was eine Betreiber-/Organisationsentscheidung braucht, wird
**gebaut, aber gesperrt** ausgeliefert (fail-closed) und steht in Abschnitt I.

---

## A. Ist-Stand

1. **Faktor-Kern** `server/lib/zweifaktor.mjs`: TOTP (RFC 6238, ±1 Schritt, Schritt-Sperre gegen Wiederholung) :83–133; Geheimnis AES-256-GCM, Schlüssel per HKDF aus `CENTRIC_PFEFFER`, AAD = id :147–192; Ablage je Träger unter `zweifaktor:<id>` :230.
2. **Wiederherstellungscodes existieren bereits**, rollenneutral: zehn Stück :48, erzeugt :212–216, einmal ausgegeben beim Bestätigen :330–334, verbraucht beim ersten Treffer :386–394, Restzahl in `zweifaktorStand` :280–281. Prüfung unter In-Prozess-Sperre je id :243–259 (Grenze H1 :238–242).
3. **Lücken im Bestand:** Speicherung = HMAC-SHA256 mit rohem Pfeffer, ohne Salz, ohne id-Bindung :206–210; Code = 2×5 Zeichen aus 26er-Alphabet mit `b % 26` (Modulo-Verzerrung, ≈47 bit) :201, :213; **keine Neugenerierung** (Codes nur bei `zweifaktorBestaetigen` :322–336); kein Verbrauchszeitpunkt; Generation :333 gilt nur für Nachweise :366, nicht für Codes.
4. **Betreibercodes** `server/lib/betreiber-zweifaktor.mjs`: Aktionen über `/api/anmelden` (`beginnen/bestaetigen/abschalten/stand`) :142–239; Pflicht in production ohne Abschalter :52–55; Abschalten über Netz unter Pflicht verweigert :216–220; ausstehende Einrichtung nicht überschreibbar :148–157; frischer Faktor für Betreiberaktionen (eigener Zähler `bf:`) :271–333; **Offline-Rücksetzung** :357–381 via `werkzeug/betreiber-2fa-zuruecksetzen.mjs:1–34` (Serverzugang + Pfeffer + Betreibercode).
5. **Verwalterschlüssel** `server/funktionen/einrichten.mjs`: Faktor gilt für jeden Aufruf :83–158, Pflicht in production :108, Wiederherstellungscode als Faktor akzeptiert :152–153, Abschalten :170–179; Rückweg bei Totalverlust = `CENTRIC_ADMIN` wechseln (`zweifaktor.mjs:224–227`).
6. **Code-Konten entstehen** über `/api/zugaenge` nur aus Betreibersitzung (`daten.mjs:332–335`), nie Rolle `betreiber` (`daten.mjs:348–351`), mit frischem Faktor (`daten.mjs:366–367`), Ablage `daten.mjs:403`; über `/einrichten` (`einrichten.mjs:511`, Betreiberrolle möglich `einrichten.mjs:491`); Anmeldung per Code `daten.mjs:990` (Faktor) → `daten.mjs:1003` (Sitzung).
7. **Accounts (E-Mail/Passwort)** `server/funktionen/anmeldung.mjs`: Anmeldung :249–344 (Bremse vor scrypt :259–268), Cookie-Sitzung `accountsitzungen.mjs:164`; **kein zweiter Faktor für Accounts** (Δ `SI-P4-NACHWEIS.md:109–111`). Betriebswahl `betriebsauswahl.mjs:155`, Arbeitssitzung `betriebsauswahl.mjs:255`; Prüfung je Anfrage `arbeitssitzung.mjs:191`.
8. **Sitzungen** `sitzungen.mjs:158` (Dauer 12 h / Betreiber 2 h :67–68). Bremse `GRENZEN.zweifaktor` 5/300 s, Sperre 900 s steigend bis 86400 s, fail-closed `schutz.mjs:422–423`; Protokoll `schutz.mjs:1164`.
9. **Δ SI-P4** fügt Rollenfaktor für `leitung/planer/subplaner/kunde` hinzu (Δ `betreiber-zweifaktor.mjs:85–95`, `codeZweifaktor`/`ART` :190–225), Sitzungsabbruch ohne Faktor (Δ `arbeitssitzung.mjs:242–248`), Kontoweg gesperrt (Δ `betriebsauswahl.mjs:249–256`); Totalverlust dort = „neuer Zugangscode“, kein Offline-Weg (Δ `SI-P4-NACHWEIS.md:106–108`, :221–224).
10. **Bestehende Tests:** Code einmal `pruefungen/zweifaktor.test.js:222`, Betreiber `pruefungen/betreiber-zweifaktor.test.js:147`, Bremse :154, Pflicht/Offline `pruefungen/betreiber-zweifaktor-pflicht.test.js:6`. **Kein Test für gleichzeitige Code-Verwendung** (kein `Promise.all` auf Codes in beiden Dateien).

## B. Abgrenzung zu SI-P4-Delta und Reihenfolge

SI-P4-Delta ändert 17 Dateien (+1464/−34), davon die Kerndateien dieses Plans. `zweifaktor.mjs` selbst ändert Δ **nicht**.

| Datei | Δ ändert | Wiederherstellung ändert | Konflikt |
|---|---|---|---|
| `server/lib/betreiber-zweifaktor.mjs` | +221: `codeZweifaktor`, `ART`, `rollenSitzungOhneFaktor`, Vermerk `zweiterFaktor` | neue Aktionen im Aktions-Dispatcher, Sperrzustand, Rollenprüfung Freigabe | **hoch** – gleicher Dispatcher |
| `server/funktionen/daten.mjs` | Anmeldeblock ~985–1012, Sitzungsprüfung ~1126–1137, `merkenErlaubt` | Sperrzustand „Verlust offen“ beim Login, `faktorArt` in Sitzung | **hoch** |
| `server/lib/arbeitssitzung.mjs` | +8 bei :242 | Sperre privilegierter Aktionen bei offenem Fall (gleiche Stelle) | mittel |
| `server/lib/betriebsauswahl.mjs` | +9 bei :249 | erst mit Account-2FA (WR-9) | niedrig |
| `server/funktionen/einrichten.mjs` | +7 Umgebungsbericht :327–347 | Aktion `wiederherstellung-neu` im Block :160–222 | niedrig |
| `server/funktionen/anmeldung.mjs` | +12 :469–479 | erst mit Account-2FA (WR-9) | niedrig |
| `server/lib/zweifaktor.mjs` | – | Kern (Format v2, Neugenerierung) | **keiner** |
| `pruefungen/betreiber-zweifaktor.test.js`, `src/betreiber-2fa.jsx`, `src/main.jsx` | ja | Tests, Anzeige Codes | mittel |

**Festgelegte Reihenfolge:**
1. SI-P4-Delta wird fertiggestellt, reviewt und nach `integration/release-v4` integriert (inkl. seiner Tests).
2. Erst danach werden Wiederherstellungs-Branches **von dem integrierten Stand** abgezweigt. Kein Rebase auf einen
   unfertigen Delta-Stand.
3. Ausnahme ohne Konfliktrisiko: WR-1 (nur `zweifaktor.mjs` + eigene Testdatei) darf vorher implementiert, aber erst nach
   Schritt 1 integriert werden.
4. WP-18 (berührt `daten.mjs`, `rechte.mjs`, App.jsx; `DEPENDENCIES.md:396`) und WR-2/WR-3 laufen **nacheinander**,
   nicht parallel, auf `daten.mjs`; Vorschlag: WR-2 vor WP-18, WR-3 nach WP-18 (personengebundene Codes ändern den
   Rückweg „neuer Code“).

## C. Datenmodell

**Codeformat (neu, Fassung w2):** 16 Zeichen aus 32er-Alphabet ohne Verwechsler (z. B. `ABCDEFGHJKMNPQRSTVWXYZ23456789` +
2 weitere, final in WR-1), gezogen per 5-Bit-Extraktion aus `randomBytes` (256 ist Vielfaches von 32 → **keine
Modulo-Verzerrung**, behebt :213). Anzeige `SSSS-VVVV-VVVV-VVVV`:
- `SSSS` = **Selektor** (20 bit, je Träger eindeutig, Neuwurf bei Kollision): wählt den Eintrag, ist kein Geheimnis.
- `VVVV…` = **Prüfteil** (60 bit): das Geheimnis.

**Prüfrepräsentation je Code:**
```
k_w   = HKDF-SHA256(CENTRIC_PFEFFER, salt="centric-zweifaktor", info="wiederherstellung-v2", 32)
vor   = HMAC-SHA256(k_w, "w2|" + id + "|" + codeGeneration + "|" + selektor + "|" + prueftteil_normiert)
wert  = scrypt(vor, salz16, N=32768, r=8, p=1, 32)        // Parameter wie passwoerter.mjs:59
```
Eintrag: `{ sel, salz, wert, verbraucht: null | ISO-Zeit }`.

**Warum so:**
- *Kein Klartext:* Wer die Ablage (Sicherung, Kopie von `/data`) liest, darf keine nutzbaren Codes erhalten.
- *Pfeffer-Bezug (HMAC mit HKDF-abgeleitetem Schlüssel):* Ohne Pfeffer ist nichts durchprobierbar (gleiches Prinzip wie
  `codes.mjs:16–19`); eigener abgeleiteter Schlüssel statt rohem Pfeffer trennt die Domänen sauber (heute roher Pfeffer :209).
- *Kein schnelles Hash allein:* Fließen Ablage **und** Pfeffer ab, begrenzen scrypt (≈32 MB/Versuch) und 60 bit Prüfteil
  das Offline-Raten auf praktisch unerreichbare Kosten; ein reines HMAC (heute) wäre bei ≈47 bit in Stunden bis Tagen
  durchsuchbar.
- *Salz je Code:* gleiche Codes bei verschiedenen Trägern ergeben verschiedene Werte; keine Vorberechnung.
- *Bindung an id und Generation:* ein in eine andere id oder ältere Generation kopierter Eintrag prüft nie (analog AAD :172).
- *Selektor statt 10× scrypt:* genau **ein** scrypt je Versuch; unbekannter Selektor → Schein-scrypt mit festem Salz
  (gleiche Laufzeit, keine Auskunft über Existenz). Bremse greift **vor** scrypt (Muster `anmeldung.mjs:259–268`).

**Struktur im Eintrag `zweifaktor:<id>`** (ersetzt Array `wiederherstellung`):
```
wiederherstellung: {
  v: 2,
  generation: <int, monoton steigend>,   // Neugenerierung: +1, alle Einträge ersetzt
  erzeugt: ISO,
  eintraege: [ {sel, salz, wert, verbraucht} × 10 ],
  verbrauchtZahl: <int>                  // Zähler, redundant zu eintraege[].verbraucht, Konsistenz geprüft
}
```
- Verbrauch: unter `unterSperre(id)` (:246) lesen → prüfen → `verbraucht` setzen → schreiben; erst nach erfolgreichem
  Schreiben `ok`. Schreibfehler = kein Erfolg (fail-closed).
- `zweifaktorStand.wiederherstellungUebrig` liest `eintraege.filter(e => !e.verbraucht).length`.
- **Altformat v1** (Array von Hex-HMAC): weiter lesbar und verbrauchbar bis zur ersten Neugenerierung (Entscheidung I.7);
  neue Einrichtungen schreiben nur noch v2. Keine Migration nötig (Testdatenvorgabe).
- Ohne Pfeffer: weder Erzeugen noch Prüfen (wie heute :207–208) → Prüfung scheitert, nie Bestehen.

## D. API-Entwurf

Grundsatz: kein neuer Weg, der mit **einem** Faktor mehr erlaubt als heute. Antworten tragen keine Personendaten, keine
Stacktraces, keine Unterscheidung „Code unbekannt / verbraucht / alte Generation“ (immer `zweifaktor: "falsch"`).

| # | Eingang | Aktion | Voraussetzung | Erfolg |
|---|---|---|---|---|
| D1 | `/api/anmelden` `{zugangscode, zweifaktor:"SSSS-…"}` | Anmeldung mit Wiederherstellungscode (besteht) | 1. Faktor + Code | Sitzung mit `faktorArt:"wiederherstellung"`, `merkenErlaubt:false`, `wiederherstellungUebrig` |
| D2 | `/api/anmelden` `{zugangscode, zweifaktorAktion:"wiederherstellungNeu", zweifaktor:"123456"}` | Neugenerierung (Code-Rollen, Δ `codeZweifaktor`) | 1. Faktor + **frischer TOTP** (kein Wiederherstellungscode, kein Nachweis) | `{ok, wiederherstellung:[10], generation}` genau einmal; alle alten ungültig |
| D3 | `/einrichten/zweifaktor` POST `{aktion:"wiederherstellung-neu"}` + Code | Neugenerierung Verwalter | Schlüssel + frischer TOTP (in `nurCode` aufnehmen, `einrichten.mjs:133`) | wie D2 |
| D4 | `/api/anmelden` `{zugangscode, zweifaktorAktion:"verlustMelden"}` | Fall eröffnen (Abschnitt E) | 1. Faktor; **nicht** für Rolle `betreiber` | `{ok, fall:"F-XXXX"}`; Sitzungen des Trägers enden |
| D5 | `/api/anmelden` `{zugangscode, zweifaktorAktion:"verlustEinloesen", freigabe:"…"}` | Freigabe einlösen | 1. Faktor + gültiges Freigabe-Token | neue **ausstehende** Einrichtung (Geheimnis einmal); Bestätigung wie heute → neue Codes |
| D6 | Offline `werkzeug/zweifaktor-freigabe.mjs` (neu) | Freigabe ausstellen | Serverzugang + Pfeffer + Fallkennung + Prüfvermerk | Token einmal im Terminal |
| D7 | Netz-Endpunkt Freigabe durch Kundenadmin | – | **gesperrt bis I.1** (liefert 403 `zweifaktor:"gesperrt"`) | – |

**Fehlercodes (einheitlich):** 400 `ungueltig` (Form) · 401 `falsch`/`erforderlich` · 403 `pflicht`, `rolle`
(z. B. D4 für Betreiber, D7), `gesperrt` · 409 `verlust-offen`, `ausstehend`, `aktiv` · 429 gebremst (`zuVielAntwort`)
· 503 `nicht-pruefbar` (Ablage/Bremse/Pfeffer fehlt). Falsche Codes antworten nach festen 400 ms (wie
`betreiber-zweifaktor.mjs:130`).

**Rate-Limit (`schutz.mjs` GRENZEN, alle `failClosed: true`):**

| Art | Schlüssel | Fenster | Versuche | Sperre |
|---|---|---|---|---|
| `zweifaktor` (besteht; TOTP **und** Wiederherstellungscode teilen den Zähler) | `b:`/`r:`/`v:`+id16, Herkunft | 300 s | 5 | 900 s steigend, max 86400 s |
| `zweifaktor-neu` (D2/D3) | id16, Herkunft | 3600 s | 3 | 3600 s steigend, max 86400 s |
| `verlust` (D4/D5) | `vl:`+id16, Herkunft, Fallkennung | 3600 s | 3 | 3600 s steigend, max 86400 s |
| Notbremse im Prozess (zusätzlich, wie `anmeldung.mjs:283`) | Herkunft, gesamt | 300 s | 20 / 200 | – |

Bremse vor jeder scrypt-Berechnung. Meldet die Bremse einen Ablagefehler → 503, nie Durchlass. Eigener Zähler für
Neugenerierung, damit Fehlversuche dort die Anmeldung des echten Inhabers nicht sperren (Muster `bf:` :313–315).

**Protokoll** (`schutz.mjs:1164`): Art `zweifaktor`, Ausgang, Zusatz nur aus fester Liste („Wiederherstellungscode
verbraucht · noch N“, „neu erzeugt · Generation G“, „Fall eröffnet F-XXXX“). **Nie** Code, Selektor, Salz, Wert, Token,
Geheimnis, otpauth. Kein Name im Zusatz (heute steht `wer.name` in `einrichten.mjs:135,146,153` – Prüfpunkt für WR-5).

## E. Verlust-Prozess (Konzept Punkt 2)

**Organisatorisch offen (I.1–I.4):** berechtigte Stelle, Identitätsprüfung, Revisionsnachweis, Übergabekanal.
Technisch wird ausschließlich die Schnittstelle gebaut; ohne Entscheidung kann nur der Offline-Weg D6 eine Freigabe
ausstellen, und auch der nur in Prüf-/Staging-Umgebungen mit Testdaten.

**Zustandsmaschine je Faktor-Träger (`id`):**
```
aktiv ──verlustMelden──▶ verlust-offen ──Freigabe (D6/D7)──▶ freigegeben ──verlustEinloesen──▶ ausstehend ──bestaetigen──▶ aktiv (neue Generation)
  ▲                         │                                   │ Ablauf (Vorschlag 24 h)
  └── Anmeldung mit gültigem TOTP: Fall „zurückgezogen“ ◀───────┘ → verlust-offen
```
- **Gesperrt in `verlust-offen` und `freigegeben`:** Anmeldung der Rolle (409 `verlust-offen`), Neugenerierung,
  `beginnen`, `abschalten`, Prägen/Ändern von Zugängen, Sicherungsschlüssel; laufende Sitzungen des Trägers werden beim
  Melden beendet (`sitzungenBeendenWenn`, Muster :87–93, fail-closed bei Teilfehler). Nicht privilegierte
  Mitarbeiter-Mitgliedschaften derselben Person bleiben unberührt.
- **Missbrauchsschutz:** Melden braucht den 1. Faktor; ein späterer Login mit gültigem TOTP zieht den Fall zurück
  (verhindert Aussperren durch einen Codedieb) und erzeugt eine Warnung.
- **Fall-Datensatz** `zweifaktor-fall:<fallId>`: `{id, rolle, mandantId, eroeffnet, stand, freigabe: {tokenHash, bis,
  durch: <Kennung der Stelle>, verfahren: <Schlüssel aus fester Liste>, aktenzeichen, zeit} | null, eingeloest}`.
  Keine Ausweisdaten, keine Namen, nur Verweis auf externes Aktenzeichen (Revision).
- **Freigabe-Token:** 256 bit `randomBytes(32)`, gespeichert nur als SHA-256 (Muster `nachweisHash` :218),
  gebunden an `id + fallId + Faktor-Generation`, Ablauf (Vorschlag 24 h, I.4), **einmalig**: Einlösen löscht den Hash
  unter `unterSperre(id)` vor jeder weiteren Wirkung.
- **Einlösen** (Muster `betreiberZweifaktorZuruecksetzen` :357–381): Sitzungen beenden → alter Faktor, Nachweise,
  Codes löschen → **sofort** neue ausstehende Einrichtung; der Träger steht nie in „kein Faktor, Einrichtung frei“.
- **Kein Weg allein per E-Mail:** Weder D4 noch D5 lassen sich per Mail-Link auslösen; ein späterer Passwort-Reset
  für Accounts (`registrierung.mjs:578`) darf einen Account-Faktor nie zurücksetzen (Auflage für WR-9).
- **Interimsweg „neuer Zugangscode“** (Δ `SI-P4-NACHWEIS.md:106–107`): bleibt technisch möglich (nur Betreibersitzung
  mit frischem Faktor, `daten.mjs:332`, :366); bis zur Entscheidung I.10 als Verlustfall manuell zu dokumentieren.

## F. Betreiberkonten (Konzept Punkt 3) – Entscheidungsvorlage

**Bestand:** Betreiberfaktor ist in production Pflicht ohne Abschalter (:52–55); Netz-Abschalten unter Pflicht
verweigert (:216–220); Totalverlust nur offline über Serverzugang + Pfeffer + Betreibercode (:357–381,
`wp32d-nachweis.md:39–60`). Betreibercodes kann ein Kunde nicht prägen (`daten.mjs:348–351`).

**Feste Regeln (unabhängig von der Entscheidung, werden gebaut und getestet):**
1. D4/D5/D7 lehnen Rolle `betreiber` mit 403 ab; keine Kundenrolle kann einen Fall für eine Betreiber-id eröffnen,
   freigeben oder einlösen (Mandantenprüfung + Rollenprüfung, beide fail-closed).
2. Kein Mastercode, kein Umgebungsschalter, der Faktor oder Codes überspringt, kein Universaltoken. Prüfung im Test:
   Suche nach Sonderpfaden (`grep`) + Negativtests.
3. Betreiber-Neugenerierung (D2) nur mit frischem TOTP; Gerätewechsel mit Wiederherstellungscode über das Netz bleibt
   verweigert (WP-32d-Begründung :213–215).

**Bewertung alleiniges Betreiberkonto ohne Vertrauensinstanz:** Der Offline-Weg prüft keine **Identität**, sondern den
Besitz von Serverzugang, Pfeffer und Betreibercode. Für einen alleinigen Betreiber ist das nicht schwächer als eine
Serverübernahme (wer `.env` und `/data` hat, hat ohnehin alles, :224–227), aber auch nicht stärker: Verliert der
Betreiber Gerät **und** Codes **und** den Serverzugang (oder ist er verhindert), gibt es keinen sicheren Weg.

**Empfehlung:** Eine sichere Wiederherstellung eines **alleinigen** Betreiberkontos ohne organisatorische Vertrauensinstanz
ist **nicht gewährleistet**. Empfohlen wird (I.5/I.6): (a) zweiter, personengebundener Betreiberzugang mit eigenem
Faktor **oder** (b) benannte Vertrauensinstanz (z. B. Steuerberater/Notar) mit versiegeltem Satz Wiederherstellungscodes
und dokumentiertem Öffnungsprotokoll; der Offline-Weg bleibt als technischer Rückweg mit Revisionsvermerk.

**Bis zur Entscheidung gesperrt:**
- jede netzseitige Verlust-/Freigabe-Funktion für Betreiber (D4/D5/D7 → 403);
- Ausführung des Offline-Werkzeugs gegen **echte** Betreiberkonten / Produktion (nur Testdaten, Staging);
- Erweiterung des Offline-Werkzeugs auf Kundenrollen in Produktion;
- Änderung oder Neuausstellung echter Betreiber-Faktoren/Codes (nicht Teil dieser Freigabe).

## G. Testplan

Neue Dateien: `pruefungen/wiederherstellung.test.js` (Unit, `zweifaktor.mjs`), `pruefungen/wiederherstellung-http.test.js`
(HTTP über `daten.mjs`/`einrichten.mjs`, Muster `betreiber-zweifaktor.test.js`).

**Rot-vor-grün-Vorgabe:** Jeder Test wird zuerst gegen die Basis (integrierter SI-P4-Stand) ausgeführt; die rote Ausgabe
(Testname, Erwartung, Ist) wird im Nachweis `docs/acc45/KONTO-WIEDERHERSTELLUNG-NACHWEIS.md` mit Commit-Hash festgehalten.
Für Verhalten, das schon grün ist (T1, T3), gilt **Mutationsnachweis**: gezielte Verfälschung (z. B. `neu[stelle] = null`
entfernen, `zweifaktor.mjs:392`) → rot dokumentieren → zurücknehmen → grün. Dann CI (Linux) maßgeblich.

| # | Anforderung | Art | Testfall | Rot auf Basis, weil |
|---|---|---|---|---|
| T1 | einmalige Verwendung | Unit | Code A anmelden → ok; `uebrig` 10→9; `verbraucht` gesetzt | Mutation (Bestand) |
| T2 | Wiederverwendung | Unit+HTTP | Code A zweites Mal → 401 `falsch`, keine Sitzung, kein Unterschied zur Antwort T3 | v2-Format fehlt |
| T3 | falsche Codes | Unit+HTTP | falscher Prüfteil, unbekannter Selektor, falsche Form, Code einer anderen id → je 401 gleicher Rumpf; Laufzeit unbekannter Selektor ≈ bekannter (Toleranz) | Schein-scrypt fehlt |
| T4 | gleichzeitige Versuche | Unit+HTTP | `Promise.all` 10× derselbe Code → genau 1 ok, 9 falsch; Ablage zeigt genau 1 `verbraucht` | Test fehlt heute; Regression gegen Sperre :243 |
| T5 | Rate-Limiting | HTTP | 5 falsche Codes aus 5 Herkünften → 6. (auch richtiger) 429; Bremse wirft → 503, nicht 200; D2: 3 Fehlversuche sperren nur `zweifaktor-neu`, nicht Anmeldung | Arten `zweifaktor-neu`/`verlust` fehlen |
| T6 | Mandantentrennung | HTTP | Code/Token aus Mandant A gegen Träger in Mandant B → 401; Fall von A in B nicht einlösbar; Freigabe-Token anderer id → 401 | Fall/Token fehlen |
| T7 | Rollenprüfung | HTTP | D4/D5 für Betreiber → 403 `rolle`; D7 (Kundenadmin) für Betreiber-id → 403; Mitarbeiterrolle → 400; Kundenadmin darf keinen Betreiberfall sehen | Endpunkte fehlen |
| T8 | Sperre privilegierter Aktionen | HTTP | nach `verlustMelden`: Anmeldung 409, bestehende Sitzung 401, `/api/zugaenge` 403, Neugenerierung 409; Mitarbeiter-Mitgliedschaft weiter nutzbar; TOTP-Login zieht Fall zurück | Zustand fehlt |
| T9 | Protokoll ohne Geheimnisse | Unit+HTTP | alle Protokollzeilen eines kompletten Ablaufs gegen Klartext-Codes, Selektoren, Token, Geheimnis, otpauth, Salz/Wert, E-Mail, Namen durchsuchen → 0 Treffer | `wer.name` in einrichten :135 |
| T10 | alte Codes nach Neugenerierung | Unit+HTTP | 10 Codes G1 → D2 → G2; jeder G1-Code 401; G2-Code ok; v1-Codes nach D2 ebenfalls 401; D2 mit Wiederherstellungscode/Nachweis statt TOTP → 401 | Neugenerierung fehlt |
| T11 | Freigabe-Token einmalig/Ablauf | Unit | Token zweimal → zweites 401; nach Ablauf 401; an andere Generation gebunden 401 | Token fehlt |
| T12 | Speicherform | Unit | Ablage enthält keinen Code-Klartext; `salz` je Eintrag verschieden; ohne Pfeffer kein Erzeugen/Prüfen; Selektoren eindeutig; Alphabet-Verteilung ohne Modulo-Bias (χ²) | v1 :206–216 |
| T13 | Einlösen ohne Lücke | Unit | nach D5 nie `kein Faktor, Einrichtung frei`; `beginnen` mit Code allein unter Pflicht → 409 | Einlösen fehlt |

**Bestehende Anforderungen, die grün bleiben müssen (Regressionsmenge):**
- SI-P4 (Δ): Pflicht nur bei Schalterwert „1“ (Δ :94–107); Rollen `leitung/planer/subplaner/kunde` (Δ :85); `merkenErlaubt`
  nur mit aktivem Faktor (Δ :180), **zusätzlich neu: nie nach Login mit Wiederherstellungscode**; Sitzung ohne Faktor endet
  (Δ `arbeitssitzung.mjs:242–248`); Kontoweg 403 `zweifaktor-pflicht` (Δ `betriebsauswahl.mjs:249–256`); Δ-Tests
  `rollen-zweifaktor*.test.js`, `betriebsauswahl.test.js`.
- WP-32d: Pflicht ohne Abschalter in production (:52–55); kein Netz-Abschalten unter Pflicht (:216–220); ausstehende
  Einrichtung nicht überschreibbar (:148–157); Offline-Rücksetzung inkl. Werkzeug; Betreibersitzungen ohne Faktor enden
  beim Start (:391–408); `betreiber-zweifaktor-pflicht.test.js`, `betreiber-zweifaktor.test.js`, `zweifaktor.test.js`.

## H. Teilpakete, Routing, Aufwand

Routing nach `MODELL-ROUTING.md`: expliziter `model`-Parameter, je Paket frischer Agent, keine Wiederaufnahme großer Kontexte.

| TP | Inhalt | Dateien | Modell | Aufwand PT (Band) | Abhängig von |
|---|---|---|---|---|---|
| WR-0 | SI-P4-Delta fertigstellen, reviewen, integrieren | Δ | (laufend) | – | – |
| WR-1 | Kern: Format w2, Erzeugen ohne Bias, Selektor+scrypt+HMAC/HKDF, Verbrauch mit Zähler, Neugenerierung `wiederherstellungNeu(store,id,totp)`, v1-Lesen | `zweifaktor.mjs` | **Opus** | 1,5 (1–2,5) | – (Merge nach WR-0) |
| WR-2 | Neugenerierung über D2/D3, `faktorArt` in Sitzung, `merkenErlaubt=false` nach Code-Login, Bremsarten | `betreiber-zweifaktor.mjs`, `daten.mjs`, `einrichten.mjs`, `schutz.mjs` | **Opus** | 1,5 (1–2) | WR-0, WR-1 |
| WR-3 | Verlust-Schnittstelle: Fall, Sperrzustand, Freigabe-Token, Einlösen, Sperre privilegierter Aktionen; D7 als 403-Stub | `zweifaktor.mjs`, `betreiber-zweifaktor.mjs`, `daten.mjs`, `arbeitssitzung.mjs` | **Opus** | 2,5 (1,5–4) | WR-2, WP-18 (Merge danach) |
| WR-4 | Betreiber-Abgrenzung + Offline-Werkzeug `zweifaktor-freigabe.mjs` (Revisionsvermerk, nur Testdaten) | `betreiber-zweifaktor.mjs`, `werkzeug/` | **Opus** | 1 (0,5–1,5) | WR-3, WP-32d (Bestand) |
| WR-5 | Tests T1–T13 + Regressionsmenge, Rot-vor-grün-/Mutationsnachweis | `pruefungen/wiederherstellung*.test.js` | **Sonnet** | 2 (1,5–3) | je TP parallel ab WR-1 |
| WR-6 | Oberfläche: Codes einmal anzeigen/herunterladen, Neugenerierung, Restzahl-Warnung (≤3), Verlust-Hinweis | `src/betreiber-2fa.jsx`, Anmeldemaske | **Sonnet** (+Opus-Review) | 1 (0,75–1,5) | WR-2, WR-3 |
| WR-7 | Unabhängiges Sicherheitsreview (frischer Agent, ohne diesen Plan als Vorgabe) | – | **Opus** | 0,75 (0,5–1) | WR-1–WR-6 |
| WR-8 | Nachweisdokument, STATUS/work-packages | `docs/acc45/` | Sonnet | 0,25 (0,25–0,5) | WR-7 |
| WR-9 | Account-2FA-Wiederherstellung (E-Mail/Passwort-Konten) | `anmeldung.mjs`, `betriebsauswahl.mjs` | Opus | separat (2–4) | eigenes Paket Account-TOTP, WP-18 |

**Summe WR-1 bis WR-8: 10,5 PT (Band 7–16 PT).** Größte Unsicherheit: WR-3 (Konflikte mit WP-18 in `daten.mjs`,
Form der Entscheidung I.1).

**Abhängigkeiten:**
- **SI-P4-Delta:** harte Voraussetzung für Merge von WR-1 und Start von WR-2…WR-6 (Abschnitt B).
- **WP-32d:** im Bestand integriert (`wp32d-nachweis.md`); dessen Garantien sind Regressionsmenge, WR-4 erweitert nur.
- **WP-18:** BLOCKED nach SI-P4 (`RELEASE-GATES-R1-R2-R3.md:21`, `DEPENDENCIES.md:396`); teilt `daten.mjs`. WR-2 vor
  WP-18, WR-3 nach WP-18; WR-9 erst nach WP-18 und Account-TOTP.

## I. Offene Betreiberentscheidungen

1. **Berechtigte Stelle für Kundenrollen** (Leitung/Planung/Kunde): (a) Betreiber allein, (b) Leitung desselben Mandanten
   mit aktivem Faktor für Planung/Kunde, Betreiber für Leitung, (c) Vier-Augen (Kundenleitung + Betreiber). Empfehlung (b)
   mit Pflichtprotokoll; bis dahin D7 gesperrt, nur Offline-Freigabe in Testumgebungen.
2. **Alleinige Leitung eines Mandanten** verliert alles: Betreiber als berechtigte Stelle? (Empfehlung: ja, mit
   Identitätsprüfung nach 3.)
3. **Identitätsprüfung:** Verfahren (Rückruf an vertraglich hinterlegte Nummer, persönliche Vorsprache, schriftliche
   Bestätigung des Vertragspartners) und **Revisionsinhalt** (Aktenzeichen, Kennung der prüfenden Stelle, Verfahren,
   Zeitpunkt; keine Ausweiskopie im System).
4. **Freigabe-Token:** Übergabekanal (persönlich/Telefon, nicht Mail allein), Gültigkeit (Vorschlag 24 h), Vier-Augen ja/nein.
5. **Alleiniges Betreiberkonto:** Wird der Offline-Weg (Serverzugang + Pfeffer + Betreibercode) als einziger Rückweg
   akzeptiert, oder wird eine organisatorische Vertrauensinstanz benannt (Empfehlung: ja; Abschnitt F)?
6. **Zweiter personengebundener Betreiberzugang** als Notfallweg (Empfehlung: ja, mit eigenem Faktor).
7. **Altformat v1** (HMAC ohne Salz, ≈47 bit): bis zur Neugenerierung gültig lassen oder sofort ungültig (Empfehlung:
   gültig + Aufforderung zur Neugenerierung beim nächsten Login).
8. **Ablage-Wiederherstellung** lässt verbrauchte Codes wieder aufleben: Codes an Schlüsselepoche binden
   (`arbeitssitzung.mjs:337–343`) – dann nach jeder Vollwiederherstellung Neugenerierung für alle nötig?
9. **Gerätewechsel per Wiederherstellungscode über das Netz** für Kundenrollen erlauben? (Betreiber: bleibt verweigert.)
10. **Interimsweg „neuer Zugangscode“** bei Verlust: als Verlustfall mit Revisionsvermerk verpflichtend machen und auf die
    Stelle aus 1 beschränken?
11. **Benachrichtigung** des Inhabers bei Verbrauch eines Codes, Neugenerierung, Fall-Eröffnung/Freigabe (Mail/Push,
    Inhalt ohne Geheimnisse) – Pflicht ab wann?
12. **Grenzwerte** der neuen Bremsarten (Abschnitt D) und Sperrdauer im Fall `verlust-offen` bestätigen.
