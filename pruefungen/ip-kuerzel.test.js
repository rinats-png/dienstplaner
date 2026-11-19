/* ==========================================================================
   IP-KÜRZEL (T-04, Zusatzbefund Z-01)

   Das Kürzel einer Adresse war ein ungesalzener SHA-256 auf 64 Bit — für
   IPv4 durch Durchprobieren rückführbar. Jetzt HMAC mit einem aus
   CENTRIC_PFEFFER abgeleiteten, zweckgetrennten Schlüssel. Geprüft:
     - ohne Schlüssel nicht nachrechenbar (Brute-Force-Gegenprobe),
     - gleiche Adresse → gleiches Kürzel (die Bremse zählt je Herkunft),
     - anderer Pfeffer → anderes Kürzel,
     - ohne Pfeffer der bisherige Hash (fail-safe: die Bremse zählt weiter).
   ========================================================================== */

import { describe, it, expect, afterEach } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { adressKuerzel, kennung } from "../server/lib/schutz.mjs";

const sha = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 16);
const vorher = process.env.CENTRIC_PFEFFER;
afterEach(() => {
  if (vorher === undefined) delete process.env.CENTRIC_PFEFFER;
  else process.env.CENTRIC_PFEFFER = vorher;
});

const anfrage = (ip) => ({ headers: new Headers({ "x-forwarded-for": ip }) });

describe("IP-Kürzel mit Servergeheimnis", () => {
  it("gleiche Adresse ergibt gleiches Kürzel, verschiedene Adressen verschiedene", () => {
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    expect(adressKuerzel("203.0.113.7")).toBe(adressKuerzel("203.0.113.7"));
    expect(adressKuerzel("203.0.113.7")).not.toBe(adressKuerzel("203.0.113.8"));
    expect(adressKuerzel("203.0.113.7")).toMatch(/^[0-9a-f]{16}$/);
    expect(kennung(anfrage("203.0.113.7"), null)).toBe(kennung(anfrage("203.0.113.7"), null));
    expect(kennung(anfrage("203.0.113.7"), null)).toBe(`a:${adressKuerzel("203.0.113.7")}`);
  });

  it("ist nicht der ungesalzene Hash und auch kein HMAC direkt mit dem Pfeffer", () => {
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    const k = adressKuerzel("198.51.100.23");
    expect(k).not.toBe(sha("198.51.100.23"));
    /* Domänentrennung: der Schlüssel ist abgeleitet, nicht der Pfeffer selbst. */
    expect(k).not.toBe(createHmac("sha256", "pruef-pfeffer-eins").update("198.51.100.23").digest("hex").slice(0, 16));
  });

  it("verschiedene Pfeffer ergeben verschiedene Kürzel", () => {
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    const a = adressKuerzel("192.0.2.1");
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-zwei";
    const b = adressKuerzel("192.0.2.1");
    expect(a).not.toBe(b);
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    expect(adressKuerzel("192.0.2.1")).toBe(a);
  });

  it("IPv4-Brute-Force: ohne Schlüssel findet Durchprobieren die Adresse nicht", () => {
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    const ziel = "10.20.131.77";
    const kNeu = adressKuerzel(ziel);
    const kAlt = sha(ziel);
    /* Durchprobieren eines /16 (65 536 Adressen) mit dem ungesalzenen Hash:
       Das alte Kürzel fällt, das neue nicht. */
    let trefferAlt = null, trefferNeu = null;
    for (let c = 0; c < 256; c++) {
      for (let d = 0; d < 256; d++) {
        const ip = `10.20.${c}.${d}`;
        const h = sha(ip);
        if (h === kAlt) trefferAlt = ip;
        if (h === kNeu) trefferNeu = ip;
      }
    }
    expect(trefferAlt).toBe(ziel);
    expect(trefferNeu).toBeNull();
  });

  it("ohne Pfeffer bleibt es beim bisherigen Hash — die Bremse zählt weiter", () => {
    delete process.env.CENTRIC_PFEFFER;
    expect(adressKuerzel("203.0.113.7")).toBe(sha("203.0.113.7"));
    expect(kennung(anfrage("203.0.113.7"), null)).toBe(`a:${sha("203.0.113.7")}`);
  });

  it("Sitzungskennungen bleiben unverändert (persistente Vergleiche, raumKennung)", () => {
    process.env.CENTRIC_PFEFFER = "pruef-pfeffer-eins";
    expect(kennung(anfrage("203.0.113.7"), { bestand: "raum-1" })).toBe(`s:${sha("raum-1")}`);
  });
});
