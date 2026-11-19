import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync as schreibeDatei } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entscheide, lesen, schreiben, gepruefterPush } from "../werkzeug/koordination.mjs";
import {
  STANDARD, leererZustand, planeSchritt, verbucheErgebnis, zyklus, leaseEffekte, kandidatenAus, claudeBefehl, auftragsSchluessel, sperreNehmen,
  fortschritt, prsFuerPaket, messeFortschritt, nutzungAm, zaehleStart, startGrenze, limitsAusArgs, LIMIT_MAX, pruefeClaudePfad,
} from "../werkzeug/dauerlauf.mjs";
import { loeseBefehl, startPlan, optionenPruefen, istDerselbe } from "../werkzeug/dauerlauf-prozess.mjs";

/* Feste Uhr: jede Zeit kommt aus T0 plus Minuten (kein Wanduhr-Bezug). */
const T0 = Date.parse("2026-11-19T06:00:00Z");
const MIN = 60000;

const paket = (id, o = {}) => ({ id, titel: id, strang: "acc45", prio: "P1", aufwandPT: [1, 2], status: "READY", abhaengigkeiten: [], ...o });

/** Speicher im Arbeitsspeicher mit derselben Compare-and-Swap-Regel wie der Git-Branch. */
function speicherImSpeicher() {
  let spitze = 0; let lease = null;
  return {
    lesen: () => ({ spitze, lease: lease && structuredClone(lease) }),
    schreiben: (s, l) => { if (s !== spitze) throw new Error("CAS verloren"); spitze += 1; lease = structuredClone(l); },
    get lease() { return lease; },
    get spitze() { return spitze; },
  };
}

/** Ein Supervisor mit eigener Uhr-Referenz, Worker-Attrappe und Protokoll. */
function supervisor({ halter, speicher, uhr, kandidaten = ["WP-A", "WP-B"], schalter = { aus: false }, cfg = STANDARD }) {
  const w = { starts: [], lebt: false, puls: null, ergebnis: null, beendet: 0, eskalationen: [] };
  const L = leaseEffekte({ jetzt: () => new Date(uhr.t), speicher });
  const eff = {
    jetzt: () => new Date(uhr.t), protokoll: (z) => w.log?.push(z), lease: L, kopf: () => "k1", eskalieren: (g) => w.eskalationen.push(g),
    schalterAus: () => schalter.aus, kandidaten: () => kandidaten,
    worker: {
      starten: (id, h, e) => {
        if (!L.pruefen(h, e)) throw new Error("Start ohne Schreibrecht");
        w.starts.push({ id, h, e }); w.lebt = true; w.puls = new Date(uhr.t).toISOString(); w.ergebnis = null; return { pid: w.starts.length };
      },
      status: () => ({ laeuft: w.lebt, puls: w.puls, ergebnis: w.ergebnis }),
      beenden: () => { w.lebt = false; w.beendet += 1; },
    },
  };
  const s = { z: leererZustand(halter), w, eff, schritt() { const r = zyklus(eff, s.z, cfg); s.z = r.zustand; return r.aktion; } };
  return s;
}

describe("Dauerlauf: reiner Kern", () => {
  const lease = (o = {}) => ({ epoche: 5, halter: "fremd", uebernommen_am: new Date(T0).toISOString(), gueltig_bis: new Date(T0 + 20 * MIN).toISOString(), freigegeben_am: null, ...o });
  const z = (o = {}) => ({ ...leererZustand("dauerlauf-a"), ...o });

  it("gültige fremde Lease: nur warten, nie übernehmen", () => {
    const p = planeSchritt({ jetzt: new Date(T0 + 5 * MIN), lease: lease(), zustand: z(), kandidaten: ["WP-A"] });
    expect(p.aktion).toBe("WARTEN_FREMDE_LEASE");
  });
  it("abgelaufene Lease (nach Sicherheitszone): Übernahme; in der Zone: warten", () => {
    expect(planeSchritt({ jetzt: new Date(T0 + 21 * MIN), lease: lease(), zustand: z(), kandidaten: ["WP-A"] }).aktion).toBe("WARTEN_SICHERHEITSZONE");
    const p = planeSchritt({ jetzt: new Date(T0 + 23 * MIN), lease: lease(), zustand: z(), kandidaten: ["WP-A"] });
    expect(p.aktion).toBe("UEBERNEHMEN");
    expect(p.uebergabe.length).toBeGreaterThan(10);
  });
  it("freigegebene Lease: Übernahme; unlesbare Lease: STOPP fail-closed", () => {
    expect(planeSchritt({ jetzt: new Date(T0), lease: lease({ freigegeben_am: new Date(T0).toISOString() }), zustand: z(), kandidaten: ["WP-A"] }).aktion).toBe("UEBERNEHMEN");
    expect(planeSchritt({ jetzt: new Date(T0), lease: { halter: "x" }, zustand: z(), kandidaten: ["WP-A"] }).aktion).toBe("STOPP_FAILCLOSED");
  });
  it("Abschalter schlägt alles: kein Start, laufender Worker wird beendet, Lease freigegeben", () => {
    const eigen = lease({ halter: "dauerlauf-a", epoche: 7 });
    const mitWorker = z({ epoche: 7, laufend: { paketId: "WP-A", puls: new Date(T0).toISOString() } });
    expect(planeSchritt({ jetzt: new Date(T0 + MIN), lease: eigen, zustand: mitWorker, schalterAus: true, kandidaten: ["WP-A"] }).aktion).toBe("WORKER_BEENDEN");
    expect(planeSchritt({ jetzt: new Date(T0 + MIN), lease: eigen, zustand: z({ epoche: 7 }), schalterAus: true, kandidaten: ["WP-A"] }).aktion).toBe("FREIGEBEN");
    expect(planeSchritt({ jetzt: new Date(T0 + MIN), lease: lease(), zustand: z(), schalterAus: true, kandidaten: ["WP-A"] }).aktion).toBe("STOPP");
  });
  it("Fehlende Betreiberfreigabe: extern, bedingt, BLOCKED und unerfüllte Abhängigkeit werden nie Kandidat", () => {
    const pakete = [
      paket("EXT", { strang: "extern" }), paket("BED", { bedingt: true }), paket("BLK", { status: "BLOCKED" }),
      paket("ABH", { abhaengigkeiten: ["BLK"] }), paket("FERTIG", { status: "INTEGRATED" }),
    ];
    expect(kandidatenAus(pakete)).toEqual([]);
    expect(kandidatenAus([...pakete, paket("OK", { prio: "P2" }), paket("P0", { prio: "P0" })])).toEqual(["P0", "OK"]);
    const eigen = lease({ halter: "dauerlauf-a", epoche: 7 });
    const p = planeSchritt({ jetzt: new Date(T0 + MIN), lease: eigen, zustand: z({ epoche: 7 }), kandidaten: [] });
    expect(p).toMatchObject({ aktion: "FREIGEBEN", leerlauf: true });
  });
  it("Fehlversuche: Backoff, nach maxVersuche gesperrt, dann Eskalation statt Dauerschleife", () => {
    let zs = z({ epoche: 7, laufend: { paketId: "WP-A" } });
    const ergebnisse = [];
    for (let i = 0; i < STANDARD.maxVersuche; i++) {
      const v = verbucheErgebnis({ ...zs, laufend: { paketId: "WP-A" } }, { exit: 0, fortschritt: true, ciGruen: false }, new Date(T0), STANDARD);
      zs = v.zustand; ergebnisse.push(v.ereignis);
    }
    expect(zs.gesperrt).toEqual(["WP-A"]);
    expect(ergebnisse.at(-1)).toMatch(/gesperrt/);
    const eigen = lease({ halter: "dauerlauf-a", epoche: 7 });
    expect(planeSchritt({ jetzt: new Date(T0 + MIN), lease: eigen, zustand: zs, kandidaten: ["WP-A"] })).toMatchObject({ aktion: "FREIGEBEN", eskalation: true });
    /* im Backoff: nichts starten */
    const einmal = verbucheErgebnis({ ...z({ epoche: 7 }), laufend: { paketId: "WP-A" } }, { exit: 1 }, new Date(T0), STANDARD).zustand;
    expect(planeSchritt({ jetzt: new Date(T0 + MIN), lease: eigen, zustand: einmal, kandidaten: ["WP-A"] }).aktion).toBe("BACKOFF");
    expect(planeSchritt({ jetzt: new Date(T0 + 6 * MIN), lease: lease({ halter: "dauerlauf-a", epoche: 7, gueltig_bis: new Date(T0 + 60 * MIN).toISOString() }), zustand: einmal, kandidaten: ["WP-A"] }).aktion).toBe("STARTEN");
  });
  it("Erfolg ohne nachweisbaren Fortschritt zählt als Fehlversuch (kein Kosten-Leerlauf)", () => {
    const v = verbucheErgebnis({ ...z({ epoche: 7 }), laufend: { paketId: "WP-A" } }, { exit: 0, fortschritt: false, ciGruen: null }, new Date(T0), STANDARD);
    expect(v.zustand.versuche["WP-A"].n).toBe(1);
  });
  it("Verlorenes Schreibrecht zählt nur bei eingefrorenem Puls als Fehlversuch (Kernpfad, auch bei ausgelassenen Zyklen)", () => {
    const eigen = (o = {}) => ({ epoche: 7, halter: "dauerlauf-a", gueltig_bis: new Date(T0 + 20 * MIN).toISOString(), freigegeben_am: null, ...o });
    const lauf = (min) => ({ ...leererZustand("dauerlauf-a"), epoche: 7, laufend: { paketId: "WP-A", puls: new Date(T0 - min * MIN).toISOString() } });
    const jetzt = new Date(T0 + 25 * MIN); // Lease abgelaufen (Ablauf + Zone), Supervisor hat Zyklen ausgelassen
    const alt = planeSchritt({ jetzt, lease: eigen({ gueltig_bis: new Date(T0).toISOString() }), zustand: lauf(0), kandidaten: ["WP-A"] });
    expect(alt).toMatchObject({ aktion: "WORKER_BEENDEN", versuchZaehlen: true }); // Puls 25 Min alt
    const frisch = planeSchritt({ jetzt, lease: eigen({ gueltig_bis: new Date(T0).toISOString() }), zustand: lauf(-24), kandidaten: ["WP-A"] });
    expect(frisch).toMatchObject({ aktion: "WORKER_BEENDEN", versuchZaehlen: false }); // Puls 1 Min alt
    const fremd = planeSchritt({ jetzt: new Date(T0 + 5 * MIN), lease: eigen({ halter: "fremd", epoche: 8 }), zustand: lauf(-4), kandidaten: ["WP-A"] });
    expect(fremd).toMatchObject({ aktion: "WORKER_BEENDEN", versuchZaehlen: false });
    const kaputt = planeSchritt({ jetzt, lease: { halter: "x" }, zustand: lauf(0), kandidaten: ["WP-A"] });
    expect(kaputt).toMatchObject({ aktion: "WORKER_BEENDEN", versuchZaehlen: false });
  });
  it("Abschalter und unlesbare Lease beenden einen laufenden Worker zuerst", () => {
    const mitWorker = { ...leererZustand("dauerlauf-a"), epoche: 7, laufend: { paketId: "WP-A", puls: new Date(T0).toISOString() } };
    expect(planeSchritt({ jetzt: new Date(T0), lease: null, zustand: mitWorker, schalterAus: true, kandidaten: ["WP-A"] }).aktion).toBe("WORKER_BEENDEN");
    expect(planeSchritt({ jetzt: new Date(T0), lease: { halter: "x" }, zustand: mitWorker, kandidaten: ["WP-A"] }).aktion).toBe("WORKER_BEENDEN");
    expect(planeSchritt({ jetzt: new Date(T0), lease: { halter: "x" }, zustand: leererZustand("dauerlauf-a"), kandidaten: ["WP-A"] }).aktion).toBe("STOPP_FAILCLOSED");
  });
  it("Sperrdatei: zweiter Prozess mit gleichem Halter wird abgewiesen, verwaiste Sperre übernommen", () => {
    const datei = path.join(mkdtempSync(path.join(tmpdir(), "sperre-")), "sperre.lock");
    expect(sperreNehmen(datei, 111, () => true)).toBe(true);
    expect(sperreNehmen(datei, 222, () => true)).toBe(false); // Halter 111 lebt
    expect(sperreNehmen(datei, 222, () => false)).toBe(true); // 111 tot: übernommen
    schreibeDatei(datei, "kaputt");
    expect(sperreNehmen(datei, 333, () => true)).toBe(true); // unlesbare Sperre gilt als verwaist
  });
  it("claudeBefehl: begrenzt, ohne Berechtigungsumgehung, Eingaben validiert", () => {
    const b = claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: 3, promptDatei: "x.md" });
    expect(b.args).toContain("-p");
    expect(b.args.some((a) => a.startsWith("@"))).toBe(false); // Auftrag über stdin, nicht -p @datei
    expect(b.args).not.toContain("--max-turns"); // nicht in `claude --help` 2.1.328: nur auf ausdrücklichen Wunsch
    expect(claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: 3, maxRunden: 40 }).args).toContain("--max-turns");
    expect(b.args.join(" ")).not.toMatch(/dangerously|skip-permissions|bypass/);
    expect(b.umgebung.CENTRIC_KOORD_EPOCHE).toBe("3");
    expect(() => claudeBefehl({ paketId: "a b; rm", halter: "dauerlauf-a", epoche: 3, promptDatei: "x" })).toThrow();
    expect(() => claudeBefehl({ paketId: "WP-A", halter: "Dauer lauf", epoche: 3, promptDatei: "x" })).toThrow();
    expect(() => claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: "3", promptDatei: "x" })).toThrow();
  });
});

describe("Dauerlauf: Zyklen gegen Lease (Speicher im Arbeitsspeicher)", () => {
  it("Erfolg, dann unmittelbar nächstes Paket im nächsten Zyklus; Heartbeat nur bei lebendem Worker", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    expect(a.schritt()).toBe("UEBERNEHMEN");
    expect(a.schritt()).toBe("STARTEN");
    expect(a.w.starts[0]).toMatchObject({ id: "WP-A", e: 1 });
    uhr.t += 12 * MIN; a.w.puls = new Date(uhr.t).toISOString();
    expect(a.schritt()).toBe("WORKER_LAEUFT");
    expect(sp.lease.gueltig_bis).toBe(new Date(uhr.t + 20 * MIN).toISOString()); // erneuert
    a.w.lebt = false; a.w.ergebnis = { exit: 0, fortschritt: true, ciGruen: true };
    const naechster = a.schritt(); // gleicher Zyklus: Ende verbuchen UND nächstes Paket wählen
    expect(naechster).toBe("STARTEN");
    expect(a.w.starts.map((s) => s.id)).toEqual(["WP-A", "WP-A"]); // WP-A bleibt wählbar, solange die SSOT es nicht erledigt meldet
    expect(a.z.versuche["WP-A"]).toBeUndefined();
  });

  it("Hängender Agent: Puls bleibt aus, Lease wird NICHT erneuert, Worker wird beendet (Versuch hier noch nicht gezählt)", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    a.schritt(); a.schritt();
    const gueltigBis = sp.lease.gueltig_bis;
    uhr.t += 9 * MIN; expect(a.schritt()).toBe("WORKER_LAEUFT"); // Puls (Start) noch frisch genug, Rest > 10 Min: kein Erneuern
    expect(sp.lease.gueltig_bis).toBe(gueltigBis);
    uhr.t = T0 + 31 * MIN; // Lease schon abgelaufen, Puls alt
    expect(a.schritt()).toBe("WORKER_BEENDEN"); // Schreibrecht weg: beendet, bevor irgendetwas anderes passiert
    expect(a.w.beendet).toBe(1);
    expect(a.z.laufend).toBeNull();
  });

  it("Eingefrorener Puls: Heartbeat endet nach einer Lease-Dauer, Schreibrecht läuft aus, Worker wird vor Minute 33 beendet", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    a.schritt(); a.schritt(); // Puls bleibt auf T0 stehen
    let maxBis = 0;
    for (let m = 3; m <= 45 && a.w.beendet === 0; m += 3) { uhr.t = T0 + m * MIN; a.schritt(); maxBis = Math.max(maxBis, Date.parse(sp.lease.gueltig_bis)); }
    expect(a.w.beendet).toBe(1);
    expect(maxBis).toBeLessThanOrEqual(T0 + 32 * MIN); // letzte Erneuerung bei Minute 12 (Puls jünger als 20 Min)
    expect(uhr.t).toBeLessThan(T0 + 33 * MIN);
  });

  it("Eingefrorener Worker wird als Fehlversuch gezählt (Kostenbremse greift; Hängeschwelle gleich Lease-Dauer)", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: ["WP-A"] });
    for (let runde = 1; runde <= STANDARD.maxVersuche && !a.z.gesperrt.includes("WP-A"); runde++) {
      for (let n = 0; n < 40 && !a.w.lebt; n++) { uhr.t += 3 * MIN; a.schritt(); } // übernehmen, Backoff abwarten, starten
      expect(a.w.lebt).toBe(true);
      for (let n = 0; n < 40 && a.w.lebt; n++) { uhr.t += 3 * MIN; a.schritt(); } // Puls bleibt eingefroren
      expect(a.z.versuche["WP-A"].n).toBe(runde);
    }
    expect(a.z.gesperrt).toContain("WP-A");
  });

  it("Hängend bei noch gültiger Lease: Beenden mit Fehlversuch", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const cfg = { ...STANDARD, leaseMin: 120, haengMin: 30 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg });
    a.schritt(); a.schritt();
    uhr.t += 31 * MIN;
    expect(a.schritt()).toBe("WORKER_BEENDEN");
    expect(a.z.versuche["WP-A"].n).toBe(1);
  });

  it("Gültige fremde Lease: Supervisor liest nur, schreibt nichts, startet nichts", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    const b = supervisor({ halter: "dauerlauf-b", speicher: sp, uhr });
    a.schritt();
    const vorher = sp.spitze;
    for (let i = 0; i < 5; i++) { uhr.t += MIN; expect(b.schritt()).toBe("WARTEN_FREMDE_LEASE"); }
    expect(sp.spitze).toBe(vorher);
    expect(b.w.starts).toHaveLength(0);
  });

  it("Prozessende: Neustart mit gleichem Halter und Zustandsdatei setzt fort; neuer Halter wartet bis Ablauf und fencet den alten Worker", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    a.schritt(); a.schritt();
    const gespeichert = JSON.parse(JSON.stringify(a.z)); // Zustandsdatei
    /* Neustart mit gleichem Halter: Worker lebt weiter, kein Doppelstart */
    const a2 = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    a2.z = gespeichert; a2.w.lebt = true; a2.w.puls = new Date(uhr.t).toISOString();
    uhr.t += MIN;
    expect(a2.schritt()).toBe("WORKER_LAEUFT");
    expect(a2.w.starts).toHaveLength(0);
    /* Totalausfall: Zustandsdatei weg, neuer Halter */
    const c = supervisor({ halter: "dauerlauf-c", speicher: sp, uhr });
    expect(c.schritt()).toBe("WARTEN_FREMDE_LEASE");
    uhr.t = T0 + 20 * MIN + 3 * MIN; // Ablauf + Zone
    expect(c.schritt()).toBe("UEBERNEHMEN");
    expect(sp.lease.epoche).toBe(2);
    /* der verwaiste Worker des alten Halters (Epoche 1) darf nicht mehr schreiben */
    const alt = entscheide(sp.lease, new Date(uhr.t), { aktion: "erneuern", halter: "dauerlauf-a", epoche: 1 });
    expect(alt.ok).toBe(false);
  });

  it("Wiederholter Start desselben Auftrags: laufender Auftrag wird nie doppelt gestartet", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr });
    a.schritt(); a.schritt();
    for (let i = 0; i < 4; i++) { uhr.t += MIN; a.w.puls = new Date(uhr.t).toISOString(); a.schritt(); }
    expect(a.w.starts).toHaveLength(1);
    expect(a.z.laufend.schluessel).toBe(auftragsSchluessel("WP-A", "k1"));
  });

  it("CI rot: wiederholt ohne Fortschritt führt zu Sperre und Freigabe der Lease (Eskalation), kein Dauerlauf", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: ["WP-A"] });
    a.schritt();
    for (let i = 0; i < STANDARD.maxVersuche; i++) {
      for (let n = 0; n < 6 && !a.w.lebt && a.z.epoche !== null; n++) { uhr.t += 16 * MIN; a.schritt(); } // Backoff abwarten
      a.w.lebt = false; a.w.ergebnis = { exit: 0, fortschritt: true, ciGruen: false };
      uhr.t += MIN;
      a.schritt();
    }
    expect(a.z.gesperrt).toContain("WP-A");
    expect(a.w.starts.length).toBe(STANDARD.maxVersuche);
    expect(sp.lease.freigegeben_am).toBeTruthy();
    expect(a.schritt()).not.toBe("STARTEN");
  });

  it("Fehlende Freigabe (keine Kandidaten): Lease wird freigegeben, nichts gestartet", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const liste = ["WP-A"];
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: liste });
    a.schritt();
    liste.length = 0; // SSOT meldet nichts mehr als freigegeben
    expect(a.schritt()).toBe("FREIGEBEN");
    expect(sp.lease.freigegeben_am).toBeTruthy();
    expect(a.w.starts).toHaveLength(0);
  });

  it("Ohne offenes Paket wird nie übernommen: kein Epochen-Rauschen auf der Lease", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: [] });
    for (let i = 0; i < 10; i++) { uhr.t += MIN; expect(a.schritt()).toBe("WARTEN_LEERLAUF"); }
    expect(sp.spitze).toBe(0);
    expect(sp.lease).toBeNull();
  });

  it("Abschalter während der Arbeit: Worker beendet, Lease freigegeben, nichts Neues", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 }; const schalter = { aus: false };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, schalter });
    a.schritt(); a.schritt();
    schalter.aus = true; uhr.t += MIN;
    expect(a.schritt()).toBe("WORKER_BEENDEN");
    expect(a.schritt()).toBe("FREIGEBEN");
    expect(sp.lease.freigegeben_am).toBeTruthy();
    expect(a.schritt()).toBe("STOPP");
    expect(a.w.starts).toHaveLength(1);
  });
});

describe("Lücke 2: Fortschritt misst der Supervisor selbst", () => {
  const m = (o = {}) => ({ kopf: "k1", paket: { status: "IN_PROGRESS", pr: [] }, prs: [], ...o });
  const pr = (nummer, o = {}) => ({ nummer, zustand: "OPEN", kopf: "a1", ciGruen: null, ...o });

  it("Fortschritt: neuer PR, neue Commits, Merge, gedeckter SSOT-Schritt am neuen Kopf", () => {
    expect(fortschritt(m(), m({ prs: [pr(7)] }))).toMatchObject({ fortschritt: true, gruende: ["neuer PR #7 (OPEN)"] });
    expect(fortschritt(m({ prs: [pr(7)] }), m({ prs: [pr(7, { kopf: "b2", ciGruen: true })] }))).toMatchObject({ fortschritt: true, ciGruen: true });
    expect(fortschritt(m({ prs: [pr(7)] }), m({ prs: [pr(7, { zustand: "MERGED" })] }))).toMatchObject({ fortschritt: true, ciGruen: true });
    const ssot = fortschritt(m({ prs: [pr(7, { zustand: "MERGED" })] }), m({ kopf: "k2", paket: { status: "INTEGRATED", pr: ["#7"] }, prs: [pr(7, { zustand: "MERGED" })] }));
    expect(ssot.fortschritt).toBe(true);
    expect(ssot.gruende.join(" ")).toMatch(/SSOT/);
    /* ohne PR-Daten (gh fehlt) genügt ein SSOT-Schritt am geänderten Integrationskopf */
    expect(fortschritt(m({ prs: null }), m({ kopf: "k2", paket: { status: "REVIEW", pr: ["#7"] }, prs: null })).fortschritt).toBe(true);
  });

  it("Scheinfortschritt wird erkannt und NICHT gezählt", () => {
    const statusSprung = fortschritt(m(), m({ kopf: "k2", paket: { status: "DONE", pr: [] }, prs: [] }));
    expect(statusSprung.fortschritt).toBe(false);
    expect(statusSprung.schein.join(" ")).toMatch(/ohne Beleg/);
    expect(fortschritt(m(), m({ kopf: "k2", paket: { status: "IN_PROGRESS", pr: ["#999"] } })).schein.join(" ")).toMatch(/#999/);
    const zu = fortschritt(m(), m({ prs: [pr(8, { zustand: "CLOSED" })] }));
    expect(zu).toMatchObject({ fortschritt: false });
    expect(zu.schein.join(" ")).toMatch(/geschlossen/);
    expect(fortschritt(m({ paket: { status: "REVIEW", pr: [] } }), m()).schein.join(" ")).toMatch(/rückwärts/);
    /* Statussprung am UNVERÄNDERTEN Kopf (ohne PR-Daten): kein Beleg */
    expect(fortschritt(m({ prs: null }), m({ paket: { status: "REVIEW", pr: [] }, prs: null })).fortschritt).toBe(false);
    const nurKopf = fortschritt(m(), m({ kopf: "k2" }));
    expect(nurKopf).toMatchObject({ fortschritt: false, schein: [] });
    expect(nurKopf.hinweise.join(" ")).toMatch(/nicht für dieses Paket/);
  });

  it("PR-Daten nur nachher (gh beim Start nicht erreichbar): vorhandene PRs zählen NICHT als neu", () => {
    const f = fortschritt(m({ prs: null }), m({ prs: [pr(7), pr(8, { zustand: "MERGED" })] }));
    expect(f).toMatchObject({ fortschritt: false, gruende: [] });
    expect(f.hinweise.join(" ")).toMatch(/nicht verglichen/);
  });

  it("nichts geändert: kein Fortschritt, kein Schein; fehlende Messung ist fail-closed", () => {
    expect(fortschritt(m({ prs: [pr(7)] }), m({ prs: [pr(7)] }))).toMatchObject({ fortschritt: false, gruende: [], schein: [] });
    expect(fortschritt(null, m()).fortschritt).toBe(false);
    expect(fortschritt(m(), null).fortschritt).toBe(false);
  });

  it("rote CI am neuen PR: Fortschritt, aber ciGruen false (wird als Fehlversuch verbucht)", () => {
    const f = fortschritt(m(), m({ prs: [pr(9, { ciGruen: false })] }));
    expect(f).toMatchObject({ fortschritt: true, ciGruen: false });
    const v = verbucheErgebnis({ ...leererZustand("dauerlauf-a"), laufend: { paketId: "WP-A" } }, { exit: 0, ...f }, new Date(T0));
    expect(v.zustand.versuche["WP-A"].n).toBe(1);
  });

  it("prsFuerPaket: exakte Paket-ID (WP-16 nicht in WP-16c), SSOT-PR-Liste, CI-Zuordnung", () => {
    const liste = [
      { number: 1, state: "OPEN", headRefOid: "x", headRefName: "feat/wp-16-a", title: "WP-16: a", statusCheckRollup: [{ conclusion: "SUCCESS" }] },
      { number: 2, state: "OPEN", headRefOid: "y", headRefName: "feat/x", title: "WP-16c: b", statusCheckRollup: [{ conclusion: "FAILURE" }] },
      { number: 3, state: "MERGED", headRefOid: "z", headRefName: "feat/y", title: "ohne Kennung", statusCheckRollup: [] },
    ];
    expect(prsFuerPaket(liste, "WP-16", ["#3"])).toEqual([
      { nummer: 1, zustand: "OPEN", kopf: "x", ciGruen: true },
      { nummer: 3, zustand: "MERGED", kopf: "z", ciGruen: null },
    ]);
    expect(prsFuerPaket(liste, "WP-16c")[0]).toMatchObject({ nummer: 2, ciGruen: false });
  });

  it("messeFortschritt liest Kopf, SSOT und gh (injiziert); gh fehlt -> prs null", () => {
    const ssot = () => ({ kopf: "k9", pakete: [{ id: "WP-A", status: "REVIEW", pr: ["#4"] }] });
    const gh = () => [{ number: 4, state: "OPEN", headRefOid: "h", headRefName: "b", title: "x", statusCheckRollup: [] }];
    expect(messeFortschritt("WP-A", { ssot, gh })).toEqual({ kopf: "k9", paket: { status: "REVIEW", pr: ["#4"] }, prs: [{ nummer: 4, zustand: "OPEN", kopf: "h", ciGruen: null }] });
    expect(messeFortschritt("WP-A", { ssot, gh: null }).prs).toBeNull();
    expect(messeFortschritt("WP-A", { ssot: () => null, gh: null })).toEqual({ kopf: null, paket: null, prs: null });
  });

  it("Zyklus: Selbstauskunft des Workers wird verworfen, die Messung entscheidet", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: ["WP-A"] });
    let messung = m();
    a.eff.messen = () => structuredClone(messung);
    a.schritt(); a.schritt();
    expect(a.z.laufend.messung).toEqual(m());
    a.w.lebt = false; a.w.ergebnis = { exit: 0, fortschritt: true, ciGruen: true }; // Worker behauptet Erfolg
    uhr.t += MIN; a.schritt();
    expect(a.z.versuche["WP-A"].n).toBe(1); // nichts messbar: Fehlversuch
    /* umgekehrt: Worker meldet nichts, Messung zeigt neuen PR -> Erfolg */
    uhr.t += 6 * MIN; a.w.puls = new Date(uhr.t).toISOString();
    expect(a.schritt()).toBe("STARTEN");
    messung = m({ prs: [pr(11, { ciGruen: true })] });
    a.w.lebt = false; a.w.ergebnis = { exit: 0, fortschritt: false };
    uhr.t += MIN; a.schritt();
    expect(a.z.versuche["WP-A"]).toBeUndefined();
  });
});

describe("Lücke 1 (Kern): Startfehler zählen, Supervisor stürzt nicht ab", () => {
  for (const art of ["Rückgabe ok:false", "Ausnahme"]) {
    it(`Start scheitert (${art}): kein laufender Auftrag, gezählter Fehlversuch mit Backoff, Start gezählt`, () => {
      const sp = speicherImSpeicher(); const uhr = { t: T0 };
      const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: ["WP-A"] });
      a.eff.worker.starten = art === "Ausnahme" ? () => { throw new Error("spawn ENOENT"); } : () => ({ ok: false, grund: "Befehl nicht gefunden" });
      a.schritt();
      expect(a.schritt()).toBe("STARTEN");
      expect(a.z.laufend).toBeNull();
      expect(a.z.versuche["WP-A"].n).toBe(1);
      expect(a.z.nutzung.startsGesamt).toBe(1);
      uhr.t += MIN;
      expect(a.schritt()).toBe("BACKOFF");
    });
  }
});

describe("Lücke 1 (Kern): Pfadauflösung, sichere Argumente, Optionen, Prozess-Identität", () => {
  const win = (dateien) => ({ plattform: "win32", pfad: "C:\\a;C:\\npm", existiert: (f) => dateien.includes(f) });
  it("Windows: .exe vor .cmd vor .ps1; Datei ohne Endung (Git-Bash-Skript) wird nie gestartet", () => {
    expect(loeseBefehl("claude", win(["C:\\npm\\claude", "C:\\npm\\claude.cmd", "C:\\npm\\claude.ps1"]))).toEqual({ datei: "C:\\npm\\claude.cmd", art: "cmd" });
    expect(loeseBefehl("claude", win(["C:\\npm\\claude.cmd", "C:\\a\\claude.exe"]))).toEqual({ datei: "C:\\a\\claude.exe", art: "exe" });
    expect(loeseBefehl("claude", win(["C:\\npm\\claude.ps1"]))).toEqual({ datei: "C:\\npm\\claude.ps1", art: "ps1" });
    expect(loeseBefehl("claude", win(["C:\\npm\\claude"]))).toBeNull();
    expect(loeseBefehl("claude", { plattform: "linux", pfad: "/usr/bin:/opt/b", existiert: (f) => f === "/opt/b/claude" })).toEqual({ datei: "/opt/b/claude", art: "bin" });
    expect(loeseBefehl("cl aude", win([]))).toBeNull();
  });
  it(".cmd nur über cmd.exe mit geprüften Argumenten; Sonderzeichen verhindern den Start", () => {
    const cmd = { datei: "C:\\npm\\claude.cmd", art: "cmd" };
    const p = startPlan(cmd, ["-p", "--model", "opus"], { comspec: "C:\\Windows\\system32\\cmd.exe" });
    expect(p).toMatchObject({ ok: true, datei: "C:\\Windows\\system32\\cmd.exe", optionen: { windowsVerbatimArguments: true } });
    expect(p.args).toEqual(["/d", "/s", "/c", '""C:\\npm\\claude.cmd" -p --model opus"']);
    for (const boese of ["a&calc", "a|b", "x>y", "%PATH%", 'a"b', "mit leer", "a^b"]) expect(startPlan(cmd, ["-p", boese]).ok).toBe(false);
    expect(startPlan({ datei: "C:\\x%y\\claude.cmd", art: "cmd" }, ["-p"]).ok).toBe(false);
    expect(startPlan({ datei: "C:\\a\\claude.exe", art: "exe" }, ["mit leer & so"])).toMatchObject({ ok: true, datei: "C:\\a\\claude.exe", args: ["mit leer & so"] }); // ohne Shell
    expect(startPlan(null, []).ok).toBe(false);
  });
  it("optionenPruefen: jede verwendete lange Option muss in der lokalen Hilfe stehen", () => {
    const hilfe = "  --model <model>   Model\n  --output-format <format>  x\n  --verbose   y\n  -p, --print  z\n";
    expect(optionenPruefen(hilfe, claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: 1 }).args)).toEqual({ ok: true, fehlend: [] });
    expect(optionenPruefen(hilfe, claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: 1, maxRunden: 5 }).args)).toEqual({ ok: false, fehlend: ["--max-turns"] });
    expect(optionenPruefen("", ["--model"]).ok).toBe(false);
  });
  it("istDerselbe: nur bei gleicher bekannter Startzeit und passendem Merkmal", () => {
    const g = { pid: 5, startzeit: "2026-11-19T06:00:00.000Z", merkmal: "claude" };
    expect(istDerselbe(g, { lebt: true, startzeit: g.startzeit, kommandozeile: "cmd /c claude.cmd -p" })).toBe(true);
    expect(istDerselbe(g, { lebt: true, startzeit: "2026-11-19T07:00:00.000Z", kommandozeile: "claude" })).toBe(false); // PID wiederverwendet
    expect(istDerselbe(g, { lebt: true, startzeit: g.startzeit, kommandozeile: "notepad.exe" })).toBe(false);
    expect(istDerselbe(g, { lebt: true, startzeit: null, kommandozeile: "claude" })).toBe(false); // unklar: nicht beenden
    expect(istDerselbe({ ...g, startzeit: null }, { lebt: true, startzeit: g.startzeit })).toBe(false);
    expect(istDerselbe(g, { lebt: false })).toBe(false);
  });
});

describe("Nicht beendbarer Worker und fester claude-Pfad", () => {
  it("beendet:false (Identität unklar): Auftrag bleibt eingetragen, Eskalation einmal, nie ein zweiter Start", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 }; const schalter = { aus: false };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, schalter, kandidaten: ["WP-A"] });
    a.schritt(); a.schritt();
    a.eff.worker.beenden = () => ({ beendet: false, grund: "Identität unklar" });
    schalter.aus = true;
    for (let i = 0; i < 4; i++) { uhr.t += MIN; expect(a.schritt()).toBe("WORKER_BEENDEN"); }
    expect(a.z.laufend).toMatchObject({ paketId: "WP-A", beendenFehlgeschlagen: 4 });
    expect(a.w.eskalationen.filter((g) => /nicht beendbar/.test(g))).toHaveLength(1);
    schalter.aus = false;
    for (let i = 0; i < 10; i++) { uhr.t += 5 * MIN; a.schritt(); } // Lease läuft ab: weiter nur Beendeversuche
    expect(a.w.starts).toHaveLength(1);
    expect(a.z.laufend.paketId).toBe("WP-A");
    /* sobald das Beenden gelingt, ist der Weg wieder frei */
    a.eff.worker.beenden = () => ({ beendet: true });
    a.schritt();
    expect(a.z.laufend).toBeNull();
  });

  it("pruefeClaudePfad: Pflicht, absolut, vorhanden, keine PATH-Suche", () => {
    const opt = { plattform: "win32", existiert: (f) => ["C:\\npm\\claude.cmd", "C:\\npm\\claude"].includes(f) };
    expect(pruefeClaudePfad(undefined, opt).ok).toBe(false);
    expect(pruefeClaudePfad("claude", opt).ok).toBe(false); // relativ: würde PATH durchsuchen
    expect(pruefeClaudePfad("C:\\npm\\claude", opt).ok).toBe(false); // ohne Endung nicht startbar
    expect(pruefeClaudePfad("C:\\npm\\fehlt.exe", opt).ok).toBe(false);
    expect(pruefeClaudePfad("C:\\npm\\claude.cmd", opt)).toEqual({ ok: true, datei: "C:\\npm\\claude.cmd", art: "cmd" });
  });
});

describe("Lücke 4: harte Nutzungsgrenzen (persistente Zähler, UTC-Tag, feste Uhr)", () => {
  const mitLimits = (o) => ({ ...STANDARD, limits: { ...STANDARD.limits, ...o } });
  /** Lässt den laufenden Worker sofort mit Erfolg enden und macht einen Zyklus. */
  const fertig = (a, uhr) => { a.w.lebt = false; a.w.ergebnis = { exit: 0, fortschritt: true, ciGruen: true }; uhr.t += MIN; return a.schritt(); };

  it("Tageslimit: danach keine Starts, Eskalation, Lease freigegeben, keine Wiederübernahme; neuer UTC-Tag startet wieder", () => {
    const sp = speicherImSpeicher(); const uhr = { t: Date.parse("2026-11-19T22:00:00Z") };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: mitLimits({ startsTag: 2 }) });
    a.schritt(); expect(a.schritt()).toBe("STARTEN");
    expect(fertig(a, uhr)).toBe("STARTEN");
    expect(fertig(a, uhr)).toBe("FREIGEBEN");
    expect(a.w.eskalationen.join(" ")).toMatch(/Tageslimit 2/);
    expect(sp.lease.freigegeben_am).toBeTruthy();
    const spitze = sp.spitze;
    for (let i = 0; i < 5; i++) { uhr.t += 10 * MIN; expect(a.schritt()).toBe("WARTEN_LIMIT"); }
    expect(sp.spitze).toBe(spitze); // kein Epochen-Rauschen
    expect(a.w.starts).toHaveLength(2);
    uhr.t = Date.parse("2026-11-20T00:00:30Z"); // Tageswechsel UTC
    expect(a.schritt()).toBe("UEBERNEHMEN");
    expect(a.schritt()).toBe("STARTEN");
    expect(a.z.nutzung).toMatchObject({ tag: "2026-11-20", startsTag: 1, startsGesamt: 3 });
  });

  it("Gesamtlimit gilt über Tageswechsel hinweg", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: mitLimits({ startsTag: 1, startsGesamt: 2 }) });
    a.schritt(); a.schritt(); fertig(a, uhr);
    uhr.t += 24 * 60 * MIN; a.schritt(); expect(a.schritt()).toBe("STARTEN");
    fertig(a, uhr);
    uhr.t += 24 * 60 * MIN;
    expect(a.schritt()).toBe("WARTEN_LIMIT");
    expect(a.w.starts).toHaveLength(2);
    expect(startGrenze({ nutzung: a.z.nutzung, jetzt: new Date(uhr.t), limits: mitLimits({ startsGesamt: 2 }).limits })).toMatch(/Gesamtlimit/);
  });

  it("Läufe je Paket: erschöpftes Paket wird übersprungen, danach Eskalation", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: mitLimits({ laeufeJePaket: 1 }) });
    a.schritt(); a.schritt();
    expect(fertig(a, uhr)).toBe("STARTEN");
    expect(a.w.starts.map((s) => s.id)).toEqual(["WP-A", "WP-B"]);
    expect(fertig(a, uhr)).toBe("FREIGEBEN");
    expect(a.w.eskalationen.join(" ")).toMatch(/Läufe je Paket/);
  });

  it("Laufzeitlimit: Worker mit frischem Puls wird nach Ablauf beendet, Fehlversuch gezählt, Eskalation", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: mitLimits({ laufzeitMin: 30 }) });
    a.schritt(); a.schritt();
    for (let i = 0; i < 9; i++) { uhr.t += 3 * MIN; a.w.puls = new Date(uhr.t).toISOString(); expect(a.schritt()).toBe("WORKER_LAEUFT"); }
    uhr.t += 3 * MIN; a.w.puls = new Date(uhr.t).toISOString();
    expect(a.schritt()).toBe("WORKER_BEENDEN");
    expect(a.w.beendet).toBe(1);
    expect(a.z.versuche["WP-A"].n).toBe(1);
    expect(a.w.eskalationen.join(" ")).toMatch(/Laufzeitlimit 30/);
    expect(a.z.nutzung.wallMsTag).toBe(30 * MIN);
  });

  it("Wallclock je Tag: laufender Worker wird bei Erreichen beendet, danach keine Starts mehr an diesem Tag", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: mitLimits({ wallMinTag: 40, laufzeitMin: 30 }) });
    a.schritt(); a.schritt();
    for (let i = 0; i < 8; i++) { uhr.t += 3 * MIN; a.w.puls = new Date(uhr.t).toISOString(); a.schritt(); } // Heartbeat
    expect(fertig(a, uhr)).toBe("STARTEN"); // 25 Min verbraucht
    for (let i = 0; i < 4; i++) { uhr.t += 3 * MIN; a.w.puls = new Date(uhr.t).toISOString(); expect(a.schritt()).toBe("WORKER_LAEUFT"); }
    uhr.t += 3 * MIN; a.w.puls = new Date(uhr.t).toISOString();
    expect(a.schritt()).toBe("WORKER_BEENDEN");
    expect(a.w.eskalationen.join(" ")).toMatch(/Wallclock-Limit 40/);
    expect(a.schritt()).toBe("FREIGEBEN");
    expect(a.schritt()).toBe("WARTEN_LIMIT");
  });

  it("ohne Limits nie ein Start und nie eine Übernahme", () => {
    const sp = speicherImSpeicher(); const uhr = { t: T0 };
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, cfg: { ...STANDARD, limits: undefined } });
    for (let i = 0; i < 3; i++) { uhr.t += MIN; expect(a.schritt()).toBe("WARTEN_LIMIT"); }
    expect(sp.spitze).toBe(0);
  });

  it("Zähler: Tageswechsel UTC setzt nur Tageszähler zurück", () => {
    const n = zaehleStart(zaehleStart(null, new Date("2026-11-19T23:59:00Z"), "WP-A"), new Date("2026-11-19T23:59:30Z"), "WP-A");
    expect(n).toMatchObject({ tag: "2026-11-19", startsTag: 2, startsGesamt: 2, laeufeJePaket: { "WP-A": 2 } });
    expect(nutzungAm(n, new Date("2026-11-20T00:00:00Z"))).toMatchObject({ tag: "2026-11-20", startsTag: 0, wallMsTag: 0, startsGesamt: 2, laeufeJePaket: { "WP-A": 2 } });
  });

  it("scharfer Lauf: jedes Limit ist Pflichtparameter, positiv, mit Obergrenze", () => {
    const voll = ["--limit-starts-tag", "2", "--limit-starts-gesamt", "5", "--limit-laeufe-paket", "2", "--limit-laufzeit-min", "60", "--limit-wall-min-tag", "120"];
    expect(limitsAusArgs(voll)).toEqual({ ok: true, limits: { startsTag: 2, startsGesamt: 5, laeufeJePaket: 2, laufzeitMin: 60, wallMinTag: 120 } });
    for (let i = 0; i < voll.length; i += 2) {
      const ohne = [...voll.slice(0, i), ...voll.slice(i + 2)];
      expect(limitsAusArgs(ohne).ok).toBe(false);
    }
    expect(limitsAusArgs(voll.map((x) => (x === "60" ? String(LIMIT_MAX.laufzeitMin + 1) : x))).ok).toBe(false);
    expect(limitsAusArgs(voll.map((x) => (x === "2" ? "0" : x))).ok).toBe(false);
    expect(limitsAusArgs(voll.map((x) => (x === "5" ? "5x" : x))).ok).toBe(false);
  });
});

describe("Dauerlauf: nie zwei schreibberechtigte Koordinatoren (Zufallsläufe, Speicher im Arbeitsspeicher)", () => {
  /* Linearer Kongruenzgenerator: reproduzierbar, kein Math.random. */
  const zufall = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; };

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`Seed ${seed}: höchstens ein Schreiber, alte Epoche scheitert, Worker nur mit Schreibrecht`, () => {
      const r = zufall(seed); const sp = speicherImSpeicher(); const uhr = { t: T0 };
      const schalter = { aus: false };
      let nummer = 0;
      /* Hohe Limits: die Zufallsläufe prüfen Lease-Invarianten, die Nutzungsgrenzen dürfen die Abdeckung nicht ausdünnen. */
      const cfg = { ...STANDARD, limits: { startsTag: 1e6, startsGesamt: 1e6, laeufeJePaket: 1e6, laufzeitMin: 1e9, wallMinTag: 1e9 } };
      const neu = () => { nummer += 1; const s = supervisor({ halter: `dauerlauf-${nummer}`, speicher: sp, uhr, schalter, kandidaten: ["WP-A", "WP-B", "WP-C"], cfg }); alleJe.push(s); return s; };
      const alleJe = [];
      const alle = [neu(), neu(), neu()];
      const verwaist = []; // Worker abgestürzter Supervisoren leben weiter
      let hoechsteEpoche = 0; let schreibVersuche = 0; let schreibErfolge = 0;

      for (let schritt = 0; schritt < 400; schritt++) {
        uhr.t += Math.floor(r() * 9 * MIN);
        const i = Math.floor(r() * alle.length);
        const s = alle[i];
        const w = r();
        if (w < 0.06) { verwaist.push({ halter: s.z.halter, epoche: s.z.epoche, lebt: s.w.lebt }); alle[i] = neu(); continue; } // Prozessende
        if (w < 0.12 && s.w.lebt) { /* Worker hängt: kein Puls mehr */ } else if (s.w.lebt) s.w.puls = new Date(uhr.t).toISOString();
        if (w > 0.9 && s.w.lebt) { s.w.lebt = false; s.w.ergebnis = { exit: 0, fortschritt: r() > 0.3, ciGruen: r() > 0.3 }; }
        schalter.aus = r() < 0.03;
        s.schritt();

        const lease = sp.lease; const jetzt = new Date(uhr.t);
        /* Invariante 1: höchstens ein Koordinator besteht `pruefen` (Halter + Epoche). */
        const mitRecht = [...alle.map((x) => ({ halter: x.z.halter, epoche: x.z.epoche })), ...verwaist.map((v) => ({ halter: v.halter, epoche: v.epoche }))]
          .filter((c) => c.epoche !== null && entscheide(lease, jetzt, { aktion: "pruefen", halter: c.halter, epoche: c.epoche }).ok);
        expect(mitRecht.length).toBeLessThanOrEqual(1);
        /* Invariante 2: Epochen steigen nur. */
        if (lease) { expect(lease.epoche).toBeGreaterThanOrEqual(hoechsteEpoche); hoechsteEpoche = lease.epoche; }
        /* Invariante 3: nach dem Zyklus läuft ein Worker eines Supervisors nur mit Schreibrecht. */
        if (s.z.laufend) expect(entscheide(lease, jetzt, { aktion: "pruefen", halter: s.z.halter, epoche: s.z.epoche }).ok).toBe(true);
        /* Invariante 4: Schreibversuche aller Worker (auch verwaister) gelingen nur dem aktuellen Halter mit aktueller Epoche. */
        for (const c of [...alle.filter((x) => x.w.lebt).map((x) => ({ halter: x.z.halter, epoche: x.z.epoche })), ...verwaist.filter((v) => v.lebt)]) {
          if (c.epoche === null) continue;
          schreibVersuche += 1;
          const ok = entscheide(lease, jetzt, { aktion: "erneuern", halter: c.halter, epoche: c.epoche }).ok;
          if (ok) { schreibErfolge += 1; expect(lease.halter).toBe(c.halter); expect(lease.epoche).toBe(c.epoche); }
        }
      }
      expect(hoechsteEpoche).toBeGreaterThan(1); // der Lauf hat Wechsel erzwungen
      expect(schreibVersuche).toBeGreaterThan(0);
      expect(schreibErfolge).toBeLessThanOrEqual(schreibVersuche);
      expect(alleJe.reduce((n, x) => n + x.w.starts.length, 0)).toBeGreaterThan(15); // genug Worker-Starts für Aussagekraft
    });
  }
});

describe("Dauerlauf: echte Git-Lease (Compare-and-Swap, Fencing-Push)", () => {
  const git = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const mitRemote = (remote, f) => { const alt = process.env.KOORD_REMOTE; process.env.KOORD_REMOTE = remote; try { return f(); } finally { if (alt === undefined) delete process.env.KOORD_REMOTE; else process.env.KOORD_REMOTE = alt; } };
  const frisch = () => { const d = mkdtempSync(path.join(tmpdir(), "dauerlauf-")); git(["init", "--bare", "-q", "remote.git"], d); return path.join(d, "remote.git"); };
  const kleinerCommit = () => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit-tree", "4b825dc642cb6eb9a060e54bf8d69288fbee4904", "-m", "t"], { encoding: "utf8" }).trim();

  it("zwei Supervisoren lesen dieselbe leere Lease: genau eine Übernahme gelingt (veraltete Lesung verliert den CAS)", () => {
    const remote = frisch();
    mitRemote(remote, () => {
      const uhr = { t: T0 };
      const stand = lesen(); // beide sehen Spitze null
      const veraltet = { lesen: () => stand, schreiben };
      const a = leaseEffekte({ jetzt: () => new Date(uhr.t) });
      const b = leaseEffekte({ jetzt: () => new Date(uhr.t), speicher: veraltet });
      const ra = a.uebernehmen("dauerlauf-a", "Übergabe A ausführlich", 20);
      const rb = b.uebernehmen("dauerlauf-b", "Übergabe B ausführlich", 20);
      expect(ra.ok).toBe(true);
      expect(rb).toMatchObject({ ok: false, grund: "CAS verloren" });
      expect(lesen().lease.halter).toBe("dauerlauf-a");
    });
  });

  it("Prozessende und Ablauf: neuer Supervisor übernimmt mit Epoche+1; Push des alten Workers wird atomar abgelehnt", () => {
    const remote = frisch(); const quelle = kleinerCommit();
    mitRemote(remote, () => {
      const uhr = { t: T0 };
      const jetzt = () => new Date(uhr.t);
      const sa = supervisor({ halter: "dauerlauf-a", speicher: { lesen, schreiben }, uhr });
      expect(sa.schritt()).toBe("UEBERNEHMEN");
      const epocheA = sa.z.epoche;
      expect(() => gepruefterPush({ halter: "dauerlauf-a", epoche: epocheA, quelle, ziel: "refs/heads/work/a", jetzt: jetzt(), minuten: 20 })).not.toThrow();
      /* Prozess stirbt. Ablauf plus Zone. */
      uhr.t = T0 + 25 * MIN;
      const sb = supervisor({ halter: "dauerlauf-b", speicher: { lesen, schreiben }, uhr });
      expect(sb.schritt()).toBe("UEBERNEHMEN");
      expect(sb.z.epoche).toBe(epocheA + 1);
      const spitzeVorher = git(["ls-remote", remote, "refs/heads/work/a"]);
      expect(() => gepruefterPush({ halter: "dauerlauf-a", epoche: epocheA, quelle, ziel: "refs/heads/work/a2", jetzt: jetzt(), minuten: 20 })).toThrow(/Kein Schreibrecht/);
      expect(git(["ls-remote", remote, "refs/heads/work/a2"])).toBe("");
      expect(git(["ls-remote", remote, "refs/heads/work/a"])).toBe(spitzeVorher);
      expect(() => gepruefterPush({ halter: "dauerlauf-b", epoche: sb.z.epoche, quelle, ziel: "refs/heads/work/b", jetzt: jetzt(), minuten: 20 })).not.toThrow();
    });
  });

  it("gültige fremde Git-Lease bleibt unverändert, wenn ein zweiter Supervisor 10 Zyklen läuft", () => {
    const remote = frisch();
    mitRemote(remote, () => {
      const uhr = { t: T0 };
      const a = supervisor({ halter: "dauerlauf-a", speicher: { lesen, schreiben }, uhr });
      const b = supervisor({ halter: "dauerlauf-b", speicher: { lesen, schreiben }, uhr });
      a.schritt();
      const vorher = git(["ls-remote", remote, "refs/heads/koordination/lease"]);
      for (let i = 0; i < 10; i++) { uhr.t += MIN; expect(b.schritt()).toBe("WARTEN_FREMDE_LEASE"); }
      expect(git(["ls-remote", remote, "refs/heads/koordination/lease"])).toBe(vorher);
    });
  });
});
