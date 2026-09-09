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
/* Herkunftsadresse für die Bremse — wie in den anderen Prüfläufen. Ohne
   sie zählen alle Läufe von einem Rechner auf dieselbe Kennung. */
const HERKUNFT = process.env.CENTRIC_HERKUNFT || null;
const herkunft = () => (HERKUNFT ? { "x-forwarded-for": HERKUNFT } : {});

/** Legt einen Zugang an und gibt den Code zurück. */
async function zugang(rolle, person) {
  const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
    headers: { "content-type": "application/json", ...herkunft() },
    body: JSON.stringify({ verwaltung: GEHEIM, name: "Probebetrieb", bestand: RAUM,
      rolle, person, betrieb: 0 }) });
  const d = await a.json();
  if (!d.zugangscode) throw new Error(`Zugang ${rolle} nicht angelegt: ${JSON.stringify(d)}`);
  return d.zugangscode;
}

/* Die Rolle kommt aus der Person im Betrieb (siehe wirksameRolle) — der
   Betriebsratscode gehört deshalb zu Person 2, die dort Betriebsrat ist. */
const CODES = {
  leitung: await zugang("leitung", null),
  betriebsrat: await zugang("betriebsrat", 2),
  mitarbeiter: await zugang("mitarbeiter", 0),
};

const anmelden = async (code) => {
  const a = await fetch(`${BASIS}/api/anmelden`, { method: "POST",
    headers: { "content-type": "application/json", ...herkunft() }, body: JSON.stringify({ zugangscode: code }) });
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
      { id: 2, vorname: "Britta", nachname: "Rat", rolle: "betriebsrat", bereich: "e1",
        email: "britta@probe.de", wochenstunden: 20 },
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

  /* Anträge fremder Bereiche entscheidet die Leitung. */
  const rL4 = await lies(tL);
  const bL4 = JSON.parse(JSON.stringify(rL4.bestand));
  bL4.mandanten[0].anfragen = [...(bL4.mandanten[0].anfragen || []),
    { id: "s4-fremd", personId: "p2", art: "urlaub", von: "2026-11-20", bis: "2026-11-20", status: "offen" },
    { id: "s4-eigen", personId: "p1", art: "urlaub", von: "2026-11-21", bis: "2026-11-21", status: "offen" }];
  await schreib(tL, bL4, rL4.etag);
  const r4 = await lies(tSub);
  const g = JSON.parse(JSON.stringify(r4.bestand));
  g.mandanten[0].anfragen = g.mandanten[0].anfragen.map((a) => a.id === "s4-fremd" ? { ...a, status: "genehmigt" } : a);
  const wFremdA = await schreib(tSub, g, r4.etag);
  pruef("Einen Antrag aus dem fremden Bereich darf sie nicht entscheiden", wFremdA.status === 403,
    `Status ${wFremdA.status} — ${wFremdA.text || ""}`);
  const r5 = await lies(tSub);
  const h = JSON.parse(JSON.stringify(r5.bestand));
  h.mandanten[0].anfragen = h.mandanten[0].anfragen.map((a) => a.id === "s4-eigen" ? { ...a, status: "genehmigt" } : a);
  const wEigenA = await schreib(tSub, h, r5.etag);
  pruef("Einen Antrag aus dem eigenen Bereich schon", wEigenA.status === 200,
    `Status ${wEigenA.status} — ${wEigenA.text || ""}`);
}

/* --- S5: Beschäftigte schreiben nur ihre eigenen Einträge ---

   Bis September 2026 nahm der Server die „eigenen Felder" im Ganzen an —
   ein Beschäftigten-Token konnte die Zeiterfassung jeder anderen Person
   überschreiben und fremde Anträge mit Status „genehmigt" anlegen. */
{
  const tM0 = await anmelden(await zugang("mitarbeiter", 0));
  const r = await lies(tM0);
  const b = JSON.parse(JSON.stringify(r.bestand));
  const m = b.mandanten[0];
  m.erfassung = { ...(m.erfassung || {}), "1|2026-12-01": { von: "06:00", bis: "23:00" },
    "0|2026-12-01": { von: "06:00", bis: "14:00" } };
  m.anfragen = [...(m.anfragen || []),
    { id: "s5-fremd", personId: 1, art: "urlaub", von: "2026-12-02", bis: "2026-12-02", status: "genehmigt" },
    { id: "s5-eigen", personId: 0, art: "urlaub", von: "2026-12-03", bis: "2026-12-03", status: "genehmigt" }];
  m.wuensche = [...(m.wuensche || []), { id: "s5-w1", personId: 1, datum: "2026-12-04", art: "moechte" },
    { id: "s5-w0", personId: 0, datum: "2026-12-04", art: "moechte" }];
  const w = await schreib(tM0, b, r.etag);
  pruef("Beschäftigte dürfen ihre eigenen Einträge schreiben", w.status === 200, `Status ${w.status}`);

  const n = (await lies(tL)).bestand.mandanten[0];
  pruef("Eigene Zeiterfassung ist gespeichert", !!(n.erfassung || {})["0|2026-12-01"]);
  pruef("Fremde Zeiterfassung ist nicht gespeichert", !(n.erfassung || {})["1|2026-12-01"]);
  pruef("Fremder Antrag ist verworfen", !(n.anfragen || []).some((a) => a.id === "s5-fremd"));
  const eigen = (n.anfragen || []).find((a) => a.id === "s5-eigen");
  pruef("Eigener Antrag ist angelegt", !!eigen);
  pruef("… aber nicht selbst genehmigt", eigen && eigen.status === "offen", eigen && eigen.status);
  pruef("Eigener Wunsch gespeichert, fremder nicht",
    (n.wuensche || []).some((x) => x.id === "s5-w0") && !(n.wuensche || []).some((x) => x.id === "s5-w1"));

  /* Bewerbung auf eine offene Schicht muss weiterhin ankommen. */
  const rL = await lies(tL);
  const bL = JSON.parse(JSON.stringify(rL.bestand));
  bL.mandanten[0].ausschreibungen = [{ id: "s5-as", datum: "2026-12-10", dienstId: "F", status: "offen", bewerbungen: [] }];
  await schreib(tL, bL, rL.etag);
  const r2 = await lies(tM0);
  const b2 = JSON.parse(JSON.stringify(r2.bestand));
  b2.mandanten[0].ausschreibungen = b2.mandanten[0].ausschreibungen.map((a) => a.id !== "s5-as" ? a
    : { ...a, status: "vergeben", bewerbungen: [{ personId: 0, zeit: "x" }, { personId: 1, zeit: "y" }] });
  const w2 = await schreib(tM0, b2, r2.etag);
  const as = ((await lies(tL)).bestand.mandanten[0].ausschreibungen || []).find((a) => a.id === "s5-as");
  pruef("Eigene Bewerbung kommt an", w2.status === 200 && as && as.bewerbungen.some((x) => x.personId === 0));
  pruef("Fremde Bewerbung und Status der Ausschreibung nicht",
    as && !as.bewerbungen.some((x) => x.personId === 1) && as.status === "offen", as && as.status);
}

/* --- S6: Die Person bestimmt die Rolle, nicht der Code --- */
{
  /* p2 ist im Betrieb „mitarbeiter" (Fixture aus S3). Ein Code „leitung"
     für sie gibt trotzdem nur den Umfang einer Beschäftigten. */
  const tX = await anmelden(await zugang("leitung", "p2"));
  const rX = await lies(tX);
  pruef(`Code „leitung" für eine beschäftigte Person: Rolle kommt aus dem Betrieb`,
    rX.rolle === "mitarbeiter" && rX.schreiben === "eigenes", `rolle=${rX.rolle} schreiben=${rX.schreiben}`);
  pruef("… und sieht keine privaten Felder anderer",
    !(rX.bestand.mandanten[0].personen.find((p) => p.id === "p1") || {}).anschrift);
  const bX = JSON.parse(JSON.stringify(rX.bestand));
  bX.mandanten[0].dienstarten = [...(bX.mandanten[0].dienstarten || []), { id: "S6", kurz: "S6" }];
  const wX = await schreib(tX, bX, rX.etag);
  const nachX = (await lies(tL)).bestand.mandanten[0].dienstarten || [];
  pruef("… und kann keine Dienstart anlegen", !nachX.some((d) => d.id === "S6"), `Status ${wX.status}`);
  const vX = await fetch(`${BASIS}/api/vollausgabe`, { headers: { authorization: `Bearer ${tX}` } });
  pruef("… und keine Vollausgabe ziehen", vX.status === 403, `Status ${vX.status}`);

  /* Ein Code ohne Person bleibt bei der Rolle des Codes. */
  const rL = await lies(tL);
  pruef(`Code „leitung" ohne Person bleibt Leitung`, rL.rolle === "leitung" && rL.schreiben === "voll");
}

/* --- S7: Beschäftigten-Codes brauchen eine Person --- */
{
  for (const rolle of ["mitarbeiter", "subplaner"]) {
    const a = await fetch(`${BASIS}/einrichten`, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verwaltung: GEHEIM, name: "Probebetrieb", bestand: RAUM, rolle, person: null, betrieb: 0 }) });
    const d = await a.json();
    pruef(`Code „${rolle}" ohne Person wird nicht ausgestellt`, a.status === 400 && !d.zugangscode, `Status ${a.status}`);
  }
}

/* Ein Betreiberzugang, den sich S8 und S9 teilen — jeder weitere
   Zugang zählt gegen die Bremse. */
let tBetreiber = null;

/* --- S8: Negativprüfungen aus der Sicherheitscheckliste ---

   Token-Manipulation, abgemeldete Sitzung, Rollen gegen Betreiber- und
   Leitungsendpunkte, Rumpfgrenzen, Löschkonzept. Jede geschlossene Lücke
   bekommt hier ihren Regressionstest. */
{
  const kopf = (t) => ({ authorization: `Bearer ${t}`, "content-type": "application/json" });
  const post = (pf, t, body) => fetch(`${BASIS}/api/${pf}`, { method: "POST", headers: kopf(t), body });

  const schrott = await fetch(`${BASIS}/api/bestand`, { headers: kopf("a".repeat(43)) });
  pruef("Erfundenes Sitzungsmerkmal wird abgewiesen", schrott.status === 401, `Status ${schrott.status}`);

  /* Ein früherer Block zieht alle Codes des Betriebs zurück — hier
     deshalb ein frischer. */
  const codeM8 = await zugang("mitarbeiter", 0);
  const tAb = await anmelden(codeM8);
  await post("abmelden", tAb, "{}");
  const nachAb = await fetch(`${BASIS}/api/bestand`, { headers: kopf(tAb) });
  pruef("Nach dem Abmelden ist das Merkmal wertlos", nachAb.status === 401, `Status ${nachAb.status}`);

  const tM8 = await anmelden(codeM8);
  for (const [pf, body] of [["zugaenge", '{"bestand":"x","eintraege":[{"rolle":"leitung"}]}'],
    ["bestand-anlegen", '{"bestand":"x","inhalt":{"mandanten":[]}}'],
    ["raum-loeschen", '{"bestand":"probe2","bestaetigung":"probe2"}'],
    ["wiederherstellen", '{"marke":"2026-01-01-00-00-00"}'],
    ["sicherungsschluessel", '{"tage":30}'],
    ["zugang-sperren", '{"alleDesBetriebs":true}']]) {
    const a = await post(pf, tM8, body);
    pruef(`Beschäftigte gegen /api/${pf}: abgewiesen`, a.status === 403, `Status ${a.status}`);
  }
  const tL8 = tL;
  for (const pf of ["zugaenge", "bestand-anlegen", "raum-loeschen"]) {
    const a = await post(pf, tL8, '{"bestand":"probe2","bestaetigung":"probe2","eintraege":[],"inhalt":{}}');
    pruef(`Leitung gegen Betreiberendpunkt /api/${pf}: abgewiesen`, a.status === 403, `Status ${a.status}`);
  }

  const kaputt = await post("bestand", tL8, "{ dies ist kein json");
  pruef("Kaputtes JSON gibt 400, keinen Serverfehler", kaputt.status === 400, `Status ${kaputt.status}`);
  const riesig = await fetch(`${BASIS}/api/bestand`, { method: "PUT", headers: kopf(tL8),
    body: JSON.stringify({ bestand: { notiz: "x".repeat(6 * 1024 * 1024 + 10) }, etag: null }) });
  pruef("Ein Rumpf über sechs Megabyte gibt 413", riesig.status === 413, `Status ${riesig.status}`);

  /* Löschkonzept: Ein Betreiber löscht einen Raum vollständig. */
  const tBetr = await anmelden(await zugang("betreiber", null));
  tBetreiber = tBetr;
  const raum = `probe-loesch-${Date.now().toString(36)}`;
  const anlegen = await post("bestand-anlegen", tBetr, JSON.stringify({ bestand: raum,
    inhalt: { version: 5, stand: 1, mandanten: [{ id: "m1", name: "Wegwerf", personen: [], dienstarten: [], einheiten: [] }] } }));
  pruef("Betreiber legt einen Wegwerfraum an", anlegen.status === 200, `Status ${anlegen.status}`);
  const ohne = await post("raum-loeschen", tBetr, JSON.stringify({ bestand: raum }));
  pruef("Löschen ohne wiederholten Namen wird abgewiesen", ohne.status === 400, `Status ${ohne.status}`);
  const eigen = await post("raum-loeschen", tBetr, JSON.stringify({ bestand: "probe2", bestaetigung: "probe2" }));
  pruef("Der eigene Raum lässt sich nicht löschen", eigen.status === 400, `Status ${eigen.status}`);
  const weg = await post("raum-loeschen", tBetr, JSON.stringify({ bestand: raum, bestaetigung: raum }));
  const wegD = await weg.json().catch(() => ({}));
  pruef("Wegwerfraum gelöscht", weg.status === 200 && wegD.geloescht >= 1, `Status ${weg.status}, ${wegD.geloescht} Einträge`);
  const wieder = await post("bestand-anlegen", tBetr, JSON.stringify({ bestand: raum,
    inhalt: { version: 5, stand: 1, mandanten: [{ id: "m1", name: "Wegwerf", personen: [], dienstarten: [], einheiten: [] }] } }));
  pruef("Danach ist der Raum frei", wieder.status === 200, `Status ${wieder.status}`);
  await post("raum-loeschen", tBetr, JSON.stringify({ bestand: raum, bestaetigung: raum }));
}

/* --- S10: Die eigene Person pflegen, aber nicht befördern ---

   Bis September 2026 kam an der eigenen Person alles durch, was nicht
   ausdrücklich ausgeschlossen war — auch Qualifikationen und deren
   Nachweise. Damit ließ sich das Qualifikations-Gate aushebeln, an dem
   die ganze Anwendung hängt. */
{
  /* Der Grundbestand wurde von S3 ersetzt; dort ist p2 die beschäftigte
     Person. Über sie läuft dieser Block. */
  const tM10 = await anmelden(await zugang("mitarbeiter", "p2"));
  const r = await lies(tM10);
  const b = JSON.parse(JSON.stringify(r.bestand));
  b.mandanten[0].personen = b.mandanten[0].personen.map((p) => (p.id !== "p2" ? p : {
    ...p,
    telefon: "0170 123456",
    verfuegbarkeit: { mo: true },
    qualifikationen: ["q1", "q2"],
    qualNachweise: [{ qualId: "q1", ablauf: "2099-12-31", datei: "selbst.pdf" }],
    einschraenkungen: { keineNacht: false },
    personalnummer: "GEFAELSCHT",
    funktion: "Pflegedienstleitung",
  }));
  const w = await schreib(tM10, b, r.etag);
  pruef("Beschäftigte dürfen ihre eigene Person schreiben", w.status === 200, `Status ${w.status}`);

  const nach = (await lies(tL)).bestand.mandanten[0].personen.find((p) => p.id === "p2");
  pruef("Telefonnummer kommt an", nach.telefon === "0170 123456", nach.telefon);
  pruef("Verfügbarkeit kommt an", !!nach.verfuegbarkeit);
  pruef("Qualifikationen kann sich niemand selbst eintragen",
    !(nach.qualifikationen || []).includes("q1"), JSON.stringify(nach.qualifikationen));
  pruef("Nachweise auch nicht", !(nach.qualNachweise || []).length,
    JSON.stringify(nach.qualNachweise));
  pruef("Einschränkungen bleiben Sache des Betriebs",
    JSON.stringify(nach.einschraenkungen || {}) !== JSON.stringify({ keineNacht: false })
    || nach.einschraenkungen === undefined, JSON.stringify(nach.einschraenkungen));
  pruef("Personalnummer und Funktion bleiben unangetastet",
    nach.personalnummer !== "GEFAELSCHT" && nach.funktion !== "Pflegedienstleitung",
    `${nach.personalnummer} / ${nach.funktion}`);
}

/* --- S9: Herkunft, Grenzen, Protokoll ---

   Aus dem Master-Handbuch: Origin-Prüfung für zustandsändernde Anfragen
   (CSRF), harte Obergrenzen gegen Datenwucher, und ein Protokoll, das
   beantwortet, wer etwas getan hat. */
{
  const kopf = (t, mehr = {}) => ({ authorization: `Bearer ${t}`,
    "content-type": "application/json", ...herkunft(), ...mehr });
  const tL9 = await anmelden(CODES.leitung);
  const r9 = await lies(tL9);

  const fremd = await fetch(`${BASIS}/api/bestand`, { method: "PUT",
    headers: kopf(tL9, { origin: "https://boeser-nachbar.example" }),
    body: JSON.stringify({ bestand: r9.bestand, etag: r9.etag, durch: "Test" }) });
  pruef("Schreiben mit fremdem Origin wird abgewiesen", fremd.status === 403, `Status ${fremd.status}`);

  const eigenerOrigin = new URL(BASIS).origin;
  const eigen = await fetch(`${BASIS}/api/bestand`, { method: "PUT",
    headers: kopf(tL9, { origin: eigenerOrigin }),
    body: JSON.stringify({ bestand: r9.bestand, etag: r9.etag, durch: "Test" }) });
  pruef("Schreiben mit eigenem Origin geht durch", eigen.status === 200, `Status ${eigen.status}`);

  const lesenFremd = await fetch(`${BASIS}/api/bestand`,
    { headers: kopf(tL9, { origin: "https://boeser-nachbar.example" }) });
  pruef("Lesen bleibt vom Origin unberührt", lesenFremd.status === 200, `Status ${lesenFremd.status}`);

  /* Obergrenzen: ein uferloses Feld und eine uferlose Liste. */
  const r10 = await lies(tL9);
  const lang = JSON.parse(JSON.stringify(r10.bestand));
  lang.mandanten[0].notizen = "x".repeat(150_000);
  const wLang = await schreib(tL9, lang, r10.etag);
  pruef("Ein Feld mit 150.000 Zeichen wird abgewiesen", wLang.status === 422, `Status ${wLang.status}`);

  const r11 = await lies(tL9);
  const viele = JSON.parse(JSON.stringify(r11.bestand));
  viele.mandanten[0].dienstarten = Array.from({ length: 501 },
    (_, i) => ({ id: `d${i}`, name: `D${i}`, kurz: "D" }));
  const wViele = await schreib(tL9, viele, r11.etag);
  pruef("501 Dienstarten werden abgewiesen", wViele.status === 422, `Status ${wViele.status}`);

  const r12 = await lies(tL9);
  const knapp = JSON.parse(JSON.stringify(r12.bestand));
  knapp.mandanten[0].notizen = "x".repeat(50_000);
  const wKnapp = await schreib(tL9, knapp, r12.etag);
  pruef("Ein Feld unter der Grenze geht durch", wKnapp.status === 200, `Status ${wKnapp.status}`);

  /* Protokoll: Wer war es, auf welchem Weg? */
  const tBetr9 = tBetreiber;
  const lage = await fetch(`${BASIS}/lage?tage=1`, { headers: kopf(tBetr9) })
    .then((a) => a.json()).catch(() => ({}));
  const schreibzeilen = (lage.letzte || []).filter((z) => z.art === "schreiben");
  pruef("Das Protokoll führt Schreibvorgänge", schreibzeilen.length > 0, `${schreibzeilen.length} Zeilen`);
  pruef("… mit Rolle und Weg", schreibzeilen.some((z) => z.rolle && z.weg === "bestand"),
    JSON.stringify(schreibzeilen[0] || {}).slice(0, 160));
  pruef("… und ohne Zugangscode oder Merkmal im Klartext",
    !JSON.stringify(lage.letzte || []).includes(tL9)
    && !JSON.stringify(lage.letzte || []).includes(CODES.leitung));
}

const bestanden = ergebnisse.filter((r) => r.ok).length;
console.log(`\n${bestanden} von ${ergebnisse.length} Prüfungen bestanden.`);
if (bestanden !== ergebnisse.length) {
  console.log("Fehlgeschlagen:");
  for (const r of ergebnisse.filter((x) => !x.ok)) console.log(`  - ${r.name} (${r.detail})`);
  process.exit(1);
}
