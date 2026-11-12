/* ==========================================================================
   WP-28c — Schreib-Halt für die konsistente Sicherung unter Last

   Wegwerf-Daten in einem Temp-Verzeichnis, echte Ablage (server/lib/
   ablage.mjs), echte Raumsperre und echter Dateikanal. Geprüft:
   - Drain: eine laufende Zwei-Datei-Transaktion läuft zu Ende, neue warten
   - Wiedereintritt: Eine zugelassene Arbeit blockiert sich nie selbst
   - Frist: Der Halt endet immer; danach läuft alles weiter, und die
     Freigabe meldet ehrlich, dass er nicht mehr galt
   - Flüchtiges (Sitzungen, Bremse) und Lesen werden nie gehalten
   - Kanal: Anfrage, Bestätigung, Freigabe, Ablauf, veraltete Anfrage,
     Aufräumen beim Start; Obergrenze der Frist
   - Sicherung unter Last mit Halt: gelingt, nie mitten in einer Transaktion,
     Prüfung und Wiederherstellung byte-gleich
   ========================================================================== */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let basis;
let H; let A; let R; let G;
let store;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
/** QS-2: wartet auf eine Bedingung (Abfrage alle 10 ms) statt eine feste Zeit zu schlafen; Obergrenze nur als Notausgang. */
async function warteBis(bedingung, grenzeMs = 15000) {
  const bis = Date.now() + grenzeMs;
  for (;;) {
    if (await bedingung()) return true;
    if (Date.now() >= bis) return false;
    await warte(10);
  }
}

beforeAll(async () => {
  basis = await mkdtemp(path.join(tmpdir(), "wp28c-"));
  process.env.CENTRIC_DATEN = path.join(basis, "daten");
  process.env.CENTRIC_ZUSTAND = path.join(basis, "zustand");
  delete process.env.CENTRIC_SCHREIBHALT_MAX_MS;
  await mkdir(process.env.CENTRIC_DATEN, { recursive: true });
  H = await import("../server/lib/schreibhalt.mjs");
  A = await import("../server/lib/ablage.mjs");
  R = await import("../server/lib/raumsperre.mjs");
  G = await import("../werkzeug/ablage-sicherung.mjs");
  store = A.getStore("centric");
});
/** Eine noch laufende Last (Zeitüberschreitung eines Tests) darf nicht in den nächsten hineinschreiben. */
let laufendeLast = null;
afterEach(async () => {
  if (laufendeLast) { await laufendeLast.stopp(); laufendeLast = null; }
  await H.kanalStoppen();
  H._zuruecksetzen();
  delete process.env.CENTRIC_SCHREIBHALT_MAX_MS;
});
afterAll(async () => { await rm(basis, { recursive: true, force: true }); });

const lies = async (k) => (await store.get(k, { type: "json" }))?.gen ?? null;

describe("Einordnung: gehalten wird nur, was in die Sicherung gehört", () => {
  it("wirdGesichert stimmt mit STORES/gehoertInSicherung des Werkzeugs überein", () => {
    const faelle = [
      ["centric", "konto:x"], ["centric", "mitglied:a:b"], ["centric", "token:1"], ["centric", "tokencode:1"],
      ["centric", "zweifaktor-nachweis:1"], ["centric", "scherbe:raum:2026-08"],
      ["centric-sitzungen", "sk:1"], ["centric-sitzungen", "skw:1"], ["centric-sitzungen", "skraum:1"],
      ["centric-sitzungen", "t:1"], ["centric-sitzungen", "ta:1"], ["centric-sitzungen", "skbindung"],
      ["centric-spur", "2026-09-11/anmelden/abc"], ["centric-accountsitzungen", "s:1"], ["centric-takt", "b:1"],
    ];
    for (const [s, k] of faelle) {
      const werkzeug = G.gehoertInSicherung(`${s}/${A.dateiname(k)}`)
        && !(G.STORES[s].ohne || []).some((p) => k.startsWith(p));
      expect([s, k, H.wirdGesichert(s, k)]).toEqual([s, k, werkzeug]);
    }
    expect(Object.keys(G.STORES).sort()).toEqual(
      ["centric", "centric-accountsitzungen", "centric-sitzungen", "centric-spur", "centric-takt"]);
  });
});

describe("Halt im Prozess", () => {
  it("ohne laufende Vorgänge sofort bestätigt; neue Schreibvorgänge warten bis zur Freigabe, in Reihenfolge", async () => {
    const h = H.halten(2000);
    expect(await h.bereit).toBe(true);
    const reihenfolge = [];
    /* Reihenfolge des Beginns (das Ende hängt an der Platte). */
    const a = H.vorgang(() => { reihenfolge.push("a"); return store.setJSON("ordnung-a", { gen: 1 }); });
    const b = R.unterRaumsperre("raum-o", () => { reihenfolge.push("b"); return store.setJSON("ordnung-b", { gen: 1 }); });
    await warte(60);
    expect(reihenfolge).toEqual([]);
    expect(await lies("ordnung-a")).toBe(null);
    expect(H.haltZustand().wartend).toBe(2);
    expect(H.freigeben(h)).toBe(true);
    await Promise.all([a, b]);
    expect(reihenfolge).toEqual(["a", "b"]);
    expect([await lies("ordnung-a"), await lies("ordnung-b")]).toEqual([1, 1]);
  });

  it("Lesen und Flüchtiges (Sitzungen, Bremse, Token) werden nie gehalten", async () => {
    await store.setJSON("lesbar", { gen: 7 });
    const h = H.halten(2000);
    await h.bereit;
    expect(await lies("lesbar")).toBe(7);
    await A.getStore("centric-accountsitzungen").setJSON("s:1", { x: 1 });
    await A.getStore("centric-takt").setJSON("b:1", { x: 1 });
    await A.getStore("centric-sitzungen").setJSON("t:1", { x: 1 });
    await store.setJSON("token:1", { x: 1 });
    await A.getStore("centric-sitzungen").delete("t:1");
    expect(H.haltZustand().wartend).toBe(0);
    H.freigeben(h);
  });

  it("Drain: eine laufende Zwei-Datei-Transaktion läuft zu Ende, erst dann ist der Halt bestätigt", async () => {
    await store.setJSON("drain-konto", { gen: 1 });
    await store.setJSON("drain-mitglied", { gen: 1 });
    let mitte = () => {};
    const inDerMitte = new Promise((r) => { mitte = r; });
    const t = R.unterRaumsperre("raum-d", async () => {
      await store.setJSON("drain-konto", { gen: 2 });
      mitte();
      await warte(80);
      await store.setJSON("drain-mitglied", { gen: 2 });
    });
    await inDerMitte;
    const h = H.halten(8000);       // QS-3: Drain-Grenze = Viertel der Frist (2 s), gross genug gegen CI-Last
    let bestaetigt = false;
    h.bereit.then(() => { bestaetigt = true; });
    await warte(20);
    expect(bestaetigt).toBe(false);                    // Transaktion läuft noch
    const neu = store.setJSON("drain-neu", { gen: 1 });
    expect(await h.bereit).toBe(true);
    await t;
    /* Im bestätigten Halt: beide Dateien neu, die neue Schreibung noch nicht. */
    expect([await lies("drain-konto"), await lies("drain-mitglied"), await lies("drain-neu")]).toEqual([2, 2, null]);
    H.freigeben(h);
    await neu;
    expect(await lies("drain-neu")).toBe(1);
  });

  it("Wiedereintritt: verschachtelte Raumsperre, Reihe und Ablage in einer zugelassenen Arbeit laufen im Halt weiter", async () => {
    let weiter = () => {};
    const tor = new Promise((r) => { weiter = r; });
    let drin = () => {};
    const zugelassen = new Promise((r) => { drin = r; });
    const t = R.unterRaumsperre("raum-r1", async () => {
      drin();                                            // QS-3: die Arbeit ist nachweislich zugelassen (statt 5 ms zu schlafen)
      await tor;                                         // der Halt beginnt, während diese Arbeit zugelassen ist
      await store.setJSON("re-1", { gen: 1 });
      await R.unterRaumsperre("raum-r1", () => store.setJSON("re-2", { gen: 1 }));   // Wiedereintritt derselben Sperre
      await R.unterRaumsperre("raum-r2", () => store.setJSON("re-3", { gen: 1 }));   // andere Sperre, verschachtelt
      await H.vorgang(() => store.delete("re-1"));
      return "fertig";
    });
    await zugelassen;
    const h = H.halten(8000);
    weiter();
    expect(await t).toBe("fertig");
    expect(await h.bereit).toBe(true);
    expect([await lies("re-1"), await lies("re-2"), await lies("re-3")]).toEqual([null, 1, 1]);
    H.freigeben(h);
  });

  it("Ein Hintergrundvorgang, der nach dem Ende seiner Arbeit schreibt, wird wieder gehalten", async () => {
    /** @type {Promise<any>|null} */
    let spaeter = null;
    /* QS-3: Der Hintergrundvorgang startet erst, wenn der Halt bestaetigt ist (Tor), nicht nach 40 ms Schlaf: unter Last
       lief er sonst schon vor dem Halt los und schrieb zu frueh. */
    let los = () => {};
    const tor = new Promise((r) => { los = r; });
    await R.unterRaumsperre("raum-h", async () => {
      spaeter = tor.then(() => store.setJSON("hinten", { gen: 1 }));
    });
    const h = H.halten(2000);
    expect(await h.bereit).toBe(true);
    los();
    expect(await warteBis(() => H.haltZustand().wartend === 1)).toBe(true);   // gehalten, nicht geschrieben
    await warte(80);
    expect(await lies("hinten")).toBe(null);
    H.freigeben(h);
    await spaeter;
    expect(await lies("hinten")).toBe(1);
  });

  it("Frist läuft ab: Schreiber laufen danach weiter, die Freigabe meldet false; hängende Arbeit verhindert nur die Bestätigung", async () => {
    let los = () => {};
    const haengt = R.unterRaumsperre("raum-f", () => new Promise((r) => { los = r; }));
    const h = H.halten(120);
    const w = store.setJSON("frist-neu", { gen: 1 });
    expect(await h.bereit).toBe(false);                // nie bestätigt
    await w;                                           // nach der Frist geschrieben, ohne Fehler
    expect(await lies("frist-neu")).toBe(1);
    expect(H.freigeben(h)).toBe(false);
    expect(h.ende).toBe("abgelaufen");
    los();
    await haengt;
  });

  it("Drain-Grenze: hängt ein Vorgang, endet der Halt nach einem Viertel der Frist, nicht erst mit ihr", async () => {
    let los = () => {};
    const haengt = R.unterRaumsperre("raum-dg", () => new Promise((r) => { los = r; }));
    const h = H.halten(2000);
    expect(await h.bereit).toBe(false);
    expect(h.ende).toBe("abgelaufen");
    expect(h.dauerMs).toBeLessThan(1500);
    los();
    await haengt;
  });

  it("Token- und Zwei-Faktor-Reihen werden im Halt nur verzögert: nach Freigabe bzw. Frist laufen sie durch", async () => {
    const T = await import("../server/lib/token.mjs");
    const Z = await import("../server/lib/zweifaktor.mjs");
    process.env.CENTRIC_PFEFFER = process.env.CENTRIC_PFEFFER || "pruef-pfeffer-nur-fuer-tests-0123456789";
    let h = H.halten(2000);
    await h.bereit;
    let fertig = false;
    const t = T.tokenEinloesen(store, "x".repeat(40), { zweck: "einladung" }).then((r) => { fertig = true; return r; });
    await warte(60);
    expect(fertig).toBe(false);                        // verzögert, nicht abgewiesen
    H.freigeben(h);
    expect((await t).eintrag).toBe(null);
    H._zuruecksetzen();
    h = H.halten(150);                                 // diesmal ohne Freigabe: die Frist löst
    await h.bereit;
    const z = await Z.zweifaktorBeginnen(store, "konto-halt", "halt@example.invalid");
    expect(h.ende).toBe("abgelaufen");
    expect(z && !z.fehler).toBe(true);
  });

  it("Obergrenze: höchstens CENTRIC_SCHREIBHALT_MAX_MS, nie über 10 s; 0 schaltet ab; Pause nach jedem Halt", async () => {
    let h = H.halten(600_000);
    expect(h.fristMs).toBe(H.HALT_VORGABE_MS);
    H.freigeben(h); H._zuruecksetzen();
    process.env.CENTRIC_SCHREIBHALT_MAX_MS = "999999";
    h = H.halten(600_000);
    expect(h.fristMs).toBe(H.HALT_HART_MS);
    H.freigeben(h); H._zuruecksetzen();
    process.env.CENTRIC_SCHREIBHALT_MAX_MS = "0x10";
    expect(H.haltObergrenze()).toBe(H.HALT_VORGABE_MS);
    process.env.CENTRIC_SCHREIBHALT_MAX_MS = "0";
    expect(H.halten(1000)).toBe(null);
    expect((await H.kanalStarten({ verzeichnis: path.join(basis, "aus") })).ok).toBe(false);
    delete process.env.CENTRIC_SCHREIBHALT_MAX_MS;
    /* Pause: so lang wie der letzte Halt. */
    h = H.halten(1000);
    await warte(60);
    H.freigeben(h);
    expect(H.halten(1000)).toBe(null);
    /* QS-3: Die Pause ist so lang wie der letzte Halt (unter Last auch deutlich laenger als 60 ms): auf das Pausenende
       warten statt 80 ms zu schlafen. */
    let h2 = null;
    expect(await warteBis(() => { h2 = H.halten(1000); return h2 !== null; })).toBe(true);
    H.freigeben(h2);
  });

  it("/gesund bleibt unberührt: Raumsperre gesund, kein Schreibstopp während des Halts", async () => {
    const h = H.halten(1000);
    await h.bereit;
    const z = R.sperrZustand();
    expect(z.gesund).toBe(true);
    expect(z.gestoppt).toBe(null);
    H.freigeben(h);
    const gesundQuelle = await readFile(path.join(__dirname, "..", "server", "lib", "gesund.mjs"), "utf8");
    expect(gesundQuelle).not.toMatch(/schreibhalt/);
  });
});

describe("Dateikanal (Zustandsverzeichnis, kein Netz)", () => {
  const verz = () => path.join(process.env.CENTRIC_ZUSTAND, H.HALT_ORDNER);

  it("Anfrage → gehalten → Schreiber wartet → Freigabe → freigegeben", async () => {
    expect((await H.kanalStarten({ verzeichnis: verz(), taktMs: 10, protokoll: () => {} })).ok).toBe(true);
    const h = await H.haltAnfordern(verz(), { warteMs: 2000 });
    expect(h.gehalten).toBe(true);
    const w = store.setJSON("kanal-1", { gen: 1 });
    expect(await warteBis(() => H.haltZustand().wartend === 1)).toBe(true);   // QS-3: wartet nachweislich
    await warte(50);
    expect(await lies("kanal-1")).toBe(null);
    expect(await h.freigeben()).toBe(true);
    await w;
    expect(await lies("kanal-1")).toBe(1);
    expect((await readdir(verz())).filter((n) => n !== H.ANTWORT)).toEqual([]);
  });

  it("Frist abgelaufen vor der Freigabe: freigeben() ist false, der Server schreibt weiter", async () => {
    await H.kanalStarten({ verzeichnis: verz(), taktMs: 10, protokoll: () => {} });
    /* QS-2: Die Frist muss deutlich länger sein als der Handshake (Anfrage -> Takt -> Antwort -> Lesen). Mit 80 ms
       lief die Frist unter CI-Last schon ab, bevor der Client „gehalten“ las (h.gehalten war dann false). Statt
       fest zu schlafen, wird auf das tatsächliche Fristende gewartet. */
    const h = await H.haltAnfordern(verz(), { fristMs: 1500, warteMs: 10000 });
    expect(h.gehalten).toBe(true);
    expect(await warteBis(() => !H.haltZustand().gehalten)).toBe(true);   // die Frist ist abgelaufen, der Server schreibt wieder
    await store.setJSON("kanal-2", { gen: 1 });
    expect(await h.freigeben()).toBe(false);
  });

  it("fremde Anfrage während des Halts: abgelehnt, Halt läuft weiter, die Freigabe gilt NICHT als bewiesen", async () => {
    await H.kanalStarten({ verzeichnis: verz(), taktMs: 10, protokoll: () => {} });
    const h = await H.haltAnfordern(verz(), { warteMs: 2000 });
    expect(h.gehalten).toBe(true);
    const fremd = "c".repeat(32);
    await writeFile(path.join(verz(), H.ANFRAGE), JSON.stringify({ fassung: 1, token: fremd, fristMs: 1000, erstellt: new Date().toISOString() }));
    /* QS-2: auf die Ablehnung warten statt 400 ms zu schlafen */
    const antwortLesen = async () => { try { return JSON.parse(await readFile(path.join(verz(), H.ANTWORT), "utf8")); } catch { return null; } };
    expect(await warteBis(async () => (await antwortLesen())?.token === fremd)).toBe(true);
    expect(H.haltZustand().gehalten).toBe(true);                               // nicht freigegeben
    const antwort = await antwortLesen();
    expect([antwort.token, antwort.stand]).toEqual([fremd, "abgelehnt"]);
    expect(await h.freigeben()).toBe(false);                                   // löscht und bekommt „ersetzt“
    expect(H.haltZustand().gehalten).toBe(false);
  });

  it.skipIf(process.platform === "win32")("Anfrage nicht lesbar (Link, ELOOP): kein Freigeben, danach nicht bewiesen", async () => {
    const { symlink } = await import("node:fs/promises");
    const meldungen = [];
    await H.kanalStarten({ verzeichnis: verz(), taktMs: 10, protokoll: (m) => meldungen.push(m) });
    const h = await H.haltAnfordern(verz(), { fristMs: 8000, warteMs: 10000 });
    expect(h.gehalten).toBe(true);
    const ziel = path.join(basis, "link-ziel.json");
    await writeFile(ziel, "{}");
    /* QS-3: Der Link ersetzt die Anfrage in einem Schritt (Umbenennen). Vorher: rm, dann symlink: in der Luecke sah der
       Kanal (Takt 10 ms) „Anfrage fehlt“ und gab frei (Freigabe „geloescht“) — unter CI-Last war die Luecke gross genug.
       Statt 400 ms zu schlafen, wird auf die Meldung des Kanals gewartet. */
    const tmpLink = path.join(verz(), `link-${process.pid}.tmp`);
    await symlink(ziel, tmpLink);
    await rename(tmpLink, path.join(verz(), H.ANFRAGE));
    expect(await warteBis(() => meldungen.some((m) => /nicht lesbar/.test(m)))).toBe(true);
    expect(H.haltZustand().gehalten).toBe(true);
    expect(await h.freigeben()).toBe(false);
  });

  it("veraltete oder kaputte Anfrage wird abgelehnt; Reste beim Start werden weggeräumt; keine Antwort ohne Server", async () => {
    await mkdir(verz(), { recursive: true });
    await writeFile(path.join(verz(), H.ANFRAGE), JSON.stringify({ fassung: 1, token: "a".repeat(32), fristMs: 1000,
      erstellt: new Date().toISOString() }));
    await H.kanalStarten({ verzeichnis: verz(), taktMs: 10, protokoll: () => {} });
    expect((await readdir(verz())).includes(H.ANFRAGE)).toBe(false);          // kein Halt über einen Neustart
    await writeFile(path.join(verz(), H.ANFRAGE), JSON.stringify({ fassung: 1, token: "b".repeat(32), fristMs: 1000,
      erstellt: new Date(Date.now() - 60_000).toISOString() }));
    /* QS-3: auf die Ablehnung warten statt 400 ms zu schlafen */
    const antwortLesen = async () => { try { return JSON.parse(await readFile(path.join(verz(), H.ANTWORT), "utf8")); } catch { return null; } };
    expect(await warteBis(async () => (await antwortLesen())?.token === "b".repeat(32))).toBe(true);
    const antwort = await antwortLesen();
    expect([antwort.token, antwort.stand]).toEqual(["b".repeat(32), "abgelehnt"]);
    expect(H.haltZustand().gehalten).toBe(false);
    await rm(path.join(verz(), H.ANFRAGE), { force: true });
    await writeFile(path.join(verz(), H.ANFRAGE), "x".repeat(5000));
    await warte(400);
    expect(H.haltZustand().gehalten).toBe(false);
    await H.kanalStoppen();
    await rm(path.join(verz(), H.ANFRAGE), { force: true });
    const ohne = await H.haltAnfordern(verz(), { warteMs: 150 });
    expect([ohne.gehalten, ohne.keinServer]).toEqual([false, true]);
    expect((await readdir(verz())).includes(H.ANFRAGE)).toBe(false);          // Anfrage zurückgenommen
  });
});
