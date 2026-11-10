/* WP-I12a — Messung für den Verhaltensvergleich von hindernisBefunde, ersatzVorschlaege, nachtJahr und
   verfuegbarFuer. Die Golden-Datei (fixtures/engine-einsatz-golden.json) wurde mit der Fassung VOR der Extraktion
   (src/lib/fachlogik.js im Stand 38fc7d0, Funktionen noch dort) erzeugt; der Test rechnet mit der heutigen Fassung
   nach. Feste Uhr und festes Zufallsmuster: siehe engine-golden.fixture.mjs. */
import { createHash } from "node:crypto";

const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const TAGE = ["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-14", "2026-11-17", "2026-11-22", "2026-11-28"];

/** Misst die Funktionen auf einem Betrieb. `F` ist ein Modul mit diesen Funktionen (alt oder neu). */
export function messenEinsatz(F, m) {
  const personen = m.personen.filter((_, i) => i % 5 === 0).slice(0, 18);
  const hb = [];
  for (const p of personen) for (const d of TAGE) for (const da of m.dienstarten.slice(0, 5)) {
    hb.push(F.hindernisBefunde(m, p, d, da).map((b) => [b.stufe, b.text, b.quelle, b.art, b.regel, b.sperrt, b.regelId ?? null]));
  }
  const ev = [];
  for (const d of TAGE.slice(0, 5)) for (const da of m.dienstarten.slice(0, 5))
    ev.push(F.ersatzVorschlaege(m, d, da.id).map((k) => [k.person.id, k.punkte, k.gruende, k.hindernisse, k.moeglich]));
  const nj = personen.map((p) => F.nachtJahr(m, p, 2026));
  const vf = [];
  for (const p of personen) for (const d of TAGE) for (const da of m.dienstarten) vf.push(F.verfuegbarFuer(p, d, da));
  return {
    personen: m.personen.length,
    hindernisBefunde: { anzahl: hb.length, mitBefund: hb.filter((x) => x.length).length, sha: sha(hb) },
    ersatzVorschlaege: { anzahl: ev.length, kandidaten: ev.reduce((a, x) => a + x.length, 0), sha: sha(ev) },
    nachtJahr: sha(nj), verfuegbarFuer: sha(vf),
  };
}
