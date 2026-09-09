# Sicherheit — Stand und Nachweis

Diese Datei ist das Gegenstück zur „Security Master Checkliste" für
KI-gestützt entwickelte Anwendungen. Sie hält fest, was CENTRIC davon
umsetzt, wo es umgesetzt ist, was bewusst anders gelöst wurde — und was
als Risiko bleibt. Sie ist das Release-Gate: Wer ausliefert, geht sie
durch.

Stand: September 2026. Geprüft durch: Rechteprüfung (`npm run
pruefung:rechte`, 78 Negativ- und Positivtests gegen den laufenden
Server), Sonden mit fünf Rollen-Tokens, statische Durchsicht.

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
| **Rollen** | Rollen serverseitig; die Rolle einer Sitzung ergibt sich aus der Person im Betrieb, nicht aus dem Code (`wirksameRolle`). Rollenwechsel nur nach Rang (`rollenvergabe.mjs`), Selbstbeförderung wird verworfen. Beschäftigten-Codes ohne Person entstehen nicht. | `rechte.mjs`, `rollenvergabe.mjs`, `einrichten.mjs` |
| **Privilegierte Aktionen** | Zugänge sperren, Sicherungsschlüssel anlegen, Wiederherstellen, Datenraum löschen verlangen eine Anmeldung, die jünger als 20 Minuten ist (`frisch`). Betreibersitzungen laufen nach 2 h ab und werden nie im Browser gemerkt. | `daten.mjs`, `speicher.js` |
| **Anmeldung** | Kein Kennwort, ein Zugangscode mit ~9,5·10¹⁶ Möglichkeiten. Abgelegt als HMAC-SHA256 mit Pfeffer aus der Umgebung (`CENTRIC_PFEFFER`); ohne Pfeffer als SHA-256 (Übergang). Zeitkonstanter Vergleich, gleichlange Antwortzeit für falsche Codes, keine Kontenauflistung. | `codes.mjs`, `daten.mjs` |
| **Brute Force** | Bremse in drei Dimensionen (Herkunft, Zielbetrieb, Gesamt) mit steigender Sperre; optional atomar über Redis (`REDIS_REST_URL`). Anmelden 8/5 min, Einrichten 5/10 min, Selbststart 3/h. | `schutz.mjs` |
| **Sitzungen** | Zufälliges 256-Bit-Merkmal, nur der Hash liegt im Speicher. 12 h absolut, 30 min Untätigkeit, Betreiber 2 h. Abmelden löscht serverseitig; Sperren eines Zugangs beendet dessen Sitzungen. Merkmal im `sessionStorage`, nur auf Wunsch im `localStorage` (nie für Betreiber). | `daten.mjs`, `speicher.js` |
| **Datenbank** | Netlify Blobs, nur über Funktionen erreichbar, kein Port. Kein SQL, also keine Injektion; Schlüssel werden aus Sitzungsdaten gebaut, nie aus freiem Text (Ausnahme: Raumname des Betreibers, geprüft gegen `^[a-z0-9][a-z0-9_-]{2,79}$`). Form des Bestands wird vor dem Schreiben geprüft (`pruefeGestalt`); Schrumpfung über 34 % löst eine Sicherung aus. | `bestand.mjs`, `gestalt.mjs` |
| **Geheimnisse** | Keine im Quelltext, im Bundle, in Git oder in Fehlermeldungen (geprüft). Alles über Umgebungsvariablen: `CENTRIC_ADMIN`, `CENTRIC_PFEFFER`, `RESEND_API_KEY`, `VAPID_*`, `REDIS_REST_*`. Verwaltungsschlüssel zeitkonstant verglichen. Secret-Scan läuft in der CI. | `.github/workflows/sicherheit.yml` |
| **API** | Jeder Endpunkt hat Rolle und Umfang; Rumpf höchstens 6 MB (413), kaputtes JSON 400 statt 500; Antworten `no-store` und `nosniff`; keine Debug- oder Testpfade (`/einrichten` verlangt den Verwaltungsschlüssel). | `daten.mjs` |
| **Eingaben** | Der ganze Bestand wird strukturell geprüft; Kennungen müssen eindeutig sein; Tagesschlüssel haben die Form `personId\|Datum`. Keine URLs werden verarbeitet (kein SSRF-Vektor); Mail geht nur an `api.resend.com`. | `gestalt.mjs`, `zustellung.mjs` |
| **XSS / CSRF / Browser** | React ohne `dangerouslySetInnerHTML`; CSP `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'self'`; keine Cookies, also kein CSRF; alle Schreibwege sind PUT/POST. | `netlify.toml` |
| **HTTPS / Header** | HSTS ein Jahr inkl. Subdomains; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (nur Ortung, nur eigene Seite), `X-Frame-Options`. Kein CORS-Header — die API ist nur für die eigene Herkunft. | `netlify.toml` |
| **Dateien** | Es gibt keinen Upload. Nachweise werden als Fundstelle (Text) geführt, das Dokument bleibt in der Personalakte. | — |
| **Fehler** | Nach außen nur „Serverfehler"; Einzelheiten im Protokoll. Keine Stacktraces, Pfade oder Merkmale in Antworten. | `daten.mjs` |
| **Protokoll** | Anmeldungen, Fehlversuche, Sperren, Abweisungen, Rollenverstöße, Löschungen — je Eintrag ein Blob, Herkunft nur als gekürzter Hash, nie Codes oder Merkmale. | `schutz.mjs` |
| **Datenschutz** | Datenminimierung nach Rolle beim Lesen; Gesundheitsdaten (Krankheitsgrund, Masernschutz) nur als Status; Löschlauf nach Art. 17 DSGVO (`aufbewahrung.js`) mit Fristen; Datenraum-Löschung durch den Betreiber entfernt Bestand, Scherben, Sicherungen, Codes, Sitzungen und Kalender-Feeds. Vollausgabe nur für die Leitung oder einen reinen Sicherungsschlüssel. | `aufbewahrung.js`, `daten.mjs` |
| **Abhängigkeiten** | Lockfile, `npm audit` ohne Befund; CI bricht ab Schwere „hoch" (Laufzeit). Kein Fremdskript, keine Fremdschrift zur Laufzeit. | `sicherheit.yml` |
| **CI-Gate** | Lint → Typen → Regelwerk → Aufbewahrung → Codes → Scherben → Matrix → Build → Rechte → Verwalter → Demo → Sicherung → Bremse; daneben Audit, Secret-Scan, Musterprüfung. | `.github/workflows` |
| **DevTools** | Keine Geheimnisse im Bundle, keine Sourcemaps in Produktion, keine versteckten Adminfunktionen — der Server weist alles ab, was die Rolle nicht darf (Tests S1–S8). | — |
| **PWA / Offline** | Der Dienstarbeiter hält nur die Schale und die letzte Antwort auf `GET /api/bestand` (bereits nach Rolle gefiltert). Abmelden löscht diesen Speicher. Schreiben offline wird gepuffert und beim Zurückkehren erneut durch den Server geprüft. | `public/sw.js`, `speicher.js` |
| **KI in der Anwendung** | Keine. Die Anwendung ruft kein Sprachmodell auf. | — |

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
  Zeilenebene ist `zusammenfuehren`, geprüft durch 78 Tests.

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
