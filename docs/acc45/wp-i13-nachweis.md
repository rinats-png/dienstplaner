# WP-I13 (Teilstand) – Nachweis: Gateway-Kern, Attrappe, Router, Prüfer

Branch `feature/intelligence-gateway` (Basis `integration/release-v4`) · Agent: Sonnet · Stand 2026-11-06 · **Teilstand: nur gegen die Attrappe, inert, nicht verdrahtet.**
Zusammen mit [`wp-i15-nachweis.md`](wp-i15-nachweis.md) (Limits, Kontingent, Schalter, Protokoll). Offene Fragen: [`wpI-offene-fragen.md`](wpI-offene-fragen.md).

## Statusstufen (ehrlich)

| Stufe | Stand | Beleg |
|---|---|---|
| implementiert | **teilweise** (Kern, Attrappe, Router, Prüfer, Live-Stumpf); Rest siehe „Nicht enthalten“ | `server/lib/intelligence/gateway/*` |
| lokal getestet | **ja** — 174 Tests in 5 Dateien grün, dazu alle `pruefungen/intelligence-*` (380/380) | Abschnitt „Tests“ |
| reviewt | **nein** — unabhängige Sicherheitsprüfung (R3) steht aus | Invarianten unten sind die Prüfgrundlage |
| integriert / Staging / produktiv | **nein** | kein PR, kein Merge, keine Route, kein Deployment |
| Modellaufruf | **keiner** — kein Netz, kein Anbieter, kein Schlüssel, keine Route | statische Tests `intelligence-gateway-grenzen` |

`work-packages.json` ist nicht geändert (Besitz Orchestrator). Abhängigkeit **WP-I12** (Decision Engine) ist noch BLOCKED: das Gateway nimmt eine optionale `faktenquelle` (Rechenkern) entgegen, eine echte Gegenrechnung gibt es noch nicht.

## Dateien

Neu: `server/lib/intelligence/gateway/{codes,anbieter,attrappe,anbieter-live,limits,audit,schalter,router,pruefer,gateway}.mjs`; `pruefungen/intelligence-gateway-{anbieter,limits,pruefer,kern,grenzen}.test.js` und Prüfdaten `intelligence-gateway-fixture.mjs`; diese Datei, `wp-i15-nachweis.md`, `wpI-offene-fragen.md`.
Nicht berührt: `src/**` (auch `App.jsx`), `server.mjs`, `server/funktionen/**`, `server/lib/*.mjs`, `package.json`, `.env.example`, `werkzeug/**`, `docs/STATUS-FERTIGSTELLUNG.md`, `work-packages.json`. Die bestehenden WP-I11-Dateien sind unverändert.
`npm run pruefung:intelligence` (`vitest run pruefungen/intelligence-`) nimmt die neuen Dateien automatisch mit.

## Ablauf des Gateways (die Reihenfolge ist die Sicherheit)

1 Notschalter (Prozess und Laufzeit je genau `"an"`) → 2 Form von Sitzung und Anfrage (Schema, unbekannte Felder verworfen) → 3 Funktion bekannt und Rolle berechtigt (Betriebsrat/Betreiber nie) → 4 Funktion freigegeben, Router kennt eine Startstufe → 5 Betrieb nicht pausiert (Haken `betriebAktiv`, Vorgabe **gesperrt**) → 6 Limits reservieren → 7 Faktenpaket (`faktenpaketBilden`: Rollensicht ∩ Positivliste, Alias, Leck-Prüfung) → 8 Größenklasse im Kontingent anheben → 9 Pflicht-Startprotokoll → 10 Stufenkette (nur aufwärts, Frist, technische Wiederholungen) → 11 Prüfer → 12 Rückübersetzung (Alias → Kennung) erst nach der Prüfung, danach Antwort-Schema.
Fehler vor Schritt 10 werden **geworfen** (`KI_AUS`, `KI_NICHT_ANGEMELDET`, `KI_EINGABE`, `KI_FUNKTION`, `KI_ROLLE`, `KI_PAUSIERT`, `KI_LIMIT`, `KI_KONTINGENT`, `KI_GROESSE`, `KI_LECK`, `KI_AUDIT` …); ab Schritt 10 gibt es **nie eine Ausnahme**, sondern eine gültige Antwort `status: "rueckfall"` (`KI_ANBIETER`, `KI_ZEIT`, `KI_PRUEFER`, `KI_NICHT_FREIGEGEBEN`) — die Kernanwendung bleibt nutzbar.

## Invarianten (Prüfgrundlage für das unabhängige Review)

Jede steht als Kommentar im Code und ist durch mindestens einen Test belegt.

**Inertheit**
- **G1** Ohne beide Schalter auf genau `"an"` erreicht keine Anfrage den Adapter. Jeder andere Wert (`"AN"`, `true`, `1`, Wurf, Promise, fehlender Schalter) = aus; der Schalter wird bei jedem Aufruf gelesen. Test: `kern › Inert`.
- **G11** Das Modul ist nirgends verdrahtet: weder `server.mjs`, noch `server/funktionen/*`, noch `server/lib/*.mjs`, noch `werkzeug/*`, noch `src/*` kennen es; es gibt weder eine Route `/ki` noch `server/funktionen/ki.mjs`. Test: `grenzen › Inert`.
- **L1/L2** Der Live-Adapter ist ein Stumpf: ohne Schalter `CENTRIC_KI_ANBIETER_LIVE=ja` **und** Schlüssel (≥ 20 Zeichen) wirft er „nicht freigegeben“; auch mit beiden gibt es keinen Netzcode und er wirft weiterhin („nicht freigegeben (Live-Anbindung WP-I18 fehlt)“). **Das Einschalten setzt eine Betreiberfreigabe voraus** (Anbieterbedingungen, AVV, DSFA, Mitbestimmung, E-25) und ist WP-I18.
- **L3** Kein Modul liest `process.env`; die Umgebung wird als Argument übergeben. Kein `fetch`, kein `node:http(s)/net/tls/dgram/dns/child_process/fs/vm/worker_threads`, kein dynamisches `import()`/`require`/`eval`. Test: `grenzen`.
- **L4** Der Schlüssel steht nur in einer Closure — in keiner Eigenschaft, Meldung, JSON-Ausgabe oder `inspect`-Ausgabe. Test: `anbieter › Live-Stumpf`.
- Keine Anbieterbibliothek in `package.json`, kein Anbietername/Schlüsselmuster im Quelltext, `.env.example` unverändert.

**Rolle und Daten**
- **G2** Rollen- und Funktionsprüfung vor allem, was Kosten oder Daten betrifft: bei `KI_ROLLE` wird weder der Bestand geladen noch ein Limit gebucht. Betriebsrat, Betreiber, Schichtverantwortung (`subplaner`), Kunde und unbekannte Rollen lösen keine Funktion aus; Beschäftigte nur F9 (und F9 hat noch kein Limit → gesperrt).
- **G3 / A2** Der Adapter bekommt genau `{ funktion, stufe, schemaVersion, paket, fremdtext, signal }` — nie Sitzung, Rolle, Person, Betrieb, Raum, Alias-Karte. Test: `kern › Datenminimierung` (Schlüsselmenge exakt und `VERBOTEN_IM_PAKET` aus WP-I11 im gesamten Adapter-Input nicht gefunden, für Leitung und Planung).
- **G4** Das Paket kommt aus `faktenpaketBilden` (Rollensicht ∩ Positivliste, nie Rohbestand). Der Modellort kommt aus der Adapter-**Konfiguration** (`modellOrt`), nie aus der Anfrage (Anfrage mit `modellOrt` → `KI_EINGABE`). Die Attrappe meldet „extern“ — der strengste Pfad.
- **A1** Der Adapter bekommt eine tief eingefrorene Kopie; Verändern wirkt nicht auf das Original.
- Eine Bestands-Momentaufnahme je Vorgang für Paket, Sperrliste und Rückübersetzung (kein Zeitfenster zwischen Prüfung und Verwendung). Test: `kern › Zufall und Reihenfolge`.
- Fremdtext (F5): bereinigt (Tags, Zäune, Trenner, Steuerzeichen), in zufällig getrennter Kapsel, Klarname → `KI_LECK` vor dem Anbieter; Gesundheitsbegriffe analog (WP-I11).

**Ausgabe**
- **G5** Kein Anbieterergebnis erreicht den Aufrufer ungeprüft; Rückübersetzung erst nach der Prüfung, danach erneut Antwort-Schema; ein erfundener Alias → Rückfall `KI_PRUEFER`.
- **P1** Prüfer fail closed (jede Ausnahme = Ablehnung); **P2** ohne Baustein-Katalog der Funktion ist jeder Baustein abgelehnt; **P3** ohne Sperrliste keine Freigabe; **P4** der Rückgabewert enthält nie den abgelehnten Inhalt (nur Codes `P-01…P-09`); **P5** Zahlen in Text und Parametern müssen im Paket stehen (Ziffern und Zahlwörter ≥ zwei).
- Das Ergebnis wird Feld für Feld neu aufgebaut; fremde Felder (`plan`, `schreibe`, `role`), Prototyp-Schlüssel, Funktionen, Symbole, NaN, Zyklen, Übergrößen → abgelehnt. Nichts wird gekürzt (E-8), nichts „geschwärzt“.
- **G6** Jede Antwort trägt `kiGestuetzt: true, entwurf: true, veroeffentlicht: false`; das Gateway hat keinen Schreibweg in den Bestand (statischer Test).
- **A3 / G9** Fehlertexte eines Adapters werden nie weitergereicht (Test mit einem Fehlertext, der einen Klarnamen enthält: weder in der Antwort noch im Protokoll). **A4** Jeder Aufruf hat Frist und `AbortSignal`; ein Adapter, der das Signal ignoriert und nie antwortet, blockiert nicht (`Promise.race`).

**Kosten, Zeit, Protokoll**
- **G7** Jeder Vorgang gibt seinen Limit-Beleg genau einmal zurück (`finally`), auch bei Ausnahmen; doppeltes Abschließen zählt nicht doppelt.
- **G8 / U1–U3** Protokoll nur über Weißliste; **das Startereignis ist Pflicht — ohne Aufzeichnung kein Anbieteraufruf** (`KI_AUDIT`); spätere Ereignisse stören den Vorgang nie.
- **G10** Alle Zähler/Schalter/Prüfungen fail closed. Einzelheiten Limits: `wp-i15-nachweis.md` (B1–B6).
- Stufenkette nur **aufwärts**, höchste Stufe konfigurierbar (Opus allein abschaltbar); technische Wiederholungen nur bei `begrenzt`/`nicht_verfuegbar`, höchstens 2, nur bei genügend Restzeit; Zeitüberschreitung → sofort nächste Stufe; globale Deadline.

## Akzeptanz ↔ Tests

Quelle: `INTELLIGENCE-ENTWICKLUNGSPLAN.md` I13 (Teilmenge ohne Route/Journal), Auftrag.

| Kriterium | Test (Datei › Block) |
|---|---|
| Anbieter-Abstraktion mit strukturierter Ein-/Ausgabe, Frist, Wiederholung, Fehlerklassen | anbieter › Adapter-Vertrag, Fristen/Wiederholungen/Abbruch |
| Deterministische Attrappe (Modi ok, Fehler, Zeitüberschreitung, falsche Zahl, + feindliche) | anbieter › Attrappe; kern › Prüfer (9 Modi) |
| Datenminimierung: nur Faktenpaket, nie Rohdaten | kern › Datenminimierung |
| Rolle/Berechtigung vor jedem Aufruf | kern › Rolle und Anfrage …; Inert |
| Notschalter Vorgabe AUS | kern › Inert; limits › Notschalter |
| Kein HTTP-Weg zu einem echten Anbieter | grenzen (alle 13) |
| Live-Adapter nur Stumpf, wirft ohne Flag+Schlüssel | anbieter › Live-Stumpf (5) |
| Strikte Ausgabeprüfung (Schema, Zahlen, Alias, Einschleusung, Leck) | pruefer (59 Fälle); kern › Prüfer |
| Prompt-Injection-Eingaben | kern › Eingeschleuster Fremdtext; pruefer › P-05 (28 Texte) |
| Zeitüberschreitung | anbieter › Fristen; kern › Anbieterausfall |
| Übergröße (Eingabe/Ausgabe) | kern (Anfrage ungültig, Modus zu_gross); pruefer › P-08; limits › Größen |
| Budget überschritten | kern › Kosten- und Ratenschutz; limits › Kontingent |
| Eskalation nur aufwärts | kern › Prüfer (Eskalation hilft, Stufen nie abwärts); limits › Router |
| Protokoll ohne Personendaten | kern › Protokoll; limits › Protokoll: Weißliste |

Zählung: anbieter 20 · limits 29 · pruefer 59 · kern 52 · grenzen 13 = **174** (Befehl: `npx vitest run pruefungen/intelligence-gateway-`). Mutations-Stichprobe: ein eingefügtes `process.env`/`fetch` in `router.mjs` ließ beide statischen Tests rot werden (danach zurückgenommen).

## Nicht enthalten (bewusst) — Rest von WP-I13

- Route `server/funktionen/ki.mjs` (202 + Auftragskennung + Abfrage), Journal der Aufträge, Stores `centric-ki`/`centric-ki-lauf` in `STORES`, `.env.example`/Betriebshandbuch, `/gesund`-Einbindung: **absichtlich nicht angelegt** (Auftrag: keine Route, nichts in `server.mjs`).
- Live-Anbieter (WP-I18), Model Registry mit Modellkennungen, Sichtung für F7B/F8, Prompt-/Schema-Bau des echten Adapters.
- Echte Gegenrechnung durch den Rechenkern (WP-I12 BLOCKED), Fingerprint/Ergebnis-Speicher (WP-I14), Satzbausteinkatalog (Inhalt fachlich offen → Prüfer lehnt Bausteine ohne Katalog ab).
- Startstufen für F6, F13, F16, F17, F18 (Spezifikation nennt keine), F8/F7B (Sichtung): der Router liefert `null`, das Gateway verweigert sie.

## Bekannte Grenzen des Prüfers (für das Review)

- Zahlwörter „halb“, „Dutzend“, „Viertel“ sowie römische Ziffern werden nicht erkannt; deutsche Datumsschreibweise „3. November“ wird über die Ziffer abgefangen.
- Verbotene-Merkmale-Liste (P-03) ist eine **Startliste**; die Sperrliste des Betriebs (P-06) und das Fehlen jeder Freitext-Funktion außerhalb F5/F6/F9/F16 sind die weitere Absicherung.
- Der Prüfer kann Sinn nicht prüfen (eine zulässige, aber falsche Aussage mit Paketwerten passiert) — dafür ist die Gegenrechnung des Rechenkerns (WP-I12) und die Bestätigung durch den Menschen vorgesehen.
- `idempotenz` der Anfrage wird ignoriert (kein Ergebnis-Speicher, WP-I14).

## Offene Punkte / Bedingungen vor einem Anbieteranschluss

Die Bedingungen aus `wp-i11-nachweis.md` („Bedingungen vor einem Anbieteranschluss“) gelten unverändert; erfüllt ist hier: `modellOrt` nur aus Konfiguration, Rückübersetzung nur nach Prüfung, Ausgabe durch Leck-Prüfung. **Offen:** getrennte Schlüssel mit Rotation (WP-I18), Namenspolitik vor Freitext-Funktionen, Restrisiken-Freigabe, Betreiberfreigabe.
