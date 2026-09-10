# Sicherheit — Stand und Nachweis

Diese Datei ist das Gegenstück zu zwei Prüfvorlagen: der „Security
Master Checkliste" für KI-gestützt entwickelte Anwendungen und dem
„Master Web Application Security & QA Handbook"
(github.com/nerajlal/Website-Security-). Sie hält fest, was CENTRIC
davon umsetzt, wo es umgesetzt ist, was bewusst anders gelöst wurde —
und was als Risiko bleibt. Sie ist das Release-Gate: Wer ausliefert,
geht sie durch.

Stand: September 2026. Geprüft durch: Rechteprüfung (`npm run
pruefung:rechte`, 87 Negativ- und Positivtests gegen den laufenden
Server), Sonden mit fünf Rollen-Tokens, Tastatur- und Ablaufproben im
Browser, statische Durchsicht.

Ergänzend liegt ein eigener **Penetrationstest** nach der Strix-Methodik
vor (OWASP Top 10:2025 + API Security Top 10:2023) — siehe
[`PENTEST.md`](PENTEST.md). Ergebnis: null ausnutzbare Schwachstellen,
34 belegt abgewehrte Angriffe. Wiederholbar mit `npm run pruefung:pentest`
gegen einen laufenden Dienst.

## Grundsatz

Der Browser ist keine Sicherheitsgrenze. Jede Entscheidung fällt in
`netlify/lib/rechte.mjs` und `netlify/functions/daten.mjs` — die
Oberfläche darf weniger anbieten als der Server erlaubt, nie mehr. Der
Server nimmt einen ganzen Bestand entgegen und übernimmt daraus nur, was
die Rolle ändern darf (`zusammenfuehren`); alles andere bleibt, wie es
gespeichert war. Ein manipulierter Client kann damit nichts erreichen,
was er nicht auch mit der ehrlichen Oberfläche dürfte.

## Die Checkliste, Punkt für Punkt

| Bereich | Stand | Wo |
|---|---|---|
| **Zugriff auf fremde Daten** | Jede Anfrage authentifiziert (Bearer-Token, serverseitige Sitzung); Betrieb kommt aus der Sitzung, nie aus der Anfrage; Personenbezug je Eintrag geprüft (`eigenesZusammen`), Bereichsbezug je Person und Tag (`einheitDarf`). Private Felder anderer Personen verlassen den Server nicht (`bestandFuerRolle`). | `rechte.mjs` |
| **Selbstpflege** | Was eine beschäftigte Person an der eigenen Person ändern darf, steht als Positivliste (`SELBST_FELDER`): Erreichbarkeit, Zustellwege, Verfügbarkeit, Darstellungsvorlieben. Qualifikationen, Nachweise, Kompetenzen, Vertrag und Einschränkungen bleiben, wie die Leitung sie eingetragen hat. | `rechte.mjs` |
| **Rollen** | Rollen serverseitig; die Rolle einer Sitzung ergibt sich aus der Person im Betrieb, nicht aus dem Code (`wirksameRolle`). Rollenwechsel nur nach Rang (`rollenvergabe.mjs`), Selbstbeförderung wird verworfen. Beschäftigten-Codes ohne Person entstehen nicht. | `rechte.mjs`, `rollenvergabe.mjs`, `einrichten.mjs` |
| **Privilegierte Aktionen** | Zugänge sperren, Sicherungsschlüssel anlegen, Wiederherstellen, Datenraum löschen verlangen eine Anmeldung, die jünger als 20 Minuten ist (`frisch`). Betreibersitzungen laufen nach 2 h ab und werden nie im Browser gemerkt. | `daten.mjs`, `speicher.js` |
| **Anmeldung** | Kein Kennwort, ein Zugangscode mit ~9,5·10¹⁶ Möglichkeiten. Abgelegt als HMAC-SHA256 mit Pfeffer aus der Umgebung (`CENTRIC_PFEFFER`); ohne Pfeffer als SHA-256 (Übergang). Zeitkonstanter Vergleich, gleichlange Antwortzeit für falsche Codes, keine Kontenauflistung. | `codes.mjs`, `daten.mjs` |
| **Brute Force** | Bremse in drei Dimensionen (Herkunft, Zielbetrieb, Gesamt) mit steigender Sperre; optional atomar über Redis (`REDIS_REST_URL`). Anmelden 8/5 min, Einrichten 5/10 min, Selbststart 3/h. | `schutz.mjs` |
| **Sitzungen** | Zufälliges 256-Bit-Merkmal, nur der Hash liegt im Speicher. 12 h absolut, 30 min Untätigkeit, Betreiber 2 h. Abmelden löscht serverseitig; Sperren eines Zugangs beendet dessen Sitzungen. Merkmal im `sessionStorage`, nur auf Wunsch im `localStorage` (nie für Betreiber). | `daten.mjs`, `speicher.js` |
| **Datenbank** | Netlify Blobs, nur über Funktionen erreichbar, kein Port. Kein SQL, also keine Injektion; Schlüssel werden aus Sitzungsdaten gebaut, nie aus freiem Text (Ausnahme: Raumname des Betreibers, geprüft gegen `^[a-z0-9][a-z0-9_-]{2,79}$`). Form des Bestands wird vor dem Schreiben geprüft (`pruefeGestalt`); Schrumpfung über 34 % löst eine Sicherung aus. | `bestand.mjs`, `gestalt.mjs` |
| **Geheimnisse** | Keine im Quelltext, im Bundle, in Git oder in Fehlermeldungen (geprüft). Alles über Umgebungsvariablen: `CENTRIC_ADMIN`, `CENTRIC_PFEFFER`, `RESEND_API_KEY`, `VAPID_*`, `REDIS_REST_*`. Verwaltungsschlüssel zeitkonstant verglichen. Secret-Scan läuft in der CI. | `.github/workflows/sicherheit.yml` |
| **API** | Jeder Endpunkt hat Rolle und Umfang; Rumpf höchstens 6 MB (413), kaputtes JSON 400 statt 500; Antworten `no-store` und `nosniff`; keine Debug- oder Testpfade (`/einrichten` verlangt den Verwaltungsschlüssel). | `daten.mjs` |
| **Eingaben** | Der ganze Bestand wird strukturell geprüft; Kennungen müssen eindeutig sein; Tagesschlüssel haben die Form `personId\|Datum`. Obergrenzen gegen Wucher: höchstens 100.000 Zeichen je Feld und feste Mengen je Liste (etwa 20.000 Personen, 500 Dienstarten) — beides gibt 422 statt eines unbrauchbaren Betriebs. Keine URLs werden verarbeitet (kein SSRF-Vektor); Mail geht nur an `api.resend.com`. | `gestalt.mjs`, `zustellung.mjs` |
| **XSS / CSRF / Browser** | React ohne `dangerouslySetInnerHTML`; CSP `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`; keine Cookies, also kein CSRF; alle Schreibwege sind PUT/POST. Zusätzlich prüft jede Funktion bei zustandsändernden Anfragen den `Origin` gegen die eigene Adresse (`herkunftErlaubt`) — ein fremdes Blatt kommt damit auch dann nicht durch, wenn eines Tages doch ein Cookie dazukäme. | `netlify.toml`, `schutz.mjs` |
| **HTTPS / Header** | HSTS ein Jahr inkl. Subdomains; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (nur Ortung, nur eigene Seite), `X-Frame-Options`. Kein CORS-Header — die API ist nur für die eigene Herkunft. | `netlify.toml` |
| **Dateien** | Es gibt keinen Upload. Nachweise werden als Fundstelle (Text) geführt, das Dokument bleibt in der Personalakte. | — |
| **Fehler** | Nach außen nur „Serverfehler"; Einzelheiten im Protokoll. Keine Stacktraces, Pfade oder Merkmale in Antworten. | `daten.mjs` |
| **Protokoll** | Anmeldungen, Fehlversuche, Sperren, Abweisungen, Rollenverstöße, Löschungen — je Eintrag ein Blob. Jeder schreibende Vorgang führt Rolle, Personenkennung, Weg und Verfahren mit, die Herkunft als gekürzten Hash. Nie Namen, Codes, Merkmale oder Planinhalte. | `schutz.mjs`, `daten.mjs` |
| **Datenschutz** | Datenminimierung nach Rolle beim Lesen; Gesundheitsdaten (Krankheitsgrund, Masernschutz) nur als Status; Löschlauf nach Art. 17 DSGVO (`aufbewahrung.js`) mit Fristen; Datenraum-Löschung durch den Betreiber entfernt Bestand, Scherben, Sicherungen, Codes, Sitzungen und Kalender-Feeds. Vollausgabe nur für die Leitung oder einen reinen Sicherungsschlüssel. | `aufbewahrung.js`, `daten.mjs` |
| **Abhängigkeiten** | Lockfile, `npm audit` ohne Befund; CI bricht ab Schwere „hoch" (Laufzeit). Kein Fremdskript, keine Fremdschrift zur Laufzeit. | `sicherheit.yml` |
| **CI-Gate** | Lint → Typen → Regelwerk → Branchen → Untergrenzen → PPP-RL → Lenkzeiten → Aufbewahrung → Codes → Scherben → Matrix → Build → Rechte → Verwalter → Demo → Sicherung → Bremse; daneben Audit, Secret-Scan, Musterprüfung. | `.github/workflows` |
| **Regelstand** | Jede Planänderung trägt die Fassung des Regelwerks (`REGELSTAND`), die Prüfansicht nennt sie samt Quellen. Ein Befund ohne Regelstand ist eine Behauptung. | `regelwerk.js` |
| **DevTools** | Keine Geheimnisse im Bundle, keine Sourcemaps in Produktion, keine versteckten Adminfunktionen — der Server weist alles ab, was die Rolle nicht darf (Tests S1–S8). | — |
| **PWA / Offline** | Der Dienstarbeiter hält nur die Schale und die letzte Antwort auf `GET /api/bestand` (bereits nach Rolle gefiltert). Abmelden löscht diesen Speicher. Schreiben offline wird gepuffert und beim Zurückkehren erneut durch den Server geprüft. | `public/sw.js`, `speicher.js` |
| **KI in der Anwendung** | Keine. Die Anwendung ruft kein Sprachmodell auf. | — |

## Das QA-Handbuch: die Punkte über die Sicherheit hinaus

Das zweite Handbuch prüft nicht nur Sicherheit, sondern auch
Datenbankintegrität, Negativtests, Last, Barrierefreiheit und
Auslieferung. Was davon hier zutrifft:

| Punkt | Stand |
|---|---|
| **Statuscodes** | 401 ohne Anmeldung, 403 bei Rollenverstoß, 404 für fehlende Datensätze, 400 für kaputte Anfragen, 422 für unbrauchbare Form, 409 bei Konflikt, 413 für zu große Rümpfe, 429 bei Bremse. Alles als JSON, nie als HTML-Seite. |
| **Doppelte Datensätze** | Kennungen sind eindeutig (`pruefeGestalt`). Ein zweiter gleicher Antrag derselben Person für denselben Zeitraum wird abgefangen statt doppelt angelegt — der Doppelklick im Bus war der Normalfall, nicht die Ausnahme. |
| **Waisen** | Es gibt keine. Personen werden nie gelöscht, sondern tragen ein Austrittsdatum; der Löschlauf nach Art. 17 DSGVO anonymisiert sie, statt sie aus der Liste zu nehmen. Ein gelöschter Betrieb nimmt seinen ganzen Datenraum mit. |
| **Transaktionen** | Kein Mehrschritt-Schreiben: Ein Bestand wird als Kern und Monatsscherben abgelegt, der Zeiger auf den neuen Stand wird zuletzt gesetzt. Bricht etwas dazwischen ab, gilt weiter der alte Stand. |
| **Pagination** | Bewusst anders: Die Anwendung arbeitet offline-fähig auf dem ganzen Betrieb. Statt Seitenweise gibt es die Zerlegung in Monatsscherben — geschrieben wird nur der geänderte Monat, und zwei Planer an verschiedenen Monaten stören einander nicht. |
| **Tastaturbedienung** | Blätter fangen den Fokus, geben ihn beim Schließen zurück und schließen mit Escape — auch wenn der Fokus daneben liegt. Jede klickbare Zelle, Karte und Zeile ist eine Schaltfläche mit Fokus, Enter und Leertaste (`klickbar()`); liegt darin ein eigenes Bedienelement, gehört der Tastendruck ihm. Der Monatsplan ist ein `role="grid"` mit Pfeiltastensteuerung. Ein Tastaturlauf über 90 Sprünge fand keine Falle und keinen Halt ohne sichtbaren Fokus. |
| **Vorlesesoftware** | Blätter sind `role="dialog"` mit `aria-modal`, die Befehlssuche ist eine `combobox` mit `listbox` und `aria-activedescendant`; Zustände tragen `aria-pressed`, `aria-expanded`, `aria-current`; Meldungen laufen über `aria-live`. Jede Fläche ohne eigenen Text trägt eine Beschriftung — Planzelle, Balken, Kalendertag, Fortschrittspunkt. |
| **Kontrast** | Gemessen statt geschätzt: `npm run pruefung:kontrast` rechnet die relative Leuchtkraft nach WCAG 2.1 nach und prüft jede Paarung, die tatsächlich vorkommt, in beiden Paletten — 4,5:1 für Text, 3:1 für Bedienelemente. Die erste Messung fand fünf Verstöße, darunter weiße Schrift auf Türkis mit 2,23:1 auf jeder Hauptschaltfläche im Dunkelmodus. Dazu ein Feldmodus mit größerer Schrift für die Arbeit draußen; Zustände werden nie allein über Farbe gezeigt. |
| **Dateiuploads** | Es gibt keine. Nachweise werden als Fundstelle geführt — damit entfallen MIME-Prüfung, Pfadwanderung und Schadsoftware im Speicher als Angriffsfläche. |
| **CI/CD** | Zwei Läufe: `Prüfung` (Lint, Typen, Regelwerk, Kontrast, Branchenprofile, Untergrenzen, Aufbewahrung, Codes, Scherben, Rechtetabellen, Build, Rechte, Verwalter, Demo, Sicherung, Bremse) und `Sicherheit` (Audit, Secret-Scan, verbotene Muster). Ein roter Lauf blockiert. |

### Wie der Durchgang mit Vorlesesoftware gefahren wurde

Ein echter Lauf mit NVDA oder VoiceOver ist hier nicht möglich. Gefahren
wurde stattdessen die Frage, die eine Vorlesesoftware an jedes Element
stellt: Was bist du, und wie heißt du? Über alle 37 Ansichten der
Schreibtisch- und 47 der Telefonansicht wurde gemessen, welche Flächen
sich klickbar geben, ohne eine Rolle zu tragen, welche Bedienelemente
keinen Namen haben, welche Felder ohne Beschriftung stehen und ob die
Überschriftenfolge Stufen überspringt.

Der erste Lauf fand vierzehn echte Mängel: die vier Felder je
Zuschlagsregel standen ohne jede Beschriftung nebeneinander, der
Startpunkt je Wohnbereich, der Dienstartfilter, das Datum des
Dienstbuchs und die Startansicht waren namenlos, und sieben Tageskarten
der Telefonansicht waren keine Schaltflächen. Alle behoben. Was bleibt,
ist eine Karte auf der Startseite, die dieselbe Sache tut wie die
Schaltfläche in ihr — mit der Tastatur erreichbar, für die Maus bequem.

## Was bewusst anders ist als in der Liste

- **Kein Kennwort, kein Reset, keine MFA.** Der Zugangscode ist das
  einzige Geheimnis; er wird von der Leitung ausgegeben und kann von ihr
  jederzeit zurückgezogen werden. Ein Reset-Weg per Mail wäre ein
  zweiter Angriffsweg. MFA für den Betreiber wäre der nächste Schritt —
  bis dahin: kurze Sitzung, kein Merken, frische Anmeldung für alles
  Unumkehrbare.
- **Kein Refresh-Token.** Eine Sitzung ist ein Merkmal mit Ablauf und
  Untätigkeitsgrenze; Verlängerung geschieht durch Benutzung. Ein
  zweites Merkmal brächte nur einen zweiten Weg, es zu verlieren.
- **Kein Row-Level-Security.** Es gibt keine Datenbank mit Zeilen; die
  Zeilenebene ist `zusammenfuehren`, geprüft durch 87 Tests.
- **Kein ORM, keine parametrisierten Abfragen.** Es gibt kein SQL. Der
  Speicher ist ein Schlüssel-Wert-Ablage, und die Schlüssel entstehen aus
  Sitzungsdaten, nie aus freiem Text.

## Verbleibende Risiken

1. **Bremse unter echter Gleichzeitigkeit.** Ohne Redis kommen bei
   einem parallelen Schwarm mehr Versuche durch als die Grenze erlaubt
   (gemessen 55 von 60 im Blob-Weg, deutlich weniger mit der
   prozesslokalen Sperre). Der Suchraum des Codes macht das ungefährlich,
   aber sauber ist es erst mit `REDIS_REST_URL`.
2. **Betreiber ohne zweiten Faktor.** Wer den Betreibercode hat, hat
   alles — 2 h lang. Frische Anmeldung für Sperren und Löschen begrenzt
   den Schaden eines entwendeten Merkmals, nicht eines entwendeten Codes.
3. **Zugangscode auf dem Gerät.** Mit „angemeldet bleiben" liegt das
   Sitzungsmerkmal im `localStorage`. Ein fremdes Skript auf derselben
   Herkunft könnte es lesen — die CSP lässt keines zu, das ist die
   Verteidigung.
4. **Netlify Blobs** verschlüsselt ruhend; die Anwendung verschlüsselt
   nicht zusätzlich. Wer das braucht, verschlüsselt auf Ebene des Raums.
5. **Branch-Schutz** auf GitHub ist Einstellungssache des Kontos und
   nicht aus dem Repository heraus erzwingbar. Empfohlen: `main` nur
   über Pull Request mit grüner Prüfung.

## Vor jeder Auslieferung

- [ ] `npm run pruefung` grün, `Sicherheit`-Workflow grün.
- [ ] Keine offenen Befunde der Schwere „kritisch" oder „hoch".
- [ ] `CENTRIC_PFEFFER` und `CENTRIC_ADMIN` in der Produktionsumgebung
      gesetzt, nirgends sonst.
- [ ] Änderungen an `rechte.mjs` oder `daten.mjs` haben einen Test in
      `pruefungen/rechte.mjs`.
