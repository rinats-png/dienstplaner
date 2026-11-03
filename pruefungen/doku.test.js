/* ==========================================================================
   BETRIEBS- UND NUTZERDOKUMENTATION (WP-41)

   Hält die Dokumentation an den Code gebunden:
     - jeder relative Verweis in den WP-41-Dokumenten zeigt auf eine Datei,
       die es gibt
     - jede Umgebungsvariable, die der Server liest, steht im
       Betriebshandbuch (eine neue Variable ohne Doku macht diese Prüfung rot)
     - keine Adressen, Digests oder geheimnisartigen Werte in den Dokumenten
       (öffentliches Repository)
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOKS = ["docs/BETRIEBSHANDBUCH.md", "docs/INCIDENT-RUNBOOK.md", "docs/RESTORE-ANLEITUNG.md",
  ...readdirSync(path.join(WURZEL, "docs/handbuch")).filter((f) => f.endsWith(".md")).map((f) => `docs/handbuch/${f}`)];
const lies = (d) => readFileSync(path.join(WURZEL, d), "utf8");

describe("Verweise", () => {
  it("alle WP-41-Dokumente gibt es (Betriebshandbuch, Runbook, Restore, sieben Rollen)", () => {
    for (const d of DOKS) expect(existsSync(path.join(WURZEL, d)), d).toBe(true);
    const rollen = ["mitarbeitende", "schichtverantwortung", "planung", "leitung", "kunde-inhaber", "betriebsrat", "betreiber"];
    for (const r of rollen) expect(DOKS, r).toContain(`docs/handbuch/${r}.md`);
  });

  it("jeder relative Markdown-Verweis zeigt auf eine vorhandene Datei", () => {
    const kaputt = [];
    for (const d of DOKS) {
      for (const [, ziel] of lies(d).matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(ziel)) continue;
        const datei = ziel.split("#")[0];
        if (!existsSync(path.join(WURZEL, path.dirname(d), datei))) kaputt.push(`${d} → ${ziel}`);
      }
    }
    expect(kaputt).toEqual([]);
  });
});

describe("Konfiguration im Betriebshandbuch", () => {
  it("jede vom Server gelesene Variable ist beschrieben", () => {
    const quellen = [];
    const sammeln = (dir) => {
      for (const e of readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) sammeln(p);
        else if (/\.mjs$/.test(e.name)) quellen.push(lies(p));
      }
    };
    sammeln("server");
    quellen.push(lies("server.mjs"));
    const namen = new Set();
    for (const q of quellen)
      for (const [, n] of q.matchAll(/\b((?:CENTRIC|REDIS|RESEND|VAPID)_[A-Z0-9_]+)\b/g)) namen.add(n);
    const handbuch = lies("docs/BETRIEBSHANDBUCH.md");
    const fehlt = [...namen].filter((n) => !handbuch.includes(`\`${n}\``)).sort();
    expect(fehlt).toEqual([]);
    expect(namen.size).toBeGreaterThan(20);
    /* … und steht auch in .env.example (als Zuweisung, gern auskommentiert). */
    const vorlage = lies(".env.example");
    const nichtInVorlage = [...namen].filter((n) => !new RegExp(`^#?\\s*${n}=`, "m").test(vorlage)).sort();
    expect(nichtInVorlage).toEqual([]);
  });

  it("CENTRIC_VERTRAUTE_PROXYS: überall nur Caddys feste Adresse empfohlen, kein Subnetz-Platzhalter", () => {
    const vorlage = lies(".env.example");
    expect(vorlage).toMatch(/^CENTRIC_VERTRAUTE_PROXYS=<FESTE_ADRESSE_DES_CADDY_CONTAINERS>$/m);
    expect(vorlage).not.toMatch(/SUBNETZ_DES_NETZES_PROXY/);
    expect(lies("BEREITSTELLUNG.md")).toMatch(/nur\s+Caddys feste Adresse/);
    expect(lies("docs/CADDY-UND-XFF.md")).not.toMatch(/CENTRIC_VERTRAUTE_PROXYS=<Subnetz>/);
  });
});

describe("öffentliches Repository", () => {
  it("keine IP-Adressen außer 127.0.0.1, keine Digests, keine Codes, keine Schlüssel", () => {
    for (const d of DOKS) {
      const t = lies(d);
      const ips = [...t.matchAll(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g)].map((m) => m[0]).filter((ip) => ip !== "127.0.0.1");
      expect(ips, d).toEqual([]);
      expect(t, d).not.toMatch(/sha256:[0-9a-f]{64}/);
      expect(t, d).not.toMatch(/\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/);          // Zugangscode
      expect(t, d).not.toMatch(/\bV-[A-Z0-9]{5}-[A-Z0-9]{5}/);                        // Verwalterschlüssel
      expect(t, d).not.toMatch(/-----BEGIN|ssh-ed25519 AAAA[A-Za-z0-9+/]{20}/);
    }
  });
});
