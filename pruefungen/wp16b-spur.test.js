/* ==========================================================================
   WP-16b — SPUR OHNE TAG (Datenschutz nach WP-14b M1)

   Keine Spur-Zeile nennt Person|Tag; Altzeilen werden beim Lesen (Betreiber-Lage) geschwärzt. Der Tag steht nur
   im eigenen Feld `tag` (Auskunft nach Art. 15), nie im Text.
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { aufbauen } from "./wp16-folge-harness.mjs";
import { spurFuerBetreiber } from "../server/lib/schutz.mjs";

const TAG_IM_TEXT = /\d{4}-\d{2}-\d{2}/;
let h;
beforeAll(async () => { h = await aufbauen("wp16b", "2026-11-10T09:00:00Z"); }, 60000);
afterAll(async () => { if (h) await h.abbauen(); });

describe("Altzeilen beim Lesen geschwärzt", () => {
  it("Tag im Text, Person|Tag und Uhrzeit verschwinden; Monat und Ausgang bleiben", () => {
    const alt = [
      { zeit: "2026-11-01T10:00:00Z", art: "schreiben", ausgang: "abgewiesen", zusatz: "stempeln start 2026-11-02: STEMPEL_SCHON", person: "a1", tag: "2026-11-02" },
      { zeit: "x", art: "schreiben", ausgang: "abgewiesen", zusatz: "Zeit bestätigen 2026-11-03: schon erfasst" },
      { zeit: "x", art: "schreiben", ausgang: "abgewiesen", zusatz: "Selbstauskunft Zeiten: 2026-11-03 um 06:00" },
      { zeit: "x", art: "schreiben", ausgang: "abgewiesen", zusatz: "Stempel-Integrität a1|2026-11-02: Ein Stempel ist ein Beleg." },
      { zeit: "x", art: "schreiben", ausgang: "abgewiesen", zusatz: "Monat abgeschlossen 2026-10" },
    ];
    const aus = alt.map(spurFuerBetreiber);
    for (const z of aus) {
      expect(z.zusatz).not.toMatch(TAG_IM_TEXT);
      expect(z.zusatz).not.toMatch(/[|]/);
      expect(z.tag).toBeUndefined();
      expect(z.person).toBeUndefined();
    }
    expect(aus[4].zusatz).toBe("Monat abgeschlossen 2026-10");
    expect(aus[0].ausgang).toBe("abgewiesen");
  });
});

describe("Schreibweg Stempel-Integrität (HTTP)", () => {
  it("abgewiesenes PUT gegen einen Stempel: Spur ohne Person|Tag im Text, Tag nur im Feld, Betreiber-Lage ohne Tag", async () => {
    await h.raum("s1", [h.person("a1"), h.person("l1", "leitung")], { abweichungen: { "a1|2026-11-10": "F" } });
    h.zeitAuf("2026-11-10T05:00:00Z");
    expect((await h.anfrage("stempeln", { token: await h.token("s1", "a1"), rumpf: { art: "start" } })).status).toBe(200);
    const t = await h.token("s1", "l1", "leitung");
    const g = await h.anfrage("bestand", { methode: "GET", token: t });
    const b = JSON.parse(JSON.stringify(g.bestand));
    b.mandanten[0].einstempeln["a1|2026-11-10"].start = "05:00";
    const r = await h.anfrage("bestand", { methode: "PUT", token: t, rumpf: { bestand: b, etag: g.etag } });
    expect([r.status, r.code]).toEqual([403, "STEMPEL_UNVERAENDERLICH"]);
    const z = (await h.spur("2026-11-10")).filter((x) => /^Stempel-Integrität/.test(x.zusatz || ""));
    expect(z.length).toBe(1);
    expect(z[0].zusatz).not.toMatch(/[|]/);
    expect(z[0].zusatz).not.toMatch(TAG_IM_TEXT);
    expect(z[0].tag).toBe("2026-11-10");
    const b2 = spurFuerBetreiber(z[0]);
    expect(b2.tag).toBeUndefined();
    expect(b2.zusatz).not.toMatch(/a1/);
  });
  it("kein Schreibweg in daten.mjs setzt einen Schlüssel oder Tag in den Text der Spur", async () => {
    const q = await readFile(path.join(process.cwd(), "server/funktionen/daten.mjs"), "utf8");
    expect(q).not.toContain("Stempel-Integrität${");
    expect(q).not.toMatch(/protokoll\([^;]*`[^`]*\$\{(datum|geraeteDatum|zielDatum|tag)\}/);
  });
});
