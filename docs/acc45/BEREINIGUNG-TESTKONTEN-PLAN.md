# Bereinigung alter Testkonten und Demo-Betriebe – Plan (Entwurf, keine Löschung)

Stand: 2026-11-09. Status: **nur Planung**. Keine Löschung auf produktiven Systemen. Keine Löschung ohne schriftliche Bestätigung des Betreibers nach Vorlage der konkreten Liste und des Sicherungsplans (Auftrag 2026-11-09).

## 1. Was ich aus dem Repo belegen kann (lesend)

| Thema | Befund | Quelle |
|---|---|---|
| Demo-Betriebe | Räume mit Präfix `demo-*`; nur diese lässt der Demozugang zu. | `server/funktionen/daten.mjs:795` |
| Demo-Schalter | `CENTRIC_DEMO` ist Standard **aus**. Ob er in Produktion gesetzt ist, ist offen (Betreiberangabe O-07). | `docs/BETRIEBSHANDBUCH.md:69`, `docs/legal/BETREIBERANGABEN-OFFEN.md:13` |
| Testbetriebe (selbst angelegt) | Präfix `t-`, Kennzeichen `selbstAngelegt`, Status `test`, Ablauf nach 30 Tagen, Aufbewahrung 90 Tage. | `server/lib/aufraeumen.mjs:73-74` |
| Täglicher Löschlauf | Läuft **standardmäßig an** (`CENTRIC_AUFRAEUMEN` ≠ `aus`). Löscht nur Räume, die den Kriterien oben entsprechen; ein auf „aktiv“ gesetzter Betrieb wird nie angefasst. | `server.mjs:525`, `docs/BETRIEBSHANDBUCH.md:70` |
| Vollständige Raumlöschung | Vorhanden (`raumloeschung.mjs`): Bestand, Scherben, Sicherungen, Zugangscodes, Mitgliedschaften, Push, Sitzungen, Sicherungsschlüssel, Kalender-Feeds. Der Kern wird zuletzt gelöscht; Fehler werden gezählt, nicht verschluckt. | `server/lib/raumloeschung.mjs` |
| Globale Konten | Accounts (`account:`, `kontoId:`) werden von der Raumlöschung **nicht** angefasst. Ein Konto ist globale Identität. Ein Löschpfad für Konten selbst wurde bei der Sichtung nicht gefunden (im Plan als Lücke geführt). | `server/lib/raumloeschung.mjs` (Kopfkommentar) |
| Testbetriebe und Staging | Im Staging existieren Altbestände `stg-alpha` und `stg-beta`. Sie gehören zur Staging-Abnahme, nicht zur Produktion. | `docs/acc45/EXTERNE-ABNAHMEN-UEBERGABE.md:131`, `docs/acc45/STAGING-ABNAHME-CHECKLISTE.md:64` |
| Betreiber-Hauptkonto | Erkennbar an der Betreiberrolle (`betreiber`) und dem Betreiber-Faktor. Die konkrete Konto-Kennung steht **nicht** im Repo. | `server/lib/betreiber-zweifaktor.mjs`, `docs/BETRIEBSHANDBUCH.md` |
| Systemkonten | Sicherungsschlüssel (`sicherungsschluessel`) mit eigenem Ersteller; diese werden von der Raumlöschung mitgelöscht, sind aber für die Wiederherstellung nötig. Sie dürfen nicht versehentlich ohne Sicherung verschwinden. | `server/funktionen/daten.mjs:28-31`, `server/lib/raumloeschung.mjs` |

## 2. Was ich nicht belegen kann (offen, Betreiber-Abfrage nötig)

Ohne Zugriff auf die Produktionsdatenbank und die Staging-Daten kann ich diese Zahlen nicht liefern:
- Anzahl der Betriebe je Präfix (`t-`, `demo-`, `stg-`, sonstige) je Umgebung.
- Anzahl Konten, Zugangscodes, Sitzungen je Betrieb.
- Ob echte Personendaten in Testbetrieben liegen (Name, Personalnummer, Zeiten).
- Ob der Betreiber-Hauptkonto-Eintrag eindeutig identifizierbar ist.
- Ob der tägliche Löschlauf in Produktion bereits Räume gelöscht hat (Protokoll).

## 3. Umgebungen

| Umgebung | Zustand laut Repo | Vorgehen |
|---|---|---|
| Entwicklung (lokal, Tests) | Testfixtures in Tests. Keine Produktionsdaten. | Tests passen sich an; keine Löschung nötig. |
| Staging | `stg-alpha`, `stg-beta` als Altbestände der Abnahme. | Nur nach Freigabe der Staging-Abnahme. Keine Reset-Pflicht. |
| Produktion | Unbekannter Bestand (Betreiberangabe). | Nur nach Bestätigung der Liste (Abschnitt 5) und mit Sicherung. |

## 4. Schutzregeln (verbindlich)

- Betreiber-Hauptkonto und alle Systemkonten sind **von jeder Löschung ausgenommen**. Der Löschplan führt sie als „ausgeschlossen“ mit Grund.
- Sicherungsschlüssel nur mit ihrem Raum löschen, nie allein.
- Kein Betrieb mit Status „aktiv“ oder mit Vertragsfeldern wird angefasst.
- Keine Löschung aufgrund des Namens allein: Kriterium ist Präfix plus Kennzeichen plus Ablaufdatum, wie im bestehenden Löschlauf.
- Echte Personendaten in einem Testbetrieb: Der Betrieb wird **nicht** gelöscht, bevor der Betreiber entschieden hat (Aufbewahrungspflichten prüfen).

## 5. Löschplan (Ablauf, nach Bestätigung)

1. **Liste erstellen (nur lesend):** pro Umgebung alle Räume mit Präfix, Kennzeichen, Status, Ablaufdatum, Anzahl Personen/Konten/Codes/Sitzungen. Ausgabe ohne Personendaten.
2. **Ausschlussliste:** Betreiber-Hauptkonto, Systemkonten, Sicherungsschlüssel-Ersteller, Betriebe mit Status „aktiv“.
3. **Sicherung vor Löschung:** vollständige verschlüsselte Sicherung (WP-04, restic) der betroffenen Umgebung. Wiederherstellungsprobe, bevor gelöscht wird.
4. **Trockenlauf:** `raumloeschung` im Vorschaumodus (zählt, löscht nicht). Ergebnis vom Betreiber bestätigen lassen.
5. **Löschung in Stufen:** zuerst Demo-Räume, dann abgelaufene Testbetriebe, zuletzt Staging-Altbestände, jeweils mit Ergebnisprotokoll.
6. **Nachweis:** `vollstaendig`-Flag je Raum; Restbestand prüfen; Protokoll ohne Personendaten.
7. **Wiederherstellung:** Bei Fehlern Rückführung aus der Sicherung (Schritt 3). Wiederherstellungsprobe ist Voraussetzung.

## 6. Abhängigkeiten

- Sicherung und Wiederherstellungsprobe (WP-04, WP-03) sind integriert.
- Schlüsselepochen (Entscheidung 8, Kontowiederherstellung): Nach Löschung darf eine alte Sicherung keine Konto-Codes zurückbringen, die wir als ungültig führen. Vorher klären.
- Der tägliche Löschlauf läuft bereits. Vor einer manuellen Löschung muss der Betreiber wissen, ob er Teil der Liste ist.

## 7. Entwicklungsaufwand: spart die Bereinigung etwas?

- **Ja, aber wenig.** Die Bereinigung entfernt nur Altdaten. Der Code für Migration der Testkonten (alte Codes, Format v1) bleibt nötig, weil echte Konten dieselbe Struktur haben können.
- Eingesparter Aufwand (Schätzung, nicht gemessen): Testfixtures für alte Konten und Codes (0,5 PT) und Migrationstests für Testdaten (0,5 PT). Zusammen etwa **0,5–1 PT**.
- Kosten der Bereinigung selbst: Liste und Trockenlauf 0,5 PT, Löschung und Nachweis 0,5 PT, Konto-Löschpfad (Lücke, siehe 1) 1–2 PT. Nettoeffekt damit **nahe null oder negativ**, solange kein Konto-Löschpfad existiert.
- Fazit: Die Bereinigung ist aus Betriebssicht sinnvoll (weniger Altdaten, klarere Migration). Als Entwicklungsvereinfachung trägt sie wenig. Die Entscheidung sollte daher nicht auf dem Aufwand beruhen.

## 8. Konsequenz für neue Testbetriebe

Neue Testbetriebe nur über die regulären Einrichtungswege (OPT-1: Ersteinrichtung mit einmaligem, befristetem Code; Zugangscode nicht per Klartext-Mail). Keine Sonderwege für Tests in Produktion.

## 9. Offene Betreiberentscheidungen

1. Bestätigung der Abfrage (Abschnitt 2) und Freigabe der Liste.
2. Ob der Konto-Löschpfad gebaut werden soll (1–2 PT) oder Konten bestehen bleiben.
3. Aufbewahrung für Testbetriebe mit echten Personendaten.
4. Zeitpunkt der Löschung (vor oder nach Einführung der neuen Kontoarchitektur).
