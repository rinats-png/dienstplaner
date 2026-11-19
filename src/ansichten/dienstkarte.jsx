/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */
import { istUngeplant } from "../istdaten.js";
import { heute } from "../lib/datum.js";
import { Card, Rubrik } from "../ui/bausteine.jsx";
import { UngeplantHinweis } from "../ansichten/ungeplanthinweis.jsx";
import { C } from "../farben.js";
import { NUM } from "../ui/thema.js";
import { Zelle } from "../ui/leisten.jsx";
import { n1 } from "../lib/format.js";
import { dauer } from "../regelwerk.js";
import { Stempeluhr } from "./stempeluhr.jsx";
import { StempelPuffer } from "./stempelpuffer.jsx";

export function DienstKarte({ sitz, akt, vorgang, meineDa, style, children }) {
  /* Auch ohne Dienst heute: ein offener Vorgang oder ein Nachtdienst von gestern ohne Einstempeln (nachtEnde) —
     sonst böte die Aufgabe „Dienstende stempeln“ an, am Rechner aber fehlte die Stempeluhr dafür. */
  if (!meineDa && !(vorgang && (vorgang.offen || vorgang.nachtEnde))) {
    const u = sitz.person && istUngeplant((sitz.mandant.erfassung || {})[`${sitz.person.id}|${heute()}`]);
    return u ? <Card style={{ padding: 24, ...style }}><UngeplantHinweis m={sitz.mandant} p={sitz.person} d={heute()} /></Card> : null;
  }
  return (
    <Card style={{ padding: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", ...style }}>
      {vorgang && vorgang.vortag ? (
        <div style={{ flex: 1, minWidth: 190 }}>
          <Rubrik>Offener Dienst von gestern</Rubrik>
          <div style={{ fontSize: 21, fontWeight: 600, marginTop: 5 }}>{vorgang.st ? `Eingestempelt gestern ${vorgang.st.start}` : "Nachtdienst von gestern ohne Einstempeln"}</div>
          <div style={{ fontSize: 14, color: C.dim, marginTop: 3 }}>{vorgang.st ? "Bitte ausstempeln, wenn der Dienst endet." : "Das Dienstende lässt sich noch erfassen."}</div>
        </div>
      ) : !meineDa ? (
        /* Offener Beginn, aber heute kein Dienst (mehr) im Plan. */
        <div style={{ flex: 1, minWidth: 190 }}>
          <Rubrik>Offener Dienst ohne Plan</Rubrik>
          <div style={{ fontSize: 21, fontWeight: 600, marginTop: 5, ...NUM }}>Eingestempelt {vorgang.st.start}</div>
          <div style={{ fontSize: 14, color: C.dim, marginTop: 3 }}>Für heute ist kein Dienst (mehr) geplant.</div>
        </div>
      ) : (<>
        <Zelle da={meineDa} size={54} />
        <div style={{ flex: 1, minWidth: 190 }}>
          <Rubrik>Dein Dienst heute</Rubrik>
          <div style={{ fontSize: 21, fontWeight: 600, marginTop: 5 }}>{meineDa.name}</div>
          <div style={{ fontSize: 14, color: C.dim, marginTop: 3, ...NUM }}>
            {meineDa.start}–{meineDa.ende} · {n1(dauer(meineDa))} h{meineDa.ort ? ` · ${meineDa.ort}` : ""}</div>
        </div></>)}
      {vorgang && <><Stempeluhr sitz={sitz} akt={akt} vorgang={vorgang} /><StempelPuffer akt={akt} /></>}
      {children}
    </Card>);
}
