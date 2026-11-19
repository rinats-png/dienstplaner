/* ==========================================================================
   INTELLIGENCE — NACHZIEHER AUS DEM DELTA-REVIEW WP-I11 (X3–X7, Befund 2)

   Tests gegen überlebende Mutanten:
   X3  leckpruefung: C1-Steuerzeichen zählen als fremde Schrift.
   X4  alias: sitzungPasst prüft den Raum des Betriebs.
   X5  faktenpaket: Wert einer Kennungs-Art, der eine Dienstart ist, wird Alias.
   X6  faktenpaket: ref, der eine Dienstart ist, wird Alias (auch außerhalb der Dienst-Felder).
   X7  alias: ungültiges MAC-Hex-Muster → KiFehler, kein RangeError.
   B2  Formatzeichen (Cf: U+00AD, U+200B–U+200F, U+2060, U+FEFF) umgehen die
       Sperrliste nicht („T­im“).
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { faktenpaketBilden } from "../server/lib/intelligence/faktenpaket.mjs";
import { sperrlisteBilden, textPruefen, normalisieren } from "../server/lib/intelligence/leckpruefung.mjs";
import { AliasKarte, rueckuebersetzen } from "../server/lib/intelligence/alias.mjs";

const SCHLUESSEL = Buffer.from("5b0e9c1d7a3f48e26c1b9d0a4e7f3c2b8a6d1e9f0c3b7a5d2e8f1c4b6a9d0e3f", "hex");
const MAC = Buffer.from("9a4c1e7b2d0f58a3c6e9b1d4f7a0c3e5b8d1f4a7c0e3b6d9f2a5c8e1b4d7f0a3", "hex");
const VERSIONEN = { engine: "0.0.0-attrappe", regelstand: "r-2026-11", tarifstand: "t-2026" };
const ZR = { von: "2026-11-01", bis: "2026-11-30" };
const DIENST_ALIAS = /^D_[BCDFGHJKLMNPQRSTVWXZ]{8}$/;

const betrieb = (extra = {}) => ({
  id: "m1", name: "Seniorenheim Sonnenhof", tarif: "basis",
  einheiten: [{ id: "e1", name: "Wohnbereich Lindenhof" }],
  dienstarten: [{ id: "F", start: "06:00", ende: "14:00" }, { id: "S", start: "14:00", ende: "22:00" }],
  zyklus: { tage: ["F", "S", "-"] },
  qualifikationen: [{ id: "F" }],
  personen: [
    { id: "l1", vorname: "Lena", nachname: "Brandt", rolle: "leitung", bereich: "e1", wochenstunden: 40 },
    { id: "a1", vorname: "Tim", nachname: "Weberknecht", rolle: "mitarbeiter", bereich: "e1", wochenstunden: 30, qualifikationen: ["F"] },
  ],
  abweichungen: {}, abwesenheiten: [],
  ...extra,
});
const bestand = (...m) => ({ version: 1, stand: 1, mandanten: m.length ? m : [betrieb()] });
const LEITUNG = { rolle: "leitung", person: "l1", bestand: "raum-a", betrieb: 0 };
const bilden = (o = {}) => faktenpaketBilden({ sitzung: LEITUNG, ladeBestand: () => bestand(), funktion: "F3",
  eingabe: { zeitraum: ZR }, kontext: "auftrag-1", aliasSchluessel: SCHLUESSEL, versionen: VERSIONEN, ...o });
const codeSync = (f) => { try { f(); return "ok"; } catch (e) { return e.code || (e && e.name) || String(e); } };
const SP = sperrlisteBilden(betrieb(), { raum: "raum-a" });
const kat = (text) => textPruefen(text, SP).befunde.map((b) => b.kategorie);

describe("X3: C1-Steuerzeichen sind fremde Schrift", () => {
  it("U+0080 bis U+009F verwerfen den Text als SCHRIFT; gewöhnlicher Text nicht", () => {
    for (const cp of [0x80, 0x85, 0x9f]) expect(kat(`Dienst ${String.fromCodePoint(cp)} frei`), `U+${cp.toString(16)}`).toContain("SCHRIFT");
    expect(kat("Dienst frei, Früh – Spät")).not.toContain("SCHRIFT");
  });
});

describe("X5/X6: Dienst-Opazität für Kennungs-Werte und ref", () => {
  it("Qualifikation, deren Kennung zugleich Dienstart ist, erscheint nie im Klartext (Wert und ref)", async () => {
    const { paket, aliasKarte } = await bilden({ funktion: "F1" });
    const q = paket.fakten.filter((f) => f.feld === "person.qualifikation");
    expect(q.length).toBeGreaterThan(0);
    for (const f of q) expect(f.wert, "kennung-wert").toBe(aliasKarte.alias("dienst", "F"));
    const r16 = await bilden({ funktion: "F16", eingabe: { zeitraum: ZR, fremdtext: ["Regel für Frühdienste"] } });
    const v = r16.paket.fakten.filter((f) => f.feld === "qualifikation.vorhanden");
    expect(v.length).toBeGreaterThan(0);
    for (const f of v) { expect(f.ref, "ref").toMatch(DIENST_ALIAS); expect(f.ref).toBe(r16.aliasKarte.alias("dienst", "F")); }
    expect(JSON.stringify(r16.paket)).not.toMatch(/"(F|S)"/);
    expect(JSON.stringify(paket)).not.toMatch(/"(F|S)"/);
  });
});

describe("X7: ungültiges MAC-Hex-Muster", () => {
  it("nicht-hex, zu kurz, zu lang, Großbuchstaben → KI_NICHT_GEFUNDEN, kein RangeError", () => {
    const k = new AliasKarte({ schluessel: SCHLUESSEL, raum: "raum-a", betriebId: "m1", betriebIndex: 0, kontext: "auftrag-1" });
    k.alias("person", "a1");
    const d = JSON.parse(JSON.stringify(k.fuerServerSpeicher(MAC)));
    for (const mac of ["z".repeat(64), "ab", "", d.mac.slice(0, 62), d.mac + "00", d.mac.toUpperCase(), 12345, null])
      expect(codeSync(() => AliasKarte.ausServerSpeicher({ ...d, mac }, MAC)), String(mac)).toBe("KI_NICHT_GEFUNDEN");
    expect(AliasKarte.ausServerSpeicher(d, MAC).groesse).toBe(1);
  });
});

describe("X4: Rückübersetzung prüft den Raum des Betriebs", () => {
  it("Betrieb mit abweichendem raum → KI_NICHT_GEFUNDEN; gleicher raum oder keiner → ok", async () => {
    const { aliasKarte } = await bilden({ funktion: "F3" });
    const a = aliasKarte.alias("person", "a1");
    const ruck = (b) => rueckuebersetzen({ ergebnis: `{{person:${a}}}`, karte: aliasKarte, sitzung: LEITUNG, funktion: "F3", bestand: b });
    expect(ruck(bestand(betrieb()))).toBe("{{person:a1}}");
    expect(ruck(bestand(betrieb({ raum: "raum-a" })))).toBe("{{person:a1}}");
    expect(codeSync(() => ruck(bestand(betrieb({ raum: "raum-b" }))))).toBe("KI_NICHT_GEFUNDEN");
  });
});

describe("Befund 2: Formatzeichen (Cf) umgehen die Sperrliste nicht", () => {
  const CF = [0x00ad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff];
  it("normalisieren entfernt Formatzeichen", () => {
    for (const cp of CF) expect(normalisieren(`T${String.fromCodePoint(cp)}im`), `U+${cp.toString(16)}`).toBe("tim");
  });
  it("„T<Cf>im“ und „Weber<Cf>knecht“ werden als Klarname erkannt", () => {
    for (const cp of CF) {
      const c = String.fromCodePoint(cp);
      expect(kat(`Frage an T${c}im heute`), `Tim U+${cp.toString(16)}`).toContain("KLARNAME");
      expect(kat(`Weber${c}knecht ist frei`), `Weberknecht U+${cp.toString(16)}`).toContain("KLARNAME");
    }
  });
});

describe("Befund 1: Umlaute im Text in beiden Schreibweisen", () => {
  it("Name ohne Umlaut in den Daten (Schafer), Text mit Umlaut (Schäfer) wird erkannt", () => {
    const sp = sperrlisteBilden(betrieb({ personen: [{ id: "x1", vorname: "Jorg", nachname: "Schafer", rolle: "mitarbeiter" }] }), { raum: "raum-a" });
    expect(textPruefen("dienst von schäfer morgen", sp).befunde.map((b) => b.kategorie)).toContain("KLARNAME");
    expect(textPruefen("dienst von schaefer morgen", sp).befunde.map((b) => b.kategorie)).not.toContain("KLARNAME");
  });
});
