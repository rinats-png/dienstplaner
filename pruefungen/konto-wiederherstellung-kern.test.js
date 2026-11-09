/* ==========================================================================
   KONTOWIEDERHERSTELLUNG, KERN (WR-1)

   Vorgabe: docs/acc45/KONTO-WIEDERHERSTELLUNG.md, Abschnitt C (Datenmodell)
   und Testplan G (T1 bis T4, T10, T12). Geprüft wird nur der Kern in
   server/lib/zweifaktor.mjs, nicht die HTTP-Wege (WR-2 ff.).

     - zehn Codes je Einrichtung, Format SSSS-VVVV-VVVV-VVVV (4 + 12 Zeichen)
       aus einem 32er-Alphabet ohne Verwechsler
     - Ziehung ohne Modulo-Verzerrung: 5-Bit-Gruppen aus kryptografischem
       Zufall, umkehrbar (Bijektion), Chi-Quadrat über alle Zeichen
     - Speicherung nur als scrypt über HMAC (Schlüssel per HKDF aus dem
       Pfeffer), je Code eigenes Salz, gebunden an id und Generation
     - genau ein scrypt je Versuch, auch bei unbekanntem Selektor
     - einmalige Verwendung, gleichzeitige Versuche, Neugenerierung nur
       mit frischem TOTP, alte Codes danach wertlos
     - Altformat v1 kontrolliert: lesbar bis zur Neugenerierung, als
       „Neugenerierung nötig“ gemeldet, nie mehr neu geschrieben
     - ohne Pfeffer weder Erzeugen noch Prüfen

   Rot auf dem Stand vor WR-1: Format 5-5, HMAC ohne Salz, kein scrypt,
   keine Neugenerierung, Ziehung mit b % 26.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac, randomBytes } from "node:crypto";

/* scrypt beobachten, ohne es zu ersetzen: Der Kern soll je Versuch genau
   einmal rechnen. */
const zaehler = vi.hoisted(() => ({ scrypt: 0 }));
vi.mock("node:crypto", async (original) => {
  const m = /** @type {any} */ (await original());
  return { ...m, scrypt: (...a) => { zaehler.scrypt += 1; return m.scrypt(...a); } };
});

const zf = await import("../server/lib/zweifaktor.mjs");
const {
  WIEDERHERSTELLUNG_ANZAHL, WIEDERHERSTELLUNG_ALPHABET, wiederherstellungCodeAusBytes,
  wiederherstellungCodeNeu, wiederherstellungZerlegen, wiederherstellungErzeugen,
  wiederherstellungNeu, zweifaktorBeginnen, zweifaktorBestaetigen, zweifaktorPruefen,
  zweifaktorStand, base32Dekodieren, hotp, schrittZu,
} = zf;

const PFEFFER = "pfeffer-nur-zum-pruefen-wr1-0123456789";
const FORMAT = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

/** Ablage im Speicher, Schnittstelle wie lib/ablage.mjs. */
function speicher() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    roh() { return [...m.values()].join("\n"); },
  };
}

let jetzt = Date.UTC(2026, 10, 9, 12, 0, 15);
const totpVon = (b32, ms = jetzt) => hotp(base32Dekodieren(b32), schrittZu(ms));

/** Einrichten und bestätigen; gibt Ablage, Geheimnis und Klartext-Codes zurück. */
async function eingerichtet(id = "traeger-a") {
  const store = speicher();
  const b = await zweifaktorBeginnen(store, id, "Konto");
  const f = await zweifaktorBestaetigen(store, id, totpVon(b.geheimnis), jetzt);
  expect(f.ok).toBe(true);
  return { store, id, geheimnis: b.geheimnis, codes: f.wiederherstellung };
}

beforeEach(() => { process.env.CENTRIC_PFEFFER = PFEFFER; zaehler.scrypt = 0; });
afterEach(() => { jetzt += 120_000; });

describe("Format und Alphabet", () => {
  it("Alphabet: 32 verschiedene Zeichen, ohne 0, 1, I, O", () => {
    expect(WIEDERHERSTELLUNG_ALPHABET).toHaveLength(32);
    expect(new Set(WIEDERHERSTELLUNG_ALPHABET).size).toBe(32);
    for (const z of "01IO") expect(WIEDERHERSTELLUNG_ALPHABET).not.toContain(z);
  });

  it("ein Code: 4 + 12 Zeichen, Anzeige SSSS-VVVV-VVVV-VVVV", () => {
    for (let i = 0; i < 200; i++) expect(wiederherstellungCodeNeu()).toMatch(FORMAT);
  });

  it("Zerlegen: Selektor 4, Prüfteil 12; Klein- und Leerzeichen erlaubt, Fremdzeichen nicht", () => {
    const c = wiederherstellungCodeNeu();
    const z = wiederherstellungZerlegen(c);
    expect(z).toEqual({ sel: c.slice(0, 4), pruef: c.slice(5).replace(/-/g, "") });
    expect(wiederherstellungZerlegen(` ${c.toLowerCase().replace(/-/g, " ")} `)).toEqual(z);
    for (const u of ["", "ABCD", "ABCD-EFGH-JKLM-NPQ", "ABCD-EFGH-JKLM-NPQRS", "ABCD-EFGH-JKLM-NPQ0",
      "ABCD-EFGH-JKLM-NPQ1", "ABCD-EFGH-JKLM-NPQI", "ABCD-EFGH-JKLM-NPQO", "ABCDE-FGHJK", "123456"])
      expect(wiederherstellungZerlegen(u), u).toBeNull();
  });
});

describe("Verteilung ohne Verzerrung", () => {
  it("5-Bit-Gruppen: jede Byte-Folge ergibt genau einen Code und umgekehrt (Bijektion auf 80 bit)", () => {
    const proben = [Buffer.alloc(10, 0), Buffer.alloc(10, 255), ...Array.from({ length: 2000 }, () => randomBytes(10))];
    for (const b of proben) {
      const c = wiederherstellungCodeAusBytes(b);
      expect(c).toMatch(FORMAT);
      const roh = c.replace(/-/g, "");
      let bits = 0n;
      for (const z of roh) bits = (bits << 5n) | BigInt(WIEDERHERSTELLUNG_ALPHABET.indexOf(z));
      expect(Buffer.from(bits.toString(16).padStart(20, "0"), "hex").equals(b)).toBe(true);
    }
    expect(wiederherstellungCodeAusBytes(Buffer.alloc(10, 0))).toBe("AAAA-AAAA-AAAA-AAAA");
    const letzt = WIEDERHERSTELLUNG_ALPHABET[31];
    expect(wiederherstellungCodeAusBytes(Buffer.alloc(10, 255))).toBe(Array(4).fill(letzt.repeat(4)).join("-"));
  });

  it("nur 10 Byte, nicht mehr und nicht weniger", () => {
    expect(() => wiederherstellungCodeAusBytes(Buffer.alloc(9))).toThrow(/10 Byte/);
    expect(() => wiederherstellungCodeAusBytes(Buffer.alloc(11))).toThrow(/10 Byte/);
  });

  it("Chi-Quadrat über 320 000 Zeichen aus dem echten Zufall: unauffällig (df = 31, Grenze 84 ≈ p 1e-6)", () => {
    const n = 20_000;
    const zahl = new Map([...WIEDERHERSTELLUNG_ALPHABET].map((z) => [z, 0]));
    for (let i = 0; i < n; i++)
      for (const z of wiederherstellungCodeNeu().replace(/-/g, "")) zahl.set(z, zahl.get(z) + 1);
    const erwartet = (n * 16) / 32;
    let chi = 0;
    for (const v of zahl.values()) chi += (v - erwartet) ** 2 / erwartet;
    expect(zahl.size).toBe(32);
    expect(chi).toBeLessThan(84);
  });
});

describe("Erzeugen und Speicherform", () => {
  it("zehn Codes, verschiedene Selektoren, je Eintrag eigenes Salz, kein Klartext", async () => {
    const w = await wiederherstellungErzeugen("traeger-a", 1);
    expect(w.klar).toHaveLength(WIEDERHERSTELLUNG_ANZAHL);
    expect(WIEDERHERSTELLUNG_ANZAHL).toBe(10);
    expect(new Set(w.klar).size).toBe(10);
    expect(new Set(w.eintraege.map((e) => e.sel)).size).toBe(10);
    expect(new Set(w.eintraege.map((e) => e.salz)).size).toBe(10);
    expect(new Set(w.eintraege.map((e) => e.wert)).size).toBe(10);
    for (const e of w.eintraege) {
      expect(Object.keys(e).sort()).toEqual(["salz", "sel", "verbraucht", "wert"]);
      expect(Buffer.from(e.salz, "base64")).toHaveLength(16);
      expect(Buffer.from(e.wert, "base64")).toHaveLength(32);
      expect(e.verbraucht).toBeNull();
    }
    const text = JSON.stringify(w.eintraege);
    for (const c of w.klar) {
      expect(text).not.toContain(c);
      expect(text).not.toContain(c.replace(/-/g, ""));
      expect(text).not.toContain(c.slice(5).replace(/-/g, ""));
    }
    expect(zaehler.scrypt).toBe(10);
  });

  it("Speicherwert ist kein HMAC des Altformats und hängt am Pfeffer", async () => {
    const w = await wiederherstellungErzeugen("traeger-a", 1);
    const alt = createHmac("sha256", PFEFFER).update(`wiederherstellung:${w.klar[0].replace(/-/g, "")}`).digest("hex");
    expect(JSON.stringify(w.eintraege)).not.toContain(alt);
  });

  it("ohne Pfeffer: kein Erzeugen", async () => {
    delete process.env.CENTRIC_PFEFFER;
    await expect(wiederherstellungErzeugen("traeger-a", 1)).rejects.toThrow();
  });

  it("Bestätigen legt Fassung 2 ab: Struktur mit Generation, Zähler, KDF-Kennwerten; Ablage ohne Klartext", async () => {
    const { store, id, codes } = await eingerichtet();
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(c).toMatch(FORMAT);
    const e = await store.get(`zweifaktor:${id}`);
    expect(e.wiederherstellung).toMatchObject({ v: 2, generation: 1, verbrauchtZahl: 0,
      kdf: { N: 32768, r: 8, p: 1 } });
    expect(e.wiederherstellung.eintraege).toHaveLength(10);
    const roh = store.roh();
    for (const c of codes) {
      expect(roh).not.toContain(c);
      expect(roh).not.toContain(c.slice(5).replace(/-/g, ""));
    }
    expect(roh).not.toContain(PFEFFER);
    expect(await zweifaktorStand(store, id, jetzt)).toMatchObject({ aktiv: true, wiederherstellungUebrig: 10,
      wiederherstellungFassung: 2, wiederherstellungNeuNoetig: false });
  });
});

describe("Prüfen und Verbrauchen", () => {
  it("T1: Code gilt einmal; Zähler und Zeitpunkt gesetzt; Restzahl 10 → 9", async () => {
    const { store, id, codes } = await eingerichtet();
    zaehler.scrypt = 0;
    expect(await zweifaktorPruefen(store, id, { code: codes[3], ms: jetzt })).toEqual({ ok: true, art: "wiederherstellung" });
    expect(zaehler.scrypt).toBe(1);
    const e = await store.get(`zweifaktor:${id}`);
    expect(e.wiederherstellung.verbrauchtZahl).toBe(1);
    expect(e.wiederherstellung.eintraege.filter((x) => x.verbraucht)).toHaveLength(1);
    expect(Number.isFinite(Date.parse(e.wiederherstellung.eintraege.find((x) => x.verbraucht).verbraucht))).toBe(true);
    expect((await zweifaktorStand(store, id, jetzt)).wiederherstellungUebrig).toBe(9);
  });

  it("T2: Wiederverwendung abgewiesen, Antwort gleich wie bei falschem Code", async () => {
    const { store, id, codes } = await eingerichtet();
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(true);
    const zweit = await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt });
    const falsch = await zweifaktorPruefen(store, id, { code: wiederherstellungCodeNeu(), ms: jetzt });
    expect(zweit).toEqual({ ok: false, grund: "code" });
    expect(falsch).toEqual(zweit);
  });

  it("T3: falscher Prüfteil, unbekannter Selektor, falsche Form, fremde id: je abgewiesen, je genau ein scrypt", async () => {
    const a = await eingerichtet("traeger-a");
    const b = await eingerichtet("traeger-b");
    const c0 = a.codes[0];
    const andererPruefteil = `${c0.slice(0, 5)}${wiederherstellungCodeNeu().slice(5)}`;
    const versuche = [andererPruefteil, wiederherstellungCodeNeu(), "ABCDE-FGHJK", "kein code", b.codes[0]];
    for (const v of versuche) {
      zaehler.scrypt = 0;
      expect(await zweifaktorPruefen(a.store, a.id, { code: v, ms: jetzt }), v.length + "").toEqual({ ok: false, grund: "code" });
      expect(zaehler.scrypt, "ein scrypt je Versuch").toBe(1);
    }
    expect((await zweifaktorStand(a.store, a.id, jetzt)).wiederherstellungUebrig).toBe(10);
  });

  it("an id gebunden: in eine andere id kopierte Einträge prüfen nicht", async () => {
    const a = await eingerichtet("traeger-a");
    const b = await eingerichtet("traeger-b");
    const ea = await a.store.get("zweifaktor:traeger-a");
    const eb = await b.store.get("zweifaktor:traeger-b");
    await b.store.setJSON("zweifaktor:traeger-b", { ...eb, wiederherstellung: ea.wiederherstellung });
    expect(await zweifaktorPruefen(b.store, "traeger-b", { code: a.codes[0], ms: jetzt })).toEqual({ ok: false, grund: "code" });
  });

  it("anderer Pfeffer: kein Treffer; ohne Pfeffer: kein Treffer", async () => {
    const { store, id, codes } = await eingerichtet();
    process.env.CENTRIC_PFEFFER = `${PFEFFER}-anders`;
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(false);
    delete process.env.CENTRIC_PFEFFER;
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(false);
    process.env.CENTRIC_PFEFFER = PFEFFER;
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(true);
  });

  it("T4: zehn gleichzeitige Versuche mit demselben Code: genau einer gilt", async () => {
    const { store, id, codes } = await eingerichtet();
    const r = await Promise.all(Array.from({ length: 10 }, () => zweifaktorPruefen(store, id, { code: codes[1], ms: jetzt })));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    const e = await store.get(`zweifaktor:${id}`);
    expect(e.wiederherstellung.verbrauchtZahl).toBe(1);
    expect(e.wiederherstellung.eintraege.filter((x) => x.verbraucht)).toHaveLength(1);
  });

  it("Schreibfehler beim Verbrauch: kein Erfolg (fail-closed)", async () => {
    const { store, id, codes } = await eingerichtet();
    store.setJSON = async () => { throw new Error("Ablage schreibt nicht"); };
    await expect(zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).rejects.toThrow();
  });

  it("Zähler passt nicht zu den Einträgen: abgewiesen (fail-closed)", async () => {
    const { store, id, codes } = await eingerichtet();
    const e = await store.get(`zweifaktor:${id}`);
    await store.setJSON(`zweifaktor:${id}`, { ...e, wiederherstellung: { ...e.wiederherstellung, verbrauchtZahl: 3 } });
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(false);
  });

  it("TOTP bleibt TOTP: sechs Ziffern gehen nicht in die Codeprüfung", async () => {
    const { store, id, geheimnis } = await eingerichtet();
    jetzt += 60_000;
    zaehler.scrypt = 0;
    expect(await zweifaktorPruefen(store, id, { code: totpVon(geheimnis), ms: jetzt })).toEqual({ ok: true, art: "totp" });
    expect(zaehler.scrypt).toBe(0);
  });
});

describe("T10: Neugenerierung", () => {
  it("nur mit frischem TOTP; danach gelten alte Codes nicht mehr, neue schon; Generation steigt", async () => {
    const { store, id, geheimnis, codes } = await eingerichtet();
    expect(await wiederherstellungNeu(store, id, codes[0], jetzt)).toMatchObject({ ok: false, fehler: "code" });
    expect(await wiederherstellungNeu(store, id, "", jetzt)).toMatchObject({ ok: false, fehler: "code" });
    jetzt += 60_000;
    const t = totpVon(geheimnis);
    const n = await wiederherstellungNeu(store, id, t, jetzt);
    expect(n.ok).toBe(true);
    expect(n.wiederherstellung).toHaveLength(10);
    for (const c of n.wiederherstellung) { expect(c).toMatch(FORMAT); expect(codes).not.toContain(c); }
    expect(await wiederherstellungNeu(store, id, t, jetzt)).toMatchObject({ ok: false, fehler: "wiederholt" });
    const e = await store.get(`zweifaktor:${id}`);
    expect(e.wiederherstellung.generation).toBe(2);
    for (const c of codes) expect((await zweifaktorPruefen(store, id, { code: c, ms: jetzt })).ok, "alter Code").toBe(false);
    expect((await zweifaktorPruefen(store, id, { code: n.wiederherstellung[0], ms: jetzt })).ok).toBe(true);
    expect((await zweifaktorStand(store, id, jetzt)).wiederherstellungUebrig).toBe(9);
  });

  it("ohne aktiven Faktor: keine Neugenerierung", async () => {
    const store = speicher();
    await zweifaktorBeginnen(store, "traeger-x", "Konto");
    expect(await wiederherstellungNeu(store, "traeger-x", "123456", jetzt)).toMatchObject({ ok: false, fehler: "nicht-aktiv" });
  });

  it("alte Generation zurückkopiert: prüft nicht (an Generation gebunden)", async () => {
    const { store, id, geheimnis, codes } = await eingerichtet();
    const alt = (await store.get(`zweifaktor:${id}`)).wiederherstellung;
    jetzt += 60_000;
    expect((await wiederherstellungNeu(store, id, totpVon(geheimnis), jetzt)).ok).toBe(true);
    const e = await store.get(`zweifaktor:${id}`);
    await store.setJSON(`zweifaktor:${id}`, { ...e, wiederherstellung: { ...alt, generation: 2 } });
    expect((await zweifaktorPruefen(store, id, { code: codes[0], ms: jetzt })).ok).toBe(false);
  });
});

describe("Altformat v1: kontrollierte Ablösung", () => {
  /** Ein Eintrag, wie ihn der Stand vor WR-1 schrieb. */
  async function mitAltformat() {
    const { store, id } = await eingerichtet();
    const v1 = ["ACDEF-GHJKL", "MNPQR-TUVWX"];
    const h = (c) => createHmac("sha256", PFEFFER).update(`wiederherstellung:${c.replace(/-/g, "")}`).digest("hex");
    const e = await store.get(`zweifaktor:${id}`);
    await store.setJSON(`zweifaktor:${id}`, { ...e, wiederherstellung: [h(v1[0]), null, h(v1[1])] });
    return { store, id, v1 };
  }

  it("bleibt lesbar und verbrauchbar, wird als Neugenerierung nötig gemeldet", async () => {
    const { store, id, v1 } = await mitAltformat();
    expect(await zweifaktorStand(store, id, jetzt)).toMatchObject({ wiederherstellungUebrig: 2,
      wiederherstellungFassung: 1, wiederherstellungNeuNoetig: true });
    expect(await zweifaktorPruefen(store, id, { code: v1[0], ms: jetzt })).toEqual({ ok: true, art: "wiederherstellung" });
    expect((await zweifaktorPruefen(store, id, { code: v1[0], ms: jetzt })).ok).toBe(false);
    expect((await zweifaktorStand(store, id, jetzt)).wiederherstellungUebrig).toBe(1);
  });

  it("nach der Neugenerierung: Fassung 2, Altcodes wertlos", async () => {
    const store = speicher();
    const id = "traeger-alt";
    const b = await zweifaktorBeginnen(store, id, "Konto");
    await zweifaktorBestaetigen(store, id, totpVon(b.geheimnis), jetzt);
    const v1 = "ACDEF-GHJKL";
    const h = createHmac("sha256", PFEFFER).update(`wiederherstellung:${v1.replace(/-/g, "")}`).digest("hex");
    const e = await store.get(`zweifaktor:${id}`);
    await store.setJSON(`zweifaktor:${id}`, { ...e, wiederherstellung: [h] });
    jetzt += 60_000;
    const n = await wiederherstellungNeu(store, id, totpVon(b.geheimnis), jetzt);
    expect(n.ok).toBe(true);
    expect((await store.get(`zweifaktor:${id}`)).wiederherstellung).toMatchObject({ v: 2 });
    expect((await zweifaktorPruefen(store, id, { code: v1, ms: jetzt })).ok).toBe(false);
    expect(await zweifaktorStand(store, id, jetzt)).toMatchObject({ wiederherstellungFassung: 2, wiederherstellungNeuNoetig: false });
  });
});
