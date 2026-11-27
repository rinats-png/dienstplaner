/* ==========================================================================
   BEREICHSPLAN — Archivierung des Änderungsprotokolls, Oberfläche (WP-19.4, E7 b)

   Kein JSX (createElement, wie bereichsplan-pflege.js): bereichsplan.jsx, kern.jsx und
   einstellungen.jsx bleiben, wie sie sind (V4-Pins). Nur Leitung (zugriff.js `protokollArchiv`,
   wie am Server A7). Der Server bleibt maßgeblich (POST /api/bereichsprotokoll-archivieren).

   Was die Oberfläche tut:
   - Zustand sichtbar machen: Zahl und Größe der archivierbaren Einträge, laufende Lücke
     (Kontingent erschöpft), Höchstzahl der Lückenvermerke, bisherige Archivierungsvermerke.
   - EXPORT: die Einträge samt Anzahl, Bytes und Prüfsumme (SHA-256, wie am Server) als
     JSON-Paket herunterladen, optional mit Aktenzeichen (E9, vorhandenes Muster, kein Freitext).
     Der Export ENTFERNT NICHTS. Der Download allein ist kein Nachweis der Archivierung; die
     Ablage gehört in das DMS bzw. an einen geeigneten Ort des Kunden (E8), nicht auf den Server.
   - ENTFERNEN aus dem Live-Protokoll: in der Oberfläche GESPERRT (ARCHIV_ENTFERNEN_FREIGEGEBEN),
     solange Ablauf (E8, E10, E11) und Freigaben nicht geklärt sind (Betreiberentscheidung
     2026-11-26). Die Sperre sitzt im Auslöser selbst (bereichsArchivEntfernen), nicht nur an
     der Schaltfläche; ohne Freigabe geht nie eine Anfrage hinaus.
   Fail-closed: Fehler, unlesbares Protokoll, ein nicht ausgeführter Download — immer sichtbar
   (role="alert"), nie „erfolgreich“.
   ========================================================================== */
import { createElement as h, useState } from "react";
import {
  bereichsprotokollExport, bereichsprotokollPruefsumme, bereichsprotokollLueckeOffen, bereichsprotokollLueckeHoechstzahl,
  BEREICH_PROTOKOLL_ART, BEREICH_ARCHIV_ART,
} from "../../server/lib/modul-bereichsplan.mjs";
import { AKTENZEICHEN_MUSTER } from "../../server/lib/branchenmodule.mjs";
import { lade } from "../lib/download.js";
import { bereichsprotokollArchivierenSenden } from "../speicher.js";

/** Das Entfernen aus dem Live-Protokoll ist nicht freigegeben (Ablauf und Freigaben offen). Erst der Betreiber ändert das — hier, an einer Stelle. */
export const ARCHIV_ENTFERNEN_FREIGEGEBEN = false;

const RAHMEN = { border: "1px solid currentColor", borderRadius: "var(--v4-r-klein)", padding: 12, overflowWrap: "anywhere" };
const ZEILE = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const zeitText = (z) => String(z || "").slice(0, 16).replace("T", " ") || "?";

/**
 * Zustand des Änderungsprotokolls für die Anzeige (rein). `lesbar: false`, wenn das Protokoll vorhanden, aber keine Liste ist.
 * @param {any} einstellungen Einstellungen des Betriebs
 */
export function bereichsArchivStatus(einstellungen) {
  const e = istObjekt(einstellungen) ? einstellungen : {};
  const lesbar = e.modulprotokoll === undefined || Array.isArray(e.modulprotokoll);
  if (!lesbar) return { lesbar: false, vorhanden: 0, bytes: 0, luecke: null, hoechstzahl: false, vermerke: [] };
  const liste = e.modulprotokoll || [];
  const ex = bereichsprotokollExport(e);
  return {
    lesbar: true,
    vorhanden: ex.vorhanden,
    bytes: ex.bytes,
    luecke: bereichsprotokollLueckeOffen(liste),
    hoechstzahl: bereichsprotokollLueckeHoechstzahl(liste),
    vermerke: liste.filter((x) => istObjekt(x) && x.art === BEREICH_ARCHIV_ART).reverse(),
  };
}

/**
 * Das Exportpaket (A2): `{ art, modul, erstellt, anzahl, bytes, pruefsumme, eintraege }` plus optional `aktenzeichen`. `bytes` und
 * `pruefsumme` gelten für `JSON.stringify(eintraege)` (UTF-8, SHA-256 hex) — dieselben Werte, die der Server beim Archivieren prüft.
 * Ohne Einträge, bei unlesbarem Protokoll, ungültigem Aktenzeichen oder fehlender Prüfsumme: `{ ok: false, grund }` — nie ein leeres Paket.
 * @param {any} einstellungen
 * @param {{ am: string, aktenzeichen?: string }} o
 * @returns {Promise<{ ok: true, text: string, name: string, anzahl: number, bytes: number, pruefsumme: string, aktenzeichen: string | null } | { ok: false, grund: string }>}
 */
export async function bereichsArchivPaket(einstellungen, { am, aktenzeichen } = /** @type {any} */ ({})) {
  const st = bereichsArchivStatus(einstellungen);
  if (!st.lesbar) return { ok: false, grund: "Das Änderungsprotokoll ist nicht lesbar. Es wurde nichts exportiert und nichts geändert." };
  if (st.vorhanden < 1) return { ok: false, grund: "Das Änderungsprotokoll der Zuordnungen enthält keine Einträge, die exportiert werden könnten." };
  const az = typeof aktenzeichen === "string" ? aktenzeichen.trim() : "";
  if (az !== "" && !AKTENZEICHEN_MUSTER.test(az))
    return { ok: false, grund: "Das Aktenzeichen hat nicht die vorgesehene Form (Buchstabenkürzel und Ziffern, höchstens 20 Zeichen, kein Freitext)." };
  if (typeof am !== "string" || am === "") return { ok: false, grund: "Der Zeitpunkt des Exports fehlt." };
  const ex = bereichsprotokollExport(/** @type {any} */ (einstellungen));
  let pruefsumme;
  try { pruefsumme = await bereichsprotokollPruefsumme(ex.text); } catch { pruefsumme = null; }
  if (typeof pruefsumme !== "string" || !/^[0-9a-f]{64}$/.test(pruefsumme))
    return { ok: false, grund: "Die Prüfsumme ließ sich auf diesem Gerät nicht berechnen. Es wurde nichts exportiert." };
  const paket = { art: BEREICH_PROTOKOLL_ART, modul: "bereichsplan", erstellt: am, anzahl: ex.anzahl, bytes: ex.bytes, pruefsumme,
    pruefsummeUeber: "SHA-256 (hex) der UTF-8-Form von JSON.stringify(eintraege)", ...(az ? { aktenzeichen: az } : {}), eintraege: ex.eintraege };
  return { ok: true, text: JSON.stringify(paket, null, 2), name: `aenderungsprotokoll-zuordnungen-${am.slice(0, 10)}-${ex.anzahl}.json`,
    anzahl: ex.anzahl, bytes: ex.bytes, pruefsumme, aktenzeichen: az || null };
}

/**
 * Der Auslöser des destruktiven Schritts (Entfernen aus dem Live-Protokoll). Solange `freigegeben` nicht gilt
 * (Standard: ARCHIV_ENTFERNEN_FREIGEGEBEN = false), geht KEINE Anfrage hinaus. Auch danach nur mit ausdrücklicher Bestätigung
 * der Leitung (`bestaetigt: true`, Export an einem geeigneten Ort abgelegt) und ausdrücklicher Erfolgsantwort des Servers.
 * @param {{ anzahl: number, bytes: number, pruefsumme: string, aktenzeichen?: string | null } | null} paket
 * @param {{ freigegeben?: boolean, bestaetigt?: boolean, senden?: (angabe: any) => Promise<any> }} [o]
 * @returns {Promise<{ ok: true, archiviert: number } | { ok: false, gesperrt?: boolean, grund: string }>}
 */
export async function bereichsArchivEntfernen(paket, { freigegeben = ARCHIV_ENTFERNEN_FREIGEGEBEN, bestaetigt = false, senden = bereichsprotokollArchivierenSenden } = {}) {
  if (freigegeben !== true)
    return { ok: false, gesperrt: true, grund: "Das Entfernen aus dem Änderungsprotokoll ist noch nicht freigegeben. Es wurde nichts entfernt." };
  if (!paket || bestaetigt !== true)
    return { ok: false, grund: "Erst den Export erstellen und bestätigen, dass er an einem geeigneten Ort abgelegt ist. Nichts entfernt." };
  try {
    const d = await senden({ anzahl: paket.anzahl, bytes: paket.bytes, pruefsumme: paket.pruefsumme, exportGespeichert: true,
      ...(paket.aktenzeichen ? { aktenzeichen: paket.aktenzeichen } : {}) });
    if (!d || d.ok !== true || !Number.isInteger(d.archiviert)) return { ok: false, grund: "Der Server hat das Archivieren nicht bestätigt. Nichts gilt als archiviert." };
    return { ok: true, archiviert: d.archiviert };
  } catch (x) {
    return { ok: false, grund: (x && x.message) || "Das Archivieren ist fehlgeschlagen. Nichts gilt als archiviert." };
  }
}


/**
 * Export auslösen: Paket bauen und herunterladen. Ein Fehler beim Bauen oder ein nicht ausgeführter Download ergibt eine
 * Fehlermeldung und KEIN Paket — nie ein „erfolgreich“ ohne Datei. Entfernt nichts.
 * @param {any} einstellungen
 * @param {{ am: string, aktenzeichen?: string, laden?: (name: string, inhalt: string, typ: string) => boolean }} o
 * @returns {Promise<{ paket: any, meldung: { fehler: boolean, text: string } }>}
 */
export async function bereichsArchivExportieren(einstellungen, { am, aktenzeichen, laden = lade }) {
  let r;
  try { r = await bereichsArchivPaket(einstellungen, { am, aktenzeichen }); } catch { r = { ok: false, grund: "Der Export ist fehlgeschlagen. Nichts exportiert." }; }
  if (!r.ok) return { paket: null, meldung: { fehler: true, text: r.grund } };
  let geladen = false;
  try { geladen = laden(r.name, r.text, "application/json") === true; } catch { geladen = false; }
  if (!geladen)
    return { paket: null, meldung: { fehler: true, text: "Der Download wurde auf diesem Gerät nicht ausgeführt. Der Export gilt nicht als erstellt." } };
  return { paket: r, meldung: { fehler: false, text: "Export heruntergeladen. Die Einträge bleiben im Änderungsprotokoll." } };
}

/**
 * Darstellung des Abschnitts (ohne eigenen Zustand, für die Prüfung).
 * @param {{ m: any, aktenzeichen?: string, meldung?: { fehler: boolean, text: string } | null, paket?: any,
 *   aufAktenzeichen?: (w: string) => void, aufExport?: () => void, aufEntfernen?: () => void }} props
 */
export function BereichsArchivAnsicht({ m, aktenzeichen = "", meldung = null, paket = null, aufAktenzeichen, aufExport, aufEntfernen }) {
  const mm = istObjekt(m) ? m : {};
  const st = bereichsArchivStatus(mm.einstellungen);
  const personen = new Map((Array.isArray(mm.personen) ? mm.personen : []).filter(istObjekt).map((p) => [String(p.id), p]));
  const wer = (id) => {
    if (id === null || id === undefined) return "ohne Personenbezug";
    const p = personen.get(String(id));
    return p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() || "?" : "unbekannte Person";
  };
  return h("section", { "aria-label": "Änderungsprotokoll archivieren", style: { ...RAHMEN, display: "grid", gap: 8 } },
    h("h3", { style: { margin: 0, fontSize: 15 } }, "Änderungsprotokoll archivieren (nur Leitung)"),
    !st.lesbar
      ? h("p", { role: "alert", style: { margin: 0 } }, "Das Änderungsprotokoll ist nicht lesbar. Es kann nichts exportiert werden; es wurde nichts geändert.")
      : h("p", { style: { margin: 0 } }, `Im Änderungsprotokoll der Zuordnungen stehen ${st.vorhanden} Einträge (${st.bytes} Bytes), betriebsweit.`),
    st.luecke && h("p", { role: "status", style: { margin: 0 } },
      `Lücke seit ${zeitText(st.luecke.am)}: Das Kontingent von Leitung und Planung ist erschöpft, Änderungen entstehen ohne Einzelnachweis.`),
    st.hoechstzahl && h("p", { role: "status", style: { margin: 0 } },
      "Höchstzahl der Lückenvermerke erreicht: Weitere Änderungen ohne Einzelnachweis bekommen keinen eigenen Vermerk mehr."),
    h("p", { style: { margin: 0 } },
      "Der Export entfernt nichts. Der Download allein ist kein Nachweis der Archivierung: Das Paket gehört in das Dokumentenmanagementsystem des Betriebs "
      + "oder an einen anderen geeigneten Ort des Kunden, nicht auf diesen Server. Auskunft und Löschung für archivierte Einträge bedient der Betrieb dort."),
    h("label", { style: { display: "grid", gap: 4, maxWidth: "100%" } }, "Aktenzeichen (optional, nur Kürzel und Ziffern, kein Freitext)",
      h("input", { value: aktenzeichen, maxLength: 20, style: { maxWidth: "100%", boxSizing: "border-box", width: "100%" }, autoComplete: "off",
        onChange: (ev) => aufAktenzeichen && aufAktenzeichen(ev.target.value) })),
    h("div", { style: ZEILE },
      h("button", { type: "button", onClick: aufExport, disabled: !st.lesbar || st.vorhanden < 1 }, "Änderungsprotokoll exportieren (herunterladen)"),
      h("button", { type: "button", onClick: aufEntfernen, disabled: !ARCHIV_ENTFERNEN_FREIGEGEBEN, "aria-disabled": !ARCHIV_ENTFERNEN_FREIGEGEBEN },
        "Archivieren und aus dem Protokoll entfernen")),
    !ARCHIV_ENTFERNEN_FREIGEGEBEN && h("p", { role: "note", style: { margin: 0 } },
      "Das Entfernen aus dem Änderungsprotokoll ist gesperrt: Der Ablauf der Archivierung (Ablage, Auskunft und Löschung, Aufbewahrungsfrist) "
      + "und die dafür nötigen Freigaben sind noch nicht geklärt. Es wird nichts entfernt."),
    meldung && h("p", { role: meldung.fehler ? "alert" : "status", style: { margin: 0 } }, meldung.text),
    paket && h("p", { role: "status", style: { margin: 0 } },
      `Export: ${paket.anzahl} Einträge, ${paket.bytes} Bytes, Prüfsumme ${paket.pruefsumme}${paket.aktenzeichen ? `, Aktenzeichen ${paket.aktenzeichen}` : ""}. `
      + "Bitte im DMS oder an einem geeigneten Ort ablegen und die Prüfsumme dort vermerken."),
    st.vermerke.length > 0 && h("div", null,
      h("h4", { style: { margin: "4px 0", fontSize: 14 } }, "Bisherige Archivierungsvermerke"),
      h("ul", { style: { margin: 0, paddingLeft: 18, display: "grid", gap: 4 } }, st.vermerke.slice(0, 20).map((v, i) => h("li", { key: `${v.am}-${i}` },
        `${zeitText(v.am)} · ${wer(v.von)}: ${Number.isInteger(v.anzahl) ? v.anzahl : "?"} Einträge archiviert (${zeitText(v.erster)} bis ${zeitText(v.letzter)}), `
        + `${Number.isInteger(v.bytes) ? v.bytes : "?"} Bytes, Prüfsumme ${typeof v.pruefsumme === "string" ? v.pruefsumme : "?"}`
        + `${typeof v.aktenzeichen === "string" ? `, Aktenzeichen ${v.aktenzeichen}` : ""}`)))));
}

/**
 * Abschnitt „Änderungsprotokoll archivieren“ — nur für die Leitung (`k.protokollArchiv`), sonst nichts.
 * @param {{ k: any }} props
 */
export function BereichsArchiv({ k }) {
  const [aktenzeichen, setAktenzeichen] = useState("");
  const [paket, setPaket] = useState(/** @type {any} */ (null));
  const [meldung, setMeldung] = useState(/** @type {{ fehler: boolean, text: string } | null} */ (null));
  if (!k || k.protokollArchiv !== true) return null;
  const m = istObjekt(k.m) ? k.m : {};
  const exportiere = async () => {
    setMeldung(null);
    const r = await bereichsArchivExportieren(m.einstellungen, { am: new Date().toISOString(), aktenzeichen });
    setPaket(r.paket);
    setMeldung(r.meldung);
  };
  const entfernen = async () => {
    const r = await bereichsArchivEntfernen(paket);
    setMeldung({ fehler: !r.ok, text: r.ok ? `${r.archiviert} Einträge archiviert. Bitte die Ansicht neu laden.` : r.grund });
  };
  return h(BereichsArchivAnsicht, { m, aktenzeichen, meldung, paket, aufAktenzeichen: setAktenzeichen, aufExport: exportiere, aufEntfernen: entfernen });
}
