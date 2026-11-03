# CENTRIC Intelligence – Faktenpaket, Positivliste, Alias (WP-I11)

Stand: 2026-11-03 · Paket: WP-I11 (Strang `intelligence`) · Grundlage: [`ARCHITEKTUR-ABGLEICH.md`](ARCHITEKTUR-ABGLEICH.md) (AD-04, AD-12, AD-13, 2.1–2.4), [`CENTRIC-INTELLIGENCE.md`](CENTRIC-INTELLIGENCE.md) 6.2 und 8.1, [`../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md`](../acc45/INTELLIGENCE-ENTWICKLUNGSPLAN.md) (I11).
Nachweis: [`../acc45/wp-i11-nachweis.md`](../acc45/wp-i11-nachweis.md).

**Status:** implementiert und lokal getestet. Unabhängige Sicherheitsprüfung durchgeführt; ihre Befunde F1–F10 sind im Nachtrag umgesetzt (Nachweis, Abschnitt „Nachtrag"). Der Nachtrag selbst ist **nicht** erneut unabhängig geprüft. **Nicht** integriert. Es gibt **keinen Modellaufruf**, keinen Anbieter, keinen Netzzugriff, keine Route und keinen Schlüssel. Das Modul wird von nichts im Produkt aufgerufen; es ist die Grundlage für das Gateway (WP-I13).

**Rechtliches:** Ob das hier beschriebene Verfahren eine Pseudonymisierung im Sinne der DSGVO ist, ob eine Auftragsverarbeitung, eine Datenschutz-Folgenabschätzung oder eine Beteiligung der Arbeitnehmervertretung nötig ist und welche Rechtsgrundlage trägt, ist **zu prüfen**. Dieses Dokument behauptet keine Rechtsgrundlage. Pseudonymisierte Daten bleiben personenbezogen; das Faktenpaket ist nicht anonym (Abschnitt 9).

## 1. Worum es geht

Ein Sprachmodell bekommt nie den Bestand, sondern ein **Faktenpaket**: eine flache Liste typisierter Fakten (Zahl, Uhrzeit, Datum, Zustand, Kennung, ja/nein). Personen, Einheiten und Objekte stehen darin nur als **Alias**. Das Paket entsteht aus der **Sicht der auslösenden Rolle** (`bestandFuerRolle` → `sicht.mjs`) **geschnitten** mit einer **Positivliste je Funktion**. Vor der Herausgabe prüft eine **Leck-Prüfung** jeden Wert; bei Verdacht wird das ganze Paket verworfen (fail closed).

Vier Schranken, jede für sich verweigernd:

| Schranke | Datei | Was sie verhindert |
|---|---|---|
| 1. Feldkatalog | `felder.mjs` | Ein Feld, das nicht im Katalog steht, kann kein Fakt werden (Schema: `feld` ist eine feste Liste). Namen, Kontakte, Gründe, Schutzmerkmale, Notizen stehen nicht im Katalog. |
| 2. Positivliste je Funktion | `positivliste.mjs` | Funktion ohne Eintrag, Rolle ohne Nennung, Feld ohne Nennung → verweigert. Schnitt mit der Rollensicht. |
| 3. Schema | `schemas.mjs` | Unbekannte Felder, falsche Typen, Freitext in Wertfeldern, Längen, Tiefe, Größe. |
| 4. Leck-Prüfung | `leckpruefung.mjs` | Klarnamen (Sperrliste aus dem rohen Betrieb), Kontaktdaten, IBAN, Personalnummer, Geburtsdatum, rohe Kennungen, Raum/Betrieb, Gesundheits- und Schutzbegriffe, Koordinaten, Token, verbotene Feldnamen. |

## 2. Dateien

```text
server/lib/intelligence/
  schemas.mjs       Verträge (JSON Schema 2020-12, Fassung 1.0) + strenger Prüfer
  felder.mjs        Feldkatalog (Art, Einheit, Subjekt, Herkunft, Zweck)
  positivliste.mjs  Registry je Funktion (Rollen, Felder, Personenbezug, Fremdtext)
  faktenpaket.mjs   Bildner: Sitzung → Sicht → Schnitt → Alias → Schema → Leck-Prüfung
  alias.mjs         Alias-Karte (keyed HMAC), Rückübersetzung
  leckpruefung.mjs  Sperrliste + Muster, fail closed
  kapsel.mjs        Fremdtext bereinigen, begrenzen, für den Prompt kapseln
  fehler.mjs        KiFehler mit Code (KI_…)
pruefungen/intelligence-*.test.js   (6 Dateien, Schritt pruefung:intelligence; intelligence-nachtrag = Review-Befunde F1–F10)
```

Importe nur innerhalb von `intelligence/`, aus `../rechte.mjs`, `../sicht.mjs`, `../bestaetigungen.mjs` (nur lesend) und `node:crypto`. Ein statischer Test (`intelligence-vertraege.test.js`, „Modulgrenzen") verbietet `fetch`, `node:http(s)`, `node:net`, `node:fs`, `process.env`, Anbieternamen, Importe aus `src/` und jeden Schreibweg in den Bestand; und er prüft, dass `server/lib/*.mjs` nichts aus `intelligence/` importiert.

## 3. Ablauf von `faktenpaketBilden`

```js
const { paket, aliasKarte } = await faktenpaketBilden({
  sitzung,            // aus der Sitzung: { rolle, person, bestand: <raum>, betrieb: <index> }
  ladeBestand,        // (raum) => Bestand — wird NUR mit sitzung.bestand aufgerufen
  funktion,           // "F1" … "F18" (ohne F7B)
  eingabe,            // { zeitraum: { von, bis }, fremdtext?: string[] }  — kein Raum, keine Rolle
  bezug,              // optional { personId, einheitId, datum, schichtId } — nur Verweis auf die Sicht, wird geprüft
  kontext,            // Auftrags-/Kontextkennung (bestimmt die Alias)
  aliasSchluessel,    // ≥ 32 Byte, vom Aufrufer (I13) — siehe Abschnitt 6
  versionen,          // { engine, regelstand, tarifstand }
  faktenquelle,       // optional: Rechenkern (I12) liefert berechnete Fakten
  audit,              // optional: (ereignis) => void — Ereignisse ohne Inhalt
  modellOrt,          // optional "extern" (Vorgabe) | "lokal" — extern: kein Schutzbefund an einer Person
});
```

1. **Sitzung**: Rolle, Person, Raum, Betrieb; fehlt etwas → `KI_NICHT_ANGEMELDET`.
2. **Funktion/Rolle**: kein Eintrag → `KI_FUNKTION`; Rolle nicht genannt → `KI_ROLLE`.
3. **Eingabe**: Schema `EINGABE_SCHEMA`; Fremdtext an eine Funktion ohne Zulassung → `KI_EINGABE`; Fremdtext an eine nicht freischaltbare Funktion (`FREISCHALTUNG_GESPERRT`, derzeit F7A) → `KI_FUNKTION`; Zeitraum Pflicht, sobald die Funktion Felder hat, höchstens 62 Tage; ein `bezug` an eine Funktion ohne Felder (F5, F9) → `KI_EINGABE`; `modellOrt` nur `extern`/`lokal`.
4. **Bestand**: `ladeBestand(sitzung.bestand)`; Betrieb nur über den Index der Sitzung (`betriebIndexAusSitzung`, alias.mjs), **ohne Rückfall** (anders als `eigenerMandant`; auch kein Rückfall bei leerem Text, Wahrheitswert oder „1x"); trägt der Betrieb ein Feld `raum`, muss es dem Raum der Sitzung entsprechen → sonst `KI_NICHT_GEFUNDEN`.
5. **Sicht**: `bestandFuerRolle(bestand, sitzung)`; ab hier wird der Rohbestand nur noch für die Sperrliste gelesen.
6. **Fakten**: Felder der Herkunft „sicht" liest der Bildner selbst (`faktenAusSicht`); berechnete Felder kommen aus der Faktenquelle und werden einzeln geprüft (Abschnitt 5.3). Danach der Schnitt mit der Positivliste — für **jeden** Fakt, gleich woher. Mehr als 500 Fakten → `KI_EINGABE` (nie still gekürzt, E-8).
7. **Schutzbefunde entkoppeln** (bei `modellOrt` extern, der Vorgabe): ein Fakt mit Wert oder Regel „schutz" verliert seine Person, wo sie optional ist (`befund.regel`); wo sie Pflicht ist (`kandidat.hinderung`), fällt der Fakt weg (Audit `entkoppelt`).
8. **Alias** für Personen, Einheiten **und Dienstarten** (`D_…`, Abschnitt 6), deterministische Sortierung, Kennungen `f.0 … f.n`. Ein `bezug.schichtId` muss eine Dienstart der Sicht sein (sonst `KI_NICHT_GEFUNDEN`) und geht nur als Dienst-Alias hinein.
9. **Schema** und **Leck-Prüfung**; Verdacht → Audit `ki.faktenpaket.verworfen` (nur Funktion, Rolle, Kategorien, Anzahl) und `KI_LECK`.
10. Rückgabe: Paket (tief eingefroren) und Alias-Karte (getrennt, nicht serialisierbar).

## 4. Verträge (Fassung 1.0)

Alle Schemata in `schemas.mjs` (`SCHEMATA`), JSON Schema 2020-12, eingefroren. Jedes Objekt `additionalProperties: false`, jede Zeichenkette mit `maxLength`, jede Liste mit `maxItems` (per Test erzwungen). Der Prüfer kennt nur die benutzten Schlüsselwörter (`SCHEMA_SCHLUESSELWOERTER`); ein unbekanntes wirft (nichts wird still ignoriert) — seit Review F10 schon beim Laden für jeden Zweig (`schemaPruefen`), nicht erst, wenn ein Wert ihn erreicht; ein statischer Test prüft alle Schemata. Vor dem Schema eine **Strukturprüfung**: nur einfache Objekte und Felder, Zeichenketten, endliche Zahlen, Wahrheitswerte, `null`; keine Zugriffsfunktionen, verborgenen Felder, Symbole, Prototyp-Schlüssel (`__proto__`, `constructor`, `prototype`), lückenhaften Felder; Tiefe ≤ 8, ≤ 6000 Werte, ≤ 32 Schlüssel je Objekt, ≤ 512 KiB. Fehlermeldungen nennen Pfad und Regel, nie den Wert.

### 4.1 Faktenpaket

| Feld | Inhalt |
|---|---|
| `schemaVersion` | `"1.0"` |
| `funktion` | F1–F18 ohne F7B |
| `versionen` | `schema`, `positivliste`, `engine`, `regelstand`, `tarifstand` (Pflicht — der Fingerprint in I14 erkennt jede Änderung) |
| `zeitraum` | `{ von, bis }` oder `null` (F5, F9: keine Betriebsdaten) |
| `bezug` | optional `{ alias, bezugAlias, datum, ref }` — `ref` ist ein Dienst-Alias (`D_…`) einer Dienstart der Sicht |
| `fakten[]` (≤ 500) | `{ id, feld, art, wert, einheit?, alias?, bezugAlias?, ref?, datum?, bis?, regel? }` |
| `fremdtext[]` (≤ 20) | `{ kapselId: "k0"…, text ≤ 4000 }` — nur bei zugelassenen Funktionen |

**Dienstarten sind opak** (Review F5): `ref` der Felder `dienstart.*`, `besetzung.*`, `aenderung.art` und der Wert von `schicht.dienst` und `zyklus.tag` sind Dienst-Alias `D_` + 8 Konsonanten; ebenso jede andere Kennung oder `ref`, die einer Dienstart der Sicht gleicht (außer dem Tagesindex `ref` von `zyklus.tag`). Ein Dienst-Bezug der Faktenquelle, den die Sicht nicht kennt, wird verworfen.

Zusatzregeln (im Code, `pruefeFaktenpaket`): Wert passt zur Art (`zeit` = HH:MM, `datum` = existierender Tag, `zustand` aus festem Vokabular, `kennung` = Buchstaben aus Latin/Latin-1, Ziffern, `._:+-` ohne Leerzeichen (seit Review F2 keine fremde Schrift), `zahl` endlich und |x| ≤ 10⁶, `wahr` = boolean); `einheit` nur an Zahlen; `bis` nur mit `datum` und nicht davor; Fakt-Kennungen eindeutig.

Zustände: `abwesend, frei, hinweis, achtung, recht, neu, geaendert, entfernt, offen, erfuellt, verletzt, nicht_bewertbar`. **Es gibt keinen Zustand für eine Abwesenheitsart.**

**Abweichungen vom Entwurf 0.1** (ARCHITEKTUR-ABGLEICH 2.2): `feld` (Pflicht, aus dem Katalog) macht jeden Fakt gegen die Positivliste prüfbar; `art` `satzbaustein` entfällt (Bausteine gehören zur Antwort), `wahr` kommt hinzu; Alias `P_` + 8 Konsonanten statt `P1` (Abschnitt 6); `bezugAlias`, `ref`, `datum`, `bis` ergänzt; `versionen` um `schema` und `positivliste` ergänzt; `zeitraum` darf `null` sein; `regel.fundstelle` mit Zeichenmuster; Fremdtext mit Kennungsmuster `k0…k19`; F7B gestrichen, F13/F18 ergänzt.

### 4.2 Anfrage, Antwort, Prüfergebnis

- **Anfrage**: `funktion`, `eingabe` (`zeitraum`, `fremdtext`), optional `bezug` (`datum`, `personId`, `schichtId`, `einheitId` — jeweils nur ein Verweis auf etwas in der Sicht; `schichtId` nur eine Dienstart der Sicht, kein Freitext-Kanal), `sprache: "de"`, `idempotenz`. Raum, Rolle, Betrieb, Mandant oder ein Faktenpaket vom Client sind unbekannte Felder und werden verworfen.
- **Antwort**: `status`, `auftragId`, optional `ctxId`, `ergebnis` (`bausteine[]` mit `parameter[]` als Name/Wert-Liste, `text`), Pflicht `kennzeichnung` mit `kiGestuetzt: true`, `entwurf: true`, `veroeffentlicht: false`, `geprueft`; `rueckfall.code` = `KI_…`. **Kein Feld, mit dem ein Plan geschrieben oder veröffentlicht würde** (Test).
- **Prüfergebnis**: `version`, `ergebnis` (bestanden/wiederholen/rückfall), `versuche` 1–2, `regeln[]` mit Codes P-01…P-10 und `verstoesse` als Kennungen (Zeichenmuster ohne Komma, Prozent, @), `gegenrechnung`.

## 5. Feldkatalog und Positivlisten-Registry

### 5.1 Feldkatalog (`felder.mjs`, Version der Positivliste 1.0)

| Feld | Art | Subjekt | Herkunft |
|---|---|---|---|
| `dienstart.beginn`, `dienstart.ende` | zeit | Sache (ref = Dienstart) | Sicht |
| `dienstart.dauer` | zahl (min, über Mitternacht gerechnet) | Sache | Sicht |
| `zyklus.tag` | kennung = Dienst-Alias `D_…` (ref = Tag n der Schichtfolge) | Sache | Sicht |
| `qualifikation.vorhanden` | wahr — **ohne reine Statusnachweise** (z. B. Masernschutz) | Sache | Sicht |
| `einheit.vorhanden`, `einheit.pool` | wahr | Einheit (Alias) | Sicht |
| `person.vorhanden`, `person.einheit` (bezugAlias = Einheit, mit Zeitraum) | wahr | Person (Alias) | Sicht |
| `person.wochenstunden` | zahl (h) | Person | Sicht |
| `person.teilzeit`, `person.springer`, `person.schichtdienst` | wahr | Person | Sicht |
| `person.qualifikation` | kennung — ohne Statusnachweise | Person | Sicht |
| `schicht.dienst` / `schicht.frei` | kennung = Dienst-Alias `D_…` / wahr (aus `abweichungen`) | Person | Sicht |
| `abwesenheit.zeitraum` | zustand — **immer „abwesend"**, auf den Zeitraum geschnitten | Person | Sicht |
| `befund.regel`, `befund.stufe` | kennung / zustand — Schutzbefunde neutral **„schutz"** ohne Fundstelle | Sache, Person optional | berechnet |
| `kandidat.zulaessig`, `kandidat.spielraum` (min), `kandidat.hinderung` | wahr / zahl / kennung | Person | berechnet |
| `konto.saldo` (h, Plan), `ruhezeit.ist` (min), `aenderung.art` | zahl / zahl / zustand | Person | berechnet |
| `besetzung.ist`, `besetzung.soll` | zahl (Personen) | Einheit | berechnet |
| `kennzahl.wert` | zahl (ref = Kennzahl) | Sache | berechnet |
| `regel.art` | kennung (ref = Regel) | Sache | berechnet |

**Nicht im Katalog und damit nie im Paket:** Vor-/Nachname, Kürzel, Personalnummer, E-Mail, Telefon, Anschrift, Notfallkontakt, Geburtsdatum, Ein-/Austritt, Abwesenheitsart, -grund, -anmerkung, -nachweis, Mutterschutz, Schwerbehinderung, Einschränkungen und Planungsregeln der Person (sie verraten die Ursache), Einwilligungen, Notizen, Tagesnotizen, Dienstbuch, Übergaben, Anträge, Bestätigungsgründe, Stempel- und Ist-Zeiten, Einsatzorte/Koordinaten, Kalender-, Push- und Zugangsdaten, Lohn, Bank, Steuer, Vertrag.

### 5.2 Registry je Funktion (`positivliste.mjs`)

„P" = Leitung und Planung. „Pers." = Personenbezug erlaubt. „Fremd." = Fremdtext zugelassen.

| Fkt. | Name | Klasse | Rollen | Pers. | Fremd. | Felder |
|---|---|---|---|---|---|---|
| F1 | Plan-Erklärer | B | P | ja | nein | schicht.dienst/frei, dienstart.*, person.vorhanden/einheit/qualifikation/wochenstunden, abwesenheit.zeitraum, einheit.vorhanden, befund.* |
| F2 | Regel-/Verstoß-Erklärer | A | P | ja | nein | befund.*, schicht.dienst, dienstart.*, person.vorhanden, ruhezeit.ist, konto.saldo |
| F3 | Ausfall-Vorschlag | A | P | ja | nein | schicht.*, dienstart.*, person.* (ohne weitere), abwesenheit.zeitraum, einheit.*, befund.*, kandidat.*, konto.saldo, ruhezeit.ist |
| F4 | Leitungsbriefing | C | **nur Leitung** | nein | nein | kennzahl.wert, besetzung.*, befund.stufe, einheit.vorhanden |
| F5 | Nachrichten-Werkstatt | B | P | nein | ja | – |
| F6 | Fragen an Daten | B | P | nein | ja | kennzahl.wert |
| F7A | Altplan (Tabelle) | D | P | nein | ja | dienstart.*, qualifikation.vorhanden |
| F8 | Schichtmodell-Analyse | C | P | nein | nein | dienstart.*, zyklus.tag, kennzahl.wert, einheit.vorhanden |
| F9 | Hilfe-Assistent | B | P + **Beschäftigte** | nein | ja | – (keine Betriebsdaten) |
| F10 | Personalansatz | C | P | nein | nein | kennzahl.wert, besetzung.*, einheit.* |
| F11 | Frühwarnungen | C | P | nein | nein | kennzahl.wert, besetzung.*, befund.*, einheit.vorhanden |
| F12 | Abschluss-Assistent | C | P | ja | nein | konto.saldo, befund.*, schicht.dienst, person.vorhanden, kennzahl.wert |
| F13 | Planvorschlag | C | P | ja | nein | schicht.*, dienstart.*, person.vorhanden/einheit/qualifikation/wochenstunden/teilzeit, abwesenheit.zeitraum, befund.*, kennzahl.wert, einheit.* |
| F14 | Was-wäre-wenn | C | P | ja | nein | kennzahl.wert, befund.*, schicht.dienst, besetzung.*, person.vorhanden |
| F15 | Änderungsübersicht | C | P | ja | nein | aenderung.art, person.vorhanden, dienstart.beginn/ende |
| F16 | Regel-Übersetzer | B | P | nein | ja | regel.art, dienstart.beginn/ende, qualifikation.vorhanden |
| F17 | Regel-Konflikte | B | P | nein | nein | befund.*, regel.art, kennzahl.wert |
| F18 | Plan-Gutachten | B | P | nein | nein | kennzahl.wert, befund.*, besetzung.*, dienstart.* |

Der vollständige, verbindliche Inhalt steht als **Abdruck** in `pruefungen/intelligence-positivliste.test.js`.

Feste Regeln (per Test): Betriebsrat und Betreiber lösen nie aus; Schichtverantwortung (`subplaner`) und Kundenrolle (`kunde`) kommen nicht vor; Beschäftigte nur F9 ohne Felder; ohne Personenbezug kein Feld, das immer eine Person trägt; Freitext nur F5, F6, F7A, F9, F16; jedes Katalogfeld wird benutzt; kein Feldname benennt ein verbotenes Merkmal; Registry und Katalog sind tief eingefroren; Prototyp-Namen (`__proto__`, `toString`) haben keinen Eintrag.

### 5.3 Faktenquelle (Anschluss für WP-I12)

`faktenquelle({ funktion, sicht, zeitraum, eingabe })` bekommt eine **eingefrorene Kopie der Rollensicht** und liefert Rohfakten `{ feld, person?, einheit?, ref?, wert, datum?, bis?, regel? }` mit Kennungen aus der Sicht. Jeder wird einzeln geprüft und sonst **verworfen** (gezählt im Audit `verworfen`):

- nur Felder der Herkunft „berechnet", nur wenn die Positivliste der Funktion sie nennt;
- Person nur, wenn das Feld sie trägt, die Funktion Personenbezug hat und die Person in der Sicht steht (und im Zeitraum beschäftigt ist); Einheit nur aus der Sicht;
- Wert passend zur Art; Stufen und Änderungsarten aus festem Vokabular; Datum im Zeitraum;
- keine Zusatzschlüssel, nur einfache Objekte;
- Befund-, Hinderungs- und Regelkennungen werden **neutralisiert** (`befundNeutral`): Katalogbefunde mit `schutz: true` und jede Kennung, die nach Schutzvorschrift, Einschränkung oder Gesundheit aussieht, heißen „schutz"; eine Fundstelle dazu fällt weg.

Die Faktenquelle kann so kein Feld über die Positivliste hinaus, keine fremde Person und keinen Freitext einbringen; was sie als Kennung durchbringt, prüft die Leck-Prüfung.

## 6. Alias-Verfahren

- **Form:** `P_` (Person), `E_` (Einheit), `O_` (Objekt/Standort), `D_` (Dienstart, seit Review F5) + 8 Zeichen aus 20 Konsonanten (20⁸ ≈ 2,6·10¹⁰). Keine Vokale (kein Wort, kein Name), keine Ziffern (keine Verwechslung mit Zahlen im Prüfer). Die Felder `alias`/`bezugAlias` des Pakets nehmen nur `P_`/`E_`/`O_`; `D_` steht in `ref` und in Kennungswerten.
- **Berechnung:** `unter = HMAC-SHA256(schlüssel, "centric-ki-alias/v1|<raum>|<betriebId>")`; `alias = kodiere(HMAC-SHA256(unter, "<kontext>|<typ>|<kennung>|<n>"))`, `n` zählt nur bei einer Kollision innerhalb der Karte hoch. `kodiere` nimmt die ersten 48 Bit (6 Byte) des HMAC; genutzt werden davon 20⁸ Werte (≈ 34,6 Bit).
- **Schlüssel:** mindestens 32 Byte, vom Aufrufer übergeben; ein Schlüssel aus lauter gleichen Bytes wird abgelehnt. Dieses Modul liest **keine Umgebungsvariable** und hat **keinen Vorgabeschlüssel** — ohne Schlüssel keine Karte (`KI_ALIAS_SCHLUESSEL`). Zwei Betriebsarten für I13:
  1. **Betriebsschlüssel** aus der Server-Umgebung (Name und Doku legt I13 fest; Pflicht laut `pruefung:doku`: `.env.example` und Betriebshandbuch): Alias im selben Kontext sind über Aufrufe gleich — nötig für den Fingerprint und gespeicherte Ergebnisse (I14).
  2. **Je Auftrag zufällig** (`zufallsSchluessel()`, 32 Byte aus `crypto.randomBytes`): keine Verknüpfbarkeit zwischen Aufträgen, kein Fingerprint-Treffer.
- **Kontext** (Auftrag/Entscheidungskontext): trennt Anfragen. Ohne Schlüssel lässt sich weder aus einem Alias die Kennung errechnen noch erkennen, dass zwei Alias aus verschiedenen Kontexten dieselbe Person meinen.
- **Raum und Betrieb** stecken im Unterschlüssel: dieselbe Kennung hat in zwei Räumen nie denselben Alias (Test).
- **Alias-Karte** (`AliasKarte`): bleibt im Server; `toJSON` wirft, `inspect`/`String` zeigen `[AliasKarte]`, keine aufzählbaren Felder. Für den Lauf-Store (I14, Sicherungsklasse C) gibt es nur den ausdrücklichen Weg `fuerServerSpeicher(macSchluessel)` / `AliasKarte.ausServerSpeicher(daten, macSchluessel)` — ohne Alias-Schlüssel, aber mit **HMAC-SHA256 über den ganzen Inhalt** (Raum, Betrieb, Index, Kontext, Einträge; Review F8). Der MAC-Schlüssel kommt vom Aufrufer (≥ 32 Byte, nicht konstant, **kein Vorgabewert**; fehlt er → `KI_ALIAS_SCHLUESSEL`). Manipulierter Inhalt, fehlender oder falscher MAC → `KI_NICHT_GEFUNDEN`. Eine geladene Karte kann auflösen, aber keine neuen Alias vergeben.
- **Rückübersetzung** (`rueckuebersetzen({ ergebnis, karte, sitzung, funktion, bestand })`): nur im Server; nur wenn die Rolle der Sitzung die Funktion auslösen darf (sonst `KI_ROLLE`); nur im Raum und Betrieb der Karte — geprüft an der **Betriebskennung** im aktuellen Bestand (`bestand.mandanten[Index der Sitzung].id` = Betrieb der Karte; Index ohne Rückfall; Review F8), sonst `KI_NICHT_GEFUNDEN`; jeder Alias muss in der Karte stehen und zum Typ passen (sonst `KI_ALIAS_UNBEKANNT`, nichts halb übersetzt); Personen-Alias in einer Funktion ohne Personenbezug → `KI_PRUEFER`. **Platzhalter nur aus Alias** (Review F4): jede geschweifte Klammer in der Modellausgabe außerhalb von `{{typ:<Alias>}}` — ein roher `{{person:<kennung>}}`, `{{x}}`, verschachtelte Klammern — → `KI_PRUEFER`. Ein Schlüssel `__proto__` in der Ausgabe wird eigenes Feld, nie Prototyp (Review F10). Ergebnis sind Platzhalter `{{person:<kennung>}}`, `{{dienst:<kennung>}}` — **die Karte kennt keine Namen**; den Namen setzt die Oberfläche aus ihrer eigenen Sicht ein. Zahlen, Uhrzeiten, Daten bleiben unverändert.

## 7. Leck-Prüfung (fail closed)

- **Sperrliste** (`sperrlisteBilden(roherBetrieb, { raum })`): aus dem **gespeicherten** Betrieb, nicht aus der Sicht — also auch Namen, die die Rolle nicht sieht. Vor-/Nachname, Kürzel, Ruf-/Geburtsname, Vollname, E-Mail (und deren Namensteile), Telefon/Mobil (Ziffern), Anschrift, Notfallkontakt, Personalnummer, Steuer-/Sozialversicherungsnummer, IBAN, Geburtsdatum, Personenkennungen; Namen, markante Wörter (≥ 5 Zeichen, ohne Gattungswörter wie „Haus", „Station") und Kennungen von Einheiten, Standorten, Objekten, Einsatzorten; Raum, Betriebskennung, Betriebsname, Kontaktname.
- **Normalisierung** (Review F2/F3): zuerst NFKC (ein in NFD gespeichertes „Müller" wird wie NFC behandelt; Vollbreite und mathematische Buchstaben werden Latein), dann **Doppelgänger-Skelett** (kleine eingebaute Tabelle: kyrillische und griechische Buchstaben, die wie lateinische aussehen, sowie ı, ł, ø, đ, æ, œ, þ, ſ …), Kleinschreibung, ä→ae, ö→oe, ü→ue, ß→ss, Akzente weg, alles außer Buchstaben und Ziffern **jeder Schrift** (`\p{L}\p{N}`) zu Leerzeichen — ein kyrillischer Name bleibt also in der Sperrliste stehen. Namen und Bezeichnungen mit Umlaut stehen in **beiden** Schreibweisen in der Sperrliste („schaefer" und „schafer"). Treffer ab 4 Zeichen als Teilzeichenfolge (auch über Trennzeichen: „M-ü-l-l-e-r"), kürzer (2–3 Zeichen) als Wortanfang mit höchstens zwei angehängten Buchstaben („Ida", „Ott", „Tims", „TimF"; Review F6).
- **Lücke in der Sperrliste** (Review F2): Ein Name oder eine Bezeichnung, die nach der Normalisierung leer ist (nur Symbole), kann nichts schützen → jedes Paket dieses Betriebs: `SPERRLISTE_LUECKE`.
- **Schrift** (Review F2): Text und Kennungen mit Zeichen außerhalb Latin/Latin-1 (nach NFC) → `SCHRIFT`. Zugelassen sind darüber hinaus nur deutsche Typografie (Anführungszeichen „…" ‚…', Striche, Auslassung, Aufzählungspunkt, Promille, Minus, schmales Leerzeichen, Euro). Kyrillisch, Griechisch, CJK, Vollbreite, mathematische Buchstaben, Emoji, C1-Steuerzeichen verwerfen das Paket.
- **Muster:** E-Mail (zerlegt nach Leerraum und „@", linear; Review F9) und „(at)", Schemata `http(s)`, `webcal`, `mailto`, `tel`, `www.`; Telefonnummern (≥ 7 Ziffern nach Entfernen von Datum/Uhrzeit); IBAN; Koordinatenpaare mit Dezimalpunkt **oder -komma** und Grad; Geburtsdaten der Sperrliste auch als `TT.MM.JJ(JJ)` und `TT/MM/JJJJ`; Token (JWT, Hex ≥ 32, `-----BEGIN`, `Bearer`, `sk-…`, `ghp_…`, gemischte Läufe ≥ 20 Zeichen); **Dritte** mit Anrede und großgeschriebenem Wort („Frau Siebert", „Hr. Kaiser", „Bewohnerin …", „Patient …") → `DRITTE`; Gesundheits- und Schutzbegriffe als Wort und Wortstamm (krank, kranken… (Krankenhaus, Krankenkasse), Krebs, Reha, Kur, Klinik, Insulin, Chemo(therapie), Dialyse, Demenz, Onkologie, Psychiatrie, Psychotherapie, Medikament, Tumor, HIV, AU, Diagnose, Arzt, Attest, schwanger, Fehlgeburt, Mutterschutz/MuSchG, Beschäftigungsverbot, Elternzeit, Pflegezeit, schwerbehindert, GdB, SGB IX, minderjährig, JArbSchG, Wiedereingliederung, Einwilligung, Masernschutz, Burnout …). Ausnahme nur für die Berufsbezeichnung „(Kinder-)Krankenpfleger/in" (Qualifikation), damit „Gesundheits- und Krankenpfleger" nicht jedes Paket verwirft.
- **Laufzeit:** Alle Muster laufen linear; 20 Blöcke × 4000 Zeichen feindlicher Eingabe (Läufe aus Ziffern, „@", Punkten, Kommas, Anreden) je < 500 ms (Test). Vorher: E-Mail-Muster ≈ 3 s, Grad-Muster ≈ 7 s (quadratisch).
- **Struktur:** verbotene Feldnamen an jeder Stelle (vorname, name, email, telefon, notiz, grund, anmerkung, mutterschutz, einschraenkungen, planungsregeln, raum, betrieb, aliasKarte, token, lat/lng …), nur einfache Objekte, Tiefe ≤ 12.
- **Fail closed:** fehlende oder gefälschte Sperrliste → `SPERRLISTE_FEHLT`; Ausnahme beim Prüfen (z. B. werfende Zugriffsfunktion) → `STRUKTUR`; im Bildner gilt jedes Ergebnis außer `ok === true` als Verdacht.
- **Audit:** `{ art: "ki.faktenpaket.verworfen", funktion, rolle, kategorien, anzahl }` — kein Wert, kein Pfad, keine Person, kein Raum; das Ereignis ist eingefroren; ein werfendes Audit ändert das Ergebnis nicht. Erfolg: `ki.faktenpaket.gebildet` mit Zählwerten (`fakten`, `verworfen`, `nichtDarstellbar`, `fremdtext`). Die Weitergabe ins Betriebsprotokoll (`protokoll()`) macht I13.

## 8. Fremdtext und Mandantentrennung

- **F7A nicht freischaltbar** (Review F7): Spaltenköpfe und Beispiele einer fremden Tabelle tragen Klarnamen in beliebiger Form; die Leck-Prüfung allein genügt nicht. Bis eine serverseitige Maskierung **vor** der Leck-Prüfung gebaut ist, verweigert der Bildner F7A-Fremdtext mit `KI_FUNKTION` (`FREISCHALTUNG_GESPERRT` in `positivliste.mjs`); die Freischaltung (I13/I16) darf F7A nicht anbieten.
- **Fremdtext** (Eingabe der Nutzerin, Spaltenköpfe): nur F5, F6, F7A (gesperrt, s. o.), F9, F16; Steuer- und unsichtbare Formatzeichen (Null-Breite, Richtungswechsel), Tag-artige Folgen, Code-Zäune und Trenner-Imitate werden entfernt; > 4000 Zeichen oder > 20 Blöcke → abgelehnt, nicht gekürzt; danach dieselbe Leck-Prüfung (ein Klarname oder Gesundheitsbegriff verwirft das Paket — bei F16 ist das die gewollte Ablehnung von Gesundheitsbegriffen). `kapselnFuerPrompt` zieht je Aufruf einen zufälligen Trenner `DATEN_<24 Hex>`; die Kapsel allein ist kein Schutz (CENTRIC-INTELLIGENCE 6.2).
- **Mandantentrennung:** Raum und Betrieb nur aus der Sitzung; der Bestand wird nur mit dem Raum der Sitzung geladen; Betrieb über den Index ohne Rückfall; Betriebsfeld `raum` muss passen; Raum, Betriebskennung und -name stehen in der Sperrliste und damit nie im Paket; Alias je Raum und Betrieb verschieden; Rückübersetzung nur im Raum und Betrieb der Karte (Betriebskennung im aktuellen Bestand, nicht nur Index); ein Bezug auf eine Person, Einheit oder Dienstart außerhalb der Sicht → `KI_NICHT_GEFUNDEN`.

## 9. Grenzen und offene Punkte

- **Pseudonym, nicht anonym.** Wer den Plan kennt, kann über Einheit, Tage und Dienste einen Alias einer Person zuordnen — besonders in kleinen Teams. Das Modell sieht pseudonymisierte, weiterhin personenbezogene Daten. Ob und unter welchen Bedingungen das zulässig ist (AVV, DSFA, Pseudonymisierung, Verarbeitungsort), ist **zu prüfen**; echte Modellaufrufe mit Personendaten bleiben gesperrt.
- **Dienstarten und Abwesenheitskürzel (Review F5).** Viele Betriebe tragen Abwesenheiten als Dienstart ein („K" krank, „KK" Kind krank, „BV" Beschäftigungsverbot, „MU" Mutterschutz). Als Kennung im Paket verriete schon das Kürzel an Person und Tag die Ursache — die Leck-Prüfung erkennt „K" nicht als Gesundheitsangabe. Deshalb sind **alle** Dienstarten paketweit opak (`D_…`). Restrisiko: Beginn, Ende und Dauer einer Dienstart stehen weiter im Paket; ein ganztägiger „Dienst" (00:00–23:59), der Personen an einzelnen Tagen zugeteilt ist, lässt sich als Abwesenheit deuten — nicht als ihre Art. Ein Kürzel wie „KK" im **Fremdtext** erkennt die Leck-Prüfung nicht.
- **Schutzbefunde (Review F5).** Bei externem Modell (Vorgabe) hängt kein Schutzbefund an einer Person; eine Hinderung „schutz" eines Kandidaten fällt weg (der Kandidat steht dann ohne Grund als nicht zulässig im Paket, wenn die Faktenquelle `kandidat.zulaessig: false` liefert). Restrisiko: Stufe (`befund.stufe`) und Datum desselben Befunds können weiter an der Person stehen; über das gleiche Datum lässt sich ein Zusammenhang vermuten. „Lokal" (`modellOrt: "lokal"`) koppelt wie bisher — das darf nur ein Modell ohne Datenabfluss bekommen; das legt I13 fest.
- **Mustersuche hat Grenzen:** Verfremdungen („M3yer", Ziffern statt Buchstaben), Namen als Bild, Umschreibungen ohne Stichwort („seit der Geburt zu Hause") erkennt keine Sperrliste. Die Doppelgänger-Tabelle ist klein (Kyrillisch, Griechisch, einige lateinische Sonderformen) — sie ersetzt keine vollständige Unicode-Confusables-Liste; was sie nicht kennt, fängt die Schriftprüfung (`SCHRIFT`) für alles außerhalb von Latin/Latin-1 ab, aber nicht lateinische Sonderformen innerhalb von Latin-1. Deshalb ist die Leck-Prüfung die vierte, nicht die einzige Schranke; Freitext ist standardmäßig aus.
- **Fail closed kostet:** Eine Kennung, die einem Namen gleicht (Qualifikation „Anna", Person „Koch" und Qualifikation „koch"), verwirft das Paket; Dienstarten sind seit F5 opak und davon nicht mehr betroffen. Seit dem Nachtrag kommen dazu: Fremdtext und Kennungen mit Buchstaben außerhalb Latin-1 (polnisch „ł", türkisch „ş", Namen in kyrillischer Schrift) → `SCHRIFT`; kurze Namen treffen Wortanfänge („Al" in „alle", „Tim" in „Timo"); jedes großgeschriebene Wort nach „Frau", „Herr", „Bewohnerin", „Patient" ist ein Dritter (auch „Patient Zimmer 12"); „Klinik", „Demenz", „Reha" verwerfen auch Einrichtungs- und Bereichsnamen im Fremdtext; Tausenderpunkte („1.000, 2.000") können als Koordinaten gelten; ein Name, der leer normalisiert, sperrt den ganzen Betrieb (`SPERRLISTE_LUECKE`). Eine automatische Auflösung gibt es bewusst nicht.
- **Rollen:** Schichtverantwortung vorerst ausgeschlossen (Betreiberentscheidung B-5 offen). Die Planung bekommt den ganzen Betrieb ihrer Sicht; eine Einschränkung auf den eigenen Bereich ist Sache der Rechteprüfung in I13/I16.
- **Inhalt:** Regeldienste aus der Schichtfolge (`personTag`) stehen nicht im Paket — nur ausdrückliche Einteilungen (`abweichungen`); die Berechnung liefert I12 über die Faktenquelle. Kennungen, die nicht als Kennung darstellbar sind, fallen weg und werden im Audit gezählt (`nichtDarstellbar`).
- **Laufzeit:** rund 20 ms je Paket mit ~160 Fakten auf dem Entwicklungsrechner [gemessen lokal, nicht unter Last].
- **Schlüssel für I13:** Alias-Schlüssel **und** MAC-Schlüssel für den Lauf-Store kommen vom Aufrufer; Quelle, Wechsel und Trennung der beiden legt I13 fest. Die Rückübersetzung braucht den **aktuellen** Bestand der Sitzung — ein zwischengespeicherter alter Bestand würde die Betriebsprüfung entwerten.
- **Nicht Teil von WP-I11:** Route, Gateway, Schlüsselvariable und ihre Doku, Speicherung der Karte, Löschfristen, Prüfer P-01…P-10, Prompt-Bau, serverseitige Maskierung für F7A (I13/I14/I15).
