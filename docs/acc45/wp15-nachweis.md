# WP-15 — Selbstauskunft mit Freigabe und Stempelabgleich: Nachweis

Branch `feature/wp15-wp32d`, Basis `bda8b68`. Akzeptanz (work-packages.json): „Selbstauskunft wird Antrag;
Abweichung markiert; erst nach Freigabe Ist“. Offene Auslegungen und gewählte (restriktive) Vorgaben:
`wp15-wp32d-fragen.md` (F15-1 … F15-9).

## Ablauf

1. **Stellen** (`POST /api/zeit-bestaetigen`, wie bisher; Rumpf unverändert): Die Person (nur die eigene — `personId` im
   Rumpf wird ignoriert) bestätigt für einen vergangenen Tag mit geplantem Dienst (höchstens 14 Tage zurück) „wie
   geplant“ oder abweichend. Statt Ist entsteht ein **Antrag**:
   `erfassung[Person|Tag] = { start: null, ende: null, bestaetigt: false, selbstauskunft: { id, status: "offen",
   gestellt, von, wieGeplant, vorschlag, grund, abweichung, stempel: "keiner", entschieden: null } }`.
   Mit `bestaetigt: false` und ohne Zeiten zählt der Tag unverändert mit der Planzeit (`istZeitFuer`); die Behauptung
   fließt in kein Konto, keinen Zuschlag, keine Lohnausgabe.
2. **Abweichung markiert** — vom Server gerechnet (`abweichungVomPlan`): Beginn-, Ende-, Dauer- und Pausendifferenz in
   Minuten gegen die Dienstart, Marken `BEGINN/ENDE/DAUER/PAUSE`, Plan zum Vergleich. Auch „wie geplant“ trägt die
   Angabe (`abweichend: false`). Felder wie `abweichung`, `status`, `bestaetigt` im Rumpf des Clients werden nicht
   gelesen.
3. **Stempelabgleich** (`stempelAbgleich`), beim Stellen **und** bei der Freigabe: Gibt es für den Tag einen Stempel
   (`einstempeln[Person|Tag]`) → 409 `STEMPEL_VORHANDEN` (Abweichung vom Original = Korrekturantrag am Stempel, WP-14);
   hat der Vortag einen offenen Beginn ohne Ende → 409 `VORTAG_OFFEN`. Bei der Freigabe erscheint ein inzwischen
   eingegangener Stempel (z. B. spät synchronisierter Offline-Stempel) als 409; der Antrag lässt sich dann nur noch
   ablehnen oder zurückziehen.
4. **Freigabe** (`POST /api/selbstauskunft-entscheiden`, neu): `genehmigt` / `abgelehnt` nur mit `staff.edit` (Leitung,
   Planung, Probierraum); **nie die eigene Selbstauskunft** (403 `VIER_AUGEN`); Plan und Angaben werden erneut
   geprüft, gemessen am Tag der Antragstellung (409 `PLAN_GEAENDERT`, wenn der Dienst entfallen ist). Erst jetzt wird
   der Eintrag `bestaetigt: true` mit Beginn, Ende, Pause, Grund und `selbstauskunft.entschieden` (wer, wann); dazu
   Regelhinweise (§ 3, § 4, § 5 ArbZG, MuSchG, JArbSchG), nur Hinweise. Ablehnen: Begründung 10–500 Zeichen Pflicht;
   Zurückziehen: nur die antragstellende Person. Doppelt entscheiden: 409. Abgeschlossener Monat: 409
   `MONAT_ABGESCHLOSSEN` (Stellen und Entscheiden).
5. Nach Ablehnung/Zurückziehen ist ein **neuer Antrag** für den Tag möglich; der alte wandert in `verlauf` (höchstens 5).
6. **Monatsabschluss**: ein offener Antrag zählt in `offenePunkte` als offener Antrag (sperrt wie ein Korrekturantrag),
   nicht als „zur Prüfung“.

## Datenschutz (E1, H8+) — unverändert gehaltene Sichten

Der Antrag liegt in `erfassung` und erbt dessen Regeln (keine Änderung an `sicht.mjs`, `rechte.mjs`, `scherben.mjs`):

| Rolle | sieht |
|---|---|
| Beschäftigte | nur den eigenen Antrag und dessen Entscheidung |
| Betriebsrat | keine Ist-Daten (`sichtIstDaten.umfang = "keine"`), also keinen Antrag |
| Schichtverantwortung | eigene ganz; für den Bereich nur `start, ende, bestaetigt, pause, ungeplant` — **nie** `selbstauskunft` (Grund, Entscheidung) |
| Leitung/Planung | alle (sie entscheiden) |
| Betreiber | keine Ist-Daten |

Beschäftigte und Schichtverantwortung können im allgemeinen Speichern weder einen Antrag anlegen noch ändern oder auf
„genehmigt“ setzen (`erfassungZusammen` übergeht Kopien; Test). Betriebsprotokoll: `Selbstauskunft Zeiten` (Stellen)
und `Selbstauskunft <id>: <Status> · <Anzahl Hinweise>` — ohne Person im Text, ohne Zeiten und ohne Hinweiskennungen
(wie WP-14b M1); der Tag steht nur im Feld `tag` und wird in der Betreiber-Lage entfernt.

Rest: Die Leitung/Planung kann per `PUT /api/bestand` weiterhin Ist direkt schreiben (unverändert; WP-14b), also auch
einen Antrag überschreiben. Ein später eingehender echter Stempel überschreibt `erfassung` für den Tag wie bisher
(Stempel = Original, F15-9).

## Tests

- `pruefungen/selbstauskunft.test.js` (neu, 18): Antrag statt Ist, Server-Abweichung (Client-Felder ignoriert), 409-Fälle,
  Stempelabgleich beim Stellen und bei der Freigabe, Plan geändert, Rechte (Beschäftigte/SV/BR 403), Freigabe durch
  Leitung und Planung mit Hinweisen, Vier-Augen, Ablehnen mit Begründung und Verlauf, Zurückziehen, Monatsabschluss-Zählung,
  Reinheit der Funktionen, Datenschutz je Rolle, Wächter im allgemeinen Speichern.
- `pruefungen/selbstauskunft-oberflaeche.test.js` (neu, 6): `SelbstauskunftStatus`, `SelbstauskunftFreigabe`.
- Angepasst (Verhalten laut Akzeptanz geändert, nicht abgeschwächt): `pausenerfassung.test.js` (Antrag, dann Freigabe →
  Ist mit Hinweisen), `rollen-failclosed.test.js` und `routen-inventar.test.js` (neuer Weg, Sonde, Matrixzeile in
  `RECHTEMATRIX.md`).

## Einbau in `src/App.jsx` (nur Schnipsel; App.jsx ist Konfliktzone — bewusst nicht mehr angefasst)

Bereits geändert (eine Zeile): `bestaetigeZeit` meldet „Zeit beantragt — sie zählt nach der Freigabe durch die
Leitung“ statt „Zeit bestätigt.“; `erg.eintrag` ist der neue Antragsstand und wird wie bisher in `erfassung` übernommen.

Noch einzubauen:

```jsx
import { SelbstauskunftStatus, SelbstauskunftFreigabe } from "./ansichten/selbstauskunft.jsx";

// in den Aktionen (akt), neben bestaetigeZeit:
uebernehmeSelbstauskunft: (pid, d, erg) => upd((s2) => ({ ...s2, mandanten: s2.mandanten.map((m) =>
  m.id !== (s2.session || {}).mandantId ? m
    : { ...m, erfassung: { ...(m.erfassung || {}), [`${pid}|${d}`]: erg.eintrag } } }) })),

// „Meine Schichten" (MeineSchichten, vor der Liste der offenen Zeiten):
<SelbstauskunftStatus m={m} ich={ich} onErgebnis={akt.uebernehmeSelbstauskunft} melde={melde} />

// Stempelbefunde der Leitung/Planung (neben KorrekturAntraege):
{darf(sitz, "staff.edit") && <SelbstauskunftFreigabe m={m} ichId={sitz.person && sitz.person.id}
  onErgebnis={akt.uebernehmeSelbstauskunft} melde={melde} />}
```

`offeneErfassung` (`src/lib/fachlogik.js`) bietet abgelehnte/zurückgezogene Tage wieder an (eine Zeile).
`src/pruefung.jsx` hat eine eigene Kopie von `offeneErfassung` (Prüfansicht) — nicht angepasst.

## Offen / nicht Teil von WP-15

Benachrichtigung der Leitung (wie WP-14), Auto-Freigabe bei „wie geplant“ ohne Abweichung (Produktentscheidung F15-1),
Selbstfreigabe für Einpersonenbetriebe (F15-2), E2E im Browser (die Einhängepunkte oben fehlen noch).
