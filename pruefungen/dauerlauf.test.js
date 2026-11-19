import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entscheide, lesen, schreiben, gepruefterPush } from "../werkzeug/koordination.mjs";
import {
  STANDARD, leererZustand, planeSchritt, verbucheErgebnis, zyklus, leaseEffekte, kandidatenAus, claudeBefehl, auftragsSchluessel,
} from "../werkzeug/dauerlauf.mjs";

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
  const w = { starts: [], lebt: false, puls: null, ergebnis: null, beendet: 0 };
  const L = leaseEffekte({ jetzt: () => new Date(uhr.t), speicher });
  const eff = {
    jetzt: () => new Date(uhr.t), protokoll: (z) => w.log?.push(z), lease: L, kopf: () => "k1",
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
  it("claudeBefehl: begrenzt, ohne Berechtigungsumgehung, Eingaben validiert", () => {
    const b = claudeBefehl({ paketId: "WP-A", halter: "dauerlauf-a", epoche: 3, promptDatei: "x.md" });
    expect(b.args).toContain("--max-turns");
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

  it("Hängender Agent: Puls bleibt aus, Lease wird NICHT erneuert, Worker wird beendet, Fehlversuch gezählt", () => {
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
    const a = supervisor({ halter: "dauerlauf-a", speicher: sp, uhr, kandidaten: [] });
    a.schritt();
    expect(a.schritt()).toBe("FREIGEBEN");
    expect(sp.lease.freigegeben_am).toBeTruthy();
    expect(a.w.starts).toHaveLength(0);
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

describe("Dauerlauf: nie zwei schreibberechtigte Koordinatoren (Zufallsläufe, Speicher im Arbeitsspeicher)", () => {
  /* Linearer Kongruenzgenerator: reproduzierbar, kein Math.random. */
  const zufall = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; };

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`Seed ${seed}: höchstens ein Schreiber, alte Epoche scheitert, Worker nur mit Schreibrecht`, () => {
      const r = zufall(seed); const sp = speicherImSpeicher(); const uhr = { t: T0 };
      const schalter = { aus: false };
      let nummer = 0;
      const neu = () => { nummer += 1; return supervisor({ halter: `dauerlauf-${nummer}`, speicher: sp, uhr, schalter, kandidaten: ["WP-A", "WP-B", "WP-C"] }); };
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
