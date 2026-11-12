/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { useState, useEffect, useMemo, useRef } from "react";
import * as SP from "../speicher.js";
import { istUngeplant } from "../istdaten.js";
import { positionHolen, stempelVorgang, geoPruefungAn, MARKIERUNG_TEXT, koordMitGrund } from "../stempelvorgang.js";
import { nachtschwelle, nachtAnteil, einheitAm } from "../../server/lib/fachpruefung.mjs";
import { verknuepfungAnwenden } from "../verknuepfung.js";
import { pad, addDays, dow, between, dim_, dauer } from "../regelwerk.js";
import { C } from "../farben.js";
import { klickbar, Rubrik, Schalter, Btn, Inp, Sel, Field, Seg, Pill } from "../ui/bausteine.jsx";
import { lesbar, NUM } from "../ui/thema.js";
import { useDialogFokus } from "../ui/dialogfokus.js";
import { DOW, MON, heute, fLang, fKurz, fDatum } from "../lib/datum.js";
import { n1 } from "../lib/format.js";
import { Icon } from "../gestalt/icons.jsx";
import { feiertag } from "../../server/lib/feiertage.mjs";
import { SelbstauskunftStatus } from "./selbstauskunft.jsx";
import { AufgabeSymbol, GEO_HINWEIS, pauseVorgabe, PauseFeld } from "./stempeluhr.jsx";
import { KorrekturKarte } from "./korrekturen.jsx";
import { Kontoblatt } from "./kontoblatt.jsx";
import { StempelPuffer } from "./stempelpuffer.jsx";
import { UngeplantHinweis } from "./ungeplanthinweis.jsx";
import { Zelle } from "../ui/leisten.jsx";
import { ABW, abwArt, personTag, urlaubskonto, offeneErfassung, freigabeStand, nachweisStand, auslastung, tagesaufgaben, wunschAm, kontoVerlauf } from "../lib/fachlogik.js";
import { ZUSTELLARTEN, zustellwege } from "../lib/zustellung.js";
import { darfSichBewerben, meineOffenenSchichten } from "../lib/offene-schichten.js";
import { CHECK_ZEITPUNKTE, checkStand } from "../lib/checklisten.js";
import { darfSelbstEintragen, laufendeRunde, selbstplanStand } from "../lib/selbstplanung.js";
import { NOTRUF_ARTEN } from "../lib/notrufe.js";
import { NAV_BETREIBER, NAV_KUNDE, ansichtErlaubt } from "../app/navigation.js";
import { Logo } from "../ui/logo.jsx";
import { urlaubAntragFehler } from "../lib/antragpruefung.js";
import { Fehlerband } from "../gestalt/ansichten.jsx";
import { KrankmeldungenOffen } from "./krankmeldungen-offen.jsx";


export const M_TABS = [
  { id: "heute", label: "Heute", icon: "heute" },
  { id: "plan", label: "Mein Plan", icon: "kalender" },
  { id: "anliegen", label: "Anliegen", icon: "stift" },
  { id: "mehr", label: "Mehr", icon: "menue" },
];

/* ------------------------------- Bausteine ------------------------------- */
export const MKarte = ({ children, onClick, ton, style }) => (
  <div {...klickbar(onClick)} style={{ background: C.flaeche,
    border: `1px solid ${ton === "danger" ? `${C.danger}66` : ton === "warn" ? `${C.warn}66` : C.line}`,
    borderRadius: 18, padding: 16, marginBottom: 10, cursor: onClick ? "pointer" : "default",
    boxShadow: "var(--schatten)", ...style }}>{children}</div>);

export const MZeile = ({ links, rechts, unten, onClick, ton }) => (
  <div {...klickbar(onClick)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 4px",
    minHeight: 46, cursor: onClick ? "pointer" : "default", borderBottom: `1px solid ${C.lineSoft}` }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15.5, fontWeight: 500,
        color: ton === "danger" ? C.danger : ton === "warn" ? C.warn : C.text }}>{links}</div>
      {unten && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 3, lineHeight: 1.4 }}>{unten}</div>}
    </div>
    {rechts}
    {onClick && <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>}
  </div>);

export const MTitel = ({ children, rubrik, rechts }) => (
  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    gap: 12, marginBottom: 18 }}>
    <div>
      {rubrik && <Rubrik style={{ marginBottom: 6 }}>{rubrik}</Rubrik>}
      <h1 style={{ fontSize: 27, fontWeight: 300, letterSpacing: "-.035em", margin: 0, lineHeight: 1.15 }}>
        {children}</h1>
    </div>
    {rechts}
  </div>);

/** Blatt, das von unten hereinfährt — auf dem Telefon die übliche Form. */
export const MBlatt = ({ offen, onClose, titel, children }) => {
  /* WP-40: Fokus hinein, Tab bleibt darin, Escape schließt, Fokus zurück. */
  const blattRef = useRef(null);
  useDialogFokus(blattRef, offen, onClose);
  if (!offen) return null;
  return (
    <div onClick={onClose} className="m-blattrahmen" role="dialog" aria-modal="true" aria-label={titel || "Blatt"}>
      <div ref={blattRef} tabIndex={-1} style={{ outline: "none" }} onClick={(e) => e.stopPropagation()} className="m-blatt">
        <div className="m-griff" aria-hidden="true" />
        {titel && <div className="m-blatttitel">{titel}</div>}
        {children}
      </div>
    </div>);
};

/* ================================ HEUTE ================================= */
export function MHeute({ sitz, akt, setTab, oeffnen }) {
  const m = sitz.mandant, p = sitz.person;
  const d0 = heute();
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const t = personTag(m, p, d0);
  const da = t.dienstId && map[t.dienstId];
  const vorgang = stempelVorgang(m, p, d0);
  const morgen = personTag(m, p, addDays(d0, 1));
  const morgenDa = morgen.dienstId && map[morgen.dienstId];
  const aufgaben = useMemo(() => tagesaufgaben(sitz).filter((a) => a.art !== "stempel"), [m, p.id]);
  const stunde = new Date().getHours();
  const gruss = stunde < 5 ? "Gute Nacht" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
  const wichtig = (m.aushang || []).filter((x) => x.wichtig && (!x.bis || x.bis >= d0));

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <Rubrik>{fLang(d0)}</Rubrik>
        <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.04em", margin: "8px 0 0", lineHeight: 1.12 }}>
          {(p.vorname || "").trim()
            ? <>{gruss},<br /><b style={{ fontWeight: 700 }}>{p.vorname.trim()}</b>.</>
            : <>{gruss}.</>}
        </h1>
      </div>

      {/* Der Dienst des Tages — die wichtigste Karte. Ein offener Dienst von
          gestern (über Mitternacht) geht vor: zuerst ausstempeln. */}
      {vorgang.vortag ? (
        <MKarte style={{ padding: 22 }}>
          <Rubrik>Offener Dienst von gestern</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px" }}>
            {vorgang.st ? `Eingestempelt gestern ${vorgang.st.start}` : "Nachtdienst von gestern ohne Einstempeln"}</div>
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : da ? (
        <MKarte style={{ padding: 22, background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
          <Rubrik style={{ color: lesbar(da.farbe) }}>Dein Dienst heute</Rubrik>
          <div style={{ fontSize: 27, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px" }}>
            {da.name}</div>
          <div style={{ fontSize: 17, color: C.dim, ...NUM }}>
            {da.start} – {da.ende} · {n1(dauer(da))} h</div>
          {da.ort && <div style={{ fontSize: 14, color: C.dimmer, marginTop: 5 }}>{da.ort}</div>}
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : vorgang.offen ? (
        /* Eingestempelt, aber heute kein Dienst (mehr) im Plan — etwa nach
           einer Planänderung. Der Beginn bleibt sichtbar und beendbar. */
        <MKarte style={{ padding: 22 }}>
          <Rubrik>Offener Dienst ohne Plan</Rubrik>
          <div style={{ fontSize: 23, fontWeight: 650, letterSpacing: "-.03em", margin: "9px 0 4px", ...NUM }}>
            Eingestempelt {vorgang.st.start}</div>
          <div style={{ marginTop: 18 }}><MStempel sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></div>
        </MKarte>
      ) : istUngeplant((m.erfassung || {})[`${p.id}|${d0}`]) ? (
        <MKarte style={{ padding: 22 }}><UngeplantHinweis m={m} p={p} d={d0} /></MKarte>
      ) : (
        <MKarte style={{ padding: 22, textAlign: "center" }}>
          <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>
            {t.abwesenheit ? abwArt(t.abwesenheit.art).label : "Heute frei"}</div>
          <div style={{ fontSize: 14.5, color: C.dim }}>
            {t.abwesenheit ? `bis ${fDatum(t.abwesenheit.bis)}`
              : morgenDa ? `Nächster Dienst morgen: ${morgenDa.name} ab ${morgenDa.start}`
                : morgen.quelle === "entwurf" ? "Der Plan für morgen ist noch nicht veröffentlicht." : "Auch morgen kein Dienst."}
          </div>
        </MKarte>)}

      <KorrekturKarte sitz={sitz} akt={akt} />

      {da && morgenDa && (
        <MKarte style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 13 }}>
          <Zelle da={morgenDa} size={34} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, color: C.dimmer }}>Morgen</div>
            <div style={{ fontSize: 15, fontWeight: 500, ...NUM }}>
              {morgenDa.name} · {morgenDa.start}–{morgenDa.ende}</div>
          </div>
        </MKarte>)}

      {wichtig.length > 0 && wichtig.map((x) => (
        <MKarte key={x.id} ton="danger" onClick={() => oeffnen("aushang")}>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
            <span style={{ color: C.danger, fontSize: 17, fontWeight: 700 }}>!</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 620 }}>{x.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{x.text}</div>
            </div>
          </div>
        </MKarte>))}

      {aufgaben.length > 0 && (<>
        <Rubrik style={{ margin: "26px 0 12px" }}>Das wartet auf dich</Rubrik>
        {aufgaben.map((a, i) => (
          <MKarte key={i} ton={a.dringend ? "danger" : undefined}
            onClick={() => { if (a.ziel === "meine") setTab("plan"); else if (a.ziel === "antraege" || a.ziel === "boerse") setTab("anliegen"); else oeffnen(a.ziel); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 14, flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700,
                background: a.dringend ? C.dangerLight : C.bg,
                color: a.dringend ? C.danger : C.dim }}><AufgabeSymbol art={a.art} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 620 }}>{a.titel}</div>
                <div style={{ fontSize: 13, color: C.dim, marginTop: 3, lineHeight: 1.4 }}>{a.text}</div>
              </div>
              <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>
            </div>
          </MKarte>))}
      </>)}

      {aufgaben.length === 0 && (
        <MKarte style={{ textAlign: "center", padding: 30 }}>
          <div style={{ color: C.ok, marginBottom: 8, display: "flex", justifyContent: "center" }}><Icon n="kreis-haken" size={36} /></div>
          <div style={{ fontSize: 15.5, fontWeight: 600 }}>Nichts zu erledigen</div>
        </MKarte>)}
    </div>);
}

/** Große Stempelfläche — das häufigste Tippen überhaupt. */
export function MStempel({ sitz, akt, vorgang }) {
  const m = sitz.mandant, p = sitz.person;
  const { datum, st, vortag, veraltet, nachtEnde } = vorgang || stempelVorgang(m, p, heute());
  const geoAn = geoPruefungAn(m);
  const [laeuft, setLaeuft] = useState(false);
  const [pause, setPause] = useState(() => pauseVorgabe(m, p, datum));
  const stempeln = (art, tag = datum) => {
    setLaeuft(true);
    /* Gesperrt bis zum Ende, auch der Wiederholungen nach 429 (Review-Auflage N1). */
    positionHolen(geoAn, (k, grund) => { const ort = koordMitGrund(k, grund); Promise.resolve(akt.stempeln(p.id, tag, art, ort, art === "ende" ? pause : null)).finally(() => setLaeuft(false)); });
  };
  const Flaeche = ({ kind, onClick, children }) => (
    <button onClick={onClick} disabled={laeuft} className={`btn btn-${kind}`}
      style={{ width: "100%", height: 56, fontSize: 16.5, fontWeight: 650, borderRadius: 18 }}>
      {laeuft ? (geoAn ? "Standort wird geprüft …" : "Wird gespeichert …") : children}</button>);

  /* Nachtdienst von gestern ohne Einstempeln (WP-17, F1/W3). */
  if (!st && nachtEnde) return (<>
    <div style={{ fontSize: 14, color: C.dim, marginBottom: 11, lineHeight: 1.45 }}>
      Nachtdienst von gestern ohne Einstempeln? Das Dienstende lässt sich noch erfassen; den Beginn ergänzt die Leitung.</div>
    <Flaeche kind="ok" onClick={() => stempeln("ende")}>Dienstende stempeln</Flaeche>
    <div style={{ height: 10 }} />
    <Flaeche kind="quiet" onClick={() => stempeln("start", heute())}>Einstempeln</Flaeche></>);
  if (!st) return (<>
    <Flaeche kind="primary" onClick={() => stempeln("start")}>Einstempeln</Flaeche>
    {geoAn && <div style={{ fontSize: 12, color: C.dimmer, marginTop: 9, lineHeight: 1.45 }}>{GEO_HINWEIS}</div>}</>);
  /* Beginn über 20 Stunden alt: kein normaler Abschluss. Das Ende lässt sich
     trotzdem erfassen (der Server markiert es START_VERALTET), damit nichts
     verloren geht; die Arbeitszeit ergänzt die Leitung. */
  if (!st.ende && veraltet) return (<>
    <div style={{ fontSize: 14, color: C.warn, marginBottom: 11, lineHeight: 1.45, ...NUM }}>
      {MARKIERUNG_TEXT.START_VERALTET} (Beginn {st.start}). Die Arbeitszeit ergänzt die Leitung.</div>
    <Flaeche kind="quiet" onClick={() => stempeln("ende")}>Ende trotzdem erfassen</Flaeche></>);
  if (!st.ende) return (<>
    <div style={{ fontSize: 14, color: C.dim, marginBottom: 11, ...NUM }}>
      Eingestempelt {vortag ? "gestern " : ""}{st.start}{st.ortStart ? ` · ${st.ortStart}` : ""}{st.vorlaeufig ? " · vorläufig (offline gespeichert)" : ""}</div>
    <div style={{ marginBottom: 10 }}><PauseFeld wert={pause} setWert={setPause} gross /></div>
    <Flaeche kind="ok" onClick={() => stempeln("ende")}>Ausstempeln</Flaeche></>);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      {st.vorlaeufig ? <Pill tone="warn">vorläufig (offline gespeichert)</Pill> : <Pill tone="ok">Dienst erfasst</Pill>}
      <span style={{ fontSize: 14, color: C.dim, ...NUM }}>{st.start || "–"} – {st.ende}</span>
    </div>);
}

/* =============================== MEIN PLAN ============================== */
export function MPlan({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ansicht, setAnsicht] = useState("liste");
  const [schnell, setSchnell] = useState("alle");
  const [ym, setYm] = useState(heute().slice(0, 7));
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const [gewaehlt, setGewaehlt] = useState(null);
  const offen = offeneErfassung(m, ich, addDays(heute(), -1));
  const frei = freigabeStand(m, ym);

  const tage = Array.from({ length: 42 }, (_, i) => addDays(heute(), i))
    .map((d) => ({ d, t: personTag(m, ich, d) }))
    .filter((x) => {
      const da = x.t.dienstId && map[x.t.dienstId];
      if (schnell === "dienst") return !!x.t.dienstId;
      if (schnell === "frei") return !x.t.dienstId;
      if (schnell === "nacht") return da && nachtAnteil(da, m.einstellungen) >= nachtschwelle(m.einstellungen);
      if (schnell === "we") return dow(x.d) >= 5;
      return x.t.dienstId || x.t.abwesenheit;
    });

  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (
    <div>
      <MTitel rubrik={frei ? `Freigegeben · Stand ${frei.stand}` : "Entwurf"}
        rechts={<Seg value={ansicht} onChange={setAnsicht}
          options={[{ id: "liste", label: "Liste" }, { id: "monat", label: "Monat" }]} />}>
        Mein Plan</MTitel>

      {/* Swipebare Schnellfilter — auf dem Telefon schneller als jedes Auswahlfeld */}
      <div className="reiterreihe reiterreihe-umbruch" style={{ marginBottom: 16 }}>
        {[["alle", "Alle"], ["dienst", "Nur Dienste"], ["frei", "Nur frei"],
          ["nacht", "Nachtdienste"], ["we", "Wochenende"]].map(([id, l]) => (
          <button key={id} onClick={() => setSchnell(id)} className="btn btn-sm"
            style={{ background: schnell === id ? C.accent : C.flaeche,
              borderColor: schnell === id ? C.accent : C.line,
              color: schnell === id ? C.aufAkzent : C.dim, fontWeight: schnell === id ? 650 : 500 }}>
            {l}</button>))}
      </div>

      {/* WP-15: eigene Zeiten-Anträge (Selbstauskunft) — auch in der Smartphone-Ansicht. */}
      <SelbstauskunftStatus m={m} ich={ich} onErgebnis={akt.uebernehmeSelbstauskunft} melde={akt.melde} />

      {offen.length > 0 && (
        <MKarte ton="warn" onClick={() => oeffnen("zeiten")}>
          <MZeile ton="warn" links={`${offen.length} Zeiten bestätigen`}
            unten="Solange offen, bleibt dein Stundenkonto eine Hochrechnung" onClick={() => {}} />
        </MKarte>)}

      {ansicht === "liste" ? (
        tage.length === 0
          ? <MKarte style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Keine Dienste in den nächsten sechs Wochen</div>
            </MKarte>
          : tage.map(({ d, t }) => {
            const da = t.dienstId && map[t.dienstId];
            const istHeute = d === heute();
            return (
              <MKarte key={d} onClick={() => setGewaehlt({ datum: d, t })}
                style={{ padding: 16, display: "flex", alignItems: "center", gap: 15,
                  outline: istHeute ? `2px solid ${C.accent}` : "none" }}>
                <div style={{ width: 50, flexShrink: 0, textAlign: "center" }}>
                  <div style={{ fontSize: 11.5, color: C.dimmer, textTransform: "uppercase",
                    letterSpacing: ".07em" }}>{DOW[dow(d)]}</div>
                  <div style={{ fontSize: 23, fontWeight: 650, lineHeight: 1.1, ...NUM,
                    color: istHeute ? C.accent : feiertag(d, m.bundesland) ? C.danger : C.text }}>
                    {Number(d.slice(8))}</div>
                  <div style={{ fontSize: 10.5, color: C.dimmer, ...NUM }}>{MON[Number(d.slice(5, 7)) - 1].slice(0, 3)}</div>
                </div>
                <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2,
                  background: da ? lesbar(da.farbe, 3) : t.abwesenheit ? lesbar(abwArt(t.abwesenheit.art).farbe, 3) : "transparent" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-.015em" }}>
                    {da ? da.name : abwArt(t.abwesenheit.art).label}</div>
                  <div style={{ fontSize: 14, color: C.dim, marginTop: 3, ...NUM }}>
                    {da ? `${da.start} – ${da.ende} · ${n1(dauer(da))} h` : `bis ${fDatum(t.abwesenheit.bis)}`}
                  </div>
                  {da && da.ort && <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 2 }}>{da.ort}</div>}
                </div>
                <span aria-hidden="true" style={{ color: C.dimmer, display: "flex", flexShrink: 0 }}><Icon n="chevron-rechts" size={20} /></span>
              </MKarte>);
          })
      ) : (
        <MKarte style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <Btn size="sm" onClick={() => shift(-1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
            <Btn size="sm" onClick={() => shift(1)} aria-label="Weiter"><Icon n="chevron-rechts" size={16} /></Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
            {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11,
              fontWeight: 600, color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {zellen.map((d, i) => {
              if (!d) return <div key={i} />;
              const t = personTag(m, ich, d);
              const da = t.dienstId && map[t.dienstId];
              return (
                <div key={d} {...klickbar(() => setGewaehlt({ datum: d, t }),
                  `${fKurz(d)}: ${da ? da.name : t.abwesenheit ? abwArt(t.abwesenheit.art).label : "frei"}`)}
                  style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 2,
                    background: da ? `${da.farbe}1C` : t.abwesenheit ? `${abwArt(t.abwesenheit.art).farbe}1C` : C.bg,
                    outline: d === heute() ? `2px solid ${C.accent}` : "none" }}>
                  <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(String(d).slice(8))}</span>
                  {(da || t.abwesenheit) && <span style={{ fontSize: 11, fontWeight: 700, ...NUM,
                    color: da ? lesbar(da.farbe) : lesbar(abwArt(t.abwesenheit.art).farbe) }}>
                    {da ? da.kurz : abwArt(t.abwesenheit.art).kurz}</span>}
                </div>);
            })}
          </div>
        </MKarte>)}

      <MBlatt offen={!!gewaehlt} onClose={() => setGewaehlt(null)}
        titel={gewaehlt ? fLang(gewaehlt.datum) : ""}>
        {gewaehlt && (() => {
          const da = gewaehlt.t.dienstId && map[gewaehlt.t.dienstId];
          const w = wunschAm(m, ich.id, gewaehlt.datum);
          return (<>
            {da && (
              <MKarte style={{ background: `${da.farbe}0E`, border: `1px solid ${da.farbe}33` }}>
                <div style={{ fontSize: 20, fontWeight: 650 }}>{da.name}</div>
                <div style={{ fontSize: 15.5, color: C.dim, marginTop: 4, ...NUM }}>
                  {da.start} – {da.ende} · {n1(dauer(da))} h</div>
                {da.ort && <div style={{ fontSize: 13.5, color: C.dimmer, marginTop: 4 }}>{da.ort}</div>}
                {nachtAnteil(da, m.einstellungen) > 0 && <div style={{ fontSize: 13, color: C.violet, marginTop: 8, ...NUM }}>
                  davon {n1(nachtAnteil(da, m.einstellungen))} h Nachtarbeit</div>}
              </MKarte>)}
            {da && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind="primary" style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.tauschAusPlan(gewaehlt.datum); setGewaehlt(null); }}>
                  Tausch für diesen Tag suchen</Btn>
                <Btn style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.oeffneAntrag(gewaehlt.datum); setGewaehlt(null); }}>
                  Frei beantragen</Btn>
              </div>)}
            {!da && gewaehlt.datum >= heute() && (
              <div style={{ display: "grid", gap: 10 }}>
                <Btn kind={w && w.art === "moechte" ? "primary" : "plain"}
                  style={{ height: 50, borderRadius: 16, fontSize: 15.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  Würde an diesem Tag gern arbeiten</Btn>
              </div>)}
            {da && gewaehlt.datum >= heute() && (
              <div style={{ marginTop: 10 }}>
                <Btn kind={w && w.art === "lieber_nicht" ? "danger" : "quiet"}
                  style={{ width: "100%", height: 46, borderRadius: 16, fontSize: 14.5 }}
                  onClick={() => { akt.setzeWunsch(ich.id, gewaehlt.datum); setGewaehlt(null); }}>
                  {w ? (w.art === "moechte" ? "Doch lieber nicht" : "Wunsch zurücknehmen") : "Lieber nicht arbeiten"}</Btn>
              </div>)}
          </>);
        })()}
      </MBlatt>
    </div>);
}

/* =============================== ANLIEGEN =============================== */
export function MAnliegen({ sitz, akt, oeffnen }) {
  const m = sitz.mandant, ich = sitz.person;
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const meine = m.anfragen.filter((a) => a.personId === ich.id)
    .sort((a, b) => (a.erstellt < b.erstellt ? 1 : -1));
  const einsatz = meine.filter((a) => a.typ === "einsatz" && a.status === "offen");
  const boerse = m.anfragen.filter((a) => a.typ === "tausch" && a.status === "offen"
    && !a.partnerId && a.personId !== ich.id);
  const ktoV = useMemo(() => kontoVerlauf(m, ich, heute().slice(0, 7), 6), [m, ich.id]);
  const ktoJetzt = ktoV.length ? ktoV[ktoV.length - 1].kto : 0;
  const ktoTrend = ktoV.length > 1 ? ktoJetzt - ktoV[0].kto : 0;

  return (
    <div>
      <MTitel rubrik="Deine Vorgänge">Anliegen</MTitel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneAntrag(null)}>Frei beantragen</Btn>
        <Btn kind="danger" style={{ height: 52, borderRadius: 17, fontSize: 15 }}
          onClick={() => akt.oeffneKrankmeldung(ich.id)}>Krank melden</Btn>
      </div>
      {/* RB-2: Status der eigenen Krankmeldung (eingegangen / vorläufig bestätigt). */}
      <KrankmeldungenOffen sitz={sitz} akt={akt} />

      {einsatz.length > 0 && (<>
        <Rubrik style={{ marginBottom: 11 }}>Einsatzanfragen</Rubrik>
        {einsatz.map((a) => {
          const da = map[a.dienstId];
          return (
            <MKarte key={a.id} ton="danger">
              <div style={{ fontSize: 16, fontWeight: 620 }}>{fLang(a.von)}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 4, ...NUM }}>
                {da ? `${da.name} · ${da.start}–${da.ende} · ${n1(dauer(da))} h` : a.dienstId}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                <Btn kind="ok" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, true)}>Zusagen</Btn>
                <Btn kind="quiet" style={{ height: 46, borderRadius: 15 }}
                  onClick={() => akt.beantworteEinsatz(a.id, false)}>Absagen</Btn>
              </div>
            </MKarte>);
        })}
      </>)}

      {boerse.length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Tauschbörse · {boerse.length} offen</Rubrik>
        {boerse.slice(0, 6).map((a) => {
          const p = m.personen.find((x) => x.id === a.personId);
          const t = p && personTag(m, p, a.von);
          const da = t && map[t.dienstId];
          const gemeldet = (a.interessenten || []).includes(ich.id);
          return (
            <MKarte key={a.id}>
              <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
                <Zelle da={da} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{fKurz(a.von)}{da ? ` · ${da.name}` : ""}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 3 }}>
                    {p ? `${p.vorname} ${p.nachname}` : "?"} sucht Tausch</div>
                </div>
              </div>
              {a.text && <div style={{ fontSize: 13, color: C.dimmer, marginTop: 9 }}>„{a.text}"</div>}
              <Btn kind={gemeldet ? "quiet" : "primary"} style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => gemeldet ? akt.tauschAbmelden(a.id) : akt.tauschMelden(a.id)}>
                {gemeldet ? "Meldung zurücknehmen" : "Ich übernehme"}</Btn>
            </MKarte>);
        })}
      </>)}

      <Rubrik style={{ margin: "28px 0 12px" }}>Mein Stundenkonto</Rubrik>
      <Kontoblatt m={m} verlauf={ktoV} jetzt={ktoJetzt} trend={ktoTrend} />

      {meine.filter((a) => a.typ !== "einsatz").length > 0 && (<>
        <Rubrik style={{ margin: "24px 0 11px" }}>Meine Anträge</Rubrik>
        <MKarte style={{ padding: "4px 18px" }}>
          {meine.filter((a) => a.typ !== "einsatz").slice(0, 8).map((a) => (
            <MZeile key={a.id}
              links={`${a.typ === "tausch" ? "Tausch" : abwArt(a.art).label} ${fKurz(a.von)}`}
              unten={a.bis !== a.von ? `bis ${fKurz(a.bis)}` : a.antwort || null}
              rechts={<Pill size="sm" tone={a.status === "offen" ? "warn" : a.status === "genehmigt" ? "ok" : "danger"}>
                {a.status}</Pill>} />))}
        </MKarte>
      </>)}
    </div>);
}

/* ================================= MEHR ================================= */
export function MMehr({ sitz, akt, oeffnen, aufRechner }) {
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const nachweise = p.qualifikationen.map((q) => nachweisStand(m, p, q))
    .filter((s) => s.stand === "abgelaufen" || s.stand === "laeuft_ab");
  const e = m.einheiten.find((x) => x.id === einheitAm(p, heute()));
  const ausl = auslastung(m, p, heute().slice(0, 7));

  return (
    <div>
      <MTitel rubrik={e ? e.name : ""}>{p.vorname} {p.nachname}</MTitel>

      <MKarte style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[["Auslastung", ausl.pct == null ? "–" : `${ausl.pct} %`], ["Wochenstunden", `${n1(p.wochenstunden)} h`],
          ["Urlaub übrig", (() => { const r = urlaubskonto(m, p, new Date().getFullYear()).rest; return r == null ? "–" : `${r} Tage`; })()]].map(([l, v]) => (
          <div key={l} style={{ flex: "1 1 90px" }}>
            <div style={{ fontSize: 11.5, color: C.dimmer }}>{l}</div>
            <div style={{ fontSize: 19, fontWeight: 650, marginTop: 3, ...NUM }}>{v}</div>
          </div>))}
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        {(() => {
          const t = personTag(m, p, heute());
          const st = t && t.dienstId ? checkStand(m, p.id, heute(), t.dienstId) : null;
          if (!st) return null;
          return (
            <MZeile links="Checkliste heute"
              rechts={st.vollstaendig ? <span style={{ color: C.ok, display: "flex" }}><Icon n="haken" size={18} strokeWidth={2.2} /></span> : `${st.fertig}/${st.gesamt}`}
              unten={st.vollstaendig ? "alles erledigt"
                : `noch ${st.pflichtGesamt - st.pflichtFertig} Pflichtpunkte`}
              onClick={() => oeffnen("checkliste")} />);
        })()}
        {laufendeRunde(m) && (
          <MZeile links="Selbstplanung"
            rechts={selbstplanStand(m, laufendeRunde(m), p.id).eingetragen || undefined}
            unten={`Bis ${fKurz(laufendeRunde(m).schliesst)} deine Dienste wählen`}
            onClick={() => oeffnen("selbstplan")} />)}
        <MZeile links="Offene Schichten"
          rechts={meineOffenenSchichten(m, p.id).length || undefined}
          unten={meineOffenenSchichten(m, p.id).length
            ? "Dienste, die du übernehmen kannst" : "gerade nichts frei"}
          onClick={() => oeffnen("offene")} />
        <MZeile links="Hilfe anfordern"
          unten="Notruf an die Schichtverantwortung"
          onClick={() => oeffnen("notruf")} />
        <MZeile links="Benachrichtigungen" unten="E-Mail und Gerät einstellen"
          onClick={() => oeffnen("melden")} />
        <MZeile links="Mitteilungen" unten={ungelesen ? `${ungelesen} ungelesen` : "keine neuen"}
          rechts={ungelesen > 0 ? <Pill size="sm" tone="danger">{ungelesen}</Pill> : null}
          onClick={() => oeffnen("post")} />
        <MZeile links="Verfügbarkeit" unten="Wann kannst du arbeiten?"
          onClick={() => akt.oeffneVerfuegbarkeit(p.id)} />
        <MZeile links="Wunschdienste" unten="Gern oder lieber nicht"
          onClick={() => oeffnen("wuensche")} />
        <MZeile links="Meine Nachweise" ton={nachweise.some((x) => x.stand === "abgelaufen") ? "danger" : undefined}
          unten={nachweise.length ? nachweise.map((x) => x.qual.name).join(", ") : "alle gültig"}
          onClick={() => oeffnen("nachweise")} />
        <MZeile links="Schwarzes Brett" unten={`${(m.aushang || []).length} Aushänge`}
          onClick={() => oeffnen("aushang")} />
        <MZeile links="Kalender abonnieren" unten="Dienste im Telefonkalender"
          onClick={() => akt.exportICS(p.id)} />
      </MKarte>

      <MKarte style={{ padding: "4px 18px" }}>
        <MZeile links="Feldmodus" unten="Größere Schrift, maximaler Kontrast"
          rechts={<Schalter an={!!p.kontrastmodus} label="Feldmodus" onChange={() => akt.setzeKontrastmodus(!p.kontrastmodus)} />} />
        {/* Erscheinungsbild: Hell, Dunkel oder dem Gerät folgen — die Wahl bleibt gespeichert. */}
        <div style={{ padding: "15px 4px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontSize: 15.5, fontWeight: 500 }}>Erscheinungsbild</div>
          <div style={{ fontSize: 13, color: C.dimmer, marginTop: 3, lineHeight: 1.4 }}>„Wie das Gerät“ folgt der Systemeinstellung, auch wenn sie sich später ändert.</div>
          <div style={{ marginTop: 10 }}>
            <Seg value={p.thema || "auto"} onChange={(v) => akt.setzeMeineEinstellung("thema", v)}
              options={[{ id: "hell", label: "Hell" }, { id: "dunkel", label: "Dunkel" }, { id: "auto", label: "Wie das Gerät" }]} />
          </div>
        </div>
        <MZeile links="Rundgang wiederholen" unten="Wie CENTRIC funktioniert, in fünf Schritten"
          onClick={akt.starteEinfuehrung} />
        <MZeile links="Rechneransicht" unten="Alle Tabellen und Auswertungen"
          onClick={aufRechner} />
      </MKarte>

      <div style={{ padding: "10px 4px 0" }}>
        <Btn kind="quiet" style={{ width: "100%", height: 46, borderRadius: 15 }}
          onClick={akt.abmelden}>Abmelden</Btn>
      </div>
      <div style={{ textAlign: "center", fontSize: 11.5, color: C.dimmer, padding: "18px 0 6px" }}>
        CENTRIC · {m.name}
      </div>
    </div>);
}

/* =========================== MOBILE SCHALE ============================== */
/** Verknüpfung des Manifests für diese Sitzung (WP-37): Navigation samt Rechten wie in der Oberfläche. */
export function verknuepfungFuer(sitz, ziel) {
  if (!sitz || !ziel) return null;
  const betreiber = sitz.rolle === "betreiber";
  const nav = betreiber ? NAV_BETREIBER : NAV_KUNDE.filter(([, , recht]) => ansichtErlaubt(sitz, recht));
  const mobil = !betreiber && sitz.person.rolle === "mitarbeiter" && sitz.person.imSchichtdienst !== false;
  return verknuepfungAnwenden({ betreiber, navIds: nav.map(([id]) => id),
    personId: betreiber ? null : sitz.person.id, mobil }, ziel);
}

export function MobilSchale({ sitz, akt: aktRoh, aufRechner, dialoge, startTab }) {
  const [tab, setTab] = useState(startTab || "heute");
  useEffect(() => { if (startTab) setTab(startTab); }, [startTab]);   // Verknüpfung (WP-37)
  const [blatt, setBlatt] = useState(null);
  const [antrag, setAntrag] = useState(null);
  const [antragFehler, setAntragFehler] = useState("");
  const m = sitz.mandant, p = sitz.person;
  const ungelesen = (m.nachrichten || []).filter((n) => n.personId === p.id && !n.gelesen).length;
  const oeffnen = (was) => setBlatt(was);
  // Der Antrag wird hier als Blatt gezeigt, nicht als Ansichtswechsel
  const akt = { ...aktRoh, oeffneAntrag: (d) => setAntrag({ art: "urlaub",
    von: d || heute(), bis: d || heute(), text: "" }) };

  return (
    <div className="m-schale">
      <header className="m-kopf">
        <Logo size={24} />
        <span className="m-wort">CENTRIC</span>
        <button onClick={() => oeffnen("post")} className="m-postknopf"
          aria-label={`Mitteilungen${ungelesen ? `, ${ungelesen} ungelesen` : ""}`}>
          <Icon n="brief" size={19} />
          {ungelesen > 0 && <span className="m-zahl">{ungelesen}</span>}
        </button>
      </header>

      <main style={{ padding: "20px 18px 10px" }}>
        {tab === "heute" && <MHeute sitz={sitz} akt={akt} setTab={setTab} oeffnen={oeffnen} />}
        {tab === "plan" && <MPlan sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "anliegen" && <MAnliegen sitz={sitz} akt={akt} oeffnen={oeffnen} />}
        {tab === "mehr" && <MMehr sitz={sitz} akt={akt} oeffnen={oeffnen} aufRechner={aufRechner} />}
      </main>

      <nav className="m-tabs" aria-label="Bereiche">
        {M_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? "on" : ""}
            aria-current={tab === t.id ? "page" : undefined}>
            <Icon n={t.icon} size={22} />{t.label}
          </button>))}
      </nav>

      {/* Blätter für die selteneren Ansichten */}
      <MBlatt offen={blatt === "post"} onClose={() => { akt.alleGelesen(); setBlatt(null); }} titel="Mitteilungen">
        {(m.nachrichten || []).filter((n) => n.personId === p.id).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>
              Hier erscheinen Entscheidungen zu deinen Anträgen und Änderungen an deinen Diensten.</div>
          : (m.nachrichten || []).filter((n) => n.personId === p.id).slice(0, 30).map((n) => (
            <MKarte key={n.id} ton={n.art === "warn" ? "warn" : undefined}
              style={{ borderLeft: n.gelesen ? undefined : `3px solid ${n.art === "warn" ? C.warn : C.accent}` }}>
              <div style={{ fontSize: 15.5, fontWeight: n.gelesen ? 500 : 650 }}>{n.titel}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.45 }}>{n.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 8, ...NUM }}>{n.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "checkliste"} onClose={() => setBlatt(null)} titel="Checkliste">
        {(() => {
          const t = personTag(m, p, heute());
          const st = t && t.dienstId ? checkStand(m, p.id, heute(), t.dienstId) : null;
          if (!st) return (
            <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
              Für deinen heutigen Dienst ist keine Checkliste hinterlegt.</div>);
          const gruppen = {};
          for (const z of st.zeilen) (gruppen[z.zeitpunkt] = gruppen[z.zeitpunkt] || []).push(z);
          return (<>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 620 }}>
                  {st.fertig} von {st.gesamt} erledigt</div>
                <div style={{ fontSize: 13, color: st.vollstaendig ? C.ok : C.dim, marginTop: 3 }}>
                  {st.vollstaendig ? "Alle Pflichtpunkte erledigt"
                    : `noch ${st.pflichtGesamt - st.pflichtFertig} Pflichtpunkte offen`}</div>
              </div>
              <div style={{ width: 54, height: 54, borderRadius: 27, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: st.vollstaendig ? C.okLight : C.flaecheStill,
                color: st.vollstaendig ? C.ok : C.dim, fontSize: 16, fontWeight: 700, ...NUM }}>
                {st.anteil}%</div>
            </div>

            {Object.entries(CHECK_ZEITPUNKTE).map(([id, zp]) => {
              const liste = gruppen[id];
              if (!liste || !liste.length) return null;
              return (
                <div key={id} style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                    textTransform: "uppercase", color: C.dim, marginBottom: 10 }}>{zp.label}</div>
                  {liste.map((z) => (
                    <button key={z.id} disabled={z.erledigt}
                      onClick={() => akt.hakeAb(p.id, heute(), t.dienstId, z.id, "")}
                      style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%",
                        padding: "16px 18px", marginBottom: 8, borderRadius: 14, minHeight: 56,
                        border: `1px solid ${z.erledigt ? C.okLight : C.line}`,
                        background: z.erledigt ? C.okLight : C.flaeche, textAlign: "left",
                        fontFamily: "inherit", color: C.text,
                        cursor: z.erledigt ? "default" : "pointer" }}>
                      <span style={{ width: 26, height: 26, borderRadius: 13, flexShrink: 0,
                        marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1.5px solid ${z.erledigt ? C.ok : C.lineStark}`,
                        background: z.erledigt ? C.ok : "transparent", color: C.aufAkzent,
                        fontSize: 14 }}>{z.erledigt ? <Icon n="haken" size={14} strokeWidth={2.4} /> : ""}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 15.5,
                          fontWeight: z.erledigt ? 500 : 600,
                          opacity: z.erledigt ? .65 : 1 }}>{z.text}</span>
                        {z.uhrzeit && !z.erledigt && (
                          <span style={{ display: "block", fontSize: 13, color: C.dim,
                            marginTop: 3 }}>fällig um {z.uhrzeit}</span>)}
                        {z.erledigt && (
                          <span style={{ display: "block", fontSize: 12.5, color: C.dim,
                            marginTop: 4 }}>
                            {new Date(z.zeit).toLocaleTimeString("de-DE",
                              { hour: "2-digit", minute: "2-digit" })} Uhr
                            {z.nachtraeglich ? " · nachgetragen" : ""}</span>)}
                        {!z.pflicht && !z.erledigt && (
                          <span style={{ display: "block", fontSize: 12.5, color: C.dimmer,
                            marginTop: 3 }}>freiwillig</span>)}
                      </span>
                    </button>))}
                </div>);
            })}

            <div style={{ fontSize: 12.5, color: C.dim, lineHeight: 1.55, paddingBottom: 20 }}>
              Ein Haken lässt sich nicht zurücknehmen. Wenn du dich vertan hast,
              melde es der Schichtverantwortung — eine nachträglich änderbare
              Dokumentation wäre als Nachweis wertlos.
            </div>
          </>);
        })()}
      </MBlatt>

      {/* ------------------------ Selbstplanung ---------------------- */}
      <MBlatt offen={blatt === "selbstplan"} onClose={() => setBlatt(null)} titel="Selbstplanung">
        {(() => {
          const r = laufendeRunde(m);
          if (!r) return (
            <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
              Gerade läuft keine Runde. Wenn die Planung eine öffnet, bekommst du
              eine Mitteilung und kannst dir deine Dienste selbst aussuchen.
            </div>);
          const st = selbstplanStand(m, r, p.id);
          const [j, mo] = r.monat.split("-").map(Number);
          const tage = dim_(j, mo - 1);
          return (<>
            <MKarte style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 640 }}>
                {MON[mo - 1]} {j}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                Bis {fKurz(r.schliesst)} kannst du dir deine Dienste aussuchen.
                Was du einträgst, bekommst du auch.
              </div>
              <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 300, ...NUM }}>{st.eingetragen}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>Dienste gewählt</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 300, ...NUM,
                    color: st.fertig ? C.ok : C.text }}>{n1(st.stunden)} h</div>
                  <div style={{ fontSize: 12, color: C.dim }}>von {n1(st.soll)} h</div>
                </div>
                {!st.fertig && (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 300, ...NUM,
                      color: C.warn }}>{st.etwaNochDienste}</div>
                    <div style={{ fontSize: 12, color: C.dim }}>fehlen etwa</div>
                  </div>)}
              </div>
              {st.fertig && (
                <div style={{ marginTop: 12, fontSize: 13.5, color: C.ok, fontWeight: 550 }}>
                  Dein Stundenziel ist erreicht.</div>)}
            </MKarte>

            {st.eintraege.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "20px 0 11px" }}>
                Deine Wahl</div>
              {st.eintraege.map((e) => {
                const da = m.dienstarten.find((x) => x.id === e.dienstId);
                return (
                  <MKarte key={e.datum} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{fLang(e.datum)}</div>
                        <div style={{ fontSize: 13.5, color: C.dim, marginTop: 3 }}>
                          {da ? `${da.name} · ${da.start}–${da.ende}` : e.dienstId}</div>
                      </div>
                      <button onClick={() => akt.selbstAustragen(e.datum)}
                        style={{ padding: "9px 14px", borderRadius: 10, minHeight: 44,
                          border: `1px solid ${C.line}`, background: "transparent",
                          color: C.dim, fontFamily: "inherit", fontSize: 13.5,
                          fontWeight: 600, cursor: "pointer" }}>Weg</button>
                    </div>
                  </MKarte>);
              })}
            </>)}

            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
              textTransform: "uppercase", color: C.dim, margin: "24px 0 11px" }}>
              Freie Dienste</div>
            {Array.from({ length: tage }, (_, i) => `${r.monat}-${pad(i + 1)}`)
              .map((d) => {
                const moeglich = m.dienstarten.filter((da) => !da.posten)
                  .map((da) => ({ da, pruef: darfSelbstEintragen(m, r, p.id, d, da.id) }))
                  .filter((x) => x.pruef.darf);
                if (!moeglich.length) return null;
                return (
                  <MKarte key={d} style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 9 }}>
                      {fLang(d)}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {moeglich.map(({ da, pruef }) => (
                        <button key={da.id} onClick={() => akt.selbstEintragen(d, da.id)}
                          style={{ flex: "1 1 auto", minWidth: 100, minHeight: 48,
                            padding: "11px 14px", borderRadius: 11, cursor: "pointer",
                            border: `1px solid ${da.farbe}`, background: `${da.farbe}12`,
                            color: C.text, fontFamily: "inherit", textAlign: "left" }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>
                            {da.name}</span>
                          <span style={{ display: "block", fontSize: 12, color: C.dim,
                            marginTop: 2 }}>{da.start}–{da.ende}
                            {pruef.offen ? ` · ${pruef.offen} frei` : ""}</span>
                          {(pruef.hinweise || []).length > 0 && (
                            <span style={{ display: "flex", gap: 5, alignItems: "flex-start", fontSize: 12, color: C.warn,
                              marginTop: 5, lineHeight: 1.35 }}>
                              <Icon n="warnung" size={13} />{pruef.hinweise[0]}</span>)}
                        </button>))}
                    </div>
                  </MKarte>);
              })}
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 16, lineHeight: 1.55,
              paddingBottom: 20 }}>
              Ruhezeit, Qualifikationen und deine Abwesenheiten sind bereits geprüft. Spricht
              etwas dagegen, steht ein Hinweis am Dienst. Du kannst dich trotzdem eintragen;
              die Planung entscheidet.
            </div>
          </>);
        })()}
      </MBlatt>

      {/* --------------------------- Notruf -------------------------- */}
      <MBlatt offen={blatt === "notruf"} onClose={() => setBlatt(null)} titel="Hilfe anfordern">
        <div style={{ fontSize: 14.5, color: C.dim, lineHeight: 1.6, marginBottom: 22 }}>
          {/* Bis der Server selbst zustellt, wird niemand aktiv benachrichtigt —
              der Text verspricht nur, was geschieht. */}
          Dein Hilferuf wird erfasst und ist für Schichtverantwortung, Planung und
          Leitung in CENTRIC sichtbar. Dienst und Einsatzort werden vermerkt.
        </div>
        {Object.entries(NOTRUF_ARTEN).map(([id, a]) => (
          <button key={id} onClick={() => { akt.notrufSenden(id, ""); setBlatt(null); }}
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 11,
              padding: "18px 20px", borderRadius: 14, cursor: "pointer", minHeight: 64,
              border: `1px solid ${a.dringend ? C.danger : C.line}`,
              background: a.dringend ? C.dangerLight : "transparent",
              fontFamily: "inherit", color: C.text }}>
            <span style={{ display: "block", fontSize: 16, fontWeight: 640,
              color: a.dringend ? C.danger : C.text }}>{a.label}</span>
            <span style={{ display: "block", fontSize: 13.5, color: C.dim, marginTop: 4,
              lineHeight: 1.45 }}>{a.text}</span>
          </button>))}
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 18, lineHeight: 1.55,
          paddingBottom: 20 }}>
          Bei Gefahr für Leib und Leben wähle zuerst 112. Diese Meldung ersetzt
          keinen Notruf bei Polizei oder Rettungsdienst.
        </div>
      </MBlatt>

      <MBlatt offen={blatt === "offene"} onClose={() => setBlatt(null)} titel="Offene Schichten">
        {(() => {
          const meine = meineOffenenSchichten(m, p.id);
          const beworben = (m.ausschreibungen || []).filter((a) => a.status === "offen"
            && (a.bewerbungen || []).some((b) => b.personId === p.id));
          if (!meine.length && !beworben.length)
            return (
              <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px", lineHeight: 1.6 }}>
                Gerade ist nichts offen, das du übernehmen könntest. Sobald eine Schicht
                ausgeschrieben wird, die zu deinem Plan passt, erscheint sie hier.
              </div>);
          return (<>
            {beworben.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "4px 0 12px" }}>Beworben</div>
              {beworben.map((a) => {
                const da = m.dienstarten.find((x) => x.id === a.dienstId);
                const anzahl = (a.bewerbungen || []).length;
                return (
                  <MKarte key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 620 }}>
                      {fLang(a.datum)}</div>
                    <div style={{ fontSize: 14.5, color: C.dim, marginTop: 4 }}>
                      {da ? `${da.name} · ${da.start}–${da.ende}` : a.dienstId}</div>
                    <div style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>
                      {anzahl === 1 ? "Du bist bisher die einzige Meldung."
                        : `${anzahl} haben sich gemeldet. Die Planung entscheidet.`}</div>
                    <button onClick={() => akt.ziehBewerbungZurueck(a.id)}
                      style={{ marginTop: 12, padding: "11px 18px", borderRadius: 12,
                        border: `1px solid ${C.line}`, background: "transparent", color: C.dim,
                        fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
                        minHeight: 48 }}>Zurückziehen</button>
                  </MKarte>);
              })}
            </>)}

            {meine.length > 0 && (<>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: C.dim, margin: "22px 0 12px" }}>Frei</div>
              {meine.map((a) => {
                const da = m.dienstarten.find((x) => x.id === a.dienstId);
                const tage = between(heute(), a.datum);
                return (
                  <MKarte key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 16, fontWeight: 620 }}>{fLang(a.datum)}</div>
                    <div style={{ fontSize: 14.5, color: C.dim, marginTop: 4 }}>
                      {da ? `${da.name} · ${da.start}–${da.ende}` : a.dienstId}
                      {da ? ` · ${n1(dauer(da))} h` : ""}</div>
                    {a.hinweis && <div style={{ fontSize: 13.5, color: C.dim, marginTop: 8,
                      lineHeight: 1.5, fontStyle: "italic" }}>„{a.hinweis}"</div>}
                    {(() => { const h = darfSichBewerben(m, p.id, a).hinweise || [];
                      return h.length > 0 && (
                        <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 13.5, color: C.warn,
                          marginTop: 8, lineHeight: 1.45 }}>
                          <Icon n="warnung" size={15} />
                          <span>{h[0]}{h.length > 1 ? ` (und ${h.length - 1} weitere)` : ""}. Du kannst dich trotzdem melden; die Planung entscheidet.</span>
                        </div>); })()}
                    <div style={{ fontSize: 12.5, color: C.dimmer, marginTop: 8 }}>
                      {tage <= 1 ? "morgen" : `in ${tage} Tagen`}
                      {(a.bewerbungen || []).length > 0
                        ? ` · ${(a.bewerbungen || []).length} haben sich schon gemeldet` : ""}</div>
                    <button onClick={() => akt.bewirbDich(a.id, "")}
                      style={{ marginTop: 14, width: "100%", padding: "14px", borderRadius: 12,
                        border: "none", background: C.accent, color: C.aufAkzent, fontFamily: "inherit",
                        fontSize: 15.5, fontWeight: 600, cursor: "pointer", minHeight: 48 }}>
                      Ich übernehme das</button>
                  </MKarte>);
              })}
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 16, lineHeight: 1.55,
                paddingBottom: 20 }}>
                Ruhezeit, Qualifikationen und deine Abwesenheiten sind bereits geprüft. Spricht
                etwas dagegen, steht es dabei — melden kannst du dich trotzdem.
              </div>
            </>)}
          </>);
        })()}
      </MBlatt>

      <MBlatt offen={blatt === "melden"} onClose={() => setBlatt(null)} titel="Mitteilungen">
        <div style={{ fontSize: 14, color: C.dim, lineHeight: 1.6, marginBottom: 20 }}>
          Wähle, worüber du unterrichtet werden willst. Im Postfach erscheint alles —
          hier geht es nur um E-Mail und Mitteilungen auf dem Gerät.
        </div>

        {/* Push zuerst: ohne Erlaubnis nützt jede Einstellung nichts */}
        <MKarte style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span aria-hidden="true" style={{ color: C.accent, display: "flex" }}><Icon n="glocke" size={22} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15.5, fontWeight: 620 }}>Mitteilungen auf diesem Gerät</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
                {!SP.pushMoeglich()
                  ? "Dieses Gerät unterstützt keine Mitteilungen. Auf dem iPhone muss CENTRIC dafür auf dem Startbildschirm liegen."
                  : SP.pushErlaubt()
                    ? "Eingeschaltet. Du wirst bei kurzfristigen Änderungen unterrichtet."
                    : "Ausgeschaltet. Du erfährst von Änderungen erst beim nächsten Öffnen."}
              </div>
              {SP.pushMoeglich() && (
                <button onClick={() => akt.pushUmschalten(!SP.pushErlaubt())}
                  style={{ marginTop: 12, padding: "11px 18px", borderRadius: 12, border: "none",
                    background: SP.pushErlaubt() ? C.flaecheStill : C.accent,
                    color: SP.pushErlaubt() ? C.text : C.aufAkzent, fontFamily: "inherit",
                    fontSize: 14.5, fontWeight: 600, cursor: "pointer", minHeight: 48 }}>
                  {SP.pushErlaubt() ? "Ausschalten" : "Einschalten"}</button>)}
            </div>
          </div>
        </MKarte>

        {/* E-Mail-Adresse */}
        <MKarte style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15.5, fontWeight: 620, marginBottom: 8 }}>E-Mail-Adresse</div>
          <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 12, lineHeight: 1.5 }}>
            {p.email ? "Entscheidungen zu deinen Anträgen gehen hierhin."
              : "Ohne Adresse bekommst du keine E-Mails. Das ist in Ordnung — im Postfach steht alles."}
          </div>
          <input type="email" aria-label="E-Mail-Adresse" defaultValue={p.email || ""} placeholder="name@betrieb.de"
            onBlur={(e) => akt.setzeEmail(p.id, e.target.value.trim())}
            style={{ width: "100%", padding: "13px 15px", fontSize: 16, borderRadius: 12,
              border: `1px solid ${C.steuer}`, fontFamily: "inherit", boxSizing: "border-box",
              background: C.bg, color: C.text, minHeight: 48 }} />
        </MKarte>

        {/* Je Art getrennt */}
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: C.dim, margin: "22px 0 12px" }}>Wobei</div>
        {Object.entries(ZUSTELLARTEN).map(([id, a]) => {
          const w = zustellwege(p, id);
          return (
            <MKarte key={id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{a.titel}</div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 4, lineHeight: 1.45 }}>{a.text}</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {[["mail", "E-Mail", w.mail], ["push", "Gerät", w.push]].map(([weg, label, an]) => (
                  <button key={weg} onClick={() => akt.setzeZustellung(p.id, id, weg, !an)}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, minHeight: 44,
                      border: `1px solid ${an ? C.accent : C.line}`, cursor: "pointer",
                      background: an ? C.accentLight : "transparent", color: an ? C.accent : C.dim,
                      fontFamily: "inherit", fontSize: 13.5, fontWeight: 600 }}>
                    {an && <Icon n="haken" size={13} strokeWidth={2.4} />}{label}</button>))}
              </div>
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "nachweise"} onClose={() => setBlatt(null)} titel="Meine Nachweise">
        {p.qualifikationen.map((q) => {
          const s = nachweisStand(m, p, q);
          if (!s.qual) return null;
          const tone = s.stand === "abgelaufen" ? "danger" : s.stand === "laeuft_ab" ? "warn" : "ok";
          return (
            <MKarte key={q} ton={tone === "ok" ? undefined : tone}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600 }}>{s.qual.name}</div>
                  <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>
                    {s.stand === "abgelaufen" ? `abgelaufen am ${fDatum(s.ablauf)}`
                      : s.stand === "laeuft_ab" ? `läuft in ${s.tage} Tagen ab`
                      : s.stand === "fehlt" ? (s.nurStatus ? "noch nicht bestätigt" : "nicht hinterlegt")
                      : s.nurStatus ? "liegt vor"
                      : s.unbefristet ? "unbefristet gültig" : `gültig bis ${fDatum(s.ablauf)}`}</div>
                </div>
                <Pill size="sm" tone={tone}>{s.stand === "gueltig" ? "gültig" : s.stand === "laeuft_ab" ? "bald" : "abgelaufen"}</Pill>
              </div>
              {s.stand === "abgelaufen" && (
                <div style={{ fontSize: 12.5, color: C.danger, marginTop: 10, lineHeight: 1.45 }}>
                  Bitte einen neuen Nachweis bei der Planung einreichen. Bis dahin zählt diese Qualifikation
                  nicht für die Besetzung.</div>)}
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "aushang"} onClose={() => setBlatt(null)} titel="Schwarzes Brett">
        {(m.aushang || []).length === 0
          ? <div style={{ fontSize: 14.5, color: C.dim, padding: "10px 0 24px" }}>Nichts angeschlagen.</div>
          : (m.aushang || []).map((x) => (
            <MKarte key={x.id} ton={x.wichtig ? "danger" : undefined}>
              {x.wichtig && <Pill size="sm" tone="danger" style={{ marginBottom: 8 }}>wichtig</Pill>}
              <div style={{ fontSize: 16.5, fontWeight: 650 }}>{x.titel}</div>
              <div style={{ fontSize: 14, color: C.dim, marginTop: 7, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {x.text}</div>
              <div style={{ fontSize: 11.5, color: C.dimmer, marginTop: 10, ...NUM }}>{x.von} · {x.zeit}</div>
            </MKarte>))}
      </MBlatt>

      <MBlatt offen={blatt === "zeiten"} onClose={() => setBlatt(null)} titel="Zeiten bestätigen">
        <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
          Solange die tatsächliche Zeit nicht bestätigt ist, bleibt dein Stundenkonto eine Hochrechnung.
        </div>
        {offeneErfassung(m, p, addDays(heute(), -1)).map((d) => {
          const t = personTag(m, p, d);
          const da = m.dienstarten.find((x) => x.id === t.dienstId);
          if (!da) return null;
          return (
            <MKarte key={d}>
              <div style={{ fontSize: 15.5, fontWeight: 600, ...NUM }}>{fLang(d)}</div>
              <div style={{ fontSize: 13.5, color: C.dim, marginTop: 4, ...NUM }}>
                geplant {da.start}–{da.ende} · {n1(dauer(da))} h</div>
              <Btn kind="ok" style={{ width: "100%", height: 46, marginTop: 13, borderRadius: 15 }}
                onClick={() => akt.bestaetigeZeit(p.id, d, null, null, "")}>Wie geplant</Btn>
            </MKarte>);
        })}
      </MBlatt>

      <MBlatt offen={blatt === "wuensche"} onClose={() => setBlatt(null)} titel="Wunschdienste">
        <MWuensche sitz={sitz} akt={akt} />
      </MBlatt>

      <MBlatt offen={!!antrag} onClose={() => { setAntrag(null); setAntragFehler(""); }} titel="Frei beantragen">
        {antrag && (
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Art">
              <Sel value={antrag.art} onChange={(e) => setAntrag({ ...antrag, art: e.target.value })}>
                {ABW.filter((a) => a.id !== "krank" && a.id !== "ausgleich" && a.selbst !== false)
                  .map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Sel></Field>
            <Field label="Von"><Inp type="date" value={antrag.von}
              onChange={(e) => { setAntragFehler(""); setAntrag({ ...antrag, von: e.target.value }); }} /></Field>
            <Field label="Bis"><Inp type="date" value={antrag.bis} aria-invalid={antragFehler ? "true" : undefined}
              onChange={(e) => { setAntragFehler(""); setAntrag({ ...antrag, bis: e.target.value }); }} /></Field>
            <Field label="Anmerkung"><Inp value={antrag.text}
              onChange={(e) => setAntrag({ ...antrag, text: e.target.value })} /></Field>
            {/* Ende vor Beginn und Überschneidungen wie in der Rechneransicht: Fehlertext im Blatt, das Blatt bleibt offen. */}
            {antragFehler && <Fehlerband>{antragFehler}</Fehlerband>}
            <Btn kind="primary" style={{ height: 52, borderRadius: 17, fontSize: 15.5 }}
              onClick={() => { const fe = urlaubAntragFehler(m, p.id, antrag); if (fe) { setAntragFehler(fe); return; }
                akt.stelleAntrag({ typ: "abwesenheit", art: antrag.art,
                  von: antrag.von, bis: antrag.bis, text: antrag.text }); setAntrag(null); }}>
              Antrag stellen</Btn>
          </div>)}
      </MBlatt>

      {dialoge}
    </div>);
}

/** Wunschraster in kompakter Form fürs Telefon. */
export function MWuensche({ sitz, akt }) {
  const m = sitz.mandant, ich = sitz.person;
  const [ym, setYm] = useState(heute().slice(0, 7));
  const [y, mo] = ym.split("-").map(Number);
  const n = dim_(y, mo - 1);
  const erster = dow(`${ym}-01`);
  const map = Object.fromEntries(m.dienstarten.map((d) => [d.id, d]));
  const zellen = [];
  for (let i = 0; i < erster; i++) zellen.push(null);
  for (let i = 1; i <= n; i++) zellen.push(`${ym}-${pad(i)}`);
  const shift = (k) => { const d = new Date(y, mo - 1 + k, 1); setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  return (<>
    <div style={{ fontSize: 13.5, color: C.dim, marginBottom: 16, lineHeight: 1.5 }}>
      Tippen wechselt zwischen „würde gern", „lieber nicht" und leer. Kein Antrag — nur ein Hinweis
      an die Planung.
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <Btn size="sm" onClick={() => shift(-1)} aria-label="Zurück"><Icon n="chevron-links" size={16} /></Btn>
      <span style={{ fontSize: 16, fontWeight: 600 }}>{MON[mo - 1]} {y}</span>
      <Btn size="sm" onClick={() => shift(1)} aria-label="Weiter"><Icon n="chevron-rechts" size={16} /></Btn>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
      {DOW.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600,
        color: i >= 5 ? C.dimmer : C.dim }}>{d.slice(0, 2)}</div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 20 }}>
      {zellen.map((d, i) => {
        if (!d) return <div key={i} />;
        const w = wunschAm(m, ich.id, d);
        const t = personTag(m, ich, d);
        const da = t.dienstId && map[t.dienstId];
        const vergangen = d < heute();
        return (
          <div key={d}
            {...(vergangen ? {} : klickbar(() => akt.setzeWunsch(ich.id, d),
              `${fLang(d)}${w ? `, ${w.art === "moechte" ? "möchte arbeiten" : "lieber nicht"}` : ""}`))}
            style={{ aspectRatio: "1", borderRadius: 12, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 1, opacity: vergangen ? .4 : 1,
              background: w ? (w.art === "moechte" ? C.okLight : C.warnLight)
                : C.bg }}>
            <span style={{ fontSize: 12, color: C.dim, ...NUM }}>{Number(d.slice(8))}</span>
            {w ? <span style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", color: w.art === "moechte" ? C.ok : C.warn }}>
              {w.art === "moechte" ? <><Icon n="haken" size={13} strokeWidth={2.4} /><span className="nurLeser">möchte arbeiten</span></> : <><Icon n="x" size={13} strokeWidth={2.4} /><span className="nurLeser">lieber nicht</span></>}</span>
              : da && <span style={{ fontSize: 9.5, color: lesbar(da.farbe), fontWeight: 700 }}>{da.kurz}</span>}
          </div>);
      })}
    </div>
  </>);
}
