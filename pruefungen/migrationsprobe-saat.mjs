// Wegwerfdaten für die K4-Werkzeuge (migrationsprobe-lokal, betriebskennungen-pruefen). Nur Testdaten.
// Je Raum ein Bestand mit den angegebenen Betrieben, geschrieben über die Ablageschicht der App in einem eigenen
// Prozess (CENTRIC_DATEN gilt je Prozess; der Testprozess selbst bleibt unberührt).
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WURZEL = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} daten Wurzel der Wegwerfablage  @param {Record<string, object[]>} raeume Raum → Betriebe */
export function saeen(daten, raeume) {
  const code = `const { getStore } = await import(process.env.SAAT_A); const B = await import(process.env.SAAT_B);
    const s = getStore({ name: "centric", consistency: "strong" });
    for (const [raum, mand] of Object.entries(JSON.parse(process.env.SAAT_R))) {
      const b = { version: 9, mandanten: mand.map((m) => ({ einheiten: [], dienstarten: [], personen: [], abweichungen: {},
        abwesenheiten: [], erfassung: {}, einstempeln: {}, ...m })) };
      const e = await B.bestandSchreiben(s, raum, b, { durch: "Pruefung" });
      if (!e || !e.ok) throw new Error("Saat " + raum + ": " + JSON.stringify(e));
    }`;
  const env = { ...process.env, CENTRIC_DATEN: daten, CENTRIC_ABLAGE: "dateien", SAAT_R: JSON.stringify(raeume),
    SAAT_A: pathToFileURL(join(WURZEL, "server", "lib", "ablage.mjs")).href,
    SAAT_B: pathToFileURL(join(WURZEL, "server", "lib", "bestand.mjs")).href };
  delete env.CENTRIC_BASIS;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", cwd: daten, env });
  if (r.status !== 0) throw new Error("Saat fehlgeschlagen: " + r.stderr);
}
