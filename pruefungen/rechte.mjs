/* ==========================================================================
   RECHTEPRÜFUNG

   Prüft die serverseitige Rechteschicht gegen einen laufenden Server. Bis
   August 2026 gab es keine Tests; angefangen wird an der Stelle, an der ein
   Fehler am teuersten ist.

   Aufruf:
     CENTRIC_ADMIN=<geheim> npx vite --port 5173 &
     npm run pruefung:rechte

   Der Server braucht CENTRIC_ADMIN, weil die Prüfung ihre Zugänge selbst
   anlegt. Sie schreibt in den Raum "probe2" — nicht gegen einen echten
   Betrieb laufen lassen.
   ========================================================================== */

const BASIS = process.env.CENTRIC_BASIS || "http://localhost:5173";
const GEHEIM = process.env.CENTRIC_ADMIN || "testgeheim";
const RAUM = "probe2";

/** Legt einen Zugang an und gibt den Code zurück. */
async function zugang(rolle, person) {
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Probebetrieb", bestand: RAUM,
      rolle, person, betrieb: 0 }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}

const CODES = {
  leitung: await zugang("leitung", null),
  betriebsrat: await zugang("betriebsrat", 0),
  mitarbeiter: await zugang("mitarbeiter", 0),
};

const anmelden = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ zugangscode: code }) });
  const d = await a.json();
  if (!d.token) throw new Error(`Anmeldung fehlgeschlagen: ${JSON.stringify(d)}`);
  return d.token;
};
const lies = async (t) => {
  const a = await fetch(`${BASIS}/api/bestand`, { headers: { authorization: `Bearer ${t}` } });
  return { status: a.status, ...(await a.json()) };
};
const schreib = async (t, bestand, etag) => {
  const a = await fetch(`${BASIS}/api/bestand`, { method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ bestand, etag, durch: "Test" }) });
  return { status: a.status, ...(await a.json()) };
};

const ergebnisse = [];
const pruef = (name, bedingung, detail) => {
  ergebnisse.push({ name, ok: !!bedingung, detail });
  console.log(`${bedingung ? "  BESTANDEN" : "  FEHLGESCHLAGEN"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/* --- Grundbestand als Leitung anlegen --- */
const tL = await anmelden(CODES.leitung);
const start = {
  version: 5, stand: 1,
  session: { mandantId: "m1", personId: 0, rolle: "kunde" },
  betreiber: { firma: "CENTRIC Software", iban: "DE00 1111 2222 3333" },
  rechnungen: [{ nr: "R-1", betrag: 199 }],
  tarife: [{ id: "pro", preis: 159 }],
  mandanten: [{
    id: "m1", name: "Probebetrieb", einheitLabel: "Wohnbereich",
    personen: [
      { id: 0, vorname: "Andrea", nachname: "Kern", rolle: "mitarbeiter", bereich: "e1",
        email: "andrea@probe.de", anschrift: "Musterweg 1", geburtstag: "1985-03-02",
        notfallkontakt: "Ehemann 0170-1234", wochenstunden: 38.5 },
      { id: 1, vorname: "Miriam", nachname: "Vogt", rolle: "mitarbeiter", bereich: "e1",
        email: "miriam@probe.de", anschrift: "Lindenallee 3", geburtstag: "1990-11-17",
        notfallkontakt: "Schwester 0171-9999", wochenstunden: 30 },
    ],
    abwesenheiten: [
      { id: "a1", personId: 1, art: "krank", von: "2026-08-10", bis: "2026-08-14",
        grund: "Bandscheibenvorfall", nachweis: "AU vom 10.08." },
    ],
    anfragen: [], erfassung: {}, nachrichten: [],
    dienstarten: [{ id: "F", name: "Früh", kurz: "F" }],
    einheiten: [{ id: "e1", name: "Wohnbereich 1" }],
  }],
};
const w0 = await schreib(tL, start, null);
pruef("Leitung darf schreiben", w0.status === 200, `Status ${w0.status}`);

/* --- Befund 1a: Betriebsrat darf nicht schreiben --- */
const tB = await anmelden(CODES.betriebsrat);
const rB = await lies(tB);
pruef("Betriebsrat darf lesen", rB.status === 200 && !!rB.bestand, `Status ${rB.status}`);
pruef("Server meldet Schreibumfang 'nein'", rB.schreiben === "nein", `schreiben=${rB.schreiben}`);
const wB = await schreib(tB, { ...rB.bestand, mandanten: [] }, rB.etag);
pruef("Betriebsrat kann den Betrieb NICHT leeren", wB.status === 403, `Status ${wB.status}`);

/* --- Befund 1b: der Klassiker — Bestand mit {} überschreiben --- */
const tM = await anmelden(CODES.mitarbeiter);
const rM = await lies(tM);
const wLeer = await schreib(tM, {}, rM.etag);
const nachLeer = await lies(tL);
pruef("Beschäftigte können den Betrieb NICHT leeren",
  Array.isArray(nachLeer.bestand.mandanten) && nachLeer.bestand.mandanten.length === 1,
  `mandanten=${(nachLeer.bestand.mandanten || []).length}, PUT-Status ${wLeer.status}`);

/* --- Befund 1c: Leseschutz für fremde Stammdaten --- */
const fremde = rM.bestand.mandanten[0].personen.find((p) => p.id === 1);
const eigene = rM.bestand.mandanten[0].personen.find((p) => p.id === 0);
pruef("Fremde Anschrift wird nicht ausgeliefert", fremde.anschrift === undefined,
  `anschrift=${JSON.stringify(fremde.anschrift)}`);
pruef("Fremdes Geburtsdatum wird nicht ausgeliefert", fremde.geburtstag === undefined);
pruef("Fremder Notfallkontakt wird nicht ausgeliefert", fremde.notfallkontakt === undefined);
pruef("Eigene Daten bleiben vollständig", eigene.anschrift === "Musterweg 1");
const abw = rM.bestand.mandanten[0].abwesenheiten[0];
pruef("Krankheitsgrund Dritter wird nicht ausgeliefert (Art. 9 DSGVO)",
  abw.grund === undefined && abw.nachweis === undefined && abw.art === "abwesend",
  `art=${abw.art}, grund=${JSON.stringify(abw.grund)}`);
pruef("Betreiberdaten verlassen den Server nicht",
  rM.bestand.betreiber === undefined && rM.bestand.rechnungen === undefined);

/* --- Befund 1d: Beschäftigte dürfen eigene Anträge stellen … --- */
const mitAntrag = JSON.parse(JSON.stringify(rM.bestand));
mitAntrag.mandanten[0].anfragen.push({ id: "an1", personId: 0, art: "urlaub", von: "2026-09-01" });
const wAntrag = await schreib(tM, mitAntrag, rM.etag);
const nachAntrag = await lies(tL);
pruef("Beschäftigte können einen eigenen Antrag stellen",
  wAntrag.status === 200 && nachAntrag.bestand.mandanten[0].anfragen.length === 1,
  `Status ${wAntrag.status}, Anträge ${nachAntrag.bestand.mandanten[0].anfragen.length}`);

/* --- … aber nicht sich selbst befördern oder Kollegen ändern --- */
const r2 = await lies(tM);
const boese = JSON.parse(JSON.stringify(r2.bestand));
boese.mandanten[0].personen = boese.mandanten[0].personen.map((p) =>
  p.id === 0 ? { ...p, rolle: "leitung", wochenstunden: 10 }
             : { ...p, nachname: "GEHACKT", email: "angreifer@example.com" });
boese.mandanten[0].dienstarten = [];
const wBoese = await schreib(tM, boese, r2.etag);
const danach = await lies(tL);
const mP = danach.bestand.mandanten[0];
pruef("Selbstbeförderung schlägt fehl", mP.personen[0].rolle === "mitarbeiter",
  `rolle=${mP.personen[0].rolle}`);
pruef("Eigene Wochenstunden bleiben unverändert", mP.personen[0].wochenstunden === 38.5,
  `wochenstunden=${mP.personen[0].wochenstunden}`);
pruef("Kollegin bleibt unverändert", mP.personen[1].nachname === "Vogt",
  `nachname=${mP.personen[1].nachname}`);
pruef("Kollegin behält ihre Adresse", mP.personen[1].email === "miriam@probe.de",
  `email=${mP.personen[1].email}`);
pruef("Krankheitsgrund wurde nicht durch das Lesen gelöscht",
  mP.abwesenheiten[0].grund === "Bandscheibenvorfall",
  `grund=${JSON.stringify(mP.abwesenheiten[0].grund)}`);
pruef("Dienstarten wurden nicht gelöscht", mP.dienstarten.length === 1,
  `dienstarten=${mP.dienstarten.length}`);
pruef("Betreiberdaten überlebten den Schreibvorgang",
  danach.bestand.betreiber && danach.bestand.betreiber.iban === "DE00 1111 2222 3333");

/* --- Befund 3: Zugang sperren --- */
const sperr = await fetch(`${BASIS}/api/zugang-sperren`, { method: "POST",
  headers: { authorization: `Bearer ${tL}`, "content-type": "application/json" },
  body: JSON.stringify({ code: CODES.mitarbeiter }) });
const sperrD = await sperr.json();
pruef("Leitung kann einen Zugang sperren", sperr.status === 200 && sperrD.gesperrt === 1,
  JSON.stringify(sperrD));
const nachSperre = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ zugangscode: CODES.mitarbeiter }) });
pruef("Gesperrter Code lässt keine Anmeldung mehr zu", nachSperre.status === 403,
  `Status ${nachSperre.status}`);
const altToken = await lies(tM);
pruef("Laufende Sitzung des gesperrten Zugangs ist beendet", altToken.status === 401,
  `Status ${altToken.status}`);
const sperrB = await fetch(`${BASIS}/api/zugang-sperren`, { method: "POST",
  headers: { authorization: `Bearer ${tB}`, "content-type": "application/json" },
  body: JSON.stringify({ code: CODES.leitung }) });
pruef("Betriebsrat darf keine Zugänge sperren", sperrB.status === 403, `Status ${sperrB.status}`);

/* --- Befund 2: Mailversand nur an eigene Belegschaft --- */
const send = await fetch(`${BASIS}/zustellung/senden`, { method: "POST",
  headers: { authorization: `Bearer ${tB}`, "content-type": "application/json" },
  body: JSON.stringify({ auftraege: [
    { id: "x1", personId: 0, betreff: "Intern", text: "Regulär" },
    { id: "x2", mail: "opfer@example.com", betreff: "Spam", text: "Fremd" },
    { id: "x3", personId: 999, betreff: "Spam", text: "Unbekannte Person" },
  ] }) });
const sendD = await send.json();
const z = Object.fromEntries((sendD.ergebnis || []).map((e) => [e.id, e]));
pruef("Eigene Belegschaft wird zugestellt", z.x1 && z.x1.mail === "trocken",
  `x1=${JSON.stringify(z.x1)}`);
pruef("Freie Adresse im Rumpf wird abgewiesen", z.x2 && z.x2.mail === "abgewiesen",
  `x2=${JSON.stringify(z.x2)}`);
pruef("Unbekannte personId wird abgewiesen", z.x3 && z.x3.mail === "abgewiesen",
  `x3=${JSON.stringify(z.x3)}`);



/* --- S1: Die Stempeluhr entscheidet auf dem Server --- */
{
  const tS = await anmelden(await zugang("mitarbeiter", 0));
  /* Standort für den Wohnbereich hinterlegen (als Leitung) */
  const rL2 = await lies(tL);
  const bb = JSON.parse(JSON.stringify(rL2.bestand));
  bb.mandanten[0].standorte = [{ id: "st1", name: "Haupthaus",
    lat: 50.1109, lon: 8.6821, radius: 150 }];
  bb.mandanten[0].einheiten = [{ id: "e1", name: "Wohnbereich 1", standortId: "st1" }];
  bb.mandanten[0].personen = bb.mandanten[0].personen.map((p) => p.id === 0
    ? { ...p, zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] } : p);
  await schreib(tL, bb, rL2.etag);

  const stempel = async (art, lat, lon) => {
    const a = await fetch(`${BASIS}/api/stempeln`, { method: "POST",
      headers: { authorization: `Bearer ${tS}`, "content-type": "application/json" },
      body: JSON.stringify({ datum: "2026-08-14", art, lat, lon }) });
    return { status: a.status, ...(await a.json()) };
  };

  const amOrt = await stempel("start", 50.1110, 8.6822);
  pruef("Am Einsatzort wird als innerhalb erkannt",
    amOrt.status === 200 && amOrt.innerhalb === true && amOrt.geprueft === true,
    JSON.stringify({ innerhalb: amOrt.innerhalb, ort: amOrt.ort }));

  const weitWeg = await stempel("ende", 52.5200, 13.4050);   // Berlin
  pruef("Weit entfernt wird als abweichend erkannt",
    weitWeg.status === 200 && weitWeg.innerhalb === false,
    JSON.stringify({ innerhalb: weitWeg.innerhalb, ort: weitWeg.ort }));

  /* Der eigentliche Punkt: Der Client kann das Urteil nicht mitliefern. */
  const gelogen = await fetch(`${BASIS}/api/stempeln`, { method: "POST",
    headers: { authorization: `Bearer ${tS}`, "content-type": "application/json" },
    body: JSON.stringify({ datum: "2026-08-15", art: "start",
      lat: 52.5200, lon: 13.4050, innerhalb: true, ort: "Am Einsatzort (0 m)" }) });
  const gelogenD = await gelogen.json();
  pruef("Ein mitgeschicktes Urteil wird ignoriert",
    gelogenD.innerhalb === false,
    `innerhalb=${gelogenD.innerhalb} trotz innerhalb:true im Rumpf`);

  /* Und die Zeit kommt vom Server, nicht vom Gerät. */
  pruef("Die Uhrzeit stammt vom Server",
    typeof amOrt.zeit === "string" && /^\d{2}:\d{2}$/.test(amOrt.zeit),
    `zeit=${amOrt.zeit}`);
}


/* ==========================================================================
   M1 — Monatsscherben am laufenden Dienst
   ========================================================================== */
{
  const raumBasis = { version: 6, stand: 1,
    session: { mandantId: "m1", personId: "p1", rolle: "kunde" },
    mandanten: [{ id: "m1", name: "Scherbentest", einheitLabel: "Wohnbereich",
      einheiten: [{ id: "e1", name: "WB 1" }, { id: "e2", name: "WB 2" }],
      dienstarten: [{ id: "F", kurz: "F" }, { id: "S", kurz: "S" }],
      personen: [
        { id: "p1", nachname: "Kern", rolle: "subplaner",
          zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e1" }] },
        { id: "p2", nachname: "Vogt", rolle: "mitarbeiter",
          zugehoerigkeit: [{ ab: "2020-01-01", einheitId: "e2" }] },
      ],
      abweichungen: {}, erfassung: {}, einstempeln: {},
      anfragen: [], nachrichten: [] }] };

  const tS1 = await anmelden(await zugang("leitung", null));
  const w = await schreib(tS1, raumBasis, null);
  pruef("Ein Bestand lässt sich zerlegt schreiben", w.status === 200, `Status ${w.status}`);

  const gelesen = await lies(tS1);
  pruef("Zerlegt geschrieben, vollständig gelesen",
    gelesen.status === 200 && gelesen.bestand.mandanten[0].personen.length === 2);
  pruef("Der Stand ist eine fortlaufende Zahl",
    /^\d+$/.test(String(gelesen.etag)), `etag=${gelesen.etag}`);

  /* --- Zwei Planer, zwei Monate: keine Kollision mehr --- */
  const standVorher = gelesen.etag;
  const planerA = JSON.parse(JSON.stringify(gelesen.bestand));
  planerA.mandanten[0].abweichungen["p1|2026-08-10"] = "F";
  const planerB = JSON.parse(JSON.stringify(gelesen.bestand));
  planerB.mandanten[0].abweichungen["p2|2026-09-15"] = "S";

  const wA = await schreib(tS1, planerA, standVorher);
  pruef("Planer A schreibt den August", wA.status === 200, `Status ${wA.status}`);

  /* Planer B schickt denselben, inzwischen veralteten Stand mit. */
  const wB = await schreib(tS1, planerB, standVorher);
  pruef("Planer B schreibt den September gegen einen veralteten Stand",
    wB.status === 200,
    wB.status === 200 ? "" : `Status ${wB.status} · Streit: ${JSON.stringify(wB.monate)}`
      + ` · Kern betroffen: ${wB.kernBetroffen}`);

  const danach2 = await lies(tS1);
  const abw = danach2.bestand.mandanten[0].abweichungen;
  pruef("Beide Eintragungen sind erhalten",
    abw["p1|2026-08-10"] === "F" && abw["p2|2026-09-15"] === "S",
    JSON.stringify(abw));

  /* --- Derselbe Monat bleibt ein Konflikt, mit Angabe des Monats --- */
  const standJetzt = danach2.etag;
  const c1 = JSON.parse(JSON.stringify(danach2.bestand));
  c1.mandanten[0].abweichungen["p1|2026-10-05"] = "F";
  await schreib(tS1, c1, standJetzt);
  const c2 = JSON.parse(JSON.stringify(danach2.bestand));
  c2.mandanten[0].abweichungen["p2|2026-10-06"] = "S";
  const wKonflikt = await schreib(tS1, c2, standJetzt);
  pruef("Derselbe Monat gibt weiterhin einen Konflikt",
    wKonflikt.status === 409, `Status ${wKonflikt.status}`);
  pruef("Die Konfliktmeldung nennt den Monat",
    Array.isArray(wKonflikt.monate) && wKonflikt.monate.includes("2026-10"),
    JSON.stringify(wKonflikt.monate));
}

/* --- S4: Die Schichtverantwortung schreibt nur den eigenen Bereich --- */
{
  const tSub = await anmelden(await zugang("subplaner", "p1"));
  const r = await lies(tSub);
  pruef("Schichtverantwortung darf lesen", r.status === 200, `Status ${r.status}`);

  /* Eigener Bereich: p1 gehört zu e1 */
  const eigen = JSON.parse(JSON.stringify(r.bestand));
  eigen.mandanten[0].abweichungen["p1|2026-11-03"] = "F";
  const wEigen = await schreib(tSub, eigen, r.etag);
  pruef("Im eigenen Bereich darf sie planen", wEigen.status === 200,
    `Status ${wEigen.status} ${wEigen.text || ""}`);

  /* Fremder Bereich: p2 gehört zu e2 */
  const r2b = await lies(tSub);
  const fremd = JSON.parse(JSON.stringify(r2b.bestand));
  fremd.mandanten[0].abweichungen["p2|2026-11-04"] = "S";
  const wFremd = await schreib(tSub, fremd, r2b.etag);
  pruef("Im fremden Bereich nicht", wFremd.status === 403,
    `Status ${wFremd.status} — ${wFremd.text || ""}`);

  /* Stammdaten sind der Leitung vorbehalten */
  const r3 = await lies(tSub);
  const stamm = JSON.parse(JSON.stringify(r3.bestand));
  stamm.mandanten[0].dienstarten.push({ id: "N", kurz: "N" });
  const wStamm = await schreib(tSub, stamm, r3.etag);
  pruef("Dienstarten darf sie nicht anlegen", wStamm.status === 403,
    `Status ${wStamm.status} — ${wStamm.text || ""}`);
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
