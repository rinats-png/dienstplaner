/* ==========================================================================
   WR-3: KONTOWIEDERHERSTELLUNG — FREIGABEMECHANIK (Kern, ohne HTTP)

   Akzeptanz (docs/acc45/work-packages.json, WR-3; Entscheidungen 1 bis 4
   vom 2026-11-09, docs/acc45/KONTO-WIEDERHERSTELLUNG.md Abschnitte E und J):
     - Antrag höchstens 24 h offen (knapp davor gültig, knapp danach nicht)
     - Abschlusstoken 15 min (knapp davor gültig, knapp danach nicht), einmal
     - Freigebende nur Leitung im selben Mandanten (Raum, Mandant, Betrieb)
     - keine Selbstfreigabe (Konto UND Person), Antragsteller ausgeschlossen
     - Einheitszugehörigkeit: zwei Freigebende derselben Einheit nicht unabhängig
     - bisherige Freigaben werden neu geprüft (J.2f), verfallen ggf.
     - Gleichzeitigkeit: rennende Freigaben → genau ein Token; doppeltes
       Einlösen → genau eines
     - Konsistent bei Schreibfehlern (nichts halb), aktiver Faktor bleibt
     - Sicherungsstände: eine zurückgespielte Ablage belebt weder einen
       eingelösten noch einen abgelaufenen Fall (Schlüsselepoche)
     - Uhr zurückgestellt: Fall gilt als abgelaufen (fail-closed)

   Rot auf dem Stand vor WR-3 (origin/integration/release-v4 @ c8c643fd):
   server/lib/kontowiederherstellung.mjs und zweifaktorNachVerlustNeu fehlen.
   ========================================================================== */

import { describe, it, expect, beforeAll, afterEach } from "vitest";

const PFEFFER = "pfeffer-wr-3-kern-0123456789abcdef";
process.env.CENTRIC_PFEFFER = PFEFFER;

let KW, ZF;
beforeAll(async () => {
  ZF = await import("../server/lib/zweifaktor.mjs");
  KW = await import("../server/lib/kontowiederherstellung.mjs");
});
afterEach(() => { ZF.wiederherstellungEpocheQuelle(undefined); });

/** Ablage im Speicher, Schnittstelle wie lib/ablage.mjs; `fehler(op, key)` simuliert Ausfälle. */
function speicher() {
  const m = new Map();
  const s = {
    m,
    /** @type {(op: string, key: string) => boolean} */
    fehler: () => false,
    async get(k) { if (s.fehler("get", k)) throw new Error("EIO"); return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { if (s.fehler("set", k)) throw new Error("EIO"); m.set(k, JSON.stringify(v)); },
    async delete(k) { if (s.fehler("delete", k)) throw new Error("EIO"); m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    abbild() { return new Map(m); },
    zurueckspielen(a) { m.clear(); for (const [k, v] of a) m.set(k, v); },
  };
  return s;
}

const T0 = Date.UTC(2026, 10, 10, 8, 0, 0);
const MIN = 60 * 1000;
const H = 60 * MIN;

const TRAEGER = { id: "traeger-id-1", kennung: "k-traeger", schluessel: "s-traeger", person: "t1", raum: "r1",
  mandantId: "m1", betrieb: 0, rolle: "leitung" };
const leitung = (n, extra = {}) => ({ kennung: `k-l${n}`, schluessel: `s-l${n}`, person: `l${n}`, raum: "r1",
  mandantId: "m1", betrieb: 0, rolle: "leitung", einheiten: [`e${n}`], ...extra });
const immerGueltig = async () => true;
const passt = async () => true;

async function eroeffnet(store, ms = T0, traeger = TRAEGER) {
  const r = await KW.fallEroeffnen(store, { traeger, faktorKennung: "g:gen1:x", ms });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  return r.fall;
}
async function freigegeben(store, ms = T0) {
  const fall = await eroeffnet(store, ms);
  const a = await KW.fallFreigeben(store, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: ms + MIN,
    nochGueltig: immerGueltig, identitaetPassend: passt });
  expect(a).toMatchObject({ ok: true, stand: "teilfreigegeben" });
  const b = await KW.fallFreigeben(store, { fall, freigebender: leitung(2), verfahren: "rueckruf", ms: ms + 2 * MIN,
    nochGueltig: immerGueltig, identitaetPassend: passt });
  expect(b).toMatchObject({ ok: true, stand: "freigegeben" });
  return { fall, token: b.token, bisMs: b.bisMs };
}
const einloesen = (store, token, ms, wirkung = async () => ({ ok: true })) =>
  KW.fallEinloesen(store, { traegerId: TRAEGER.id, token, faktorKennung: "g:gen1:x", ms, wirkung });

describe("WR-3 Kern: Ablauf", () => {
  it("zwei Freigaben ergeben genau ein Token; erst dann einlösbar; Token einmal", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    expect(fall).toMatch(KW.FALL_MUSTER);
    /* Ohne Freigabe: nichts einzulösen. */
    expect((await einloesen(s, "A".repeat(43), T0 + MIN)).ok).toBe(false);
    const a = await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt });
    expect(a).toEqual({ ok: true, stand: "teilfreigegeben", verfallen: 0 });
    expect(/** @type {any} */ (a).token).toBeUndefined();
    const b = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "rueckruf", aktenzeichen: "AZ-7/2026",
      ms: T0 + 2 * MIN, nochGueltig: immerGueltig, identitaetPassend: passt });
    expect(b.ok && b.stand).toBe("freigegeben");
    const token = /** @type {any} */ (b).token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    /* Nur die Prüfsumme liegt in der Ablage. */
    expect([...s.m.values()].join("\n")).not.toContain(token);
    let wirkungen = 0;
    const w = async () => { wirkungen += 1; return { ok: true, x: 1 }; };
    expect(await einloesen(s, token, T0 + 3 * MIN, w)).toMatchObject({ ok: true, fall });
    expect(await einloesen(s, token, T0 + 3 * MIN, w)).toMatchObject({ ok: false });
    expect(wirkungen).toBe(1);
    /* Eingelöst ist Endzustand: keine weitere Freigabe, kein neuer Token. */
    expect((await KW.fallFreigeben(s, { fall, freigebender: leitung(3), verfahren: "persoenlich", ms: T0 + 4 * MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt })).ok).toBe(false);
  });

  it("falsches Token, fremder Träger, anderer Faktorzustand: kein Einlösen, Fall bleibt einlösbar", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    const falsch = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect((await einloesen(s, falsch, T0 + 3 * MIN)).ok).toBe(false);
    expect((await KW.fallEinloesen(s, { traegerId: "anderer", token, faktorKennung: "g:gen1:x", ms: T0 + 3 * MIN,
      wirkung: async () => ({ ok: true }) })).ok).toBe(false);
    /* Der Faktor wurde inzwischen neu eingerichtet: Token gebunden an den alten Zustand. */
    expect((await KW.fallEinloesen(s, { traegerId: TRAEGER.id, token, faktorKennung: "g:gen2:y", ms: T0 + 3 * MIN,
      wirkung: async () => ({ ok: true }) })).ok).toBe(false);
    expect((await einloesen(s, token, T0 + 3 * MIN)).ok).toBe(true);
  });
});

describe("WR-3 Kern: Fristen (24 h Antrag, 15 min Token)", () => {
  it("Antrag: knapp vor 24 h freigebbar, ab 24 h abgelaufen (auch mit einer Teilfreigabe)", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    expect((await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich",
      ms: T0 + 24 * H - 1, nochGueltig: immerGueltig, identitaetPassend: passt })).ok).toBe(true);
    const zu = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich",
      ms: T0 + 24 * H, nochGueltig: immerGueltig, identitaetPassend: passt });
    expect(zu).toEqual({ ok: false, grund: "stand:abgelaufen" });
    expect(await KW.laufenderFall(s, TRAEGER.id, T0 + 24 * H)).toBe(null);
    /* Festgeschrieben, Endzustand: auch mit zurückgestellter Uhr nicht wieder offen. */
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).stand).toBe("abgelaufen");
    expect(await KW.laufenderFall(s, TRAEGER.id, T0 + MIN)).toBe(null);
  });

  it("Token: knapp vor 15 min einlösbar, ab 15 min nicht", async () => {
    const s1 = speicher();
    const a = await freigegeben(s1);
    expect(a.bisMs).toBe(T0 + 2 * MIN + 15 * MIN);
    expect((await einloesen(s1, a.token, a.bisMs - 1)).ok).toBe(true);
    const s2 = speicher();
    const b = await freigegeben(s2);
    expect((await einloesen(s2, b.token, b.bisMs)).ok).toBe(false);
    expect(await KW.laufenderFall(s2, TRAEGER.id, b.bisMs)).toBe(null);
  });

  it("Token endet spätestens mit dem Antrag (24 h ab Eröffnung), auch wenn 15 min länger wären", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + H, nochGueltig: immerGueltig, identitaetPassend: passt });
    const b = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich", ms: T0 + 24 * H - 5 * MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt });
    expect(b.ok && /** @type {any} */ (b).bisMs).toBe(T0 + 24 * H);
    expect((await einloesen(s, /** @type {any} */ (b).token, T0 + 24 * H)).ok).toBe(false);
  });

  it("zurückgestellte Uhr verlängert nichts: Zeitpunkt vor der Eröffnung gilt als abgelaufen", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    expect((await einloesen(s, token, T0 - 10 * MIN)).ok).toBe(false);
    expect(await KW.laufenderFall(s, TRAEGER.id, T0 - 10 * MIN)).toBe(null);
  });
});

describe("WR-3 Kern: Wer darf freigeben", () => {
  const versuch = async (s, fall, w, ms = T0 + MIN) =>
    KW.fallFreigeben(s, { fall, freigebender: w, verfahren: "persoenlich", ms, nochGueltig: immerGueltig, identitaetPassend: passt });

  it("nur Leitung im selben Raum, Mandanten und Betrieb", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    for (const w of [leitung(1, { rolle: "planer" }), leitung(1, { rolle: "subplaner" }), leitung(1, { rolle: "mitarbeiter" }),
      leitung(1, { rolle: "kunde" }), leitung(1, { rolle: "betreiber" }), leitung(1, { mandantId: "m2" }),
      leitung(1, { raum: "r2" }), leitung(1, { betrieb: 1 }), leitung(1, { mandantId: null }), leitung(1, { person: null })]) {
      expect((await versuch(s, fall, w)).ok, JSON.stringify(w)).toBe(false);
    }
    /* Fremder Mandant: dieselbe Auskunft wie ein unbekannter Fall. */
    expect(await versuch(s, fall, leitung(1, { mandantId: "m2" }))).toEqual({ ok: false, grund: "unbekannt" });
    expect(await versuch(s, "F-AAAAAAAAAAAAAAAA", leitung(1))).toEqual({ ok: false, grund: "unbekannt" });
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).freigaben).toEqual([]);
    expect((await versuch(s, fall, leitung(1))).ok).toBe(true);
  });

  it("keine Selbstfreigabe: Träger-Konto, Träger-Person über ein zweites Konto", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    expect((await versuch(s, fall, { ...leitung(1), kennung: TRAEGER.kennung })).ok).toBe(false);
    expect((await versuch(s, fall, { ...leitung(1), schluessel: TRAEGER.schluessel })).ok).toBe(false);
    expect(await versuch(s, fall, { ...leitung(1), person: "t1" })).toEqual({ ok: false, grund: "selbst" });
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).stand).toBe("offen");
  });

  it("zweite Freigabe: nicht dasselbe Konto, nicht dieselbe Person, nicht dieselbe Einheit", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    expect((await versuch(s, fall, leitung(1))).ok).toBe(true);
    expect((await versuch(s, fall, leitung(1), T0 + 2 * MIN)).ok).toBe(false);                       // gleiches Konto
    expect((await versuch(s, fall, { ...leitung(2), person: "l1" }, T0 + 2 * MIN)).ok).toBe(false);   // gleiche Person
    expect(await versuch(s, fall, { ...leitung(2), einheiten: ["e1"] }, T0 + 2 * MIN))
      .toEqual({ ok: false, grund: "nicht-unabhaengig" });                                               // gleiche Einheit
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).stand).toBe("teilfreigegeben");
    /* Betriebsweit („ALLE", leer) zählt nicht als gleiche Einheit. */
    const s2 = speicher();
    const f2 = await eroeffnet(s2);
    expect((await versuch(s2, f2, { ...leitung(1), einheiten: ["ALLE"] })).ok).toBe(true);
    expect((await versuch(s2, f2, { ...leitung(2), einheiten: ["ALLE"] }, T0 + 2 * MIN)).stand).toBe("freigegeben");
  });

  it("J.2f: hat der erste Freigebende seine Berechtigung verloren, verfällt seine Freigabe (kein Token)", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    await versuch(s, fall, leitung(1));
    const r = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich", ms: T0 + 2 * MIN,
      nochGueltig: async (fr) => fr.person !== "l1", identitaetPassend: passt });
    expect(r).toEqual({ ok: true, stand: "teilfreigegeben", verfallen: 1 });
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).freigaben.map((x) => x.person)).toEqual(["l2"]);
    /* Wirft die Prüfung (Ablage nicht lesbar): nichts geschrieben. */
    const vorher = s.m.get(`verlustfall:${fall}`);
    await expect(KW.fallFreigeben(s, { fall, freigebender: leitung(3), verfahren: "persoenlich", ms: T0 + 3 * MIN,
      nochGueltig: async () => { throw new Error("EIO"); }, identitaetPassend: passt })).rejects.toThrow();
    expect(s.m.get(`verlustfall:${fall}`)).toBe(vorher);
  });

  it("Verfahren der Identitätsprüfung ist Pflicht (feste Liste), Aktenzeichen nur in fester Form", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    for (const v of ["", "mail", "per E-Mail"])
      expect((await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: v, ms: T0 + MIN,
        nochGueltig: immerGueltig, identitaetPassend: passt })).ok).toBe(false);
    expect((await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", aktenzeichen: "Max Muster <x>",
      ms: T0 + MIN, nochGueltig: immerGueltig, identitaetPassend: passt })).ok).toBe(false);
  });

  it("Ablehnung beendet den Fall; Sperre erst nach zwei Ablehnungen verschiedener Personen (M2)", async () => {
    const s = speicher();
    const ablehnen = (fall, w, ms) => KW.fallAblehnen(s, { fall, freigebender: w, grund: "identitaet-zweifelhaft", ms,
      identitaetPassend: passt });
    const neu = (ms) => KW.fallEroeffnen(s, { traeger: TRAEGER, faktorKennung: "g:gen1:x", ms });
    const f1 = await eroeffnet(s);
    expect(await ablehnen(f1, leitung(1), T0 + MIN)).toEqual({ ok: true, stand: "abgelehnt" });
    expect((await versuch(s, f1, leitung(2), T0 + 2 * MIN)).ok).toBe(false);
    /* Eine einzelne Leitung sperrt nicht: sofort ein neuer Fall; dieselbe Person erneut: weiterhin keine Sperre. */
    const f2 = await neu(T0 + 3 * MIN);
    expect(f2.ok).toBe(true);
    expect((await ablehnen(/** @type {any} */ (f2).fall, leitung(1), T0 + 4 * MIN)).ok).toBe(true);
    const f3 = await neu(T0 + 5 * MIN);
    expect(f3.ok).toBe(true);
    /* Zweite, andere Person: jetzt gesperrt — bis 24 h nach der ersten der beiden letzten Ablehnungen verstrichen sind. */
    expect((await ablehnen(/** @type {any} */ (f3).fall, leitung(2), T0 + 6 * MIN)).ok).toBe(true);
    expect(await neu(T0 + 7 * MIN)).toEqual({ ok: false, grund: "gesperrt" });
    expect(await neu(T0 + 4 * MIN + 24 * H - 1)).toEqual({ ok: false, grund: "gesperrt" });
    expect((await neu(T0 + 4 * MIN + 24 * H)).ok).toBe(true);
  });

  it("Rückzug: Endzustand, Token danach ungültig; nur ein laufender Fall je Träger", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    expect(await KW.fallEroeffnen(s, { traeger: TRAEGER, faktorKennung: "g:gen1:x", ms: T0 + 3 * MIN }))
      .toEqual({ ok: false, grund: "offen" });
    expect((await KW.fallZurueckziehen(s, { traegerId: TRAEGER.id, ms: T0 + 3 * MIN })).fall).toMatch(KW.FALL_MUSTER);
    expect((await einloesen(s, token, T0 + 4 * MIN)).ok).toBe(false);
    expect((await KW.fallEroeffnen(s, { traeger: TRAEGER, faktorKennung: "g:gen1:x", ms: T0 + 5 * MIN })).ok).toBe(true);
  });

  it("ohne Person, Mandant oder Faktor kein Fall (Selbstfreigabe sonst nicht prüfbar)", async () => {
    const s = speicher();
    for (const t of [{ ...TRAEGER, person: null }, { ...TRAEGER, mandantId: null }, { ...TRAEGER, raum: "" }])
      expect((await KW.fallEroeffnen(s, { traeger: t, faktorKennung: "g:gen1:x", ms: T0 })).ok).toBe(false);
    expect((await KW.fallEroeffnen(s, { traeger: TRAEGER, faktorKennung: null, ms: T0 })).ok).toBe(false);
    expect(s.m.size).toBe(0);
  });
});

describe("WR-3 Kern: Review #191 (H1, L1, L2)", () => {
  it("H1: ohne passende Träger-Identität keine Freigabe, kein Token, keine Ablehnung; ohne Prüfung ebenso", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    const nie = async () => false;
    expect(await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN,
      nochGueltig: immerGueltig, identitaetPassend: nie })).toEqual({ ok: false, grund: "identitaet" });
    expect(await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN,
      nochGueltig: immerGueltig, identitaetPassend: /** @type {any} */ (undefined) })).toEqual({ ok: false, grund: "identitaet" });
    expect(await KW.fallAblehnen(s, { fall, freigebender: leitung(1), grund: "sonstiges", ms: T0 + MIN, identitaetPassend: nie }))
      .toEqual({ ok: false, grund: "identitaet" });
    const f = JSON.parse(s.m.get(`verlustfall:${fall}`));
    expect(f.stand).toBe("offen");
    expect(f.freigaben).toEqual([]);
  });

  it("L1: die Unabhängigkeit wird mit den JETZIGEN Einheiten des ersten Freigebenden geprüft", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt });
    /* l1 ist inzwischen in Einheit e2 gewechselt — dieselbe wie l2. */
    const r = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich", ms: T0 + 2 * MIN,
      nochGueltig: async () => ({ einheiten: ["e2"] }), identitaetPassend: passt });
    expect(r).toEqual({ ok: false, grund: "nicht-unabhaengig" });
  });

  it("L2: wirft die Wirkung, ist das Ergebnis „ungewiss“ (nicht „unverändert“) und so vermerkt", async () => {
    const s = speicher();
    const { fall, token } = await freigegeben(s);
    const r = await einloesen(s, token, T0 + 3 * MIN, async () => { throw new Error("EIO"); });
    expect(r).toMatchObject({ ok: false, grund: "wirkung", ergebnis: { ungewiss: true } });
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).wirkung).toBe("ungewiss");
  });
});

describe("WR-3 Kern: Gleichzeitigkeit und Fehler", () => {
  it("rennende Freigaben: genau ein Token, genau zwei Freigaben gespeichert", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    const alle = await Promise.all([1, 2, 3, 4, 5].map((n) => KW.fallFreigeben(s, { fall, freigebender: leitung(n),
      verfahren: "persoenlich", ms: T0 + MIN, nochGueltig: immerGueltig, identitaetPassend: passt })));
    expect(alle.filter((r) => r.ok && r.stand === "freigegeben")).toHaveLength(1);
    expect(alle.filter((r) => r.ok && r.stand === "teilfreigegeben")).toHaveLength(1);
    expect(alle.filter((r) => !r.ok)).toHaveLength(3);
    expect(JSON.parse(s.m.get(`verlustfall:${fall}`)).freigaben).toHaveLength(2);
  });

  it("doppeltes Einlösen gleichzeitig: genau eine Wirkung", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    let n = 0;
    const w = async () => { n += 1; await new Promise((r) => setTimeout(r, 5)); return { ok: true }; };
    const r = await Promise.all(Array.from({ length: 6 }, () => einloesen(s, token, T0 + 3 * MIN, w)));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(n).toBe(1);
  });

  it("gleichzeitiges Eröffnen: genau ein Fall", async () => {
    const s = speicher();
    const r = await Promise.all(Array.from({ length: 5 }, () =>
      KW.fallEroeffnen(s, { traeger: TRAEGER, faktorKennung: "g:gen1:x", ms: T0 })));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
  });

  it("Schreibfehler bei der zweiten Freigabe: kein Token, Fall unverändert", async () => {
    const s = speicher();
    const fall = await eroeffnet(s);
    await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN, nochGueltig: immerGueltig, identitaetPassend: passt });
    const vorher = s.m.get(`verlustfall:${fall}`);
    s.fehler = (op, k) => op === "set" && k.startsWith("verlustfall:");
    await expect(KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich", ms: T0 + 2 * MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt })).rejects.toThrow();
    s.fehler = () => false;
    expect(s.m.get(`verlustfall:${fall}`)).toBe(vorher);
  });

  it("Schreibfehler beim Einlösen: keine Wirkung, Token bleibt einlösbar", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    let n = 0;
    s.fehler = (op, k) => op === "set" && k.startsWith("verlustfall:");
    await expect(einloesen(s, token, T0 + 3 * MIN, async () => { n += 1; return { ok: true }; })).rejects.toThrow();
    expect(n).toBe(0);
    s.fehler = () => false;
    expect((await einloesen(s, token, T0 + 3 * MIN)).ok).toBe(true);
  });

  it("scheitert die Wirkung, ist das Token trotzdem verbraucht (kein zweiter Versuch mit demselben Token)", async () => {
    const s = speicher();
    const { token } = await freigegeben(s);
    expect(await einloesen(s, token, T0 + 3 * MIN, async () => ({ ok: false })))
      .toMatchObject({ ok: false, grund: "wirkung" });
    expect((await einloesen(s, token, T0 + 3 * MIN)).ok).toBe(false);
  });
});

describe("WR-3 Kern: Sicherungsstände und Schlüsselepoche", () => {
  it("eine zurückgespielte Ablage belebt weder ein eingelöstes Token noch einen abgelaufenen Fall", async () => {
    let epoche = "epoche-a";
    ZF.wiederherstellungEpocheQuelle(async () => epoche);
    const s = speicher();
    const { token } = await freigegeben(s);
    const sicherung = s.abbild();
    expect((await einloesen(s, token, T0 + 3 * MIN)).ok).toBe(true);
    /* Ablage zurückgespielt → die Schlüsselepoche wechselt (schluesselepoche.mjs). */
    s.zurueckspielen(sicherung);
    epoche = "epoche-b";
    expect((await einloesen(s, token, T0 + 4 * MIN)).ok).toBe(false);
    expect(await KW.laufenderFall(s, TRAEGER.id, T0 + 4 * MIN)).toBe(null);
    /* Ohne Epochenwechsel wäre das Token wieder einlösbar — genau das verhindert die Bindung. */
    s.zurueckspielen(sicherung);
    epoche = "epoche-a";
    expect((await KW.laufenderFall(s, TRAEGER.id, T0 + 4 * MIN))).not.toBe(null);
  });

  it("ein in der Sicherung abgelaufener Fall bleibt abgelaufen (absolute Fristen)", async () => {
    ZF.wiederherstellungEpocheQuelle(async () => "epoche-a");
    const s = speicher();
    await eroeffnet(s);
    const sicherung = s.abbild();
    s.zurueckspielen(sicherung);
    expect(await KW.laufenderFall(s, TRAEGER.id, T0 + 25 * H)).toBe(null);
  });

  it("Epoche nicht feststellbar: kein Eröffnen, kein Einlösen, keine Freigabe", async () => {
    let geht = true;
    ZF.wiederherstellungEpocheQuelle(async () => { if (!geht) throw new Error("weg"); return "epoche-a"; });
    const s = speicher();
    const fall = await eroeffnet(s);
    await KW.fallFreigeben(s, { fall, freigebender: leitung(1), verfahren: "persoenlich", ms: T0 + MIN, nochGueltig: immerGueltig, identitaetPassend: passt });
    const b = await KW.fallFreigeben(s, { fall, freigebender: leitung(2), verfahren: "persoenlich", ms: T0 + 2 * MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt });
    geht = false;
    expect(await KW.fallEroeffnen(s, { traeger: { ...TRAEGER, id: "anderer" }, faktorKennung: "g:x", ms: T0 }))
      .toEqual({ ok: false, grund: "epoche" });
    expect(await einloesen(s, /** @type {any} */ (b).token, T0 + 3 * MIN)).toEqual({ ok: false, grund: "epoche" });
    expect((await KW.fallFreigeben(s, { fall, freigebender: leitung(3), verfahren: "persoenlich", ms: T0 + 2 * MIN,
      nochGueltig: immerGueltig, identitaetPassend: passt })).ok).toBe(false);
  });
});

describe("WR-3 Kern: Faktor nach dem Einlösen (zweifaktorNachVerlustNeu)", () => {
  async function aktiverFaktor(s, id) {
    const b = await ZF.zweifaktorBeginnen(s, id, "Probe");
    const roh = ZF.base32Dekodieren(b.geheimnis);
    const r = await ZF.zweifaktorBestaetigen(s, id, ZF.hotp(roh, ZF.schrittZu(Date.now())));
    expect(r.ok).toBe(true);
    return (await ZF.zweifaktorStand(s, id)).faktorKennung;
  }

  it("ersetzt den aktiven Faktor in einem Schritt durch eine ausstehende Einrichtung — nie „kein Faktor“", async () => {
    const s = speicher();
    const kennung = await aktiverFaktor(s, "id-a");
    expect(kennung).toMatch(/^g:/);
    const r = await ZF.zweifaktorNachVerlustNeu(s, "id-a", "Probe", { erwartet: kennung, fall: "F-AAAAAAAAAAAAAAAA" });
    expect(r.ok).toBe(true);
    const st = await ZF.zweifaktorStand(s, "id-a");
    expect(st).toMatchObject({ aktiv: false, ausstehend: true, ausVerlust: true, faktorKennung: "v:F-AAAAAAAAAAAAAAAA" });
    /* Mit dem Code allein nicht zu überschreiben. */
    expect(await ZF.zweifaktorBeginnen(s, "id-a", "Dieb")).toEqual({ fehler: "verlust" });
  });

  it("anderer Faktorzustand oder Schreibfehler: der aktive Faktor bleibt unverändert", async () => {
    const s = speicher();
    const kennung = await aktiverFaktor(s, "id-b");
    const vorher = s.m.get("zweifaktor:id-b");
    expect(await ZF.zweifaktorNachVerlustNeu(s, "id-b", "Probe", { erwartet: "g:anders", fall: "F-AAAAAAAAAAAAAAAA" }))
      .toEqual({ ok: false, fehler: "geaendert" });
    s.fehler = (op, k) => op === "set" && k === "zweifaktor:id-b";
    await expect(ZF.zweifaktorNachVerlustNeu(s, "id-b", "Probe", { erwartet: kennung, fall: "F-AAAAAAAAAAAAAAAA" }))
      .rejects.toThrow();
    s.fehler = () => false;
    expect(s.m.get("zweifaktor:id-b")).toBe(vorher);
    expect((await ZF.zweifaktorStand(s, "id-b")).aktiv).toBe(true);
  });
});
