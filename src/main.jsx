import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import * as SP from "./speicher.js";
import "./schrift.css";
import { C } from "./farben.js";

/* ==========================================================================
   EINSTIEG
   Vor der Anwendung steht die Anmeldung. Für die Testrunde lassen sich die
   Demozugänge direkt antippen — niemand soll Codes abtippen müssen.
   Alle übrigen Zugänge brauchen weiterhin einen Code.
   ========================================================================== */

const ROLLENNAME = {
  betreiber: "Betreiberkonsole", leitung: "Organisationsleitung", planer: "Planung",
  subplaner: "Schichtverantwortung", mitarbeiter: "Beschäftigte",
  betriebsrat: "Betriebsrat", kunde: "Vollzugriff",
};
const ROLLENTEXT = {
  betreiber: "Mandanten, Rechnungen, Tarife, Rechner",
  leitung: "Alles: Betrieb einrichten, Personal, Regelwerk",
  planer: "Schichtfolge, Monatsplan, Freigabe, Anträge",
  subplaner: "Nur die eigene Einheit, fährt selbst mit",
  mitarbeiter: "Telefonansicht: Dienste, Anträge, Stempeluhr",
  betriebsrat: "Nur lesen: Verteilung, Prüfung, Protokoll",
  kunde: "Eigener Datenraum zum freien Ausprobieren",
};
/* Die Anmeldeseite nimmt dieselbe Palette wie die Anwendung. Vorher stand
   hier eine eigene Kopie — beim Aufhellen des Grundes behielt die
   Anmeldung deshalb den alten Ton, während dahinter schon der neue galt. */
const F = { bg: C.bg, karte: C.flaeche, text: C.text, dim: C.dim,
  line: C.line, lineStark: C.lineStark, accent: C.accent, accentHell: C.accentLight,
  danger: C.danger, ok: C.ok };

function Marke({ size = 38 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id="mg" x1="55%" y1="0%" x2="100%" y2="70%">
          <stop offset="0%" stopColor="#023441" /><stop offset="100%" stopColor="#017070" />
        </linearGradient>
        <clipPath id="mc1"><rect x="6" y="8" width="88" height="26" rx="13" /></clipPath>
      </defs>
      <g clipPath="url(#mc1)">
        <rect x="6" y="8" width="88" height="26" rx="13" fill="#023441" />
        <path d="M52 8 C74 8 66 34 94 34 L94 8 Z" fill="url(#mg)" />
      </g>
      <rect x="6" y="37" width="88" height="26" rx="13" fill="#02A0A0" />
      <rect x="6" y="66" width="88" height="26" rx="13" fill="#023441" />
      <path d="M92 26 C99 30 99 41 90 45 C78 50 62 44 50 47 C38 50 26 58 20 63 C13 69 13 78 20 82"
        stroke="#023441" strokeWidth="1.9" fill="none" strokeLinecap="round" opacity=".92" />
    </svg>);
}


/* ==========================================================================
   SELBST STARTEN
   Ein Interessent legt sich seinen Testbetrieb an, ohne dass jemand
   mitwirken muss. Drei Angaben, ein Knopf, danach die Zugangscodes.
   ========================================================================== */

/* ==========================================================================
   PREISE — öffentlich, vor der Anmeldung

   Wer den Preis versteckt, wirkt teuer. Das gilt besonders hier: Der Preis
   ist das stärkste Argument gegen die Kopfpauschalen des Wettbewerbs. Ihn
   erst im Verkaufsgespräch zu nennen, verschenkt genau diesen Vorteil —
   und ein Verkaufsgespräch gibt es ohnehin nicht.

   Der Rechner steht vor der Tabelle. Eine Zahl ohne den eigenen Fall
   dahinter sagt niemandem etwas.
   ========================================================================== */
function Preise({ onZurueck, onStarten, F }) {
  const [personen, setPersonen] = useState(60);
  const [standorte, setStandorte] = useState(2);
  const [paket, setPaket] = useState(true);

  const TARIFE = [
    { id: "basis", name: "Basis", preis: 89, bis: 30,
      was: ["Dienstplanung mit Rotationsmodellen", "Anträge und Tauschbörse",
        "Kalender-Feed und Weckzeiten", "Mobile Ansicht", "Datenmitnahme jederzeit"] },
    { id: "pro", name: "Professional", preis: 159, bis: 150, pakete: 1,
      was: ["Alles aus Basis", "Ein Branchenpaket enthalten", "Qualifikationen mit Ablauf",
        "Arbeitszeitprüfung und Belastungsanalyse", "Selbstplanung durch die Belegschaft",
        "Lohnausgabe für die Lohnbuchhaltung"] },
    { id: "ent", name: "Enterprise", preis: 239, bis: null, pakete: 2,
      was: ["Alles aus Professional", "Zwei Branchenpakete enthalten",
        "Beliebig viele Personen je Standort", "Leistungsnachweis für Auftraggeber",
        "Auftragsverarbeitung nach Artikel 28", "Bevorzugter Rückruf"] },
  ];
  const STAFFEL = [[1, 0, "ein Standort"], [2, .07, "2 Standorte"], [5, .12, "3 – 5"],
    [10, .20, "6 – 10"], [25, .27, "11 – 25"], [1e6, .34, "ab 26"]];
  const PAUSCHALE = 49;

  const jeStandort = Math.ceil(personen / Math.max(1, standorte));
  const tarif = TARIFE.find((t) => t.bis === null || jeStandort <= t.bis);
  const st = STAFFEL.find(([bis]) => standorte <= bis);
  const netto = Math.round(tarif.preis * (1 - st[1]) * 100) / 100;
  const standortSumme = Math.round(netto * standorte * 100) / 100;
  const paketAufpreis = paket && !tarif.pakete ? 89 : 0;
  const gesamt = Math.round((standortSumme + PAUSCHALE + paketAufpreis) * 100) / 100;
  const jePerson = personen ? (gesamt / personen) : 0;

  /* Vergleich: was eine Kopfpauschale kosten würde. Bewusst am unteren
     Rand des Marktes gerechnet, damit der Vergleich nicht schmeichelt. */
  const kopfpauschale = Math.max(169, standorte * 169 + personen * 0.9);
  const ersparnis = Math.max(0, Math.round((kopfpauschale - gesamt) * 12));

  const Zahl = ({ wert, einheit, gross }) => (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      <span style={{ fontSize: gross ? 40 : 22, fontWeight: 300,
        letterSpacing: "-.04em" }}>{wert}</span>
      {einheit && <span style={{ fontSize: gross ? 17 : 13, color: F.dim,
        marginLeft: 5 }}>{einheit}</span>}
    </span>);

  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 300, letterSpacing: "-.04em", margin: "0 0 12px" }}>
        Was CENTRIC kostet</h1>
      <p style={{ fontSize: 15.5, color: F.dim, lineHeight: 1.6, margin: "0 0 8px",
        maxWidth: 560 }}>
        Gerechnet wird je Standort, nicht je Kopf. <b style={{ color: F.text }}>Wer einstellt,
        zahlt nicht mehr</b> — solange der Standort in seiner Größenklasse bleibt.
      </p>
      <p style={{ fontSize: 14, color: F.dim, lineHeight: 1.6, margin: "0 0 32px",
        maxWidth: 560 }}>
        Alle Preise monatlich, netto, monatlich kündbar. Keine Einrichtungsgebühr,
        keine Mindestlaufzeit.
      </p>

      {/* ------------------------- Der Rechner ------------------------- */}
      <div style={{ background: F.karte, border: `1px solid ${F.accent}`, borderRadius: 16,
        padding: 26, marginBottom: 40 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
          textTransform: "uppercase", color: F.accent, marginBottom: 20 }}>
          Dein Preis</div>

        <div style={{ display: "grid", gap: 22, marginBottom: 24 }}>
          <div>
            <label style={{ display: "flex", justifyContent: "space-between",
              fontSize: 14, marginBottom: 10 }}>
              <span>Beschäftigte insgesamt</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{personen}</b></label>
            <input type="range" min={5} max={500} step={5} value={personen}
              onChange={(e) => setPersonen(Number(e.target.value))}
              style={{ width: "100%", accentColor: F.accent, height: 28 }} />
          </div>
          <div>
            <label style={{ display: "flex", justifyContent: "space-between",
              fontSize: 14, marginBottom: 10 }}>
              <span>Standorte</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{standorte}</b></label>
            <input type="range" min={1} max={30} step={1} value={standorte}
              onChange={(e) => setStandorte(Number(e.target.value))}
              style={{ width: "100%", accentColor: F.accent, height: 28 }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer",
            fontSize: 14 }}>
            <input type="checkbox" checked={paket} onChange={(e) => setPaket(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: F.accent }} />
            Branchenpaket (Pflege, Sicherheit, Klinik oder Produktion)
          </label>
        </div>

        <div style={{ borderTop: `1px solid ${F.line}`, paddingTop: 20 }}>
          <div style={{ display: "grid", gap: 9, fontSize: 14, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: F.dim }}>
                {standorte} × {tarif.name} ({jeStandort} Personen je Standort)
                {st[1] > 0 ? ` · −${Math.round(st[1] * 100)} %` : ""}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {standortSumme.toFixed(2)} €</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: F.dim }}>Betriebspauschale</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {PAUSCHALE.toFixed(2)} €</span>
            </div>
            {paketAufpreis > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: F.dim }}>Branchenpaket</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {paketAufpreis.toFixed(2)} €</span>
              </div>)}
            {paket && tarif.pakete > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: F.dim }}>Branchenpaket</span>
                <span style={{ color: F.ok, fontWeight: 600 }}>im Tarif enthalten</span>
              </div>)}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
            flexWrap: "wrap", gap: 14 }}>
            <Zahl wert={gesamt.toFixed(2).replace(".", ",") + " €"} einheit="im Monat" gross />
            <span style={{ fontSize: 14, color: F.dim }}>
              das sind <b style={{ color: F.text, fontVariantNumeric: "tabular-nums" }}>
              {jePerson.toFixed(2).replace(".", ",")} €</b> je Person
            </span>
          </div>

          {ersparnis > 0 && (
            <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 11,
              background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 13.5,
              lineHeight: 1.55 }}>
              Bei einem Anbieter mit Kopfpauschale läge das etwa bei{" "}
              <b style={{ fontVariantNumeric: "tabular-nums" }}>
                {Math.round(kopfpauschale)} €</b> im Monat.
              Der Unterschied macht rund{" "}
              <b style={{ fontVariantNumeric: "tabular-nums" }}>
                {ersparnis.toLocaleString("de-DE")} €</b> im Jahr aus.
            </div>)}
        </div>
      </div>

      {/* ------------------------- Die Tarife -------------------------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
        gap: 16, marginBottom: 36 }}>
        {TARIFE.map((t) => {
          const an = t.id === tarif.id;
          return (
            <div key={t.id} style={{ padding: 24, borderRadius: 16,
              border: `1px solid ${an ? F.accent : F.line}`,
              background: an ? F.accentHell : F.karte }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".09em",
                textTransform: "uppercase", color: an ? F.accent : F.dim,
                marginBottom: 12 }}>{t.name}</div>
              <Zahl wert={t.preis + " €"} einheit="je Standort" />
              <div style={{ fontSize: 13, color: F.dim, marginTop: 8, marginBottom: 18 }}>
                {t.bis ? `bis ${t.bis} Personen je Standort` : "beliebig viele Personen"}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
                {t.was.map((w, i) => (
                  <li key={i} style={{ display: "flex", gap: 9, fontSize: 13.5,
                    lineHeight: 1.5 }}>
                    <span style={{ color: F.accent, flexShrink: 0 }}>✓</span>
                    <span>{w}</span>
                  </li>))}
              </ul>
            </div>);
        })}
      </div>

      {/* ------------------------- Die Staffel ------------------------- */}
      <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 14,
        padding: 24, marginBottom: 36 }}>
        <div style={{ fontSize: 16, fontWeight: 640, marginBottom: 8 }}>Mengenstaffel</div>
        <div style={{ fontSize: 13.5, color: F.dim, lineHeight: 1.6, marginBottom: 18 }}>
          Der Nachlass gilt auf jeden Standort, nicht nur auf einen. Wer viele
          Standorte führt, hat den höheren Verwaltungsaufwand ohnehin.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {STAFFEL.map(([bis, rab, label], i) => (
            <div key={i} style={{ flex: "1 1 110px", padding: "13px 15px", borderRadius: 11,
              border: `1px solid ${st === STAFFEL[i] ? F.accent : F.line}`,
              background: st === STAFFEL[i] ? F.accentHell : "transparent" }}>
              <div style={{ fontSize: 12.5, color: F.dim }}>{label}</div>
              <div style={{ fontSize: 19, fontWeight: 600, marginTop: 4,
                fontVariantNumeric: "tabular-nums",
                color: rab ? F.accent : F.dim }}>{rab ? `−${Math.round(rab * 100)} %` : "—"}</div>
            </div>))}
        </div>
      </div>

      {/* ------------------------ Was dazukommt ------------------------ */}
      <div style={{ display: "grid", gap: 16, marginBottom: 36 }}>
        {[["Der Betriebsrat zahlt nichts",
          "Ein lesender Zugang für die Mitbestimmung ist kostenfrei. Mitbestimmung darf nicht am Preis scheitern."],
          ["Zugänge kosten nichts extra",
            "Ob fünf oder fünfhundert Menschen die App nutzen, ändert am Preis nichts. Gerechnet wird je Standort."],
          ["Datenmitnahme jederzeit",
            "Sieben Tabellen als CSV, ohne Gebühr, ohne Kündigungsfrist. Eine Dienstplanung ist betriebskritisch — die Frage, wie man wieder herauskommt, gehört an den Anfang."],
          ["30 Tage testen",
            "Ohne Zahlungsdaten, ohne automatische Verlängerung. Danach meldest du dich — oder eben nicht."]].map(
          ([titel, text], i) => (
          <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <span style={{ color: F.accent, fontSize: 17, flexShrink: 0, lineHeight: 1.3 }}>✓</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{titel}</div>
              <div style={{ fontSize: 13.5, color: F.dim, marginTop: 4,
                lineHeight: 1.55 }}>{text}</div>
            </div>
          </div>))}
      </div>

      <button onClick={onStarten}
        style={{ width: "100%", padding: 15, fontSize: 15.5, fontWeight: 600, borderRadius: 12,
          border: "none", background: F.accent, color: "#fff", fontFamily: "inherit",
          cursor: "pointer", marginBottom: 14 }}>
        Betrieb anlegen und testen</button>
      <div style={{ fontSize: 12, color: F.dim, textAlign: "center", marginBottom: 24 }}>
        Kostenlos · Keine Zahlungsdaten · 30 Tage
      </div>

      <button onClick={onZurueck}
        style={{ border: "none", background: "transparent", color: F.accent, fontFamily: "inherit",
          fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0" }}>
        Zurück</button>
    </div>);
}

function SelbstStarten({ onZurueck, onFertig, F }) {
  const [name, setName] = useState("");
  const [branche, setBranche] = useState("");
  const [email, setEmail] = useState("");
  const [rollen, setRollen] = useState(["subplaner", "mitarbeiter"]);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(null);
  const [fertig, setFertig] = useState(null);

  const BRANCHEN = [
    ["sicherheit", "Sicherheitsdienst", "Objektschutz, Sachkunde nach § 34a, Wachbuch"],
    ["pflege", "Pflege", "Fachkraftquote, Übergabe, Wohnbereiche"],
    ["klinik", "Klinik", "Bereitschaft, Rufbereitschaft, geteilte Dienste"],
    ["industrie", "Produktion", "Kontischicht, Anlagen, Maschinenqualifikationen"],
    ["sonstige", "Etwas anderes", "Die Grundfunktionen ohne Branchenzusatz"],
  ];
  const ROLLENNAMEN = { leitung: "Organisationsleitung", planer: "Planung",
    subplaner: "Schichtverantwortung", mitarbeiter: "Beschäftigte", betriebsrat: "Betriebsrat" };

  const starten = async () => {
    if (!name.trim() || !branche || laeuft) return;
    setLaeuft(true); setFehler(null);
    try {
      const a = await fetch("/starten", { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), branche, email: email.trim(), rollen }) });
      const d = await a.json();
      if (!a.ok) throw new Error(d.text || d.fehler || "Das hat nicht geklappt.");
      setFertig(d);
    } catch (e) { setFehler(e.message); }
    finally { setLaeuft(false); }
  };

  if (fertig) return (
    <div>
      <div style={{ padding: "22px 24px", borderRadius: 14, background: "#F0FDF4",
        border: "1px solid #BBF7D0", marginBottom: 24 }}>
        <div style={{ fontSize: 19, fontWeight: 640, marginBottom: 7 }}>
          {name.trim()} steht bereit</div>
        <div style={{ fontSize: 14.5, color: F.dim, lineHeight: 1.6 }}>
          Der Betrieb ist leer — kein Beispielpersonal, keine erfundenen Dienstpläne.
          Beim ersten Öffnen führt dich eine Tour durch alles Nötige.
        </div>
      </div>

      <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 14,
        padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 13.5, color: F.danger, lineHeight: 1.55, marginBottom: 18,
          fontWeight: 550 }}>
          Notier dir die Codes jetzt. Sie werden nur als Prüfsumme gespeichert
          und lassen sich nicht wiederherstellen.
        </div>
        {fertig.zugaenge.map((z, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14,
            padding: "13px 0", borderTop: i ? `1px solid ${F.line}` : "none" }}>
            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 550 }}>
              {ROLLENNAMEN[z.rolle] || z.rolle}</span>
            <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".07em",
              padding: "8px 13px", borderRadius: 8, background: F.bg,
              border: `1px solid ${F.line}`, fontVariantNumeric: "tabular-nums" }}>{z.code}</code>
          </div>))}
        <button onClick={() => {
          const txt = [`CENTRIC — Zugänge für ${name.trim()}`, "",
            ...fertig.zugaenge.map((z) => `${(ROLLENNAMEN[z.rolle] || z.rolle).padEnd(24)} ${z.code}`),
            "", "https://centric-dienstplanung.netlify.app",
            `Testzeitraum: ${fertig.testtage} Tage.`].join("\n");
          const b = new Blob([txt], { type: "text/plain;charset=utf-8" });
          const u = URL.createObjectURL(b);
          const a = document.createElement("a");
          a.href = u; a.download = `centric-zugaenge.txt`; a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        }} style={{ marginTop: 18, padding: "11px 18px", borderRadius: 10,
          border: `1px solid ${F.line}`, background: "transparent", color: F.text,
          fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Als Datei sichern</button>
      </div>

      <div style={{ fontSize: 13, color: F.dim, lineHeight: 1.6, marginBottom: 22 }}>
        Der Testzeitraum läuft {fertig.testtage} Tage. Danach melden wir uns —
        oder du meldest dich, wenn es passt.
      </div>

      <button onClick={() => onFertig(fertig.zugaenge[0].code)}
        style={{ width: "100%", padding: 15, fontSize: 15.5, fontWeight: 600, borderRadius: 12,
          border: "none", background: F.accent, color: "#fff", fontFamily: "inherit",
          cursor: "pointer" }}>
        Mit der Organisationsleitung anmelden</button>
    </div>);

  return (
    <div>
      <h1 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.04em", margin: "0 0 10px" }}>
        Selbst starten</h1>
      <p style={{ fontSize: 15, color: F.dim, lineHeight: 1.6, margin: "0 0 12px", maxWidth: 520 }}>
        Kein Verkaufsgespräch, keine Zahlungsdaten. Drei Angaben, dann steht dein
        Betrieb — leer, mit geführter Tour.
      </p>

      {/* Was der Interessent nach welcher Zeit hat. Das sagt mehr als jede
          Funktionsliste, weil es den Weg beschreibt statt den Umfang. */}
      <div style={{ display: "grid", gap: 11, margin: "0 0 30px", maxWidth: 520 }}>
        {[["Nach 15 Minuten", "steht deine Schichtfolge — aus einem der neun geprüften Modelle."],
          ["Nach einer Stunde", "ist dein Personal drin und der erste Monat gerechnet."],
          ["Nach der ersten Woche", "bestätigt dein Team die Zeiten selbst."],
          ["Am Monatsende", "liegt die Lohnausgabe fertig da — eine Datei statt sechs Mails."]].map(
          ([wann, was], i) => (
          <div key={i} style={{ display: "flex", gap: 13, fontSize: 14, lineHeight: 1.55 }}>
            <span style={{ color: F.accent, fontWeight: 700, flexShrink: 0, minWidth: 118 }}>{wann}</span>
            <span style={{ color: F.dim }}>{was}</span>
          </div>))}
      </div>

      <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 14,
        padding: 26, display: "grid", gap: 20 }}>
        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600,
            color: F.dim, marginBottom: 7 }}>Wie heißt dein Betrieb?</label>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Nordwacht Sicherheitsdienste"
            style={{ width: "100%", padding: "13px 15px", fontSize: 16, borderRadius: 12,
              border: `1px solid ${F.line}`, fontFamily: "inherit", boxSizing: "border-box",
              background: F.bg, color: F.text }} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600,
            color: F.dim, marginBottom: 9 }}>Was für ein Betrieb ist das?</label>
          <div style={{ display: "grid", gap: 9 }}>
            {BRANCHEN.map(([id, label, text]) => (
              <button key={id} onClick={() => setBranche(id)}
                style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                  padding: "13px 16px", borderRadius: 11, fontFamily: "inherit",
                  border: `1px solid ${branche === id ? F.accent : F.line}`,
                  background: branche === id ? F.accentHell : "transparent", color: F.text }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600 }}>{label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: F.dim, marginTop: 3,
                  lineHeight: 1.45 }}>{text}</span>
              </button>))}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600,
            color: F.dim, marginBottom: 9 }}>Welche Zugänge brauchst du?</label>
          <div style={{ fontSize: 12.5, color: F.dim, marginBottom: 11, lineHeight: 1.5 }}>
            Organisationsleitung und Planung entstehen immer. Weitere kannst du
            gleich mitnehmen, um die anderen Blickwinkel zu sehen.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[["subplaner", "Schichtverantwortung"], ["mitarbeiter", "Beschäftigte"],
              ["betriebsrat", "Betriebsrat"]].map(([id, label]) => (
              <label key={id} style={{ display: "flex", alignItems: "center", gap: 11,
                padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                border: `1px solid ${rollen.includes(id) ? F.accent : F.line}`,
                background: rollen.includes(id) ? F.accentHell : "transparent" }}>
                <input type="checkbox" checked={rollen.includes(id)}
                  onChange={(e) => setRollen(e.target.checked
                    ? [...rollen, id] : rollen.filter((x) => x !== id))}
                  style={{ width: 17, height: 17, accentColor: F.accent }} />
                <span style={{ fontSize: 14 }}>{label}</span>
              </label>))}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12.5, fontWeight: 600,
            color: F.dim, marginBottom: 7 }}>E-Mail (freiwillig)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="damit wir dich erreichen können"
            style={{ width: "100%", padding: "13px 15px", fontSize: 16, borderRadius: 12,
              border: `1px solid ${F.line}`, fontFamily: "inherit", boxSizing: "border-box",
              background: F.bg, color: F.text }} />
        </div>

        {fehler && (
          <div role="alert" style={{ padding: "13px 16px", borderRadius: 10,
            background: "#FEF2F2", color: F.danger, fontSize: 13.5, lineHeight: 1.5 }}>
            {fehler}</div>)}

        <button onClick={starten} disabled={!name.trim() || !branche || laeuft}
          style={{ width: "100%", padding: 15, fontSize: 15.5, fontWeight: 600, borderRadius: 12,
            border: "none", fontFamily: "inherit",
            cursor: name.trim() && branche && !laeuft ? "pointer" : "default",
            background: name.trim() && branche && !laeuft ? F.accent : F.lineStark, color: "#fff" }}>
          {laeuft ? "Wird angelegt …" : "Betrieb anlegen"}</button>

        <div style={{ fontSize: 12, color: F.dim, textAlign: "center", lineHeight: 1.5 }}>
          Kostenlos · Keine Zahlungsdaten · 30 Tage Testzeitraum
        </div>
      </div>

      <button onClick={onZurueck}
        style={{ border: "none", background: "transparent", color: F.accent, fontFamily: "inherit",
          fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "18px 0 0" }}>
        Zurück
      </button>
    </div>);
}

function Einstieg() {
  /* Die Anmeldeseite ist immer hell. Sie kennt die Person noch nicht und
     damit auch keine Themenwahl — und ein dunkler Anmeldebildschirm vor
     einer hellen Anwendung wäre ein Bruch. */
  useEffect(() => {
    try {
      document.documentElement.style.colorScheme = "light";
      document.body.style.background = F.bg;
    } catch { /* egal */ }
  }, []);
  const [an, setAn] = useState(SP.angemeldet());
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState(null);
  const [laeuft, setLaeuft] = useState(false);
  const [begruessung, setBegruessung] = useState(null);
  const [demos, setDemos] = useState(null);
  const [mitCode, setMitCode] = useState(false);
  const [betreiber, setBetreiber] = useState(false);
  const [selbst, setSelbst] = useState(false);
  const [preise, setPreise] = useState(false);
  const [merken, setMerken] = useState(SP.wirdGemerkt());

  useEffect(() => { if (!an) SP.demos().then(setDemos).catch(() => setDemos([])); }, [an]);

  const oeffne = (versprechen) => {
    setLaeuft(true); setFehler(null);
    versprechen
      .then((d) => { setBegruessung(d); setTimeout(() => setAn(true), 800); })
      .catch((e) => { setFehler(e.message); setLaeuft(false); });
  };
  const senden = () => { if (code.trim() && !laeuft)
    oeffne(SP.anmelden(code.trim().toUpperCase(), merken)); };

  if (an) return <App />;

  if (preise) return (
    <div style={{ minHeight: "100vh", background: F.bg, padding: "5vh 20px 8vh",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif", color: F.text }}>
      <div style={{ width: "min(760px, 100%)", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
          <Marke />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.035em" }}>CENTRIC</div>
            <div style={{ fontSize: 13, color: F.dim, marginTop: 2 }}>
              Dienstplanung im Schichtbetrieb</div>
          </div>
        </div>
        <Preise F={F} onZurueck={() => setPreise(false)}
          onStarten={() => { setPreise(false); setSelbst(true); }} />
      </div>
    </div>);

  if (selbst) return (
    <div style={{ minHeight: "100vh", background: F.bg, padding: "5vh 20px 8vh",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif", color: F.text }}>
      <div style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
          <Marke />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.035em" }}>CENTRIC</div>
            <div style={{ fontSize: 13, color: F.dim, marginTop: 2 }}>
              Dienstplanung im Schichtbetrieb</div>
          </div>
        </div>
        <SelbstStarten F={F} onZurueck={() => setSelbst(false)}
          onFertig={(code) => { setSelbst(false); setMitCode(true); setCode(code); }} />
      </div>
    </div>);

  /* Nach Gruppen ordnen, damit zusammengehörige Zugänge beieinander stehen */
  const gruppen = {};
  for (const d of demos || []) {
    const g = d.gruppe || "Weitere";
    (gruppen[g] = gruppen[g] || []).push(d);
  }

  return (
    <div style={{ minHeight: "100vh", background: F.bg, padding: "5vh 20px 8vh",
      fontFamily: "Inter, -apple-system, system-ui, sans-serif", color: F.text }}>
      <div style={{ width: "min(680px, 100%)", margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 36 }}>
          <Marke />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.035em" }}>CENTRIC</div>
            <div style={{ fontSize: 13, color: F.dim, marginTop: 2 }}>
              Dienstplanung im Schichtbetrieb</div>
          </div>
        </div>

        {begruessung ? (
          <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 16,
            padding: "48px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 30, color: F.ok, marginBottom: 14 }}>✓</div>
            <div style={{ fontSize: 19, fontWeight: 640, marginBottom: 7 }}>{begruessung.name}</div>
            <div style={{ fontSize: 14.5, color: F.dim }}>
              {ROLLENNAME[begruessung.rolle] || begruessung.rolle} — wird geöffnet …</div>
          </div>
        ) : (<>

          {/* ---------------------- Testzugänge ---------------------- */}
          {demos === null ? (
            <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 16,
              padding: 28 }} aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 15, borderRadius: 6, background: F.bg, marginBottom: 12,
                  width: `${92 - i * 16}%` }} />))}
            </div>
          ) : demos.length > 0 && !mitCode ? (<>
            {/* Zuerst der eigene Betrieb, dann die fertigen Beispiele. Wer
                selbst einrichten will, soll nicht erst durch eine Demoliste. */}
            <div style={{ background: F.karte, border: `1px solid ${F.accent}`, borderRadius: 16,
              padding: 26, marginBottom: 34 }}>
              <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-.04em",
                margin: "0 0 10px" }}>Eigenen Betrieb anlegen</h1>
              <p style={{ fontSize: 14.5, color: F.dim, lineHeight: 1.6, margin: "0 0 18px" }}>
                Leer, mit geführter Tour. Kein Verkaufsgespräch, keine Zahlungsdaten —
                in einer Viertelstunde steht deine erste Schichtfolge.
              </p>
              <button onClick={() => setSelbst(true)}
                style={{ width: "100%", padding: 14, fontSize: 15.5, fontWeight: 600,
                  borderRadius: 12, border: "none", background: F.accent, color: "#fff",
                  fontFamily: "inherit", cursor: "pointer" }}>
                Selbst starten</button>
              <div style={{ fontSize: 12, color: F.dim, textAlign: "center", marginTop: 11 }}>
                Kostenlos · 30 Tage Testzeitraum
              </div>
              <button onClick={() => setPreise(true)}
                style={{ display: "block", margin: "14px auto 0", border: "none",
                  background: "transparent", color: F.accent, fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                Was kostet das? →</button>
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-.04em", margin: "0 0 10px" }}>
              Oder erst umsehen</h1>
            <p style={{ fontSize: 15, color: F.dim, lineHeight: 1.6, margin: "0 0 28px", maxWidth: 520 }}>
              Fertig eingerichtete Beispielbetriebe zum Durchklicken. Antippen genügt,
              kein Code nötig — jede Rolle zeigt einen anderen Blickwinkel auf denselben Plan.
            </p>

            {Object.entries(gruppen).map(([gruppe, liste]) => (
              <div key={gruppe} style={{ marginBottom: 30 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".10em",
                  textTransform: "uppercase", color: F.dim, marginBottom: 12 }}>{gruppe}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {liste.map((d) => (
                    <button key={d.id} disabled={laeuft}
                      onClick={() => oeffne(SP.demoOeffnen(d.id, merken))}
                      style={{ display: "flex", alignItems: "center", gap: 16, width: "100%",
                        background: F.karte, border: `1px solid ${F.line}`, borderRadius: 14,
                        padding: "16px 18px", cursor: laeuft ? "default" : "pointer",
                        fontFamily: "inherit", textAlign: "left", color: F.text,
                        opacity: laeuft ? .5 : 1, transition: "border-color .14s, background .14s" }}
                      onMouseEnter={(e) => { if (!laeuft) {
                        e.currentTarget.style.borderColor = F.accent;
                        e.currentTarget.style.background = F.accentHell; } }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = F.line;
                        e.currentTarget.style.background = F.karte; }}>
                      <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: F.accentHell, color: F.accent, fontSize: 12.5, fontWeight: 700 }}>
                        {(ROLLENNAME[d.rolle] || "?").slice(0, 2).toUpperCase()}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 15.5, fontWeight: 600 }}>
                          {ROLLENNAME[d.rolle] || d.rolle}</span>
                        <span style={{ display: "block", fontSize: 13, color: F.dim, marginTop: 3,
                          lineHeight: 1.45 }}>{d.hinweis || ROLLENTEXT[d.rolle] || ""}</span>
                      </span>
                      <span style={{ color: F.dim, fontSize: 20, flexShrink: 0 }}>›</span>
                    </button>))}
                </div>
              </div>))}

            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
              cursor: "pointer", fontSize: 13.5, color: F.dim }}>
              <input type="checkbox" checked={merken}
                onChange={(e) => setMerken(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: F.accent, cursor: "pointer" }} />
              Zugang auf diesem Gerät merken
            </label>

            <button onClick={() => { setMitCode(true); setBetreiber(false); }}
              style={{ border: "none", background: "transparent", color: F.accent, fontFamily: "inherit",
                fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0" }}>
              Ich habe einen Zugangscode
            </button>
          </>) : (<>

            {/* ------------------- Anmeldung mit Code ------------------- */}
            <div style={{ background: F.karte, border: `1px solid ${F.line}`, borderRadius: 16,
              padding: 32, maxWidth: 430 }}>
              <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-.04em", margin: "0 0 10px" }}>
                {betreiber ? "Betreiberkonsole" : "Anmelden"}</h1>
              <p style={{ fontSize: 14, color: F.dim, lineHeight: 1.6, margin: "0 0 24px" }}>
                {betreiber
                  ? "Für die Verwaltung von Mandanten, Zugängen und Rechnungen. Die Sitzung läuft nach zwei Stunden ab."
                  : "Der Zugangscode wurde dir von deinem Betrieb mitgeteilt. Er gilt zwölf Stunden."}
              </p>
              <label htmlFor="code" style={{ display: "block", fontSize: 12.5, fontWeight: 600,
                color: F.dim, marginBottom: 7 }}>Zugangscode</label>
              <input id="code" value={code} autoFocus autoCapitalize="characters"
                autoComplete="one-time-code" inputMode="text"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && senden()}
                placeholder="XXXX-XXXX-XXXX"
                style={{ width: "100%", padding: "13px 15px", fontSize: 17, borderRadius: 12,
                  border: `1px solid ${fehler ? F.danger : F.line}`, fontFamily: "inherit",
                  letterSpacing: ".06em", fontVariantNumeric: "tabular-nums", boxSizing: "border-box",
                  background: F.bg, color: F.text }} />
              {fehler && (
                <div role="alert" style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 13,
                  color: F.danger, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 700 }}>!</span><span>{fehler}</span></div>)}
              <button onClick={senden} disabled={!code.trim() || laeuft}
                style={{ width: "100%", marginTop: 22, padding: 14, fontSize: 15, fontWeight: 600,
                  borderRadius: 12, border: "none", fontFamily: "inherit",
                  cursor: code.trim() && !laeuft ? "pointer" : "default",
                  background: code.trim() && !laeuft ? F.accent : F.lineStark, color: "#fff" }}>
                {laeuft ? "Wird geprüft …" : "Anmelden"}</button>

              {/* Ohne dieses Häkchen endet der Zugang mit dem Schließen des
                  Fensters. Das ist die richtige Voreinstellung: An einem
                  Stationsrechner soll nicht der Nächste im Plan des Vorigen
                  landen. */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18,
                cursor: "pointer", fontSize: 13.5, color: F.dim, lineHeight: 1.5 }}>
                <input type="checkbox" checked={merken}
                  onChange={(e) => setMerken(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 1, accentColor: F.accent,
                    cursor: "pointer", flexShrink: 0 }} />
                <span>
                  <span style={{ display: "block", fontWeight: 550, color: F.text }}>
                    Zugang auf diesem Gerät merken</span>
                  <span style={{ display: "block", marginTop: 2 }}>
                    Nur auf einem Gerät, das niemand sonst benutzt. Ohne Häkchen musst du
                    dich nach dem Schließen erneut anmelden.</span>
                </span>
              </label>

              {demos && demos.length > 0 && (
                <button onClick={() => { setMitCode(false); setFehler(null); }}
                  style={{ border: "none", background: "transparent", color: F.accent,
                    fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                    padding: "16px 0 0", display: "block" }}>
                  Zurück zu den Testzugängen</button>)}
            </div>
          </>)}
        </>)}

        <p style={{ fontSize: 12.5, color: F.dim, lineHeight: 1.6, marginTop: 32, maxWidth: 520 }}>
          Die Daten sind erfunden — Namen und Dienstpläne sind erzeugt, keine echten Personen.
          Bitte auch keine echten Personaldaten eingeben.
        </p>

        {/* Der Betreiberzugang steht bewusst nicht bei den Testzugängen: Wer
            Datenräume anlegen kann, darf nicht mit einem Antippen erreichbar
            sein. Der Verweis hier führt nur zum Codefeld — ohne gültigen Code
            geht nichts. */}
        {!begruessung && (
          <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${F.line}` }}>
            <button onClick={() => { setMitCode(true); setBetreiber(true); setFehler(null); }}
              style={{ border: "none", background: "transparent", color: F.dim,
                fontFamily: "inherit", fontSize: 12.5, cursor: "pointer", padding: 0 }}>
              Betreiberkonsole
            </button>
          </div>)}
      </div>
    </div>);
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode><Einstieg /></React.StrictMode>);
