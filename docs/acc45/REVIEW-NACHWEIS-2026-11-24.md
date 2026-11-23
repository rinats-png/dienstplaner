# Review-Nachweis der Orchestrierung (Stand 2026-11-24)

**Ehrlichkeitsvermerk:** Dies ist eine **Selbstauskunft des Koordinators, kein GitHub-Review eines anderen Kontos**. Die Tabelle gibt die Reviewberichte der Koordination vom 2026-11-22/23 wieder; die Rohberichte liegen nicht als Dateien im Repository. Was hier nicht steht, ist „nicht in dieser Übersicht“. Muster: `REVIEW-NACHWEIS-2026-11-23.md`. Alle genannten PRs sind gemergt (Merge-Commits unten).

| PR | Review-Modell | Runden / Urteil | Stand |
|---|---|---|---|
| #473 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #474 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #475 | Sonnet (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #477 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #481 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #482 | Sonnet (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #484 | Opus (Review und Delta-Review 2026-11-22/23, nicht Autor) | NICHT MERGEN → Delta MERGEBAR | gemergt |
| #485 | Opus (Review und Delta-Review 2026-11-22/23, nicht Autor) | MIT AUFLAGEN → Delta MERGEBAR | gemergt |
| #486 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #487 | Opus (Review und Delta-Review 2026-11-22/23, nicht Autor) | NICHT MERGEN → Delta MERGEBAR | gemergt |
| #488 | Sonnet (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |
| #490 | Opus (Review 2026-11-22/23, nicht Autor) | MERGE-OK | gemergt |

Zuordnung der Urteile: In den Berichten steht „FREIGABE“. Das Vokabular von `urteilPositiv` kennt dieses Wort nicht; es ist hier als `MERGE-OK` geschrieben (gleiche Bedeutung, ohne Auflagen). Merge-Commits: #473 16b4cdfb, #475 748099a2, #474 6969a54b, #477 a1c8eafa (Urteil über den Inhalt), #481 03bc00de, #482 2c8c4098, #484 acd7ce85, #485 3309574c, #486 82f3d2d5, #487 517993ca, #488 6718e42e, #490 b6d1f35e.

Verlauf der Zeilen mit Delta: #484 hatte im ersten Review den Blocker B1 (NICHT FREIGEGEBEN); das Delta-Review (Opus) gab FREIGABE. #487 hatte im ersten Review eine rote CI (NICHT FREIGEGEBEN); das Delta-Review gab FREIGABE. #485 hatte FREIGABE MIT AUFLAGEN; das Delta-Review (Opus) gab FREIGABE. Die Form entspricht der Zeile #359 in `REVIEW-NACHWEIS-2026-11-23.md`.

Bewusst nicht als Beleg aufgenommen (kein Delta-Review nach den Auflagen; die Form „MIT AUFLAGEN“ allein ist kein positiver Beleg, die Form „→ erledigt“ wäre unwahr):

- **#476** (Opus, FREIGABE MIT AUFLAGEN, Merge 4be21fea): Der Autor setzte die Auflagen um. Der Reviewer sagte, nach den Auflagen sei der PR bei grüner CI ohne neues Voll-Review mergefähig. Der Koordinator prüfte den Diff (nur Test, Kommentar, Doku). Es gab kein eigenes Delta-Review.
- **#483** (Opus, FREIGABE MIT AUFLAGE A1, Merge dcbe38ab): Der Autor ergänzte Tests. Nur der Koordinator prüfte das Test-Delta. Es gab kein eigenes Delta-Review.
- **#491** (Opus, FREIGABE MIT AUFLAGEN, niedrig, vor dem Statuswechsel zu erfüllen, Merge 26706eb8): Kein Delta-Review.

Diese drei PRs haben nach dieser Datei keinen G2-Beleg aus der Dokumentation. Ein späteres Delta-Review mit Positivform gehört in eine neue, lexikografisch spätere Datei.

Nicht belegt in dieser Datei: #469, #470, #471, #472 (Merges am 2026-11-22). Die Urteile sind im Repository nicht gesichert; `gh pr view` zeigt für diese PRs nur den Hinweis eines Sicherheits-Bots („Couldn't complete the review“), kein Review. Ebenso nicht belegt: Head-SHAs der Reviews und die Reviewberichte im Einzelnen.

Wirkung auf G2 (`werkzeug/release-pruefung.mjs`, `reviewNachweiseLesen`): Diese Datei ist lexikografisch später als `REVIEW-NACHWEIS-2026-11-23.md`. Sie nennt keinen PR aus den früheren Dateien (#267, #268, #359, #427 und die Belege aus -19/-20); es wird also kein früherer Beleg aufgehoben. #427 steht hier absichtlich nicht und bleibt ohne positiven Beleg.

Ein Review-Beleg ist kein Fachfreigabe-Ersatz und ändert weder SSOT noch Status.
