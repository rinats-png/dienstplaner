import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entscheide, lesen, schreiben, gepruefterPush, leaseCommit } from "../werkzeug/koordination.mjs";

const WZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../werkzeug/koordination.mjs");
const T0 = new Date("2026-11-10T06:00:00Z");
const min = (m) => new Date(T0.getTime() + m * 60000);
const lease = (o = {}) => ({ epoche: 1, halter: "haupt", gueltig_bis: min(60).toISOString(), freigegeben_am: null, ...o });
/* Kleiner Wurzelcommit ohne Historie: Das Arbeitsrepo ist in Cloud-Sitzungen flach und lässt sich nicht in ein leeres Remote pushen. */
const kleinerCommit = () => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t.invalid", "commit-tree", "4b825dc642cb6eb9a060e54bf8d69288fbee4904", "-m", "t"], { encoding: "utf8" }).trim();
const UEB = "Übergabe ausdrücklich dokumentiert";

describe("Entscheidung (rein)", () => {
  it("Übernahme ohne Lease braucht ausdrückliche Übergabe", () => {
    expect(entscheide(null, T0, { aktion: "uebernehmen", halter: "cloud" }).ok).toBe(false);
    const e = entscheide(null, T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB });
    expect(e.ok).toBe(true);
    expect(e.neu.epoche).toBe(1);
  });
  it("gültige fremde Lease wird nie überschrieben", () => {
    expect(entscheide(lease(), T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB }).ok).toBe(false);
  });
  it("Ablauf: Fremde erst nach Ablauf plus 2 Min, Epoche steigt", () => {
    const a = { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB };
    expect(entscheide(lease(), min(61), a).ok).toBe(false); // abgelaufen, aber in der Sicherheitszone
    expect(entscheide(lease(), min(62.1), a).neu.epoche).toBe(2);
    expect(entscheide(lease({ freigegeben_am: T0.toISOString() }), T0, a).ok).toBe(true);
  });
  it("Halter gilt für sich schon 2 Min vor Ablauf als abgelaufen: Sicherheitszone ohne Schreiber", () => {
    const h = { halter: "haupt" };
    expect(entscheide(lease(), min(57), { aktion: "pruefen", ...h }).ok).toBe(true);
    expect(entscheide(lease(), min(58.5), { aktion: "pruefen", ...h }).ok).toBe(false);
    expect(entscheide(lease(), min(58.5), { aktion: "erneuern", ...h }).ok).toBe(false);
    expect(entscheide(lease(), min(58.5), { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB }).ok).toBe(false);
  });
  it("abgelaufene Lease kann der alte Halter nicht erneuern, nur neu übernehmen", () => {
    expect(entscheide(lease(), min(70), { aktion: "erneuern", halter: "haupt" }).ok).toBe(false);
  });
  it("Gültigkeit ist begrenzt", () => {
    const e = entscheide(null, T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB, minuten: 99999 });
    expect(Date.parse(e.neu.gueltig_bis) - T0.getTime()).toBe(240 * 60000);
  });
  it("Erneuern und Freigeben nur durch den Halter", () => {
    expect(entscheide(lease(), T0, { aktion: "erneuern", halter: "cloud" }).ok).toBe(false);
    expect(entscheide(lease(), T0, { aktion: "freigeben", halter: "cloud" }).ok).toBe(false);
    expect(entscheide(lease(), T0, { aktion: "erneuern", halter: "haupt" }).ok).toBe(true);
    expect(entscheide(lease(), T0, { aktion: "freigeben", halter: "haupt", epoche: 1 }).neu.freigegeben_am).toBeTruthy();
  });
  it("Fencing: veraltete Epoche wird abgelehnt, auch bei gleichem Halter", () => {
    const l = lease({ epoche: 3 });
    expect(entscheide(l, T0, { aktion: "pruefen", halter: "haupt", epoche: 2 }).ok).toBe(false);
    expect(entscheide(l, T0, { aktion: "pruefen", halter: "haupt", epoche: 3 }).ok).toBe(true);
    expect(entscheide(l, T0, { aktion: "erneuern", halter: "haupt", epoche: 2 }).ok).toBe(false);
  });
  it("beschädigte Lease: fail-closed", () => {
    for (const l of [{ halter: "x" }, { epoche: "a", halter: "x", gueltig_bis: "kaputt" }, { epoche: 1, halter: 5, gueltig_bis: min(5).toISOString() }]) {
      expect(entscheide(l, T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB }).ok).toBe(false);
    }
  });
  it("ungültiger Halter wird abgelehnt", () => {
    expect(entscheide(null, T0, { aktion: "uebernehmen", halter: "../x", uebergabe: UEB }).ok).toBe(false);
  });
});

/* Gegen ein echtes Git-Remote (Bare-Repo im Temp-Verzeichnis, nie das echte origin). */
describe("Echte Nebenläufigkeit gegen Git-Remote", () => {
  let remote;
  const git = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const lauf = (args) => new Promise((ok) => {
    const k = spawn("node", [WZ, ...args], { env: { ...process.env, KOORD_REMOTE: remote } });
    let err = "";
    k.stderr.on("data", (d) => { err += d; });
    k.on("close", (code) => ok({ code, err }));
  });
  const stand = () => JSON.parse(execFileSync("node", [WZ, "status"], { env: { ...process.env, KOORD_REMOTE: remote }, encoding: "utf8" }));
  const mitRemote = (f) => { const alt = process.env.KOORD_REMOTE; process.env.KOORD_REMOTE = remote; try { return f(); } finally { if (alt === undefined) delete process.env.KOORD_REMOTE; else process.env.KOORD_REMOTE = alt; } };
  const uebern = (h) => ["uebernehmen", "--halter", h, "--uebergabe", UEB];

  beforeEach(() => {
    const d = mkdtempSync(path.join(tmpdir(), "koord-"));
    git(["init", "--bare", "-q", "remote.git"], d);
    remote = path.join(d, "remote.git");
  });

  it("8 gleichzeitige Übernahmen auf leerer Lease: genau eine gelingt", async () => {
    const r = await Promise.all(Array.from({ length: 8 }, (_, i) => lauf(uebern(`kandidat-${i}`))));
    expect(r.filter((x) => x.code === 0)).toHaveLength(1);
    expect(r.every((x) => [0, 1, 2].includes(x.code))).toBe(true);
    expect(stand().epoche).toBe(1);
  });

  it("6 gleichzeitige Übernahmen einer abgelaufenen Lease: genau eine, Epoche steigt genau um 1", async () => {
    mitRemote(() => schreiben(null, { epoche: 4, halter: "alt", gueltig_bis: new Date(Date.now() - 3600e3).toISOString(), freigegeben_am: null }, "alt"));
    const r = await Promise.all(Array.from({ length: 6 }, (_, i) => lauf(uebern(`neu-${i}`))));
    expect(r.filter((x) => x.code === 0)).toHaveLength(1);
    const s = stand();
    expect(s.epoche).toBe(5);
    expect(s.vorgaenger).toBe("alt");
  });

  it("Erneuerung des Halters gegen gleichzeitige Fremdübernahmen: Fremde nie erfolgreich", async () => {
    expect((await lauf(uebern("halter-a"))).code).toBe(0);
    const r = await Promise.all([
      lauf(["erneuern", "--halter", "halter-a", "--epoche", "1"]),
      ...Array.from({ length: 4 }, (_, i) => lauf(uebern(`fremd-${i}`))),
    ]);
    expect(r.slice(1).every((x) => x.code !== 0)).toBe(true);
    expect(stand().halter).toBe("halter-a");
  });

  it("ehemaliger Koordinator: Prüfung, Erneuerung und Push scheitern nach Übernahme", async () => {
    // A übernimmt, Lease läuft ab, B übernimmt (Epoche 2).
    mitRemote(() => schreiben(null, { epoche: 1, halter: "koord-a", gueltig_bis: new Date(Date.now() - 3600e3).toISOString(), freigegeben_am: null }, "a"));
    expect((await lauf(uebern("koord-b"))).code).toBe(0);
    expect((await lauf(["pruefen", "--halter", "koord-a", "--epoche", "1"])).code).not.toBe(0);
    expect((await lauf(["erneuern", "--halter", "koord-a", "--epoche", "1"])).code).not.toBe(0);
    const ref = "refs/heads/arbeit/a";
    expect((await lauf(["push", "--halter", "koord-a", "--epoche", "1", "--quelle", kleinerCommit(), "--ziel", ref])).code).not.toBe(0);
    expect(git(["ls-remote", remote, ref], remote)).toBe("");
    // B darf, mit richtiger Epoche; mit falscher Epoche nicht.
    expect((await lauf(["push", "--halter", "koord-b", "--epoche", "1", "--quelle", kleinerCommit(), "--ziel", ref])).code).not.toBe(0);
    expect((await lauf(["push", "--halter", "koord-b", "--epoche", "2", "--quelle", kleinerCommit(), "--ziel", ref])).code).toBe(0);
    expect(git(["ls-remote", remote, ref], remote)).not.toBe("");
  });

  it("Prüfung bestanden, dann Übernahme durch andere, dann Push: atomar abgelehnt, Arbeits-Branch bleibt leer", () => {
    mitRemote(() => {
      schreiben(null, { epoche: 1, halter: "koord-a", uebernommen_am: new Date().toISOString(), gueltig_bis: new Date(Date.now() + 3600e3).toISOString(), freigegeben_am: null }, "a");
      const ansichtA = lesen(); // A hat geprüft und hält die Ansicht
      // Zwischenzeitlich gibt A frei (oder verliert) und B übernimmt: Spitze wandert weiter.
      const { spitze, lease: l } = lesen();
      const frei = { ...l, freigegeben_am: new Date().toISOString(), gueltig_bis: new Date().toISOString() };
      schreiben(spitze, frei, "frei");
      const nach = lesen();
      schreiben(nach.spitze, { epoche: 2, halter: "koord-b", gueltig_bis: new Date(Date.now() + 3600e3).toISOString(), freigegeben_am: null }, "b");
      const ref = "refs/heads/arbeit/a2";
      expect(() => gepruefterPush({ halter: "koord-a", epoche: 1, quelle: kleinerCommit(), ziel: ref, ansicht: ansichtA })).toThrow();
      expect(git(["ls-remote", remote, ref], remote)).toBe("");
    });
  });

  it("Zielrefs main, master und Lease selbst sind gesperrt", () => {
    mitRemote(() => {
      schreiben(null, { epoche: 1, halter: "koord-a", gueltig_bis: new Date(Date.now() + 3600e3).toISOString(), freigegeben_am: null }, "a");
      for (const z of ["refs/heads/main", "refs/heads/master", "refs/heads/koordination/lease"]) {
        expect(() => gepruefterPush({ halter: "koord-a", epoche: 1, quelle: "HEAD", ziel: z })).toThrow(/nicht erlaubt/);
      }
    });
  });

  it("Lease-Commit setzt auf der gelesenen Spitze auf (Verkettung, Nachweis der Übergaben)", () => {
    mitRemote(() => {
      schreiben(null, { epoche: 1, halter: "koord-a", gueltig_bis: new Date(Date.now() + 3600e3).toISOString(), freigegeben_am: null }, "a");
      const { spitze } = lesen();
      const c = leaseCommit(spitze, { epoche: 1, halter: "koord-a", gueltig_bis: new Date(Date.now() + 3600e3).toISOString() }, "x");
      expect(git(["rev-parse", `${c}^`])).toBe(spitze);
    });
  });
});

/* Review-Befunde zu PR 170: H1 Schnappschuss, H2 gesperrte Ziele, M1 Epoche Pflicht, M2 fail-closed. */
describe("Review-Befunde H1, H2, M1, M2", () => {
  let remote;
  const WURZEL = path.resolve(path.dirname(WZ), "..");
  const git = (a, cwd) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
  const lauf = (args) => new Promise((ok) => {
    const k = spawn("node", [WZ, ...args], { env: { ...process.env, KOORD_REMOTE: remote } });
    let err = "";
    k.stderr.on("data", (d) => { err += d; });
    k.on("close", (code) => ok({ code, err }));
  });
  const mitRemote = (f) => { const alt = process.env.KOORD_REMOTE; process.env.KOORD_REMOTE = remote; try { return f(); } finally { if (alt === undefined) delete process.env.KOORD_REMOTE; else process.env.KOORD_REMOTE = alt; } };
  const aktiv = (o = {}) => ({ epoche: 1, halter: "koord-a", gueltig_bis: new Date(Date.now() + 3600e3).toISOString(), freigegeben_am: null, ...o });
  const frischesRemote = () => {
    const d = mkdtempSync(path.join(tmpdir(), "koord-rev-"));
    git(["init", "--bare", "-q", "remote.git"], d);
    remote = path.join(d, "remote.git");
  };
  beforeEach(frischesRemote);

  it("H1: Lesung ist ein Schnappschuss, Spitze und Inhalt stammen aus demselben Commit; ein veralteter geteilter Ref schadet nicht", () => {
    mitRemote(() => {
      const c1 = schreiben(null, aktiv({ epoche: 1 }), "eins");
      const c2 = schreiben(c1, aktiv({ epoche: 2 }), "zwei");
      git(["update-ref", "refs/koordination/lokal", c1], WURZEL); // veralteter, geteilter Ref
      try {
        const s = lesen();
        expect(s.spitze).toBe(c2);
        expect(s.lease.epoche).toBe(2);
      } finally {
        try { git(["update-ref", "-d", "refs/koordination/lokal"], WURZEL); } catch { /* nicht vorhanden */ }
      }
    });
  });

  it("H1: nach dem Lesen bleibt kein temporärer Ref zurück", () => {
    mitRemote(() => {
      schreiben(null, aktiv(), "a");
      lesen();
      expect(git(["for-each-ref", "refs/koordination/tmp"], WURZEL)).toBe("");
    });
  });

  it("M2: unlesbare Lease (null, 0, false, Liste) ist fail-closed, nicht 'keine Lease'", () => {
    for (const kaputt of [null, 0, false, []]) {
      frischesRemote();
      mitRemote(() => schreiben(null, kaputt, "kaputt"));
      expect(() => mitRemote(() => lesen())).toThrow(/fail-closed/);
    }
  });

  it("M2: CLI bei unlesbarer Lease: Exit 4, keine Übernahme", async () => {
    mitRemote(() => schreiben(null, null, "kaputt"));
    const r = await lauf(["uebernehmen", "--halter", "cloud", "--uebergabe", "Übergabe ausdrücklich dokumentiert"]);
    expect(r.code).toBe(4);
    expect(git(["show", "-s", "--format=%s", "refs/heads/koordination/lease"], remote)).toBe("kaputt");
  });

  it("M2: beschädigtes freigegeben_am ist fail-closed", () => {
    const e = entscheide(aktiv({ freigegeben_am: "kaputt" }), T0, { aktion: "uebernehmen", halter: "cloud", uebergabe: UEB });
    expect(e.ok).toBe(false);
  });

  it("M1: push ohne --epoche wird abgelehnt, auch mit gültigem Halter", async () => {
    mitRemote(() => schreiben(null, aktiv(), "a"));
    const ref = "refs/heads/arbeit/ohne-epoche";
    const r = await lauf(["push", "--halter", "koord-a", "--quelle", kleinerCommit(), "--ziel", ref]);
    expect(r.code).not.toBe(0);
    expect(git(["ls-remote", remote, ref], remote)).toBe("");
  });

  it("M1: freigeben mit veralteter oder fehlender Epoche ist abgelehnt, mit aktueller klappt es", async () => {
    expect(entscheide(aktiv({ epoche: 3 }), T0, { aktion: "freigeben", halter: "koord-a", epoche: 2 }).ok).toBe(false);
    expect(entscheide(aktiv({ epoche: 3 }), T0, { aktion: "freigeben", halter: "koord-a" }).ok).toBe(false);
    mitRemote(() => schreiben(null, aktiv({ epoche: 3 }), "a"));
    expect((await lauf(["freigeben", "--halter", "koord-a"])).code).toBe(1);
    expect((await lauf(["freigeben", "--halter", "koord-a", "--epoche", "2"])).code).toBe(1);
    expect((await lauf(["freigeben", "--halter", "koord-a", "--epoche", "3"])).code).toBe(0);
  });

  it("H2: Integrations-, Release-, Haupt- und Lease-Branches sind als Push-Ziel gesperrt", () => {
    for (const z of ["refs/heads/integration/release-v4", "refs/heads/integration/anderer", "refs/heads/release/v5", "refs/heads/koordination/fremd", "refs/heads/main", "refs/heads/master", "refs/heads/koordination/lease"]) {
      expect(() => gepruefterPush({ halter: "koord-a", epoche: 1, quelle: "HEAD", ziel: z })).toThrow(/nicht erlaubt/);
    }
    expect(() => gepruefterPush({ halter: "koord-a", epoche: 1, quelle: "HEAD", ziel: "refs/heads/arbeit/../main" })).toThrow(/nicht erlaubt/);
  });
});
