
/* ==========================================================================
   RECHENKERN — DRITTE AUSBAUSTUFE
   Teilzeit in der Rotation · Springerpool · Standortbezogene Feiertage ·
   Bewertungsfaktor für Rufbereitschaft · Personalimport
   ========================================================================== */

/* --------------------- Standortbezogene Feiertage ------------------------ */
/** Bundesland einer Einheit — Betriebe mit mehreren Standorten rechnen sonst falsch. */
function landFuerEinheit(m, einheitId) {
  const e = m.einheiten.find((x) => x.id === einheitId);
  if (e && e.standortId && m.standorte) {
    const st = m.standorte.find((s) => s.id === e.standortId);
    if (st && st.bundesland) return st.bundesland;
  }
  return m.bundesland;
}
/** Feiertag aus Sicht einer bestimmten Person an einem Tag. */
function feiertagFuer(m, datum, p) {
  return feiertag(datum, p ? landFuerEinheit(m, einheitAm(p, datum)) : m.bundesland);
}
/** Alle im Betrieb vorkommenden Bundesländer. */
const laenderImBetrieb = (m) => [...new Set([m.bundesland, ...((m.standorte || []).map((s) => s.bundesland))])].filter(Boolean);

/* --------------------------- Teilzeit in der Rotation -------------------- */
/** Stabiler Streuwert je Person, damit Teilzeitkräfte nicht alle dieselben Tage haben. */
function idStreu(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}
/**
 * Wandelt den Gruppendienst in den tatsächlichen Teilzeitdienst um.
 * Zwei Betriebsarten:
 *   quote      — die Person leistet nur den ihrem Stundenanteil entsprechenden
 *                Teil der Zyklusdienste, gleichmäßig über den Zyklus verteilt.
 *   wochentage — die Person arbeitet nur an festgelegten Wochentagen.
 * Ohne Teilzeit bleibt der Dienst unverändert.
 */
function teilzeitDienst(m, p, datum, plan) {
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv || !plan) return plan;
  if (tz.modus === "wochentage") return (tz.wochentage || []).includes(dow(datum)) ? plan : null;

  const soll = m.einstellungen.sollWochenstunden || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  if (quote >= 0.999) return plan;

  const len = zyklusLaenge(m);
  const e = m.einheiten.find((x) => x.id === einheitAm(p, datum));
  if (!e) return plan;

  // Fortlaufende Nummer dieses Dienstes seit dem Ankerdatum — nicht nur innerhalb
  // eines Zyklus. Nur so lässt sich ein Anteil wie 50 % exakt einhalten:
  // 21 Dienste je Zyklus sind nicht halbierbar, über mehrere Zyklen aber schon.
  const tage = between(m.anker, datum) + versatzTageVon(e);
  const zyklen = Math.floor(tage / len);
  const rest = ((tage % len) + len) % len;
  let gesamt = 0;
  for (const t of m.zyklus.tage) if (t && t !== "-") gesamt++;
  if (!gesamt) return plan;
  let vor = 0;
  for (let i = 0; i < rest; i++) { const t = m.zyklus.tage[i]; if (t && t !== "-") vor++; }
  const nr = zyklen * gesamt + vor;

  const versatz = (idStreu(p.id) % 997) / 997;
  return Math.floor((nr + 1 + versatz) * quote) > Math.floor((nr + versatz) * quote) ? plan : null;
}

/** Wie viele Dienste je Zyklus leistet die Person tatsächlich? */
function teilzeitProfil(m, p) {
  const gesamt = m.zyklus.tage.filter((t) => t && t !== "-").length;
  const soll = m.einstellungen.sollWochenstunden || 40;
  const quote = Math.max(0.05, Math.min(1, (p.wochenstunden || soll) / soll));
  const tz = p.teilzeit;
  if (!tz || !tz.aktiv) return { teilzeit: false, quote: 1, dienste: gesamt, gesamt };
  if (tz.modus === "wochentage")
    return { teilzeit: true, modus: "wochentage", quote, gesamt,
      dienste: m.zyklus.tage.filter((t, i) => t && t !== "-" && (tz.wochentage || []).includes(i % 7)).length };
  return { teilzeit: true, modus: "quote", quote, gesamt, dienste: Math.round(gesamt * quote * 10) / 10 };
}

/* ------------------------------ Bewertungsfaktor ------------------------- */
/**
 * Rufbereitschaft wird nicht voll als Arbeitszeit gewertet.
 * Der Faktor einer Dienstart bestimmt, wie viel auf das Konto fließt.
 */
const gewertet = (da, std) => Math.round(std * (da.faktor === undefined ? 1 : da.faktor) * 100) / 100;

/* ------------------------------- Personalimport -------------------------- */
const IMPORT_SPALTEN = ["nachname", "vorname", "einheit", "funktion", "wochenstunden",
  "urlaubsanspruch", "eintritt", "rolle", "qualifikationen", "teilzeit"];
/** Zerlegt eingefügten Text in Zeilen und Felder. Erkennt Semikolon, Tabulator und Komma. */
function importParsen(text) {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim());
  if (!zeilen.length) return { kopf: [], daten: [], trenner: ";" };
  const kandidaten = [";", "\t", ","];
  const trenner = kandidaten.reduce((a, b) =>
    (zeilen[0].split(b).length > zeilen[0].split(a).length ? b : a), ";");
  const felder = (z) => z.split(trenner).map((x) => x.trim().replace(/^"|"$/g, ""));
  const kopf = felder(zeilen[0]);
  const daten = zeilen.slice(1).map(felder);
  return { kopf, daten, trenner };
}
/** Ordnet Spaltenüberschriften den bekannten Feldern zu. */
function importZuordnen(kopf) {
  const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß]/g, "");
  const muster = {
    nachname: ["nachname", "name", "familienname", "lastname"],
    vorname: ["vorname", "firstname", "rufname"],
    einheit: ["einheit", "gruppe", "team", "station", "wohnbereich", "schichtgruppe", "abteilung", "dienstgruppe"],
    funktion: ["funktion", "position", "taetigkeit", "stelle"],
    wochenstunden: ["wochenstunden", "stunden", "wochenarbeitszeit", "az"],
    urlaubsanspruch: ["urlaub", "urlaubsanspruch", "urlaubstage"],
    eintritt: ["eintritt", "eintrittsdatum", "beginn", "seit"],
    rolle: ["rolle", "zugang", "zugangsart", "berechtigung"],
    qualifikationen: ["qualifikation", "qualifikationen", "quali", "kenntnisse"],
    teilzeit: ["teilzeit", "tz"],
  };
  const zu = {};
  kopf.forEach((h, i) => {
    const n = norm(h);
    for (const [feld, liste] of Object.entries(muster))
      if (!zu[feld] && liste.some((x) => n === x || n.startsWith(x))) zu[feld] = i;
  });
  return zu;
}
/** Baut aus den Rohzeilen Personendatensätze und meldet, was fehlt. */
function importPruefen(m, kopf, daten, zu) {
  const rollen = ROLLEN.filter((r) => !r.extern).map((r) => r.id);
  const zeilen = daten.map((f, i) => {
    const hol = (k) => (zu[k] !== undefined ? (f[zu[k]] || "").trim() : "");
    const nachname = hol("nachname"), vorname = hol("vorname");
    const einheitName = hol("einheit");
    const einheit = m.einheiten.find((e) => e.name.toLowerCase() === einheitName.toLowerCase());
    const std = parseFloat((hol("wochenstunden") || "").replace(",", ".")) || m.einstellungen.sollWochenstunden;
    const rolleRoh = hol("rolle").toLowerCase();
    const rolleId = rollen.find((x) => x === rolleRoh)
      || (ROLLEN.find((x) => x.label.toLowerCase() === rolleRoh) || {}).id || "mitarbeiter";
    const qualNamen = hol("qualifikationen").split(/[,/|]/).map((x) => x.trim()).filter(Boolean);
    const quals = qualNamen.map((q) => (m.qualifikationen.find((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()) || {}).id).filter(Boolean);
    const fehlendeQuals = qualNamen.filter((q) => !m.qualifikationen.some((x) =>
      x.name.toLowerCase() === q.toLowerCase() || x.kurz.toLowerCase() === q.toLowerCase()));
    const eintritt = (() => {
      const roh = hol("eintritt");
      if (/^\d{4}-\d{2}-\d{2}$/.test(roh)) return roh;
      const de = roh.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (de) return `${de[3]}-${pad(Number(de[2]))}-${pad(Number(de[1]))}`;
      return heute();
    })();
    const tzRoh = hol("teilzeit").toLowerCase();
    const teilzeit = (tzRoh === "ja" || tzRoh === "x" || tzRoh === "1" || std < (m.einstellungen.sollWochenstunden || 40) - .1)
      ? { aktiv: true, modus: "quote", wochentage: [0, 1, 2, 3, 4] } : null;
    const fehler = [];
    if (!nachname) fehler.push("Nachname fehlt");
    if (!vorname) fehler.push("Vorname fehlt");
    if (einheitName && !einheit) fehler.push(`Einheit „${einheitName}" unbekannt`);
    if (!einheitName) fehler.push("Einheit fehlt");
    const doppelt = m.personen.some((p) => p.nachname.toLowerCase() === nachname.toLowerCase()
      && p.vorname.toLowerCase() === vorname.toLowerCase());
    return { nr: i + 1, nachname, vorname, einheitName, einheitId: einheit ? einheit.id : null,
      funktion: hol("funktion") || "Fachkraft", wochenstunden: std,
      urlaubsanspruch: parseInt(hol("urlaubsanspruch"), 10) || 30, eintritt, rolle: rolleId,
      qualifikationen: quals, fehlendeQuals, teilzeit, fehler, doppelt, ok: fehler.length === 0 };
  });
  return { zeilen, gut: zeilen.filter((z) => z.ok).length, fehlerhaft: zeilen.filter((z) => !z.ok).length,
    doppelt: zeilen.filter((z) => z.doppelt).length,
    neueEinheiten: [...new Set(zeilen.filter((z) => z.einheitName && !z.einheitId).map((z) => z.einheitName))],
    neueQuals: [...new Set(zeilen.flatMap((z) => z.fehlendeQuals))] };
}
const IMPORT_BEISPIEL = `Nachname;Vorname;Einheit;Funktion;Wochenstunden;Urlaub;Eintritt;Rolle;Qualifikationen;Teilzeit
Meier;Sabine;Schichtgruppe 1;Fachkraft;41;30;01.03.2021;mitarbeiter;SK,EH;
Yildiz;Kerem;Schichtgruppe 2;Schichtleitung;41;30;15.08.2019;subplaner;SK,SL;
Novak;Petra;Schichtgruppe 1;Fachkraft;20,5;30;01.02.2024;mitarbeiter;SK;ja`;
