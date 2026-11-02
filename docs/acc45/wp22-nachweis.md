# WP-22 — Fachprüfungen auf dem Server, Dienstarten nur mit org.edit: Nachweis

Branch `acc45/rules/wp22-fachpruefungen-server`, aufgesetzt auf `acc45/rules/wp11-regelregister` (Nachprüfung WP-11
eingearbeitet, Kopf 87f815f).

## Was umgesetzt ist

**Eine Prüflogik.** Die Prüfung einer Einteilung (Person, Tag, Dienstart) steht in `server/lib/fachpruefung.mjs`
(`einteilungsBefunde`). Die Oberfläche (`hindernisBefunde` in `src/App.jsx`) und der Server
(`server/lib/schutzdurchsetzung.mjs`) rufen dieselbe Funktion — die Oberfläche mit ihrem Plan (`personTag`,
`besetzung`), der Server mit einer eigenen Planrechnung (Abweichung, sonst Schichtfolge der Einheit mit Teilzeit;
Abwesenheit und außerhalb des Beschäftigungsverhältnisses frei). Darin die eine Schutzprüfung `schutzEinsatz`. Das
Regelwerk liegt dafür in `server/lib/regelwerk.mjs`; `src/regelwerk.js` reicht es weiter (das Serverbild enthält kein
`src/`). Planrechnung, Nachtfenster, Nachweise, Ruhezeitstufe kommen in der Oberfläche aus `fachpruefung.mjs`; die
Duplikate in `App.jsx` und `src/warnstufen.js` sind entfernt. Quelltext-Prüfungen: `schutzpruefung-eine`,
`konsistenz`, `schutzregeln-ersatzsuche`, `review-wp10`.

**Geprüfte Regeln** (Stufe und `sperrt` aus `BEFUND_KATALOG`, `server/lib/bestaetigungen.mjs`):

| Regel | Katalog | Stufe | Server |
|---|---|---|---|
| nicht im Bestand | `bestand` | Rechtsverstoß | sperrt |
| Schutz (hart / weich) | `schutz` / `schutzWeich` | Rechtsverstoß / Achtung | sperrt / Bestätigung |
| keine Nacht, kein Alleindienst, Höchstzahl je Woche | `keineNacht`, `keinAlleindienst`, `maxDiensteWoche` | Rechtsverstoß | sperrt |
| Qualifikation gesetzlich / betrieblich | `qualifikationGesetzlich` / `qualifikationBetrieblich` | Rechtsverstoß / Achtung | sperrt / Bestätigung |
| Einweisung je Gerät | `kompetenz` | Rechtsverstoß | sperrt |
| Ruhezeit unter 11 h / unter der Vorgabe des Betriebs | `ruhezeitGesetz` / `ruhezeitBetrieb` | Rechtsverstoß / Achtung | sperrt / Bestätigung |
| Dienst über zehn Stunden (§ 3 ArbZG) | `tagesgrenze` (neu) | Rechtsverstoß | Bestätigung mit „gelesen" |
| Mindestbesetzung unterschritten | `untergrenze` (neu) | Achtung | Bestätigung |

„Vorläufig streng": sperrend ist, was die Oberfläche schon sperrte. Die Tagesgrenze sperrte die Oberfläche bisher
nicht (nur die Planprüfung meldete sie auf Ist-Daten) — sie ist deshalb bestätigungspflichtig, nicht sperrend.

**Nur neue Befunde.** Ausdrücklich geänderte Einteilungen und — bei einer strukturellen Änderung (Dienstarten,
Schichtfolge, Anker, Einheiten, Zugehörigkeit, Springer, Schichtdienst, Teilzeit, Wochenstunden, Ein- und Austritt,
Status) — alle Einteilungen der nächsten 120 Tage, an denen sich etwas geändert haben kann (eigener Dienst und
Dienstart, ±2 Tage, Kalenderwoche, Person, Bundesland; „kein Alleindienst" immer; Vorgaben des Betriebs geändert:
alles). Ein Befund, den dieselbe Einteilung vorher schon hatte, blockiert nicht. Mindestbesetzung: Fällt ein Dienst
an einem Tag unter die Vorgabe und unter den bisherigen Stand, ist das ein Befund an der Einteilung, die wegfiel.

**Bestätigung.** Ein warnender Befund geht nur durch, wenn derselbe Speichervorgang einen neuen Eintrag im
Bestätigungsprotokoll zu Person, Tag und Regel enthält (bei Rechtsverstoß mit `gelesen`; Wer und Zeit setzt der
Server). Sonst antwortet `PUT /api/bestand` mit **409** und `fachbefunde` (Person, Tag, Dienst, Regel, Stufe, Text aus
dem Katalog; Schutzbefunde immer „Schutz- oder Einsatzregel der Person"), Protokollzeile `bestaetigung-noetig`.
`src/speicher.js` unterscheidet diese 409 vom Konflikt (`onFachbefunde`); die Oberfläche zeigt die Liste
(`Bestaetigungsfrage`) und legt bei Bestätigung die Protokolleinträge an — der nächste Speichervorgang nimmt sie mit.

**Dienstarten nur mit `org.edit`.** Planung und alle Rollen ohne `org.edit` werden beim Anlegen, Ändern oder Löschen
abgewiesen (403); eine unveränderte Kopie stört nicht; die Checkliste einer Dienstart pflegt die Planung weiter. Die
Oberfläche zeigt Bearbeiten, Vorlagenzeiten und die Einrichtung nur mit `org.edit`. Eine noch verwendete Dienstart
lässt sich nicht löschen (Nachprüfung WP-11, N1). RECHTEMATRIX Abschnitt 2, Sonde in `rechtematrix-zeilen.test.js`.

## Prüfungen

| Datei | Inhalt |
|---|---|
| `pruefungen/fachpruefung-server.test.js` (18) | Qualifikation gesetzlich/betrieblich, Bestätigung für andere Person oder Regel deckt nichts, Ruhezeit Gesetz/Betrieb, Tagesgrenze mit und ohne „gelesen", Mindestbesetzung und Altbestand, Altbestand blockiert nicht, mittelbar über Dienstzeit und Schichtfolge, unbekannte Dienstart, neutrale Texte (auch für die Schichtverantwortung), Dienstarten nur mit `org.edit` |
| `pruefungen/fachpruefung-server.mjs` (HTTP, 11) | gegen einen laufenden Server: 403 Dienstarten (Planung), 200 (Leitung), 403 Qualifikation und Schutz (neutral), 409 mit Befundliste und ETag, nichts gespeichert, mit Bestätigung 200, Wer/Zeit vom Server, Schichtverantwortung 409 neutral |
| `pruefungen/rechtematrix-zeilen.test.js` | Abschnitt 2: Zeile vorhanden; MA, BR, SV, PL abgewiesen oder wirkungslos, LT und Kunde gespeichert |
| `pruefungen/nachpruefung-wp11.test.js` | WP-22-Semantik für 20–23 Uhr ab 16 (409, mit Bestätigung oder Einstellung angenommen); Laufzeit |

CI: Schritte „Fachprüfungen Server" (`npm run pruefung:fachpruefung`) und „Fachprüfungen Server (HTTP)"
(`npm run pruefung:fachpruefung-http`, frischer Container).

**Rot → grün.** Gegen `server/` und `src/` aus 87f815f (WP-11 mit Nachprüfung, ohne WP-22): in
`fachpruefung-server.test.js` 12 von 18 rot (alle Regel-, Bestätigungs-, Datenschutz- und `org.edit`-Fälle; grün
bleiben die Wächter: unbekannte Dienstart, Altbestand, Leitung darf, Checkliste, Schichtverantwortung wirkungslos,
schon unterbesetzt), in `rechtematrix-zeilen.test.js` „PL: Dienstart umbenennen" rot. Mit WP-22 alle grün.

**Angepasste bestehende Prüfungen** (nur, wo WP-22 das Verhalten bewusst ändert): Fälle, die als Planung Dienstarten
änderten, laufen als Leitung (`review-wp11`, `mandanten-session`, `session-kanal` Unit und HTTP); Quelltext-Prüfungen
folgen `hindernisBefunde → einteilungsBefunde` (`schutzpruefung-eine`, `konsistenz`, `schutzregeln-ersatzsuche`,
`review-wp10`); `betreiber-sicht` nimmt `einheitAm`/`imDienst` aus `fachpruefung.mjs`.

## Laufzeit

Gemessen in `pruefungen/nachpruefung-wp11.test.js` (warm, Minimum aus drei Läufen; strukturelle Änderung der
Schichtfolge, damit fast jede Einteilung neu zu prüfen ist — der ungünstige Fall):

| Fall | lokal (Windows, belastet) | CI |
|---|---|---|
| 300 Personen, 60 geschützt, 121 Tage, 3 000 Abweichungen (WP-22-Ziel < 300 ms) | 326–461 ms | **59,6 ms** warm, 165,5 ms kalt (20 520 Einteilungen) |
| 2 000 Personen, 300 geschützt, 121 Tage, 20 000 Abweichungen (Ziel Nachprüfung WP-11 < 300 ms) | 1,5–2,2 s | **343,8 ms** warm, 362,0 ms kalt (136 800 Einteilungen) — über dem Ziel |
| zum Vergleich WP-11 allein (nur Schutzprüfung, nur geschützte Personen), 2 000 / 300 | — | 19,2 ms warm, 50,5 ms kalt (9 510 Einteilungen) |

Eine ausdrücklich geänderte Einteilung (der Alltag: ein Dienst gesetzt oder getauscht) prüft nur diese Zelle und
gegebenenfalls Kolleginnen mit „kein Alleindienst" — Millisekunden. Teuer ist nur die strukturelle Änderung
(Schichtfolge, Versatz), die selten und nur durch die Leitung bzw. Planung geschieht. Maßnahmen: Planrechnung mit
Verzeichnissen (Abweichungen und Abwesenheiten je Person, Schichtfolge je Einheit und Tag), nur geänderte
Einteilungen, Datumsrechnung ohne Zeitzone und zwischengespeichert (`addDays`, `tagUTC`, `dow`, `alterAm`, `toMin`).
Die Laufzeit jeder Nachrechnung gibt der Server ohne Personenbezug aus (`[schutzdurchsetzung] … ms`).

## Grenzen

- Posten (aus einem Gruppendienst besetzt) und die Feiertagsanhebung der Mindestbesetzung rechnet nur die Oberfläche.
- Höchstarbeitszeit nur je Dienst (über zehn Stunden); der Durchschnitt nach § 3 Satz 2 ArbZG wird nicht je
  Einteilung geprüft (braucht Ist-Daten über sechs Monate).
- Dienste in Folge (`folge`), Verfügbarkeit der Person und Teilzeit-Wochentage bleiben Hinweise der Oberfläche.
- Mittelbar nur 120 Tage voraus; spätere Tage prüft die Planprüfung.
- Ändern sich nur Vorgaben des Betriebs (Qualifikationen, Einstellungen) ohne strukturelle Änderung, prüft der
  Server bestehende Einteilungen nicht nach (nur neue Befunde aus neuen Einteilungen).
- `maxDiensteWoche` zählt jetzt in Oberfläche und Server die anderen Tage der Woche (vorher zählte die Oberfläche den
  geprüften Tag mit, wenn dort schon ein Dienst stand).

## Offene Fachfragen

1. Tagesgrenze: sperren (strenger als die Oberfläche bisher) oder bei Bestätigung bleiben? Tarifliche Verlängerung
   nach § 7 ArbZG (12-Stunden-Dienste) bildet die Prüfung nicht ab — jeder neue 12-Stunden-Dienst ist bestätigungspflichtig.
2. Mindestbesetzung: Reicht „Achtung", oder soll das Unterschreiten gesetzlicher Untergrenzen (PpUGV) sperren?
3. Strukturelle Änderungen bei großen Betrieben: Laufzeit akzeptieren, im Hintergrund prüfen oder den Horizont kürzen?
