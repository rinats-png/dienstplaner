/* ==========================================================================
   WR-3: VERLUST-SCHNITTSTELLE ÜBER /api/anmelden (Vier-Augen, Token, Fristen)

   Geprüft wird der echte Handler (funktionen/daten.mjs → betreiber-zweifaktor
   → kontowiederherstellung-zugang → kontowiederherstellung):

     - vollständiger Ablauf: melden → zwei Freigaben (je eigener Zugangscode +
       frischer TOTP) → Token einmal → einlösen → neue AUSSTEHENDE Einrichtung →
       bestätigen → gewöhnliche Anmeldung mit Code aus der App
     - Token oder Fall allein ergibt nie eine Sitzung; die neue Einrichtung ist
       mit dem Zugangscode allein nicht zu überschreiben
     - frischer TOTP je Freigabe: wiederholter Code, alter Code,
       Wiederherstellungscode → abgewiesen
     - Freigebende nur Leitung desselben Mandanten: fremder Mandant, fremder
       Raum, Planung, Mitarbeiter, Leitung ohne Person → abgewiesen
     - keine Selbstfreigabe (auch über ein zweites Konto derselben Person),
       nicht zweimal dieselbe Person, Einheitsregel
     - Mandantentrennung / keine Auskunft: unbekannter, fremder und
       unzulässiger Fall antworten byte-gleich
     - Fristen über HTTP: 24 h Antrag, 15 min Token
     - Gleichzeitigkeit: zwei rennende Freigaben → ein Token; doppeltes
       Einlösen → einmal
     - laufender Fall: Sitzungen enden, Wiederherstellungscode gilt nicht,
       Anmeldung mit TOTP zieht den Fall zurück, Neugenerierung gesperrt
     - Betreibercode: kein Verlustweg (403)
     - Schlüsselepoche: Token aus einer anderen Epoche gilt nicht; Epoche
       nicht feststellbar → 503
     - Bremse (GRENZEN.verlust, fail-closed)

   Rot auf dem Stand vor WR-3 (origin/integration/release-v4 @ c8c643fd):
   jede verlust-*-Aktion antwortete 400 „Unbekannte Aktion".
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hotp, base32Dekodieren, schrittZu } from "../server/lib/zweifaktor.mjs";

const LIMIT = 120000;
const WIRT = "127.0.0.1:3000";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 15);
const RAUM = "wr3-probe";
const RAUM2 = "wr3-fremd";
const PFEFFER = "pfeffer-wr-3-http-0123456789abcdef";
const MIN = 60 * 1000;
const H = 60 * MIN;

let wurzel, laden, daten, B, K, CODES, ZF, SCHUTZ;
let nr = 0;
let jetzt = T0;
const uhr = (ms) => { jetzt = ms; vi.setSystemTime(ms); };
const weiter = (s = 30) => uhr(jetzt + s * 1000);
const totp = (b32, d = 0) => hotp(base32Dekodieren(b32), schrittZu(jetzt) + d);

/** Fall → Person des Trägers (die Freigebende kennt die Personalnummer aus ihrer Identitätsprüfung). */
const FT = {};
const PN = (personId) => `PN-${personId}`;
const anmelden = async (rumpf0, herkunft) => {
  nr += 1;
  let rumpf = rumpf0;
  if ((rumpf.zweifaktorAktion === "verlust-freigeben" || rumpf.zweifaktorAktion === "verlust-ablehnen")
    && !("personalnummer" in rumpf)) rumpf = { ...rumpf, personalnummer: FT[rumpf.fall] ? PN(FT[rumpf.fall]) : "PN-unbekannt" };
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json",
      "x-forwarded-for": herkunft || `10.63.${Math.floor(nr / 250) % 250}.${nr % 250}` },
    body: JSON.stringify(rumpf) }), {});
  const roh = await a.text();
  let d = {}; try { d = JSON.parse(roh); } catch { /* leer */ }
  return { status: a.status, roh, ...d };
};
const bestandHolen = async (token) => {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/bestand`, { method: "GET",
    headers: { host: WIRT, origin: `http://${WIRT}`, authorization: `Bearer ${token}`,
      "x-forwarded-for": `10.64.${Math.floor(nr / 250) % 250}.${nr % 250}` } }), {});
  return { status: a.status };
};

const person = (id, rolle, einheit) => ({ id, vorname: "V", nachname: `N${id}`, rolle, bereich: "ALLE", status: "aktiv",
  geburtstag: "1980-01-01", personalnummer: PN(id),
  ...(Array.isArray(einheit) ? { zugehoerigkeit: einheit } : einheit ? { zugehoerigkeit: [{ ab: "2020-01-01", einheitId: einheit }] } : {}) });
const mandant = (id, personen) => ({ id, name: `Haus ${id}`, status: "aktiv",
  einheiten: [{ id: "e1", name: "WB 1", versatzTage: 0 }, { id: "e2", name: "WB 2", versatzTage: 0 },
    { id: "e3", name: "WB 3", versatzTage: 0 }, { id: "e4", name: "WB 4", versatzTage: 0 }],
  dienstarten: [{ id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }], qualifikationen: [],
  einstellungen: { ruhezeit: 11, maxFolge: 6 }, personen,
  abweichungen: {}, abwesenheiten: [], erfassung: {}, einstempeln: {}, anfragen: [], nachrichten: [], bestaetigungen: [] });

/** Alle Zugänge: [Code, Rolle, Person, Betrieb, MandantId, Raum]. */
const Z = {};
const zugang = (name, rolle, personId, betrieb = 0, mandantId = "m1", raum = RAUM) => {
  Z[name] = { code: `WR3-${name.padEnd(4, "X").slice(0, 4)}-${String(Object.keys(Z).length).padStart(4, "0")}`,
    rolle, person: personId, betrieb, mandantId, raum };
};

/** Faktoren der Zugänge: Geheimnis und Wiederherstellungscodes. */
const F = {};

async function einrichten(name) {
  const c = Z[name].code;
  const b = await anmelden({ zugangscode: c, zweifaktorAktion: "beginnen" });
  expect(b.status, b.roh).toBe(200);
  const f = await anmelden({ zugangscode: c, zweifaktorAktion: "bestaetigen", zweifaktor: totp(b.geheimnis) });
  expect(f.status, f.roh).toBe(200);
  F[name] = { geheimnis: b.geheimnis, wiederherstellung: f.wiederherstellung };
}

/** Freigabe durch `name` (frischer Code; die Uhr rückt dafür einen Schritt vor). */
async function freigeben(name, fall, extra = {}) {
  weiter();
  return anmelden({ zugangscode: Z[name].code, zweifaktorAktion: "verlust-freigeben", zweifaktor: totp(F[name].geheimnis),
    fall, verfahren: "persoenlich", ...extra });
}
const melden = async (name) => {
  const r = await anmelden({ zugangscode: Z[name].code, zweifaktorAktion: "verlust-melden" });
  if (r.fall) FT[r.fall] = Z[name].person;
  return r;
};
const ablehnen = (name, fall, extra = {}) => { weiter(); return anmelden({ zugangscode: Z[name].code,
  zweifaktorAktion: "verlust-ablehnen", zweifaktor: totp(F[name].geheimnis), fall, grund: "identitaet-zweifelhaft", ...extra }); };
const einloesen = (name, freigabe) => anmelden({ zugangscode: Z[name].code, zweifaktorAktion: "verlust-einloesen", freigabe });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  uhr(T0);
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-wr3-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = PFEFFER;
  delete process.env.CENTRIC_ROLLEN_ZWEIFAKTOR_PFLICHT;
  delete process.env.CENTRIC_BETREIBER_ZWEIFAKTOR_PFLICHT;
  /* Gebaut, aber gesperrt ausgeliefert: nur mit dem Schalter (eigener Fall unten). */
  process.env.CENTRIC_KONTOWIEDERHERSTELLUNG = "1";
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  SCHUTZ = await import("../server/lib/schutz.mjs");
  /* Bremsen sind hier nur im eigenen Fall Gegenstand (unten). */
  for (const art of Object.keys(SCHUTZ.GRENZEN)) SCHUTZ.GRENZEN[art] = { ...SCHUTZ.GRENZEN[art], versuche: 100000 };
  SCHUTZ.WEITERE.anmelden = { ziel: { versuche: 100000, fenster: 300 }, gesamt: { versuche: 100000, fenster: 300 } };
  SCHUTZ.NOTGRENZEN.anmelden = { versuche: 100000, fenster: 300, gesamt: 100000 };
  daten = (await import("../server/funktionen/daten.mjs")).default;
  B = await import("../server/lib/bestand.mjs");
  K = await import("../server/lib/konten.mjs");
  CODES = await import("../server/lib/codes.mjs");
  ZF = await import("../server/lib/zweifaktor.mjs");

  await B.bestandSchreiben(laden(), RAUM, { version: 9, mandanten: [
    mandant("m1", [person("t1", "leitung", "e4"), person("t2", "leitung", "e4"), person("t3", "leitung", "e4"),
      person("t4", "leitung", "e4"), person("t5", "leitung", "e4"), person("t6", "leitung", "e4"),
      person("t7", "leitung", "e4"), person("t8", "leitung", "e4"), person("t9", "leitung", "e4"),
      person("l1", "leitung", "e1"), person("l2", "leitung", "e2"), person("l3", "leitung", "e1"),
      person("l4", "leitung", "e3"), person("l5", "leitung", null), person("l6", "leitung", null),
      person("p1", "planer", "e2"), person("m0", "mitarbeiter", "e2"), person("ab", "mitarbeiter", "e3"),
      person("tv", "leitung", "e4"), person("tm", "leitung", "e4"), person("ta", "leitung", "e4"),
      /* L1: wechselt am 2026-11-20 (Betriebsdatum Berlin) von e3 nach e1. */
      person("lw", "leitung", [{ ab: "2020-01-01", einheitId: "e3" }, { ab: "2026-11-20", einheitId: "e1" }])]),
    mandant("m2", [person("x1", "leitung", "e1"), person("x2", "leitung", "e2")]),
  ] }, { durch: "WR-3" });
  await B.bestandSchreiben(laden(), RAUM2, { version: 9, mandanten: [
    mandant("n1", [person("y1", "leitung", "e1")]) ] }, { durch: "WR-3" });

  /* Betroffene (je Szenario einer) */
  for (const t of ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"]) zugang(t, "leitung", t.toLowerCase());
  for (const t of ["TV", "TM", "TA"]) zugang(t, "leitung", t.toLowerCase());
  zugang("LW", "leitung", "lw");
  zugang("TOHNE", "leitung", null);
  zugang("TB", "leitung", "t1");          // zweites Konto der Person t1 (Betroffene in T1)
  zugang("L1", "leitung", "l1");
  zugang("L1B", "leitung", "l1");         // zweites Konto der Person l1
  zugang("L2", "leitung", "l2");
  zugang("L3", "leitung", "l3");          // gleiche Einheit wie L1 (e1)
  zugang("L4", "leitung", "l4");
  zugang("L5", "leitung", "l5");
  zugang("L6", "leitung", "l6");
  zugang("LN", "leitung", null);          // Leitung ohne Person
  zugang("MAL", "mitarbeiter", "l2");     // Mitarbeitercode, Person ist Leitung → wirksam Leitung
  zugang("ABG", "leitung", "ab");         // Code Leitung, Person heute Mitarbeiter → wirksam nicht Leitung
  zugang("P1", "planer", "p1");
  zugang("MA", "mitarbeiter", "m0");
  zugang("X1", "leitung", "x1", 1, "m2"); // anderer Mandant im selben Raum
  zugang("Y1", "leitung", "y1", 0, "n1", RAUM2);
  zugang("BETR", "betreiber", null, 0, null, "betreiber-wr3");
  for (const z of Object.values(Z)) {
    await K.kontoSchreiben(laden(), CODES.ablageSchluessel(z.code), { name: "Probe", bestand: z.raum, rolle: z.rolle,
      person: z.person, betrieb: z.betrieb, mandantId: z.mandantId, angelegt: "2026-01-01T00:00:00.000Z" });
  }
  for (const n of Object.keys(Z)) if (!["MA"].includes(n)) await einrichten(n);
}, 300000);

afterEach(() => { ZF.wiederherstellungEpocheQuelle(undefined); });
afterAll(async () => {
  vi.useRealTimers();
  await rm(wurzel, { recursive: true, force: true });
});

/** Alle Protokollzeilen (centric-spur) als Text. */
async function spurText() {
  const { readdir, readFile } = await import("node:fs/promises");
  const texte = [];
  const gehe = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) await gehe(q);
      else if (/centric-spur/i.test(q)) texte.push(await readFile(q, "utf8").catch(() => ""));
    }
  };
  await gehe(wurzel);
  return texte.join("\n");
}

describe("WR-3 über /api/anmelden: vollständiger Ablauf", () => {
  it("melden → zwei Freigaben → Token einmal → einlösen → bestätigen → Anmeldung nur mit neuem Code", async () => {
    /* Eine laufende Sitzung des Betroffenen (mit Code aus der App). */
    weiter();
    const vorher = await anmelden({ zugangscode: Z.T1.code, zweifaktor: totp(F.T1.geheimnis) });
    expect(vorher.status, vorher.roh).toBe(200);
    expect((await bestandHolen(vorher.token)).status).toBe(200);

    const m = await melden("T1");
    expect(m.status, m.roh).toBe(200);
    expect(m.fall).toMatch(/^F-[A-Z2-9]{16}$/);
    expect(Date.parse(m.gueltigBis) - jetzt).toBe(24 * H);
    expect(m.token).toBeUndefined();
    /* Die Sitzung endet mit der Meldung. */
    expect((await bestandHolen(vorher.token)).status).toBe(401);
    /* Ein Wiederherstellungscode gilt bei laufendem Fall nicht — und wird nicht verbraucht. */
    const wc = await anmelden({ zugangscode: Z.T1.code, zweifaktor: F.T1.wiederherstellung[0] });
    expect(wc.status, wc.roh).toBe(409);
    expect(wc.zweifaktor).toBe("verlust-offen");
    expect(wc.token).toBeUndefined();
    /* Abschalten gesperrt (Pflicht ist aus — sonst wäre es ohnehin verweigert). */
    weiter();
    const ab = await anmelden({ zugangscode: Z.T1.code, zweifaktorAktion: "abschalten", zweifaktor: totp(F.T1.geheimnis) });
    expect(ab.status, ab.roh).toBe(409);
    expect(ab.zweifaktor).toBe("verlust-offen");
    /* Neugenerierung gesperrt. */
    weiter();
    expect((await anmelden({ zugangscode: Z.T1.code, zweifaktorAktion: "wiederherstellung-neu",
      zweifaktor: totp(F.T1.geheimnis) })).status).toBe(409);

    const a = await freigeben("L1", m.fall);
    expect(a.status, a.roh).toBe(200);
    expect(a).toMatchObject({ ok: true, stand: "teilfreigegeben" });
    expect(a.freigabe).toBeUndefined();
    expect(a.token).toBeUndefined();
    /* Erst nach Authentifizierung und passender Personalnummer: wessen Fall es ist. */
    expect(a.traeger).toEqual({ vorname: "V", nachname: "Nt1", einheit: "e4" });
    const b = await freigeben("L2", m.fall, { verfahren: "rueckruf", aktenzeichen: "AZ-2026/17" });
    expect(b.status, b.roh).toBe(200);
    expect(b.stand).toBe("freigegeben");
    expect(b.freigabe).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(b.gueltigBis) - jetzt).toBe(15 * MIN);
    expect(b.token).toBeUndefined();              // keine Sitzung für Freigebende über diesen Weg

    const e = await einloesen("T1", b.freigabe);
    expect(e.status, e.roh).toBe(200);
    expect(e.geheimnis).toMatch(/^[A-Z2-7]+$/);
    expect(e.token).toBeUndefined();
    /* Dasselbe Token ein zweites Mal: wie falsch. */
    const e2 = await einloesen("T1", b.freigabe);
    expect(e2.status).toBe(401);

    /* Token eingelöst, Einrichtung ausstehend: mit dem Zugangscode allein KEINE Sitzung (auch ohne Pflichtschalter). */
    const nur = await anmelden({ zugangscode: Z.T1.code });
    expect(nur.status, nur.roh).toBe(403);
    expect(nur.token).toBeUndefined();
    /* Die Einrichtung ist mit dem Zugangscode allein nicht zu überschreiben. */
    const dieb = await anmelden({ zugangscode: Z.T1.code, zweifaktorAktion: "beginnen" });
    expect(dieb.status).toBe(409);
    expect(dieb.geheimnis).toBeUndefined();
    /* Der alte Code aus der App gilt nicht mehr. */
    weiter();
    expect((await anmelden({ zugangscode: Z.T1.code, zweifaktor: totp(F.T1.geheimnis) })).token).toBeUndefined();

    const best = await anmelden({ zugangscode: Z.T1.code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(e.geheimnis) });
    expect(best.status, best.roh).toBe(200);
    expect(best.wiederherstellung).toHaveLength(10);
    /* Alte Wiederherstellungscodes gelten nicht mehr. */
    weiter();
    expect((await anmelden({ zugangscode: Z.T1.code, zweifaktor: F.T1.wiederherstellung[1] })).status).toBe(401);
    weiter();
    const neu = await anmelden({ zugangscode: Z.T1.code, zweifaktor: totp(e.geheimnis) });
    expect(neu.status, neu.roh).toBe(200);
    expect(neu.token).toBeTruthy();
    F.T1 = { geheimnis: e.geheimnis, wiederherstellung: best.wiederherstellung };
  }, LIMIT);

  it("Protokoll ohne Token, Geheimnis oder Codes", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const texte = [];
    const gehe = async (d) => {
      for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await gehe(p);
        else if (/centric-spur/i.test(p)) texte.push(await readFile(p, "utf8").catch(() => ""));
      }
    };
    await gehe(wurzel);
    const alles = texte.join("\n");
    expect(alles).toContain("Verlust · Fall eröffnet");
    expect(alles).toContain("Verlust · Fall freigegeben");
    expect(alles).toContain("Verlust · Fall eingelöst");
    expect(alles).not.toMatch(/[A-Za-z0-9_-]{43}/);
    for (const z of Object.values(Z)) expect(alles).not.toContain(z.code);
    expect(alles).not.toContain(F.T1.geheimnis);
    expect(alles).not.toContain("Probe");
  });
});

describe("WR-3: frischer TOTP je Freigabe", () => {
  it("wiederholter Code, veralteter Code und Wiederherstellungscode werden abgewiesen", async () => {
    const m = await melden("T2");
    expect(m.status, m.roh).toBe(200);
    weiter();
    const c = totp(F.L1.geheimnis);
    /* Der Code wird für eine Anmeldung verbraucht … */
    expect((await anmelden({ zugangscode: Z.L1.code, zweifaktor: c })).status).toBe(200);
    /* … und gilt danach auch für eine Freigabe nicht. */
    const wieder = await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: c,
      fall: m.fall, verfahren: "persoenlich" });
    expect(wieder.status).toBe(401);
    /* Veraltet (zwei Schritte zurück). */
    weiter();
    const alt = await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben",
      zweifaktor: totp(F.L1.geheimnis, -2), fall: m.fall, verfahren: "persoenlich" });
    expect(alt.status).toBe(401);
    /* Wiederherstellungscode statt Code aus der App. */
    const wc = await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben",
      zweifaktor: F.L1.wiederherstellung[0], fall: m.fall, verfahren: "persoenlich" });
    expect(wc.status).toBe(401);
    /* Ohne Code. */
    expect((await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben",
      fall: m.fall, verfahren: "persoenlich" })).status).toBe(401);
    /* Eine gelungene Freigabe verbraucht ihren Schritt: derselbe Code für die nächste Freigabe gilt nicht. */
    weiter();
    const c2 = totp(F.L1.geheimnis);
    const ok = await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: c2,
      fall: m.fall, verfahren: "persoenlich" });
    expect(ok.status, ok.roh).toBe(200);
    const m3 = await melden("T3");
    const nochmal = await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: c2,
      fall: m3.fall, verfahren: "persoenlich" });
    expect(nochmal.status).toBe(401);
    /* Bei laufendem Fall wird ein Wiederherstellungscode abgewiesen — und NICHT verbraucht. */
    const wcT2 = await anmelden({ zugangscode: Z.T2.code, zweifaktor: F.T2.wiederherstellung[0] });
    expect(wcT2.status).toBe(409);
    /* Aufräumen: beide Fälle zurückziehen. */
    for (const t of ["T2", "T3"]) expect((await anmelden({ zugangscode: Z[t].code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
    const danach = await anmelden({ zugangscode: Z.T2.code, zweifaktor: F.T2.wiederherstellung[0] });
    expect(danach.status, danach.roh).toBe(200);
    expect(danach.token).toBeTruthy();
  }, LIMIT);
});

describe("WR-3: wer freigeben darf, Mandantentrennung, keine Auskunft", () => {
  it("nur Leitung desselben Mandanten; keine Selbstfreigabe; nicht zweimal dieselbe Person; Einheitsregel", async () => {
    const m = await melden("T4");
    expect(m.status, m.roh).toBe(200);
    const nein = [];
    /* Anderer Mandant im selben Raum, anderer Raum, Planung, Leitung ohne Person, Code Leitung aber Person nicht
       (mehr) Leitung, der Betroffene selbst. */
    for (const n of ["X1", "Y1", "P1", "LN", "ABG", "T4"]) {
      const r = await freigeben(n, m.fall);
      expect(r.status, `${n}: ${r.roh}`).toBe(403);
      nein.push(r.roh);
    }
    /* Mitarbeiter: kein zweiter Faktor, keine Aktion. */
    const ma = await anmelden({ zugangscode: Z.MA.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: "123456",
      fall: m.fall, verfahren: "persoenlich" });
    expect(ma.status).toBe(400);
    /* Unbekannter Fall: dieselbe Antwort, Byte für Byte. */
    const unbekannt = await freigeben("L1", "F-AAAAAAAAAAAAAAAA");
    expect(unbekannt.status).toBe(403);
    for (const roh of nein) expect(roh).toBe(unbekannt.roh);

    expect((await freigeben("L1", m.fall)).stand).toBe("teilfreigegeben");
    /* Dasselbe Konto, ein zweites Konto derselben Person, gleiche Einheit (e1): kein Token. */
    for (const n of ["L1", "L1B", "L3"]) {
      const r = await freigeben(n, m.fall);
      expect(r.status, `${n}: ${r.roh}`).toBe(403);
      expect(r.roh).toBe(unbekannt.roh);
      expect(r.freigabe).toBeUndefined();
    }
    /* Mitarbeitercode, dessen Person Leitung ist (wirksame Rolle): zulässig, andere Einheit. */
    const ok = await freigeben("MAL", m.fall);
    expect(ok.status, ok.roh).toBe(200);
    expect(ok.stand).toBe("freigegeben");
    expect((await anmelden({ zugangscode: Z.T4.code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
  }, LIMIT);

  it("keine Selbstfreigabe über ein zweites Konto derselben Person (T1/TB)", async () => {
    const m = await melden("T1");
    expect(m.status, m.roh).toBe(200);
    /* TB hat keinen eigenen Fall, einen aktiven Faktor und die richtige Personalnummer — abgewiesen allein wegen
       der Regel „keine Selbstfreigabe“ (Grund im Protokoll, nicht in der Antwort). */
    const r = await freigeben("TB", m.fall);
    expect(r.status).toBe(403);
    expect(r.verlust).toBe("nein");
    expect(await spurText()).toMatch(/Verlust · Freigabe · r:[0-9a-f]{16} · selbst/);
    expect((await anmelden({ zugangscode: Z.T1.code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
  }, LIMIT);

  it("ohne Schalter CENTRIC_KONTOWIEDERHERSTELLUNG=1: jede Verlust-Aktion 403, kein Fall", async () => {
    for (const wert of [undefined, "", "0", "ja", "true"]) {
      if (wert === undefined) delete process.env.CENTRIC_KONTOWIEDERHERSTELLUNG;
      else process.env.CENTRIC_KONTOWIEDERHERSTELLUNG = wert;
      try {
        for (const aktion of ["verlust-melden", "verlust-freigeben", "verlust-einloesen", "verlust-zurueckziehen"]) {
          weiter();
          const r = await anmelden({ zugangscode: Z.L6.code, zweifaktorAktion: aktion, zweifaktor: totp(F.L6.geheimnis),
            fall: "F-AAAAAAAAAAAAAAAA", verfahren: "persoenlich", freigabe: "A".repeat(43) });
          expect(r.status, `${wert} ${aktion}: ${r.roh}`).toBe(403);
          expect(r.zweifaktor).toBe("gesperrt");
        }
      } finally { process.env.CENTRIC_KONTOWIEDERHERSTELLUNG = "1"; }
    }
    /* L6 hat keinen Fall bekommen: eine Anmeldung mit Code aus der App geht wie immer. */
    weiter();
    expect((await anmelden({ zugangscode: Z.L6.code, zweifaktor: totp(F.L6.geheimnis) })).status).toBe(200);
  }, LIMIT);

  it("Betroffener ohne Person: kein Fall; Betreibercode: kein Verlustweg", async () => {
    const o = await melden("TOHNE");
    expect(o.status).toBe(409);
    expect(o.fall).toBeUndefined();
    for (const aktion of ["verlust-melden", "verlust-freigeben", "verlust-einloesen"]) {
      weiter();
      const b = await anmelden({ zugangscode: Z.BETR.code, zweifaktorAktion: aktion, zweifaktor: totp(F.BETR.geheimnis),
        fall: "F-AAAAAAAAAAAAAAAA", verfahren: "persoenlich", freigabe: "A".repeat(43) });
      expect(b.status, b.roh).toBe(403);
      expect(b.zweifaktor).toBe("gesperrt");
    }
  }, LIMIT);
});

describe("WR-3: Fristen über HTTP", () => {
  it("Antrag nach 24 h abgelaufen; Token nach 15 min ungültig, knapp davor gültig", async () => {
    const m = await melden("T5");
    expect(m.status, m.roh).toBe(200);
    await freigeben("L1", m.fall);
    uhr(Date.parse(m.gueltigBis));
    const zu = await freigeben("L2", m.fall);
    expect(zu.status).toBe(403);
    /* Neuer Fall möglich, Token läuft ab. */
    const m2 = await melden("T5");
    expect(m2.status, m2.roh).toBe(200);
    expect(m2.fall).not.toBe(m.fall);
    await freigeben("L1", m2.fall);
    const b = await freigeben("L2", m2.fall);
    expect(b.stand).toBe("freigegeben");
    uhr(Date.parse(b.gueltigBis));
    const spaet = await einloesen("T5", b.freigabe);
    expect(spaet.status).toBe(401);
    expect(spaet.geheimnis).toBeUndefined();
    /* Keine Auskunft: abgelaufenes Token, Zugang ohne Fall und falsches Token antworten byte-gleich. */
    expect((await einloesen("L4", b.freigabe)).roh).toBe(spaet.roh);
    expect((await einloesen("T5", "C".repeat(43))).roh).toBe(spaet.roh);

    const m3 = await melden("T5");
    expect(m3.status, m3.roh).toBe(200);
    await freigeben("L1", m3.fall);
    const b3 = await freigeben("L2", m3.fall);
    uhr(Date.parse(b3.gueltigBis) - 1000);
    const knapp = await einloesen("T5", b3.freigabe);
    expect(knapp.status, knapp.roh).toBe(200);
    weiter(5);
    await anmelden({ zugangscode: Z.T5.code, zweifaktorAktion: "bestaetigen", zweifaktor: totp(knapp.geheimnis) });
    F.T5 = { geheimnis: knapp.geheimnis };
  }, LIMIT);
});

describe("WR-3: Gleichzeitigkeit", () => {
  it("zwei rennende zweite Freigaben → genau ein Token; doppeltes Einlösen → einmal", async () => {
    const m = await melden("T6");
    expect(m.status, m.roh).toBe(200);
    await freigeben("L1", m.fall);
    weiter();
    const [a, b] = await Promise.all(["L2", "L4"].map((n) => anmelden({ zugangscode: Z[n].code,
      zweifaktorAktion: "verlust-freigeben", zweifaktor: totp(F[n].geheimnis), fall: m.fall, verfahren: "persoenlich" })));
    const tokens = [a, b].filter((r) => r.status === 200 && r.freigabe);
    expect(tokens).toHaveLength(1);
    expect([a, b].filter((r) => r.status === 403)).toHaveLength(1);
    const [e1, e2] = await Promise.all([einloesen("T6", tokens[0].freigabe), einloesen("T6", tokens[0].freigabe)]);
    expect([e1, e2].filter((r) => r.status === 200 && r.geheimnis)).toHaveLength(1);
    expect([e1, e2].filter((r) => r.status === 401)).toHaveLength(1);
  }, LIMIT);
});

describe("WR-3: laufender Fall", () => {
  it("Anmeldung mit Code aus der App zieht den Fall zurück; Freigaben danach wirkungslos", async () => {
    const m = await melden("T7");
    expect(m.status, m.roh).toBe(200);
    await freigeben("L1", m.fall);
    weiter();
    const an = await anmelden({ zugangscode: Z.T7.code, zweifaktor: totp(F.T7.geheimnis) });
    expect(an.status, an.roh).toBe(200);
    const r = await freigeben("L2", m.fall);
    expect(r.status).toBe(403);
    expect(r.freigabe).toBeUndefined();
  }, LIMIT);

  it("eine Leitung mit eigenem laufendem Fall gibt nicht frei", async () => {
    const mt = await melden("T8");
    const ml = await melden("L5");
    expect(ml.status, ml.roh).toBe(200);
    weiter();
    /* L5 ist im Verlustfall: auch mit ihrem (noch vorhandenen) Code aus der App keine Freigabe. */
    const r = await anmelden({ zugangscode: Z.L5.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: totp(F.L5.geheimnis),
      fall: mt.fall, verfahren: "persoenlich" });
    expect(r.status).toBe(403);
    for (const n of ["T8", "L5"]) await anmelden({ zugangscode: Z[n].code, zweifaktorAktion: "verlust-zurueckziehen" });
  }, LIMIT);
});

describe("WR-3: Schlüsselepoche und Bremse", () => {
  it("Token aus einer anderen Epoche gilt nicht; Epoche nicht feststellbar → 503", async () => {
    let epoche = "wr3-epoche-1";
    let geht = true;
    ZF.wiederherstellungEpocheQuelle(async () => { if (!geht) throw new Error("weg"); return epoche; });
    const m = await melden("T9");
    expect(m.status, m.roh).toBe(200);
    await freigeben("L1", m.fall);
    const b = await freigeben("L2", m.fall);
    expect(b.stand).toBe("freigegeben");
    epoche = "wr3-epoche-2";              // Ablage zurückgespielt → neue Epoche
    const e = await einloesen("T9", b.freigabe);
    expect(e.status).toBe(401);
    geht = false;
    expect((await melden("T9")).status).toBe(503);
  }, LIMIT);

  it("Bremse je Zugang (GRENZEN.verlust), fail-closed", async () => {
    const vorher = SCHUTZ.GRENZEN.verlust;
    SCHUTZ.GRENZEN.verlust = { ...vorher, versuche: 3 };
    try {
      const h = "10.99.1.1";
      const st = [];
      for (let i = 0; i < 4; i++)
        st.push((await anmelden({ zugangscode: Z.L6.code, zweifaktorAktion: "verlust-einloesen", freigabe: "B".repeat(43) }, h)).status);
      expect(st.slice(0, 3)).toEqual([401, 401, 401]);
      expect(st[3]).toBe(429);
    } finally { SCHUTZ.GRENZEN.verlust = vorher; }
  }, LIMIT);

  it("M1: Eröffnen und Rückzug haben getrennte Zähler — der Träger kann immer zurückziehen", async () => {
    const vorher = SCHUTZ.GRENZEN.verlust;
    SCHUTZ.GRENZEN.verlust = { ...vorher, versuche: 3 };
    try {
      for (let i = 0; i < 3; i++) {
        expect((await melden("TM")).status).toBe(200);
        expect((await anmelden({ zugangscode: Z.TM.code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
      }
      expect((await melden("TM")).status).toBe(429);
      /* Ein (fremd) eröffneter Fall ist weiter zurückziehbar, obwohl der Eröffnungszähler voll ist. */
      for (let i = 0; i < 5; i++)
        expect((await anmelden({ zugangscode: Z.TM.code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
    } finally { SCHUTZ.GRENZEN.verlust = vorher; }
  }, LIMIT);
});

describe("WR-3: Review #191", () => {
  it("H1: Wer den Zugangscode des Opfers kennt und sich selbst ausweist, bekommt keine Freigabe für dessen Fall", async () => {
    /* Angreifer (Person ab) kennt den Zugangscode von TV, eröffnet dessen Fall und lässt SICH prüfen. */
    const m = await melden("TV");
    expect(m.status, m.roh).toBe(200);
    const unbekannt = await freigeben("L1", "F-AAAAAAAAAAAAAAAA", { personalnummer: PN("tv") });
    for (const n of ["L1", "L2"]) {
      const r = await freigeben(n, m.fall, { personalnummer: PN("ab") });
      expect(r.status, r.roh).toBe(403);
      expect(r.roh).toBe(unbekannt.roh);          // keine Auskunft, kein Name
      expect(r.freigabe).toBeUndefined();
      expect(r.traeger).toBeUndefined();
    }
    /* Ablehnen braucht ebenso die richtige Person. */
    expect((await ablehnen("L1", m.fall, { personalnummer: PN("ab") })).status).toBe(403);
    /* Ohne Personalnummer: Formfehler, ohne Bezug zum Fall. */
    weiter();
    expect((await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-freigeben", zweifaktor: totp(F.L1.geheimnis),
      fall: m.fall, verfahren: "persoenlich", personalnummer: "" })).status).toBe(400);
    /* Der Fall ist unberührt: mit der Personalnummer des echten Trägers geht es. */
    expect((await freigeben("L1", m.fall)).stand).toBe("teilfreigegeben");
    expect((await anmelden({ zugangscode: Z.TV.code, zweifaktorAktion: "verlust-zurueckziehen" })).status).toBe(200);
  }, LIMIT);

  it("verlust-ablehnen: frischer TOTP, nur derselbe Mandant; M2: Sperre erst nach zwei verschiedenen Personen", async () => {
    const m = await melden("TA");
    expect(m.status, m.roh).toBe(200);
    /* Ohne Code aus der App, mit Wiederherstellungscode, aus anderem Mandanten: abgewiesen. */
    expect((await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-ablehnen", fall: m.fall,
      grund: "sonstiges" })).status).toBe(401);
    expect((await anmelden({ zugangscode: Z.L1.code, zweifaktorAktion: "verlust-ablehnen", fall: m.fall, grund: "sonstiges",
      zweifaktor: F.L1.wiederherstellung[1] })).status).toBe(401);
    expect((await ablehnen("X1", m.fall)).status).toBe(403);
    const a = await ablehnen("L1", m.fall);
    expect(a.status, a.roh).toBe(200);
    expect(a.stand).toBe("abgelehnt");
    /* Eine Ablehnung sperrt nicht: neuer Fall sofort möglich; dieselbe Person erneut: weiterhin keine Sperre. */
    const m2 = await melden("TA");
    expect(m2.status, m2.roh).toBe(200);
    expect((await ablehnen("L1", m2.fall)).status).toBe(200);
    const m3 = await melden("TA");
    expect(m3.status, m3.roh).toBe(200);
    expect((await ablehnen("L2", m3.fall)).status).toBe(200);
    /* Zwei verschiedene Personen: gesperrt. Der gesperrte Aufruf beendet KEINE Sitzung (M1). */
    weiter();
    const sitz = await anmelden({ zugangscode: Z.TA.code, zweifaktor: totp(F.TA.geheimnis) });
    expect(sitz.status, sitz.roh).toBe(200);
    const g = await melden("TA");
    expect(g.status).toBe(409);
    expect(g.verlust).toBe("gesperrt");
    expect((await bestandHolen(sitz.token)).status).toBe(200);
  }, LIMIT);

  it("L1: Einheit am Betriebsdatum (Europe/Berlin) — 23:30 UTC ist in Berlin schon der nächste Tag", async () => {
    /* 2026-11-19 23:30 UTC = 2026-11-20 00:30 in Berlin: lw ist dann in e1, wie l1. */
    uhr(Date.UTC(2026, 10, 19, 23, 30, 15));
    const m = await melden("T3");
    expect(m.status, m.roh).toBe(200);
    expect((await freigeben("L1", m.fall)).stand).toBe("teilfreigegeben");
    const w = await freigeben("LW", m.fall);
    expect(w.status, w.roh).toBe(403);
    expect(w.freigabe).toBeUndefined();
    expect((await freigeben("L2", m.fall)).stand).toBe("freigegeben");
  }, LIMIT);
});
