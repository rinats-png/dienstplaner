/* WP-I12 — Fixture und Messung für den Verhaltensvergleich der Planrechnung.
   Die Golden-Datei (fixtures/engine-golden.json) wurde mit der Fassung VOR der Extraktion
   (bda8b68, src/lib/fachlogik.js) erzeugt; der Test rechnet mit der heutigen Fassung nach.
   Feste Uhr und festes Zufallsmuster machen Betrieb und Ergebnis wiederholbar. */
import { createHash } from "node:crypto";
import { baueLeerenBetrieb } from "../server/lib/leerbetrieb.mjs";

export const FEST = "2026-11-06T10:00:00.000Z";
export const VON = "2026-11-01";
export const BIS = "2026-11-30";
export const MONAT = "2026-11";

export function zufall(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

/** Alle Betriebe der Fixture: der leere Betrieb (leerbetrieb.mjs) und die drei Demobetriebe (fachlogik). */
export function betriebe(F) {
  const leer = baueLeerenBetrieb({ name: "Leerer Testbetrieb", branche: "pflege", email: "x@example.org", land: "HE", raum: "m-leer" }).mandanten[0];
  const demo = F.startbestand().mandanten;
  return [["leer", leer], ...demo.map((m, i) => [`demo${i + 1}-${m.branche}`, m])];
}

/** Misst die Planrechnung eines Betriebs: Zählwerte und Prüfsummen. */
export function messen(F, m) {
  const tage = []; for (let i = 1; i <= 30; i++) tage.push(`${MONAT}-${String(i).padStart(2, "0")}`);
  const bef = F.pruefen(m, VON, BIS);
  const arten = {}; for (const b of bef) arten[b.art] = (arten[b.art] || 0) + 1;
  const bes = tage.map((d) => F.besetzung(m, d));
  const pt = m.personen.map((p) => tage.map((d) => F.personTag(m, p, d)));
  const soll = m.personen.map((p) => F.sollStunden(m, p, MONAT));
  const ist = m.personen.map((p) => F.istStunden(m, p, MONAT));
  const konto = m.personen.map((p) => F.stundenkonto(m, p, MONAT));
  const nacht = m.personen.slice(0, 12).map((p) => F.nachtTageImJahr(m, p, 2026));
  const fk = tage.slice(0, 10).map((d) => m.dienstarten.map((da) => F.fachkraftLage(m, d, da.id)));
  return {
    personen: m.personen.length, dienstarten: m.dienstarten.length,
    pruefen: { anzahl: bef.length, arten, sha: sha(bef) },
    besetzung: sha(bes), personTag: sha(pt), soll: sha(soll), ist: sha(ist), konto: sha(konto), nachtTage: sha(nacht),
    kontoWerte: konto.slice(0, 6), sollWerte: soll.slice(0, 6),
    fachkraft: sha(fk), verteilung: sha(F.verteilung(m, MONAT)),
    kennzahlen: (() => { try { return F.planKennzahlen(m, VON, BIS); } catch (e) { return { fehler: String(e && e.message).slice(0, 80) }; } })(),
  };
}
