/* ==========================================================================
   EINLADUNGSTOKEN — Ausstellen und Einlösen

   Gegen einen nachgebauten Speicher, weil die Logik keinen echten
   braucht: Ein Token muss nach dem ersten Einlösen weg sein, nach der
   Frist nichts mehr gelten, bei falschem Zweck schweigen — und im
   Speicher darf nur die Prüfsumme liegen, nie das Token selbst.
   ========================================================================== */
import { describe, it, expect } from "vitest";
import { tokenAusstellen, tokenEinloesen } from "../netlify/lib/einladungen.mjs";

function speicherNachbau() {
  const ablage = new Map();
  return {
    async setJSON(k, v) { ablage.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return ablage.has(k) ? ablage.get(k) : null; },
    async delete(k) { ablage.delete(k); },
    alles: () => JSON.stringify([...ablage.entries()]),
  };
}

describe("Einladungstoken", () => {
  it("stellt aus und löst genau einmal ein", async () => {
    const s = speicherNachbau();
    const t = await tokenAusstellen(s, { konto: "mail:abc", zweck: "einladung", nr: 1, minuten: 60 });
    expect(t.length).toBeGreaterThan(30);
    const erst = await tokenEinloesen(s, t, "einladung");
    expect(erst).toMatchObject({ konto: "mail:abc", nr: 1 });
    const zweit = await tokenEinloesen(s, t, "einladung");
    expect(zweit).toBeNull();
  });
  it("legt nur die Prüfsumme ab, nie das Token", async () => {
    const s = speicherNachbau();
    const t = await tokenAusstellen(s, { konto: "mail:abc", zweck: "einladung", nr: 1, minuten: 60 });
    expect(s.alles().includes(t)).toBe(false);
    expect(s.alles().includes("einladung:")).toBe(true);
  });
  it("weist einen fremden Zweck ab und verbraucht das Token dabei", async () => {
    const s = speicherNachbau();
    const t = await tokenAusstellen(s, { konto: "mail:abc", zweck: "einladung", nr: 2, minuten: 60 });
    expect(await tokenEinloesen(s, t, "zuruecksetzen")).toBeNull();
    expect(await tokenEinloesen(s, t, "einladung")).toBeNull();
  });
  it("weist ein abgelaufenes Token ab", async () => {
    const s = speicherNachbau();
    const t = await tokenAusstellen(s, { konto: "mail:abc", zweck: "einladung", nr: 1, minuten: -1 });
    expect(await tokenEinloesen(s, t, "einladung")).toBeNull();
  });
  it("weist Unsinn ab, statt zu werfen", async () => {
    const s = speicherNachbau();
    expect(await tokenEinloesen(s, null, "einladung")).toBeNull();
    expect(await tokenEinloesen(s, "kurz", "einladung")).toBeNull();
    expect(await tokenEinloesen(s, "x".repeat(60), "einladung")).toBeNull();
  });
});
