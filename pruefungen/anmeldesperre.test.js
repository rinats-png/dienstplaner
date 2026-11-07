/* ==========================================================================
   SI-P7 — Herkunftssperre trifft keine gültigen Codes; IPv6 nach /64

   Befund P7 (docs/acc45/SICHERHEIT-INTERN-2026-11.md): Die Bremse beim Anmelden
   greift VOR der Codeprüfung (8 Fehlversuche je 5 min je Herkunft, Sperre bis 2 h,
   dazu Grenzen je Betrieb und für den ganzen Dienst). Hinter einem Stations-NAT
   reicht eine Person mit Tippfehlern, um alle auszusperren — auch mit gültigem
   Code. IPv6 wurde nicht nach /64 gruppiert: Wer eine /64 besitzt, hat 2^64
   Adressen, jede mit frischem Zähler, und füllt damit die Dienstgrenze.

   Sicherheitsinvarianten (jede hat unten mindestens einen Test):

   I1  Ein nutzbarer Zugangscode (gefunden, nicht gesperrt, nicht abgelaufen,
       bekannte Rolle, kein Betreiber) wird nicht wegen der Sperre der Herkunft,
       der Grenze je Betrieb oder der Dienstgrenze abgewiesen.
   I2  Fehlversuche (unbekannter Code) bleiben je Herkunft begrenzt: 8 je 5 min,
       dann Sperre. Eine gelungene Anmeldung nimmt NICHT die Fehlversuche zurück.
   I3  Code-Rotation hilft nicht: Wer Fehlversuche mit gültigen Anmeldungen
       abwechselt, bekommt trotzdem nur 8 Fehlversuche je Fenster.
   I4  Wer während einer Sperre weiter rät, wird weiter gezählt (harter Deckel);
       ist der Deckel gerissen, gilt auch der gültige Code von dort nicht mehr.
       Reißt der Dienst-Deckel, gilt die Durchlässigkeit für alle nicht mehr.
   I5  Betreibercodes behalten die volle Bremse (zweiter Faktor, Verwaltung).
   I6  IPv6 zählt je /64; IPv4 unverändert; Schreibweisen derselben Adresse
       sind dieselbe Herkunft; unbrauchbare Angaben bleiben, wie sie sind.
   I7  Parallele Anfragen überschreiten die Grenzen nicht.

   Aufruf: npx vitest run pruefungen/anmeldesperre.test.js
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const WIRT = "127.0.0.1:3000";
const LIMIT = 60000;
let wurzel, laden, daten, kontoSchreiben, ablageSchluessel, B, SCH;

let nr = 0;
/** Eine Anmeldung von der Adresse `ip` (so, wie server.mjs sie als x-forwarded-for setzt). */
async function anmelden(ip, code) {
  nr += 1;
  const a = await daten(new Request(`http://${WIRT}/api/anmelden`, { method: "POST",
    headers: { host: WIRT, origin: `http://${WIRT}`, "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ zugangscode: code }) }), {});
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}

let zaehler = 0;
/** Eine frische IPv4-Adresse je Aufruf — die Bremse zählt je Herkunft. */
const ipv4 = () => { zaehler += 1; return `10.20.${Math.floor(zaehler / 250)}.${(zaehler % 250) + 1}`; };
/** Eine frische IPv6-/64 je Aufruf, mit wählbarer Schnittstellenkennung. */
const net64 = () => { zaehler += 1; return `2001:db8:${zaehler.toString(16)}:${(zaehler * 7).toString(16)}`; };

async function code(c, { rolle = "mitarbeiter", extra = {} } = {}) {
  await kontoSchreiben(laden(), ablageSchluessel(c), { name: `Code ${c}`, bestand: "sperre-raum", rolle, person: null, betrieb: 0,
    mandantId: "m1", angelegt: "2026-01-01T00:00:00.000Z", ...extra });
  return c;
}
let codeNr = 0;
const frischerCode = async (opt) => code(`SPAA-${String(++codeNr).padStart(4, "0")}-GUET`, opt);
const unbekannt = () => `UNBK-${String(++codeNr).padStart(4, "0")}-NIXX`;

beforeAll(async () => {
  wurzel = await mkdtemp(path.join(tmpdir(), "centric-anmeldesperre-"));
  process.env.CENTRIC_DATEN = wurzel;
  process.env.CENTRIC_ABLAGE = "dateien";
  process.env.CENTRIC_PFEFFER = "pfeffer-nur-zum-pruefen-0123456789";
  delete process.env.REDIS_REST_URL;
  delete process.env.REDIS_REST_TOKEN;
  const { getStore } = await import("../server/lib/ablage.mjs");
  laden = () => getStore({ name: "centric", consistency: "strong" });
  daten = (await import("../server/funktionen/daten.mjs")).default;
  ({ kontoSchreiben } = await import("../server/lib/konten.mjs"));
  ({ ablageSchluessel } = await import("../server/lib/codes.mjs"));
  B = await import("../server/lib/bestand.mjs");
  SCH = await import("../server/lib/schutz.mjs");
  await B.bestandSchreiben(laden(), "sperre-raum", { version: 9, mandanten: [
    { id: "m1", name: "Haus", einheiten: [{ id: "e1" }], personen: [{ id: "l", rolle: "leitung", bereich: "ALLE" }] }] }, { durch: "Pruefung" });
}, LIMIT);
afterAll(async () => { await rm(wurzel, { recursive: true, force: true }); });
afterEach(() => { vi.restoreAllMocks(); });
beforeEach(async () => {
  SCH.sperrversuchZuruecksetzen();
  const s = (await import("../server/lib/ablage.mjs")).getStore({ name: "centric-takt", consistency: "strong" });
  const { blobs } = await s.list({});
  for (const b of blobs) await s.delete(b.key).catch(() => {});
});

/** Acht Fehlversuche von `ip` und ein neunter, der die Sperre zeigt. */
async function sperren(ip) {
  const st = [];
  for (let i = 0; i < 9; i++) st.push((await anmelden(ip, unbekannt())).status);
  return st;
}

describe("I1: ein gültiger Code kommt trotz gesperrter Herkunft durch", () => {
  it("die Herkunft ist nach Fehlversuchen gesperrt, der gültige Code wird trotzdem angenommen", async () => {
    const ip = ipv4();
    const st = await sperren(ip);
    expect(st.slice(0, 8), "die ersten acht Fehlversuche sind 401").toEqual(Array(8).fill(401));
    expect(st[8], "der neunte ist gesperrt").toBe(429);
    expect((await anmelden(ip, unbekannt())).status, "ein weiterer Fehlversuch bleibt gesperrt").toBe(429);
    const c = await frischerCode();
    const a = await anmelden(ip, c);
    expect(a.status, JSON.stringify(a)).toBe(200);
    expect(a.token).toBeTruthy();
  }, LIMIT);

  it("auch mehrere gültige Anmeldungen hintereinander hinter derselben gesperrten Herkunft (Station mit mehreren Personen)", async () => {
    const ip = ipv4();
    await sperren(ip);
    for (let i = 0; i < 4; i++) {
      const a = await anmelden(ip, await frischerCode());
      expect(a.status, `Person ${i + 1}: ${JSON.stringify(a)}`).toBe(200);
    }
  }, LIMIT);

  it("die Dienstgrenze (alle Fehlversuche des Dienstes) trifft einen gültigen Code nicht", async () => {
    // Gesamtgrenze der Bremse füllen — mit Fehlversuchen aus vielen Herkünften.
    for (let i = 0; i < 420; i++) await SCH.bremse("anmelden", `a:fremd-${i}`, null);
    const blockiert = await anmelden(ipv4(), unbekannt());
    expect(blockiert.status, "ein unbekannter Code wird jetzt von der Dienstgrenze gebremst").toBe(429);
    const a = await anmelden(ipv4(), await frischerCode());
    expect(a.status, JSON.stringify(a)).toBe(200);
  }, LIMIT);

  it("ein gesperrter, abgelaufener oder rollenloser Code umgeht die Sperre NICHT (er wird wie ein Fehlversuch behandelt)", async () => {
    const ip = ipv4();
    await sperren(ip);
    const gesperrt = await code(`SPAA-${++codeNr}-GSPR`, { extra: { gesperrt: true } });
    const abgelaufen = await code(`SPAA-${++codeNr}-ABGL`, { extra: { laeuftAb: "2020-01-01T00:00:00.000Z" } });
    const keineRolle = await code(`SPAA-${++codeNr}-ROLL`, { rolle: "gibt-es-nicht" });
    for (const c of [gesperrt, abgelaufen, keineRolle])
      expect((await anmelden(ip, c)).status, c).toBe(429);
  }, LIMIT);
});

describe("I2/I3: Fehlversuche bleiben begrenzt, auch bei Code-Rotation", () => {
  it("eine gelungene Anmeldung nimmt die Fehlversuche der Herkunft nicht zurück", async () => {
    const ip = ipv4();
    const c = await frischerCode();
    for (let i = 0; i < 7; i++) expect((await anmelden(ip, unbekannt())).status).toBe(401);
    expect((await anmelden(ip, c)).status, "gültig").toBe(200);
    // Früher setzte die gelungene Anmeldung den Zähler zurück; jetzt bleiben die sieben bestehen.
    expect((await anmelden(ip, unbekannt())).status, "achter Fehlversuch").toBe(401);
    expect((await anmelden(ip, unbekannt())).status, "neunter: gesperrt").toBe(429);
  }, LIMIT);

  it("Fehlversuche im Wechsel mit gültigen Anmeldungen: höchstens acht Fehlversuche je Fenster", async () => {
    const ip = ipv4();
    /* Drei Codes im Wechsel: Das (bestehende) Lastlimit je Code liegt bei 20 Anmeldungen in fünf Minuten. */
    const codes = [await frischerCode(), await frischerCode(), await frischerCode()];
    let fehlversuche = 0;
    /* 15 Runden: acht freie Fehlversuche plus weniger als neun abgewiesene — darüber greift der harte Deckel (I4). */
    for (let i = 0; i < 15; i++) {
      const f = await anmelden(ip, unbekannt());
      if (f.status === 401) fehlversuche++;
      expect((await anmelden(ip, codes[i % 3])).status, `gültig in Runde ${i}`).toBe(200);
    }
    expect(fehlversuche).toBeLessThanOrEqual(8);
  }, 120000);

  it("verschiedene gültige Codes im Wechsel mit Fehlversuchen: ebenfalls höchstens acht", async () => {
    const ip = ipv4();
    let fehlversuche = 0;
    for (let i = 0; i < 15; i++) {
      if ((await anmelden(ip, unbekannt())).status === 401) fehlversuche++;
      expect((await anmelden(ip, await frischerCode())).status).toBe(200);
    }
    expect(fehlversuche).toBeLessThanOrEqual(8);
  }, 120000);

  it("andere Herkünfte werden von der Sperre nicht berührt", async () => {
    await sperren(ipv4());
    expect((await anmelden(ipv4(), unbekannt())).status, "frische Herkunft: normaler Fehlversuch").toBe(401);
  }, LIMIT);
});

describe("I4: wer während der Sperre weiter rät, verliert die Durchlässigkeit", () => {
  it("nach mehr als acht abgewiesenen Fehlversuchen in EINER Sperre gilt auch der gültige Code von dort nicht mehr; andere Herkünfte bleiben frei", async () => {
    const ip = ipv4();
    await sperren(ip);                    // acht Fehlversuche + der erste abgewiesene (zählt als Sperrversuch Nr. 1)
    const c = await frischerCode();
    expect((await anmelden(ip, c)).status, "noch durchlässig").toBe(200);
    for (let i = 0; i < 7; i++) expect((await anmelden(ip, unbekannt())).status).toBe(429);       // Sperrversuche 2–8
    expect((await anmelden(ip, c)).status, "genau an der Grenze (8): noch durchlässig").toBe(200);
    expect((await anmelden(ip, unbekannt())).status).toBe(429);                                   // Sperrversuch 9 → hart
    expect((await anmelden(ip, c)).status, "harter Deckel gerissen").toBe(429);
    expect((await anmelden(ipv4(), c)).status, "andere Herkunft").toBe(200);
  }, 120000);

  it("Grenzwerte exakt: acht Sperrversuche je Sperre sind frei, der neunte macht hart (Einheit)", () => {
    for (let i = 1; i <= 8; i++) expect(SCH.sperrversuchZaehlen("a:grenze", 300).hart, `Versuch ${i}`).toBe(false);
    expect(SCH.sperrversuchZaehlen("a:grenze", 300).hart, "Versuch 9").toBe(true);
    expect(SCH.gueltigeDurchlassen("a:grenze")).toBe(false);
  });

  it("die harte Sperre endet mit der Sperre (gefälschte Uhr), und eine neue Sperre beginnt bei null", () => {
    const t0 = Date.now();
    const uhr = vi.spyOn(Date, "now").mockReturnValue(t0);
    for (let i = 0; i < 12; i++) SCH.sperrversuchZaehlen("a:ende", 120);
    expect(SCH.gueltigeDurchlassen("a:ende")).toBe(false);
    uhr.mockReturnValue(t0 + 119 * 1000);
    expect(SCH.gueltigeDurchlassen("a:ende"), "kurz vor dem Ende").toBe(false);
    uhr.mockReturnValue(t0 + 121 * 1000);
    expect(SCH.gueltigeDurchlassen("a:ende"), "nach dem Ende").toBe(true);
    // Eine neue Sperre zählt von vorn: acht Sperrversuche machen noch nicht hart.
    for (let i = 0; i < 8; i++) SCH.sperrversuchZaehlen("a:ende", 600);
    expect(SCH.gueltigeDurchlassen("a:ende")).toBe(true);
    SCH.sperrversuchZaehlen("a:ende", 600);          // der neunte der NEUEN Sperre
    expect(SCH.gueltigeDurchlassen("a:ende"), "neue Sperre, neun Versuche: hart").toBe(false);
  });

  it("eine einzelne Herkunft kann den Dienst-Deckel nicht reißen (Review 2)", () => {
    for (let i = 0; i < 2000; i++) SCH.sperrversuchZaehlen("a:einsamer-angreifer", 300);
    expect(SCH.gueltigeDurchlassen("a:einsamer-angreifer")).toBe(false);
    expect(SCH.gueltigeDurchlassen("a:unbeteiligt"), "andere Herkünfte bleiben durchlässig").toBe(true);
  });

  it("Dienst-Deckel exakt: erst viele verschiedene Herkünfte reißen ihn (1200 / 1201), und er endet mit dem Fenster", () => {
    const fenster = SCH.SPERRVERSUCHE.gesamt.fenster * 1000;
    const t0 = Math.floor(Date.now() / fenster) * fenster + 1000;
    const uhr = vi.spyOn(Date, "now").mockReturnValue(t0);
    // 133 Herkünfte × 9 Beiträge = 1197
    for (let q = 0; q < 133; q++) for (let i = 0; i < 12; i++) SCH.sperrversuchZaehlen(`a:q-${q}`, 300);
    expect(SCH.gueltigeDurchlassen("a:irgendwer"), "1197").toBe(true);
    for (let i = 0; i < 3; i++) SCH.sperrversuchZaehlen("a:q-133", 300);
    expect(SCH.gueltigeDurchlassen("a:irgendwer"), "1200: noch nicht über der Grenze").toBe(true);
    SCH.sperrversuchZaehlen("a:q-133", 300);
    expect(SCH.gueltigeDurchlassen("a:irgendwer"), "1201: Deckel gerissen").toBe(false);
    uhr.mockReturnValue(t0 + fenster);
    expect(SCH.gueltigeDurchlassen("a:irgendwer"), "im nächsten Fenster").toBe(true);
  });

  it("Ausnahmezustand (Dienst-Deckel gerissen): Fehlversuche im Wechsel mit gültigen Anmeldungen bleiben begrenzt — die gültige Anmeldung löscht keine Fehlversuche (Review 5)", async () => {
    for (let q = 0; q < 140; q++) for (let i = 0; i < 12; i++) SCH.sperrversuchZaehlen(`a:botnetz-${q}`, 300);
    expect(SCH.gueltigeDurchlassen("a:egal")).toBe(false);
    const ip = ipv4();
    const c = await frischerCode();
    let fehl = 0;
    for (let i = 0; i < 12; i++) {
      if ((await anmelden(ip, unbekannt())).status === 401) fehl++;
      const a = await anmelden(ip, c);
      expect([200, 429], `gültig in Runde ${i}`).toContain(a.status);
    }
    expect(fehl).toBeLessThanOrEqual(8);
  }, 120000);
});

describe("Steigerungsstufe verfällt (Review 3)", () => {
  it("nach Stunden ohne Sperre ist die Stufe wieder abgebaut; bei Dauerbeschuss steigt sie weiter", async () => {
    const t0 = Date.now();
    const uhr = vi.spyOn(Date, "now").mockReturnValue(t0);
    const k = `a:stufe-${++zaehler}`;
    const sperre = async () => { let r; for (let i = 0; i < 9; i++) r = await SCH.bremse("anmelden", k); return r; };
    const erste = await sperre();
    expect(erste.frei).toBe(false);
    expect(erste.wartet).toBe(300);
    expect(erste.stufe).toBe(0);
    uhr.mockReturnValue(t0 + 700 * 1000);                    // Sperre vorbei, kurz darauf wieder angerannt
    const zweite = await sperre();
    expect(zweite.stufe, "ohne Pause steigt die Stufe").toBe(1);
    expect(zweite.wartet).toBe(600);
    uhr.mockReturnValue(t0 + (700 + 5 * 3600) * 1000);       // fünf Stunden Ruhe
    const dritte = await sperre();
    expect(dritte.stufe, "nach fünf Stunden abgebaut").toBe(0);
    expect(dritte.wartet).toBe(300);
  }, 120000);
});

describe("I5: Betreibercodes behalten die volle Bremse", () => {
  it("ein gültiger Betreibercode wird von der Sperre der Herkunft weiter gebremst", async () => {
    const ip = ipv4();
    await sperren(ip);
    const b = await code(`SPAA-${++codeNr}-BETR`, { rolle: "betreiber", extra: { mandantId: undefined } });
    expect((await anmelden(ip, b)).status).toBe(429);
  }, LIMIT);
});

describe("I6: IPv6 zählt je /64", () => {
  it("neun Fehlversuche aus neun Adressen derselben /64 sperren diese /64", async () => {
    const n = net64();
    const st = [];
    for (let i = 0; i < 9; i++) st.push((await anmelden(`${n}:${(i + 1).toString(16)}:aaaa:bbbb:cccc`, unbekannt())).status);
    expect(st.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(st[8], "die neunte Adresse derselben /64 ist gesperrt").toBe(429);
  }, LIMIT);

  it("eine andere /64 ist unberührt", async () => {
    const a = net64();
    for (let i = 0; i < 9; i++) await anmelden(`${a}:1:2:3:${(i + 1).toString(16)}`, unbekannt());
    expect((await anmelden(`${net64()}:1:2:3:4`, unbekannt())).status).toBe(401);
  }, LIMIT);

  it("ein gültiger Code von einer gesperrten /64 wird angenommen (Netzwerkpräfix gleich, andere Schnittstellenkennung)", async () => {
    const n = net64();
    for (let i = 0; i < 9; i++) await anmelden(`${n}:9:9:9:${(i + 1).toString(16)}`, unbekannt());
    const a = await anmelden(`${n}:aaaa:bbbb:cccc:dddd`, await frischerCode());
    expect(a.status, JSON.stringify(a)).toBe(200);
  }, LIMIT);

  const k = (ip) => SCH.kennung(new Request("http://x/", { headers: { "x-forwarded-for": ip } }), null);
  it("Schreibweisen derselben Adresse und dieselbe /64 ergeben dieselbe Kennung", () => {
    const basis = k("2001:db8:1:2:3:4:5:6");
    expect(k("2001:0db8:0001:0002:0003:0004:0005:0006")).toBe(basis);
    expect(k("2001:DB8:1:2:ffff:eeee:dddd:cccc"), "andere Schnittstellenkennung").toBe(basis);
    expect(k("[2001:db8:1:2::9]"), "in Klammern").toBe(basis);
    expect(k("2001:db8:1:2::9%eth0"), "mit Zonenkennung").toBe(basis);
    expect(k("2001:db8:1:3::1"), "andere /64").not.toBe(basis);
    expect(k("2001:db9:1:2::1"), "anderes Netz").not.toBe(basis);
  });

  it("verkürzte Schreibweisen mit :: werden richtig aufgelöst", () => {
    expect(k("2001:db8::1")).toBe(k("2001:db8:0:0:5:6:7:8"));
    expect(k("2001:db8:0:1::")).toBe(k("2001:db8:0:1:ffff::1"));
    expect(k("::1")).toBe(k("0:0:0:0:1:2:3:4"));
    expect(k("::"), "Unspezifizierte Adresse").toBe(k("0:0:0:0::5"));
  });

  it("IPv4 bleibt unverändert, IPv4-gemappte IPv6 zählt wie die IPv4-Adresse", () => {
    expect(k("203.0.113.7")).not.toBe(k("203.0.113.8"));
    expect(k("::ffff:203.0.113.7")).toBe(k("203.0.113.7"));
    expect(k("203.0.113.7:5000")).toBe(k("203.0.113.7"));
  });

  it("IPv4-gemappte Adressen in Hex-Schreibweise und NAT64 zählen wie die eingebettete IPv4 (sonst teilten sich alle ein /64)", () => {
    expect(k("::ffff:cb00:7107"), "203.0.113.7 in Hex").toBe(k("203.0.113.7"));
    expect(k("::ffff:cb00:7108")).not.toBe(k("::ffff:cb00:7107"));
    expect(k("64:ff9b::203.0.113.7")).toBe(k("203.0.113.7"));
    expect(k("64:ff9b::cb00:7107")).toBe(k("203.0.113.7"));
    expect(k("64:ff9b::203.0.113.7")).not.toBe(k("64:ff9b::198.51.100.1"));
  });

  it("unbrauchbare Angaben fallen nicht zusammen und bleiben, wie sie waren", () => {
    expect(k("unbekannt")).toBe(k("unbekannt"));
    expect(k("kein-ip-1")).not.toBe(k("kein-ip-2"));
    expect(k("2001:db8:1:2:3:4:5:6:7")).not.toBe(k("2001:db8:1:2:3:4:5:8:9"));   // zu lang: keine IPv6, unverändert
    expect(k("12345::1")).not.toBe(k("12345::2"));                                // Glied zu lang
    expect(k("2001:db8:1:2:3:4:5:6:7")).not.toBe(k("2001:db8:1:2:aaaa::1"));
  });

  it("Rotation über die Schnittstellenkennung einer /64 liefert keine frischen Zähler", async () => {
    const n = net64();
    const antworten = [];
    for (let i = 0; i < 30; i++)
      antworten.push((await anmelden(`${n}:${(i + 100).toString(16)}:${(i * 3 + 1).toString(16)}:7:${(i + 5).toString(16)}`, unbekannt())).status);
    expect(antworten.filter((s) => s === 401).length).toBeLessThanOrEqual(8);
  }, 120000);
});

describe("I7: parallele Anfragen", () => {
  it("40 gleichzeitige Fehlversuche von einer Herkunft: nicht mehr als die Grenze kommt durch", async () => {
    const ip = ipv4();
    const erg = await Promise.all(Array.from({ length: 40 }, () => anmelden(ip, unbekannt())));
    expect(erg.filter((e) => e.status === 401).length).toBeLessThanOrEqual(10);
    expect(erg.filter((e) => e.status === 429).length).toBeGreaterThanOrEqual(30);
  }, LIMIT);

  it("gleichzeitige gültige Anmeldungen hinter einer gesperrten Herkunft gelingen alle", async () => {
    const ip = ipv4();
    await sperren(ip);
    const codes = await Promise.all(Array.from({ length: 12 }, () => frischerCode()));
    const erg = await Promise.all(codes.map((c) => anmelden(ip, c)));
    expect(erg.map((e) => e.status)).toEqual(Array(12).fill(200));
  }, LIMIT);

  it("gleichzeitig Fehlversuche und gültige Anmeldungen: die Fehlversuche bleiben begrenzt", async () => {
    const ip = ipv4();
    const c = await frischerCode();
    const aufgaben = [];
    for (let i = 0; i < 30; i++) { aufgaben.push(anmelden(ip, unbekannt())); aufgaben.push(anmelden(ip, c)); }
    const erg = await Promise.all(aufgaben);
    const fehl = erg.filter((e, i) => i % 2 === 0 && e.status === 401).length;
    expect(fehl).toBeLessThanOrEqual(10);
  }, 120000);
});
