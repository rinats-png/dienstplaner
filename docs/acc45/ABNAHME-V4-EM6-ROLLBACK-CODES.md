# E-M6 — Widerrufene und ersetzte Zugangsdaten bleiben nach Rücksprung ungültig

Stand: 2026-11-13, überarbeitet nach dem unabhängigen Sicherheitsreview (Ergebnis FIX-NEEDED, Befunde 1–5, Abschnitt 9).
Grundlage: verbindliche Betreiberentscheidung E-M6 vom 2026-11-13 („bereits widerrufene oder ersetzte Zugangscodes
dürfen durch einen Rücksprung NIE wieder gültig werden“), Befund RB-2 in `docs/acc45/MIGRATION-ERSTEINRICHTUNGSCODES.md`
(PR #287), Ergänzungen des Betreibers zu verbrauchten Erstanmeldecodes (PR #281) und zum Produktionsbild 274bfa0.
Codestand: Zweig `feature/em6-widerrufene-codes-rollback` auf `integration/release-v4`.

## 1. Befund

| # | Rücksprung | Was vorher geschah | Ergebnis ohne E-M6 (belegt im Test, Gegenprobe) |
|---|---|---|---|
| a | Daten auf Stand T (ältere Sicherung, `ablage-sicherung wiederherstellen`, Verzeichniskopie, Snapshot) | Code oder Verwalterschlüssel nach T zurückgezogen/ersetzt/verbraucht | Sperre lag nur am Eintrag (`gesperrt: true`) in `data/` → mit zurückgespielt → **gilt wieder** (Anmeldung 200, `/einrichten` angenommen) |
| b | Bild zurück (compose auf älteren Digest), Daten unverändert | wie a, und Daten zusätzlich zurückgespielt | Altbild 274bfa0 kennt `gesperrt`, aber **nicht** `ersetztDurch` (`git show 274bfa0:server/funktionen/daten.mjs`, `…/arbeitssitzung.mjs` — 0 Treffer). Ein über die Kurzkennung gesperrter, umgeschlüsselter Code lebte dort über den alten Schlüssel weiter. Unbekannte Vermerke (`erstleitungVerbraucht`, #281) ignoriert jedes Altbild → ein „belegt“ verbrauchter Erstanmeldecode = gewöhnlicher Leitungscode (RB-2). |
| c | Sicherung mit anderem Pfeffer/anderer Epoche | — | Werkzeug lehnt anderen Pfeffer schon ab (Prüfwert); Sicherungsschlüssel: Schlüsselepoche. Für Codes und Verwalterschlüssel gab es keinen eigenen Schutz. |

Betroffen sind alle Zugangsdaten in Klasse A (`centric`, mitgesichert). Welche davon E-M6 abdeckt und welche nicht:
Abschnitt 8 (Matrix).

## 2. Erwogene Optionen

| | Option | Stärken | Schwächen |
|---|---|---|---|
| O1 | **Widerrufbuch außerhalb der Ablage** (Grabsteine in `CENTRIC_ZUSTAND`, wie die Schlüsselepoche), gesiegelt, mit Anker in der Ablage; Werkzeug und Serverstart ziehen das Buch in die Ablage nach (`gesperrt: true`) | Widerrufe überleben jede Wiederherstellung der Ablage; gültige Codes bleiben gültig; kein neuer Weg, kein neues Recht, keine Abhängigkeit; Altbilder verstehen das Ergebnis (`gesperrt`) | eine Datei mehr zu sichern; fail-closed bei Verlust ohne Kopie (bewusster Neuanfang nötig) |
| O2 | **Wiederherstellungsepoche für Codes**: jede Wiederherstellung macht alle vorher ausgestellten Codes ungültig | einfach, kein Buch | sperrt nach JEDER Wiederherstellung alle Beschäftigten aus; Altbild kennt die Epoche nicht → Rücksprung auf Altbild belebt alles |
| O3 | **Hash-verkettetes Widerrufsprotokoll**, Kopf im Protokoll oder außer Haus | erkennt Kürzen und Löschen in der Mitte | Protokoll liegt in der Ablage (Kopf rollt mit zurück); außer Haus = neuer Dienst/Abhängigkeit; Altbild versteht es nicht |

**Gewählt: O1**, ergänzt um Siegel und Anker aus O3.

## 3. Entwurf (umgesetzt)

**Widerrufbuch** `server/lib/widerrufbuch.mjs`, Datei `<CENTRIC_ZUSTAND>/zugang-widerrufe.json` (0600, atomar):

```
{ fassung: 1, id, ids[],
  eintraege: { <Ablageschlüssel eines Codes>: { am, grund } },          ← Widerruf
  verwalter: { <sha256 eines Verwalterschlüssels>: { am, grund } },      ← Widerruf (nur wenn belegt)
  betriebe:  { <HMAC(raum|mandantId)>: { am, grund, person? } },         ← Abschluss, KEIN Widerruf
  wiederherstellungen: [{ zeit, sicherungErstellt }], siegel }
```

- Nur Prüfsummen (wie die Dateinamen in `data/`), nie ein Code oder Schlüssel; Betriebe nur als HMAC; `person` ist die
  zufällige Personenkennung der ersten Leitung (`p_…`, kein Name). Siegel = HMAC-SHA-256 über den kanonischen Inhalt,
  Schlüssel aus `CENTRIC_PFEFFER` abgeleitet (`sha256("centric-widerrufbuch-v1:" + Pfeffer)`), Vergleich mit
  `timingSafeEqual`. `verwalter` und `person` gehen nur ins Siegel, wenn belegt (ein Buch ohne sie bleibt gültig).
  Nur fortgeschrieben, nie gekürzt; kein Weg entsperrt.
- **Anker** `centric/widerrufbuch:anker = { id }` in der Ablage (mitgesichert).
- **Ketten:** Widerruf eines Glieds (`ersetztDurch`) = Widerruf der ganzen Kette, im Buch **und** als `gesperrt: true`
  an jedem Glied in der Ablage (für Altbilder ohne `ersetztDurch`).
- **Zwei Klassen** (Befund 1): *Widerruf* — der Zugang gilt nie wieder. *Abschluss* (`betriebe`) — „Ersteinrichtung
  dieses Betriebs abgeschlossen“; sperrt keinen Code, stellt nach einem Rücksprung nur die Marke
  `erstleitung-marke:<raum>:<mandantId>` (#281) mit der Personenkennung wieder her.

**Was als widerrufen gilt** (`inAblageWiderrufen`, eingesammelt aus der Ablage): `gesperrt`; `ersteinrichtungVerbraucht`
(OPT-1 — danach ein unbekannter Code); `erstleitungVerbraucht` **nur** mit Grund `belegt` bzw. ohne Person (wie
`erstleitungUngueltig` in #281). **Nicht:** `erstleitungVerbraucht` mit Grund `angelegt` — das ist der gewöhnliche,
personengebundene Code der ersten Leitung.

**Wege**

| Ort | Verhalten |
|---|---|
| `POST /api/zugang-sperren` (`daten.mjs`) | **Zuerst** `gesperrt` an allen Gliedern der Kette, Feeds, Sitzungen und Sicherungsschlüssel beenden — **dann** Buch. Buch nicht schreibbar → 503 `„Widerruf wirksam, Widerrufbuch nicht beschrieben.“` mit `widerrufWirksam: true` und den Zahlen; Protokoll (nur Kurzkennungen), `/gesund` Prüfung `widerrufbuch` = warnung. |
| `DELETE /einrichten/verwalter` (`verwalter.mjs`, `einrichten.mjs`) | **Zuerst** `gesperrt` in der Ablage, dann Buch (`verwalter`). Buch nicht schreibbar → 503 wie oben. |
| `POST /api/anmelden` | Code (neu, alt, `ersetztDurch`) im Buch → wie gesperrt (403). Buch nicht prüfbar → 503, nach der Bremse. |
| Laufende Code-Sitzung (`arbeitssitzung.mjs`, `zugangGesperrt`) | Glied der Kette im Buch → `zugang-gesperrt`, Sitzung endet. Buch nicht prüfbar → `BESTAND_UNLESBAR` (503). |
| Kalenderfeed aus einem Code (`feedherkunft.mjs`) | Glied der Kette im Buch → `code-widerrufen`, Feed endgültig widerrufen. Buch nicht prüfbar → 503, nichts widerrufen. |
| Benannter Verwalterschlüssel (`verwalterPruefen`) | im Buch → abgewiesen (401). Buch nicht prüfbar → abgewiesen. Der Ursprungsschlüssel `CENTRIC_ADMIN` hängt nicht am Buch. |
| Ersteinrichtungscode OPT-1 (`zugangscode-ersteinrichtung.mjs`) | im Buch oder `gesperrt` → ungültig. Fehlversuchssperre: **zuerst** Ablage (verbraucht), dann Buch (Befund 3: vorher blieb der Code bei nicht schreibbarem Buch offen). Erfolgreiches Einlösen: nach der Einrichtung ins Buch. |
| Raumlöschung (`raumloeschung.mjs`) | Buch **vorn** (die Ablage kennt die Codes danach nicht mehr). Buch nicht les- oder schreibbar → Codes zuerst in der Ablage gesperrt, dann **trotzdem gelöscht** (Sammelblob unter `KONTEN_SPERRE` und Einzelkonten — Vertrag der Löschung, `loeschsperre.test.js`), danach als **Nachtrag** festgehalten (`widerrufbuch:nachtrag` in der Ablage plus Speicher, `nachtragAufnehmen`); `vollstaendig: false`, `/gesund` „Nachtrag offen“. Nächster Widerruf, Serverstart und `wiederherstellen --zustand` (vor dem Tausch) tragen ihn ein. Bis dahin gilt nur dann kein Code, wenn das Buch selbst nicht prüfbar ist (503); bei nur nicht schreibbarem Buch (zum Beispiel schreibgeschützte Datei) bleiben andere Codes gültig, die gelöschten sind aus der Ablage entfernt. Tests: `loeschsperre.test.js`, Block „E-M6 — Raumlöschung und Widerrufbuch“ (Buch fehlt/da/unlesbar, gleichzeitige Löschungen, Rücksprung). |
| Serverstart (`server.mjs`) | Stand feststellen (erstes Mal: Buch aus der Ablage anlegen), einsammeln (Codes, Verwalter, Marken, abgeschlossene Betriebe), nachziehen (`gesperrt` an Konten und Verwalterschlüsseln, fehlende Marken). Warnung unterscheidet die zwei Fälle (Abschnitt 4). |
| Jeder Bucheintrag (`fortschreiben`) | sammelt vorher alles ein, was die Ablage gesperrt kennt — ein früher gescheiterter Eintrag wird beim nächsten Widerruf nachgeholt (Reparaturweg). |
| `ablage-sicherung wiederherstellen --zustand` | vor dem Tausch: Buch und Anker prüfen, aus der **bisherigen** Ablage und der Sicherung einsammeln, in der Stufe sperren (Konten, Verwalter), fehlende Marken anlegen, Wiederherstellung vermerken. Ablage von einem lebenden Prozess belegt (`.prozess`) → Abbruch, auch mit `--ohne-serverpruefung`. Jeder Zweifel → nichts angefasst. |
| `ablage-sicherung widerrufbuch-neu` | bewusster Neuanfang nur ohne Buch, nur bei stehendem Server (HTTP und `.prozess`). |

**Reihenfolge und Absturz zwischen zwei Schreibvorgängen (Befund 3):**

| Reihenfolge | Abbruch dazwischen | Folge |
|---|---|---|
| Ablage → Buch (Widerruf, Verwalter, OPT-1) | Ablage gesperrt, Buch nicht | Code gesperrt (neue Fassung und Altbilder); Neustart/Werkzeug/nächster Widerruf sammeln ihn ein. Test: vorgeladener Kill nach dem Schreiben des Kontos, dann Altbild 274bfa0 → 403, ältere Sicherung mit dem Werkzeug → 403. |
| Buch → Ablage (Raumlöschung) | Buch geschrieben, Codes noch da | im Buch → 403; der Start sperrt sie nach; zweiter Lauf löscht. |
| Ablage → Nachtrag (Raumlöschung, Buch nicht schreibbar) | Codes gesperrt bzw. gelöscht, Nachtrag noch nicht geschrieben | gesperrte Codes sammelt der Start ein; gelöschte stehen im Nachtrag `widerrufbuch:nachtrag` in der Ablage und im Speicher; das Wiederherstellungswerkzeug liest ihn vor dem Tausch aus der aktuellen Ablage (Restrisiko nur bei zugleich defektem Buch und einem Rücksprung OHNE `--zustand`, `vollstaendig: false` und Protokoll zeigen den Lauf). |

**Zustände (fail-closed):**

| Buch | Anker | Folge |
|---|---|---|
| gültig, Kennung passt | da | normal |
| gültig | fehlt | Anker setzen (Sicherung von vor E-M6) |
| gültig, Kennung fremd | da | **kein Code gilt**, Werkzeug bricht ab |
| fehlt | fehlt | erstes Mal: Buch aus der Ablage anlegen |
| fehlt | da | **kein Code gilt**, Werkzeug bricht ab, nie still neu angelegt |
| beschädigt / Siegel falsch / anderer Pfeffer / unlesbar | — | **kein Code gilt**, Werkzeug bricht ab |

„Kein Code gilt“ heißt: Anmeldung 503, laufende Code-Sitzungen 503, Kalenderfeeds aus Codes 503, benannte
Verwalterschlüssel 401. Kontoanmeldung (E-Mail/Passwort) und der Ursprungsschlüssel bleiben.

Keine neue Route, kein neues Recht (`routen-inventar` unverändert). Protokoll nur mit Zahlen, Kurzkennungen und festen
Texten, nie Schlüssel oder Codes. Bestehende Daten werden nicht migriert.

## 4. Startwarnung — was nach einem Fehler beim Start wirklich gilt (Befund 4)

| Ursache | Meldung | Was gilt |
|---|---|---|
| Buch nicht prüfbar (Zustände oben) | `WARNUNG Widerrufbuch: … Bis zur Klärung gilt kein Zugangscode und kein benannter Verwalterschlüssel` | wie „kein Code gilt“ |
| Buch prüfbar, aber Ablage nicht lesbar oder Nachziehen gescheitert | `WARNUNG Widerrufbuch: … Das Buch ist prüfbar: Was darin steht, bleibt abgewiesen. Die Ablage ist aber NICHT nachgezogen …` | Codes im Buch: abgewiesen (Anmeldung, Sitzung, Feed). Übrige Codes: gültig. Ein **Altbild** auf diesen Daten nähme ungesperrte Codes an → vor einem Bild-Rücksprung beheben und neu starten. |

Die frühere Meldung „bis zur Klärung gilt kein Zugangscode“ für jeden Startfehler war im zweiten Fall falsch.
`/gesund` meldet beide Fälle als Prüfung `widerrufbuch` (warnung), ebenso einen offenen Nachtrag.

## 5. Bild-Rücksprung (Szenario b)

Neue Daten in `data/`: `gesperrt: true` (+ `gesperrtAm`, `gesperrtDurch`) an Konten und Verwalterschlüsseln, der Anker
und ggf. wiederhergestellte Marken. Altbilder ignorieren Anker und Marken und werten `gesperrt` aus. Geprüft mit dem
**alten Code** (`git archive` der Altstände, echter `server.mjs`) gegen Daten der neuen Fassung:

| Altstand | B (zurückgezogen), C (ersetzt), R (Kette über Kurzkennung), F (#281 „belegt“), V1 (Verwalter gesperrt) | A, L, V2 (gültig) |
|---|---|---|
| Merge-Basis `76621eba` | 403 / 401 | 200 / angenommen |
| Produktion `274bfa0` (kennt `ersetztDurch` nicht) | 403 / 401 | 200 / angenommen |

Bedingung: Daten mit dem Werkzeug **dieser** Fassung und `--zustand` zurückspielen oder diese Fassung einmal
starten, bevor ein Altbild läuft. Gegenprobe: altes Werkzeug + Altbild → B 200 und V1 angenommen (der Befund aus #287).

## 6. Kopplung an PR #281 (Erstanmeldecode, `erstleitung.mjs`) — Schnittstelle (Befund 1)

**Stand Kopplungsrunde (PR #281 nach dem Merge von #292): umgesetzt.** `erstleitungEinloesen` ruft nach der
Raumsperre `ersteinrichtungAbschliessen` (`angelegt`) bzw. `widerrufen` (`belegt`); `erstleitungRegimeVermerken`
ruft `regimeFesthalten` (neue Buch-Klasse `regime`, Review C1); `erstleitungStreng`, `erstleitungEingerichtet` und
das Einlösen lesen bei fehlender Marke das Buch (`regimeImBuch`, `ersteinrichtungImBuch`; Buch unklar → streng bzw.
eingerichtet). Marken und Regime-Marken werden für jeden Betrieb der Ablage nachgezogen, nicht nur über
Erstanmeldecodes (Review C2). Einzelheiten und Nachweise: `docs/acc45/ABNAHME-V4-A3-ERSTLEITUNG.md` §8b.

Befund: Die erste Fassung wertete JEDES `erstleitungVerbraucht` als Widerruf — auch Grund `angelegt`. In #281
(`erstleitung.mjs`, `einloesenGesperrt` Schritt 3, `verbrauchen(…, "angelegt", personId)`) ist ein so eingelöster Code
der **gewöhnliche Anmeldecode der ersten Leitung**. Nach dem Merge beider hätte der nächste Serverstart diesen Code ins
Buch übernommen und gesperrt — die erste Leitung jedes neu eingerichteten Betriebs wäre ausgesperrt gewesen. Behoben:

1. **`angelegt`** (Code an die erste Leitung gebunden): **kein Widerruf.** #281 ruft nach dem Anlegen der Marke
   `await ersteinrichtungAbschliessen(store, raum, mandantId, personId)`. Das hält nur den Abschluss fest (Klasse
   `betriebe`, mit Personenkennung) und stellt die Marke nach jedem Rücksprung wieder her (Serverstart:
   `setJSONWennNeu`; Werkzeug: in der Stufe). Ein offener Erstanmeldecode desselben Betriebs scheitert danach an der
   Marke (#281: andere vorgemerkte Kennung → `belegt`) — keine zweite erste Leitung.
2. **`belegt`** (verbraucht ohne Person): **Widerruf.** #281 ruft nach dem Verbrauchen
   `await widerrufen(store, [schluessel], "erstleitung-belegt")`.
3. Scheitert ein Aufruf, bleibt der Schritt in der Ablage gültig (Marke gesetzt bzw. Code verbraucht) und wird
   beim nächsten Widerruf, Serverstart oder bei der Wiederherstellung mit dem Werkzeug eingesammelt (auch ohne die
   Aufrufe: Marken `erstleitung-marke:*` und `angelegt`-Codes werden als Abschluss, `belegt`-Codes als Widerruf
   eingesammelt). Ohne die Aufrufe fehlt nur der Schutz für einen Abschluss zwischen letztem Einsammeln und einer
   Wiederherstellung per Verzeichniskopie ohne Werkzeug.
4. Die frühere Anweisung „`widerrufen` bei `angelegt`“ ist zurückgenommen.
5. **Raumlöschung:** `raumloeschung.mjs` löscht die Marken `erstleitung-marke:<raum>:*` des gelöschten Raums (nur exakt
   dieser Raum) mit den übrigen Daten aus der Ablage. Die **Abschlüsse (`betriebe`) und Widerrufe des gelöschten Raums
   bleiben im Widerrufbuch — mit Absicht**: Das Buch wird nur fortgeschrieben, nie gekürzt. Wird eine ältere Sicherung
   mit dem Raum zurückgespielt, zieht das Werkzeug (`--zustand`) bzw. der Serverstart die Marke aus dem Buch nach, alle
   Codes des Raums bleiben widerrufen, und die Ersteinrichtung öffnet sich nicht wieder (Test „Raum gelöscht, ältere
   Sicherung mit dem Raum zurück“). Datenschutz: Das Buch enthält dafür nur Kennungen (`HMAC(raum|mandantId)`,
   Ablageschlüssel als Prüfsummen) und die Personenkennung der ersten Leitung, keine Namen und keine Codes. Folge: Das
   Buch wächst mit jedem gelöschten Raum um dessen Einträge (je Code und Betrieb ein kurzer Eintrag). Für den Betreiber
   gibt es **keinen automatischen Weg**, solche Einträge zu entfernen; ein unter demselben Raumnamen UND derselben
   Betriebskennung neu angelegter Betrieb gilt als bereits eingerichtet (siehe R-10).

Nachweis: Der Test spielt die Gestalt nach (E `angelegt` mit Person und Marke, F `belegt`) und prüft: Neustart → E 200,
F 403, E nicht im Buch; ältere Sicherung → Marke wieder da, E nicht gesperrt, F 403; neuere Sicherung → E 200. Mit der
**echten** `erstleitung.mjs` läuft der Block „E-M6 × PR #281“ (TODO-Wächter: übersprungen, solange die Datei auf dem
Stand fehlt, mit ausdrücklicher Meldung). Gegen den Merge mit `origin/fix/leitungscode-ohne-person` @ `e8b9b93d`
(Wegwerf-Arbeitsbaum) grün, der ganze Test 14/14: `erstleitungEinloesen` → `angelegt`, Neustart → Login 200, zweiter
Code → `belegt` und im Buch, ältere Sicherung → Marke mit derselben Personenkennung wieder da, erneutes Einlösen
scheitert (`belegt`), Betrieb bleibt leer (keine zweite erste Leitung); dieser Verbrauch ist ein Widerruf und überlebt
auch die danach zurückgespielte neuere Sicherung (R-9).

**Hinweis für den Merge von #281:** `zugang-sperren` in `daten.mjs` kollidiert (#281: `kontoAendern`; E-M6: Kette und
Reihenfolge). Lösung wie im Wegwerf-Arbeitsbaum: je Glied von `new Set([...erlaubt, ...kette])`
`kontoAendern(…, (f) => gesperrtesKonto(f || konten[h], …))`, das Widerrufbuch erst danach.

## 7. Betreiberschritte

- **Wiederherstellen:** wie `BEREITSTELLUNG.md` §5.4, immer mit `--zustand`. Ausgabe „Widerrufbuch: n widerrufene
  Zugänge … m Marken der Ersteinrichtung und r Regime-Marken wiederhergestellt“ prüfen.
- **Bild-Rücksprung** (`deploy/ruecksprung.sh`): Wurden auch Daten zurückgespielt, zuerst mit dem Werkzeug dieser
  Fassung wiederherstellen (oder diese Fassung einmal starten), dann das Bild wechseln.
- **Sichern:** `zustand/zugang-widerrufe.json` liegt bewusst NICHT in restic/der Ablagesicherung (sonst rollte es mit
  zurück). Heute nur von Hand getrennt zu sichern (nach Widerrufen, mindestens täglich), jüngste Kopie gewinnt.
  Automatisierung: offene Betreiberentscheidung BE-3 (Abschnitt 10).
- **503 „Widerruf wirksam, Widerrufbuch nicht beschrieben“ / `/gesund` widerrufbuch=warnung:** Die Sperre wirkt. Mount
  und Rechte von `zustand/` prüfen, dann Dienst neu starten — der Start holt den Eintrag nach.
- **`WARNUNG Widerrufbuch` im Startprotokoll:** Meldung lesen (Abschnitt 4). Beschädigt → jüngste Kopie zurücklegen.
  Ohne jede Kopie: Datei beiseitelegen und `widerrufbuch-neu` (R-3), danach Codes und Verwalterschlüssel, die nach der
  letzten Sicherung zurückgezogen wurden, erneut zurückziehen. **Verlust des Buchs** heißt: alle Codes 503 bis
  `widerrufbuch-neu` — es gibt keinen anderen Weg und keine Hintertür.
- **Restore-Probe** (`deploy/sicherung/wiederherstellung-probe.sh`): Der Probe-Container läuft ohne `CENTRIC_ZUSTAND`
  und übt das Widerrufbuch NICHT (Datei-für-Datei-Vergleich, sonst wichen gesperrte Konten, Verwalter, Anker und Marken
  gewollt vom Manifest ab). Das Buch prüft allein `pruefung:em6-rollback-codes` (CI). Ein Lauf mit `--zustand` gegen
  eine KOPIE von `zustand/` ist möglich, ändert aber diese Kopie (Wiederherstellung vermerkt).

## 8. Matrix der Zugangsdaten — was eine ältere Sicherung zurückbringt (Befund 2)

| Klasse | Ablage | Wirkung eines Restores ohne E-M6 | Mit E-M6 | Vorschlag |
|---|---|---|---|---|
| Zugangscodes `konto:*` (zurückgezogen, ersetzt, Kette, OPT-1 verbraucht, #281 `belegt`, Raum gelöscht) | A | widerrufener Code gilt wieder | **abgedeckt** (Anmeldung, Sitzung, Feed, Altbilder) | — |
| #281 Ersteinrichtung abgeschlossen (Marke `erstleitung-marke:*`) | A | Betrieb fällt in die Ersteinrichtung zurück; offener Erstanmeldecode legt zweite erste Leitung an | **abgedeckt** (Abschluss im Buch, Marke für jeden Betrieb der Ablage wiederhergestellt; Einlösen und Ausstellen fragen das Buch; kein Code gesperrt) | umgesetzt (§6) |
| #281 strenges Regime (Regime-Marke `erstleitung-regime:*`) | A | Betrieb fällt auf die alten Regeln zurück; Leitungscode ohne Person bekommt wieder Leitungsrechte | **abgedeckt** (Buch `regime`, Regime-Marke für jeden Betrieb der Ablage wiederhergestellt; `erstleitungStreng` fragt das Buch) | umgesetzt (§6, Review C1) |
| Benannte Verwalterschlüssel `verwalter:*` | A | gesperrter Betreiber-/Verwalterschlüssel gilt wieder | **abgedeckt** (Buch `verwalter`, Werkzeug und Start sperren nach, Altbilder 401) | — |
| Ursprungsschlüssel `CENTRIC_ADMIN` | Umgebung | unberührt (nicht in der Sicherung) | — | Wechsel = Umgebung ändern |
| **Passwörter** der Konten (`account:*`, Hash) | A | ein nach T geändertes (z. B. kompromittiertes) Passwort gilt wieder | **nicht abgedeckt** | BE-1 |
| **Mitgliedschaften** (entzogene Betriebszugehörigkeit eines Kontos) | A | entzogener Zugang zum Betrieb wieder aktiv (Generation rollt mit zurück) | **nicht abgedeckt** | BE-1 |
| **2FA-Geheimnisse** (`zweifaktor:*`, Konto-Faktor) | A | ein nach T neu eingerichteter Faktor fällt auf das alte (ggf. kompromittierte) Geheimnis zurück | **nicht abgedeckt** | BE-2 |
| **Benutzte 2FA-Wiederherstellungscodes** | A | ein nach T benutzter Wiederherstellungscode gilt wieder | **nicht abgedeckt** | BE-2 |
| Arbeitssitzungen `t:`, Kontositzungen, Einmal-Token (`token:`, `tokencode:`), `zweifaktor-nachweis:` | C (nicht gesichert) | nichts lebt auf (alle melden sich neu an) | zusätzlich: Code-Sitzung fragt das Buch | — |
| Sicherungsschlüssel `sk:` | B | — | Schlüsselepoche (bestehend) | — |
| Kalenderfeeds aus einem Code | A | Feed eines widerrufenen Codes gilt wieder | **abgedeckt** (Herkunftsprüfung fragt das Buch) | — |
| Kalenderfeeds aus Konto/ohne Herkunft, einzeln zurückgesetzte Feeds | A | einzeln widerrufener Feed gilt wieder (sofern Person/Konto noch berechtigt) | **nicht abgedeckt** | BE-2 |
| Widerrufbuch selbst (`zustand/`) | nicht gesichert | — | Verlust → kein Code gilt bis `widerrufbuch-neu` | BE-3 |

## 9. Review E-M6 (FIX-NEEDED) — Befunde und Behebung

| # | Schwere | Befund | Behebung | Nachweis |
|---|---|---|---|---|
| 1 | HOCH | `angelegt` als Widerruf → erste Leitung jedes neuen Betriebs nach Merge mit #281 ausgesperrt; Doku wies #281 an, `widerrufen` bei `angelegt` zu rufen; Test hielt 403 fest | nur `belegt`/ohne Person ist Widerruf; Abschluss als eigene Klasse, Marke überlebt Restore; Schnittstelle neu (§6) | Test „Rücksprung …“: E 200 nach Neustart und nach neuerer Sicherung, nicht im Buch; Marke wiederhergestellt; Block mit echter `erstleitung.mjs` gegen Merge mit #281 grün |
| 2 | HOCH | `verwalter:*` nicht abgedeckt; Doku „nur `konto:*`“ falsch | Buch `verwalter`, Sperre Ablage→Buch, Prüfung in `verwalterPruefen`, Werkzeug und Start sperren nach; Matrix §8 | V1 nach Restore 401 (neue Fassung, beide Altbilder), Gegenprobe altes Werkzeug → angenommen |
| 3 | MITTEL | Widerruf fail-open: Buch nicht schreibbar → 503 ohne Sperre und ohne Sitzungsende | Ablage und Sitzungen zuerst, dann Buch; 503 „Widerruf wirksam, Widerrufbuch nicht beschrieben“, Protokoll, `/gesund`; Reparatur durch Einsammeln; OPT-1-Fehlversuche und Raumlöschung ebenso | Test mit schreibgeschütztem Buch (Sperre, Sitzungsende, Neustart holt nach); Test mit echtem Prozessabbruch zwischen beiden Schreibvorgängen |
| 4 | MITTEL | Falsche Aussage „kein Code gilt nach Startfehler“; Sitzungen und Feeds fragten das Buch nicht | Sitzung und Feed fragen das Buch (fail-closed, Zwischenspeicher je Dateistand); Startwarnung unterscheidet die Fälle (§4) | Test „Befund 4“ (Sitzung, Feed, Kette, manipuliertes Buch → 503) |
| 5 | NIEDRIG | R-1, fehlende Prozesssperre Werkzeug/Server, Sicherung des Buchs nur von Hand, Restore-Probe ohne Buch, Absturztest | R-1 präzisiert (§11); Werkzeug verweigert belegte Ablage (`.prozess`); BE-3; Probe-Hinweis §7; Absturztest (3) | Test „Prozesssperre“ |

Unverändert und erneut geprüft: Siegelableitung, `timingSafeEqual`, atomares Schreiben mit 0600, Manipulation → 503,
Mount `CENTRIC_ZUSTAND=/zustand` in `deploy/compose.yml`, Altbilder `274bfa0` und `76621eba` auf neuen Daten.

## 10. Offene Betreiberentscheidungen

| # | Frage | Vorschlag |
|---|---|---|
| BE-1 | Sollen Passwortänderungen und entzogene Mitgliedschaften einen Restore überleben? | Je Konto ein Stand im Buch (`HMAC(accountId)` → Passwortgeneration, Mitgliedschaftsgeneration). Liegt die Ablage darunter: Passwort ungültig (Rücksetzen per Mail) bzw. Mitgliedschaft ruht. Wirkung: nach jedem Restore müssen Konten, die nach T ihr Passwort änderten, es erneut setzen. |
| BE-2 | Sollen 2FA-Neueinrichtung, benutzte Wiederherstellungscodes und einzeln zurückgesetzte Kalenderfeeds einen Restore überleben? | Buch um `faktor` (Generation je Kennung) und `verbraucht` (Prüfwerte benutzter Wiederherstellungscodes, Feed-Hashes) erweitern; gleiche Mechanik wie `verwalter`. |
| BE-3 | Automatische Sicherung von `zustand/zugang-widerrufe.json`? | Eigener täglicher Job (verschlüsselt, getrennt von restic-`data/`, nur fortschreibend; Wiederherstellung wählt die JÜNGSTE Kopie). Heute: von Hand (§7). |

## 11. Restrisiken

| # | Risiko | Begrenzung |
|---|---|---|
| R-1 | `zustand/` wird auf eine ÄLTERE, korrekt gesiegelte Kopie zurückgesetzt (Snapshot über `data/` und `zustand/` gemeinsam, ältere Kopie zurückgelegt). Das ist nicht erkennbar: Siegel und Kennung passen. | Einsammeln aus der Ablage stellt alles wieder her, was die laufende Ablage gesperrt kennt (beim Start und bei jeder Wiederherstellung mit dem Werkzeug). Verloren ist nur, was weder in der Ablage zum Zeitpunkt des Einsammelns noch in der alten Kopie stand — Widerrufe zwischen beiden Ständen, wenn zugleich `data/` zurückgerollt wurde. `zustand/` nie mit `data/` zurückrollen; jüngste Kopie gewinnt; danach Widerrufe seit dem Kopiestand von Hand wiederholen. |
| R-2 | Wiederherstellung mit dem Werkzeug eines Altbilds und sofortiger Start eines Altbilds. | Betreiberschritt §7; die neue Fassung zieht beim nächsten Start nach. Gegenprobe im Test. |
| R-3 | Verlust des Buchs ohne Kopie → bewusster Neuanfang; Widerrufe, die nur im Buch standen, sind nicht mehr geschützt. | Fail-closed bis zur bewussten Entscheidung (alle Codes 503, keine Hintertür); BE-3. |
| R-4 | Wer Schreibzugriff auf `zustand/` **und** den Pfeffer hat, kann das Buch fälschen. | Außerhalb des Bedrohungsmodells (kann die Ablage ohnehin ändern). |
| R-5 | Fail-closed betrifft alle Codes und benannten Verwalterschlüssel eines Servers, solange das Buch unklar ist. | Gewollt; Kontoanmeldung und Ursprungsschlüssel bleiben. |
| R-6 | Keine gemeinsame Sperre zwischen Werkzeug und Server über Rechnergrenzen hinweg, die mehr kann als `.prozess` (Puls 45 s) und `/gesund`. | Werkzeug verweigert eine belegte Ablage (lebende PID auf demselben Rechner, frischer Puls eines anderen). |
| R-7 | Codes, die in einer verworfenen Folge NACH der Sicherung ausgegeben wurden (Ersatzcode C2), sind nach dem Rücksprung unbekannt (401). | Gewollt; Ersatz neu ausstellen. |
| R-11 | Ein Buch mit Einträgen `regime` ist für die Fassung von #292 ohne Kopplung (a9cc145b) nicht mehr gültig (Siegel über `regime`): Rücksprung des Bilds auf genau diese, nie ausgerollte Fassung → fail-closed (alle Codes 503). Produktion 274bfa0 liest kein Buch und ist nicht betroffen. | Rücksprung nur auf die Produktion oder auf eine Fassung mit Kopplung; sonst Buch-Kopie von vor der Kopplung zurücklegen (R-1). |
| R-9 | Nach einer älteren Sicherung (erste Leitung verloren) verbraucht ein Einlöseversuch des Erstanmeldecodes ihn nach #281 als „belegt“ — ein Widerruf, den auch eine danach zurückgespielte neuere Sicherung nicht aufhebt. | Gewollt (E-M6: nie wieder gültig); der Betreiber stellt der ersten Leitung einen personengebundenen Code aus. |
| R-8 | Nachtrag offen (Buch beim Widerruf nicht schreibbar) und danach Restore per Verzeichniskopie oder mit dem Werkzeug OHNE `--zustand`, ohne Start dazwischen: die gelöschten Codes sind dann wieder gültig (wie schon im Vorgängerentwurf: die Sperre lag nur in den getauschten Daten; das Werkzeug warnt). | `/gesund` warnt; 503-Antwort an die Leitung; Start oder Werkzeug holt nach. |
| R-10 | Abschlüsse, Regime und Widerrufe gelöschter Räume bleiben dauerhaft im Buch (§6 Nr. 5): Das Buch wächst; ein Betrieb, der unter demselben Raumnamen UND derselben Betriebskennung neu angelegt wird, gilt sofort als eingerichtet (kein Erstanmeldecode; Einlösen `belegt`) und als streng; die Marken werden beim nächsten Start bzw. bei der nächsten Wiederherstellung nachgezogen. Dasselbe gilt (Review #281, INFO) für einen Betrieb, den der Betreiber per `PUT /api/bestand` aus einem bestehenden Raum entfernt und unter **derselben Betriebskennung** wieder anlegt: Der Raum wurde nicht gelöscht, Marke und Bucheintrag des alten Betriebs bestehen fort — der neue Betrieb erhält **keinen Erstanmeldecode** (`/api/zugaenge`, `/einrichten` stellen keinen aus; ein vorhandener wird beim Einlösen `belegt`). | Gewollt (Rücksprungschutz geht vor). Nur Kennungen und Prüfsummen, keine Namen oder Codes. Betreiber: einen neuen Raumnamen oder eine neue Betriebskennung wählen und der ersten Leitung einen personengebundenen Code ausstellen; ein Entfernen aus dem Buch gibt es nicht automatisch. Beim per PUT neu angelegten Betrieb mit alter Kennung ebenso, mit vorhandenen Mitteln: entweder den Betrieb unter einer **neuen** Betriebskennung anlegen (dann neu, streng, Erstanmeldecode möglich), oder die erste Leitung in der Konsole als Person des Betriebs anlegen und ihr über `/api/einladung` einen personengebundenen Zugang ausstellen. Ein Werkzeug, das Marke oder Bucheintrag zurücknimmt, gibt es bewusst nicht. |

## 12. Nachweis

`pruefungen/em6-rollback-codes.test.js` (`npm run pruefung:em6-rollback-codes`, CI-Schritt „E-M6, widerrufene
Zugangscodes nach Rücksprung ungültig“), echte Serverprozesse und echtes Werkzeug; Ergebnisse und Laufzeiten in der
PR-Beschreibung.
