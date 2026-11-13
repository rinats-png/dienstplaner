/* ==========================================================================
   ABNAHME V4 STRANG A — DURCHGEHENDER GESCHÄFTSABLAUF ÜBER DEN ECHTEN SERVER

   Lokale Integrationsabnahme (keine Staging-Abnahme): server.mjs startet auf
   127.0.0.1 mit Wegwerfablage, NODE_ENV=development, ohne Demo, ohne Import
   (CENTRIC_IMPORT_AKTIV entfernt). Nur erfundene Daten. Jeder Schritt geht
   über HTTP durch die echten Handler (einrichten, daten, einladung, import).

   Bereiche (Auftrag 2026-11-13, Strang A):
     1  Betrieb anlegen und konfigurieren       (Betreiber legt zwei Räume an,
                                                  Leitung konfiguriert)
     2  Benutzer und Rollen einrichten          (Betreiber → Leitung; Leitung
                                                  lädt Planung, Beschäftigte,
                                                  SV, Betriebsrat ein)
     3  Personal anlegen                         (Leitung über PUT /api/bestand;
                                                  Import bleibt aus: 404)
     4  Schichtmodelle zuordnen (IMP-6, nur API) (Leitung/Planung ja, andere nein)
     5  Dienstplan erstellen, ändern, freigeben  (Planung; Beschäftigte sehen den
                                                  Entwurf nicht, nach Freigabe ja;
                                                  plan.publish nur Leitung/Planung)
    11  Mandantentrennung                        (zweiter Betrieb, gefälschte
                                                  Kennungen, fremde ETags, fremde
                                                  Personen bei Einladungen)

   Die Schritte bauen aufeinander auf (ein Ablauf); deshalb sequentiell.
   Aufruf: npx vitest run pruefungen/abnahme-a-ablauf.test.js --testTimeout=120000
   ========================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverStarten } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = "abnahme-a-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const NORD = "abn-a-nord", SUED = "abn-a-sued";
/* Unverwechselbare Marker in Namen: tauchen sie in einer fremden Antwort auf, ist die Trennung gebrochen. */
const MK_NORD = "MKNORDX7", MK_SUED = "MKSUEDQ4";
const kopie = (x) => JSON.parse(JSON.stringify(x));

let kind, statik, daten, BASIS, log = () => "";
let xff = 0;

async function anfrage(pfad, { methode = "GET", rumpf, token } = {}) {
  xff += 1;
  const kopf = { "x-forwarded-for": `10.61.${Math.floor(xff / 250) % 250}.${(xff % 250) + 1}` };
  if (methode !== "GET") kopf["content-type"] = "application/json";
  if (token) kopf.authorization = `Bearer ${token}`;
  const a = await fetch(BASIS + pfad, { method: methode, headers: kopf,
    ...(methode === "GET" ? {} : { body: JSON.stringify(rumpf || {}) }) });
  let d = {}; try { d = await a.json(); } catch { /* leer */ }
  return { status: a.status, ...d };
}
const anmelden = async (code) => {
  const a = await anfrage("/api/anmelden", { methode: "POST", rumpf: { zugangscode: code } });
  expect(a.status, `Anmeldung: ${a.fehler || ""}`).toBe(200);
  expect(typeof a.token).toBe("string");
  return a.token;
};
const lesen = (token) => anfrage("/api/bestand", { token });
/** Lesen, ändern, zurückschreiben — wie die Oberfläche (voller Weg mit ETag). */
async function schreiben(token, aendern, { etag } = {}) {
  const g = await lesen(token);
  expect(g.status).toBe(200);
  const b = kopie(g.bestand);
  aendern(b.mandanten[0], b);
  return anfrage("/api/bestand", { methode: "PUT", token, rumpf: { bestand: b, etag: etag === undefined ? g.etag : etag } });
}

/* Berlin-Monate: Plan im übernächsten Monat (sicher in der Zukunft, nie abgeschlossen). */
const heute = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
const monatPlus = (n) => new Date(Date.UTC(Number(heute.slice(0, 4)), Number(heute.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const M = monatPlus(2);
/* T1/T2 zwei Tage auseinander: Spät am T1 und Früh am T2 verletzt die Ruhezeit nicht (am Folgetag wäre es eine Sperre). */
const T1 = `${M}-10`, T2 = `${M}-12`;

const person = (id, rolle, extra = {}) => ({ id, vorname: `V${id}`, nachname: `${MK_NORD}-${id}`, rolle, bereich: rolle === "leitung" || rolle === "planer" || rolle === "betriebsrat" ? "ALLE" : "e1",
  status: "aktiv", geburtstag: "1985-01-01", zugehoerigkeit: [{ ab: "2020-01-01", einheitId: rolle === "leitung" || rolle === "planer" || rolle === "betriebsrat" ? "ALLE" : "e1" }],
  qualifikationen: [], ...extra });

/* Bis zum Vortag des Planmonats das bisherige Betriebsmodell, ab dem Planmonat das neue (keine Rückwirkung). */
const vortag = (t) => new Date(Date.parse(`${t}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
const BIS_M = (id, versatz) => [{ id: `${id}-alt`, modellId: "betrieb", gueltigAb: null, gueltigBis: vortag(`${M}-01`) },
  { id, modellId: "frueh2", gueltigAb: `${M}-01`, gueltigBis: null, versatz }];
const T = {};          // Tokens je Rolle (Nord) und Leitung Süd
const CODE = {};       // Zugangscodes (nie ausgegeben)
let betreiber;

beforeAll(async () => {
  statik = await mkdtemp(path.join(tmpdir(), "centric-abn-a-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-abn-a-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>CENTRIC Abnahme A</title>");
  const st = await serverStarten({ cwd: WURZEL, wartenMs: 30_000, env: {
    CENTRIC_STATIK: statik, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", CENTRIC_ADMIN: ADMIN,
    CENTRIC_PFEFFER: "abnahme-a-pfeffer-" + Math.random().toString(36).slice(2),
    CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1", NODE_ENV: "development",
    CENTRIC_DEMO: undefined, CENTRIC_SELBSTSTART: undefined, CENTRIC_IMPORT_AKTIV: undefined,
    CENTRIC_REGISTRIERUNG: undefined } });
  ({ kind, basis: BASIS } = st);
  log = st.log;
  expect(new URL(BASIS).hostname).toBe("127.0.0.1");
  expect(st.port).not.toBe(3999);
}, 60_000);

afterAll(async () => {
  if (kind && kind.exitCode === null) kind.kill("SIGKILL");
  await rm(statik, { recursive: true, force: true }).catch(() => {});
  await rm(daten, { recursive: true, force: true }).catch(() => {});
});

describe.sequential("Strang A: Betreiber → Leitung → Personal → Schichtmodell → Plan → Beschäftigte, zwei Betriebe", () => {
  /* ---------------- Bereich 1: Betrieb anlegen und konfigurieren ---------------- */
  it("1.1 Betreiber richtet sich ein und legt zwei leere Betriebe an", async () => {
    const e = await anfrage("/einrichten", { methode: "POST", rumpf: { verwaltung: ADMIN, name: "Betreiber", bestand: "abn-a-betreiber",
      rolle: "betreiber", person: null, betrieb: 0 } });
    expect(e.status, e.fehler).toBe(200);
    betreiber = await anmelden(e.zugangscode);
    for (const [raum, name] of [[NORD, `Haus Nord ${MK_NORD}`], [SUED, `Haus Süd ${MK_SUED}`]]) {
      const a = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiber, rumpf: { bestand: raum, vorlage: "leer", name } });
      expect(a.status, a.fehler).toBe(200);
      expect(a.mandanten).toEqual([raum]);
    }
    /* Derselbe Raum ein zweites Mal: belegt, nichts überschrieben. */
    const doppelt = await anfrage("/api/bestand-anlegen", { methode: "POST", token: betreiber, rumpf: { bestand: NORD, vorlage: "leer", name: "Überschrieben" } });
    expect(doppelt.status).toBe(409);
  });

  it("1.2 Ohne Betreibersitzung kein Betrieb und keine Zugänge", async () => {
    for (const token of [undefined, "erfunden-0123456789"]) {
      expect([401, 403]).toContain((await anfrage("/api/bestand-anlegen", { methode: "POST", token, rumpf: { bestand: "abn-a-fremd", vorlage: "leer" } })).status);
      expect([401, 403]).toContain((await anfrage("/api/zugaenge", { methode: "POST", token, rumpf: { bestand: NORD, eintraege: [{ rolle: "leitung" }] } })).status);
    }
  });

  /* ---------------- Bereich 2: Benutzer und Rollen einrichten ---------------- */
  it("2.1 Betreiber vergibt je Betrieb einen Leitungszugang — nie einen Betreiberzugang", async () => {
    for (const [raum, k] of [[NORD, "leitung"], [SUED, "leitungSued"]]) {
      const z = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: raum, eintraege: [{ rolle: "leitung", personId: null, name: `Leitung ${raum}` }] } });
      expect(z.status, z.fehler).toBe(200);
      CODE[k] = z.zugaenge[0].code;
    }
    const bt = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: NORD, eintraege: [{ rolle: "betreiber", personId: null }] } });
    expect(bt.status).toBe(400);
    const ohnePerson = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: NORD, eintraege: [{ rolle: "mitarbeiter", personId: null }] } });
    expect(ohnePerson.status).toBe(400);
    T.leitung = await anmelden(CODE.leitung);
    T.leitungSued = await anmelden(CODE.leitungSued);
  });

  it("1.3 Leitung konfiguriert ihren Betrieb (Name, Dienstarten, Planfreigabe-Pflicht ab Werk)", async () => {
    const g = await lesen(T.leitung);
    expect(g.status).toBe(200);
    expect(g.rolle).toBe("leitung");
    expect(g.bestand.mandanten.map((m) => m.id)).toEqual([NORD]);
    expect(g.bestand.mandanten[0].einstellungen && g.bestand.mandanten[0].einstellungen.planFreigabePflicht).toBe(true);
    const a = await schreiben(T.leitung, (m) => {
      m.name = `Haus Nord ${MK_NORD} (konfiguriert)`;
      m.dienstarten = [...(m.dienstarten || []).filter((d) => d.id !== "F" && d.id !== "S"),
        { id: "F", name: "Früh", start: "06:00", ende: "14:00", pause: 30 }, { id: "S", name: "Spät", start: "14:00", ende: "22:00", pause: 30 }];
    });
    expect(a.status, a.text || a.fehler).toBe(200);
    const n = (await lesen(T.leitung)).bestand.mandanten[0];
    expect(n.name).toBe(`Haus Nord ${MK_NORD} (konfiguriert)`);
    expect(n.dienstarten.map((d) => d.id)).toEqual(expect.arrayContaining(["F", "S"]));
  });

  /* ---------------- Bereich 3: Personal anlegen ---------------- */
  it("3.1 Leitung legt Personal an (Planung, zwei Beschäftigte, SV, Betriebsrat, Kundenrolle)", async () => {
    const a = await schreiben(T.leitung, (m) => {
      m.personen = [...m.personen, person("p1", "planer"), person("a1", "mitarbeiter"), person("a2", "mitarbeiter"),
        person("s1", "subplaner"), person("r1", "betriebsrat"), person("k1", "kunde")];
    });
    expect(a.status, a.text || a.fehler).toBe(200);
    const ids = (await lesen(T.leitung)).bestand.mandanten[0].personen.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["p1", "a1", "a2", "s1", "r1", "k1"]));
  });

  it("3.2 Personalimport bleibt gesperrt (CENTRIC_IMPORT_AKTIV nicht gesetzt): jeder /api/import-Weg 404", async () => {
    /* Die fünf Wege des Imports (server/funktionen/import.mjs, config.path). */
    for (const [p, methode] of [["/api/import/upload", "POST"], ["/api/import/analyse", "POST"], ["/api/import/vorschau", "POST"],
      ["/api/import/uebernahme", "POST"], ["/api/import/verwerfen", "POST"]]) {
      for (const token of [T.leitung, betreiber, undefined]) {
        const a = await anfrage(p, { methode, token, rumpf: {} });
        expect(a.status, `${methode} ${p}`).toBe(404);
      }
    }
  });

  it("2.2 Leitung lädt Planung, Beschäftigte, SV und Betriebsrat ein; Codes melden sich mit der richtigen Rolle an", async () => {
    for (const [pid, rolle] of [["p1", "planer"], ["a1", "mitarbeiter"], ["a2", "mitarbeiter"], ["s1", "subplaner"], ["r1", "betriebsrat"]]) {
      const e = await anfrage("/api/einladung", { methode: "POST", token: T.leitung, rumpf: { personId: pid, rolle, bestaetigung: { zugangscode: CODE.leitung } } });
      expect(e.status, `${pid}: ${e.fehler}`).toBe(200);
      expect(e.rolle).toBe(rolle);
      const an = await anfrage("/api/einladung/annehmen", { methode: "POST", rumpf: { einladung: e.einladung } });
      expect(an.status, `${pid} annehmen: ${an.fehler}`).toBe(200);
      expect(an.rolle).toBe(rolle);
      CODE[pid] = an.zugangscode;
      T[pid] = await anmelden(an.zugangscode);
      const g = await lesen(T[pid]);
      expect(g.rolle, pid).toBe(rolle);
      expect(g.person, pid).toBe(pid);
    }
  });

  it("2.2b Altrolle kunde: weder Leitung (403) noch Betreiber (400) vergeben sie; der Betreiber legt für den eingerichteten Kundenraum keine weiteren Zugänge an (409, G.2)", async () => {
    const e = await anfrage("/api/einladung", { methode: "POST", token: T.leitung, rumpf: { personId: "k1", bestaetigung: { zugangscode: CODE.leitung } } });
    expect(e.status).toBe(403);
    const k = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: NORD, eintraege: [{ rolle: "kunde", personId: "k1" }] } });
    expect(k.status).toBe(400);
    const z = await anfrage("/api/zugaenge", { methode: "POST", token: betreiber, rumpf: { bestand: NORD, eintraege: [{ rolle: "planer", personId: "p1" }] } });
    expect(z.status).toBe(409);
    expect(z.grund).toBe("kundenraum_gesperrt");
  });

  it("2.3 Einladungen: zweiter Zugang je Person 409; Betriebsrat, Beschäftigte und SV laden nicht ein (403)", async () => {
    /* Budget: Die Einladungsbremse zählt je Raum (schutz.mjs „zugaenge“: 10 Versuche je 10 min). 2.2/2.2b haben 6
       verbraucht; hier genau vier weitere, damit jede Absage eine Rollenabsage ist und keine Bremse (Befund A-2).
       Falsche Rolle und falsche Bestätigung prüft pruefungen/einladungen.test.js. */
    expect((await anfrage("/api/einladung", { methode: "POST", token: T.leitung, rumpf: { personId: "a1", bestaetigung: { zugangscode: CODE.leitung } } })).status).toBe(409);
    for (const k of ["r1", "a1", "s1"]) {
      const e = await anfrage("/api/einladung", { methode: "POST", token: T[k], rumpf: { personId: "a2", bestaetigung: { zugangscode: CODE[k] } } });
      expect(e.status, `${k} darf nicht einladen: ${e.fehler}`).toBe(403);
      expect(e.einladung, k).toBeUndefined();
    }
  });

  it("2.4 Befund A-2: Nach zehn Einladungsversuchen im Raum ist auch die Leitung gesperrt (429) — auch durch Absagen anderer Rollen verbraucht", async () => {
    const e = await anfrage("/api/einladung", { methode: "POST", token: T.leitung, rumpf: { personId: "a2", bestaetigung: { zugangscode: CODE.leitung } } });
    expect(e.status).toBe(429);
  });

  /* ---------------- Bereich 4: Schichtmodelle zuordnen (IMP-6, nur API) ---------------- */
  it("4.1 Leitung legt ein Schichtmodell an und ordnet es a1 ab dem Planmonat zu; Wann/Wer vom Server", async () => {
    const a = await schreiben(T.leitung, (m) => {
      m.schichtmodelle = [{ id: "frueh2", name: "Früh-Wechsel", tage: ["F", "F", "-"], geaendertVon: "gefälscht", version: 99 }];
      m.personen.find((p) => p.id === "a1").schichtmodellZuordnungen = BIS_M("z1", 0);
    });
    expect(a.status, a.text || a.fehler).toBe(200);
    const m = (await lesen(T.leitung)).bestand.mandanten[0];
    expect(m.schichtmodelle[0]).toMatchObject({ id: "frueh2", version: 1 });
    expect(m.schichtmodelle[0].geaendertVon).not.toBe("gefälscht");
    expect(m.personen.find((p) => p.id === "a1").schichtmodellZuordnungen[1]).toMatchObject({ modellId: "frueh2", gueltigAb: `${M}-01`, version: 1 });
  });

  it("4.2 Planung darf zuordnen; Beschäftigte, SV und Betriebsrat ändern keine Zuordnung", async () => {
    const p = await schreiben(T.p1, (m) => {
      m.personen.find((x) => x.id === "a2").schichtmodellZuordnungen = BIS_M("z2", 1);
    });
    expect(p.status, p.text || p.fehler).toBe(200);
    const vorher = (await lesen(T.leitung)).bestand.mandanten[0];
    for (const k of ["a1", "s1", "r1"]) {
      const a = await schreiben(T[k], (m) => {
        m.schichtmodelle = [{ id: "boese", name: "x", tage: ["F"] }];
        for (const x of m.personen || []) x.schichtmodellZuordnungen = [{ id: "zb", modellId: "boese", gueltigAb: `${M}-01`, gueltigBis: null }];
      });
      expect([200, 403, 409, 422], `${k}: ${a.status}`).toContain(a.status);
      const nachher = (await lesen(T.leitung)).bestand.mandanten[0];
      expect(nachher.schichtmodelle, k).toEqual(vorher.schichtmodelle);
      expect(nachher.personen.map((x) => x.schichtmodellZuordnungen || null), k).toEqual(vorher.personen.map((x) => x.schichtmodellZuordnungen || null));
    }
  });

  it("4.3 Rückwirkende Zuordnung (gestern) wird mit Grund abgewiesen, nichts gespeichert", async () => {
    const gestern = vortag(heute);
    const vorher = (await lesen(T.leitung)).bestand.mandanten[0];
    const a = await schreiben(T.leitung, (m) => {
      m.personen.find((p) => p.id === "a1").schichtmodellZuordnungen = [{ id: "z1", modellId: "frueh2", gueltigAb: gestern, gueltigBis: null, versatz: 0 }];
    });
    expect(a.status).toBeGreaterThanOrEqual(400);
    const nachher = (await lesen(T.leitung)).bestand.mandanten[0];
    expect(nachher.personen.find((p) => p.id === "a1").schichtmodellZuordnungen).toEqual(vorher.personen.find((p) => p.id === "a1").schichtmodellZuordnungen);
  });

  /* ---------------- Bereich 5: Dienstpläne erstellen, ändern, veröffentlichen ---------------- */
  it("5.1 Planung erstellt einen Entwurf; Beschäftigte sehen ihn nicht", async () => {
    const a = await schreiben(T.p1, (m) => { m.abweichungen = { ...m.abweichungen, [`a1|${T1}`]: "F", [`a2|${T1}`]: "S" }; });
    expect(a.status, a.text || a.fehler).toBe(200);
    expect((await lesen(T.p1)).bestand.mandanten[0].abweichungen[`a1|${T1}`]).toBe("F");
    const ma = (await lesen(T.a1)).bestand.mandanten[0];
    expect((ma.abweichungen || {})[`a1|${T1}`]).toBeUndefined();
  });

  it("5.2 Planung ändert den Entwurf", async () => {
    const a = await schreiben(T.p1, (m) => { m.abweichungen[`a1|${T1}`] = "S"; m.abweichungen[`a1|${T2}`] = "F"; });
    expect(a.status, a.text || a.fehler).toBe(200);
    const ab = (await lesen(T.p1)).bestand.mandanten[0].abweichungen;
    expect(ab[`a1|${T1}`]).toBe("S");
    expect(ab[`a1|${T2}`]).toBe("F");
  });

  it("5.3 Ohne plan.publish keine Freigabe: SV, Beschäftigte, Betriebsrat", async () => {
    /* SV: ausdrückliche Absage. Beschäftigte und Betriebsrat: Absage oder stilles Verwerfen (wie rb1-plan-publish) —
       entscheidend ist, dass nichts gespeichert wird. Die Altrolle kunde hat hier keinen Zugang (2.2b); RB-3 prüft sie. */
    for (const k of ["s1", "a1", "r1"]) {
      const a = await schreiben(T[k], (m) => {
        m.freigaben = { ...(m.freigaben || {}), [M]: { stand: 1, zeit: "x", durch: "Fremd" } };
        m.planstaende = { ...(m.planstaende || {}), [M]: { [`a1|${T1}`]: "S" } };
      });
      if (k === "s1") expect(a.status, `${k}: ${a.text}`).toBe(403);
      else expect([200, 403], `${k}: ${a.status}`).toContain(a.status);
      expect(((await lesen(T.p1)).bestand.mandanten[0].freigaben || {})[M], k).toBeUndefined();
    }
  });

  it("5.4 Planung veröffentlicht; die Beschäftigte sieht danach ihren Plan", async () => {
    const a = await schreiben(T.p1, (m) => {
      const abbild = Object.fromEntries(Object.entries(m.abweichungen).filter(([k]) => k.split("|")[1].startsWith(M)));
      m.freigaben = { ...(m.freigaben || {}), [M]: { stand: 1, zeit: new Date().toLocaleString("de-DE"), durch: "Planung" } };
      m.planstaende = { ...(m.planstaende || {}), [M]: abbild };
    });
    expect(a.status, a.text || a.fehler).toBe(200);
    const ma = (await lesen(T.a1)).bestand.mandanten[0];
    expect(ma.freigaben[M]).toBeTruthy();
    expect(ma.abweichungen[`a1|${T1}`]).toBe("S");
    expect(ma.abweichungen[`a1|${T2}`]).toBe("F");
  });

  it("5.5 Leitung darf ebenfalls veröffentlichen (erneute Freigabe, Stand 2)", async () => {
    const a = await schreiben(T.leitung, (m) => {
      m.abweichungen[`a2|${M}-14`] = "F";
      m.freigaben = { ...m.freigaben, [M]: { stand: 2, zeit: "jetzt", durch: "Leitung" } };
      m.planstaende = { ...m.planstaende, [M]: Object.fromEntries(Object.entries(m.abweichungen).filter(([k]) => k.split("|")[1].startsWith(M))) };
    });
    expect(a.status, a.text || a.fehler).toBe(200);
    expect((await lesen(T.a2)).bestand.mandanten[0].freigaben[M].stand).toBe(2);
  });

  /* ---------------- Bereich 11: Mandantentrennung und Berechtigungen ---------------- */
  it("11.1 Leitung Süd sieht nichts aus Nord; Nord nichts aus Süd", async () => {
    const sued = await lesen(T.leitungSued);
    expect(sued.bestand.mandanten.map((m) => m.id)).toEqual([SUED]);
    expect(JSON.stringify(sued)).not.toContain(MK_NORD);
    for (const k of ["leitung", "p1", "a1", "s1", "r1"]) {
      const g = await lesen(T[k]);
      expect(g.bestand.mandanten.map((m) => m.id), k).toEqual([NORD]);
      expect(JSON.stringify(g), k).not.toContain(MK_SUED);
    }
  });

  it("11.2 Gefälschte Rümpfe: Süd schickt den Nord-Betrieb, eine Nord-Kennung oder beide Betriebe — abgewiesen, Nord unverändert", async () => {
    const nordVorher = (await lesen(T.leitung)).bestand.mandanten[0];
    const nordKopie = kopie(nordVorher);
    const faelle = {
      "nur Nord": (m, b) => { b.mandanten = [{ ...kopie(nordKopie), name: "übernommen" }]; },
      "Süd mit Nord-Kennung": (m) => { m.id = NORD; m.name = "übernommen"; },
      "Süd und Nord": (m, b) => { b.mandanten.push({ ...kopie(nordKopie), name: "übernommen" }); },
    };
    for (const [name, f] of Object.entries(faelle)) {
      const a = await schreiben(T.leitungSued, f);
      expect(a.status, `${name}: ${a.status}`).toBeGreaterThanOrEqual(400);
    }
    /* Planung Nord kann ebenso wenig in Süd schreiben. */
    const p = await schreiben(T.p1, (m) => { m.id = SUED; });
    expect(p.status).toBeGreaterThanOrEqual(400);
    const nordNachher = (await lesen(T.leitung)).bestand.mandanten[0];
    expect(nordNachher.name).toBe(nordVorher.name);
    expect(nordNachher.personen).toEqual(nordVorher.personen);
    expect((await lesen(T.leitungSued)).bestand.mandanten[0].name).toBe(`Haus Süd ${MK_SUED}`);
  });

  it("11.3 Gleichzeitige Bearbeitung desselben Monats: die ältere Kopie überschreibt nichts (409); ohne/ungültiger ETag 409", async () => {
    /* Der Server führt je Monat zusammen (bestandSchreiben): Ein älterer ETag ist nur dann ein Konflikt, wenn
       inzwischen DERSELBE Monat (oder der Kern) geändert wurde. Genau das wird hier hergestellt. */
    const alt = await lesen(T.p1);
    const l = await schreiben(T.leitung, (m) => { m.abweichungen[`a2|${M}-20`] = "F"; });
    expect(l.status, l.text || l.fehler).toBe(200);
    const b = kopie(alt.bestand);
    b.mandanten[0].abweichungen[`a2|${M}-20`] = "S";
    const a = await anfrage("/api/bestand", { methode: "PUT", token: T.p1, rumpf: { bestand: b, etag: alt.etag } });
    expect(a.status).toBe(409);
    expect((await lesen(T.p1)).bestand.mandanten[0].abweichungen[`a2|${M}-20`]).toBe("F");
    for (const etag of [null, "abc", -1]) {
      const x = await schreiben(T.p1, (m) => { m.abweichungen[`a2|${M}-20`] = "S"; }, { etag });
      expect(x.status, `ETag ${etag}`).toBe(409);
    }
    expect((await lesen(T.p1)).bestand.mandanten[0].abweichungen[`a2|${M}-20`]).toBe("F");
  });

  it("11.4 Leitung Süd kann keine Nord-Person einladen; Betreiber-Token liest keinen Kundenbetrieb", async () => {
    const e = await anfrage("/api/einladung", { methode: "POST", token: T.leitungSued, rumpf: { personId: "a2", bestaetigung: { zugangscode: CODE.leitungSued } } });
    expect(e.status).toBe(404);
    const b = await lesen(betreiber);
    expect(JSON.stringify(b)).not.toContain(MK_NORD);
    expect(JSON.stringify(b)).not.toContain(MK_SUED);
  });

  it("11.5 Betriebsrat schreibt nie (403), Beschäftigte ändern keinen fremden Dienst", async () => {
    const r = await schreiben(T.r1, (m) => { m.abweichungen = { ...(m.abweichungen || {}), [`a1|${T1}`]: "F" }; });
    expect(r.status).toBe(403);
    const vorher = (await lesen(T.p1)).bestand.mandanten[0].abweichungen;
    const a = await schreiben(T.a1, (m) => { m.abweichungen = { ...(m.abweichungen || {}), [`a2|${T1}`]: "F" }; });
    expect([200, 403, 409, 422]).toContain(a.status);
    expect((await lesen(T.p1)).bestand.mandanten[0].abweichungen).toEqual(vorher);
  });

  it("Protokoll des Servers enthält keine Zugangscodes", () => {
    const l = log();
    for (const c of Object.values(CODE)) expect(l.includes(c)).toBe(false);
  });
});
