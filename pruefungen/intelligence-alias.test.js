/* ==========================================================================
   INTELLIGENCE — ALIAS UND RÜCKÜBERSETZUNG (WP-I11)

   Alias: keyed HMAC je Raum/Betrieb/Kontext; ohne Schlüssel keine Karte
   (fail closed, kein Vorgabeschlüssel); nicht aus Kennung oder Name
   errechenbar; Karte nie serialisierbar. Rückübersetzung nur im Server, nur
   für eine berechtigte Rolle, nur im Raum und Betrieb der Karte. Zahlen und
   Daten bleiben unverändert. Testschlüssel fest im Test — nie im Code.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { inspect } from "node:util";
import { AliasKarte, zufallsSchluessel, rueckuebersetzen, SCHLUESSEL_MIN_BYTES } from "../server/lib/intelligence/alias.mjs";
import { ALIAS_MUSTER } from "../server/lib/intelligence/schemas.mjs";

const TESTSCHLUESSEL = Buffer.from("c2f1a7d94e0b38f6a15c7e2d90b4f8a3c6e1d7b2a9f04e5c8d3b6a1f7e2c9d04", "hex");
const ANDERER = Buffer.from("0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0", "hex");
const karte = (o = {}) => new AliasKarte({ schluessel: TESTSCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0,
  kontext: "auftrag-1", ...o });
const IDS = Array.from({ length: 300 }, (_, i) => `p${i}`);
const LEITUNG = { rolle: "leitung", person: "l1", bestand: "raum-a", betrieb: 0 };

describe("Alias-Vergabe", () => {
  it("Form: Präfix je Typ und acht Konsonanten; keine Ziffer, kein Vokal", () => {
    const k = karte();
    expect(k.alias("person", "p1")).toMatch(/^P_[BCDFGHJKLMNPQRSTVWXZ]{8}$/);
    expect(k.alias("einheit", "e1")).toMatch(/^E_/);
    expect(k.alias("objekt", "o1")).toMatch(/^O_/);
    for (const id of IDS) expect(k.alias("person", id)).toMatch(ALIAS_MUSTER);
  });
  it("stabil innerhalb der Karte und zwischen Karten mit gleichem Schlüssel, Raum, Betrieb, Kontext", () => {
    const a = karte(); const b = karte();
    for (const id of IDS) {
      expect(a.alias("person", id)).toBe(a.alias("person", id));
      expect(a.alias("person", id)).toBe(b.alias("person", id));
    }
  });
  it("eindeutig: 300 Personen → 300 verschiedene Alias", () => {
    const k = karte();
    expect(new Set(IDS.map((id) => k.alias("person", id))).size).toBe(IDS.length);
  });
  it("anderer Kontext, anderer Schlüssel, anderer Raum, anderer Betrieb → andere Alias (keine Verknüpfung)", () => {
    const basis = IDS.map((id) => karte().alias("person", id));
    for (const o of [{ kontext: "auftrag-2" }, { schluessel: ANDERER }, { raum: "raum-b" }, { betriebId: "m2" }]) {
      const k = karte(o);
      const neu = IDS.map((id) => k.alias("person", id));
      const gleich = neu.filter((a, i) => a === basis[i]).length;
      expect(gleich, JSON.stringify(Object.keys(o))).toBe(0);
    }
  });
  it("nicht aus der Kennung errechenbar: kein Zusammenhang mit sha256/HMAC ohne Schlüssel oder der Reihenfolge", () => {
    const k = karte();
    const kodiert = (h) => h.toString("hex").toUpperCase();
    for (const id of IDS.slice(0, 50)) {
      const a = k.alias("person", id).slice(2);
      expect(kodiert(createHash("sha256").update(id).digest())).not.toContain(a);
      expect(a).not.toContain(id.toUpperCase());
    }
    /* Die Reihenfolge der Alias folgt nicht der Reihenfolge der Kennungen. */
    const alias = IDS.map((id) => k.alias("person", id));
    const sortiert = [...alias].sort();
    expect(alias).not.toEqual(sortiert);
  });
  it("ohne Schlüssel, mit zu kurzem, mit Text- oder Nullschlüssel: keine Karte (fail closed, kein Vorgabeschlüssel)", () => {
    for (const s of [undefined, null, "", "geheim", Buffer.alloc(16, 7), Buffer.alloc(SCHLUESSEL_MIN_BYTES, 0),
      Buffer.alloc(64, 0xab), "c2f1a7d94e0b38f6a15c7e2d90b4f8a3c6e1d7b2a9f04e5c8d3b6a1f7e2c9d04"]) {
      let code = null;
      try { new AliasKarte({ schluessel: /** @type {any} */ (s), raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "k" }); }
      catch (e) { code = e.code; }
      expect(code, String(s && s.length)).toBe("KI_ALIAS_SCHLUESSEL");
    }
  });
  it("zufallsSchluessel liefert 32 zufällige Byte, je Aufruf verschieden", () => {
    const a = zufallsSchluessel(); const b = zufallsSchluessel();
    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);
    const k1 = new AliasKarte({ schluessel: a, raum: "r", betriebId: "m", betriebIndex: 0, kontext: "k" });
    const k2 = new AliasKarte({ schluessel: b, raum: "r", betriebId: "m", betriebIndex: 0, kontext: "k" });
    expect(k1.alias("person", "p1")).not.toBe(k2.alias("person", "p1"));
  });
  it("Raum, Betrieb und Kontext sind Pflicht", () => {
    for (const o of [{ raum: "" }, { betriebId: "" }, { betriebIndex: -1 }, { kontext: "" }, { kontext: "mit leerzeichen" }])
      expect(() => karte(o), JSON.stringify(o)).toThrow();
  });
});

describe("Die Alias-Karte bleibt im Server", () => {
  it("JSON.stringify wirft — auch eingebettet in ein Objekt", () => {
    const k = karte(); k.alias("person", "p1");
    expect(() => JSON.stringify(k)).toThrow(/nicht serialisiert/);
    expect(() => JSON.stringify({ paket: {}, karte: k })).toThrow();
  });
  it("Ausgabe in Protokollen (inspect, String) zeigt keinen Inhalt", () => {
    const k = karte(); k.alias("person", "geheime-kennung-123");
    expect(inspect(k)).toBe("[AliasKarte]");
    expect(String(k)).toBe("[AliasKarte]");
    expect(Object.keys(k)).toEqual([]);
    expect(inspect(k, { showHidden: true, depth: 5 })).not.toContain("geheime-kennung-123");
  });
  it("ausdrückliche Ablage für den Lauf-Store: Rundweg ohne Schlüssel, danach keine neue Vergabe", () => {
    const k = karte(); const a = k.alias("person", "p7"); const e = k.alias("einheit", "e2");
    const d = k.fuerServerSpeicher();
    expect(JSON.stringify(d)).not.toContain(TESTSCHLUESSEL.toString("hex"));
    const z = AliasKarte.ausServerSpeicher(JSON.parse(JSON.stringify(d)));
    expect(rueckuebersetzen({ ergebnis: `{{person:${a}}} in {{einheit:${e}}}`, karte: z, sitzung: LEITUNG, funktion: "F3" }))
      .toBe("{{person:p7}} in {{einheit:e2}}");
    expect(() => z.alias("person", "p8")).toThrow();
    expect(() => AliasKarte.ausServerSpeicher({ ...d, eintraege: [["P_BCDFGHJK", "einheit", "x"]] })).toThrow();
  });
});

describe("Rückübersetzung", () => {
  const vorbereitet = () => {
    const k = karte();
    return { k, a1: k.alias("person", "p1"), a2: k.alias("person", "p2"), e1: k.alias("einheit", "e1") };
  };
  it("berechtigte Rolle: Alias → Kennung; Zahlen, Uhrzeiten und Daten bleiben", () => {
    const { k, a1, a2, e1 } = vorbereitet();
    const ergebnis = { bausteine: [{ id: "ersatz.weg", parameter: [{ name: "von", wert: `{{person:${a1}}}` },
      { name: "an", wert: a2 }, { name: "stunden", wert: 4.5 }, { name: "beginn", wert: "08:00" }, { name: "tag", wert: "2026-11-05" }] }],
    text: `Tausch ${a1} ↔ {{person:${a2}}} in {{einheit:${e1}}} am 2026-11-05, 11 h Ruhezeit.` };
    const r = rueckuebersetzen({ ergebnis, karte: k, sitzung: LEITUNG, funktion: "F3" });
    expect(r.bausteine[0].parameter).toEqual([{ name: "von", wert: "{{person:p1}}" }, { name: "an", wert: "{{person:p2}}" },
      { name: "stunden", wert: 4.5 }, { name: "beginn", wert: "08:00" }, { name: "tag", wert: "2026-11-05" }]);
    expect(r.text).toBe("Tausch {{person:p1}} ↔ {{person:p2}} in {{einheit:e1}} am 2026-11-05, 11 h Ruhezeit.");
    expect(rueckuebersetzen({ ergebnis: `{{person:${a1}}}`, karte: k, sitzung: { ...LEITUNG, rolle: "planer" }, funktion: "F3" }))
      .toBe("{{person:p1}}");
  });
  it("unberechtigte Rolle → KI_ROLLE (Beschäftigte, Betriebsrat, Schichtverantwortung, Betreiber, unbekannt)", () => {
    const { k, a1 } = vorbereitet();
    for (const rolle of ["mitarbeiter", "betriebsrat", "subplaner", "betreiber", "kunde", "admin", undefined]) {
      let code = null;
      try { rueckuebersetzen({ ergebnis: `{{person:${a1}}}`, karte: k, sitzung: { ...LEITUNG, rolle }, funktion: "F3" }); }
      catch (e) { code = e.code; }
      expect(code, String(rolle)).toBe("KI_ROLLE");
    }
  });
  it("Rolle darf die Funktion nicht → KI_ROLLE (Planung bei F4 Leitungsbriefing)", () => {
    const { k } = vorbereitet();
    expect(() => rueckuebersetzen({ ergebnis: "x", karte: k, sitzung: { ...LEITUNG, rolle: "planer" }, funktion: "F4" }))
      .toThrow(expect.objectContaining({ code: "KI_ROLLE" }));
  });
  it("anderer Raum oder Betrieb der Sitzung → KI_NICHT_GEFUNDEN", () => {
    const { k, a1 } = vorbereitet();
    for (const s of [{ ...LEITUNG, bestand: "raum-b" }, { ...LEITUNG, betrieb: 1 }]) {
      expect(() => rueckuebersetzen({ ergebnis: `{{person:${a1}}}`, karte: k, sitzung: s, funktion: "F3" }))
        .toThrow(expect.objectContaining({ code: "KI_NICHT_GEFUNDEN" }));
    }
  });
  it("erfundener oder falsch getypter Alias → KI_ALIAS_UNBEKANNT (nichts halb übersetzt)", () => {
    const { k, a1, e1 } = vorbereitet();
    expect(() => rueckuebersetzen({ ergebnis: "{{person:P_ZZZZZZZZ}}", karte: k, sitzung: LEITUNG, funktion: "F3" }))
      .toThrow(expect.objectContaining({ code: "KI_ALIAS_UNBEKANNT" }));
    expect(() => rueckuebersetzen({ ergebnis: `{{einheit:${a1}}}`, karte: k, sitzung: LEITUNG, funktion: "F3" }))
      .toThrow(expect.objectContaining({ code: "KI_ALIAS_UNBEKANNT" }));
    expect(() => rueckuebersetzen({ ergebnis: [`${e1}`, "P_QQQQQQQQ"], karte: k, sitzung: LEITUNG, funktion: "F3" }))
      .toThrow(expect.objectContaining({ code: "KI_ALIAS_UNBEKANNT" }));
  });
  it("Funktion ohne Personenbezug: Personen-Alias in der Antwort → KI_PRUEFER", () => {
    const { k, a1 } = vorbereitet();
    expect(() => rueckuebersetzen({ ergebnis: `${a1}`, karte: k, sitzung: LEITUNG, funktion: "F4" }))
      .toThrow(expect.objectContaining({ code: "KI_PRUEFER" }));
  });
  it("ohne Karte keine Rückübersetzung; das Ergebnis enthält nie einen Namen (die Karte kennt keine)", () => {
    expect(() => rueckuebersetzen({ ergebnis: "x", karte: /** @type {any} */ ({}), sitzung: LEITUNG, funktion: "F3" })).toThrow();
    const { k, a1 } = vorbereitet();
    const r = rueckuebersetzen({ ergebnis: { text: a1 }, karte: k, sitzung: LEITUNG, funktion: "F3" });
    expect(r).toEqual({ text: "{{person:p1}}" });
  });
});
