# Befund: Benachrichtigungen an eine unbestätigte Personenadresse (`server/lib/versand.mjs`)

Stand 2026-11-13, aufgenommen bei der Umsetzung der E-Mail-Entscheidung zu A-3 (PR #281). **Nicht in PR #281 behoben**
(eigener PR). Der Befund besteht schon vor PR #281.

## 1. Was hinausgeht

`zustellen()` → `mailAdresse(p)` (`versand.mjs`, um Zeile 170): Ziel ist `person.email` aus dem Bestand, geprüft nur auf
Form (`@`, höchstens 254 Zeichen). Eine Bestätigung der Adresse gibt es für Personen nicht.

Inhalt (`zustellregeln.mjs`, `hinweis()` und `mailInhalt()`): Aus einer Mitteilung wird nur die **Art** gelesen, nie
Titel, Text oder Namen.

| Art | Betreff | Text |
|---|---|---|
| antragEntschieden, planGeaendert, planFreigegeben, einspringen, offeneSchicht, tauschAngebot, urlaubVerfaellt, aushang, krankmeldungEingegangen, sonstige | neutraler Titel je Art („Dienstplan geändert“, „Neue Meldung zur Abwesenheit“ …) + Betriebsname | „Bitte in CENTRIC öffnen.“ + Adresse der Anwendung + Fußzeile mit Betriebsname |
| Notruf | „Dringende Mitteilung“ + Betriebsname | „Bitte sofort in CENTRIC öffnen.“ |

**Keine** Zugangscodes, keine Einladungscodes, keine Links mit Geheimnis, keine Wiederherstellungs- oder
Rücksetzinformation, keine Gesundheits-, Plan- oder Zeitangaben, keine Namen Dritter. Aus Test- und Demoräumen geht ohne
Freigabe keine Mail (SI-P3). Je Person, Kanal und Tag gibt es Kontingente.

## 2. Wer `person.email` setzen kann

- Leitung, Planung (und die Altrolle `kunde`) für **alle** Personen des Betriebs über `PUT /api/bestand` bzw. den
  Teilweg und den Personalimport (Vorgabe aus).
- Jede Person für **sich selbst** (`SELBST_FELDER` in `rechte.mjs`: `email`).
- Der Betreiber nicht über den Schreibweg. Die erste Leitungsperson hat seit A-3 keine Adresse; die Anlage über die
  Betreiberkonsole übernimmt die Kontaktadresse nicht mehr (PR #281).

## 3. Missbrauch und Auswirkung

- **Umleiten:** Wer eine Adresse setzen darf, kann die Hinweise einer Person an eine fremde Adresse leiten. Er bekommt
  dabei nur Art, Betriebsnamen und Zeitpunkt („Dienstplan geändert — Haus X“). Für eine fremde Person setzt das eine
  Rolle voraus, die die Person ohnehin vollständig sieht (Leitung, Planung).
- **Fremde anschreiben:** Eine Person kann eine beliebige Adresse eintragen und so Mails „von CENTRIC“ mit
  Betriebsnamen an Dritte auslösen (Belästigung, Absenderruf). Begrenzt durch Kontingente; kein frei wählbarer Inhalt
  außer dem Betriebsnamen (einzeilig, ohne Steuerzeichen).
- **Unterdrücken:** Eine falsche Adresse lässt die eigentliche Person Hinweise verpassen (Push und Anwendung bleiben).
- **Zugangs- oder Wiederherstellungsinformationen an eine unbestätigte Adresse: nicht gefunden.** Registrierung,
  Passwort zurücksetzen, Kontowiederherstellung und Kontoanmeldung nutzen nur die Konto-Adresse mit
  `emailVerifiziertAm` (`registrierung.mjs`, `accounts.mjs`, `accountanmeldung.mjs`); Einladungen und Codes werden nicht
  versandt, der Verlustfall des zweiten Faktors läuft über eine Vier-Augen-Freigabe ohne Mail.

**Einstufung: P2.** Kein Weg zu Zugang, Konto oder Gesundheitsdaten; Auswirkung begrenzt auf Metadaten
(Betriebsname, Art, Zeitpunkt) und Missbrauch des Absenders. Wäre je ein Code, Link mit Geheimnis oder
Rücksetzweg über `person.email` hinzugekommen, wäre es P0.

## 4. Vorschlag (eigener PR)

1. **Regel festschreiben (Test als Wächter):** Zugangs- und Wiederherstellungsinformationen gehen nur an eine
   ausdrücklich gespeicherte **und** bestätigte Adresse (heute: Konto-Adresse mit `emailVerifiziertAm`). Ein
   Quelltexttest verbietet `person.email` als Ziel in Registrierung, Einladung, Wiederherstellung und Faktorwegen.
2. **Bestätigung der Personenadresse:** `emailBestaetigtAm` an der Person, gesetzt nur über einen Bestätigungslink an
   genau diese Adresse; jede Änderung der Adresse setzt ihn zurück (serverseitig in `zusammenfuehren`, nicht aus der
   Anfrage). `mailAdresse()` verlangt den Vermerk.
3. **Übergang (Betreiberentscheidung nötig):** Für nicht sensible Hinweise entweder sofort nur noch an bestätigte
   Adressen (Folge: bis zur Bestätigung keine Mail, Push bleibt) oder eine Frist, in der Bestandsadressen weiter gelten.

Nicht in PR #281, weil Schritt 2/3 Oberfläche, Zustellregeln, Datenmodell und eine Betreiberentscheidung berühren.
