/* ==========================================================================
   HERKUNFT UND X-FORWARDED-FOR (B-XFF-1, WP-32b)

   Bis WP-32b übernahm server.mjs einen mitgeschickten X-Forwarded-For von
   jedem Absender, und herkunft() nahm den ersten Eintrag. Wer den Dienst am
   Proxy vorbei erreichte, bekam mit jedem erfundenen Wert einen frischen
   Zähler der Bremse — neun falsche Codes aus neun „Herkünften“ liefen nie
   in die Sperre.

   Jetzt zählt XFF nur, wenn die Gegenstelle in CENTRIC_VERTRAUTE_PROXYS
   steht, und dann von rechts gelesen.

   Rot auf altem Stand: „ohne Vertrauensliste“ (nie 429) und „vertrauter
   Proxy, linke Einträge gefälscht“ (nie 429); die reinen Funktionen fehlten.
   ========================================================================== */

import { describe, it, expect, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { herkunftBestimmen, vertrauteListe, adresseNormieren } from "../server/lib/schutz.mjs";
import { serverStarten } from "./hilfen/port.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("herkunftBestimmen", () => {
  const leer = vertrauteListe("");
  const caddy = vertrauteListe("172.18.0.0/16, ::1");

  it("leere Liste: XFF wird ignoriert, es zählt die Gegenstelle", () => {
    expect(leer.anzahl).toBe(0);
    expect(herkunftBestimmen("203.0.113.9", "1.2.3.4", leer)).toBe("203.0.113.9");
    expect(herkunftBestimmen("203.0.113.9", "1.2.3.4, 5.6.7.8", leer)).toBe("203.0.113.9");
    expect(herkunftBestimmen("203.0.113.9", undefined, leer)).toBe("203.0.113.9");
  });

  it("nicht vertraute Gegenstelle: XFF zählt nicht, auch bei Liste", () => {
    expect(herkunftBestimmen("203.0.113.9", "1.2.3.4", caddy)).toBe("203.0.113.9");
  });

  it("vertrauter Proxy: von rechts, erster nicht vertrauter Eintrag", () => {
    expect(herkunftBestimmen("172.18.0.5", "198.51.100.7", caddy)).toBe("198.51.100.7");
    /* Der Client schreibt links, was er will — gelesen wird es nie. */
    expect(herkunftBestimmen("172.18.0.5", "1.1.1.1, 2.2.2.2, 198.51.100.7", caddy)).toBe("198.51.100.7");
    /* Kette über einen zweiten vertrauten Proxy. */
    expect(herkunftBestimmen("172.18.0.5", "198.51.100.7, 172.18.0.9", caddy)).toBe("198.51.100.7");
    /* Alles vertraut: der äußerste Eintrag. */
    expect(herkunftBestimmen("172.18.0.5", "172.18.0.7, 172.18.0.9", caddy)).toBe("172.18.0.7");
    /* Unsinn ganz rechts: nicht weiterlesen, Gegenstelle zählt. */
    expect(herkunftBestimmen("172.18.0.5", "198.51.100.7, keine-adresse", caddy)).toBe("172.18.0.5");
  });

  it("IPv4-gemappte IPv6-Adressen werden als IPv4 behandelt", () => {
    expect(adresseNormieren("::ffff:172.18.0.5")).toBe("172.18.0.5");
    expect(herkunftBestimmen("::ffff:172.18.0.5", "::ffff:198.51.100.7", caddy)).toBe("198.51.100.7");
    expect(herkunftBestimmen("::ffff:203.0.113.9", "1.2.3.4", caddy)).toBe("203.0.113.9");
    expect(herkunftBestimmen("::ffff:203.0.113.9", undefined, leer)).toBe("203.0.113.9");
  });

  it("IPv6: Netze, Klammern, Zonen", () => {
    const v6 = vertrauteListe("fd00:c0ff:ee::/48");
    expect(herkunftBestimmen("fd00:c0ff:ee::2", "2001:db8::1", v6)).toBe("2001:db8::1");
    expect(herkunftBestimmen("fd00:c0ff:ef::2", "2001:db8::1", v6)).toBe("fd00:c0ff:ef::2");
    expect(herkunftBestimmen("::1", "[2001:db8::7]", caddy)).toBe("2001:db8::7");
    expect(adresseNormieren("fe80::1%eth0")).toBe("fe80::1");
    expect(adresseNormieren("198.51.100.7:4711")).toBe("198.51.100.7");
  });

  it("ungültige Liste wirft", () => {
    expect(() => vertrauteListe("caddy")).toThrow();
    expect(() => vertrauteListe("10.0.0.0/33")).toThrow();
    expect(() => vertrauteListe("::1/129")).toThrow();
  });
});

/* ---------- über den echten Server ---------- */

let kind, statik, daten, log = () => "";
async function starten(env) {
  statik = await mkdtemp(path.join(tmpdir(), "centric-xff-statik-"));
  daten = await mkdtemp(path.join(tmpdir(), "centric-xff-daten-"));
  await mkdir(path.join(statik, "assets"));
  await writeFile(path.join(statik, "index.html"), "<!doctype html><title>x</title>");
  /* Freier Port vom Betriebssystem, Bereitschaft am eigenen Prozess (hilfen/port.mjs). */
  const st = await serverStarten({ cwd: WURZEL, env: { CENTRIC_STATIK: statik, CENTRIC_DATEN: daten,
    CENTRIC_ABLAGE: "dateien", CENTRIC_PFEFFER: "xff-pfeffer", NODE_ENV: "production",
    CENTRIC_AUFRAEUMEN: "aus", ...env, CENTRIC_VERTRAUTE_PROXYS: env.CENTRIC_VERTRAUTE_PROXYS } });
  kind = st.kind;
  log = st.log;
  return st.basis;
}
afterEach(async () => {
  if (kind) { kind.kill(); await new Promise((r) => kind.once("exit", r)); kind = null; }
  for (const d of [statik, daten]) if (d) await rm(d, { recursive: true, force: true });
});

/** Zwölf falsche Anmeldungen; gibt die Statuscodes zurück. */
async function fehlversuche(B, xff) {
  const aus = [];
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${B}/api/anmelden`, { method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": xff(i) },
      body: JSON.stringify({ zugangscode: `XFF${i}-FALS-CH00` }) });
    aus.push(r.status);
  }
  return aus;
}

describe("server.mjs mit echter Gegenstelle 127.0.0.1", () => {
  it("ohne Vertrauensliste: gefälschtes XFF ändert die Kennung nicht — die Bremse greift", async () => {
    const B = await starten({ CENTRIC_VERTRAUTE_PROXYS: undefined });
    const st = await fehlversuche(B, (i) => `198.51.100.${i + 1}`);
    expect(st, JSON.stringify(st)).toContain(429);
    expect(log()).toMatch(/CENTRIC_VERTRAUTE_PROXYS ist leer/);
    expect(log()).toMatch(/WARNUNG: Anfrage mit X-Forwarded-For/);
  }, 30000);

  it("vertrauter Proxy: verschiedene Clients rechts zählen getrennt", async () => {
    const B = await starten({ CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1" });
    const st = await fehlversuche(B, (i) => `198.51.100.${i + 1}`);
    expect(st, JSON.stringify(st)).not.toContain(429);
  }, 30000);

  it("vertrauter Proxy: links gefälschte Einträge ändern die Kennung nicht", async () => {
    const B = await starten({ CENTRIC_VERTRAUTE_PROXYS: "127.0.0.1,::1" });
    const st = await fehlversuche(B, (i) => `10.9.${i}.1, 198.51.100.77`);
    expect(st, JSON.stringify(st)).toContain(429);
  }, 30000);

  it("ungültige Vertrauensliste hält den Start an", async () => {
    const r = await new Promise((fertig) => {
      const k = spawn(process.execPath, ["server.mjs"], { cwd: WURZEL,
        env: { ...process.env, PORT: "0", CENTRIC_VERTRAUTE_PROXYS: "caddy-netz", CENTRIC_AUFRAEUMEN: "aus" },
        stdio: ["ignore", "pipe", "pipe"] });
      let t = ""; k.stderr.on("data", (d) => { t += d; });
      k.once("exit", (code) => fertig({ code, t }));
    });
    expect(r.code).not.toBe(0);
    expect(r.t).toMatch(/CENTRIC_VERTRAUTE_PROXYS/);
  }, 30000);
});
