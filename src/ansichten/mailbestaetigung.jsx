/* ==========================================================================
   E-9: Bestätigung der eigenen E-Mail-Adresse

   Zeigt nur etwas, wenn der Server den Weg anbietet (CENTRIC_MAILBESTAETIGUNG
   „angebot“ oder „pflicht“). Der Code kommt per Mail an die gespeicherte
   Adresse und wird hier eingegeben — angemeldet, als dieselbe Person.
   ========================================================================== */
import { useState, useEffect } from "react";
import * as SP from "../speicher.js";
import { C } from "../farben.js";
import { Btn, Inp } from "../ui/bausteine.jsx";

export function MailBestaetigung({ email }) {
  const [stand, setStand] = useState(/** @type {any} */ (null));
  const [code, setCode] = useState("");
  const [meldung, setMeldung] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  /* Neu lesen, wenn sich die Adresse ändert (eine neue Adresse ist unbestätigt). */
  useEffect(() => {
    let aktiv = true;
    const t = setTimeout(() => { SP.mailBestaetigungStand().then((s) => { if (aktiv) setStand(s); }); }, 800);
    return () => { aktiv = false; clearTimeout(t); };
  }, [email]);

  if (!stand || !stand.adresse) return null;
  if (stand.bestaetigt)
    return <div style={{ fontSize: 13.5, color: C.dim, marginTop: 10 }} role="status">Adresse bestätigt.</div>;

  const anfordern = async () => {
    setLaeuft(true);
    const r = await SP.mailBestaetigungAnfordern();
    setLaeuft(false);
    setMeldung(r.ok ? "Code verschickt. Er gilt 30 Minuten." : r.text || "");
    if (r.ok) setStand({ ...stand, ausstehend: true });
  };
  const einloesen = async () => {
    setLaeuft(true);
    const r = await SP.mailBestaetigen(code);
    setLaeuft(false);
    if (r.ok) { setCode(""); setMeldung(""); setStand({ ...stand, bestaetigt: true, ausstehend: false }); }
    else setMeldung(r.text || "");
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.5, marginBottom: 10 }}>
        {stand.modus === "pflicht"
          ? "Noch nicht bestätigt. Bis zur Bestätigung gehen keine Benachrichtigungen per E-Mail an diese Adresse."
          : "Noch nicht bestätigt. Mit einem Code an diese Adresse bestätigst du, dass sie dir gehört."}
      </div>
      <Btn size="sm" onClick={anfordern} disabled={laeuft}>Code per E-Mail senden</Btn>
      {stand.ausstehend && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Inp aria-label="Bestätigungscode" value={code} placeholder="ABCD-EFGH-JKLM" autoComplete="one-time-code"
            maxLength={20} onChange={(e) => setCode(e.target.value)} style={{ flex: "1 1 160px", minWidth: 0 }} />
          <Btn size="sm" kind="primary" onClick={einloesen} disabled={laeuft || !code.trim()}>Bestätigen</Btn>
        </div>)}
      {meldung && <div role="status" style={{ fontSize: 13, color: C.dim, marginTop: 8 }}>{meldung}</div>}
    </div>);
}
