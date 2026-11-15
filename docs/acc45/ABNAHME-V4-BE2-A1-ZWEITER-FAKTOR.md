# Abnahme V4 — BE-2 Stufe A1: Pflicht-Faktor und verbrauchte Wiederherstellungscodes nach Rücksprung

Stand: 2026-11-15. Grundlage: verbindliche Betreiberentscheidung vom 2026-11-14 zu BE-2, **Option A, Stufe A1** (vor dem
ersten produktiven Pilot), aus `docs/acc45/ENTSCHEIDUNG-BE1-BE3.md` §2 (PR #293). Baut auf BE-1 auf
(`docs/acc45/ABNAHME-V4-BE1-KONTO-WIDERRUFBUCH.md`, PR #304 und Folge-PRs #307/#308).

Grundsatz (verbindlich):

1. Ein einmal **aktivierter** zweiter Faktor eines Kontos verschwindet durch das Zurückspielen eines älteren
   Datenstands **nie still**. Fehlt er danach, gibt es **keine** Anmeldung und **keine** Neueinrichtung mit dem
   Passwort; das Geheimnis wird **nie** automatisch zurückgelegt.
2. Ein bereits **eingelöster** Wiederherstellungscode wird durch einen Rücksprung **nie** wieder gültig.

**Nicht** enthalten (nach dem Pilot, eigene Pakete): A2 — abgelöste Faktor-Geheimnisse (Szenario 2a), A3 — einzeln
erneuerte Kalenderfeeds (2d), BE-3 (automatische Sicherung/Vereinigung der Bücher), Betreibercodes und
Verwalterschlüssel (deren zweiter Faktor hängt nicht an Konten). Das Format ist für A2/A3 vorbereitet (§2.5).

## 1. Ausgangslage

Der Konto-Faktor liegt unter `zweifaktor:<kontoFaktorId>` in der Ablage `centric` (Klasse A), die verbrauchten
Wiederherstellungscodes als `verbraucht`-Vermerk im selben Datensatz. Beides rollt mit jedem Daten-Rücksprung zurück:

- **2b (Herabstufung):** Faktor nach der Sicherung eingerichtet → nach dem Rücksprung ist das Konto faktorlos. Wer das
  Passwort kennt (BE-1 Szenario 1a: abgeflossenes, danach geändertes Passwort) und einen wieder gültigen
  Ersteinrichtungscode hat, richtet einen eigenen Faktor ein und erhält auch unter 2FA-Pflicht eine Leitungssitzung —
  die einzige P1-Kette aus BE-1/BE-2 (Vorlage §5).
- **2c (verbrauchter Code lebt auf):** WR-2 verwirft nach einem **erkannten** Rücksprung jeden alten Satz (Schlüssel-
  epoche). Offen war der **nicht erkannte** Rücksprung und `NODE_ENV=development/test` (Vorlage §0.2).

## 2. Gestaltung

### 2.1 Daten — zwei neue Abschnitte im BE-1-Konto-Widerrufbuch

`<CENTRIC_ZUSTAND>/konto-widerrufe.json` (BE-1: eigene Datei, eigenes Siegel aus dem Pfeffer, Anker
`kontowiderrufbuch:anker` in der Ablage) bekommt zwei Abschnitte der Gestalt `{ <HMAC-Kennung>: { am, grund } }`:

| Abschnitt | Kennung (HMAC, Schlüssel aus dem Pfeffer, Kontext `centric-kontowiderrufe-kennung-v1`) | Bedeutung |
|---|---|---|
| `faktorpflicht` | `faktor\|<accountId>` | Der Faktor dieses Kontos war einmal **aktiv** — monoton: einmal Pflicht, immer Pflicht. |
| `whverbraucht` | `whcode\|<accountId>\|<Einrichtungsgeneration>\|<Satzgeneration>\|<Selektor>` | Dieser Wiederherstellungscode ist eingelöst. Gekennzeichnet über seine **Stelle**, nie über den Code oder seinen Prüfteil. |

Kein Geheimnis, kein Fingerabdruck des Geheimnisses, keine Kontokennung, keine Adresse, kein Raum im Klartext (Test 1
prüft das am geschriebenen Buch). Das Siegel deckt die ganze kanonische Datei; BE-1 kennt unbekannte Abschnitte dieser
Gestalt als „künftige Abschnitte“ — eine Fassung ohne A1 (z. B. `aff9c320`) prüft und erhält sie (Test 5).

**Warum im BE-1-Buch statt einer dritten Datei:** gleiche Mechanik, ein Anker, eine Kopie für BE-3; die Erweiterbarkeit
war in BE-1 genau dafür angelegt (Abnahme BE-1 §2.4). Das Buch der Zugangscodes (E-M6) bleibt unberührt.

### 2.2 Schreiben (Reihenfolge wie BE-1/E-M6: zuerst Ablage, dann Buch)

| Vorgang | Ablage | Buch | Buch nicht schreibbar |
|---|---|---|---|
| Faktor bestätigen (`kontoFaktorBestaetigen`, jeder Weg) | `stand: aktiv` | `faktorpflicht` | Faktor bleibt aktiv, Codes gehen an den Inhaber (erscheinen nur einmal); `kontobuch.geschrieben: false`, Nachtrag `kontowiderrufbuch:nachtrag`, `/gesund` warnt |
| Wiederherstellungscode einlösen (`kontoFaktorPruefen`) | `verbraucht` am Eintrag | `whverbraucht` | **keine Sitzung** (503 `faktor-buch`, fail-closed); der Code ist verbraucht, der Nachtrag hält ihn fest |

Beide Einträge sind zusätzlich **einsammelbar** aus der Ablage (aktiver Faktor; Eintrag mit `verbraucht`): jeder
weitere Schreibvorgang ins Buch, jeder Serverstart, das Werkzeug (`wiederherstellen --zustand`, `kontowiderrufbuch-neu`)
holen sie nach — auch nach einem harten Prozessabbruch zwischen Ablage und Buch (Test 8).

### 2.3 Prüfen

| Stelle | Regel |
|---|---|
| Anmeldung (`faktorDerAnmeldung`) | Ablage trägt den Platzhalter **oder** `faktorpflicht` und Ablage zeigt keinen aktiven Faktor → **403** `zweifaktor: "ruecksprung"` mit klarem Hinweis; kein Code wird geprüft, keine Sitzung |
| Faktor-Aktionen (`stand`, `beginnen`, `bestaetigen`, `wiederherstellung-neu`) | dasselbe **vor** jeder Aktion und vor dem Ersteinrichtungscode → 403; das Passwort richtet nichts neu ein |
| Kontositzung ohne Faktor (`sitzungPruefen`) | `faktorpflicht` → Sitzung beendet |
| Arbeitssitzung aus einer Anmeldung ohne Faktor (`arbeitssitzungPruefen`, je Anfrage) | aktiver Faktor (auch Platzhalter) **oder** `faktorpflicht` → Sitzung beendet (401); Buch nicht prüfbar → 503, Sitzung bleibt (wie BE-1, Schritt 3b). Tiefenschutz für den Fall, dass das Nachziehen beim Start scheiterte (Test 11); Kosten: dasselbe zwischengespeicherte Buch wie die BE-1-Prüfung derselben Anfrage (ein `stat`, ein HMAC, kein Lesen bei unveränderter Datei) |
| Wiederherstellungscode (`zweifaktorPruefen` mit `whBuch`, nur Konto-Faktor) | Stelle im Buch → nicht eingelöst (401 wie ein falscher Code); Altformat ohne Stelle gilt mit Buch nicht |
| Buch nicht prüfbar (fehlt bei Anker, beschädigt, gekürzt, fremd, falsches Siegel) | wie BE-1: **kein Konto-Zugang** (503); Zugangscodes unberührt |

Konten **ohne** Eintrag in `faktorpflicht` verhalten sich unverändert (Test 1, 3; `erstleitung-bestand-differenz`
138/138).

### 2.4 Normalisieren (Serverstart und Werkzeug `wiederherstellen --zustand`)

- **Pflicht-Faktor fehlt oder ist nicht aktiv** → in der Ablage durch den **gesperrten Platzhalter** ersetzt:
  `{ stand: "aktiv", ruecksprungSperre: true, geheimnis: null, wiederherstellung: null, … }`. Kein Geheimnis wird
  zurückgelegt. Jede Fassung mit Konto-Faktor verlangt dann einen Faktor, den es nicht gibt: diese Fassung 403,
  ältere Fassungen (`aff9c320`) 401 ohne Code bzw. 503 mit Code, `beginnen` „faktor-aktiv“ — **altbildfest** (Test 5).
- **Verbrauchter Code in der Ablage unverbraucht** → als `verbraucht` vermerkt (Zähler mit), damit auch eine ältere
  Fassung ihn ablehnt.
- Werkzeug und Start melden nur Anzahlen; das Werkzeug warnt mit „ACHTUNG“, der Start mit `WARNUNG Konto-Widerrufbuch`,
  wenn Platzhalter gesetzt wurden.

### 2.5 Erweiterbarkeit für A2/A3

A2 (abgelöste Geheimnisse) und A3 (erneuerte Feeds) sind weitere Abschnitte derselben Gestalt
(`{ <HMAC>: { am, grund } }`) im selben Buch; `abschnittEintragen`, Nachtrag, Einsammeln und Vereinigung sind dafür
generisch. Kommt ein Verlustweg für Konten (WR-9), muss er (a) A2 mitbringen und (b) die aus einem freigegebenen Fall
ausstehende Einrichtung ausdrücklich zulassen — heute gibt es keinen solchen Weg (§5 R-6).

## 3. Matrix

| Fall | Ergebnis | Test |
|---|---|---|
| Bestand ohne Faktor (Konto N, S, K vor Einrichtung) | unverändert 200, Betrieb 200 | 1, 3 |
| Konto mit Faktor vor der Sicherung (J) nach jedem Rücksprung | 200 mit Code, Betrieb 200 | 3, 5, 6 |
| **Rücksprung mit Werkzeug (--zustand) auf Stand ohne K's Faktor** | Platzhalter, K 403 (mit/ohne Code), `beginnen` 403 | 3 |
| Rücksprung **ohne** `--zustand` (Ablage faktorlos) | Buch weist ab; Start setzt Platzhalter; K 403 | 4 |
| Altbild vor A1 auf nachgezogenen Daten | K 401/503, nie 200; J, N wie bisher | 5 |
| **Vollständiger, richtiger Rücksprung** (Ablage + Bücher, dokumentierter Weg) | K mit Code 200 | 6 |
| **Verbrauchter Wiederherstellungscode nach nicht erkanntem Rücksprung** | 401; unverbrauchter Code desselben Satzes 200 | 7 |
| Verbrauchter Code, Ablage erst **nach** dem Start zurückgelegt (kein Nachziehen) — Buchprüfung im Anmeldeweg allein | 401, nichts eingelöst | 8 |
| SIGKILL zwischen Ablage und Buch — Einlösen | Start sammelt ein; Rücksprung → Code 401 | 9 |
| SIGKILL zwischen Ablage und Buch — Aktivieren | Start sammelt ein; Rücksprung → Konto 403 | 9 |
| Buch verändert / gekürzt / fremd / fehlend bei Anker | Konto-Anmeldung 503 (mit und ohne Faktor); Werkzeug Abbruch, nichts angefasst | 10 |
| Kopie des Buchs zurückgelegt | alles wie vorher | 10 |
| Buch verloren, keine Kopie: `kontowiderrufbuch-neu` | Pflicht für alle aktiven Faktoren (auch Platzhalter) aus der Ablage | 10 |
| Laufende Arbeitssitzung ohne Faktor; danach `faktorpflicht` im Buch, Ablage ohne Faktor und ohne Platzhalter | nächste Anfrage 401, Sitzung beendet; neue Anmeldung 403 | 11 |
| Anderer Betrieb (N, S in Haus B), andere 2FA-Konten (J, R) | unberührt | 3, 9, 11 |
| Bausteine: nur hinzufügen, Vereinigung erhält Abschnitte, Siegel deckt sie, Kennung = `kontoFaktorId` | ja | 12–14 |

## 4. Prüfungen

`npm run pruefung:be2-a1-zweiter-faktor` (`pruefungen/be2-a1-zweiter-faktor.test.js`, 14 Fälle): echte Serverprozesse
(`node server.mjs`), echtes Werkzeug, echte Faktor-Prozesse (`pruefungen/hilfen/be2-faktor.mjs`), harter Abbruch über
`pruefungen/hilfen/em6-abbruch.mjs` (SIGKILL nach dem Umbenennen der Ablagedatei, vor dem Buch). Altbild:
`git archive aff9c320` (Integrationsstand vor A1). Fall 7–9 laufen unter `NODE_ENV=test`, weil unter `production` die
Verzeichniskopie von WR-2 erkannt wird und dann ohnehin kein alter Code gilt — so entscheidet dort allein das Buch.
Fall 8 legt die Faktor-Datei erst bei laufendem Server zurück: Das Nachziehen beim Start kann die Buchprüfung im
Anmeldeweg (`whBuch`) dann nicht verdecken (Mutationsprobe: ohne die Prüfung wird Fall 8 rot). Fall 11 beschreibt das
Buch bei laufendem Server (Mutationsprobe: ohne die Buchprüfung in `arbeitssitzungPruefen` wird Fall 11 rot).

Regression (einzeln, nacheinander): `be1-konto-widerrufbuch`, `em6-rollback-codes`, `wiederherstellung-schutz`,
`wiederherstellung-neu`, `sicherung-ablage`, Erstleitungs-Prüfungen (`erstleitung-bestand-differenz` allein: 138/138),
2FA-Prüfungen (`zweifaktor`, `konto-faktor-pflicht`, `rollen-zweifaktor`, `betreiber-zweifaktor`, …), `rechtematrix`,
`routen-inventar`, `prozess-wachen`, Lint, Typen, `ci-abdeckung`. Ergebnisse im PR.

## 5. Restrisiken

- **R-1 Bild-Rücksprung auf `274bfa0`:** kennt keine 2FA — fail-open für jeden Faktor, unabhängig von A1 (Vorlage §4.1).
  Bedingung bleibt: kein `vorherig` = `274bfa0`.
- **R-2 Ältere Fassung zuerst gestartet:** Wird ohne Werkzeug/`--zustand` zurückgespielt und **vor** dieser Fassung ein
  Bild ohne A1 (aber mit Konto-Faktor) gestartet, fehlt der Platzhalter; dort richtet Passwort + gültiger
  Ersteinrichtungscode einen neuen Faktor ein. Gegenmittel: Betreiberschritt §6.1 (immer Werkzeug dieser Fassung mit
  `--zustand`, oder diese Fassung einmal starten, erst dann ein älteres Bild).
- **R-3 Buch verloren ohne Kopie (BE-3 offen):** `kontowiderrufbuch-neu` sammelt nur aus der Ablage — nach der
  Sicherung eingerichtete Faktoren und eingelöste Codes, die nur im verlorenen Buch standen, sind dann nicht geschützt.
- **R-4 Buch und Ablage gemeinsam zurückgerollt** (Snapshot über `data/` und `zustand/`): nicht erkennbar (wie BE-1 R-1).
- **R-5 Abbruchfenster:** Abbruch zwischen Ablage und Buch **und** Rücksprung, bevor ein Start oder weiterer
  Schreibvorgang einsammeln konnte → Eintrag fehlt. Ein Schreibfehler ohne Abbruch landet im Nachtrag.
- **R-6 A2 nicht enthalten:** Ein nach der Sicherung **ersetztes** Geheimnis (heute für Konten nicht möglich — es gibt
  kein Abschalten und keinen Verlustweg für Konten) lebte wieder auf. Relevant ab WR-9.
- **R-7 Verfügbarkeit — Betreiber muss akzeptieren:** Ein Konto mit fehlendem Pflicht-Faktor bleibt gesperrt. Enthält
  **keine** Sicherung den verlorenen Faktor, ist der **einzige** Weg in dieser Fassung: die Person mit einer **neuen
  E-Mail-Adresse** neu einladen; das **alte Konto bleibt dauerhaft gesperrt** (§6.2). Das optionale Offline-Werkzeug
  (§6.2) ist **nicht gebaut** und braucht eine **gesonderte Freigabe**. Ein eingelöster Code bei nicht schreibbarem Buch
  kostet den Code (503, kein Zugang).
- **R-8 TOTP-Wiederholung** im selben 30-s-Schritt nach einem Rücksprung (`letzterSchritt` rollt mit) — praktisch
  bedeutungslos (Vorlage §2.2).

## 6. Betreiberschritte

### 6.1 Nach jedem Daten-Rücksprung

1. Wiederherstellen **nur** mit dem Werkzeug dieser Fassung und `--zustand` (BEREITSTELLUNG.md §5.4); vorher Kopie von
   `zustand/` ziehen (nicht verschieben).
2. Ausgabe lesen: `Zweiter Faktor (BE-2 A1): … n Pflicht-Faktoren fehlen in der Sicherung und sind gesperrt`. Ist n > 0:
   **zuerst prüfen, ob eine jüngere Sicherung den Faktor enthält**, und dann diese zurückspielen (wieder mit
   `--zustand`). Das ist der Normalweg: Ablage **und** Buch passen, die Anmeldung mit Code aus der App gilt (Test 6).
3. Server dieser Fassung einmal starten, **bevor** ein älteres Bild läuft. Startprotokoll: `Faktoren: … Pflicht, …
   nach Rücksprung gesperrt`; bei Platzhaltern zusätzlich `WARNUNG Konto-Widerrufbuch`.
4. `/gesund` → `kontowiderrufbuch: ok`, kein offener Nachtrag.

### 6.2 Faktor nach einem Rücksprung legitim verloren (keine Sicherung enthält ihn)

> **Betreiber muss akzeptieren** (Abnahmepunkt R-7; von der Entwicklung nicht entschieden): Enthält keine Sicherung
> den verlorenen Faktor, ist die **einzige** Wiederherstellung in dieser Fassung, die Person mit einer **neuen
> E-Mail-Adresse** neu einzuladen. Das **alte Konto bleibt dauerhaft gesperrt** (der Eintrag in `faktorpflicht` wird nie
> entfernt; es gibt keinen anderen Weg hinein). Das unten beschriebene optionale Offline-Werkzeug ist **nicht gebaut**
> und braucht eine **gesonderte Betreiberfreigabe**, bevor es gebaut wird.

Es gibt **keine** Hintertür: keine Route, kein Betreiberrecht, keine Personenbearbeitung, die den Platzhalter entfernt
oder ein Geheimnis setzt. Ein ausdrücklicher, protokollierter Offline-Schritt dafür (z. B. ein Werkzeug
`faktor-neu-freigeben`, das bei stehendem Server nach Vier-Augen-Identitätsprüfung den Platzhalter durch eine
**ausstehende** Einrichtung ersetzt, die nur mit einem frischen Ersteinrichtungscode bestätigt werden kann) wäre ein
**neues Betreiberwerkzeug** und braucht laut Auftrag eine **eigene Freigabe** — es ist **nicht gebaut**.

Bis dahin (ohne neues Werkzeug):

1. Betroffene Person über einen unabhängigen Kanal identifizieren; Vorgang im `betrieb-protokoll.log` vermerken
   (wer, welches Konto — nur Kontokennung `a_…`, Grund, welche Sicherungen geprüft).
2. Die Leitung lädt die Person mit einer **neuen Adresse** neu ein (gewöhnlicher Einladungsweg); das neue Konto richtet
   seinen Faktor mit eigenem Ersteinrichtungscode ein. Das alte Konto bleibt gesperrt (der Eintrag im Buch wird nie
   entfernt).
3. Alternative bei Mangel an Adressen: Konto gesperrt lassen bis zur Entscheidung über das Werkzeug.

**Betreiberentscheidung nötig:** ob ein Offline-Werkzeug nach 6.2 gebaut werden soll (Umfang, Vier-Augen, Protokoll).

### 6.3 Buch beschädigt, fremd oder verloren

Wie BE-1 (BEREITSTELLUNG.md §5.4, Konto-Widerrufbuch): Kopie zurücklegen; ohne Kopie bei stehendem Server
`kontowiderrufbuch-neu` (sammelt aktive Faktoren und eingelöste Codes aus der Ablage; R-3).

## 7. Geänderte Dateien

| Datei | Änderung |
|---|---|
| `server/lib/kontowiderrufbuch.mjs` | Abschnitte `faktorpflicht`/`whverbraucht`, Kennungen, Einsammeln, Nachtrag, Normalisieren (`faktorenNormalisieren`, `sperrFaktor`), Prüfen/Vermerken, Startzahlen |
| `server/lib/zweifaktor.mjs` | `zweifaktorStand.ruecksprungSperre`; `zweifaktorPruefen(… whBuch)` — Buchprüfung vor dem Einlösen, Stelle im Erfolg |
| `server/lib/kontofaktor.mjs` | Bestätigen → `faktorpflicht`; Prüfen → Buch fragen, danach `whverbraucht`; Stand mit `ruecksprungSperre` |
| `server/lib/accountanmeldung.mjs` | Anmeldung, Faktor-Aktionen, Sitzung: Rücksprung-Prüfung, `HINWEIS_FAKTOR_RUECKSPRUNG` |
| `server/funktionen/anmeldung.mjs` | 403 `zweifaktor: "ruecksprung"` (keine neue Route) |
| `server.mjs` | Startmeldung und Warnung |
| `werkzeug/ablage-sicherung.mjs` | Faktoren lesen, in der Stufe nachziehen, Meldung/Warnung |
| `server/lib/arbeitssitzung.mjs` | Arbeitssitzung ohne Faktor: zusätzlich `faktorpflicht` im Buch (Tiefenschutz, Review PR #311) |
| `pruefungen/be2-a1-zweiter-faktor.test.js`, `pruefungen/hilfen/be2-faktor.mjs` | Prüfung, Hilfsprozess |
| `package.json`, `.github/workflows/pruefung.yml` | `pruefung:be2-a1-zweiter-faktor` |
| `BEREITSTELLUNG.md` §5.4, `docs/BETRIEBSHANDBUCH.md` §4 | Betreiberschritte |
