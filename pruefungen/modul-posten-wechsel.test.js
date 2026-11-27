/* ==========================================================================
   WP-19.1 — Postenwechsel innerhalb eines Dienstes (Invarianten W1–W13,
   docs/acc45/WP19-MODULPLAN.md § 18)

   Teil A  reine Funktionen: Form (W1, W4, W13), Zeiträume gegen den Dienst
           (W5), Zählung zeitanteilig ohne Doppelzählung (W6, Zufallsvergleich
           gegen eine naive Minutenreferenz), Befunde, Objektbericht, Wachbuch
           (W10), Pflegefunktionen der Oberfläche.
   Teil B  Server über den echten zusammenfuehren (Prüfmodus „vorlaeufig“ nur
           im Test): Rechte (W3), Sicht (W9), Ausnahmeweg, Verdrängung/
           Anheften-Grenze (W2, W7, W8).
   Teil C  echte Handler PUT und Teilweg: veralteter Stand → 409, Platte
           unverändert (W12); SV 403.
   Teil D  Oberfläche (posten-wechsel.js).
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  pruefePostenPlan, postenZusammen, postenLage, postenBefunde, postenAbschnitte, postenIdsVon, postenZeitraeume, dienstFenster,
  postenBesetzung, wechselSetzen, wechselEntfernen, einteilungSetzen, postenEntfernen, postenWechselZusammen, POSTEN_GRENZEN,
} from "../server/lib/modul-posten.mjs";
import { objektberichtDaten } from "../server/lib/modul-objektbericht.mjs";
import { darfEintragen } from "../server/lib/modul-wege.mjs";
import { BRANCHENMODULE, modulVon } from "../server/lib/branchenmodule.mjs";
import { pruefeRegel } from "../server/lib/regelbaukasten.mjs";
import { bestandFuerRolle, zusammenfuehren } from "../server/lib/rechte.mjs";
import { branchenbestand, schreibeAls as schreibeAlsEcht, SITZUNGEN } from "./hilfen/branchenbetrieb.mjs";
import { PostenWechsel, wechselZeilen } from "../src/module/posten-wechsel.js";
import { PostenErgaenzung } from "../src/module/posten-pflege.js";
import { modulKontext } from "../src/module/zugriff.js";
import { sperrtBefund } from "../server/lib/bestaetigungen.mjs";

const AKTIV = BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x));
const schreibeAls = (g, r, aendern) => schreibeAlsEcht(g, r, aendern, { liste: AKTIV });
const kopie = (x) => JSON.parse(JSON.stringify(x));
// zeit-ok: Der Server prüft Tage gegen die echte Uhr (±2 Jahre); Testtage relativ zu heute bzw. fest im Fenster.
const T = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const F = { id: "F", name: "Früh", start: "06:00", ende: "14:00" };
const N = { id: "N", name: "Nacht", start: "22:00", ende: "06:00" };
const OBJEKTE = [
  { id: "o1", name: "Objekt Nord", posten: [{ id: "pf", name: "Pforte", soll: { F: 1, N: 1 }, qualifikationen: ["q34a"], alleinarbeit: true },
    { id: "st", name: "Streife", soll: { F: 1, N: 1 }, qualifikationen: [] }] },
  { id: "o2", name: "Objekt Süd", posten: [{ id: "tor", name: "Tor", soll: { F: 1 }, qualifikationen: [] }] }];
const BEKANNT = new Set(["pf", "st", "tor"]);
const W = (...xs) => xs.map((x, i) => (i === 0 ? { posten: x } : { ab: x[0], posten: x[1] }));
const betrieb = (plan = {}) => ({ objekte: kopie(OBJEKTE), dienstarten: [F, N], postenPlan: plan,
  qualifikationen: [{ id: "q34a", name: "Sachkunde" }], pakete: ["sicherheit"], einstellungen: { branchenmodule: { posten: { an: true } } } });
const p = (id, quals = []) => ({ id, vorname: "V", nachname: id, qualifikationen: quals });

describe("Teil A — Form (W1, W4, W13)", () => {
  it("gültig: Kennung (Bestand) und Wechsel mit zwei bis acht Abschnitten, auch über Mitternacht", () => {
    expect(pruefePostenPlan({ [`a|${T}`]: "pf" }, undefined, BEKANNT)).toBeNull();
    expect(pruefePostenPlan({ [`a|${T}`]: W("pf", ["10:00", "st"]) }, undefined, BEKANNT)).toBeNull();
    expect(pruefePostenPlan({ [`a|${T}`]: W("pf", ["23:00", "st"], ["01:00", "pf"], ["03:00", "tor"]) }, undefined, BEKANNT)).toBeNull();
    const acht = W("pf", ...Array.from({ length: 7 }, (_, i) => [`0${i + 1}:00`, i % 2 === 0 ? "st" : "pf"]));
    expect(acht).toHaveLength(POSTEN_GRENZEN.abschnitte);
    expect(pruefePostenPlan({ [`a|${T}`]: acht }, undefined, BEKANNT)).toBeNull();
  });
  it("abgewiesen: ein Abschnitt, mehr als acht, falsche Felder, Uhrzeit, gleicher Folgeposten, Reihenfolge, doppelte Zeit, unbekannter Posten", () => {
    const k = `a|${T}`;
    for (const [was, w] of [
      ["ein Abschnitt", [{ posten: "pf" }]],
      ["leer", []],
      ["neun", W("pf", ...Array.from({ length: 8 }, (_, i) => [`0${i + 1}:00`, i % 2 === 0 ? "st" : "pf"]))],
      ["erster mit ab", [{ ab: "06:00", posten: "pf" }, { ab: "10:00", posten: "st" }]],
      ["weiterer ohne ab", [{ posten: "pf" }, { posten: "st" }]],
      ["Zusatzfeld", [{ posten: "pf" }, { ab: "10:00", posten: "st", name: "x" }]],
      ["Uhrzeit", W("pf", ["25:00", "st"])],
      ["Uhrzeit ohne Null", W("pf", ["9:00", "st"])],
      ["gleicher Folgeposten", W("pf", ["10:00", "pf"])],
      ["doppelte Zeit", W("pf", ["10:00", "st"], ["10:00", "pf"])],
      ["Reihenfolge (relativ zum ersten Wechsel über 24 h)", W("pf", ["10:00", "st"], ["11:00", "pf"], ["10:30", "st"])],
      ["kein Datensatz", ["pf", "st"]],
      ["Kennung zu lang", W("pf", ["10:00", "x".repeat(61)])],
      ["unbekannter Posten im Wechsel", W("pf", ["10:00", "zz"])],
      ["unbekannter Anfangsposten", W("zz", ["10:00", "pf"])],
    ]) expect(pruefePostenPlan({ [k]: w }, undefined, BEKANNT), was).toBeTruthy();
  });
  it("Altbestand nach Wert: ein unveränderter Wechsel (neue Kopie) blockiert nicht, ein geänderter wird streng geprüft", () => {
    const alt = { [`a|${T}`]: W("pf", ["10:00", "weg"]) };
    expect(pruefePostenPlan(kopie(alt), alt, BEKANNT)).toBeNull();
    expect(pruefePostenPlan({ [`a|${T}`]: W("pf", ["11:00", "weg"]) }, alt, BEKANNT)).toMatch(/weg/);
  });
  it("Abschnitte und Kennungen: Kennung, Liste, unlesbar (null bzw. keine Kennung)", () => {
    expect(postenAbschnitte("pf")).toEqual([{ posten: "pf", ab: null }]);
    expect(postenAbschnitte(W("pf", ["10:00", "st"]))).toEqual([{ posten: "pf", ab: null }, { posten: "st", ab: "10:00" }]);
    for (const x of [null, 5, {}, [{ posten: "pf" }], W("pf", ["10:00", "pf"]), ""]) expect(postenAbschnitte(x), JSON.stringify(x)).toBeNull();
    expect(postenIdsVon(W("pf", ["10:00", "st"], ["12:00", "pf"]))).toEqual(["pf", "st"]);
    expect(postenIdsVon({ kaputt: 1 })).toEqual([]);
  });
  it("verwaiste Einteilung: ein Posten, der nur in einem Wechsel vorkommt, kann nicht entfernt werden (Server und Pflege)", () => {
    const alt = betrieb({ [`a|${T}`]: W("pf", ["10:00", "tor"]) });
    const neu = { ...kopie(alt), objekte: kopie(OBJEKTE).slice(0, 1) };
    expect(postenZusammen(neu, alt).grund).toMatch(/entfernter Posten/);
    expect(postenEntfernen(alt, "tor")).toMatchObject({ grund: expect.stringMatching(/Einteilung/) });
  });
});

describe("Teil A — Zeiträume gegen den Dienst (W5)", () => {
  it("Früh- und Nachtdienst; Wechsel über Mitternacht", () => {
    expect(postenZeitraeume(W("pf", ["10:00", "st"]), F)).toEqual([{ posten: "pf", von: 0, bis: 240 }, { posten: "st", von: 240, bis: 480 }]);
    expect(postenZeitraeume(W("pf", ["23:30", "st"], ["02:00", "pf"]), N)).toEqual([
      { posten: "pf", von: 0, bis: 90 }, { posten: "st", von: 90, bis: 240 }, { posten: "pf", von: 240, bis: 480 }]);
    expect(postenZeitraeume("pf", F)).toEqual([{ posten: "pf", von: 0, bis: 480 }]);
  });
  it("nicht bewertbar: Zeitpunkt außerhalb, genau Beginn oder Ende, Reihenfolge im Dienst falsch, ohne Dienstzeiten, unlesbar", () => {
    for (const [was, w, d] of [
      ["außerhalb", W("pf", ["15:00", "st"]), F], ["genau Beginn", W("pf", ["06:00", "st"]), F], ["genau Ende", W("pf", ["14:00", "st"]), F],
      ["Reihenfolge im Nachtdienst", W("pf", ["01:00", "st"], ["23:00", "pf"]), N], ["ohne Zeiten", W("pf", ["10:00", "st"]), { id: "X" }],
      ["unlesbar", { x: 1 }, F]]) expect(postenZeitraeume(w, d), was).toBeNull();
    expect(postenZeitraeume("pf", { id: "X" }), "Kennung ohne Dienstzeiten bleibt bewertbar wie bisher").toEqual([{ posten: "pf", von: 0, bis: 1 }]);
  });
  it("Fenster: Ende vor Beginn heißt über Mitternacht; geteilter Dienst bis zum Ende des zweiten Abschnitts", () => {
    expect(dienstFenster(N)).toEqual({ start: 1320, dauer: 480 });
    expect(dienstFenster({ start: "08:00", ende: "12:00", zweiterAbschnitt: { start: "16:00", ende: "20:00" } })).toEqual({ start: 480, dauer: 720 });
    expect(dienstFenster({ start: "8:00", ende: "12:00" })).toBeNull();
  });
});

describe("Teil A — Zählung zeitanteilig ohne Doppelzählung (W6)", () => {
  it("Ablauf „Sicherheitsmitarbeiter wechselt Posten“: 06–10 Pforte, ab 10 Streife; Gegenstück umgekehrt → beide Posten durchgehend einfach besetzt", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]), [`b|${T}`]: W("st", ["10:00", "pf"]) });
    const l = postenLage(m, T, "F", [p("a"), p("b")]);
    const pf = l.find((x) => x.posten === "pf"), st = l.find((x) => x.posten === "st");
    expect(pf).toMatchObject({ soll: 1, ist: ["a"], fehlt: 0, istGesamt: ["a", "b"] });
    expect(st).toMatchObject({ soll: 1, ist: ["b"], fehlt: 0 });
    expect(pf.abschnitte).toEqual([{ person: "a", von: "06:00", bis: "10:00" }, { person: "b", von: "10:00", bis: "14:00" }]);
  });
  it("keine Doppelzählung: wer wechselt, fehlt dem alten Posten ab dem Wechsel", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]) });
    const l = postenLage(m, T, "F", [p("a")]);
    expect(l.find((x) => x.posten === "pf")).toMatchObject({ ist: [], fehlt: 1, istGesamt: ["a"] });
    expect(l.find((x) => x.posten === "st")).toMatchObject({ ist: [], fehlt: 1 });
  });
  it("nicht bewertbar zählt auf keinem Posten und steht sichtbar am Posten", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["15:00", "st"]), [`b|${T}`]: "pf" });
    const l = postenLage(m, T, "F", [p("a"), p("b")]);
    expect(l.find((x) => x.posten === "pf")).toMatchObject({ ist: ["b"], fehlt: 0, nichtBewertbar: ["a"] });
    expect(l.find((x) => x.posten === "st")).toMatchObject({ ist: [], fehlt: 1, nichtBewertbar: ["a"] });
    expect(l.find((x) => x.posten === "tor").nichtBewertbar).toBeUndefined();
  });
  it("Alleinarbeit: Hinweis, sobald zu einem Zeitpunkt genau eine Person auf dem Posten ist", () => {
    const m = betrieb({ [`a|${T}`]: "pf", [`b|${T}`]: W("pf", ["12:00", "st"]) });
    expect(postenLage(m, T, "F", [p("a"), p("b")]).find((x) => x.posten === "pf").alleinarbeitHinweis).toMatch(/Alleinarbeit/);
    const zwei = betrieb({ [`a|${T}`]: "pf", [`b|${T}`]: "pf" });
    expect(postenLage(zwei, T, "F", [p("a"), p("b")]).find((x) => x.posten === "pf").alleinarbeitHinweis).toBeNull();
  });
  it("Alleinarbeit (Review #604): knappster Zeitpunkt 0 Personen, zu anderem Zeitpunkt genau 1 → Hinweis; durchgehend 2 → keiner", () => {
    const null1 = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]) });
    const l = postenLage(null1, T, "F", [p("a")]).find((x) => x.posten === "pf");
    expect(l.ist).toEqual([]);
    expect(l.alleinarbeitHinweis).toMatch(/Alleinarbeit/);
    /* knappster Zeitpunkt 2, nie genau 1 (zwei durchgehend, eine dritte nur bis 10 Uhr) → kein Hinweis */
    const drei = betrieb({ [`a|${T}`]: "pf", [`b|${T}`]: "pf", [`c|${T}`]: W("pf", ["10:00", "st"]) });
    const l2 = postenLage(drei, T, "F", [p("a"), p("b"), p("c")]).find((x) => x.posten === "pf");
    expect(l2.ist).toEqual(["a", "b"]);
    expect(l2.alleinarbeitHinweis).toBeNull();
  });

  it("Zufallsvergleich gegen eine naive Minutenreferenz (fester Startwert, begrenzte Durchläufe)", () => {
    let s = 0x5eed;
    const zufall = (n) => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
    const POSTEN = ["pf", "st", "tor"];
    const DIENSTE = [F, N, { id: "L", start: "07:30", ende: "07:30" }, { id: "K", start: "09:15", ende: "09:45" }];
    const hhmm = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    let geprueft = 0;
    for (let lauf = 0; lauf < 250; lauf += 1) {
      const d = DIENSTE[zufall(DIENSTE.length)];
      const f = /** @type {any} */ (dienstFenster(d));
      const soll = Object.fromEntries(POSTEN.map((x) => [x, 1 + zufall(3)]));
      const objekte = [{ id: "o", name: "O", posten: POSTEN.map((x) => ({ id: x, name: x, soll: { [d.id]: soll[x] } })) }];
      const plan = {}, personen = [];
      const anzahl = 1 + zufall(6);
      for (let i = 0; i < anzahl; i += 1) {
        const id = `p${i}`;
        personen.push({ id });
        const k = zufall(4);
        if (k === 0 || f.dauer < 3) { plan[`${id}|${T}`] = POSTEN[zufall(3)]; continue; }
        const offs = new Set();
        for (let v = 0; v < 20 && offs.size < k; v += 1) offs.add(1 + zufall(f.dauer - 1));
        const sortiert = [...offs].sort((a, b) => a - b);
        let vor = POSTEN[zufall(3)];
        const w = [{ posten: vor }];
        for (const o of sortiert) { const n = POSTEN.filter((x) => x !== vor)[zufall(2)]; w.push({ ab: hhmm(f.start + o), posten: n }); vor = n; }
        plan[`${id}|${T}`] = w.length > 1 ? w : w[0].posten;
      }
      expect(pruefePostenPlan(plan, undefined, new Set(POSTEN)), JSON.stringify(plan)).toBeNull();
      const m = { objekte, dienstarten: [d], postenPlan: plan };
      /* naive Referenz: je Minute je Person der gültige Posten */
      const naiv = Object.fromEntries(POSTEN.map((x) => [x, { min: Infinity, wo: -1, einzeln: false }]));
      for (let t = 0; t < f.dauer; t += 1) {
        const zahl = Object.fromEntries(POSTEN.map((x) => [x, 0]));
        for (const pe of personen) {
          const w = plan[`${pe.id}|${T}`];
          let akt = typeof w === "string" ? w : w[0].posten;
          if (Array.isArray(w)) for (const a of w.slice(1)) if (((Number(a.ab.slice(0, 2)) * 60 + Number(a.ab.slice(3)) - f.start + 1440) % 1440) <= t) akt = a.posten;
          zahl[akt] += 1;
        }
        for (const x of POSTEN) {
          if (zahl[x] < naiv[x].min) { naiv[x].min = zahl[x]; naiv[x].wo = t; }
          if (zahl[x] === 1) naiv[x].einzeln = true;
        }
      }
      const l = postenLage(m, T, d.id, personen);
      const b = postenBesetzung(m, T, d.id, personen).nachPosten;
      for (const x of POSTEN) {
        const e = /** @type {any} */ (l.find((y) => y.posten === x));
        expect(e.ist.length, `${lauf} ${x}`).toBe(naiv[x].min);
        expect(e.fehlt, `${lauf} ${x}`).toBe(Math.max(0, soll[x] - naiv[x].min));
        expect(!!(b.get(x) && b.get(x).einzeln), `${lauf} ${x} einzeln`).toBe(naiv[x].einzeln);
      }
      geprueft += 1;
    }
    expect(geprueft).toBe(250);
  });
});

describe("Teil A — Befunde, Objektbericht, Wachbuch", () => {
  const opts = { auswerten: pruefeRegel, module: AKTIV, qualGueltig: (_m, pe, q) => (pe.qualifikationen || []).includes(q), heute: T };
  it("Befunde: Qualifikation für jeden Posten mit Abschnitt; Unterbesetzung zum knappsten Zeitpunkt", () => {
    const m = betrieb({ [`a|${T}`]: W("st", ["10:00", "pf"]) });
    const b = postenBefunde(m, { id: "F" }, T, p("a"), [p("a")], opts);
    expect(b.filter((x) => x.regelId === "POSTEN-QUAL-01")).toHaveLength(1);
    expect(b.filter((x) => x.regelId === "POSTEN-BESETZUNG-01").map((x) => x.text)).toEqual([
      expect.stringMatching(/Streife.*0 von 1 besetzt \(knappster Zeitpunkt\)/), expect.stringMatching(/Pforte.*0 von 1 besetzt/)]);
    const voll = betrieb({ [`a|${T}`]: W("st", ["10:00", "pf"]), [`b|${T}`]: W("pf", ["10:00", "st"]) });
    const b2 = postenBefunde(voll, { id: "F" }, T, p("a", ["q34a"]), [p("a", ["q34a"]), p("b", ["q34a"])], opts);
    expect(b2).toEqual([]);
  });
  it("Befunde: nicht bewertbarer Wechsel → offener Hinweis je Posten, nie still", () => {
    const m = betrieb({ [`a|${T}`]: W("st", ["16:00", "pf"]) });
    const b = postenBefunde(m, { id: "F" }, T, p("a"), [p("a")], opts);
    expect(b).toHaveLength(2);
    for (const x of b) expect(x).toMatchObject({ regelId: "POSTEN-BESETZUNG-01", stufe: "hinweis", text: expect.stringMatching(/nicht bewertbar/) });
  });
  it("Objektbericht: zeitanteilig, keine Doppelzählung; nicht bewertbar → „ungeklärt“", () => {
    const m = { ...betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]), [`b|${T}`]: W("st", ["10:00", "pf"]) }), dienstarten: [F] };
    const r = /** @type {any} */ (objektberichtDaten(m, { objektId: "o1", von: T, bis: T, zugriff: "voll", dienstzeit: () => ["a", "b"] }));
    expect(r.tage[0].zeilen.map((z) => [z.posten, z.ist, z.fehlt, z.status])).toEqual([["pf", 1, 0, "ok"], ["st", 1, 0, "ok"]]);
    const halb = { ...m, postenPlan: { [`a|${T}`]: W("pf", ["10:00", "st"]) } };
    const r2 = /** @type {any} */ (objektberichtDaten(halb, { objektId: "o1", von: T, bis: T, zugriff: "voll", dienstzeit: () => ["a"] }));
    expect(r2.tage[0].zeilen.map((z) => [z.posten, z.ist, z.fehlt])).toEqual([["pf", 0, 1], ["st", 0, 1]]);
    const kaputt = { ...m, postenPlan: { [`a|${T}`]: W("pf", ["20:00", "st"]) } };
    const r3 = /** @type {any} */ (objektberichtDaten(kaputt, { objektId: "o1", von: T, bis: T, zugriff: "voll", dienstzeit: () => ["a"] }));
    expect(r3.tage[0].zeilen.map((z) => [z.posten, z.ist, z.status])).toEqual([["pf", null, "ungeklärt"], ["st", null, "ungeklärt"]]);
  });
  it("Wachbuch (W10): einer der Abschnitte auf einem Posten des Objekts genügt; unlesbar → nein", () => {
    const d = darfEintragen(betrieb({ [`a|${T}`]: W("pf", ["10:00", "tor"]), [`b|${T}`]: { x: 1 } }));
    expect(d("o1", T, "a")).toBe(true);
    expect(d("o2", T, "a")).toBe(true);
    expect(d("o1", T, "b")).toBe(false);
    expect(d("o1", T, "c")).toBe(false);
  });
});

describe("Teil A — Pflegefunktionen der Oberfläche", () => {
  it("Wechsel setzen: in Dienstreihenfolge (auch über Mitternacht), gleiche Uhrzeit ersetzt, Eingabe bleibt unverändert", () => {
    const m = betrieb({ [`a|${T}`]: "pf" });
    const vorher = kopie(m);
    const r1 = /** @type {any} */ (wechselSetzen(m, "a", T, "02:00", "st", N));
    expect(r1.plan[`a|${T}`]).toEqual(W("pf", ["02:00", "st"]));
    const r2 = /** @type {any} */ (wechselSetzen({ ...m, postenPlan: r1.plan }, "a", T, "23:00", "tor", N));
    expect(r2.plan[`a|${T}`]).toEqual(W("pf", ["23:00", "tor"], ["02:00", "st"]));
    const r3 = /** @type {any} */ (wechselSetzen({ ...m, postenPlan: r2.plan }, "a", T, "02:00", "pf", N));
    expect(r3.plan[`a|${T}`]).toEqual(W("pf", ["23:00", "tor"], ["02:00", "pf"]));
    expect(m).toEqual(vorher);
  });
  it("Wechsel setzen abgewiesen: ohne Anfangsposten, außerhalb des Dienstes, ohne Dienstzeiten, gleicher Posten, unbekannter Posten", () => {
    const m = betrieb({ [`a|${T}`]: "pf" });
    expect(wechselSetzen(m, "b", T, "10:00", "st", F)).toMatchObject({ grund: expect.stringMatching(/Anfangsposten/) });
    expect(wechselSetzen(m, "a", T, "15:00", "st", F)).toMatchObject({ grund: expect.stringMatching(/nicht innerhalb/) });
    expect(wechselSetzen(m, "a", T, "06:00", "st", F)).toMatchObject({ grund: expect.stringMatching(/nicht innerhalb/) });
    expect(wechselSetzen(m, "a", T, "10:00", "st", { id: "X" })).toMatchObject({ grund: expect.stringMatching(/nicht bekannt/) });
    expect(wechselSetzen(m, "a", T, "10:00", "pf", F)).toMatchObject({ grund: expect.stringMatching(/anderen Posten/) });
    expect(wechselSetzen(m, "a", T, "10:00", "zz", F)).toMatchObject({ grund: expect.stringMatching(/zz/) });
    expect(wechselSetzen(m, "a", T, "10", "st", F)).toMatchObject({ grund: expect.stringMatching(/HH:MM/) });
  });
  it("Wechsel entfernen: Nachbarn gleichen Postens zusammengefasst, ein Abschnitt wird wieder Kennung", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"], ["12:00", "pf"]) });
    expect(/** @type {any} */ (wechselEntfernen(m, "a", T, "10:00")).plan[`a|${T}`]).toBe("pf");
    expect(/** @type {any} */ (wechselEntfernen(m, "a", T, "12:00")).plan[`a|${T}`]).toEqual(W("pf", ["10:00", "st"]));
    expect(wechselEntfernen(m, "a", T, "11:00")).toMatchObject({ grund: expect.stringMatching(/gibt es nicht/) });
  });
  it("Auswahl des Anfangspostens behält die Wechsel; „kein Posten“ löst die ganze Einteilung", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]) });
    expect(/** @type {any} */ (einteilungSetzen(m, "a", T, "tor")).plan[`a|${T}`]).toEqual(W("tor", ["10:00", "st"]));
    expect(einteilungSetzen(m, "a", T, "st")).toMatchObject({ grund: expect.stringMatching(/anderen Posten/) });
    expect(/** @type {any} */ (einteilungSetzen(m, "a", T, "")).plan).toEqual({});
  });
});

describe("Teil B — Server (W2, W3, W7–W9)", () => {
  const gesamt = (plan = {}) => {
    const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: { an: true } } });
    g.mandanten[0].objekte = kopie(OBJEKTE);
    g.mandanten[0].postenPlan = plan;
    return g;
  };
  const WECHSEL = W("pf", ["10:00", "st"]);
  it("Leitung und Planung legen einen Postenwechsel an und ändern ihn; Abweichungen (Dienst) bleiben unberührt (W2)", () => {
    for (const r of ["LT", "PL"]) {
      const g = gesamt();
      const vorher = kopie(g.mandanten[0].abweichungen);
      const ok = schreibeAls(g, r, (m) => { m.postenPlan = { [`a1|${T}`]: WECHSEL }; });
      expect(ok.verweigert, r).toBeUndefined();
      expect(ok.mandanten[0].postenPlan[`a1|${T}`], r).toEqual(WECHSEL);
      expect(ok.mandanten[0].abweichungen, r).toEqual(vorher);
      const g2 = { ...ok };
      const neu = schreibeAls(g2, r, (m) => { m.postenPlan = { [`a1|${T}`]: W("pf", ["11:00", "st"]) }; });
      expect(neu.mandanten[0].postenPlan[`a1|${T}`], r).toEqual(W("pf", ["11:00", "st"]));
    }
  });
  it("Kundenrolle und Demo-Sitzung legen keinen Postenwechsel an (konservativ); die Kundenrolle behält die bisherigen Rechte", () => {
    expect(schreibeAls(gesamt(), "KD", (m) => { m.postenPlan = { [`a1|${T}`]: WECHSEL }; }).verweigert).toMatch(/nur Leitung und Planung/);
    const g = gesamt({ [`a1|${T}`]: WECHSEL });
    const unveraendert = schreibeAls(g, "KD", (m) => { m.postenPlan = { ...m.postenPlan, [`k1|${T}`]: "tor" }; });
    expect(unveraendert.verweigert).toBeUndefined();
    expect(unveraendert.mandanten[0].postenPlan[`a1|${T}`]).toEqual(WECHSEL);
    const einzeln = schreibeAls(g, "KD", (m) => { m.postenPlan = { [`a1|${T}`]: "st" }; });
    expect(einzeln.verweigert).toBeUndefined();
    expect(einzeln.mandanten[0].postenPlan[`a1|${T}`]).toBe("st");
    const s = kopie(bestandFuerRolle(gesamt(), SITZUNGEN.LT));
    s.mandanten[0].postenPlan = { [`a1|${T}`]: WECHSEL };
    const demo = zusammenfuehren(gesamt(), s, { ...SITZUNGEN.LT, demo: true }, { liste: AKTIV });
    expect(demo && demo.verweigert).toMatch(/nur Leitung und Planung/);
    expect(postenWechselZusammen({ postenPlan: { k: WECHSEL } }, {}, null).grund).toBeTruthy();
    expect(postenWechselZusammen({ postenPlan: { k: WECHSEL } }, {}, { rolle: "unbekannt" }).grund).toBeTruthy();
    expect(postenWechselZusammen({ postenPlan: { k: WECHSEL } }, {}, { rolle: "subplaner", person: "s1" }).grund).toMatch(/nur Leitung und Planung/);
    expect(postenWechselZusammen({ postenPlan: { k: WECHSEL } }, { postenPlan: { k: kopie(WECHSEL) } }, { rolle: "subplaner" }).grund).toBeUndefined();
  });
  it("Review #604: Kundenrolle und Demo ändern eine BESTEHENDE Liste (gleicher Schlüssel, andere Zeit) nicht", () => {
    const g = gesamt({ [`a1|${T}`]: WECHSEL });
    const kd = schreibeAls(g, "KD", (m) => { m.postenPlan = { [`a1|${T}`]: W("pf", ["11:00", "st"]) }; });
    expect(kd.verweigert).toMatch(/nur Leitung und Planung/);
    const s = kopie(bestandFuerRolle(g, SITZUNGEN.LT));
    s.mandanten[0].postenPlan = { [`a1|${T}`]: W("pf", ["11:00", "st"]) };
    const demo = zusammenfuehren(g, s, { ...SITZUNGEN.LT, demo: true }, { liste: AKTIV });
    expect(demo && demo.verweigert).toMatch(/nur Leitung und Planung/);
    expect(g.mandanten[0].postenPlan[`a1|${T}`]).toEqual(WECHSEL);
    expect(postenWechselZusammen({ postenPlan: { k: W("pf", ["11:00", "st"]) } }, { postenPlan: { k: WECHSEL } }, { rolle: "kunde" }).grund).toBeTruthy();
  });
  it("SV-Schreibweg bleibt geschlossen; Beschäftigte und Betriebsrat schreiben nichts", () => {
    for (const r of ["SV", "MA", "BR"]) {
      const v = schreibeAls(gesamt(), r, (m) => { m.postenPlan = { [`a1|${T}`]: WECHSEL }; });
      const gespeichert = v && !v.verweigert ? (v.mandanten[0].postenPlan || {}) : {};
      expect(gespeichert[`a1|${T}`], r).toBeUndefined();
    }
  });
  it("Modul „geplant“ (echte Registry): auch die Leitung legt keinen Wechsel an", () => {
    const v = schreibeAlsEcht(gesamt(), "LT", (m) => { m.postenPlan = { [`a1|${T}`]: WECHSEL }; });
    expect(v && v.verweigert).toMatch(/wirkt in diesem Betrieb nicht/);
  });
  it("Sicht (W9): Beschäftigte sehen den eigenen Wechsel und die Objekte aller Abschnitte; Betriebsrat nichts", () => {
    const g = gesamt({ [`a1|${T}`]: W("pf", ["10:00", "tor"]), [`x9|${T}`]: "st" });
    const ma = bestandFuerRolle(g, SITZUNGEN.MA).mandanten[0];
    expect(ma.postenPlan).toEqual({ [`a1|${T}`]: W("pf", ["10:00", "tor"]) });
    expect(ma.objekte.map((o) => o.id)).toEqual(["o1", "o2"]);
    const sv = bestandFuerRolle(g, SITZUNGEN.SV).mandanten[0];
    expect(Object.keys(sv.postenPlan)).toEqual([`a1|${T}`]);
    expect(sv.objekte.map((o) => o.id)).toEqual(["o1", "o2"]);
    const br = bestandFuerRolle(g, SITZUNGEN.BR).mandanten[0];
    expect(br.postenPlan || {}).toEqual({});
    expect(br.objekte || []).toEqual([]);
  });
  it("Ausnahmeweg Art. 16: Berichtigung nur auf eine Einzelkennung (Wertschema unverändert)", () => {
    const schema = /** @type {any} */ (modulVon("posten")).berichtigungsWerte.postenPlan;
    expect(schema("pf", { objekte: OBJEKTE })).toBe(true);
    expect(schema(WECHSEL, { objekte: OBJEKTE })).toBe(false);
  });
  it("Planer schreibt den Postenplan nie; Fachprüfung/Einsatz lesen ihn nur indirekt (branchenBefunde → postenBefunde) als Hinweis, der nie sperrt (W2, W7, W8)", async () => {
    const wurzel = fileURLToPath(new URL("../server/lib", import.meta.url));
    const dateien = [...(await readdir(path.join(wurzel, "engine"))).filter((x) => x.endsWith(".mjs")).map((x) => path.join(wurzel, "engine", x)),
      path.join(wurzel, "fachpruefung.mjs"), path.join(wurzel, "zeiterfassung.mjs")];
    /* kein direkter Zugriff, also auch kein Schreiben: das Feld kommt in Planer, Fachprüfung und Zeiterfassung nicht vor */
    for (const d of dateien) expect(await readFile(d, "utf8"), d).not.toMatch(/postenPlan/);
    /* der einzige Leseweg: Fachprüfung → branchenBefunde → postenBefunde (Befundart „branche“) */
    expect(await readFile(path.join(wurzel, "fachpruefung.mjs"), "utf8")).toMatch(/branchenBefunde\(/);
    /* … und dessen Befunde sperren nie, auch nicht bei nicht bewertbarem Wechsel, Unterbesetzung oder fehlender Qualifikation */
    const opts = { auswerten: pruefeRegel, module: AKTIV, qualGueltig: () => false, heute: T };
    const faelle = [W("st", ["10:00", "pf"]), W("st", ["16:00", "pf"]), "pf", { kaputt: 1 }];
    let befunde = 0;
    for (const w of faelle) for (const b of postenBefunde(betrieb({ [`a|${T}`]: w }), { id: "F" }, T, p("a"), [p("a")], opts)) {
      befunde += 1;
      expect(b.regel, JSON.stringify(w)).toBe("branche");
      expect(sperrtBefund(b.regel), JSON.stringify(w)).toBe(false);
    }
    expect(befunde).toBeGreaterThan(3);
  });
});

/* ---- Teil C: echte Handler ---- */
const WIRT = "127.0.0.1:3000";
let wurzelC, S, nr = 0, raumNr = 0;
async function server() {
  vi.resetModules();
  vi.doMock("../server/lib/branchenmodule.mjs", async (echt) => {
    const e = /** @type {any} */ (await echt());
    return { ...e, BRANCHENMODULE: Object.freeze(e.BRANCHENMODULE.map((x) => (x.id === "posten" ? { ...x, status: "vorlaeufig" } : x))) };
  });
  const schutz = await import("../server/lib/schutz.mjs");
  for (const art of Object.keys(schutz.GRENZEN)) schutz.GRENZEN[art] = { ...schutz.GRENZEN[art], versuche: 1000000 };
  const { getStore } = await import("../server/lib/ablage.mjs");
  return { laden: () => getStore({ name: "centric", consistency: "strong" }), daten: (await import("../server/funktionen/daten.mjs")).default,
    B: await import("../server/lib/bestand.mjs"), G: await import("../server/lib/gestalt.mjs"), sitzungAnlegen: (await import("../server/lib/sitzungen.mjs")).sitzungAnlegen };
}
async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  nr += 1;
  const kopf = { host: WIRT, origin: `http://${WIRT}`, "x-forwarded-for": `10.79.${Math.floor(nr / 250) % 250}.${nr % 250}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await S.daten(new Request(`http://${WIRT}${pfad}`, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const ROLLEN = { SV: { rolle: "subplaner", person: "s1", einheit: "e1" }, LT: { rolle: "leitung", person: "l1" } };
async function raum() {
  const name = `wp191w-${++raumNr}`;
  const g = branchenbestand({ pakete: ["sicherheit"], branchenmodule: { posten: { an: true } } });
  g.mandanten[0].objekte = kopie(OBJEKTE);
  g.mandanten[0].postenPlan = { [`a1|${T}`]: "pf" };
  g.version = 9;
  g.mandanten[0].status = "aktiv";
  await S.B.bestandSchreiben(S.laden(), name, S.G.personenAngleichen(g), { durch: "Pruefung" });
  const token = async (k) => (await S.sitzungAnlegen({ bestand: name, name: `V N${ROLLEN[k].person}`, rolle: ROLLEN[k].rolle, person: ROLLEN[k].person,
    betrieb: 0, mandantId: "m1", einheit: ROLLEN[k].einheit || null }, 2 * 3600 * 1000)).token;
  return { name, sv: await token("SV"), lt: await token("LT") };
}
const gespeichert = async (name) => (await S.B.bestandLesenStreng(S.laden(), name)).bestand.mandanten[0];
/** Liest, ändert den Postenplan und schreibt über PUT („voll“) oder den Teilweg („teil“); `alt` = ein früher gelesener Stand. */
async function schreibt(token, weg, plan, alt) {
  const g = alt || await anfrage("/api/bestand", { token });
  if (weg === "voll") {
    const b = kopie(g.bestand);
    b.mandanten.find((x) => x && x.id === "m1").postenPlan = plan;
    return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: g.etag, durch: "Pruefung" } });
  }
  return anfrage("/api/bestand/teile", { methode: "POST", token, rumpf: { format: 1, epoche: g.teile.epoche, durch: "Pruefung",
    kern: { postenPlan: { basis: g.teile.versionen["kern:postenPlan"] ?? null, wert: plan } } } });
}

describe("Teil C — echte Handler PUT und Teilweg (W3, W12)", { timeout: 300000 }, () => {
  beforeAll(async () => {
    wurzelC = await mkdtemp(path.join(tmpdir(), "centric-wp191w-"));
    process.env.CENTRIC_DATEN = wurzelC;
    process.env.CENTRIC_ABLAGE = "dateien";
    process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
    process.env.CENTRIC_TEILSPEICHERUNG = "true";
    S = await server();
  }, 120000);
  afterAll(async () => {
    delete process.env.CENTRIC_TEILSPEICHERUNG;
    vi.doUnmock("../server/lib/branchenmodule.mjs");
    vi.resetModules();
    if (wurzelC) await rm(wurzelC, { recursive: true, force: true });
  });
  for (const weg of ["voll", "teil"]) {
    it(`${weg}: Leitung speichert den Wechsel; zweites Schreiben vom veralteten Stand → 409, Platte unverändert`, async () => {
      const r = await raum();
      const alt = await anfrage("/api/bestand", { token: r.lt });
      const w1 = await schreibt(r.lt, weg, { [`a1|${T}`]: W("pf", ["10:00", "st"]) });
      expect(w1.status, JSON.stringify(w1).slice(0, 300)).toBe(200);
      expect((await gespeichert(r.name)).postenPlan[`a1|${T}`]).toEqual(W("pf", ["10:00", "st"]));
      const w2 = await schreibt(r.lt, weg, { [`a1|${T}`]: W("pf", ["11:00", "tor"]) }, alt);
      expect(w2.status, JSON.stringify(w2).slice(0, 300)).toBe(409);
      expect((await gespeichert(r.name)).postenPlan[`a1|${T}`]).toEqual(W("pf", ["10:00", "st"]));
      const w3 = await schreibt(r.lt, weg, { [`a1|${T}`]: W("pf", ["10:00", "st"]) });
      expect(w3.status, "gleicher Wert erneut: angenommen, nichts geändert").toBe(200);
      expect((await gespeichert(r.name)).postenPlan[`a1|${T}`]).toEqual(W("pf", ["10:00", "st"]));
    });
    it(`${weg}: Schichtverantwortung → abgewiesen, Platte unverändert`, async () => {
      const r = await raum();
      const vorher = await gespeichert(r.name);
      const w = await schreibt(r.sv, weg, { [`a1|${T}`]: W("pf", ["10:00", "st"]) });
      expect(w.status).toBe(403);
      expect((await gespeichert(r.name)).postenPlan).toEqual(vorher.postenPlan);
    });
  }
});

describe("Teil D — Oberfläche (posten-wechsel.js)", () => {
  const PERS = [{ id: "a", vorname: "Vera", nachname: "Muster" }, { id: "b", vorname: "Udo", nachname: "Beispiel" }];
  it("ohne Schreibweg: Abschnitte in Worten, nicht bewertbar als Meldung; keine Eingabefelder", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]), [`b|${T}`]: W("pf", ["15:00", "st"]) });
    const html = renderToStaticMarkup(h(PostenWechsel, { m, datum: T, dienstId: "F", personenImDienst: PERS, schreibe: null }));
    expect(html).toContain("Objekt Nord: Pforte von 06:00 bis 10:00 Uhr");
    expect(html).toContain("Objekt Nord: Streife von 10:00 bis 14:00 Uhr");
    expect(html).toMatch(/role="alert"[^>]*>Postenwechsel von Udo Beispiel passt nicht zu den Zeiten des Dienstes — nicht bewertbar/);
    expect(html).not.toMatch(/<input|<select|<button/);
    expect(renderToStaticMarkup(h(PostenWechsel, { m: betrieb({ [`a|${T}`]: "pf" }), datum: T, dienstId: "F", personenImDienst: PERS, schreibe: null }))).toBe("");
  });
  it("mit Schreibweg: je eingeteilter Person Uhrzeit, Posten und Knopf, je Wechsel „entfernen“; beschriftet", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]), [`b|${T}`]: "tor" });
    const html = renderToStaticMarkup(h(PostenWechsel, { m, datum: T, dienstId: "F", personenImDienst: [...PERS, { id: "c", vorname: "C", nachname: "D" }], schreibe: () => {} }));
    expect(html).toContain('aria-label="Wechsel ab (Uhrzeit) für Vera Muster"');
    expect(html).toContain('aria-label="Neuer Posten für Udo Beispiel"');
    expect(html).toContain("Wechsel ab 10:00 Uhr entfernen (Vera Muster)");
    expect(html).not.toContain("für C D");
    expect(html).not.toMatch(/width:\s*\d{3,}px/);
  });
  it("eingehängt in PostenErgaenzung: Schreibweg nur mit Recht (Leitung/Planung), sonst nur Lesen", () => {
    const m = betrieb({ [`a|${T}`]: W("pf", ["10:00", "st"]) });
    const k = (postenSchreiben, postenWechsel = postenSchreiben) => ({ m, datum: T, dienstId: "F", personenImDienst: PERS, postenSchreiben, postenWechsel, akt: { setzeFeld: () => {} } });
    expect(renderToStaticMarkup(h(PostenErgaenzung, { k: k(true) }))).toContain("Wechsel hinzufügen");
    const lesen = renderToStaticMarkup(h(PostenErgaenzung, { k: k(false) }));
    expect(lesen).toContain("Postenwechsel am");
    expect(lesen).not.toContain("Wechsel hinzufügen");
    /* Review #604 C6: Demo-Sitzung — Einteilung wie bisher, Postenwechsel nur lesen (Server 403 bleibt) */
    const demo = renderToStaticMarkup(h(PostenErgaenzung, { k: k(true, false) }));
    expect(demo).toContain("Postenwechsel am");
    expect(demo).not.toContain("Wechsel hinzufügen");
    expect(demo).not.toContain("entfernen (Vera Muster)");
  });
  it("Kontext (Review #604 C6): Postenwechsel nur Leitung/Planung und nie in einer Demo-Sitzung", () => {
    const kx = (rolle, demo) => modulKontext({ sitz: { rolle, demo, person: { id: "p1" }, mandant: {} } });
    expect(kx("leitung", false).postenWechsel).toBe(true);
    expect(kx("planer", undefined).postenWechsel).toBe(true);
    expect(kx("leitung", true).postenWechsel).toBe(false);
    expect(kx("planer", true).postenWechsel).toBe(false);
    for (const r of ["kunde", "subplaner", "mitarbeiter", "betriebsrat", "betreiber", ""]) expect(kx(r, false).postenWechsel, r).toBe(false);
    expect(modulKontext({}).postenWechsel).toBe(false);
  });
  it("wechselZeilen: unlesbar → null", () => {
    expect(wechselZeilen({ x: 1 }, F, new Map())).toBeNull();
  });
});
