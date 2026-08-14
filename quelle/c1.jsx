
/* ==========================================================================
   RECHENKERN — SECHSTE AUSBAUSTUFE
   Planstand-Vergleich · Wunschdienste · Einarbeitung · Qualifikationsmatrix ·
   Kontoverlauf · Bereitschaft · Notizen
   ========================================================================== */

/* --------------------------- Planstand-Vergleich ------------------------- */
/**
 * Was hat sich seit der Freigabe geändert?
 * Beantwortet die häufigste Frage im Schichtbetrieb: „Ich hatte doch Frühdienst?"
 */
function planVergleich(m, ym) {
  const stand = (m.planstaende || {})[ym];
  if (!stand) return { hatStand: false, zeilen: [] };
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const nam = (id) => (!id || id === "-" ? "frei" : (map[id] || {}).name || id);
  const zeilen = [];
  for (const p of m.personen) {
    if (!imDienst(p, `${ym}-01`)) continue;
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`;
      const k = `${p.id}|${d}`;
      const damals = stand[k] !== undefined ? stand[k] : null;
      const jetztAb = m.abweichungen[k];
      const eid = einheitAm(p, d);
      const plan = eid && p.imSchichtdienst !== false ? einheitDienst(m, eid, d) : null;
      const alt = damals !== null ? damals : plan;
      const neu = jetztAb !== undefined ? jetztAb : plan;
      if ((alt || "-") === (neu || "-")) continue;
      zeilen.push({ person: p, datum: d, von: nam(alt), nach: nam(neu),
        vorlauf: between(heute(), d), richtung: !alt || alt === "-" ? "zusatz" : !neu || neu === "-" ? "entfall" : "wechsel" });
    }
  }
  zeilen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  return { hatStand: true, zeilen, zeit: (m.freigaben || {})[ym] ? m.freigaben[ym].zeit : null,
    zusatz: zeilen.filter((z) => z.richtung === "zusatz").length,
    entfall: zeilen.filter((z) => z.richtung === "entfall").length,
    wechsel: zeilen.filter((z) => z.richtung === "wechsel").length };
}
/** Abbild der Abweichungen zum Freigabezeitpunkt — Grundlage des Vergleichs. */
function planAbbild(m, ym) {
  const out = {};
  for (const k of Object.keys(m.abweichungen)) if (k.split("|")[1].startsWith(ym)) out[k] = m.abweichungen[k];
  return out;
}

/* ------------------------------ Wunschdienste ---------------------------- */
const WUNSCH_ARTEN = [
  { id: "moechte", label: "Möchte arbeiten", farbe: "#2E6B4F", zeichen: "+" },
  { id: "lieber_nicht", label: "Lieber nicht", farbe: "#8A5A00", zeichen: "−" },
];
const wunschAm = (m, pid, d) => (m.wuensche || []).find((w) => w.personId === pid && w.datum === d) || null;
/** Wie gut trifft der Plan die geäußerten Wünsche? */
function wunschErfuellung(m, ym) {
  const liste = (m.wuensche || []).filter((w) => w.datum.startsWith(ym));
  let erfuellt = 0;
  for (const w of liste) {
    const p = m.personen.find((x) => x.id === w.personId);
    if (!p) continue;
    const hat = !!personTag(m, p, w.datum).dienstId;
    if ((w.art === "moechte" && hat) || (w.art === "lieber_nicht" && !hat)) erfuellt++;
  }
  return { gesamt: liste.length, erfuellt, quote: liste.length ? Math.round((erfuellt / liste.length) * 100) : null };
}

/* ------------------------------- Einarbeitung ---------------------------- */
const einarbeitungAm = (m, pid, d) =>
  (m.einarbeitung || []).find((e) => e.personId === pid && e.von <= d && e.bis >= d) || null;
/**
 * Prüft, ob eine Person in Einarbeitung an ihrem Diensttag von der zugeordneten
 * Begleitung tatsächlich begleitet wird.
 */
function einarbeitungLage(m, von, bis) {
  const out = [];
  for (const e of m.einarbeitung || []) {
    const p = m.personen.find((x) => x.id === e.personId);
    const mentor = m.personen.find((x) => x.id === e.mentorId);
    if (!p) continue;
    let tage = 0, begleitet = 0, allein = [];
    for (let d = maxISO(e.von, von); d <= minISO(e.bis, bis); d = addDays(d, 1)) {
      const t = personTag(m, p, d);
      if (!t.dienstId) continue;
      tage++;
      const mt = mentor ? personTag(m, mentor, d) : null;
      if (mt && mt.dienstId === t.dienstId) begleitet++;
      else allein.push(d);
    }
    out.push({ ...e, person: p, mentor, tage, begleitet, allein,
      quote: tage ? Math.round((begleitet / tage) * 100) : null });
  }
  return out;
}
const maxISO = (a, b) => (a > b ? a : b);
const minISO = (a, b) => (a < b ? a : b);

/* --------------------------- Qualifikationsmatrix ------------------------ */
/**
 * Wer kann was — und wo hängt eine Qualifikation an zu wenigen Personen?
 * Der Engpass zeigt sich sonst erst bei der Krankmeldung.
 */
function qualMatrix(m) {
  return memo(m, "qmatrix", () => {
    const aktiv = m.personen.filter((p) => imDienst(p, heute()) && p.imSchichtdienst !== false);
    const spalten = m.qualifikationen.map((q) => {
      const traeger = aktiv.filter((p) => qualGueltig(m, p, q.id));
      const jeEinheit = {};
      for (const e of m.einheiten.filter((x) => !x.pool)) {
        jeEinheit[e.id] = traeger.filter((p) => einheitAm(p, heute()) === e.id).length;
      }
      // Höchster Bedarf dieser Qualifikation über alle Dienstarten
      const bedarf = Math.max(0, ...m.dienstarten.map((d) => (d.mindestQual || {})[q.id] || 0));
      const schwaechste = Object.entries(jeEinheit).sort((a, b) => a[1] - b[1])[0];
      return { qual: q, traeger, anzahl: traeger.length, jeEinheit, bedarf,
        engpass: bedarf > 0 && schwaechste && schwaechste[1] <= bedarf,
        kritisch: bedarf > 0 && schwaechste && schwaechste[1] < bedarf,
        schwaechsteEinheit: schwaechste ? m.einheiten.find((e) => e.id === schwaechste[0]) : null,
        schwaechsteAnzahl: schwaechste ? schwaechste[1] : 0 };
    });
    return { spalten, personen: aktiv,
      engpaesse: spalten.filter((s) => s.engpass).length,
      kritische: spalten.filter((s) => s.kritisch).length };
  });
}

/* ------------------------------- Kontoverlauf ---------------------------- */
/** Zwölf Monate Stundenkonto — die Frage ist nie der Stand, sondern die Richtung. */
function kontoVerlauf(m, p, bisYm, monate = 12) {
  const out = [];
  const [y, mo] = bisYm.split("-").map(Number);
  for (let i = monate - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), kto: stundenkonto(m, p, k),
      ist: istStunden(m, p, k).gesamt, soll: sollStunden(m, p, k) });
  }
  return out;
}
/** Besetzungsverlauf über einen Zeitraum — für das Balkendiagramm im Lagebild. */
function besetzungsVerlauf(m, ab, tage = 14) {
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const b = besetzung(m, d);
    let ist = 0, soll = 0, luecken = 0;
    for (const k of Object.keys(b)) {
      ist += b[k].anzahl; soll += b[k].soll;
      if (b[k].diff < 0) luecken += Math.abs(b[k].diff);
    }
    out.push({ datum: d, ist, soll, luecken, quote: soll ? Math.round((ist / soll) * 100) : 100 });
  }
  return out;
}
/** Nachweise nach Ablaufmonat — zeigt, wann eine Welle auf den Betrieb zukommt. */
function nachweisVerlauf(m, monate = 12) {
  const out = [];
  const h = heute();
  for (let i = 0; i < monate; i++) {
    const d = new Date(Number(h.slice(0, 4)), Number(h.slice(5, 7)) - 1 + i, 1);
    const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    let n = 0;
    for (const p of m.personen) {
      if (!imDienst(p, h)) continue;
      for (const x of p.qualNachweise || []) if (x.ablauf && x.ablauf.startsWith(k)) n++;
    }
    out.push({ ym: k, label: MON[d.getMonth()].slice(0, 3), anzahl: n });
  }
  return out;
}

/* --------------------------------- Notizen ------------------------------- */
const notizenZu = (m, schluessel) => ((m.notizen || {})[schluessel] || []);

/* ------------------------------- Bereitschaft ---------------------------- */
/** Wer ist wann in Rufbereitschaft — und wer ist Rückfallebene? */
function bereitschaftsplan(m, ab, tage = 14) {
  const rb = m.dienstarten.filter((d) => d.rufbereitschaft);
  if (!rb.length) return null;
  const out = [];
  for (let i = 0; i < tage; i++) {
    const d = addDays(ab, i);
    const eintraege = [];
    for (const da of rb) {
      const b = besetzung(m, d)[da.id];
      eintraege.push({ da, personen: b.personen, soll: b.soll });
    }
    out.push({ datum: d, eintraege, besetzt: eintraege.some((e) => e.personen.length > 0) });
  }
  return { dienstarten: rb, tage: out };
}

/* ------------------------- Suche für die Kommandoleiste ------------------ */
/**
 * Eine Suche über alles: Ansichten, Personen, Daten, Aktionen.
 * Bei vielen Ansichten ist Tippen schneller als Klicken.
 */
function kommandoSuche(sitz, nav, frage) {
  const m = sitz.mandant;
  const q = frage.trim().toLowerCase();
  const treffer = [];
  const passt = (t) => !q || String(t).toLowerCase().includes(q);

  for (const [id, label] of nav) if (passt(label))
    treffer.push({ art: "ansicht", id, titel: label, unter: "Ansicht öffnen", punkte: label.toLowerCase().startsWith(q) ? 100 : 60 });

  if (q.length >= 2 && darf(sitz, "staff.view")) {
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      const name = `${p.nachname}, ${p.vorname}`;
      if (!passt(name) && !passt(p.funktion)) continue;
      const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
      treffer.push({ art: "person", id: p.id, titel: name,
        unter: `${p.funktion}${e ? ` · ${e.name}` : ""}`,
        punkte: p.nachname.toLowerCase().startsWith(q) ? 90 : 50 });
    }
  }

  // Datumsangaben: 16.9. · 16.09.2026 · heute · morgen
  const dm = q.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?$/);
  if (dm) {
    const j = dm[3] || heute().slice(0, 4);
    const d = `${j}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    treffer.push({ art: "datum", id: d, titel: fLang(d), unter: "Tag öffnen", punkte: 95 });
  }
  if ("heute".startsWith(q) && q) treffer.push({ art: "datum", id: heute(), titel: `Heute · ${fLang(heute())}`, unter: "Tag öffnen", punkte: 80 });
  if ("morgen".startsWith(q) && q) treffer.push({ art: "datum", id: addDays(heute(), 1), titel: `Morgen · ${fLang(addDays(heute(), 1))}`, unter: "Tag öffnen", punkte: 80 });

  const aktionen = [
    ["krank", "Krankmeldung erfassen", darf(sitz, "plan.edit.unit")],
    ["verfuegbarkeit", "Verfügbarkeit bearbeiten", sitz.person.imSchichtdienst !== false],
    ["assistent", "Planungsassistent starten", darf(sitz, "plan.edit.all")],
    ["wizard", "Schichtplanung einrichten", darf(sitz, "pattern.edit")],
    ["aushang", "Aushangplan drucken", darf(sitz, "plan.view.unit")],
    ["feldmodus", "Feldmodus umschalten", true],
  ];
  for (const [id, label, erlaubt] of aktionen) if (erlaubt && passt(label))
    treffer.push({ art: "aktion", id, titel: label, unter: "Aktion ausführen", punkte: 70 });

  treffer.sort((a, b) => b.punkte - a.punkte);
  return treffer.slice(0, 12);
}

/* --------------------------- Briefing für den Tag ------------------------ */
/** Textfassung der Tagesaufgaben — für Benachrichtigung und E-Mail. */
function briefingText(sitz) {
  const auf = tagesaufgaben(sitz);
  const m = sitz.mandant, p = sitz.person;
  const z = [`CENTRIC · ${m.name}`, fLang(heute()), ""];
  const t = p.imSchichtdienst !== false ? personTag(m, p, heute()) : null;
  if (t && t.dienstId) {
    const da = m.dienstarten.find((x) => x.id === t.dienstId);
    if (da) z.push(`Dein Dienst: ${da.name}, ${da.start}–${da.ende} Uhr`, "");
  }
  if (!auf.length) z.push("Es liegt nichts an.");
  else { z.push(`${auf.length} ${auf.length === 1 ? "Vorgang" : "Vorgänge"}:`);
    for (const a of auf) z.push(`${a.dringend ? "!" : "·"} ${a.titel}${a.text ? ` — ${a.text}` : ""}`); }
  return z.join("\n");
}


/* ==========================================================================
   EINRICHTUNGSSTAND
   Ein frisch angelegter Betrieb ist leer. Statt den Nutzer suchen zu lassen,
   sagt die App, was als Nächstes fehlt — und führt direkt dorthin.
   ========================================================================== */
function einrichtungsstand(m) {
  const aktivP = m.personen.filter((p) => imDienst(p, heute()));
  const imDienstP = aktivP.filter((p) => p.imSchichtdienst !== false);
  const schritte = [
    { id: "personal", ziel: "personal", erledigt: imDienstP.length >= 2,
      titel: "Personal anlegen",
      text: imDienstP.length === 0 ? "Noch niemand im Bestand — Liste einlesen oder einzeln anlegen"
        : `${imDienstP.length} Person${imDienstP.length === 1 ? "" : "en"} im Schichtdienst` },
    { id: "rollen", ziel: "personal", erledigt: aktivP.some((p) => ["planer", "subplaner"].includes(p.rolle)),
      titel: "Zugangsarten vergeben",
      text: "Mindestens eine Planung oder Schichtverantwortung festlegen" },
    { id: "quals", ziel: "quals", erledigt: (m.qualifikationen || []).length > 0
        && aktivP.some((p) => p.qualifikationen && p.qualifikationen.length),
      titel: "Qualifikationen zuordnen",
      text: "Wer darf was — Grundlage für Besetzung und Ersatzsuche" },
    { id: "mindest", ziel: "dienste", erledigt: m.dienstarten.some((d) =>
        (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0),
      titel: "Mindestbesetzung festlegen",
      text: "Wie viele Personen je Dienst gebraucht werden" },
    { id: "freigabe", ziel: "plan", erledigt: Object.keys(m.freigaben || {}).length > 0,
      titel: "Ersten Plan freigeben",
      text: "Danach ist der Plan für alle verbindlich" },
  ];
  const offen = schritte.filter((x) => !x.erledigt);
  return { schritte, offen, fertig: offen.length === 0,
    anteil: Math.round(((schritte.length - offen.length) / schritte.length) * 100) };
}


/**
 * Setzt einen genehmigten Antrag im Bestand um: Abwesenheiten werden
 * eingetragen, Tauschgesuche als Abweichung geschrieben.
 */
function antragUmsetzen(m, a) {
  if (a.typ === "abwesenheit") {
    return { ...m, abwesenheiten: [...m.abwesenheiten,
      { id: uid("a"), personId: a.personId, art: a.art, von: a.von, bis: a.bis,
        notiz: a.text || "" }] };
  }
  if (a.typ === "tausch" && a.partnerId) {
    // Beide Personen tauschen ihre Dienste am betroffenen Tag
    const pA = m.personen.find((x) => x.id === a.personId);
    const pB = m.personen.find((x) => x.id === a.partnerId);
    if (!pA || !pB) return m;
    const dA = personTag(m, pA, a.von).dienstId;
    const dB = personTag(m, pB, a.von).dienstId;
    return { ...m, abweichungen: { ...m.abweichungen,
      [`${pA.id}|${a.von}`]: dB || "-", [`${pB.id}|${a.von}`]: dA || "-" } };
  }
  return m;
}
