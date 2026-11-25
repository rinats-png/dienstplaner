# RST-3 — REVIEW-NACHWEIS je Merge und G2-Sammelbelegliste mit Hash (P2-47 B3)

Stand: 2026-11-25. Prozessstufe L3, Umfangsklasse TECHN-ABHAENGIGKEIT. Basis `origin/integration/release-v4`. Nur synthetische
Daten. Gate G2 (`g2Review`, `reviewNachweiseLesen`, `urteilPositiv`) ist unverändert; keine Änderung an `.github/workflows/*`.

## 1. Abgleich mit dem Bestand

| Akzeptanz | Bestand | Lücke | Ergebnis |
|---|---|---|---|
| Zeile in Positivform beim Merge, nur mit Reviewbericht | Lesart vorhanden (`urteilPositiv`, `reviewNachweiseLesen`); Zeilen werden von Hand geschrieben | kein Werkzeug, das nur mit Bericht eine Zeile erzeugt | `werkzeug/review-nachweis.mjs zeile` |
| Sammelbelegliste mit Hash und tatsächlichen Prüfnachweisen | `RELEASE-PROZESS.md` (Zeile „G2 Review-Bestätigungen“) nennt sie als Ersatz der Einzelquittung; es gibt sie nicht | Liste, Hash, Prüfung | `sammelliste` und `pruefen` |
| Test mit Fixture: G2 erkennt neue Zeilen | `release-pruefung.test.js` prüft G2 mit festen Tabellen | Fixture „neue Zeile hebt PR aus `manuell` in `belege`“ | `pruefungen/review-nachweis.test.js` |
| Gate G2 unverändert | – | – | `release-pruefung.mjs` nicht angefasst |

## 2. Umsetzung (kleinster Umfang, kein neues Framework)

`werkzeug/review-nachweis.mjs` nutzt `urteilPositiv`, `reviewNachweiseLesen` und `PR_MUSTER` aus `release-pruefung.mjs`.

- `zeile --pr N --modell M --urteil U --bericht DATEI [--datei REVIEW-NACHWEIS-JJJJ-MM-TT.md]`: Die Zeile
  `| #N | Modell | Urteil | SHA-256 des Berichts | gemergt |` entsteht nur, wenn die Berichtsdatei vorhanden und nicht leer
  ist, `#N` nennt (`#9` trifft `#90` nicht) und das Urteil `urteilPositiv` erfüllt. Sonst Ablehnung (Exit 1): kein Beleg ohne Bericht.
  Mit `--datei` wird angehängt (Kopf wird angelegt); Dateiname nur `REVIEW-NACHWEIS-*.md`, damit G2 die Zeile liest.
- `sammelliste --prs "#1,#2" [--ausgabe DATEI]`: je PR der Beleg, den G2 heute lesen würde (letzte Aussage je PR positiv), sonst
  „ohne Beleg“; Kopfzeile mit Zählung, `SHA-256:` über die sortierten Zeilen. Die Ausgabedatei darf nicht existieren
  (unveränderlich). `pruefen DATEI` rechnet den Hash nach (Manipulation einer Zeile oder des Hashes: abgelehnt).
- Die Sammelliste trägt den Tabellenkopf `Nummer | Beleg` und gehört in eine Datei ohne Präfix `REVIEW-NACHWEIS`; G2 liest sie
  deshalb nicht als Beleg (kein Doppelzählen, keine Selbstbestätigung). Sie ersetzt keine fehlenden materiellen Sicherheits-
  oder Review-Nachweise (steht im Kopf der Datei). Eine Annahme der Liste als Einzelquittung durch G2 wäre eine Gate-Änderung
  und ist nicht Teil dieses Pakets (Betreiberentscheidung B3 nennt die Liste als Ersatz der Einzelquittung; das Gate-Verhalten
  dazu bleibt Folgearbeit nach Freigabe).

## 3. Rot → grün, Mutationen, Zahlen

- Rot: vor dem Werkzeug schlägt der Import in `pruefungen/review-nachweis.test.js` fehl (Datei fehlt).
- Grün: 7 Tests. Verdrahtet in `pruefung:acc45-werkzeuge` (läuft in `pruefung.yml`).
- Mutationen, je einzeln, alle gefangen: leerer Bericht erlaubt; Positivform abgeschaltet; Hashvergleich entfernt;
  Überschreiben der Sammelliste erlaubt; PR-Nummer nur als Präfix gesucht; „ohne Beleg“ als Beleg ausgewiesen.

## 4. Patch-Vorschlag für den Betreiber (Workflow, N-1; hier nicht angewendet)

Neuer Workflow `.github/workflows/review-nachweis.yml` (Maschinenkonto mit Recht zum Schreiben auf den Integrationsbranch,
kein `workflow`-Scope nötig, da keine Workflow-Datei geändert wird). Der Reviewbericht ist ein Kommentar eines anderen
Kontos (Rolle OWNER/MEMBER/COLLABORATOR) der Form `REVIEW-BERICHT <Modell> <Urteil>` mit dem Berichtstext darunter.

```yaml
name: review-nachweis
on:
  pull_request:
    types: [closed]
    branches: [integration/release-v4]
permissions: { contents: write, pull-requests: read }
jobs:
  zeile:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<gepinnter SHA wie die anderen Workflows>
        with: { ref: integration/release-v4 }
      - uses: actions/setup-node@<gepinnter SHA wie die anderen Workflows>
        with: { node-version: 24 }
      - name: Zeile nur mit Bericht
        env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}", NR: "${{ github.event.pull_request.number }}", AUTOR: "${{ github.event.pull_request.user.login }}" }
        run: |
          gh api "repos/$GITHUB_REPOSITORY/issues/$NR/comments" --paginate \
            --jq "[.[] | select(.user.login != \"$AUTOR\" and (.author_association|IN(\"OWNER\",\"MEMBER\",\"COLLABORATOR\")) and (.body|startswith(\"REVIEW-BERICHT \")))] | last | .body // empty" > bericht.txt
          [ -s bericht.txt ] || { echo "kein Reviewbericht: keine Zeile (G2 bleibt offen für #$NR)"; exit 0; }
          kopf="$(head -n1 bericht.txt)"; modell="$(awk '{print $2}' <<<"$kopf")"; urteil="$(cut -d' ' -f3- <<<"$kopf")"
          printf '\nBericht zu #%s\n' "$NR" >> bericht.txt
          node werkzeug/review-nachweis.mjs zeile --pr "$NR" --modell "$modell" --urteil "$urteil" --bericht bericht.txt \
            --datei "docs/acc45/REVIEW-NACHWEIS-$(date -u +%F).md" || exit 0
          git config user.name centric-dev-bot && git config user.email "centric-dev-bot@users.noreply.github.com"
          git add docs/acc45 && git commit -m "REVIEW-NACHWEIS #$NR" && git push origin HEAD:integration/release-v4
```

Hinweise zum Patch: (a) Der Push auf den Integrationsbranch muss vom Branchschutz für das Maschinenkonto zugelassen sein
(heute für Merges so belegt, ENTSCHEIDUNGSLISTE Nachtrag 2026-11-25); sonst die Zeile als PR einreichen. (b) Ohne Bericht
passiert nichts; der PR bleibt in `manuell` (G2 fail-closed). (c) Die Zeile nennt den Berichts-Hash, nicht den Bericht; der
Berichtstext bleibt im PR-Kommentar. (d) Die Sammelliste erzeugt der Koordinator je Release:
`node werkzeug/review-nachweis.mjs sammelliste --prs "<Liste aus G2>" --ausgabe docs/acc45/REVIEW-SAMMELBELEG-<Release>.md`.
