
/* ==========================================================================
   ENGINE — arbeitet immer auf genau einem Mandanten
   ========================================================================== */
const _c = new WeakMap();
function cache(m) { let c = _c.get(m); if (!c) { c = { map: new Map(), abs: null, posten: new Map() }; _c.set(m, c); } return c; }
function memo(m, k, fn) { const c = cache(m); if (c.map.has(k)) return c.map.get(k); const v = fn(); c.map.set(k, v); return v; }
function absIdx(m) {
  const c = cache(m); if (c.abs) return c.abs;
  const x = new Map();
  for (const a of m.abwesenheiten) { if (!x.has(a.personId)) x.set(a.personId, []); x.get(a.personId).push(a); }
  c.abs = x; return x;
}

function einheitAm(p, d) { let t = null; for (const z of p.zugehoerigkeit) if (z.ab <= d) t = z; return t ? t.einheitId : null; }
function imDienst(p, d) { if (p.eintritt && d < p.eintritt) return false; if (p.austritt && d > p.austritt) return false; return p.status !== "gesperrt"; }
const aktive = (m, d) => memo(m, `akt|${d}`, () => m.personen.filter((p) => imDienst(p, d)));

function abwesenheitAm(m, pid, d) {
  const l = absIdx(m).get(pid); if (!l) return null;
  let best = null;
  for (const a of l) if (a.von <= d && a.bis >= d && (!best || abwArt(a.art).rang > abwArt(best.art).rang)) best = a;
  return best;
}
/** Versatz einer Einheit in Tagen. Wochenversatz bleibt als Sonderfall gültig. */
function versatzTageVon(e) {
  return e.versatzTage !== undefined && e.versatzTage !== null ? e.versatzTage : (e.versatz || 0) * 7;
}
/** Zykluslänge in Tagen — bei Tagesversatz nicht zwingend ein Vielfaches von 7. */
function zyklusLaenge(m) {
  return m.zyklus.tage ? m.zyklus.tage.length : m.zyklus.wochen * 7;
}
function einheitDienst(m, eid, d) {
  const e = m.einheiten.find((x) => x.id === eid); if (!e || e.pool) return null;
  const len = zyklusLaenge(m);
  const i = (((between(m.anker, d) + versatzTageVon(e)) % len) + len) % len;
  const id = m.zyklus.tage[i];
  return id && id !== "-" ? id : null;
}
/** C5: Ein Feiertag hebt die Vorgabe an, senkt sie nie. */
function mindestFuer(m, da, d) {
  const w = dow(d);
  const wt = w === 6 ? da.mindest.so : w === 5 ? da.mindest.sa : w === 4 ? da.mindest.fr : da.mindest.mo_do;
  return Math.max(wt, feiertag(d, m.bundesland) ? da.mindest.so : 0);
}
/**
 * Postenbesetzung: manuelle Zuweisungen zählen an, der Pool bleibt stabil.
 * Ungeeignete werden während der Iteration übersprungen, nicht vorher entfernt —
 * dadurch verschiebt ein einzelner Ausfall die Besatzung nur um eine Person.
 */
function postenBesatzung(m, eid, d, pid) {
  const c = cache(m), k = `${eid}|${d}|${pid}`;
  if (c.posten.has(k)) return c.posten.get(k);
  const posten = m.dienstarten.find((x) => x.id === pid);
  const soll = posten ? mindestFuer(m, posten, d) : 0;
  const manuell = m.personen.filter((p) => imDienst(p, d) && m.abweichungen[`${p.id}|${d}`] === pid).map((p) => p.id);
  const rest = Math.max(0, soll - manuell.length);
  const out = new Set(manuell);
  if (rest === 0) { c.posten.set(k, out); return out; }
  const pool = m.personen.filter((p) => imDienst(p, d) && einheitAm(p, d) === eid
      && p.imSchichtdienst !== false && p.funktion !== "Schichtleitung")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!pool.length) { c.posten.set(k, out); return out; }
  const start = Math.abs(between(m.anker, d)) % pool.length;
  let n = 0;
  for (let i = 0; i < pool.length && n < rest; i++) {
    const p = pool[(start + i) % pool.length];
    if (abwesenheitAm(m, p.id, d)) continue;
    if (m.abweichungen[`${p.id}|${d}`] !== undefined) continue;
    // Teilzeitkräfte, die an diesem Tag nicht arbeiten, können den Posten nicht besetzen
    if (p.springer || !teilzeitDienst(m, p, d, einheitDienst(m, eid, d))) continue;
    out.add(p.id); n++;
  }
  c.posten.set(k, out); return out;
}
function personTag(m, p, d) {
  if (!imDienst(p, d)) return { dienstId: null, plan: null, abweichung: null, abwesenheit: null, quelle: "extern" };
  const eid = einheitAm(p, d);
  // Geschäftszimmer: Planung und Leitung fahren keine Rotation mit.
  // Sie erscheinen im Plan nur durch ausdrückliche Zuweisung.
  const roh = (eid && !p.springer && p.imSchichtdienst !== false) ? einheitDienst(m, eid, d) : null;
  const plan = teilzeitDienst(m, p, d, roh);
  const ab = m.abweichungen[`${p.id}|${d}`];
  let basis = ab !== undefined ? (ab === "-" ? null : ab) : plan;
  if (ab === undefined && plan) {
    const po = m.dienstarten.find((x) => x.posten && x.quelle === plan);
    if (po && postenBesatzung(m, eid, d, po.id).has(p.id)) basis = po.id;
  }
  const abw = abwesenheitAm(m, p.id, d);
  return { dienstId: abw ? null : basis, plan, abweichung: ab !== undefined ? ab : null, abwesenheit: abw,
    quelle: ab !== undefined ? "abweichung" : "plan" };
}
function besetzung(m, d) {
  return memo(m, `bes|${d}`, () => {
    const out = {};
    for (const da of m.dienstarten) out[da.id] = { da, personen: [], soll: mindestFuer(m, da, d) };
    for (const p of aktive(m, d)) { const t = personTag(m, p, d); if (t.dienstId && out[t.dienstId]) out[t.dienstId].personen.push(p); }
    for (const k of Object.keys(out)) {
      const e = out[k];
      e.anzahl = e.personen.length; e.diff = e.anzahl - e.soll;
      e.qual = Object.entries(e.da.mindestQual || {}).filter(([, n]) => n > 0).map(([qid, n]) => {
        const ist = e.personen.filter((p) => qualGueltig(m, p, qid)).length;
        return { qid, noetig: n, ist, ok: ist >= n };
      });
      e.qualFehlt = e.qual.some((q) => !q.ok);
      e.status = e.diff < -1 ? "danger" : e.diff < 0 || e.qualFehlt ? "warn" : "ok";
    }
    return out;
  });
}
function sollStunden(m, p, ym) {
  return memo(m, `soll|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1); let t = 0;
    for (let i = 1; i <= n; i++) { const d = `${ym}-${pad(i)}`;
      if (imDienst(p, d) && dow(d) < 5 && !feiertagFuer(m, d, p)) t++; }
    return Math.round(p.wochenstunden / 5 * t * 100) / 100;
  });
}
function istStunden(m, p, ym) {
  return memo(m, `ist|${p.id}|${ym}`, () => {
    const [y, mo] = ym.split("-").map(Number); const n = dim_(y, mo - 1); const proTag = p.wochenstunden / 5;
    let g = 0, gg = 0, nacht = 0, dienste = 0, naechte = 0, erfasst = 0;
    for (let i = 1; i <= n; i++) {
      const d = `${ym}-${pad(i)}`; const t = personTag(m, p, d);
      if (t.abwesenheit) { if (abwArt(t.abwesenheit.art).bezahlt && t.plan) gg += proTag; continue; }
      if (!t.dienstId) continue;
      const da = m.dienstarten.find((x) => x.id === t.dienstId); if (!da) continue;
      const idn = istDauer(m, p, d, da);
      g += gewertet(da, idn.std); if (idn.erfasst) erfasst++;
      const na = nachtAnteil(da); nacht += na; dienste++; if (na >= 2) naechte++;
    }
    return { geleistet: Math.round(g * 100) / 100, gutgeschrieben: Math.round(gg * 100) / 100,
      gesamt: Math.round((g + gg) * 100) / 100, nacht: Math.round(nacht * 100) / 100, dienste, naechte, erfasst };
  });
}
function urlaubskonto(m, p, jahr) {
  return memo(m, `url|${p.id}|${jahr}`, () => {
    let genommen = 0; const zeilen = [];
    for (const a of absIdx(m).get(p.id) || []) {
      if (!abwArt(a.art).urlaub) continue;
      let tage = 0;
      for (let d = a.von; d <= a.bis; d = addDays(d, 1)) {
        if (d.slice(0, 4) !== String(jahr) || feiertagFuer(m, d, p) || !imDienst(p, d)) continue;
        const eid = einheitAm(p, d); if (eid && einheitDienst(m, eid, d)) tage++;
      }
      genommen += tage; zeilen.push({ ...a, tage });
    }
    const anspruch = p.urlaubsanspruch + (p.urlaubsuebertrag || 0);
    return { anspruch, genommen, rest: anspruch - genommen, zeilen };
  });
}
function stundenkonto(m, p, ym) {
  return memo(m, `kto|${p.id}|${ym}`, () => {
    const j = Number(ym.slice(0, 4)), bis = Number(ym.slice(5, 7)); let d = p.stundenuebertrag || 0;
    for (let x = 1; x <= bis; x++) { const k = `${j}-${pad(x)}`; d += istStunden(m, p, k).gesamt - sollStunden(m, p, k); }
    return Math.round(d * 10) / 10;
  });
}
function nachtJahr(m, p, jahr) {
  return memo(m, `nacht|${p.id}|${jahr}`, () => {
    let h = 0, n = 0;
    for (let x = 1; x <= 12; x++) { const r = istStunden(m, p, `${jahr}-${pad(x)}`); h += r.nacht; n += r.naechte; }
    return { stunden: Math.round(h * 10) / 10, anzahl: n };
  });
}
function pruefen(m, von, bis) {
  return memo(m, `pr|${von}|${bis}`, () => {
    const out = []; const push = (o) => out.push({ id: `${o.art}|${o.datum}|${o.ref || ""}`, ...o });
    for (let d = von; d <= bis; d = addDays(d, 1)) {
      const b = besetzung(m, d);
      for (const k of Object.keys(b)) {
        const e = b[k];
        // Fachkraftquote (Pflege, Klinik)
        const fl = fachkraftLage(m, d, k);
        if (fl && !fl.erfuellt)
          push({ art: "fachkraft", schwere: "danger", datum: d, ref: k,
            titel: `${e.da.name}: Fachkraftquote unterschritten`,
            text: `${fl.fk} von ${fl.gesamt} sind Fachkräfte (${fl.ist} %), gefordert sind ${fl.soll} % — es fehlen ${fl.fehlt}` });
        if (e.diff < 0) {
          const u = (m.unterschreitungen || []).find((x) => x.datum === d && x.dienstId === k);
          push({ art: "besetzung", schwere: u ? "warn" : (e.diff <= -2 ? "danger" : "warn"), datum: d, ref: k,
            titel: `${e.da.name} unterbesetzt${u ? " · dokumentiert" : ""}`,
            text: u ? `${e.anzahl} von ${e.soll} — begründet: ${u.grund}` : `${e.anzahl} von ${e.soll} — es fehlen ${Math.abs(e.diff)}` });
        }
        for (const q of e.qual.filter((x) => !x.ok)) {
          const qn = m.qualifikationen.find((x) => x.id === q.qid);
          push({ art: "qualifikation", schwere: "danger", datum: d, ref: `${k}|${q.qid}`,
            titel: `${e.da.name}: ${qn ? qn.name : q.qid} fehlt`, text: `${q.ist} von ${q.noetig} erforderlich` });
        }
      }
    }
    const vor = addDays(von, -10);
    for (const p of m.personen) {
      const reihe = [];
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) { const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (da && !da.ruhezeitNeutral) reihe.push({ d, da }); }
      }
      for (let i = 1; i < reihe.length; i++) {
        const [, e1] = fenster(reihe[i - 1].d, reihe[i - 1].da); const [s2] = fenster(reihe[i].d, reihe[i].da);
        const ruhe = (s2 - e1) / 60;
        if (ruhe < m.einstellungen.ruhezeit && reihe[i].d >= von && reihe[i].d <= bis)
          push({ art: "ruhezeit", schwere: ruhe < 8 ? "danger" : "warn", datum: reihe[i].d, ref: p.id, personId: p.id,
            titel: `Ruhezeit unterschritten — ${p.nachname}`,
            text: `${n1(ruhe)} h zwischen ${reihe[i - 1].da.kurz} am ${fKurz(reihe[i - 1].d)} und ${reihe[i].da.kurz}` });
      }
      let lauf = 0, nl = 0, ab = null;
      for (let d = vor; d <= addDays(bis, 2); d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (t.dienstId) {
          if (!lauf) ab = d; lauf++;
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          nl = da && nachtAnteil(da) >= 2 ? nl + 1 : 0;
          if (lauf === m.einstellungen.maxFolge + 1 && d >= von && d <= bis)
            push({ art: "folge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${lauf} Dienste in Folge — ${p.nachname}`, text: `Serie ab ${fKurz(ab)}, Grenzwert ${m.einstellungen.maxFolge}` });
          if (nl === m.einstellungen.maxNachtFolge + 1 && d >= von && d <= bis)
            push({ art: "nachtfolge", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `${nl} Nachtdienste in Folge — ${p.nachname}`, text: `Grenzwert ${m.einstellungen.maxNachtFolge}` });
        } else { lauf = 0; nl = 0; }
      }
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const a = m.abweichungen[`${p.id}|${d}`], w = abwesenheitAm(m, p.id, d);
        if (a && a !== "-" && w) push({ art: "abwesend", schwere: "danger", datum: d, ref: p.id, personId: p.id,
          titel: `Dienst trotz ${abwArt(w.art).label} — ${p.nachname}`, text: `Eingetragen: ${a}. Abwesend bis ${fKurz(w.bis)}` });
      }
      // Personenbezogene Einschränkungen
      const ein = p.einschraenkungen || {};
      for (let d = von; d <= bis; d = addDays(d, 1)) {
        const t = personTag(m, p, d);
        if (!t.dienstId) continue;
        const da = m.dienstarten.find((x) => x.id === t.dienstId);
        if (!da) continue;
        if (ein.keineNacht && nachtAnteil(da) >= 2)
          push({ art: "einschraenkung", schwere: "danger", datum: d, ref: p.id, personId: p.id,
            titel: `Nachtdienst trotz Einschränkung — ${p.nachname}`,
            text: `${da.name} eingeteilt, obwohl keine Nachtdienste zugelassen sind` });
        if (ein.keinAlleindienst) {
          const mit = besetzung(m, d)[t.dienstId].personen.filter((x) => x.id !== p.id && !(x.einschraenkungen || {}).keinAlleindienst);
          if (mit.length === 0)
            push({ art: "einschraenkung", schwere: "danger", datum: d, ref: p.id, personId: p.id,
              titel: `Alleindienst nicht zulässig — ${p.nachname}`,
              text: `${da.name}: keine weitere eingewiesene Person eingeteilt` });
        }
        const w = ein.wiedereingliederung;
        if (w && w.von <= d && w.bis >= d && dow(d) === 0) {
          let std = 0;
          for (let i = 0; i < 7; i++) { const tt = personTag(m, p, addDays(d, i));
            if (!tt.dienstId) continue; const xx = m.dienstarten.find((y) => y.id === tt.dienstId); if (xx) std += dauer(xx); }
          if (std > w.maxStundenWoche)
            push({ art: "einschraenkung", schwere: "warn", datum: d, ref: p.id, personId: p.id,
              titel: `Wiedereingliederung überschritten — ${p.nachname}`,
              text: `${n1(std)} h geplant, zulässig sind ${n1(w.maxStundenWoche)} h je Woche` });
        }
      }
      if (ein.maxDiensteWoche) {
        for (let d = montag(von); d <= bis; d = addDays(d, 7)) {
          let n = 0;
          for (let i = 0; i < 7; i++) if (personTag(m, p, addDays(d, i)).dienstId) n++;
          if (n > ein.maxDiensteWoche)
            push({ art: "einschraenkung", schwere: "warn", datum: d < von ? von : d, ref: `${p.id}|w`, personId: p.id,
              titel: `${n} Dienste in der Woche — ${p.nachname}`,
              text: `vereinbart sind höchstens ${ein.maxDiensteWoche}` });
        }
      }
      // Dienst mit abgelaufenem Pflichtnachweis
      for (const qid of p.qualifikationen) {
        const q = m.qualifikationen.find((x) => x.id === qid);
        if (!q || !q.nachweisPflicht) continue;
        const st = nachweisStand(m, p, qid);
        if (st.stand !== "abgelaufen") continue;
        for (let d = von; d <= bis; d = addDays(d, 1)) {
          const t2 = personTag(m, p, d);
          if (!t2.dienstId) continue;
          const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
          if (!da2 || !(da2.mindestQual || {})[qid]) continue;
          push({ art: "nachweis", schwere: "danger", datum: d, ref: `${p.id}|${qid}`, personId: p.id,
            titel: `Nachweis abgelaufen — ${p.nachname}`,
            text: `${q.name} seit ${fKurz(st.ablauf)} ungültig, wird aber für ${da2.name} gezählt` });
          break;
        }
      }
      // Harte Sperre: eine gesetzlich zwingende Qualifikation gilt für jeden
      // Dienst, nicht nur dort, wo sie als Mindestbesetzung genannt ist.
      // Beispiel: ohne Sachkunde nach § 34a GewO ist kein Wachdienst zulässig.
      if (kann(m, "hartesperre")) {
        for (const q of m.qualifikationen) {
          if (!q.harteSperre) continue;
          for (let d = von; d <= bis; d = addDays(d, 1)) {
            const t2 = personTag(m, p, d);
            if (!t2.dienstId) continue;
            const da2 = m.dienstarten.find((x) => x.id === t2.dienstId);
            if (!da2 || da2.form === "ruf") continue;
            if (qualGueltig(m, p, q.id)) continue;
            const st = nachweisStand(m, p, q.id);
            push({ art: "sperre", schwere: "danger", datum: d, ref: `${p.id}|${q.id}`, personId: p.id,
              titel: `Einsatz ohne ${q.name} — ${p.nachname}`,
              text: st.stand === "abgelaufen"
                ? `${q.name} ist seit ${fKurz(st.ablauf)} ungültig. Der Einsatz am ${fKurz(d)} ist unzulässig.`
                : `${q.name} liegt nicht vor. Der Einsatz am ${fKurz(d)} ist unzulässig.` });
            break;
          }
        }
      }
      const l = (absIdx(m).get(p.id) || []).filter((a) => a.bis >= von && a.von <= bis);
      for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
        if (l[i].von <= l[j].bis && l[j].von <= l[i].bis)
          push({ art: "ueberlappung", schwere: "danger", datum: l[j].von > von ? l[j].von : von, ref: `${p.id}|${i}|${j}`, personId: p.id,
            titel: `Überlappende Abwesenheiten — ${p.nachname}`,
            text: `${abwArt(l[i].art).label} und ${abwArt(l[j].art).label} überschneiden sich` });
    }
    for (let d = von; d <= bis; d = addDays(d, 1)) for (const e of m.einheiten) {
      const n = aktive(m, d).filter((p) => einheitAm(p, d) === e.id && (abwesenheitAm(m, p.id, d) || {}).art === "urlaub").length;
      if (n > m.einstellungen.maxUrlaubJeEinheit)
        push({ art: "urlaub", schwere: "warn", datum: d, ref: e.id, titel: `${e.name}: ${n} gleichzeitig im Urlaub`,
          text: `Obergrenze ${m.einstellungen.maxUrlaubJeEinheit}` });
    }
    out.sort((a, b) => a.datum === b.datum ? (a.schwere === b.schwere ? 0 : a.schwere === "danger" ? -1 : 1) : (a.datum < b.datum ? -1 : 1));
    return out;
  });
}
function simulation(m) {
  return memo(m, "sim", () => {
    const len = zyklusLaenge(m);
    const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
    let std = 0, dienste = 0;
    for (const id of m.zyklus.tage) if (id && id !== "-" && map[id]) { std += dauer(map[id]); dienste++; }
    const wochenstunden = Math.round(std / m.zyklus.wochen * 100) / 100;
    const deckung = [];
    for (let i = 0; i < len; i++) {
      const z = {};
      for (const e of m.einheiten) {
        if (e.pool) continue;                       // Springer fahren keine Rotation
        const idx = (((i + versatzTageVon(e)) % len) + len) % len;
        const id = m.zyklus.tage[idx]; if (id && id !== "-") z[id] = (z[id] || 0) + 1; }
      deckung.push(z);
    }
    const luecken = m.dienstarten
      .filter((d) => !d.posten && (d.mindest.mo_do + d.mindest.fr + d.mindest.sa + d.mindest.so) > 0)
      .map((d) => ({ da: d, tage: deckung.filter((z) => !z[d.id]).length })).filter((x) => x.tage > 0);
    const t = m.zyklus.tage; let maxFolge = 0, lauf = 0, maxNacht = 0, nl = 0, einzel = 0; const konflikte = [];
    for (let i = 0; i < len; i++) {
      const c = t[i], nx = t[(i + 1) % len], pv = t[(i - 1 + len) % len];
      if (c && c !== "-") {
        lauf++; maxFolge = Math.max(maxFolge, lauf);
        if (map[c] && nachtAnteil(map[c]) >= 2) { nl++; maxNacht = Math.max(maxNacht, nl); } else nl = 0;
        if ((!pv || pv === "-") && (!nx || nx === "-")) einzel++;
        if (nx && nx !== "-" && map[c] && map[nx]) {
          const [, e1] = fenster("2024-01-01", map[c]); const [s2] = fenster("2024-01-02", map[nx]);
          const ruhe = (s2 - e1) / 60;
          if (ruhe < m.einstellungen.ruhezeit) konflikte.push({ von: c, nach: nx, ruhe: Math.round(ruhe * 10) / 10, tag: i });
        }
      } else { lauf = 0; nl = 0; }
    }
    return { wochenstunden, dienste, deckung, luecken, len, maxFolge, maxNacht, einzel, konflikte };
  });
}

/* ------------------------------ Berechtigung ------------------------------ */
function darf(sitz, recht, einheitId) {
  if (!sitz || sitz.rolle === "betreiber") return false;
  const rechte = (sitz.mandant.matrix || MATRIX_STD)[sitz.person.rolle] || [];
  if (!rechte.includes(recht)) return false;
  if (sitz.person.rolle === "betriebsrat" && /\.(edit|approve|assign)/.test(recht)) return false;
  if (!einheitId) return true;
  if (sitz.person.bereich === "ALLE") return true;
  return sitz.person.bereich === einheitId;
}
const darfEinheit = (s, eid) => darf(s, "plan.edit.all") || darf(s, "plan.edit.unit", eid);
const darfEntscheiden = (s, eid) => darf(s, "req.approve.all") || darf(s, "req.approve.unit", eid);

/* ------------------------------ Preisrechnung ----------------------------- */
/** Zählt Zugänge aus dem laufenden Personalbestand — daher automatisch aktuell. */
function zugaenge(m) {
  const z = {}; for (const r of ROLLEN) if (!r.extern) z[r.id] = 0;
  for (const p of m.personen) {
    if (p.status === "gesperrt" || p.austritt) continue;
    if (z[p.rolle] === undefined) z[p.rolle] = 0;
    z[p.rolle]++;
  }
  return z;
}
function preis(db, m) {
  const t = db.tarife.find((x) => x.id === m.tarif) || db.tarife[0];
  const z = zugaenge(m);
  const zahlend = ROLLEN.filter((r) => r.berechnet).reduce((a, r) => a + (z[r.id] || 0), 0);
  const st = staffel(zahlend);
  const zeilen = ROLLEN.filter((r) => !r.extern).map((r) => {
    const anzahl = z[r.id] || 0, einzel = t.preis[r.id] || 0;
    return { rolle: r, anzahl, einzel, netto: anzahl * einzel * (1 - st.rabatt) };
  });
  const summeZugaenge = zeilen.reduce((a, l) => a + l.netto, 0);
  const grund = t.grund * (1 - (m.rabattGrund || 0));
  const gesamt = grund + summeZugaenge;
  const zahlt = stat(m.status).zahlt;
  return { t, z, zahlend, st, zeilen, grund, summeZugaenge, gesamt, zahlt, wirksam: zahlt ? gesamt : 0,
    jeKopf: zahlend ? gesamt / zahlend : 0,
    ueberEinheiten: m.einheiten.length > t.grenzen.einheiten, ueberPersonen: zahlend > t.grenzen.personen };
}
/** Datenschutz: die Betreibersicht enthält ausschließlich Zahlen. */
function betreiberSicht(db, m) {
  const p = preis(db, m);
  return { id: m.id, name: m.name, branche: m.branche, status: m.status, seit: m.seit, stichtag: m.stichtag,
    kontakt: m.kontakt, anschrift: m.anschrift, tarif: m.tarif, rabattGrund: m.rabattGrund,
    einheiten: m.einheiten.length, dienstarten: m.dienstarten.length, preis: p,
    letzteAenderung: m.protokoll[0] ? m.protokoll[0].zeit : null };
}

/* ============================== PDF-Erzeugung =============================
   Erzeugt eine echte PDF-Datei ohne Fremdbibliothek. Helvetica mit
   WinAnsi-Kodierung, damit Umlaute und das Eurozeichen stimmen.
   ========================================================================= */
const WINANSI = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‰": 0x89, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };
function pdfText(s) {
  let out = "";
  for (const ch of String(s)) {
    const c = WINANSI[ch] !== undefined ? WINANSI[ch] : ch.charCodeAt(0);
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c < 256) out += String.fromCharCode(c);
    else out += "?";
  }
  return out;
}
/** zeilen: [{x, y, text, size, bold, grau}] — Koordinaten in Millimetern von links oben. */
function bauePDF(zeilen, linien) {
  const mm = (v) => (v * 72) / 25.4;
  const H = 297;
  let ops = "";
  for (const l of linien || []) {
    ops += `q ${l.grau !== undefined ? l.grau : 0.75} G ${l.dicke || 0.4} w ${mm(l.x1).toFixed(2)} ${mm(H - l.y1).toFixed(2)} m ${mm(l.x2).toFixed(2)} ${mm(H - l.y2).toFixed(2)} l S Q\n`;
  }
  for (const z of zeilen) {
    const font = z.bold ? "/F2" : "/F1";
    const g = z.grau !== undefined ? z.grau : 0;
    ops += `BT ${font} ${z.size || 10} Tf ${g} g ${mm(z.x).toFixed(2)} ${mm(H - z.y).toFixed(2)} Td (${pdfText(z.text)}) Tj ET\n`;
  }
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${ops.length} >>\nstream\n${ops}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offs.forEach((o) => { pdf += String(o).padStart(10, "0") + " 00000 n \n"; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Baut die Rechnungsseite und liefert PDF-Bytes. */
function rechnungPDF(rg) {
  const T = [], L = [];
  const rechts = (x, txt, size, bold) => T.push({ x: x - String(txt).length * (size || 9) * 0.5 * 0.55, y: 0, text: txt, size, bold });
  let y = 24;
  T.push({ x: 20, y, text: rg.betreiber.firma, size: 16, bold: true });
  T.push({ x: 140, y: y - 2, text: "RECHNUNG", size: 18, bold: true });
  y += 6;
  rg.betreiber.anschrift.split("\n").forEach((z) => { T.push({ x: 20, y, text: z, size: 9, grau: 0.35 }); y += 4.5; });
  T.push({ x: 140, y: 30, text: `Nummer   ${rg.nummer}`, size: 9.5 });
  T.push({ x: 140, y: 35, text: `Datum    ${fDatum(rg.datum)}`, size: 9.5 });
  T.push({ x: 140, y: 40, text: `Zeitraum ${rg.zeitraum}`, size: 9.5 });
  T.push({ x: 140, y: 45, text: `Fällig   ${fDatum(rg.faellig)}`, size: 9.5 });

  y = 62;
  T.push({ x: 20, y, text: "Rechnungsempfänger", size: 8.5, grau: 0.45 }); y += 6;
  T.push({ x: 20, y, text: rg.mandant, size: 11, bold: true }); y += 5;
  (rg.anschrift || "").split("\n").forEach((z) => { if (z) { T.push({ x: 20, y, text: z, size: 9.5, grau: 0.3 }); y += 4.5; } });

  y = 96;
  L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.55, dicke: 0.6 }); y += 6;
  T.push({ x: 20, y, text: "Position", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 118, y, text: "Menge", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 140, y, text: "Einzel", size: 8.5, bold: true, grau: 0.35 });
  T.push({ x: 170, y, text: "Betrag", size: 8.5, bold: true, grau: 0.35 });
  y += 3; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;

  for (const p of rg.positionen) {
    T.push({ x: 20, y, text: p.text, size: 10 });
    if (p.menge) T.push({ x: 118, y, text: String(p.menge), size: 10 });
    if (p.einzel) T.push({ x: 140, y, text: p.einzel, size: 10 });
    T.push({ x: 170, y, text: p.betrag, size: 10 });
    y += 6.5;
  }
  y += 2; L.push({ x1: 20, y1: y, x2: 190, y2: y, grau: 0.75 }); y += 7;
  const summe = (label, wert, bold, size) => { T.push({ x: 118, y, text: label, size: size || 10, bold });
    T.push({ x: 170, y, text: wert, size: size || 10, bold }); y += 6.5; };
  summe("Zwischensumme", eur(rg.netto));
  if (rg.rabattBetrag > 0) summe(`Rabatt ${rg.rabattText}`, "−" + eur(rg.rabattBetrag));
  summe(`Umsatzsteuer ${rg.steuersatz} %`, eur(rg.steuer));
  y += 1; L.push({ x1: 118, y1: y - 4, x2: 190, y2: y - 4, grau: 0.55, dicke: 0.6 });
  summe("Gesamtbetrag", eur(rg.brutto), true, 12);

  y += 12;
  T.push({ x: 20, y, text: `Zahlbar ohne Abzug bis ${fDatum(rg.faellig)} auf folgendes Konto:`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `IBAN ${rg.betreiber.iban}`, size: 9.5, grau: 0.3 }); y += 5.5;
  T.push({ x: 20, y, text: `Verwendungszweck ${rg.nummer}`, size: 9.5, grau: 0.3 }); y += 10;
  T.push({ x: 20, y, text: `Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}`, size: 8.5, grau: 0.5 }); y += 4.5;
  T.push({ x: 20, y, text: "Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.", size: 8.5, grau: 0.5 });

  L.push({ x1: 20, y1: 272, x2: 190, y2: 272, grau: 0.85 });
  T.push({ x: 20, y: 278, text: `${rg.betreiber.firma} · ${rg.betreiber.anschrift.replace(/\n/g, " · ")}`, size: 7.5, grau: 0.55 });
  return bauePDF(T, L);
}

/** Dieselbe Rechnung als Word-Dokument (HTML, das Word verlustfrei öffnet). */
function rechnungHTML(rg) {
  const z = (p) => `<tr><td>${p.text}</td><td style="text-align:right">${p.menge || ""}</td>
    <td style="text-align:right">${p.einzel || ""}</td><td style="text-align:right">${p.betrag}</td></tr>`;
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${rg.nummer}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}
h1{font-size:20pt;margin:0 0 4pt}table{width:100%;border-collapse:collapse;margin-top:14pt}
th{text-align:left;font-size:9pt;color:#555;border-bottom:1px solid #999;padding:4pt 0}
td{padding:5pt 0;border-bottom:1px solid #eee}
.s td{border:none;padding:3pt 0}.r{text-align:right}</style></head><body>
<table style="margin:0"><tr><td><h1>${rg.betreiber.firma}</h1>
<div style="font-size:9pt;color:#555">${rg.betreiber.anschrift.replace(/\n/g, "<br>")}</div></td>
<td class="r" style="vertical-align:top"><h1>RECHNUNG</h1>
<div style="font-size:10pt">Nummer ${rg.nummer}<br>Datum ${fDatum(rg.datum)}<br>Zeitraum ${rg.zeitraum}<br>Fällig ${fDatum(rg.faellig)}</div>
</td></tr></table>
<p style="margin-top:22pt;font-size:9pt;color:#555">Rechnungsempfänger</p>
<p style="margin:0"><b>${rg.mandant}</b><br><span style="font-size:10pt;color:#333">${(rg.anschrift || "").replace(/\n/g, "<br>")}</span></p>
<table><tr><th>Position</th><th class="r">Menge</th><th class="r">Einzel</th><th class="r">Betrag</th></tr>
${rg.positionen.map(z).join("")}</table>
<table class="s" style="margin-top:12pt"><tr><td></td><td class="r" style="width:120pt">Zwischensumme</td><td class="r" style="width:90pt">${eur(rg.netto)}</td></tr>
${rg.rabattBetrag > 0 ? `<tr><td></td><td class="r">Rabatt ${rg.rabattText}</td><td class="r">−${eur(rg.rabattBetrag)}</td></tr>` : ""}
<tr><td></td><td class="r">Umsatzsteuer ${rg.steuersatz} %</td><td class="r">${eur(rg.steuer)}</td></tr>
<tr><td></td><td class="r"><b>Gesamtbetrag</b></td><td class="r"><b>${eur(rg.brutto)}</b></td></tr></table>
<p style="margin-top:20pt;font-size:10pt;color:#333">Zahlbar ohne Abzug bis ${fDatum(rg.faellig)}<br>
IBAN ${rg.betreiber.iban}<br>Verwendungszweck ${rg.nummer}</p>
<p style="font-size:8.5pt;color:#666">Umsatzsteuer-Identifikationsnummer ${rg.betreiber.ustId}<br>
Die Abrechnung erfolgt nach vergebenen Zugängen zum Stichtag der Rechnungsstellung.</p>
</body></html>`;
}

/** Stellt die Rechnungsdaten aus dem aktuellen Bestand zusammen. */
function baueRechnung(db, m, monatISO) {
  const p = preisAnteilig(db, m, monatISO);
  const nr = `${monatISO.replace("-", "")}-${m.id.slice(-4).toUpperCase()}`;
  const positionen = [{ text: `Grundgebühr Tarif ${p.t.name}`, menge: "", einzel: "", betrag: eur(p.grund) }];
  for (const l of p.zeilen) {
    if (!l.anzahl) continue;
    const anteilig = Math.abs(l.anzahl - l.ganz) > 0.005;
    positionen.push({ text: `Zugang ${l.rolle.label}${anteilig ? " (anteilig)" : ""}`,
      menge: anteilig ? n2(l.anzahl) : zahl(l.ganz),
      einzel: l.einzel === 0 ? "inklusive" : eur(l.einzel), betrag: eur(l.netto) });
  }
  if (p.st.rabatt > 0) positionen.push({ text: `Mengenstaffel ${p.st.label} Zugänge`, menge: "", einzel: "", betrag: `−${Math.round(p.st.rabatt * 100)} %` });
  const netto = p.gesamt;
  const steuer = Math.round(netto * db.betreiber.steuersatz) / 100;
  return { nummer: nr, datum: heute(), faellig: addDays(heute(), db.betreiber.zahlungsziel),
    zeitraum: `${MON[Number(monatISO.slice(5, 7)) - 1]} ${monatISO.slice(0, 4)}`,
    mandantId: m.id, mandant: m.name, anschrift: m.anschrift, betreiber: db.betreiber,
    positionen, netto, rabattBetrag: 0, rabattText: "", steuersatz: db.betreiber.steuersatz,
    steuer, brutto: Math.round((netto + steuer) * 100) / 100,
    zugaenge: p.zahlendStichtag, zugaengeAnteilig: p.zahlendAnteilig, tarif: p.t.name };
}
