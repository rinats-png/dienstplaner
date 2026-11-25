# K4-P7 — Neustart-Nachweis, Vorlage (Nachweis)

Stand: 2026-11-25. Prozessstufe L2, Umfangsklasse SICHERHEIT-QUALITAET, Strang folge. Nur die für `v4-r1` notwendigen
Teile (K4 Pfad 0, Betreiberentscheidung 2026-11-25). Status in `docs/acc45/work-packages.json` bleibt BLOCKED
(Betreiberbestätigung des Wortlauts steht aus); gesetzt sind nur `implementiert` und `lokalGetestet`.

## Geliefert

- `docs/acc45/vorlagen/K4-NEUSTART-NACHWEIS.md` (vorhandener Vorlagenordner, keine neue Dokumentfamilie): Neustart-Nachweis mit
  (1) lesender Bestandsverifikation V-1…V-8 (nur Zahlen/Ja-Nein), (2) Strategie-Nachweis A.7, gekürzt (N-5, N-6, N-12
  entfallen, N-5n ersetzt N-5, N-7/N-9 nur synthetisch), (3) Betreiberzugang und Pflicht-2FA vor dem Beiseitelegen,
  (4) Neustart-Schritte mit Beiseitelegen statt Löschen, (5) offene Fragen. Formblatt B.7 entfällt (Pfad 0). Variante b:
  Verweis auf Ablauf N0–N5 im Runbook, keine Doppelung.
- Test: `pruefungen/doku.test.js`, Block „K4-P7" (Pflichtinhalte, Verweise, keine Hosts/IPs/Digests/Codes/Schlüssel).
  Rot vor der Vorlage (Datei fehlte), grün danach. Drei Mutationen einzeln (Widerspruchssatz, `CENTRIC_PFEFFER`,
  IP-Adresse eingefügt) machen den Test rot. Lauf: `doku`, `acc45-status`, `acc45-werkzeuge` 81 grün, 1 übersprungen
  (bestehender Skip).

## Vorhandenes Werkzeug gegen `274bfa0`

`deploy/sicherung/hilfen/bestaende-zaehlen.mjs` nutzt `getStore({name, consistency})` und `bestandLesen(store, raum)`.
Beide gibt es in `274bfa0` (`server/lib/ablage.mjs`, `server/lib/bestand.mjs`) mit gleicher Signatur. Lokale Probe: Skript mit
ersetztem `/app`-Pfad gegen die Bibliotheken von `274bfa0` und eine mit `274bfa0`-Code geschriebene synthetische Ablage:
`{"bestaende":2,"lesbar":2,"fehler":0,"mandanten":2,"konten":2}`, Exit 0. Die erste Ausgabezeile nennt den Datenpfad
(deshalb in V-1 vermerkt). Nicht belegt: der Lauf im echten `274bfa0`-Bild auf dem Server. Daher kein neues Werkzeug.
Demoräume/-konten (V-2/V-3) werden mit Shell-Zählungen über Dateinamen bzw. `grep -l` erfasst (Schlüssel
`kern%3Ademo-…`, Konto-Feld `demo`; auf der synthetischen Ablage geprüft: 1 und 1), Ausgabe nur die Zahl.

## Offen (nur Betreiber/Server belegbar, nichts angenommen)

1. Ist-Stand auf dem Server: `demo-*`-Räume/-Konten, `CENTRIC_ADMIN`, `zustand/`, Registrierungsschalter.
2. Betreiber bestätigt den Wortlaut (Akzeptanz) und den Zuschnitt N-7/N-9.
3. Runbook/Betreiberanleitung enthalten den Neustart-Schritt, die Ausnahme zu Regel 4 und den Abbruch vor T0 auf leerem Bestand
   noch nicht (nicht Teil dieses Pakets; Hinweis an Koordinator).
4. Verhalten von `ablage-sicherung`/`deploy-abgleich` bei leerer Ablage und Neuanlage des Betreiberzugangs (Z-A2) nicht belegt.
5. V-6 (Datenkategorien) braucht K4-P2 (Heuristik-Zähler) oder Betreiber-Sichtprüfung.
