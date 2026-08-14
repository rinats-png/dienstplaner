
/* ==========================================================================
   RECHENKERN — FÜNFTE AUSBAUSTUFE
   Verfügbarkeiten · Nachweisgültigkeit · Standortprüfung beim Einstempeln ·
   Auslastung · Was ist heute zu tun
   ========================================================================== */

/* ------------------------------ Verfügbarkeit ---------------------------- */
/** Drei Zeitfenster je Tag. Ein Dienst fällt in das Fenster, in dem er beginnt. */
const FENSTER = [
  { id: 0, name: "Vormittag", von: 0, bis: 719 },
  { id: 1, name: "Nachmittag", von: 720, bis: 1079 },
  { id: 2, name: "Nacht", von: 1080, bis: 1439 },
];
const fensterVon = (da) => {
  const s = toMin(da.start);
  return s < 720 ? 0 : s < 1080 ? 1 : 2;
};
/**
 * Kann die Person an diesem Tag diesen Dienst leisten?
 * Ohne gepflegte Verfügbarkeit gilt: immer verfügbar.
 */
function verfuegbarFuer(p, datum, da) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return true;
  const idx = dow(datum) * 3 + fensterVon(da);
  return v.raster[idx] !== false;
}
/** Für die Anzeige: wie viele der 21 Felder sind freigegeben? */
function verfuegbarkeitQuote(p) {
  const v = p.verfuegbarkeit;
  if (!v || !v.aktiv || !v.raster) return 1;
  return v.raster.filter(Boolean).length / 21;
}

/* --------------------------- Nachweise und Ablauf ------------------------ */
const NACHWEIS_VORLAUF = 60;   // Tage, ab denen gewarnt wird

/** Gültigkeitsstand eines einzelnen Nachweises. */
function nachweisStand(m, p, qualId) {
  const n = (p.qualNachweise || []).find((x) => x.qualId === qualId);
  const q = m.qualifikationen.find((x) => x.id === qualId);
  if (!q) return { stand: "unbekannt" };
  if (!q.gueltigMonate) return { stand: "gueltig", ablauf: null, qual: q, unbefristet: true };
  if (!n || !n.ablauf) return { stand: "fehlt", ablauf: null, qual: q };
  const tage = between(heute(), n.ablauf);
  return { stand: tage < 0 ? "abgelaufen" : tage <= NACHWEIS_VORLAUF ? "laeuft_ab" : "gueltig",
    ablauf: n.ablauf, tage, qual: q, datei: n.datei };
}
/** Zählt eine Qualifikation für die Besetzung nur, wenn der Nachweis gültig ist. */
function qualGueltig(m, p, qualId) {
  if (!p.qualifikationen.includes(qualId)) return false;
  const s = nachweisStand(m, p, qualId);
  return s.stand === "gueltig" || s.stand === "laeuft_ab";
}
/** Alle Nachweise eines Betriebs, die Aufmerksamkeit brauchen. */
function nachweisLage(m) {
  return memo(m, "nachweise", () => {
    const abgelaufen = [], bald = [], fehlt = [];
    for (const p of m.personen) {
      if (!imDienst(p, heute())) continue;
      for (const qid of p.qualifikationen) {
        const s = nachweisStand(m, p, qid);
        if (s.stand === "abgelaufen") abgelaufen.push({ person: p, ...s });
        else if (s.stand === "laeuft_ab") bald.push({ person: p, ...s });
        else if (s.stand === "fehlt" && s.qual && s.qual.nachweisPflicht) fehlt.push({ person: p, ...s });
      }
    }
    const sort = (a, b) => (a.tage || 0) - (b.tage || 0);
    return { abgelaufen: abgelaufen.sort(sort), bald: bald.sort(sort), fehlt,
      gesamt: abgelaufen.length + bald.length + fehlt.length };
  });
}

/* ------------------------ Standortprüfung beim Stempeln ------------------ */
/** Abstand zweier Koordinaten in Metern (Haversine). */
function abstandMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
/**
 * Bewertet einen Stempelvorgang gegen den hinterlegten Einsatzort.
 * Bewusst nur als Ereignis: kein Verlauf, keine Hintergrundortung.
 * Gespeichert wird ausschließlich das Ergebnis, nicht die Koordinate.
 */
function stempelPruefen(m, p, datum, koord) {
  const t = personTag(m, p, datum);
  const da = t.dienstId && m.dienstarten.find((x) => x.id === t.dienstId);
  const eid = einheitAm(p, datum);
  const e = m.einheiten.find((x) => x.id === eid);
  const st = e && m.standorte.find((x) => x.id === e.standortId);
  if (!koord || !st || st.lat === undefined)
    return { geprueft: false, text: "Ohne Standortfreigabe erfasst" };
  const d = abstandMeter(koord.lat, koord.lon, st.lat, st.lon);
  const radius = st.radius || 200;
  return { geprueft: true, abstand: d, radius, innerhalb: d <= radius, standort: st.name,
    text: d <= radius ? `Am Einsatzort (${d} m)` : `Abweichend, ${d > 1500 ? `${n1(d / 1000)} km` : `${d} m`} entfernt` };
}
const stempelStand = (m, p, datum) => (m.einstempeln || {})[`${p.id}|${datum}`] || null;

/* -------------------------------- Auslastung ----------------------------- */
/**
 * Auslastung in Prozent: geleistete gegen vertragliche Stunden im Monat.
 * Eine Zahl, an der sofort ablesbar ist, wer noch Luft hat.
 */
function auslastung(m, p, ym) {
  return memo(m, `ausl|${p.id}|${ym}`, () => {
    const ist = istStunden(m, p, ym).gesamt;
    const soll = sollStunden(m, p, ym);
    const pct = soll > 0 ? Math.round((ist / soll) * 100) : 0;
    return { ist, soll, pct,
      stand: pct > 115 ? "hoch" : pct > 105 ? "erhoeht" : pct < 85 ? "niedrig" : "normal" };
  });
}

/* --------------------------- Was ist heute zu tun ------------------------ */
/**
 * Der Einstieg für jede Rolle: nicht was alles existiert, sondern was ansteht.
 * Jeder Eintrag nennt Anzahl, Dringlichkeit und führt an die richtige Stelle.
 */
function tagesaufgaben(sitz) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute(), ym = d0.slice(0, 7);
  const out = [];
  const push = (o) => out.push(o);

  // --- Für alle im Schichtdienst ---
  if (p.imSchichtdienst !== false) {
    const t = personTag(m, p, d0);
    if (t.dienstId) {
      const da = m.dienstarten.find((x) => x.id === t.dienstId);
      const st = stempelStand(m, p, d0);
      if (da && !st) push({ art: "stempel", dringend: true, ziel: "meine",
        titel: `Heute ${da.name}`, text: `${da.start}–${da.ende} · noch nicht eingestempelt`, aktion: "Einstempeln" });
      else if (da && st && !st.ende) push({ art: "stempel", dringend: false, ziel: "meine",
        titel: `Im Dienst seit ${st.start}`, text: da.name, aktion: "Ausstempeln" });
    }
    const offen = offeneErfassung(m, p, addDays(d0, -1));
    if (offen.length) push({ art: "zeiten", dringend: false, ziel: "meine",
      titel: `${offen.length} Zeiten bestätigen`, text: "Solange offen, bleibt das Stundenkonto eine Hochrechnung", anzahl: offen.length });
    const meineNachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
      .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
    if (meineNachweise.length) push({ art: "nachweis", dringend: meineNachweise.some((x) => x.stand === "abgelaufen"),
      ziel: "meine", titel: `${meineNachweise.length} Nachweis${meineNachweise.length > 1 ? "e" : ""} prüfen`,
      text: meineNachweise.map((x) => `${x.qual.name}${x.stand === "abgelaufen" ? " abgelaufen" : ` läuft in ${x.tage} Tagen ab`}`).join(" · ") });
    const antw = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen);
    if (antw.length) push({ art: "post", dringend: false, ziel: "meine",
      titel: `${antw.length} neue Mitteilung${antw.length > 1 ? "en" : ""}`, text: antw[0].titel, anzahl: antw.length });
    const einsatz = m.anfragen.filter((a) => a.personId === p.id && a.typ === "einsatz" && a.status === "offen");
    if (einsatz.length) push({ art: "einsatz", dringend: true, ziel: "meine",
      titel: `${einsatz.length} Einsatzanfrage${einsatz.length > 1 ? "n" : ""}`, text: "Zusagen oder absagen" });
  }

  // --- Für Planung und Leitung ---
  if (darf(sitz, "req.approve.unit") || darf(sitz, "req.approve.all")) {
    const zu = m.anfragen.filter((a) => {
      if (a.status !== "offen" || a.typ === "einsatz") return false;
      const ap = m.personen.find((x) => x.id === a.personId);
      return ap && (darf(sitz, "req.approve.all") || darfEntscheiden(sitz, einheitAm(ap, d0)));
    });
    if (zu.length) push({ art: "antrag", dringend: zu.length > 4, ziel: "antraege",
      titel: `${zu.length} Antr${zu.length > 1 ? "äge" : "ag"} entscheiden`,
      text: zu.slice(0, 2).map((a) => { const ap = m.personen.find((x) => x.id === a.personId);
        return `${ap ? ap.nachname : "?"} · ${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`; }).join(" · "),
      anzahl: zu.length });
    const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen" && (a.interessenten || []).length);
    if (boerse.length) push({ art: "boerse", dringend: false, ziel: "boerse",
      titel: `${boerse.length} Tauschgesuch${boerse.length > 1 ? "e" : ""} mit Meldung`, text: "Zuteilung steht aus" });
  }

  if (darf(sitz, "plan.view.unit")) {
    const kommend = pruefen(m, d0, addDays(d0, 13));
    const heuteOffen = kommend.filter((b) => b.datum === d0 && (b.art === "besetzung" || b.art === "qualifikation"));
    if (heuteOffen.length) push({ art: "besetzung", dringend: true, ziel: "lage",
      titel: `Heute ${heuteOffen.length}× unterbesetzt`, text: heuteOffen.map((b) => b.titel).slice(0, 2).join(" · "),
      anzahl: heuteOffen.length });
    const kritisch = kommend.filter((b) => b.schwere === "danger" && b.datum !== d0);
    if (kritisch.length) push({ art: "pruefung", dringend: false, ziel: "pruef",
      titel: `${kritisch.length} kritische Befunde in 14 Tagen`, text: kritisch[0].titel, anzahl: kritisch.length });
  }

  if (darf(sitz, "staff.view")) {
    const nl = nachweisLage(m);
    if (nl.abgelaufen.length) push({ art: "nachweise", dringend: true, ziel: "personal",
      titel: `${nl.abgelaufen.length} Nachweis${nl.abgelaufen.length > 1 ? "e" : ""} abgelaufen`,
      text: nl.abgelaufen.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name}`).join(" · "),
      anzahl: nl.abgelaufen.length });
    if (nl.bald.length) push({ art: "nachweise", dringend: false, ziel: "personal",
      titel: `${nl.bald.length} Nachweis${nl.bald.length > 1 ? "e laufen" : " läuft"} bald ab`,
      text: nl.bald.slice(0, 2).map((x) => `${x.person.nachname} · ${x.qual.name} in ${x.tage} Tagen`).join(" · "),
      anzahl: nl.bald.length });
  }

  if (darf(sitz, "plan.publish")) {
    for (const off of [0, 1]) {
      const [y, mo] = ym.split("-").map(Number);
      const d = new Date(y, mo - 1 + off, 1);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      if (!istFreigegeben(m, k)) push({ art: "freigabe", dringend: off === 0, ziel: "plan",
        titel: `${MON[d.getMonth()]} ${d.getFullYear()} nicht freigegeben`,
        text: off === 0 ? "Der laufende Monat ist noch Entwurf" : "Vorlauf schaffen und freigeben" });
    }
  }

  if (darf(sitz, "account.view.all")) {
    const grenze = m.einstellungen.ausgleichGrenze || 40;
    const ueber = m.personen.filter((x) => imDienst(x, d0) && stundenkonto(m, x, ym) > grenze);
    if (ueber.length) push({ art: "konto", dringend: false, ziel: "abrechnung",
      titel: `${ueber.length}× Stundenkonto über der Grenze`,
      text: `Freizeitausgleich einplanen · Grenze ${n1(grenze)} h`, anzahl: ueber.length });
  }

  out.sort((a, b) => (a.dringend === b.dringend ? 0 : a.dringend ? -1 : 1));
  return out;
}

/* --------------------------- Tages- und Wochenband ----------------------- */
/**
 * Belegung eines Tages auf einer 24-Stunden-Achse.
 * Zeigt, WANN gearbeitet wird — nicht nur ob.
 */
function tagesband(m, datum) {
  return memo(m, `band|${datum}`, () => {
    const spuren = [];
    for (const da of m.dienstarten) {
      const b = besetzung(m, datum)[da.id];
      const s = toMin(da.start);
      let e = toMin(da.ende); if (e <= s) e += 1440;
      spuren.push({ da, von: s, bis: e, ueberNacht: e > 1440,
        anzahl: b.anzahl, soll: b.soll, status: b.status, personen: b.personen });
    }
    return spuren.sort((a, b) => a.von - b.von);
  });
}
