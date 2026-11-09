# Kontowiederherstellung bei verpflichtender 2FA – Umsetzungsplan

Stand 2026-11-09 · Basis `origin/integration/release-v4` @ `47ca6ea` · Nur Plan, keine Code-Änderung.
Zeilenangaben ohne Vorsatz beziehen sich auf diese Basis. **Δ** = Branch `acc45/sicherheit/si-p4-delta` @ `ac1e06d`
(lokal; inhaltsgleich mit `origin/acc45/sicherheit/si-p4-auflagen`, auf `origin` unter dem Delta-Namen noch nicht vorhanden).

Freigegeben ist der **technische Weg** (Konzept Punkte 1–4). Nicht freigegeben: produktive Aktivierung, Änderung echter
Betreiberkonten, Ausstellung echter Freigaben. Alles, was eine Betreiber-/Organisationsentscheidung braucht, wird
**gebaut, aber gesperrt** ausgeliefert (fail-closed) und steht in Abschnitt I.

**Nachtrag 2026-11-09:** Entscheidung 1 (normale Mandantenkonten, Vier-Augen durch zwei Mandanten-Administratoren) ist
getroffen → Abschnitt **J**; sie ersetzt die bisherigen Punkte I.1, I.2 und den Vier-Augen-Teil von I.4. Für das
alleinige Betreiberkonto gibt es die Entscheidungsvorlage [`BETREIBER-ENTSCHEIDUNG-KONTO.md`](BETREIBER-ENTSCHEIDUNG-KONTO.md);
dieser Sonderfall bleibt bis zur Entscheidung **gesperrt**. Wo Abschnitte D–F etwas anderes sagen, gilt J.

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
| D7 | `/api/anmelden` `{zugangscode, zweifaktorAktion:"verlustFreigeben"\|"verlustAblehnen", fall, zweifaktor:"123456"}` | Freigabe/Ablehnung durch Mandanten-Administrator (**geändert, J**) | eigene vollständige Anmeldung + frischer TOTP; Regeln J.2 | 1. Freigabe: `{ok, stand:"teilfreigegeben"}`; 2. Freigabe: Token einmal (J.4) |
| D8 | Betreiberprozess (J.5) | Freigabe, wenn keine zwei geeigneten Administratoren | **gesperrt bis I.5** (403 `zweifaktor:"gesperrt"`) | – |

**Auflösung zu D6 (J):** D6 ist kein Ein-Personen-Weg für normale Mandantenkonten in Produktion. Es bleibt auf Prüf-/
Staging-Umgebungen mit Testdaten beschränkt; in Produktion darf es nur als technischer Träger des Betreiberprozesses
(D8) laufen, und erst nach Entscheidung I.5.

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

**Berechtigte Stelle: entschieden 2026-11-09 (J)** – zwei Mandanten-Administratoren (Vier-Augen); ersatzweise
Betreiberprozess (J.5, gesperrt bis I.5). Offen bleiben Identitätsprüfung, Revisionsinhalt, Übergabekanal und Fristen
(I.3, I.4). Der Zustand `freigegeben` entsteht nur noch nach **zwei** gültigen Freigaben (J.3); die Zustandsmaschine
unten gilt mit den Zwischen- und Endzuständen aus J.3.

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
ist **nicht gewährleistet**. Die Optionen sind ausgearbeitet in
[`BETREIBER-ENTSCHEIDUNG-KONTO.md`](BETREIBER-ENTSCHEIDUNG-KONTO.md) (Entscheidung I.6). Kurz: zweiter personengebundener
Betreiberzugang als Vier-Augen-Partner (ersatzweise geteilte Freigabe mit externer Instanz), versiegelte Offline-Codes,
dokumentierte Identitätsprüfung, Wartezeit mit Benachrichtigung und Abbruch. **Geändert gegenüber Fassung e51a1f9:** Der
Offline-Weg bleibt **nicht** unverändert als Rückweg; er muss dieselbe Zweitfreigabe verlangen, sonst ist jede Regel über
den Serverzugang umgehbar (Vorlage Abschnitt 1).

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
| WR-3 | Verlust-Schnittstelle: Fall, Sperrzustand, Freigabe-Token, Einlösen, Sperre privilegierter Aktionen; D7 Vier-Augen nach J; D8 als 403-Stub | `zweifaktor.mjs`, `betreiber-zweifaktor.mjs`, `daten.mjs`, `arbeitssitzung.mjs` | **Opus** | 2,5 (1,5–4) | WR-2, WP-18 (Merge danach) |
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

## I. Offene Betreiberentscheidungen (Stand 2026-11-09, nach Entscheidung 1)

Entschieden und daher entfallen: frühere I.1 (berechtigte Stelle), I.2 (alleinige Leitung), Vier-Augen-Frage aus I.4,
frühere I.5/I.6 (zusammengeführt in neue I.6). Siehe J.7.

1. **Freigabeberechtigte Rollen (J.2c):** Mindestrolle `leitung` für alle Zielrollen; darf `planer` für `subplaner`
   freigeben? Darf eine Leitung durch zwei andere Leitungen wiederhergestellt werden, obwohl Leitung heute keine Leitung
   vergeben darf (`rollenvergabe.mjs:48–54`)? Legacy-Rolle `kunde` als Freigebende? **Empfehlung:** nur `leitung`;
   Leitung-Ziel durch zwei andere Leitungen ja (Vier-Augen gleicht den fehlenden Rangabstand aus); `kunde` nein.
2. **Einheitsregel und stellvertretender Antrag (J.2d, J.3):** Zwei Freigebende derselben nicht-leeren Einheit
   ablehnen? Darf eine Leitung einen Antrag für den Betroffenen eröffnen? **Empfehlung:** Einheitsregel als Muss nur bei
   gleichem nicht-leerem Einheitswert, betriebsweit (`null`) zählt nicht als gleiche Einheit; stellvertretender Antrag
   ja, Antragsteller ist dann von der Freigabe ausgeschlossen.
3. **Identitätsprüfung:** Verfahren (Rückruf an vertraglich hinterlegte Nummer, persönliche Vorsprache, schriftliche
   Bestätigung des Vertragspartners) und **Revisionsinhalt** (Aktenzeichen, Kennung der prüfenden Stelle, Verfahren,
   Zeitpunkt; keine Ausweiskopie im System). **Empfehlung:** mindestens einer der beiden Freigebenden prüft persönlich
   oder per Rückruf an hinterlegte Nummer; Verfahren als Pflichtfeld der zweiten Freigabe.
4. **Fristen und Übergabe (J.3, J.4):** F1 bis zur ersten Freigabe, F2 zwischen erster und zweiter Freigabe, F3
   Token-Gültigkeit, Sperre nach Ablehnung; Übergabekanal des Tokens. **Empfehlung:** F3 = 24 h (Vorschlag aus E);
   F1/F2/Sperre vom Betreiber zu beziffern (keine belastbare Quelle im Repo); Übergabe persönlich oder telefonisch nach
   Identitätsprüfung, nie per Mail allein.
5. **Betreiberprozess bei weniger als zwei geeigneten Administratoren (J.5):** Ablauf und zweite Prüfstelle.
   **Empfehlung:** Betreiber mit frischem Faktor **plus** schriftliche Bestätigung des vertretungsberechtigten
   Vertragspartners **plus** dokumentierte Identitätsprüfung; ist ein geeigneter Administrator vorhanden, gibt er die
   zweite Freigabe. Bis zur Entscheidung D8 gesperrt.
6. **Alleiniges Betreiberkonto:** Entscheidung über die Vorlage [`BETREIBER-ENTSCHEIDUNG-KONTO.md`](BETREIBER-ENTSCHEIDUNG-KONTO.md)
   (Unterpunkte 6a–6g). **Empfehlung:** zweiter personengebundener Betreiberzugang als Vier-Augen-Partner, ersatzweise
   geteilte Freigabe mit externer Instanz; Offline-Werkzeug erhält dieselbe Zweitfreigabe. Bis dahin gesperrt.
7. **Altformat v1** (HMAC ohne Salz, ≈47 bit): bis zur Neugenerierung gültig lassen oder sofort ungültig (Empfehlung:
   gültig + Aufforderung zur Neugenerierung beim nächsten Login).
8. **Ablage-Wiederherstellung** lässt verbrauchte Codes wieder aufleben: Codes an Schlüsselepoche binden
   (`arbeitssitzung.mjs:337–343`) – dann nach jeder Vollwiederherstellung Neugenerierung für alle nötig?
   **Empfehlung:** ja, binden; nach Vollwiederherstellung Neugenerierung beim nächsten Login erzwingen.
9. **Gerätewechsel per Wiederherstellungscode über das Netz** für Kundenrollen erlauben? (Betreiber: bleibt verweigert.)
   **Empfehlung:** nein; Gerätewechsel nur mit gültigem TOTP, sonst Verlustfall.
10. **Interimsweg „neuer Zugangscode“ und Neuanlage** (E; auch neue Einladung derselben Person als Account): Beide
    umgehen heute den Vier-Augen-Weg aus J. **Empfehlung:** Neuanlage für eine Person mit offenem oder abgelehntem
    Verlustfall sperren, außer über J/J.5; jeder Interimsfall mit Revisionsvermerk.
11. **Benachrichtigung** des Inhabers und der übrigen Freigabeberechtigten bei Code-Verbrauch, Neugenerierung,
    Fall-Eröffnung, Freigabe, Ablehnung, Einlösung (Mail/Push, Inhalt ohne Geheimnisse) – Pflicht ab wann?
    **Empfehlung:** Pflicht ab Aktivierung von D7; Mail nur benachrichtigend, nie freigebend.
12. **Grenzwerte** der neuen Bremsarten (Abschnitt D) und Sperrdauer im Fall `verlust-offen` bestätigen.
    **Empfehlung:** Werte aus D übernehmen (Vorschläge dieses Plans, keine externe Quelle); nach Pilotauswertung prüfen.

## J. Freigegeben 2026-11-09 – Entscheidung 1: normale Mandantenkonten

Verbindlich entschieden. Gilt als **fachliche Regel** für die Umsetzung (WR-3, WR-5); produktive Aktivierung bleibt eine
eigene Freigabe (Kopf dieses Dokuments).

### J.1 Geltungsbereich

- Träger eines Rollenfaktors im Mandanten (Rollen mit Faktorpflicht nach SI-P4: `leitung`, `planer`, `subplaner`,
  `kunde`; Δ `betreiber-zweifaktor.mjs:85–95`), die **sämtliche** Faktoren verloren haben (kein TOTP, kein gültiger
  Wiederherstellungscode).
- **Nicht** erfasst: Rolle `betreiber` (Vorlage BETREIBER-ENTSCHEIDUNG-KONTO.md, gesperrt); Verwalterschlüssel
  (`einrichten.mjs`); E-Mail/Passwort-Accounts bis WR-9 (dort heute kein zweiter Faktor, A.7).

### J.2 Freigaberegeln (alle serverseitig, fail-closed)

a. **Zwei Freigaben** von zwei **unterschiedlichen** Freigebenden. Unterschiedlich heißt: verschiedene Konto-Kennung
   **und** verschiedene Person-id. Eine Person kann mehrere Zugangscodes tragen; Konten ohne Person-Bezug
   (`person` leer, vgl. `rechte.mjs:104`) sind nicht freigabeberechtigt.
b. **Ausschluss:** Freigebende sind weder der Betroffene (Konto und Person) noch der Antragsteller. Der Antragsteller
   kann keine Freigabe erteilen, auch nicht über ein zweites Konto derselben Person.
c. **Ausreichende Berechtigung:** wirksame Rolle (`rechte.mjs:101–110`, aus dem Bestand, nicht aus der Anfrage) im
   **selben Mandanten** und Raum/Betrieb wie der Fall; Rolle `leitung` (Erweiterung nur nach I.1); Konto nicht gesperrt,
   nicht abgelaufen; Mitgliedschaft (sofern Account) Status `aktiv` (`accounts.mjs:144`).
d. **Einheitsregel** (Datenmodell erlaubt sie teilweise): Mitgliedschaften tragen `einheit` (`accounts.mjs:892, :928`),
   Personen eine datumsbezogene Einheit (`rechte.mjs:1616–1622`). Ein betriebsweiter Wert ist `null`. Vorgabe: zwei
   Freigebende mit **gleichem nicht-leerem** Einheitswert werden abgelehnt; `null` zählt nicht als gleich. Muss/Soll: I.2.
e. **Selbst vollständig authentifiziert:** Sitzung mit aktivem eigenem Faktor, nicht über Wiederherstellungscode
   angemeldet (`faktorArt ≠ "wiederherstellung"`, D1), eigener Faktor nicht in `verlust-offen`; **frischer TOTP** bei
   jeder Freigabe/Ablehnung (Muster frischer Betreiberfaktor, A.4). E-Mail/Passwort-Accounts ohne Faktor sind bis WR-9
   nicht freigabeberechtigt.
f. **Erneute Prüfung bei der zweiten Freigabe:** unter Sperre je Fall werden die Bedingungen a–e für **beide**
   Freigebenden neu geprüft. Hat der erste Freigebende seine Berechtigung inzwischen verloren, verfällt dessen Freigabe.
g. **Mandantentrennung:** Fall-Kennungen werden nur im eigenen Mandanten aufgelöst; ein fremder oder unbekannter Fall
   ergibt dieselbe Antwort (keine Auskunft über Existenz). Keine Liste fremder Fälle, keine Namen in Antworten.
h. **Betreiber ist hier kein Freigebender.** `betreiber` ist keine Mitgliedschaftsrolle (`accounts.mjs:158`); die
   Betreiberbeteiligung läuft ausschließlich über J.5.

### J.3 Zustände, Ablehnung, Zeitüberschreitung, Rückzug

```
verlust-offen ──1. Freigabe──▶ teilfreigegeben ──2. Freigabe──▶ freigegeben ──Einlösen (D5)──▶ ausstehend ──bestätigen──▶ aktiv
     │                              │                               │
     ├─ Ablehnung ─▶ abgelehnt ◀────┤                               │
     ├─ Frist F1 ──▶ abgelaufen ◀─ Frist F2 ─┘          Frist F3 ───┘─▶ abgelaufen
     └─ Rückzug ───▶ zurückgezogen (aus jedem Zustand vor „eingelöst“)
```

- **Antrag:** eröffnet der Betroffene mit erstem Faktor (D4); stellvertretend durch eine Leitung nur nach I.2. Jede
  Eröffnung ist ein neuer Fall; Freigaben sind nie auf einen anderen Fall übertragbar.
- **Ablehnung:** eine begründete Ablehnung eines Freigabeberechtigten (Grund aus fester Liste) beendet den Fall
  (`abgelehnt`, Endzustand). Vorhandene Teilfreigabe und Token verfallen. Das Konto bleibt für privilegierte Aktionen
  gesperrt (der Faktor fehlt weiterhin). Neuer Antrag erst nach der Sperre der Bremsart `verlust` (D, Dauer I.4/I.12).
  Grund „Identität zweifelhaft“ erzeugt eine Warnung im Protokoll und eine Benachrichtigung der übrigen
  Freigabeberechtigten (I.11).
- **Zeitüberschreitung:** F1 (Eröffnung → 1. Freigabe), F2 (1. → 2. Freigabe), F3 (Token-Gültigkeit, Vorschlag 24 h aus
  E). Ablauf → `abgelaufen` (Endzustand), alle Freigaben und Token ungültig, neuer Antrag nötig. Dauern F1/F2: I.4.
- **Rückzug:** durch den Betroffenen (erster Faktor) oder den Antragsteller, jederzeit vor dem Einlösen; automatisch bei
  Anmeldung mit gültigem TOTP (E). Rückzug macht Freigaben und Token ungültig.
- Endzustände sind unveränderlich; Prüfung „Endzustand“ unter Sperre je Fall vor jeder Wirkung.

### J.4 Token und Übergabe

Erst nach der **zweiten** gültigen Freigabe entsteht das Freigabe-Token (Form wie E: 256 bit, nur Hash gespeichert,
gebunden an id + Fall + Faktor-Generation, einmalig). Es wird dem zweiten Freigebenden **einmal** angezeigt und nach
Identitätsprüfung (I.3) persönlich oder telefonisch übergeben, nie per Mail allein (I.4). Einlösen nur durch den
Betroffenen mit erstem Faktor (D5); Ergebnis immer eine ausstehende Einrichtung, nie „kein Faktor“ (T13).

### J.5 Betreiberprozess bei fehlenden zwei geeigneten Administratoren

- Der Server stellt fest, ob mindestens zwei Freigabeberechtigte nach J.2 existieren (ohne Betroffenen und
  Antragsteller); die Antwort sagt nur „ausreichend / nicht ausreichend“, keine Namen, keine Zahl.
- Nicht ausreichend → Fall erhält Kennzeichen `betreiberprozess`. Das öffnet **keinen** Weg von selbst: kein
  automatischer Übergang, keine Ersatzfreigabe durch Zeitablauf, kein 2FA-Bypass.
- Der Betreiberprozess (D8; Ausgestaltung I.5) verlangt mindestens: Betreiber mit frischem Faktor, dokumentierte
  Identitätsprüfung (I.3) mit Aktenzeichen, und eine zweite Prüfstelle (geeigneter Administrator, falls einer existiert,
  sonst nach I.5). Dieselben Regeln J.2a/b/g, J.3, J.4 und J.6 gelten.
- **Bis zur Entscheidung I.5 gesperrt** (D8 → 403 `gesperrt`). Ein Fall mit Kennzeichen `betreiberprozess` bleibt bis
  dahin in `verlust-offen` und läuft nach F1 ab.

### J.6 Revisionsfähige Protokollierung

- Je Zustandswechsel eine Protokollzeile (`schutz.mjs:1164`): Fall-Kennung, Ereignis, Rolle und pseudonyme Kennung der
  Handelnden (Muster id16), Zeitpunkt, bei Freigabe Verfahren und Aktenzeichen der Identitätsprüfung. Nie Namen, Codes,
  Token, Geheimnisse (D, T9).
- Fall-Datensatz (E) erweitert um `antragsteller`, `freigaben: [{kennung, rolle, zeit, faktorGeneration}]`,
  `ablehnung: {kennung, grund, zeit} | null`, `endzustand`, `betreiberprozess: bool`. Nach Endzustand unveränderlich.
- Aufbewahrungsdauer der Fälle: nicht Teil dieser Entscheidung; folgt dem Löschkonzept.

### J.7 Aufgelöste Widersprüche zur Fassung `e51a1f9`

| Stelle bisher | bisher | jetzt |
|---|---|---|
| I.1 | Empfehlung (b): Leitung allein gibt Planung/Kunde frei, Betreiber gibt Leitung frei | zwei Administratoren für **alle** erfassten Rollen; Betreiber nur über J.5 |
| I.2 | alleinige Leitung → Betreiber als berechtigte Stelle | Betreiberprozess J.5, gesperrt bis I.5, kein automatischer Übergang |
| I.4 | Vier-Augen ja/nein offen | ja (J.2a) |
| D7 | gesperrt bis I.1 | Vier-Augen-Freigabe nach J umsetzbar (WR-3); Aktivierung separat |
| D6 | Offline-Freigabe durch Serverbetreiber allein | nur Test/Staging; in Produktion nur als Träger von J.5 nach I.5 |
| E | `freigegeben` nach einer Freigabe | erst nach zwei Freigaben; neue Zustände J.3 |
| F | Offline-Weg bleibt Rückweg für Betreiber | Offline-Weg braucht Zweitfreigabe (Vorlage, I.6) |
| I.10 | Interimsweg offen | als Umgehung von J benannt; Empfehlung Sperre (I.10) |

### J.8 Zusätzliche Tests (WR-5)

| # | Testfall | erwartet |
|---|---|---|
| T14 | zwei Freigaben desselben Kontos; zwei Konten derselben Person; Konto ohne Person | je zweite Freigabe abgelehnt, kein Token |
| T15 | Antragsteller oder Betroffener gibt frei | 403 `rolle`, Fall unverändert |
| T16 | Freigebender aus Mandant B, oder mit Rolle unter `leitung`, oder angemeldet per Wiederherstellungscode, oder ohne frischen TOTP | abgelehnt, keine Auskunft über den Fall |
| T17 | erster Freigebender verliert Rolle vor der zweiten Freigabe | erste Freigabe verfällt, `teilfreigegeben` bleibt ohne Token |
| T18 | Ablehnung, Ablauf F1/F2/F3, Rückzug, TOTP-Login | jeweils Endzustand, Token ungültig, neuer Antrag nötig |
| T19 | weniger als zwei Berechtigte | Kennzeichen `betreiberprozess`, D8 403, nach F1 `abgelaufen`, nie `freigegeben` |
| T20 | Protokoll eines vollständigen Vier-Augen-Ablaufs | alle Zustandswechsel vorhanden, keine Namen/Codes/Token |
