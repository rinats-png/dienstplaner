/* ==========================================================================
   KONTOWIEDERHERSTELLUNG — Oberfläche (WR-6)

   Geprüft wird ohne Browser:
     1. die reine Logik (src/lib/verlustweg.js): Anfragen, Eingaben, Deutung der Antworten, Erreichbarkeit,
        im Abgleich mit dem Server (server/lib/kontowiederherstellung*.mjs), damit beide Seiten nicht auseinanderlaufen;
     2. was React tatsächlich ausgibt (renderToStaticMarkup) für Träger, Leitung und den Einhängepunkt;
     3. dass die neuen Quelltexte nichts speichern oder protokollieren und nichts in die Adresse schreiben.
   Die Bedienung im Browser (aufklappen, tippen, absenden) misst pruefungen/browser/verlustweg-wr6.mjs von Hand.
   Alle Personen und Nummern sind erfunden.
   ========================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let L;          // src/lib/verlustweg.js
let V;          // src/verlustweg.jsx
let Z;          // src/betreiber-2fa.jsx
let S;          // server/lib/kontowiederherstellung.mjs
let ZUGANG;     // server/lib/kontowiederherstellung-zugang.mjs
beforeAll(async () => {
  process.env.CENTRIC_DATEN = await mkdtemp(path.join(tmpdir(), "centric-wr6-"));
  L = await import("../src/lib/verlustweg.js");
  V = await import("../src/verlustweg.jsx");
  Z = await import("../src/betreiber-2fa.jsx");
  S = await import("../server/lib/kontowiederherstellung.mjs");
  ZUGANG = await import("../server/lib/kontowiederherstellung-zugang.mjs");
}, 120000);

const FALL = "F-ABCDEFGH23456789".slice(0, 18);               // F- und 16 Zeichen
const TOKEN = "A".repeat(20) + "b".repeat(20) + "_-9";       // 43 Zeichen, base64url, Kleinschreibung zählt
const F = { text: "#111", dim: "#444", line: "#999", bg: "#fff", accent: "#06c", aufAkzent: "#fff" };

/** Bausteine wie in betreiber-2fa.jsx (ZUI), ohne Farbkontext. */
const UI = {
  H1: ({ children }) => h("h1", null, children),
  Card: ({ children }) => h("div", null, children),
  CardHead: ({ children }) => h("div", null, children),
  Field: ({ label, hint, children }) => h("label", null, h("span", null, label), children, hint && h("span", null, hint)),
  Inp: (p) => h("input", p),
  Btn: ({ kind, children, ...p }) => h("button", p, children),
};
const html = (el) => renderToStaticMarkup(el);

describe("Anfragen bauen und Eingaben prüfen", () => {
  it("melden und zurückziehen tragen nur Zugangscode und Aktion", () => {
    for (const a of [L.AKTION.melden, L.AKTION.zurueckziehen]) {
      const r = L.verlustAnfrage(a, { zugangscode: "  abcd-efgh-jklm ", code: "123456", fall: FALL, personalnummer: "P1" });
      expect(r).toEqual({ ok: true, koerper: { zugangscode: "ABCD-EFGH-JKLM", zweifaktorAktion: a } });
    }
  });
  it("ohne Zugangscode keine Anfrage", () => {
    for (const a of Object.values(L.AKTION)) expect(L.verlustAnfrage(a, {}).ok).toBe(false);
    expect(L.verlustAnfrage("verlust-unbekannt", { zugangscode: "X" }).ok).toBe(false);
  });
  it("einlösen: Token genau 43 Zeichen, Groß-/Kleinschreibung bleibt, Name der Server-Eigenschaft ist freigabe", () => {
    const r = L.verlustAnfrage(L.AKTION.einloesen, { zugangscode: "a", token: ` ${TOKEN} ` });
    expect(r).toEqual({ ok: true, koerper: { zugangscode: "A", zweifaktorAktion: "verlust-einloesen", freigabe: TOKEN } });
    for (const t of ["", TOKEN.slice(1), TOKEN + "x", TOKEN.replace("A", "!"), "+".repeat(43)])
      expect(L.verlustAnfrage(L.AKTION.einloesen, { zugangscode: "a", token: t })).toMatchObject({ ok: false, feld: "token" });
  });
  it("bestätigen: genau sechs Ziffern, Leerzeichen werden entfernt", () => {
    expect(L.verlustAnfrage(L.AKTION.bestaetigen, { zugangscode: "a", code: "123 456" }))
      .toEqual({ ok: true, koerper: { zugangscode: "A", zweifaktorAktion: "bestaetigen", zweifaktor: "123456" } });
    for (const c of ["", "12345", "1234567", "12345a", "ABCD-EFGH-JKLM"])
      expect(L.verlustAnfrage(L.AKTION.bestaetigen, { zugangscode: "a", code: c })).toMatchObject({ ok: false, feld: "code" });
  });
  it("freigeben: alle Pflichtangaben, Aktenzeichen freiwillig und nur in zulässiger Form", () => {
    const ok = { zugangscode: "z", code: "654321", fall: ` ${FALL.toLowerCase()} `, personalnummer: " P-0042 ", verfahren: "rueckruf" };
    expect(L.verlustAnfrage(L.AKTION.freigeben, ok)).toEqual({ ok: true, koerper: { zugangscode: "Z",
      zweifaktorAktion: "verlust-freigeben", zweifaktor: "654321", fall: FALL, personalnummer: "P-0042", verfahren: "rueckruf" } });
    expect(L.verlustAnfrage(L.AKTION.freigeben, { ...ok, aktenzeichen: "AZ/2026-17" }).koerper.aktenzeichen).toBe("AZ/2026-17");
    expect(L.verlustAnfrage(L.AKTION.freigeben, { ...ok, aktenzeichen: "   " }).koerper).not.toHaveProperty("aktenzeichen");
    const nein = (extra, feld) => expect(L.verlustAnfrage(L.AKTION.freigeben, { ...ok, ...extra })).toMatchObject({ ok: false, feld });
    nein({ code: "12345" }, "code");
    nein({ fall: "F-ZZ" }, "fall");
    nein({ fall: "F-" + "0".repeat(16) }, "fall");       // 0 und 1 gibt es im Alphabet nicht
    nein({ personalnummer: "  " }, "personalnummer");
    nein({ personalnummer: "9".repeat(41) }, "personalnummer");
    nein({ verfahren: "" }, "verfahren");
    nein({ verfahren: "email" }, "verfahren");
    nein({ aktenzeichen: "mit Leerzeichen" }, "aktenzeichen");
    nein({ aktenzeichen: "A".repeat(41) }, "aktenzeichen");
  });
  it("ablehnen: Grund aus der festen Liste, kein Verfahren, kein Aktenzeichen", () => {
    const ok = { zugangscode: "z", code: "654321", fall: FALL, personalnummer: "P-1", grund: "sonstiges", verfahren: "persoenlich", aktenzeichen: "A1" };
    const r = L.verlustAnfrage(L.AKTION.ablehnen, ok);
    expect(r).toEqual({ ok: true, koerper: { zugangscode: "Z", zweifaktorAktion: "verlust-ablehnen", zweifaktor: "654321",
      fall: FALL, personalnummer: "P-1", grund: "sonstiges" } });
    expect(L.verlustAnfrage(L.AKTION.ablehnen, { ...ok, grund: "frei formuliert" })).toMatchObject({ ok: false, feld: "grund" });
    expect(L.verlustAnfrage(L.AKTION.ablehnen, { ...ok, personalnummer: "" })).toMatchObject({ ok: false, feld: "personalnummer" });
  });
  it("Form und Listen entsprechen dem Server", () => {
    expect(L.VERFAHREN.map((v) => v.wert)).toEqual([...S.VERFAHREN]);
    expect(L.ABLEHNUNGSGRUENDE.map((g) => g.wert)).toEqual([...S.ABLEHNUNGSGRUENDE]);
    expect(L.AKTENZEICHEN_MUSTER.source).toBe(S.AKTENZEICHEN_MUSTER.source);
    expect(L.FALL_MUSTER.source).toBe(S.FALL_MUSTER.source);
    expect(L.AKTION.melden).toBe("verlust-melden");
    for (const a of ["melden", "zurueckziehen", "freigeben", "ablehnen", "einloesen"]) expect(ZUGANG.VERLUST_AKTIONEN).toContain(L.AKTION[a]);
    expect(L.ANTRAG_STUNDEN * 3600000).toBe(S.ANTRAG_FRIST_MS);
    expect(L.TOKEN_MINUTEN * 60000).toBe(S.TOKEN_FRIST_MS);
    for (let i = 0; i < 200; i++) {
      expect(L.FALL_MUSTER.test(S.fallKennungNeu())).toBe(true);
      expect(L.TOKEN_MUSTER.test(randomBytes(32).toString("base64url"))).toBe(true);
    }
  });
});

describe("Antworten deuten", () => {
  const A = (aktion, status, d) => L.verlustAntwort(aktion, status, d);
  it("melden: Fallnummer und Frist, sonst nichts", () => {
    expect(A(L.AKTION.melden, 200, { ok: true, fall: FALL, gueltigBis: "2026-11-12T10:00:00.000Z", hinweis: "x", token: "geheim" }))
      .toEqual({ art: "ok", daten: { stufe: "gemeldet", fall: FALL, gueltigBis: "2026-11-12T10:00:00.000Z" } });
  });
  it("freigeben: erste Freigabe ohne Token, zweite mit Token; die Person nur aus der Antwort und nur drei Felder", () => {
    const t = { vorname: "Erika", nachname: "Muster", einheit: "Station 3", personalnummer: "P-7", id: "x" };
    expect(A(L.AKTION.freigeben, 200, { ok: true, stand: "teilfreigegeben", traeger: t }))
      .toEqual({ art: "ok", daten: { stufe: "teilfreigegeben", traeger: { vorname: "Erika", nachname: "Muster", einheit: "Station 3" } } });
    const z = A(L.AKTION.freigeben, 200, { ok: true, stand: "freigegeben", traeger: t, freigabe: TOKEN, gueltigBis: "2026-11-11T10:15:00.000Z" });
    expect(z).toEqual({ art: "ok", daten: { stufe: "freigegeben", traeger: { vorname: "Erika", nachname: "Muster", einheit: "Station 3" },
      freigabe: TOKEN, gueltigBis: "2026-11-11T10:15:00.000Z" } });
    expect(JSON.stringify(z)).not.toContain("P-7");
    /* „freigegeben" ohne Token ist keine zweite Freigabe, die die Oberfläche anzeigen dürfte */
    expect(A(L.AKTION.freigeben, 200, { ok: true, stand: "freigegeben", traeger: t }).daten.stufe).toBe("teilfreigegeben");
  });
  it("ablehnen, zurückziehen, einlösen, bestätigen", () => {
    expect(A(L.AKTION.ablehnen, 200, { ok: true, stand: "abgelehnt", traeger: { vorname: "E", nachname: "M" } }).daten)
      .toEqual({ stufe: "abgelehnt", traeger: { vorname: "E", nachname: "M", einheit: null } });
    expect(A(L.AKTION.zurueckziehen, 200, { ok: true }).daten).toEqual({ stufe: "zurueckgezogen" });
    expect(A(L.AKTION.einloesen, 200, { ok: true, geheimnis: "JBSWY3DP", otpauth: "otpauth://totp/x?secret=JBSWY3DP", hinweis: "h" }).daten)
      .toEqual({ stufe: "eingeloest", geheimnis: "JBSWY3DP", otpauth: "otpauth://totp/x?secret=JBSWY3DP" });
    expect(A(L.AKTION.einloesen, 200, { ok: true }).art).toBe("fehler");                          // ohne Geheimnis nie „ok"
    expect(A(L.AKTION.bestaetigen, 200, { ok: true, wiederherstellung: ["AAAA-BBBB", 7, "CCCC-DDDD"], token: "x" }).daten)
      .toEqual({ stufe: "bestaetigt", wiederherstellung: ["AAAA-BBBB", "CCCC-DDDD"] });
    for (const a of Object.values(L.AKTION)) expect(A(a, 200, {}).art).not.toBe("ok");           // 200 ohne Inhalt ist kein Erfolg
  });
  it("Erreichbarkeit: 403 ohne das „nein“ einer Freigabe heißt nicht verfügbar — mit neutralem Text, ohne Serverwort", () => {
    for (const a of [L.AKTION.melden, L.AKTION.zurueckziehen, L.AKTION.freigeben, L.AKTION.ablehnen, L.AKTION.einloesen]) {
      const r = A(a, 403, { fehler: "Der Verlustweg ist auf diesem Server nicht freigeschaltet. Bitte an die Organisationsleitung wenden.", zweifaktor: "gesperrt" });
      expect(r).toEqual({ art: "nicht-verfuegbar", text: L.TEXT_NICHT_VERFUEGBAR });
    }
    expect(L.TEXT_NICHT_VERFUEGBAR).not.toMatch(/freigeschaltet|Schalter|Betreiber|Server|deaktiviert/i);
    /* das allgemeine „nein“ einer Freigabe (403, verlust: nein) ist kein Hinweis auf den Schalter */
    expect(A(L.AKTION.freigeben, 403, { fehler: "Diese Freigabe ist nicht möglich.", verlust: "nein" }))
      .toEqual({ art: "fehler", text: "Diese Freigabe ist nicht möglich." });
  });
  it("neutrale Serverantworten unverändert, Bremse, Netz, Unbekanntes", () => {
    expect(A(L.AKTION.einloesen, 401, { fehler: "Die Freigabe stimmt nicht oder gilt nicht mehr.", verlust: "falsch" }))
      .toEqual({ art: "fehler", text: "Die Freigabe stimmt nicht oder gilt nicht mehr." });
    expect(A(L.AKTION.freigeben, 401, { fehler: "Der zweite Faktor stimmt nicht." }).text).toBe("Der zweite Faktor stimmt nicht.");
    expect(A(L.AKTION.melden, 409, { fehler: "Für diesen Zugang läuft bereits ein Fall." }).text).toBe("Für diesen Zugang läuft bereits ein Fall.");
    expect(A(L.AKTION.melden, 429, { fehler: "zu viele Anfragen", text: "Bitte in 40 Sekunden erneut versuchen." }))
      .toEqual({ art: "bremse", text: "Bitte in 40 Sekunden erneut versuchen." });
    expect(A(L.AKTION.melden, 0, {}).text).toBe("Keine Verbindung zum Server.");
    expect(A(L.AKTION.melden, 500, null).art).toBe("fehler");
    expect(A(L.AKTION.melden, 502, { fehler: 7 }).text).toMatch(/nicht geklappt/);
  });
  it("Antworten für unbekannt, fremd und unzulässig bleiben für die Oberfläche gleich (kein Orakel)", () => {
    const nein = { fehler: "Diese Freigabe ist nicht möglich.", verlust: "nein" };
    const a = A(L.AKTION.freigeben, 403, nein), b = A(L.AKTION.ablehnen, 403, { ...nein });
    expect(a).toEqual(b);
    expect(a).not.toHaveProperty("daten");
  });
  it("Anzeigeformate", () => {
    expect(L.zeitText("2026-11-12T10:30:00.000Z")).toBe("12.11.2026, 11:30 Uhr");      // Winterzeit Europe/Berlin
    expect(L.zeitText("2026-07-01T10:30:00.000Z")).toBe("01.07.2026, 12:30 Uhr");      // Sommerzeit
    expect(L.zeitText("kein Datum")).toBe("");
    expect(L.traegerZeile({ vorname: "Erika", nachname: "Muster", einheit: "Station 3" })).toBe("Erika Muster · Einheit Station 3");
    expect(L.traegerZeile({ vorname: "", nachname: "", einheit: "" })).toBe("");
    expect(L.traegerZeile(null)).toBe("");
  });
});

describe("Absenden (fetch ersetzt)", () => {
  const antwort = (status, d) => ({ status, json: async () => d });
  it("eine gültige Anfrage geht an /api/anmelden, ohne Cookies und ohne Zwischenspeicher", async () => {
    const aufrufe = [];
    const holen = async (url, opt) => { aufrufe.push([url, opt]); return antwort(200, { ok: true, fall: FALL, gueltigBis: "2026-11-12T10:00:00Z" }); };
    const r = await L.verlustSenden(L.AKTION.melden, { zugangscode: "abcd-efgh-jklm" }, holen);
    expect(r.art).toBe("ok");
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0][0]).toBe("/api/anmelden");
    expect(aufrufe[0][1]).toMatchObject({ method: "POST", cache: "no-store", credentials: "omit" });
    expect(aufrufe[0][0]).not.toMatch(/[?#]/);                         // nichts in der Adresse
    expect(JSON.parse(aufrufe[0][1].body)).toEqual({ zugangscode: "ABCD-EFGH-JKLM", zweifaktorAktion: "verlust-melden" });
  });
  it("eine ungültige Eingabe wird nicht abgeschickt", async () => {
    let n = 0;
    const r = await L.verlustSenden(L.AKTION.freigeben, { zugangscode: "z", code: "1" }, async () => { n++; return antwort(200, {}); });
    expect(n).toBe(0);
    expect(r).toMatchObject({ art: "eingabe", feld: "code" });
  });
  it("Netzfehler und kaputtes JSON werfen nie", async () => {
    expect((await L.verlustSenden(L.AKTION.melden, { zugangscode: "z" }, async () => { throw new Error("boom"); })).text)
      .toBe("Keine Verbindung zum Server.");
    const r = await L.verlustSenden(L.AKTION.melden, { zugangscode: "z" }, async () => ({ status: 502, json: async () => { throw new Error("x"); } }));
    expect(r.art).toBe("fehler");
    expect((await L.verlustSenden(L.AKTION.melden, { zugangscode: "z" }, undefined)).art).toMatch(/fehler|ok/);
  });
  it("Server mit ausgeschaltetem Schalter: die echte Antwort des Servers wird als „nicht verfügbar“ gedeutet", async () => {
    delete process.env.CENTRIC_KONTOWIEDERHERSTELLUNG;
    const aufrufe = [];
    for (const aktion of Object.values(L.AKTION).filter((a) => a.startsWith("verlust-"))) {
      const serverAntwort = await ZUGANG.verlustAktion({ store: {}, k: "k", rumpf: {}, aktion, id: "a".repeat(64), vermerk: true, stand: {},
        kontext: {}, name: "n", sitzungenBeenden: async () => ({ beendet: 0, fehler: 0 }), codeRichtig: async () => {}, faktorIdFuer: (s) => s });
      expect(serverAntwort.status).toBe(403);
      const d = await serverAntwort.json();
      const r = await L.verlustSenden(aktion, { zugangscode: "z", code: "123456", fall: FALL, personalnummer: "P", verfahren: "persoenlich",
        grund: "sonstiges", token: TOKEN }, async () => { aufrufe.push(aktion); return { status: serverAntwort.status, json: async () => d }; });
      expect(r, aktion).toEqual({ art: "nicht-verfuegbar", text: L.TEXT_NICHT_VERFUEGBAR });
    }
    expect(aufrufe).toHaveLength(5);
  });
  it("Betreibercode: derselbe Server-403 — dieselbe Sperre, kein eigener Weg für den Betreiber", async () => {
    const serverAntwort = await ZUGANG.verlustAktion({ store: {}, k: "k", rumpf: {}, aktion: "verlust-melden", id: "b".repeat(64), vermerk: false,
      stand: {}, kontext: null, name: "n", sitzungenBeenden: async () => ({ beendet: 0, fehler: 0 }), codeRichtig: async () => {}, faktorIdFuer: (s) => s });
    expect(serverAntwort.status).toBe(403);
    expect(L.verlustAntwort("verlust-melden", 403, await serverAntwort.json()).art).toBe("nicht-verfuegbar");
  });
});

describe("Wiedergabe", () => {
  it("Träger: Vier-Augen-Prinzip, 24 Stunden, Schritte; Einmalfelder ohne Vorschläge; nichts vorbelegt", () => {
    const m = html(h(V.VerlustTraeger, { ui: UI, gesperrt: false, sperren: () => {} }));
    expect(m).toContain("Vier-Augen-Prinzip");
    expect(m).toContain("24 Stunden");
    expect(m).toContain("zwei Leitungen");
    expect(m).toMatch(/persönlich, per Rückruf oder\s+schriftlich/);
    expect(m).toContain("Antrag stellen");
    expect(m).toContain("Antrag zurückziehen");
    expect(m).toContain("Freigabe einlösen");
    expect(m).toMatch(/autoComplete="off"/i);
    expect(m).not.toContain("one-time-code");
    for (const feld of m.match(/<input[^>]*>/g) || [])                           // nichts vorbelegt außer den Auswahlfeldern
      if (!/type="radio"/.test(feld)) expect(feld).not.toMatch(/value="[^"]+"/);
    expect(m).not.toContain("data-einmal");                                    // Fallnummer, Token, Geheimnis, Codes erst nach Antwort
    expect(m).toMatch(/<input[^>]*type="password"/);                          // Zugangscode verdeckt
    expect(m).not.toMatch(/F-[A-Z2-9]{16}/);
  });
  it("Träger: nicht verfügbar — nichts zu bedienen", () => {
    expect(html(h(V.VerlustTraeger, { ui: UI, gesperrt: true, sperren: () => {} }))).toBe("");
    expect(html(h(V.VerlustFreigabe, { ui: UI, gesperrt: true, sperren: () => {} }))).toBe("");
  });
  it("Leitung: Hinweis zur Personalnummer wörtlich, Pflichtfelder, Verfahren, kein Wert vorab, keine Person vorab", () => {
    const m = html(h(V.VerlustFreigabe, { ui: UI, gesperrt: false, sperren: () => {} }));
    expect(m).toContain("Nachschlagen in den eigenen Unterlagen über die geprüfte Person, nie vom Antragsteller nennen lassen.");
    expect(m).toContain("Personalnummer der geprüften Person");
    expect(m).toContain("Vier-Augen-Prinzip");
    expect(m).toContain("Dein Zugangscode");
    expect(m).toContain("Frischer Code aus deiner App");
    expect(m).toContain("Fallnummer");
    expect(m).toContain("Aktenzeichen (freiwillig)");
    for (const v of L.VERFAHREN) { expect(m).toContain(v.text); expect(m).toContain(`value="${v.wert}"`); }
    expect(m).toContain("Antrag freigeben");
    expect(m).toContain("Antrag ablehnen");
    expect(m).not.toContain("one-time-code");
    expect(m).not.toContain("Geprüfte Person laut System");                    // die Person erscheint nur nach einer Serverantwort
    expect(m).not.toContain("data-einmal");
    for (const feld of m.match(/<input[^>]*type="(?:text|password)"[^>]*>|<input(?![^>]*type=)[^>]*>/g) || [])
      expect(feld).toMatch(/autoComplete="off"/i);
  });
  it("Einhängepunkt: zugeklappt zwei Knöpfe, aufgeklappt der gewählte Weg; Name und Zustand sind ausgezeichnet", () => {
    const zu = html(h(V.VerlustWeg, { ui: UI }));
    expect(zu).toContain("Zugang verloren?");
    expect(zu).toContain("Ich habe Gerät und Codes verloren");
    expect(zu).toContain("Ich bin Leitung und gebe einen Antrag frei");
    expect(zu).toContain('aria-expanded="false"');
    expect(zu).not.toContain("<form");
    const auf = html(h(V.VerlustWeg, { ui: UI, start: "traeger" }));
    expect(auf).toContain('aria-expanded="true"');
    expect(auf).toContain("<form");
    expect(auf).toContain('id="verlust-traeger"');
    const leitung = html(h(V.VerlustWeg, { ui: UI, start: "leitung" }));
    expect(leitung).toContain("Personalnummer der geprüften Person");
    expect(leitung).not.toContain("Antrag zurückziehen");
  });
  it("Einhängepunkt in der Anmeldemaske: ZugangZweifaktor zeigt den Weg, gleich aufgeklappt mit verlustStart", () => {
    const a = html(h(Z.ZugangZweifaktor, { F }));
    expect(a).toContain("Zugang verloren?");
    expect(a).toContain("Zweiter Faktor für deinen Zugangscode");              // der bestehende Teil bleibt
    expect(a).not.toContain("<form");
    expect(html(h(Z.ZugangZweifaktor, { F, verlustStart: true }))).toContain("Vier-Augen-Prinzip");
  });
  it("Betreiber: kein Weg in der Betreiberkonsole und kein Verweis im Betreiber-Teil der Anmeldemaske", async () => {
    const konsole = html(h(Z.default, { ui: UI }));
    expect(konsole).not.toContain("Zugang verloren");
    const main = (await readFile(new URL("../src/main.jsx", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
    expect(main).toMatch(/\{zfNoetig && !betreiber && \(/);
    expect(main).toMatch(/\{!betreiber && zfVerwalten && <ZugangZweifaktor/);
    expect(main).toContain("Gerät oder Wiederherstellungscodes verloren?");
  });
});

describe("Nichts bleibt liegen", () => {
  const DATEIEN = ["src/lib/verlustweg.js", "src/verlustweg.jsx"];
  it("kein localStorage, sessionStorage, IndexedDB, Cookie, Konsole, Adresse oder Verlauf in den neuen Quelltexten", async () => {
    for (const d of DATEIEN) {
      const q = (await readFile(new URL(`../${d}`, import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const verboten of [/localStorage/, /sessionStorage/, /indexedDB/i, /document\.cookie/, /\bconsole\s*\./, /\bdebugger\b/,
        /location\.(search|hash|href|assign|replace)/, /history\.(push|replace)State/, /URLSearchParams/, /navigator\.(sendBeacon|serviceWorker)/,
        /caches\./, /\bXMLHttpRequest\b/, /window\.name/, /\.setItem\(/, /import\(/])
        expect(q, `${d}: ${verboten}`).not.toMatch(verboten);
    }
  });
  it("Aufrufe gehen nur an /api/anmelden (kein neuer Endpunkt)", async () => {
    const q = await readFile(new URL("../src/lib/verlustweg.js", import.meta.url), "utf8");
    expect([...q.matchAll(/["'`]\/[a-z][^"'`\s]*["'`]/g)].map((m) => m[0])).toEqual(['"/api/anmelden"']);
    const k = await readFile(new URL("../src/verlustweg.jsx", import.meta.url), "utf8");
    expect(k).not.toMatch(/\bfetch\s*\(/);                                       // die Komponenten rufen nur verlustSenden
  });
  it("Einmalwerte werden nach dem Absenden geleert und nach Frist ausgeblendet", async () => {
    const k = (await readFile(new URL("../src/verlustweg.jsx", import.meta.url), "utf8"));
    expect(k).toMatch(/setZugangscode\(""\); setCode\(""\)/);
    expect(k).toMatch(/if \(a\.art !== "eingabe"\) setToken\(""\)/);
    expect(k).toMatch(/setF\(LEER\)/);
    expect(k).toMatch(/personalnummer: ""/);
    expect((k.match(/useNachFrist\(/g) || []).length).toBeGreaterThanOrEqual(3);   // Definition + Geheimnis (Träger) + Token (Leitung)
    expect(k).toMatch(/clearTimeout/);
  });
  it("Kopieren: nur die Zwischenablage, ohne Protokoll; schlägt es fehl, steht ein Hinweis da", async () => {
    const k = await readFile(new URL("../src/verlustweg.jsx", import.meta.url), "utf8");
    expect(k).toMatch(/navigator\.clipboard\.writeText\(text\)/);
    expect(k).toContain("Kopieren nicht möglich. Bitte von Hand abschreiben.");
  });
});
