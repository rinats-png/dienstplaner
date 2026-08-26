/* ==========================================================================
   ZUGANGSPFLEGE — der Block oben in der Personalliste

   Wer arbeitet hier eigentlich mit welchem Zugang? Vorher war das eine
   Frage an den Betreiber; jetzt beantwortet und ändert es der Betrieb
   selbst. Zwei Wege, gleichwertig:

     Adresse da    → Einladung. Die Person setzt ihr Passwort über einen
                     Link, der genau ihr gehört. „Erneut einladen"
                     entwertet jeden früheren Link.
     keine Adresse → Code je Person, zum Übergeben. „Neu ausstellen"
                     entwertet den alten sofort — der Handywechsel ist
                     damit eine Sache von zehn Sekunden im Betrieb.

   Der Code erscheint genau einmal, hier im Ergebnisfeld. Er wird als
   Prüfsumme gespeichert und lässt sich nicht wieder anzeigen — nur neu
   ausstellen. Das ist kein Mangel, das ist die Eigenschaft, auf der die
   ganze Ablage beruht.
   ========================================================================== */

import React, { useEffect, useState } from "react";
import * as SP from "./speicher.js";
import { C } from "./farben.js";

const ROLLENNAME = {
  leitung: "Organisationsleitung", planer: "Planung",
  subplaner: "Schichtverantwortung", mitarbeiter: "Beschäftigte",
  betriebsrat: "Betriebsrat",
};
const STATUS = {
  aktiv: ["aktiv", C.ok], eingeladen: ["eingeladen", C.accent],
  gesperrt: ["gesperrt", C.danger],
};

export default function ZugangsPflege({ m, sitz }) {
  const [offen, setOffen] = useState(false);
  const [zugaenge, setZugaenge] = useState(null);
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(null);        // personId der laufenden Aktion
  const [neuerCode, setNeuerCode] = useState(null);  // { name, code } — genau einmal sichtbar

  const laden = () => SP.zugangsUebersicht().then(setZugaenge)
    .catch((e) => setFehler(e.message === "nicht-angemeldet" ? null : e.message));
  useEffect(() => { if (offen && zugaenge === null) laden(); }, [offen]);

  const heutigen = (p) => (zugaenge || []).filter((z) =>
    z.person != null && String(z.person) === String(p.id) && z.status !== "gesperrt");

  const einladen = async (p) => {
    setLaeuft(p.id); setFehler(null);
    try {
      await SP.einladen({ email: p.email, rolle: p.rolle || "mitarbeiter",
        name: `${p.vorname} ${p.nachname}`.trim(), personId: p.id });
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); }
  };

  const codeAusstellen = async (p, ersetzen) => {
    setLaeuft(p.id); setFehler(null);
    try {
      const d = await SP.codesAusstellen([{ personId: p.id,
        rolle: p.rolle || "mitarbeiter", name: `${p.vorname} ${p.nachname}`.trim(),
        ersetzen: !!ersetzen }]);
      const z = d.zugaenge && d.zugaenge[0];
      if (z) setNeuerCode({ name: `${p.vorname} ${p.nachname}`.trim(), code: z.code,
        entwertet: d.entwertet || 0 });
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); }
  };

  const sperren = async (p) => {
    const z = heutigen(p);
    if (!z.length) return;
    setLaeuft(p.id); setFehler(null);
    try {
      for (const eintrag of z) await SP.zugangSperren({ pruefsumme: eintrag.schluessel });
      await laden();
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(null); }
  };

  const knopf = (text, tun, aus, primaer) => (
    <button onClick={tun} disabled={aus}
      style={{ padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600,
        fontFamily: "inherit", cursor: aus ? "default" : "pointer",
        border: `1px solid ${primaer ? C.accent : C.line}`,
        background: primaer ? C.accent : "transparent",
        color: primaer ? "#fff" : C.text, opacity: aus ? 0.55 : 1 }}>{text}</button>);

  const personen = (m.personen || []).filter((p) => !p.austritt);

  return (
    <div className="karte" style={{ padding: 0, marginBottom: 22, overflow: "hidden",
      border: `1px solid ${C.line}`, borderRadius: 14, background: C.flaeche }}>
      <button onClick={() => setOffen(!offen)} aria-expanded={offen}
        style={{ display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "16px 20px", border: "none", background: "transparent",
          fontFamily: "inherit", cursor: "pointer", textAlign: "left", color: C.text }}>
        <span style={{ fontSize: 15.5, fontWeight: 650, flex: 1 }}>Zugänge verwalten</span>
        <span style={{ fontSize: 13, color: C.dim }}>
          Einladung per E-Mail oder Code je Person</span>
        <span style={{ color: C.dim, fontSize: 17,
          transform: offen ? "rotate(90deg)" : "none", transition: "transform .14s" }}>›</span>
      </button>

      {offen && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, padding: "14px 20px 18px" }}>
          {neuerCode && (
            <div role="status" style={{ margin: "6px 0 16px", padding: "14px 16px",
              borderRadius: 11, background: C.accentLight, border: `1px solid ${C.accent}` }}>
              <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 6 }}>
                Zugangscode für {neuerCode.name}
                {neuerCode.entwertet ? ` — ${neuerCode.entwertet} alter Code entwertet` : ""}</div>
              <code style={{ display: "inline-block", fontSize: 17, fontWeight: 700,
                letterSpacing: ".07em", padding: "8px 14px", borderRadius: 8,
                background: C.flaeche, border: `1px solid ${C.line}` }}>{neuerCode.code}</code>
              <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>
                Jetzt notieren oder ausdrucken und persönlich übergeben — der Code wird
                nur als Prüfsumme gespeichert und erscheint kein zweites Mal.
              </div>
              <button onClick={() => setNeuerCode(null)}
                style={{ marginTop: 10, padding: "6px 12px", borderRadius: 8, fontSize: 12.5,
                  border: `1px solid ${C.line}`, background: "transparent", color: C.text,
                  fontFamily: "inherit", cursor: "pointer" }}>Gelesen</button>
            </div>)}

          {fehler && (
            <div role="alert" style={{ margin: "6px 0 14px", fontSize: 13, color: C.danger,
              lineHeight: 1.5 }}>{fehler}</div>)}

          {zugaenge === null && !fehler && (
            <div style={{ fontSize: 13.5, color: C.dim, padding: "8px 0" }}>Wird geladen …</div>)}

          {zugaenge !== null && (
            <div style={{ display: "grid", gap: 0 }}>
              {personen.map((p, i) => {
                const z = heutigen(p);
                const mitMail = z.find((x) => x.art === "email");
                const mitCode = z.find((x) => x.art === "code");
                const stand = mitMail ? mitMail.status : mitCode ? "aktiv" : null;
                const [standText, standFarbe] = stand ? STATUS[stand] || [stand, C.dim] : ["kein Zugang", C.dim];
                const dieser = laeuft != null && String(laeuft) === String(p.id);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12,
                    flexWrap: "wrap", padding: "11px 0",
                    borderTop: i ? `1px solid ${C.lineSoft}` : "none" }}>
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {p.vorname} {p.nachname}</div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>
                        {ROLLENNAME[p.rolle] || p.rolle || "Beschäftigte"}
                        {p.email ? ` · ${p.email}` : " · keine Adresse hinterlegt"}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em",
                      textTransform: "uppercase", color: standFarbe, flexShrink: 0 }}>
                      {standText}</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {p.email
                        ? knopf(mitMail ? "Erneut einladen" : "Einladen",
                            () => einladen(p), dieser, !mitMail)
                        : knopf(mitCode ? "Code neu ausstellen" : "Code ausstellen",
                            () => codeAusstellen(p, !!mitCode), dieser, !mitCode)}
                      {p.email && knopf(mitCode ? "Code neu ausstellen" : "Auch als Code",
                        () => codeAusstellen(p, !!mitCode), dieser, false)}
                      {sitz.rolle === "leitung" && z.length > 0
                        && knopf("Zurückziehen", () => sperren(p), dieser, false)}
                    </div>
                  </div>);
              })}
              {!personen.length && (
                <div style={{ fontSize: 13.5, color: C.dim, padding: "8px 0" }}>
                  Noch kein Personal — Zugänge entstehen je Person, sobald welches da ist.
                </div>)}
            </div>)}

          <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55, marginTop: 14,
            paddingTop: 12, borderTop: `1px solid ${C.lineSoft}` }}>
            Eine Einladung gilt sieben Tage und genau einmal; „Erneut einladen" entwertet
            frühere Links. „Code neu ausstellen" entwertet den alten sofort — für den
            Gerätewechsel ohne Anruf. Adressen pflegst du in der Personalakte; eine
            Adressänderung bestätigt die alte Adresse.
          </div>
        </div>)}
    </div>);
}
