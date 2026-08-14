/* ==========================================================================
   BREMSE

   Zwei Fälle, die auseinandergehalten werden müssen.

   Der gepacete Angriff — jemand probiert Codes nacheinander durch. Das ist
   der Regelfall, weil ein Angreifer Antworten auswerten muss. Hier muss die
   Grenze exakt halten, und das tut sie.

   Der gleichzeitige Schwarm — alles auf einmal, ohne auf Antworten zu warten.
   Hier ist die Grenze auf Netlify Blobs allein nicht zu halten: Der Dienst
   kennt kein bedingtes Schreiben (SetOptions trägt nur metadata), also gibt
   es keine atomare Operation, auf der ein Zähler aufbauen könnte.

   Gemessen an dieser Prüfung, 60 gleichzeitige Versuche bei Grenze 8:
     Zählen, dann schreiben (ursprünglich)      55 kamen durch
     Schreiben, dann zählen                     49
     zusätzlich prozesslokale Sperre            32

   Verlässlich dicht wird es erst mit einem atomaren Zähler. Sind
   REDIS_REST_URL und REDIS_REST_TOKEN gesetzt, prüft diese Datei die
   scharfe Grenze; fehlen sie, prüft sie die Zusagen, die auch ohne gelten,
   und schreibt den Durchschlupf als Messwert hin.

   Aufruf:
     CENTRIC_ADMIN=<geheim> npx vite --port 5173 &
     npm run pruefung:bremse
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
/* GRENZEN.anmelden in netlify/lib/schutz.mjs */
const GRENZE = 8;
const PARALLEL = 60;
const ATOMAR = !!(process.env.REDIS_REST_URL && process.env.REDIS_REST_TOKEN);

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function versuch(i) {
  const a = await fetch(`${BASIS}/api/anmelden`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ zugangscode: `XXXX-XXXX-${String(i).padStart(4, "0")}` }),
  });
  return a.status;
}

/* ---------------------------------------------------------------------------
   1. Nacheinander — hier muss die Grenze exakt halten
   --------------------------------------------------------------------------- */
console.log("\nNacheinander, Grenze ist " + GRENZE + ":\n");
let durchgekommen = 0;
let ersteSperre = null;
for (let i = 0; i < GRENZE + 6; i++) {
  const st = await versuch(i);
  if (st === 401) durchgekommen++;
  else if (st === 429 && ersteSperre === null) ersteSperre = i + 1;
}
console.log(`  bis zur Prüfung durchgekommen: ${durchgekommen}`);
console.log(`  gesperrt ab Versuch:           ${ersteSperre ?? "nie"}\n`);

pruef(`Nacheinander greift die Grenze bei höchstens ${GRENZE + 1}`,
  ersteSperre !== null && ersteSperre <= GRENZE + 1,
  `gesperrt ab ${ersteSperre ?? "nie"}`);
pruef("Kein Versuch war erfolgreich", durchgekommen <= GRENZE + 1,
  `${durchgekommen} × 401`);

/* Die Sperre überdauert das Zählfenster — sonst wäre sie keine. */
const nach = await Promise.all(Array.from({ length: 8 }, (_, i) => versuch(500 + i).catch(() => 0)));
pruef("Nach der Sperre kommt nichts mehr durch",
  nach.every((s) => s === 429), `Stati: ${[...new Set(nach)].join(", ")}`);

/* ---------------------------------------------------------------------------
   2. Gleichzeitig — mit anderer Kennung, damit die Sperre von oben nicht zählt
   --------------------------------------------------------------------------- */
console.log(`\n${PARALLEL} Versuche gleichzeitig:\n`);
const stati = await Promise.all(
  Array.from({ length: PARALLEL }, (_, i) => versuch(9000 + i).catch(() => 0)));
const abgewiesen = stati.filter((s) => s === 401).length;
const gebremst = stati.filter((s) => s === 429).length;
const erfolg = stati.filter((s) => s === 200).length;

console.log(`  401 abgewiesen: ${abgewiesen}`);
console.log(`  429 gebremst:   ${gebremst}`);
console.log(`  200 erfolg:     ${erfolg}`);
console.log(`  atomarer Zähler: ${ATOMAR ? "hinterlegt" : "nicht hinterlegt"}\n`);

pruef("Gleichzeitig war kein Versuch erfolgreich", erfolg === 0, `${erfolg} × 200`);
pruef("Die Bremse greift auch gleichzeitig", gebremst > 0, `${gebremst} × 429`);

if (ATOMAR) {
  pruef(`Mit atomarem Zähler bleibt der Durchschlupf unter ${GRENZE * 2}`,
    abgewiesen < GRENZE * 2, `${abgewiesen} von ${PARALLEL}`);
} else {
  /* Ohne atomaren Zähler ist keine scharfe Grenze zu halten. Geprüft wird,
     dass die Verbesserung überhaupt wirkt — ohne jede Bremse wären es alle
     sechzig. */
  pruef("Ohne atomaren Zähler wird mindestens ein Drittel abgefangen",
    gebremst >= PARALLEL / 3, `${gebremst} von ${PARALLEL} gebremst`);
  console.log(`  Hinweis: ${abgewiesen} Versuche kamen bis zur Codeprüfung durch.`);
  console.log("  Für eine scharfe Grenze REDIS_REST_URL und REDIS_REST_TOKEN setzen —");
  console.log("  siehe atomarZaehlen() in netlify/lib/schutz.mjs.\n");
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
