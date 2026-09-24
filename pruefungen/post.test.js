/* ==========================================================================
   POST — der Versand und seine Schranke

   Zwei Dinge werden hier festgehalten:

   Der Trockenlauf. Ohne Versandschlüssel geht nichts hinaus, und zwar
   nachweislich nichts: Diese Prüfung ersetzt `fetch` durch einen Zähler und
   verlangt, dass er auf null bleibt. So läuft die Anwendung heute, und so
   soll sie laufen, bis ein Versanddienst beauftragt ist.

   Die Schranke vor CENTRIC_PRUEFLINK. Das ist ein absichtliches Leck für
   Prüfungen ohne Postfach — und deshalb dreifach verschlossen. Die dritte
   Bedingung ist die wichtige: In einer Auslieferung darf eine vergessene
   Variable niemals ein Geheimnis in eine Antwort schreiben.
   ========================================================================== */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sendeMail, anwendungsAdresse, pruefLinkErlaubt } from "../server/lib/post.mjs";

const UMGEBUNG = { ...process.env };
const echtesFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of ["RESEND_API_KEY", "CENTRIC_ABSENDER", "CENTRIC_BASIS",
    "CENTRIC_PRUEFLINK", "NODE_ENV"]) delete process.env[k];
  globalThis.fetch = echtesFetch;
});

afterAll(() => {
  globalThis.fetch = echtesFetch;
  for (const k of Object.keys(process.env)) if (!(k in UMGEBUNG)) delete process.env[k];
  Object.assign(process.env, UMGEBUNG);
});

describe("Trockenlauf ohne Versandschlüssel", () => {
  it("meldet Erfolg, kennzeichnet ihn als trocken und ruft nichts auf", async () => {
    let aufrufe = 0;
    globalThis.fetch = () => { aufrufe++; throw new Error("es darf nichts hinausgehen"); };
    const r = await sendeMail("max@example.org", "Betreff", "Text");
    expect(r).toMatchObject({ ok: true, trocken: true, an: "max@example.org",
      betreff: "Betreff" });
    expect(aufrufe).toBe(0);
  });
});

describe("Mit Versandschlüssel", () => {
  it("schickt genau eine Anfrage und gibt die Kennung zurück", async () => {
    process.env.RESEND_API_KEY = "schluessel-nur-zum-pruefen";
    process.env.CENTRIC_ABSENDER = "CENTRIC <post@example.org>";
    const gesehen = [];
    globalThis.fetch = async (url, o) => {
      gesehen.push({ url, o });
      return { ok: true, json: async () => ({ id: "m-1" }) };
    };
    const r = await sendeMail("max@example.org", "Betreff", "Text");
    expect(r).toEqual({ ok: true, id: "m-1" });
    expect(gesehen).toHaveLength(1);
    const rumpf = JSON.parse(gesehen[0].o.body);
    expect(rumpf).toMatchObject({ from: "CENTRIC <post@example.org>",
      to: ["max@example.org"], subject: "Betreff", text: "Text" });
    expect(gesehen[0].o.headers.authorization).toBe("Bearer schluessel-nur-zum-pruefen");
  });

  it("gibt einen abgewiesenen Versand als Antwort zurück, nicht als Ausnahme", async () => {
    process.env.RESEND_API_KEY = "x";
    globalThis.fetch = async () => ({ ok: false, text: async () => "abgewiesen: Domäne" });
    const r = await sendeMail("max@example.org", "B", "T");
    expect(r.ok).toBe(false);
    expect(r.fehler).toContain("abgewiesen");
  });

  it("überlebt einen Netzfehler, ohne zu werfen", async () => {
    process.env.RESEND_API_KEY = "x";
    globalThis.fetch = async () => { throw new Error("getaddrinfo ENOTFOUND"); };
    const r = await sendeMail("max@example.org", "B", "T");
    expect(r.ok).toBe(false);
    expect(r.fehler).toContain("ENOTFOUND");
  });

  it("kürzt eine ausführliche Fehlermeldung", async () => {
    process.env.RESEND_API_KEY = "x";
    globalThis.fetch = async () => ({ ok: false, text: async () => "y".repeat(5000) });
    const r = await sendeMail("max@example.org", "B", "T");
    expect(r.fehler.length).toBeLessThanOrEqual(200);
  });
});

describe("Die Adresse der Anwendung", () => {
  it("nimmt ohne Angabe die eigene Domäne — und niemals Netlify", () => {
    expect(anwendungsAdresse()).toBe("https://app.centric-dienstplanung.de");
    expect(anwendungsAdresse()).not.toContain("netlify");
  });

  it("folgt CENTRIC_BASIS und schneidet Schrägstriche am Ende ab", () => {
    process.env.CENTRIC_BASIS = "https://app.example.org///";
    expect(anwendungsAdresse()).toBe("https://app.example.org");
  });
});

describe("Die Schranke vor CENTRIC_PRUEFLINK", () => {
  it("bleibt zu, solange die Variable nicht ausdrücklich gesetzt ist", () => {
    expect(pruefLinkErlaubt()).toBe(false);
    process.env.CENTRIC_PRUEFLINK = "nein";
    expect(pruefLinkErlaubt()).toBe(false);
  });

  it("öffnet nur im Trockenlauf außerhalb der Produktion", () => {
    process.env.CENTRIC_PRUEFLINK = "ja";
    expect(pruefLinkErlaubt()).toBe(true);
    process.env.NODE_ENV = "test";
    expect(pruefLinkErlaubt()).toBe(true);
  });

  it("bleibt in production zu, auch wenn alles andere gesetzt ist", () => {
    process.env.CENTRIC_PRUEFLINK = "ja";
    process.env.NODE_ENV = "production";
    expect(pruefLinkErlaubt()).toBe(false);
  });

  it("bleibt bei aktivem Versand zu — dann geht der Link an das Postfach", () => {
    process.env.CENTRIC_PRUEFLINK = "ja";
    process.env.RESEND_API_KEY = "x";
    expect(pruefLinkErlaubt()).toBe(false);
  });
});
