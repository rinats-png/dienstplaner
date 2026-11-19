# Gerätetestplan Mobil (E-1 bis E-6)

Stand: 2026-11-04 · **Gerüst.** Abgeleitet aus `EXTERNE-ABNAHMEN-UEBERGABE.md` (E-2 bis E-6), `wp07-nachweis.md`, `wp37-nachweis.md`, `wp20-nachweis.md`. Kein Test
ist durchgeführt; keine Stufe `stagingGeprueft` ist belegt. Nachweise bleiben beim Betreiber, ohne Personendaten, ohne Zugangscodes, ohne Hosts.

Zeitplan: [`../BETREIBER-AUFGABEN-WEIHNACHTEN.md`](../BETREIBER-AUFGABEN-WEIHNACHTEN.md) (E-1, E-3, E-2 Runde 2, E-4).

## 1. Gerätematrix

| Gerät | Pflicht | Browser | Stand (Betreiber tragen ein) |
|---|---|---|---|
| Android-Telefon (Pixel laut Übergabeliste vorhanden) | ja | Chrome | Modell `<>`, Version `<>` |
| iPhone | ja (Testplan 4) | Safari, installierte PWA | Modell `<>`, iOS `<>`; beschaffen/leihen (E-3) |
| Android-Tablet oder iPad | ja | Chrome/Safari | `<>` (E-5) |
| Windows-Desktop | ja | Edge, Firefox, Chrome | `<>` |
| macOS | wünschenswert | Safari | `<>` |

Viewports am Desktop (Entwicklerwerkzeug): 360, 390, 430, 768, 1024, 1280, 1920 px.

## 2. Voraussetzungen

Staging-Bild des Release-Kandidaten mit Digest (WP-42a), Zugang per Tunnel (Betreiberfreigabe), Testpersonen je Rolle, Plan-Dienst heute, Testbetrieb mit Einsatzort für Geo.
Zugangscodes nur im Passwortmanager. Standort-Testdaten werden nach dem Test gelöscht und die Löschung nachgewiesen.

## 3. Testblöcke

| Block | Inhalt | Quelle | Erwartung |
|---|---|---|---|
| A PWA-Installation (Android) | „App installieren“, Vollbild, Verknüpfungen „Meine Schichten“/„Krank melden“, maskierbares Icon | E-2 | wie in der Übergabeliste |
| B PWA-Installation (iOS) | „Zum Home-Bildschirm“, Vollbild; iOS bietet keine Manifest-Verknüpfungen | E-3 | Verhalten notieren |
| C Offline-Stempeln | Flugmodus, Einstempeln, App neu starten, Netz zurück | E-2 Schritte 5–9, E-3 | genau ein Stempel, „vorläufig“ dann „bestätigt“, Leitung sieht „offline erfasst“ |
| D „Zugang merken“ aus | offline nach Neustart keine Anmeldung; Puffer bleibt | E-2 Schritt 9 | Senden nach Anmeldung derselben Person |
| E iOS ohne Background Sync | Senden erst im Vordergrund | E-3 | gewollt, am Gerät bestätigen |
| F Dienstarbeiter-Update | alter Dienstarbeiter (`v4`) auf neue Fassung | E-2 Schritt 10 | alte Speicher weg, App läuft |
| G Funkloch | Offline-Start nach Anmeldung als andere Person | E-2 Schritt 11 | kein Datenmix |
| H Wiederanlauf/Bremse | mehrere Offline-Stempel, Netzwackeln, 429 mit Wartehinweis, Containerneustart auf Staging | E-6 | keine verlorenen, keine doppelten Stempel; ein 500 kann trotzdem gespeichert sein (`wp28-nachweis.md` Befund 7) |
| I Layout | Hauptansichten Leitung/Beschäftigte je Viewport, Hoch-/Querformat | E-5 | kein Querscrollen, Dialoge nicht abgeschnitten, keine Konsolenfehler, Antwort unter 1 s |
| J Geo (am Einsatzort) | siehe Abschnitt 4 | E-4 | siehe unten |
| K Push | siehe Abschnitt 5 | E-9 | abhängig von WP-30 |

## 4. Geo/GPS (E-4)

Nur am echten Einsatzort, Android und iOS:

1. Standort erlauben, am Ort einstempeln: INNERHALB erwartet.
2. 200–300 m entfernt einstempeln: AUSSERHALB (gerundete Entfernung, keine Rohkoordinate in der Anzeige).
3. Schlechte Genauigkeit (Innenraum, ungefährer Standort): Warnung bzw. NICHT_BEWERTBAR (Grenzen laut Staging-Bericht: über 100 m Warnung, über 1000 m nicht bewertbar).
4. Standort verweigern: Stempeln bleibt möglich, Hinweis verständlich.
5. Außendienst-Dienstart und Dienst ohne festen Ort.
6. Befunde-Reiter der Leitung zeigt nur gerundete Entfernung.
7. Standort-Testdaten löschen, Löschung nachweisen.

Aktivierung von Geo in Produktion erst nach bestandenem E-4 (Betreiberentscheidung 2026-11-03).

## 5. Push (nach WP-30)

Push an Android; an eine **installierte** iOS-PWA (iOS-Verhalten am Gerät prüfen, laut Übergabeliste nicht belegt); Berechtigung verweigern: App bleibt benutzbar;
Zustellung nach Neuanmeldung; Abmeldung beendet Push. Details: [`MAIL-PUSH-KONFIGURATION-CHECKLISTE.md`](MAIL-PUSH-KONFIGURATION-CHECKLISTE.md).

## 6. Durchführung in zwei Runden

Runde 1 mit E-1 auf dem Freeze-Stand (liefert zugleich den eingefrorenen Prüfstand für den Pentest). Runde 2 auf dem Stand nach den Pentest-Behebungen (Regression).

## 7. Nachweis

Tabelle Gerät/Block/Schritt/Ergebnis (bestanden/Befund-Nr.), Screenshots der Befunde ohne Namen (`E-<Nr>_<Kurzbeschreibung>_<Nr>.png`), Gerätemodell und Version ohne Seriennummer.
Abnahme: 0 Funktionsfehler, UX-Befunde bewertet.
