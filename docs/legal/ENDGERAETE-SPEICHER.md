# Speicherinventur Endgerät (Browser/App)

**ENTWURF, Ist-Stand** (Code 2026-11-07, `src/`, `public/sw.js`, Cookie aus `server/funktionen/anmeldung.mjs`). Keine Rechtsauskunft; die Einordnung nach § 25 TDDDG (Erforderlichkeit/Einwilligung) und die Datenschutzerklärung (`rechtliches/datenschutz.md`) sind Sache des Textstrangs und der Rechtsprüfung.

Diese Datei wird durch `pruefungen/endgeraete-speicher.test.js` geprüft: Jeder im Code vorkommende Speicherschlüssel muss hier in Backticks stehen; jede Datei, die Browserspeicher benutzt, muss in der Dateiliste unten stehen. Ein neuer Schlüssel oder eine neue Datei ohne Eintrag macht den Test rot.

## Schlüssel

| Schlüssel | Speicher | Datei | Zweck | Inhalt | Personenbezug | Lebensdauer / Löschung |
|---|---|---|---|---|---|---|
| `centric:token` | `sessionStorage` (immer), zusätzlich `localStorage` nur bei „Zugang merken“ | `src/speicher.js` | Sitzungstoken für die API (Header) | zufälliges Sitzungsmerkmal, kein Klartextpasswort | ja, mittelbar: berechtigt zum Zugriff auf Personendaten der Rolle | `sessionStorage`: bis der Reiter schließt; `localStorage`: bis Abmelden (wird dort entfernt) |
| `centric:gemerkt` | `localStorage` | `src/speicher.js` | Marker „Zugang merken“ gewählt | `"ja"` | nein (Einstellung) | bis Abmelden |
| `centric.thema` | `localStorage` | `src/v4/thema.js` | gewählte Darstellung (hell/dunkel/System) | Wert der Auswahl | nein | unbefristet, nur lokal; nicht beim Abmelden geleert |
| `centric-stempel` | IndexedDB (Datenbank, Objektspeicher `ereignisse`) | `src/stempelpuffer.js` | Gerätepuffer für Stempelereignisse (offline/Wiederholung) | je Ereignis: `id`, `art` (start/ende), `datum`, `inhaber` (Personenkennung), `reihe`, `erfasstAm`, `offline`, `pause`, **`koord` {lat, lon, accuracy} als Rohkoordinate nur wenn die Geo-Prüfung des Betriebs an ist**, `positionGrund` (Code), `zustand`, `versuche`, `fehler`, `quittung` | ja (Arbeitszeit, ggf. Standort) | siehe Abschnitt Stempelpuffer |
| `centric:stempelpuffer:` | `localStorage`, Präfix, je Ereignis ein Feld `centric:stempelpuffer:<id>` | `src/stempelpuffer.js` | Rückfall, wenn IndexedDB nicht geht; gleicher Inhalt wie oben | wie `centric-stempel` | ja | wie `centric-stempel` |
| `centric:stempelpuffer-probe` | `localStorage` | `src/stempelpuffer.js` | Schreibprobe, ob `localStorage` nutzbar ist | `"1"`, sofort wieder entfernt | nein | Sekundenbruchteile |
| `centric-stempelpuffer` | Web Locks (keine Datenspeicherung) | `src/speicher.js` | Sperre, damit zwei Reiter nicht gleichzeitig senden | kein Inhalt | nein | Dauer der Sperre |
| `centric-schale-` | Cache Storage (Service Worker), Name `centric-schale-<Build>` | `public/sw.js` | Anwendungsgerüst für den Offlinestart | Startseite, Skripte, Schriften, Symbole (öffentliche Bauteile) | nein | wird bei neuer Fassung beim Aktivieren gelöscht |
| `centric-daten-` | Cache Storage (Service Worker), Name `centric-daten-<Build>`, Eintrag `bestand` | `public/sw.js`, `src/speicher.js` | letzter Stand von `/api/bestand` zum Lesen ohne Netz | **Antwort der API in der Rollensicht der angemeldeten Person (Plan, Personen, Zeiten)**, dazu Abrufzeit und Hash der Sitzung | ja, umfangreich | wird beim Abmelden gelöscht (`offlineCacheLeeren`, Nachricht `daten-loeschen`); der Stand gehört nur der Sitzung, mit der er geholt wurde |
| `centric-` | Cache Storage, nur als Namenspräfix beim Aufräumen | `public/sw.js` | der Dienstarbeiter löscht beim Aktivieren alle Caches mit diesem Präfix, die nicht zur aktuellen Fassung gehören | kein eigener Speicher | nein | – |
| `__Host-centric_konto` | Cookie (vom Server gesetzt, nicht aus `src/`) | `server/funktionen/anmeldung.mjs` | Kontositzung (Anmeldung mit Konto) | Sitzungsmerkmal; `HttpOnly; Secure; SameSite=Strict; Path=/` | ja, mittelbar | `Max-Age` 12 h; wird bei Abmeldung oder ungültiger Sitzung gelöscht |

## Dateien, die Browserspeicher benutzen

- `src/speicher.js`
- `src/stempelpuffer.js`
- `src/v4/thema.js`
- `public/sw.js`
- `server/funktionen/anmeldung.mjs` (nur Cookie)

(`src/App.jsx` erwähnt Speicher nur in einem Kommentar zum Abmelden.)

## Stempelpuffer und Rohkoordinate

- Die Rohkoordinate (`koord`) liegt im Puffer nur, wenn der Betrieb die Geo-Prüfung eingeschaltet hat und die Person die Standortabfrage zugelassen hat; sonst `null`, ersatzweise nur ein Grundcode (`positionGrund`).
- Nach der Quittung des Servers oder nach einer endgültigen Absage wird `koord` auf `null` gesetzt (`abarbeiten`); beim Abmelden ebenfalls für abgelehnte Ereignisse (`abmeldenAufraeumen`).
- **Offene Lücke:** Ein Ereignis im Zustand `wartet` (nie gesendet, z. B. dauerhaft ohne Netz) behält seine Rohkoordinate auch über das Abmelden hinaus, ohne zeitliche Obergrenze. Eine Höchstdauer oder Löschung wartender Standorte ist nicht umgesetzt.
- Quittierte Ereignisse verbleiben bis zu 24 Stunden (`BESTAETIGT_HALTEN_MS`) ohne Koordinate im Puffer und werden beim Abmelden entfernt.
- Der Puffer gilt je Gerät und Browserprofil; Inhaber ist die Personenkennung, fremde Ereignisse werden nicht gesendet.

## Weitere Anmerkungen und Lücken

1. Die Inventur umfasst nur, was der Code in `src/` und `public/` selbst ablegt, plus das Cookie des Servers. Das Verhalten der Hostumgebung (Reverse-Proxy, Auslieferung) ist nicht Gegenstand.
2. `centric.thema` wird beim Abmelden nicht entfernt (Gerätepräferenz, kein Personenbezug).
3. Push-Abonnements liegen im Browser bzw. beim Push-Dienst, nicht in einem Schlüssel dieser Inventur; die Serverseite ist Gegenstand von `rechtliches/datenschutz.md`.
4. Die Einordnung, welche Einträge „unbedingt erforderlich“ sind, ist nicht entschieden (offen, Rechtsprüfung).
