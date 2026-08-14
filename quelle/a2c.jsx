
/* ==========================================================================
   RECHENKERN — ZWEITE AUSBAUSTUFE
   Zuschläge · Freizeitausgleich · Kapazitätsvorschau · Jahresurlaubsrunde ·
   Planungsassistent · Eskalation bei Unterdeckung · Datenschutzbetrieb
   ========================================================================== */

/* ------------------------------- Zuschläge ------------------------------- */
/**
 * Zerlegt einen Dienst in Kalendertage und ordnet die Stunden zu.
 * Ein Nachtdienst von Samstag 21:30 bis Sonntag 07:15 zählt anteilig
 * als Samstags- und als Sonntagsarbeit.
 */
function tagesanteile(datum, da) {
  const s = toMin(da.start);
  let e = toMin(da.ende);
  if (e <= s) e += 1440;
  const out = [];
  const ersterTeil = Math.min(e, 1440) - s;
  if (ersterTeil > 0) out.push({ datum, minuten: ersterTeil });
  if (e > 1440) out.push({ datum: addDays(datum, 1), minuten: e - 1440 });
  return out;
}
/** Zuschlagsrelevante Stunden einer Person in einem Monat. */
function zuschlagStunden(m, p, ym) {
  return memo(m, `zus|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number);
    const n = dim_(y, mo - 1);
    const r = { nacht: 0, sonntag: 0, feiertag: 0, samstag: 0, gesamt: 0 };
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      if (!da) continue;
      const gearbeitet = istDauer(m, p, d, da).std;
      r.gesamt += gearbeitet;
      r.nacht += nachtAnteil(da);
      for (const teil of tagesanteile(d, da)) {
        const std = teil.minuten / 60;
        const w = dow(teil.datum);
        if (feiertagFuer(m, teil.datum, p)) r.feiertag += std;
        else if (w === 6) r.sonntag += std;
        else if (w === 5) r.samstag += std;
      }
    }
    for (const k of Object.keys(r)) r[k] = Math.round(r[k] * 100) / 100;
    return r;
  });
}
/**
 * Bewertet die Zuschläge in Ausgleichsstunden.
 * Bewusst ohne Entgelt: Löhne gehören in die Lohnabrechnung, nicht in die Planung.
 * Ausgegeben wird, was die Lohnstelle braucht — Stunden je Zuschlagsart.
 */
function zuschlagWert(m, p, ym) {
  const std = zuschlagStunden(m, p, ym);
  const zeilen = (m.zuschlaege || []).filter((z) => z.aktiv).map((z) => {
    const h = std[z.art] || 0;
    return { regel: z, stunden: Math.round(h * 100) / 100,
      wert: Math.round(h * z.prozent / 100 * 100) / 100 };
  });
  return { std, zeilen, summe: Math.round(zeilen.reduce((a, l) => a + l.wert, 0) * 100) / 100 };
}

/* --------------------------- Freizeitausgleich --------------------------- */
/** Wie viele Freischichten baut das Konto bis auf die Zielgröße ab? */
function ausgleichBedarf(m, p, ym) {
  const kto = stundenkonto(m, p, ym);
  const grenze = m.einstellungen.ausgleichGrenze || 40;
  if (kto <= 0) return { kto, grenze, ueber: 0, schichten: 0, faellig: false };
  const mittel = m.dienstarten.filter((d) => !d.posten).reduce((a, d) => a + dauer(d), 0)
    / Math.max(1, m.dienstarten.filter((d) => !d.posten).length);
  return { kto, grenze, ueber: Math.round(Math.max(0, kto - grenze) * 10) / 10,
    schichten: Math.ceil(kto / Math.max(1, mittel)), faellig: kto > grenze, mittel };
}
/** Nächste geplante Diensttage, die sich als Freischicht eignen. */
function ausgleichTage(m, p, ab, anzahl = 10) {
  const out = [];
  for (let i = 0; i < 120 && out.length < anzahl; i++) {
    const d = addDays(ab, i);
    const t = personTag(m, p, d);
    if (!t.dienstId || t.abwesenheit) continue;
    const b = besetzung(m, d)[t.dienstId];
    out.push({ datum: d, dienstId: t.dienstId, puffer: b.diff, moeglich: b.diff > 0 });
  }
  return out;
}

/* --------------------------- Kapazitätsvorschau -------------------------- */
/**
 * Beantwortet die Frage, die vor jeder Genehmigung steht:
 * Wenn ich die offenen Anträge bewillige — trage ich die kommenden Wochen noch?
 */
function vorschau(m, wochen = 8) {
  return memo(m, `vor|${wochen}`, () => {
    const start = montag(heute());
    const offen = m.anfragen.filter((a) => a.status === "offen" && a.typ === "abwesenheit");
    const mitAntraegen = { ...m, abwesenheiten: [...m.abwesenheiten,
      ...offen.map((a) => ({ id: `p_${a.id}`, personId: a.personId, art: a.art, von: a.von, bis: a.bis, notiz: "beantragt" }))] };
    const out = [];
    for (let w = 0; w < wochen; w++) {
      const von = addDays(start, w * 7), bis = addDays(von, 6);
      const jetzt = pruefen(m, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const dann = pruefen(mitAntraegen, von, bis).filter((x) => x.art === "besetzung" || x.art === "qualifikation");
      const betroffen = offen.filter((a) => a.von <= bis && a.bis >= von);
      out.push({ kw: w, von, bis, jetzt: jetzt.length, dann: dann.length,
        neu: Math.max(0, dann.length - jetzt.length), antraege: betroffen.length,
        status: dann.length > jetzt.length ? "danger" : jetzt.length ? "warn" : "ok" });
    }
    return { wochen: out, offen };
  });
}

/* --------------------------- Jahresurlaubsrunde -------------------------- */
/** Überschneidungen der Wünsche je Einheit und Tag — Grundlage der Entscheidung. */
function urlaubskonflikte(m) {
  const r = m.urlaubsrunde;
  if (!r) return [];
  const proTag = {};
  for (const w of r.wuensche) {
    if (w.status === "abgelehnt") continue;
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    for (let d = w.von; d <= w.bis; d = addDays(d, 1)) {
      const eid = einheitAm(p, d) || "?";
      const k = `${eid}|${d}`;
      (proTag[k] = proTag[k] || []).push(w);
    }
  }
  const out = [];
  for (const [k, liste] of Object.entries(proTag)) {
    const [eid, d] = k.split("|");
    const grenze = (r.kontingent && r.kontingent[eid]) || m.einstellungen.maxUrlaubJeEinheit;
    if (liste.length > grenze) out.push({ einheitId: eid, datum: d, anzahl: liste.length, grenze, wuensche: liste });
  }
  out.sort((a, b) => (a.datum < b.datum ? -1 : 1));
  return out;
}
/**
 * Vorrangregel: wer im Vorjahr zurückstecken musste, kommt zuerst.
 * Danach die niedrigere selbstvergebene Priorität, danach das ältere Eingangsdatum.
 */
function urlaubsRang(m, w) {
  const p = m.personen.find((x) => x.id === w.personId);
  const zurueck = ((m.urlaubsrunde && m.urlaubsrunde.vorjahrZurueck) || []).includes(w.personId) ? 0 : 1;
  return [zurueck, w.prio || 3, w.erstellt || "", p ? p.nachname : ""];
}

/* --------------------------- Planungsassistent --------------------------- */
/**
 * Füllt offene Stellen eines Monats automatisch.
 * Nutzt dieselbe Bewertung wie die Ersatzsuche und meldet, was offen bleibt.
 * Rechnet mit vorab ermittelten Konten, sonst wäre der Durchlauf zu langsam.
 */
function planeMonat(m, ym, grenzen = {}) {
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const maxProPerson = grenzen.maxProPerson || 3;
  const ctx = { konten: new Map(), einspruenge: {}, nachtAnzahl: new Map() };
  const jahr = Number(ym.slice(0, 4));
  for (const p of m.personen) {
    ctx.konten.set(p.id, stundenkonto(m, p, ym));
    ctx.nachtAnzahl.set(p.id, nachtJahr(m, p, jahr).anzahl);
  }
  for (const e of m.einspruenge || []) ctx.einspruenge[e.personId] = (ctx.einspruenge[e.personId] || 0) + 1;
  const werte = [...ctx.konten.values()].sort((a, b) => a - b);
  ctx.median = werte.length ? werte[Math.floor(werte.length / 2)] : 0;
  ctx.mittelEinspruenge = m.personen.length ? (m.einspruenge || []).length / m.personen.length : 0;
  const nw = [...ctx.nachtAnzahl.values()];
  ctx.nachtMittel = nw.length ? nw.reduce((a, b) => a + b, 0) / nw.length : 0;

  let arbeit = { ...m, abweichungen: { ...m.abweichungen } };
  const gesetzt = [];
  const offen = [];
  const jePerson = {};

  for (let i = 1; i <= n; i++) {
    const d = `${ym}-${pad(i)}`;
    for (const da of m.dienstarten) {
      let schutz = 0;
      while (schutz++ < 12) {
        const b = besetzung(arbeit, d)[da.id];
        if (b.diff >= 0 && !b.qualFehlt) break;
        const kand = ersatzVorschlaege(arbeit, d, da.id, ctx)
          .filter((x) => x.moeglich && (jePerson[x.person.id] || 0) < maxProPerson);
        if (!kand.length) {
          offen.push({ datum: d, dienstId: da.id, fehlt: Math.max(0, -b.diff), qualFehlt: b.qualFehlt });
          break;
        }
        const beste = kand[0];
        arbeit = { ...arbeit, abweichungen: { ...arbeit.abweichungen, [`${beste.person.id}|${d}`]: da.id } };
        jePerson[beste.person.id] = (jePerson[beste.person.id] || 0) + 1;
        gesetzt.push({ personId: beste.person.id, name: `${beste.person.vorname} ${beste.person.nachname}`,
          datum: d, dienstId: da.id, punkte: beste.punkte, grund: beste.gruende.slice(0, 2).join(" · ") });
      }
    }
  }
  return { gesetzt, offen, abweichungen: arbeit.abweichungen,
    betroffene: Object.keys(jePerson).length, ym };
}

/* ------------------- Eskalation bei nicht deckbarer Lücke ---------------- */
const unterschreitungAm = (m, d, dienstId) =>
  (m.unterschreitungen || []).find((u) => u.datum === d && u.dienstId === dienstId) || null;
/** Nachweisliste für Aufsicht und Personalvertretung. */
function unterschreitungsNachweis(m, von, bis) {
  const zeilen = [];
  for (let d = von; d <= bis; d = addDays(d, 1)) {
    const b = besetzung(m, d);
    for (const k of Object.keys(b)) {
      const e = b[k];
      if (e.diff >= 0 && !e.qualFehlt) continue;
      const u = unterschreitungAm(m, d, k);
      zeilen.push({ datum: d, dienst: e.da.name, ist: e.anzahl, soll: e.soll,
        qualFehlt: e.qualFehlt, dokumentiert: !!u, grund: u ? u.grund : "", durch: u ? u.durch : "" });
    }
  }
  return zeilen;
}

/* ---------------------------- Datenschutzbetrieb ------------------------- */
/** Auskunft nach Artikel 15 — alles, was zu einer Person gespeichert ist. */
function datenauskunft(m, personId) {
  const p = m.personen.find((x) => x.id === personId);
  if (!p) return "";
  const z = [];
  z.push(`Datenauskunft · ${m.name}`, `Erstellt am ${fDatum(heute())}`, "");
  z.push("STAMMDATEN");
  z.push(`Name: ${p.vorname} ${p.nachname}`, `E-Mail: ${p.email || "—"}`, `Funktion: ${p.funktion}`,
    `Zugangsart: ${rolle(p.rolle).label}`, `Eintritt: ${fDatum(p.eintritt)}`,
    `Austritt: ${p.austritt ? fDatum(p.austritt) : "—"}`,
    `Wochenstunden: ${n1(p.wochenstunden)}`, `Urlaubsanspruch: ${p.urlaubsanspruch} Tage`);
  z.push("", "ZUGEHÖRIGKEIT");
  p.zugehoerigkeit.forEach((x) => z.push(`  ab ${fDatum(x.ab)}: ${(m.einheiten.find((e) => e.id === x.einheitId) || {}).name || x.einheitId}`));
  z.push("", "QUALIFIKATIONEN");
  z.push("  " + (p.qualifikationen.map((q) => (m.qualifikationen.find((x) => x.id === q) || {}).name).filter(Boolean).join(", ") || "—"));
  const e = p.einschraenkungen || {};
  z.push("", "EINSATZEINSCHRÄNKUNGEN");
  z.push(`  keine Nachtdienste: ${e.keineNacht ? "ja" : "nein"}`,
    `  kein Alleindienst: ${e.keinAlleindienst ? "ja" : "nein"}`,
    `  Höchstzahl Dienste je Woche: ${e.maxDiensteWoche || "—"}`,
    `  Wiedereingliederung: ${e.wiedereingliederung ? `bis ${fDatum(e.wiedereingliederung.bis)}, ${n1(e.wiedereingliederung.maxStundenWoche)} h/Woche` : "—"}`);
  z.push("", "ABWESENHEITEN");
  const abw = m.abwesenheiten.filter((a) => a.personId === personId);
  abw.length ? abw.forEach((a) => z.push(`  ${abwArt(a.art).label}: ${fDatum(a.von)} bis ${fDatum(a.bis)}${a.notiz ? ` (${a.notiz})` : ""}`))
    : z.push("  —");
  z.push("", "ANTRÄGE");
  const anf = m.anfragen.filter((a) => a.personId === personId);
  anf.length ? anf.forEach((a) => z.push(`  ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fDatum(a.von)}–${fDatum(a.bis)} · ${a.status} · gestellt ${a.erstellt}`))
    : z.push("  —");
  z.push("", "PLANÄNDERUNGEN");
  const aen = (m.aenderungen || []).filter((a) => a.personId === personId).slice(0, 60);
  aen.length ? aen.forEach((a) => z.push(`  ${fDatum(a.datum)}: ${a.von} → ${a.nach} (Vorlauf ${a.vorlauf} Tage, erfasst ${a.zeit})`))
    : z.push("  —");
  z.push("", "ERFASSTE ZEITEN");
  const erf = Object.entries(m.erfassung || {}).filter(([k]) => k.startsWith(personId + "|"));
  erf.length ? erf.forEach(([k, v]) => z.push(`  ${fDatum(k.split("|")[1])}: ${v.start || "wie geplant"}–${v.ende || ""}${v.grund ? ` (${v.grund})` : ""}`))
    : z.push("  —");
  z.push("", "MITTEILUNGEN");
  const na = (m.nachrichten || []).filter((x) => x.personId === personId).slice(0, 40);
  na.length ? na.forEach((x) => z.push(`  ${x.zeit}: ${x.titel}`)) : z.push("  —");
  z.push("", `Aufbewahrungsfrist nach Austritt: ${m.einstellungen.aufbewahrungMonate || 24} Monate.`);
  return z.join("\n");
}
/** Wessen Daten dürfen nach Ablauf der Frist anonymisiert werden? */
function anonymisierbar(m) {
  const frist = m.einstellungen.aufbewahrungMonate || 24;
  return m.personen.filter((p) => {
    if (!p.austritt || p.anonym) return false;
    const d = pISO(p.austritt); d.setMonth(d.getMonth() + frist);
    return iso(d) <= heute();
  });
}

/* --------------------------- Konflikterkennung --------------------------- */
/**
 * Ohne Server gibt es keinen echten Mehrbenutzerbetrieb. Erkennbar ist aber,
 * ob der gespeicherte Bestand seit dem Laden von anderer Stelle verändert wurde.
 */
async function fremdstandPruefen(schluessel, eigenerStand) {
  try {
    const r = await window.storage.get(schluessel);
    if (!r || !r.value) return { konflikt: false };
    const fremd = JSON.parse(r.value);
    return { konflikt: typeof fremd.stand === "number" && fremd.stand > eigenerStand, fremdStand: fremd.stand };
  } catch (e) { return { konflikt: false }; }
}
