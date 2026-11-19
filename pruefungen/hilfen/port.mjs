/* ==========================================================================
   FREIER PORT UND SERVERSTART FÜR PRÜFUNGEN MIT ECHTEM SERVER

   Bis November 2026 wählten fünf Prüfungen ihren Port selbst:
   30000 + Math.floor(Math.random() * 20000). Das kollidierte (CI: „Server
   kam nicht hoch: EADDRINUSE 0.0.0.0:46654"), aus zwei Gründen:

   - Die Prüfungen laufen in getrennten Prozessen nebeneinander. Zwei
     Zufallszahlen aus 20000 treffen sich öfter, als man denkt, und jede
     weitere Prüfung mit eigenem Server erhöht das.
   - Der Bereich 30000–50000 überdeckt den Ephemeral-Bereich des Systems
     (Linux ab 32768). Die ausgehenden Verbindungen der Prüfung selbst
     belegen dort Ports — auch den, den man gerade für den Server zog.

   Dazu kam ein stilleres Problem: Antwortet auf dem gezogenen Port schon der
   Server einer ANDEREN Prüfung, bekam /gesund ein „ok", und die Prüfung lief
   gegen den falschen Server weiter, während der eigene längst mit EADDRINUSE
   abgestürzt war.

   Jetzt:
   - Das Betriebssystem vergibt den Port (Socket auf Port 0, wieder
     freigeben, dem Server übergeben).
   - „Bereit" heißt: Der eigene Prozess lebt, hat „läuft auf Port" ins Log
     geschrieben UND /gesund antwortet.
   - Zwischen Freigeben und Binden bleibt ein kleines Fenster. Scheitert der
     Start an EADDRINUSE, wird mit einem neuen Port wiederholt (höchstens
     fünfmal). Jeder andere Fehler bricht sofort ab — ein Server, der aus
     einem anderen Grund nicht hochkommt, wird nicht wiederholt.
   ========================================================================== */
import { createServer } from "node:net";
import { spawn } from "node:child_process";

/** Ein vom Betriebssystem vergebener freier Port (auf allen Schnittstellen, wie server.mjs). */
export function freierPort() {
  return new Promise((erfuellt, verworfen) => {
    const s = createServer();
    s.unref();
    s.once("error", verworfen);
    s.listen(0, "0.0.0.0", () => {
      const { port } = /** @type {import("node:net").AddressInfo} */ (s.address());
      s.close((e) => (e ? verworfen(e) : erfuellt(port)));
    });
  });
}

/**
 * Ruft `starten(port)` mit einem freien Port auf. Wirft `starten` einen Fehler,
 * dessen Text EADDRINUSE nennt, wird mit einem neuen Port wiederholt.
 * `starten` muss einen halb gestarteten Server vor dem Werfen selbst beenden.
 * @template T
 * @param {(port: number) => Promise<T>} starten
 * @param {{ versuche?: number }} [o]
 * @returns {Promise<T>}
 */
export async function aufFreiemPort(starten, { versuche = 5 } = {}) {
  let letzter;
  for (let i = 0; i < versuche; i++) {
    const port = await freierPort();
    try { return await starten(port); }
    catch (e) {
      letzter = e;
      if (!/EADDRINUSE/.test(String((e && /** @type {any} */ (e).message) || e))) throw e;
    }
  }
  throw letzter;
}

/**
 * Startet `node server.mjs` auf einem freien Port und wartet, bis er bereit ist.
 * @param {{ cwd: string, env?: Record<string, string|undefined>, wartenMs?: number }} o
 *   env: Zusätze zur Umgebung; ein Wert `undefined` entfernt die Variable.
 * @returns {Promise<{ kind: import("node:child_process").ChildProcess, port: number, basis: string, log: () => string }>}
 */
export function serverStarten({ cwd, env = {}, wartenMs = 10_000 }) {
  return aufFreiemPort(async (port) => {
    const umgebung = { ...process.env, ...env, PORT: String(port) };
    for (const [k, v] of Object.entries(umgebung)) if (v === undefined) delete umgebung[k];
    let log = "";
    const kind = spawn(process.execPath, ["server.mjs"], { cwd, env: umgebung, stdio: ["ignore", "pipe", "pipe"] });
    const sammeln = (d) => { log += d; if (log.length > 200_000) log = log.slice(-100_000); };
    kind.stdout.on("data", sammeln);
    kind.stderr.on("data", sammeln);
    let beendet = false;
    kind.once("exit", () => { beendet = true; });
    const basis = `http://127.0.0.1:${port}`;
    const bis = Date.now() + wartenMs;
    while (Date.now() < bis && !beendet) {
      /* Jede HTTP-Antwort zählt (ein Server mit absichtlich kaputter Ablage
         antwortet 503); dass es der EIGENE Server ist, belegt die Logzeile. */
      if (log.includes("läuft auf Port") && await fetch(`${basis}/gesund`).then(() => true).catch(() => false))
        return { kind, port, basis, log: () => log };
      await new Promise((w) => setTimeout(w, 100));
    }
    if (!beendet) {
      kind.kill("SIGKILL");
      await new Promise((r) => kind.once("exit", r));
    }
    throw new Error(`Server kam nicht hoch (Port ${port}):\n${log}`);
  });
}
