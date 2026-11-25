# Neustart-Nachweis v4-r1 (Vorlage, K4 Pfad 0)

Vorlage zu K4-P7. Gilt nur für den ersten V4-Wechsel (`v4-r1`) als kontrollierter Neustart mit sauberem Bestand
(Betreiberentscheidung 2026-11-25, `docs/acc45/ENTSCHEIDUNGSLISTE.md`, Nachtrag 2026-11-25 (b)). Sie ändert kein Gate und
keine Gate-Regel; G5 bleibt bis zur Migrationsfreigabe NO-GO. Sie ersetzt nicht das Runbook
([RUNBOOK-ERSTWECHSEL-V4R1.md](../RUNBOOK-ERSTWECHSEL-V4R1.md): Variante b der Widerrufbuch-Probe, Ablauf N0–N5, Abbruchtabelle).

**Das ausgefüllte Exemplar liegt außerhalb des öffentlichen Repos** (Ablage des Betreibers). Im Repo steht nur diese leere
Vorlage. Eintragen: nur Zahlen, Ja/Nein, Datum, Rolle. Nie Hosts, Adressen, Schlüssel, Codes, Namen, Raum- oder
Betriebsnamen, Mailadressen, Domänen, Pfade mit Personenbezug. Alles in `[…]` ist auszufüllen und nicht vorbelegt. Wo
etwas fehlt: „nicht erhoben" und der Grund, keine Schätzung.

**Stand der Texte:** Entwurf. Die Bestätigung des Wortlauts durch den Betreiber steht aus (Akzeptanz K4-P7).

## 0. Kopf

- Release: `v4-r1` · Kandidat (Commit, Digest): [Kandidat] · Basis: `274bfa0`
- Datum, ausfüllende Rolle, Zweitperson (Vier-Augen): [Datum] · [Rolle] · [Rolle]
- **Gesonderte Produktionsfreigabe des Betreibers für den Datenschritt (Beiseitelegen) liegt vor:** [ja | nein], Datum [Datum]
  Ohne diese Freigabe ist jede Zeile ab Abschnitt 4 nur Vorbereitung, nichts wird ausgeführt.

## 1. Bestandsverifikation (nur lesend, nur Zahlen und Ja/Nein)

Läuft geschützt lokal auf dem Server. Nichts davon geht an GitHub, an KI-Dienste oder in Chats. Nur die Zahl bzw. das
Ja/Nein wird eingetragen. Nie `cat .env`, nie eine Datei öffnen, nie Werte anzeigen.

| Nr | Prüfpunkt | Weg (nur Zahl/Ja-Nein als Ausgabe) | Erwartung | Ergebnis |
|---|---|---|---|---|
| V-1 | Bestand zählen (Räume, lesbar, Fehler, Mandanten, Konten) | `deploy/sicherung/hilfen/bestaende-zaehlen.mjs` im laufenden Bild, ohne Netz (`--network none`), Daten nur lesend (`:ro`), Aufruf wie in [BETRIEB-SICHERUNG](../../BETRIEB-SICHERUNG.md) beschrieben. Die letzte Ausgabezeile ist JSON mit `bestaende`, `lesbar`, `fehler`, `mandanten`, `konten`. Die erste Zeile nennt den Datenpfad: nicht übernehmen. | `fehler` 0, Exit 0 | [Zahlen] |
| V-2 | Demoräume | Anzahl Dateien mit Namensanfang `kern%3Ademo-` im Speicherordner `centric` der Ablage: `ls <data>/centric \| grep -c '^kern%3Ademo-'` | [Zahl]; jeder Wert > 0 ist zu erklären | [Zahl] |
| V-3 | Demokonten | `grep -lE '"demo": ?true' <data>/centric/account%3A*.json \| wc -l` (nur die Zahl) | [Zahl]; jeder Wert > 0 ist zu erklären | [Zahl] |
| V-4 | Selbstregistrierung und Demo (Schalter) | je Schalter nur Ja/Nein, ob gesetzt: `grep -c '^CENTRIC_PUBLIC_REGISTRATION=true' .env`. In `274bfa0` hat `/api/demos` keinen Schalter; V-2/V-3 sind dafür maßgeblich | Selbstregistrierung nein; Demo laut V-2/V-3 | [ja/nein] |
| V-5 | Hinweise auf externe Nutzung (Betreiberaussage F2–F4 vom 2026-11-25 gegen Befund) | Betreiber bestätigt: nie andere Personen, nur erfundene Daten, nur eigene oder künstliche Mailadressen. Sichtprüfung nur lokal, kein Wortlaut in dieses Formular | Aussage und V-1…V-4 widersprechen sich nicht | [bestätigt | Widerspruch] |
| V-6 | Datenkategorien (Gesundheitsbezug: Krankmeldungen, echte Personalnummern, Mailklassen) | Mit den Zahlen aus V-1 nicht zählbar. Zähler K4-P2 (Heuristik-Zähler, SSOT: READY, P2) ist dafür vorgesehen. Bis dahin: Betreiber-Sichtprüfung lokal, Ergebnis nur [ja/nein: „nichts erkennbar Echtes"] | nichts erkennbar Echtes | [ja/nein] |
| V-7 | Betreiberkonfiguration vorhanden (Ja/Nein, nie Werte) | `CENTRIC_PFEFFER` gesetzt; `CENTRIC_ADMIN` gesetzt; Verzeichnis `zustand/` vorhanden und Eigentümer/Rechte wie im Runbook | `CENTRIC_PFEFFER` ja; `CENTRIC_ADMIN` ja (sonst Abschnitt 3 nicht erfüllt) | [ja/nein je Punkt] |
| V-8 | Sicherbarkeit und Wiederherstellbarkeit des Altbestands | `ablage-sicherung pruefen` auf der Sicherung: „In Ordnung: N Dateien" (nur N); `probe-status.json`: `ergebnis`, `abweichend`, `fehlend` (Frist ≤ 35 Tage, G6) | „In Ordnung", `ok`, 0, 0 | [N, Datum] |

**Widerspruchsregel:** Zeigt eine Zeile V-1…V-8 einen Widerspruch (Lesefehler, unerklärte Demoräume/-konten, Hinweis auf
Fremdnutzung oder Echtdaten, Sicherung nicht „In Ordnung", Betreiberkonfiguration fehlt), gilt: **Der Neustart wird NICHT
durchgeführt.** Befund (Zeile, Zahl, kein Inhalt) an den Betreiber melden. Dann entscheidet der Betreiber neu; Pfade mit
Datenübertragung sind in dieser Vorlage nicht vorgesehen.

Ergebnis Abschnitt 1: [alle Zeilen ohne Widerspruch | Widerspruch in V-[n]]

## 2. Strategie-Nachweis (aus Entwurf A.7, für den Neustart gekürzt)

Jede Zeile: Artefakt liegt vor und Akzeptanz erfüllt, sonst kein Wechsel. Ablage der Artefakte außerhalb des Repos, außer
wo „Repo" steht.

| Nr | Nachweis | Artefakt | Wer | Wann | Akzeptanz | Stand |
|---|---|---|---|---|---|---|
| N-1 | Inventar bestätigt | Vermerk ohne Werte: Zustand A/B/C, Schlüsselnamen der `.env`, `zustand/` vorhanden, Plattenplatz | Betreiber | ≤ 24 h vor T0 | `zustand/` Eigentümer uid 1000, Rechte 700 | [ ] |
| N-2 | Geprüfte Sicherung des Altbestands vor dem Beiseitelegen | Sicherung (`deploy-sicherungen/` und Kopie außer Haus); `ablage-sicherung pruefen` = „In Ordnung" mit `dateien` > 0 | Betreiber | vor dem Beiseitelegen | Prüfung grün; Kopie außer Haus vorhanden | [ ] |
| N-3 | Restore-Probe | `probe-status.json` (`ergebnis` `ok`, `abweichend` 0, `fehlend` 0) | Betreiber | ≤ 35 Tage vor T0 | G6-Kriterien | [ ] |
| N-4 | Acronis-Restore und restic-Ersatz belegt, bevor Acronis geändert wird | Restore-Vermerk je Weg | Betreiber | vor jeder Acronis-Änderung | beide Wege einmal erfolgreich zurückgespielt | [ ] |
| N-5 | (Migrationsprobe K4 auf Echtkopie) entfällt bei Pfad 0; ersetzt durch N-5n | – | – | – | – | entfällt |
| N-5n | Synthetische Migrationsprobe mit dem konkreten Kandidaten plus Neustart-Vermerk | `migration.bericht` (Kurzbericht ohne Personenbezug; Vorlage-Form: K4-P6, nur der erforderliche Umfang) | Betreiber/Claude (synthetisch) | ≤ 7 Tage vor T0 | Probe Exit 0; Startprotokoll ohne `WARNUNG`; Vermerk „Neustart auf leerem Bestand nach geprüfter Sicherung" | [ ] |
| N-6 | (Kompatibilitätsprobe K6 mit Altdaten) entfällt bei Pfad 0 | – | – | – | – | entfällt |
| N-7 | Datenrücksprung mit neuer Schlüsselepoche, nur synthetisch | Ausgabe „Schlüsselepoche erneuert", Bücher-Zahlen > 0, Dauer | Betreiber/Claude | mit N-5n | Code aus Probe bleibt 403; Dauer gemessen. Zuschnitt (nur synthetisch) bestätigt der Betreiber | [ ] |
| N-8 | Vorwärts-Reparatur-Probe | Nachweis K4-P4 ([K4-P4-nachweis.md](../K4-P4-nachweis.md), Repo) | Claude (CI, synthetisch) | vor T0 | Kandidat B startet auf Daten von Kandidat A; Bücher bleiben; Abgleich ohne Fehler | [ ] |
| N-9 | Hostverlust, nur synthetisch | Bericht | Betreiber/Claude | mit N-5n | Bücher vollständig, `/gesund` ok. Zuschnitt bestätigt der Betreiber | [ ] |
| N-10 | Widerrufbuch-Probe Variante b | Staging-Nachweis S1–S6 und Ausnahmeobjekt vor T0; nach T0 Nachhol-Dateien (Ablauf N0–N5 im [Runbook](../RUNBOOK-ERSTWECHSEL-V4R1.md)); Fristen laut Runbook | Betreiber (Lauf, Dateien), Claude (Prüfung) | vor T0; Probe ≤ T0 + 24 h; Repo ≤ T0 + 48 h | Endprüfung Exit 0; `NACHHOL-GO` | [ ] |
| N-11 | Stoppbedingungen bestätigt | Abbruchtabelle (Runbook Abschnitt 6) gelesen und bestätigt | Betreiber | vor T0 | schriftlich | [ ] |
| N-12 | (Löschvermerk Prüfkopie, Formblatt B.7) entfällt: es gibt keine Prüfkopie und keine Datenübertragung | – | – | – | – | entfällt |

Das Formblatt „Datenübertragung" (B.7) entfällt bei Pfad 0. Wird später doch eine Datenübertragung nötig, ist das ein
anderer Pfad und braucht eine eigene Betreiberentscheidung.

## 3. Betreiberzugang und Pflicht-2FA: sicherer Weg vor dem Beiseitelegen

Benannte Verwalterschlüssel, Betreibercodes und deren zweiter Faktor liegen in `data/` und gehen beim Beiseitelegen
verloren. Alte Kontodateien werden nicht unkontrolliert übernommen.

| Nr | Voraussetzung | Nachweis | Stand |
|---|---|---|---|
| Z-A1 | Ursprungsschlüssel `CENTRIC_ADMIN` ist in der Serverumgebung gesetzt (nur Ja/Nein, V-7). Er legt das erste Verwalterkonto an. Ein Wechsel seines Werts ist eine eigene Betreiberentscheidung | V-7 | [ ] |
| Z-A2 | Der Weg „leere Ablage → erstes Verwalterkonto über `CENTRIC_ADMIN` → Betreibercode → Betreiber-2FA (in Produktion Pflicht)" ist auf einer synthetischen, leeren Ablage mit dem Kandidaten durchgespielt | Probenbericht [Datum, Verweis, ohne Werte] | [ ] |
| Z-A3 | Wiederherstellungscodes und Faktor-Geheimnisse der Neuanlage gehen nur an den Betreiber, nie in Repo, Chat oder Log | Betreiber bestätigt | [ ] |
| Z-A4 | Zugang zum Server (SSH, Freigabeliste, Zugangsschutz am Proxy) bleibt unverändert und erreichbar | Betreiber bestätigt | [ ] |

Ist Z-A1 oder Z-A2 nicht erfüllt: **Der Neustart wird NICHT durchgeführt** (der Betreiber stünde sonst ohne Zugang da).

## 4. Neustart-Schritte (Reihenfolge; Durchführung nur mit gesonderter Produktionsfreigabe des Betreibers)

Der Altbestand wird **beiseitegelegt** (Verzeichnis umbenennen oder verschieben und mit Datum kennzeichnen), **nicht
gelöscht**. Er bleibt mindestens bis `NACHHOL-GO` für `v4-r1` erhalten. Kein `rm` in `data/` oder `zustand/`.

| Nr | Schritt | Beleg | Stand |
|---|---|---|---|
| S-1 | Abschnitte 1–3 und N-1…N-4, N-5n…N-11 vollständig ohne Widerspruch | dieses Formular | [ ] |
| S-2 | Dienst anhalten; Sicherung des Altbestands erneut geprüft („In Ordnung") und außer Haus vorhanden | N-2 | [ ] |
| S-3 | `data/` beiseitelegen, neues leeres `data/` (Eigentümer, Rechte wie bisher). **Vor** `deploy.sh`, weil `deploy.sh` den aktuellen Stand sichert und am Ende dagegen abgleicht | [Datum, Ort des beiseitegelegten Bestands: nicht im Formular] | [ ] |
| S-4 | `zustand/`: neu und leer, uid 1000, 700. Ab T0 wird `zustand/` nie zurückgespielt und nie geleert, nur vereinigt | Vermerk | [ ] |
| S-5 | Serverkonfiguration, Schlüssel, Proxy und Zugangsschutz unverändert; **`CENTRIC_PFEFFER` unverändert**; kein Aufräumen von Bildern | Vermerk | [ ] |
| S-6 | Start nach Runbook (`deploy.sh` mit freigegebenem Digest, Vier-Augen-Schritt laut Runbook). T0 = erster Start auf leerem `data/` | Runbook | [ ] |
| S-7 | Betreiberzugang neu anlegen (Abschnitt 3), Betreiber-2FA einrichten, Anmeldung mit Faktor geprüft | [ja/nein] | [ ] |
| S-8 | Widerrufene Zugangscodes bleiben ungültig: ein Code der alten Zeit öffnet nichts (Prüfung mit einem bekannt alten Code, ohne ihn zu notieren) | [ja/nein] | [ ] |
| S-9 | Ab T0: Widerrufbücher stündlich außer Haus (Erstlauf ≤ T0 + 2 h), weiter nach Runbook N2–N5 | Runbook | [ ] |

Bei Abbruch vor T0 startet `274bfa0` auf dem **leeren** Bestand, nicht auf dem Altbestand; der beiseitegelegte Bestand
müsste von Hand zurückgelegt werden. Dieser Abbruchfall ist in der Abbruchtabelle des Runbooks (A-VOR) noch nicht für
Pfad 0 beschrieben (offene Frage 2).

## 5. Offene Fragen (nur Betreiber oder Server belegbar, nichts angenommen)

1. Gibt es in Produktion `demo-*`-Räume oder Demokonten, und sind `CENTRIC_ADMIN` und `zustand/` vorhanden (V-2, V-3, V-7)?
2. Runbook und Betreiberanleitung beschreiben den Neustart-Schritt und den Abbruch vor T0 auf leerem Bestand noch nicht;
   die Ausnahme zu Regel 4 der Betreiberanleitung (Beiseitelegen statt `rm`) ist entschieden, aber dort noch nicht eingetragen.
3. Verhalten der Werkzeuge `ablage-sicherung` und `deploy-abgleich` bei leerer Ablage ist nicht belegt (G6 verlangt für die
   Sicherung außer Haus `dateien` > 0): Reihenfolge so wählen, dass die Nachweise den Altbestand belegen.
4. Z-A2 (Neuanlage des Betreiberzugangs auf leerer Ablage) ist nicht als eigener Staging-Schritt belegt.
5. V-6 (Datenkategorien) braucht den Zähler K4-P2 oder eine Betreiber-Sichtprüfung.
6. Der Betreiber bestätigt den Zuschnitt von N-7 und N-9 (nur synthetisch) und den Wortlaut dieser Vorlage.

## 6. Abschluss

- Alle Zeilen erfüllt oder „entfällt" mit Grund: [ja | nein]
- Entscheidung: [Neustart freigegeben | Neustart wird NICHT durchgeführt, Grund: Zeile …]
- Unterschrift Betreiber, Datum: [ ]
