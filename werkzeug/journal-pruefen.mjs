#!/usr/bin/env node
/* ==========================================================================
   JOURNAL-PRÜFEN — liegengebliebene Schreibjournale finden und beiseitelegen

   Jeder Schreibvorgang auf einen Bestand wird zuerst als journal:<raum> in
   die Ablage geschrieben (server/lib/bestand.mjs, „Das Schreibjournal").
   Liegt nach einem Absturz ein gültiges Journal, schreibt der nächste
   Schreibvorgang es zu Ende — dafür braucht es kein Werkzeug.

   Ein BESCHÄDIGTES Journal dagegen (falsche Prüfsumme, unlesbar) sperrt
   den Raum: Kein Leser und kein Schreiber kann entscheiden, ob der Stand
   auf der Platte alt, neu oder halb ist, und alle bekommen 503. Das ist
   Absicht — lieber kein Stand als ein falscher. Aufheben kann das nur ein
   Mensch, und zwar mit diesem Werkzeug:

     node werkzeug/journal-pruefen.mjs [--daten /data]                   Trockenlauf
     node werkzeug/journal-pruefen.mjs [--daten /data] --beiseitelegen [raum …]

   Ohne --beiseitelegen wird nur berichtet, nichts verändert. Mit
   --beiseitelegen wird jedes beschädigte Journal beiseitegelegt als
   journal-beiseite:<raum>:<zeit> (Rohbytes unverändert darin, werkzeug/ablage-
   pruefen.mjs, beiseiteSicher) — verloren geht nichts. Danach gilt der
   Stand auf der Platte; der nächste Schreibvorgang gleicht Kern, Zeiger und
   Vermerk daraus an (bestand.mjs, Wiederanlauf). Weil ein beschädigtes
   Journal nach einem Abbruch mitten im Schreiben liegen kann, KANN dieser
   Stand gemischt sein: Nach dem Beiseitelegen den Raum fachlich prüfen
   (Leitung: letzte Änderungen ansehen), im Zweifel eine Sicherung
   zurückspielen.

   Das Werkzeug belegt dafür die Ablage wie der Server (CENTRIC_DATEN/.prozess,
   server/lib/prozesssperre.mjs): Läuft der Server, verweigert es die Arbeit.
   Erst den Server anhalten.

   Rückgabewert: 0 — nichts Beschädigtes (mehr) da; 1 — Trockenlauf hat
   beschädigte Journale gefunden; 2 — Fehler (z. B. Server läuft).
   ========================================================================== */

import path from "node:path";

const argumente = process.argv.slice(2);
const wert = (name) => { const i = argumente.indexOf(name); return i >= 0 ? argumente[i + 1] : null; };
const daten = wert("--daten");
if (daten) process.env.CENTRIC_DATEN = daten;
process.env.CENTRIC_ABLAGE = process.env.CENTRIC_ABLAGE || "dateien";
const beiseitelegen = argumente.includes("--beiseitelegen");
const raeume = argumente.filter((a, i) => !a.startsWith("--") && argumente[i - 1] !== "--daten");

const { getStore, ablageWurzel, dateiname } = await import("../server/lib/ablage.mjs");
/* Beiseitelegen wie werkzeug/ablage-pruefen.mjs: Rohbytes in einen gültigen
   Eintrag gepackt statt umbenannt — eine umbenannte kaputte Datei brächte
   sonst jede folgende Sicherung (ablage-sicherung.mjs) zum Abbruch. */
const { beiseiteSicher } = await import("./ablage-pruefen.mjs");
const { journalPruefen, bestandLesenStreng } = await import("../server/lib/bestand.mjs");
const { ablageBelegen, VERALTET_MS } = await import("../server/lib/prozesssperre.mjs");

const wurzel = ablageWurzel();
/* Mit Puls wie der Server (siehe ablage-pruefen.mjs): Ein Server, der
   währenddessen startet, sieht die Sperre vorrücken und bleibt draußen.
   Eine fremde, frische Sperre heißt hier „belegt" — ohne Wartezeit. */
let verloren = null;
const sperre = await ablageBelegen(wurzel, { puls: true, wartenMs: 0, verloren: (g) => { verloren = g; } });
if (!sperre.ok) {
  console.error(`${sperre.grund} Erst den Server anhalten — das Werkzeug arbeitet nur auf einer ruhenden Ablage. `
    + `Gehört die Sperre einem gerade gestoppten Container, ${Math.round(VERALTET_MS / 1000)} Sekunden warten und erneut aufrufen.`);
  process.exit(2);
}

let beschaedigt = 0;
let fehler = 0;
try {
  const store = getStore({ name: "centric", consistency: "strong" });
  const { blobs } = await store.list({ prefix: "journal:" });
  const gefunden = blobs.map((b) => b.key.slice("journal:".length))
    .filter((r) => !raeume.length || raeume.includes(r));
  if (!gefunden.length) console.log("Keine Schreibjournale in der Ablage.");

  for (const raum of gefunden) {
    const p = await journalPruefen(store, raum);
    if (p.zustand === "gueltig") {
      console.log(`${raum}: gültiges Journal (${p.schritte} Schritte) — wird beim nächsten Schreiben zu Ende geführt.`);
      continue;
    }
    if (p.zustand !== "beschaedigt") continue;
    beschaedigt += 1;
    console.log(`${raum}: Journal beschädigt — ${p.grund}`);
    if (!beiseitelegen) { console.log(`  Trockenlauf: nichts verändert. Mit --beiseitelegen ${raum} beiseitelegen.`); continue; }

    if (verloren) throw new Error(`Prozesssperre verloren (${verloren}) — abgebrochen`);
    const ziel = `journal-beiseite:${raum}:${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const ordner = path.join(wurzel, "centric");
    await beiseiteSicher(store, ordner, dateiname, `journal:${raum}`, ziel, p.grund);
    console.log(`  beiseitegelegt als ${ziel}`);
    try {
      const g = await bestandLesenStreng(store, raum);
      console.log(`  Stand auf der Platte lesbar (Stand ${g ? g.stand : "—"}). Bitte fachlich prüfen.`);
      beschaedigt -= 1;
    } catch (e) {
      fehler += 1;
      console.error(`  Stand auf der Platte weiterhin nicht lesbar: ${String((e && e.message) || e).slice(0, 200)}`);
    }
  }
} catch (e) {
  fehler += 1;
  console.error(`Fehler: ${String((e && e.message) || e).slice(0, 300)}`);
} finally {
  await sperre.freigeben();
}
process.exit(fehler ? 2 : beschaedigt ? 1 : 0);
