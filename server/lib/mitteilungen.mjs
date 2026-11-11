/* ==========================================================================
   MITTEILUNGEN — was in `nachrichten` stehen darf (Commit 4)

   Bis Oktober 2026 baute die Oberfläche jede Mitteilung selbst: Empfänger,
   Titel, Text, Zustellwege samt E-Mail-Adresse und vollständiger
   Push-Anmeldung — und stellte sie danach aus dem Browser zu. Der Server
   prüfte nur grob, wer was anlegen darf. Folgen: Beschäftigte konnten
   „Tauschangebote" mit freiem Text an beliebige Personen schicken, ein
   Notruf der Beschäftigten löste weder Mail noch Push aus, und den
   Zustellstatus setzte der Client.

   Jetzt gilt:
   - Notruf- und Tauschmitteilungen entstehen nur hier, auf dem Server, aus
     dem fachlichen Vorgang — einem neuen eigenen Notruf, einer neuen
     eigenen Meldung auf ein offenes Tauschgesuch. Was der Client dafür
     mitschickt, wird verworfen.
   - Andere Mitteilungen legen weiterhin die Rollen an, die den Vorgang
     auslösen (Planung, Leitung, Schichtverantwortung im Bereich) — mit
     Titel höchstens TITEL_MAX und Text höchstens TEXT_MAX Zeichen.
   - Zustellwege (`wege`) und Zustellstatus (`zugestellt`) schreibt kein
     Client. Der Status liegt je Mitteilung und Kanal in der Ablage
     (versand.mjs), nicht im Bestand.
   - An der Person wird höchstens ein Merker `pushSchluessel: true`
     geschrieben, nie die Push-Anmeldung selbst; die steht im Push-Register
     (versand.mjs). Ältere gespeicherte Anmeldungen bleiben bis zur
     nächsten Änderung der Person stehen, werden aber nicht mehr gelesen.

   Diese Datei ist rein: keine Ablage, kein Versand.
   ========================================================================== */

/* Die Arten und ihre Vorgaben — dieselben wie ZUSTELLARTEN in src/App.jsx.
   Eine gemeinsame Quelle gibt es nicht (der Server lädt nichts aus src/);
   pruefungen/zustellung-rechte.test.js vergleicht beide Listen. */
export const ZUSTELLARTEN = {
  antragEntschieden: { mail: true, push: true, dringend: false },
  planGeaendert: { mail: true, push: true, dringend: true },
  planFreigegeben: { mail: true, push: true, dringend: false },
  einspringen: { mail: true, push: true, dringend: true },
  offeneSchicht: { mail: false, push: true, dringend: false },
  tauschAngebot: { mail: false, push: true, dringend: false },
  urlaubVerfaellt: { mail: true, push: false, dringend: false },
  nachweisLaeuftAb: { mail: false, push: false, dringend: false },
  zeitFehlt: { mail: false, push: true, dringend: false },
  aushang: { mail: false, push: true, dringend: false },
  uebergabeFehlt: { mail: false, push: true, dringend: true },
};

export const TITEL_MAX = 120;
export const TEXT_MAX = 500;

/* Die Arten eines Notrufs — dieselben wie NOTRUF_ARTEN in src/App.jsx. */
export const NOTRUF_ARTEN = {
  hilfe: "Hilfe angefordert",
  medizin: "Medizinischer Notfall",
  bedrohung: "Bedrohungslage",
  technik: "Technischer Ausfall",
};
const NOTRUF_EMPFAENGER = ["subplaner", "planer", "leitung"];

/** Notrufe je Person und Stunde, die Mitteilungen auslösen (Vorgabe 3;
    CENTRIC_NOTRUF_JE_STUNDE, 1 bis 100). */
export const notrufJeStunde = () => {
  const w = Number(process.env.CENTRIC_NOTRUF_JE_STUNDE);
  return Number.isInteger(w) && w >= 1 && w <= 100 ? w : 3;
};

/* Felder, die nur der Server setzt. */
const NUR_SERVER = ["wege", "zugestellt", "quelle"];

const gleichId = (a, b) => String(a) === String(b);
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const ohne = (o, felder) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !felder.includes(k)));
const kuerzen = (t, n) => String(t ?? "").slice(0, n);

/** Ein echter Notruf: eine Mitteilung, die der Server aus einem Notruf
    erzeugt hat (`quelle.art === "notruf"` — `quelle` setzt nie ein Client,
    siehe NUR_SERVER). Nur Notrufe dürfen die Reserve des Betriebskontingents
    nehmen (Nachtrag 2, F1); „dringend“ allein (planGeaendert, einspringen,
    uebergabeFehlt aus der Planung) genügt dafür nicht. */
export const istNotruf = (n) => istObjekt(n) && istObjekt(n.quelle) && n.quelle.art === "notruf";

/** Entsteht diese Mitteilung nur auf dem Server? */
export function nurVomServer(n) {
  return istObjekt(n) && (n.ziel === "notruf" || n.art === "tauschAngebot" || n.quelle !== undefined
    || /^n-(notruf|tausch)-/.test(String(n.id)));
}

/**
 * Was der Client an Mitteilungen schickt, bevor die Rolle entscheidet:
 * - neue Notruf-/Tauschmitteilungen: verworfen (der Server erzeugt sie);
 * - neue Mitteilungen der Art `planFreigegeben` ("Der Plan ist verbindlich"): nur von Rollen, die den Plan
 *   verbindlich freigeben dürfen (`planFreigegebenErlaubt`, RB-1), sonst verworfen; ohne die Angabe gilt: nicht erlaubt;
 * - neue andere: ohne wege/zugestellt/quelle, Titel und Text in den Grenzen
 *   (sonst Absage, wenn `grenzenPruefen`);
 * - bestehende: wege/zugestellt/quelle aus dem gespeicherten Stand; eine
 *   Mitteilung des Servers bleibt bis auf `gelesen` unverändert.
 * Fehlt `nachrichten` in der Übermittlung, bleibt sie unangetastet.
 * @returns {{mandant?: any, grund?: string}}
 */
export function mitteilungenVorfiltern(altM, neuM, { grenzenPruefen = true, planFreigegebenErlaubt = false } = {}) {
  if (!istObjekt(neuM) || !Array.isArray(neuM.nachrichten)) return { mandant: neuM };
  const alt = new Map((Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : [])
    .filter(istObjekt).map((n) => [String(n.id), n]));
  const liste = [];
  for (const n of neuM.nachrichten) {
    if (!istObjekt(n)) { liste.push(n); continue; }
    const vorher = alt.get(String(n.id));
    if (vorher) {
      if (vorher.quelle !== undefined) {
        liste.push(typeof n.gelesen === "boolean" ? { ...vorher, gelesen: n.gelesen } : vorher);
        continue;
      }
      const aus = ohne(n, NUR_SERVER);
      if (JSON.stringify(aus) === JSON.stringify(ohne(vorher, NUR_SERVER))) { liste.push(vorher); continue; }
      for (const f of NUR_SERVER) if (vorher[f] !== undefined) aus[f] = vorher[f];
      liste.push(aus);
      continue;
    }
    if (nurVomServer(n)) continue;
    /* RB-1: Eine gefälschte "Plan freigegeben"-Mitteilung (Mail und Push an die Beschäftigten) darf nur schreiben,
       wer den Plan wirklich verbindlich freigeben darf; für alle anderen wird die neue Mitteilung verworfen. */
    if (n.art === "planFreigegeben" && !planFreigegebenErlaubt) continue;
    if (grenzenPruefen) {
      if (typeof n.titel !== "string" || !n.titel.trim() || n.titel.length > TITEL_MAX)
        return { grund: `Eine Mitteilung braucht einen Titel mit höchstens ${TITEL_MAX} Zeichen.` };
      if (n.text !== undefined && n.text !== null && (typeof n.text !== "string" || n.text.length > TEXT_MAX))
        return { grund: `Der Text einer Mitteilung hat höchstens ${TEXT_MAX} Zeichen.` };
    }
    liste.push(ohne(n, NUR_SERVER));
  }
  return { mandant: { ...neuM, nachrichten: liste } };
}

/** Name einer Person für Texte. */
const name = (p) => (p ? `${p.vorname || ""} ${p.nachname || ""}`.trim() : "") || "Jemand";

/** Eine Mitteilung des Servers.
 * @param {{id: any, personId: any, art: any, titel: any, text: any, ziel: any, quelle: any, tag?: any}} o */
function mitteilung({ id, personId, art, titel, text, ziel, quelle, tag }) {
  const jetzt = new Date();
  return { id, personId, art, titel: kuerzen(titel, TITEL_MAX), text: kuerzen(text, TEXT_MAX), ziel,
    zeit: jetzt.toLocaleString("de-DE"), erstellt: jetzt.toISOString(), gelesen: false,
    dringend: !!(ZUSTELLARTEN[art] || {}).dringend, quelle,
    /* WP-30: der Tag, den die Mitteilung betrifft — für die Entwurfsregel (zustellregeln.mjs). */
    ...(typeof tag === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tag) ? { tag } : {}) };
}

/** Wer einen Notruf bekommt: ausschließlich die im Notruf gespeicherten
    Empfänger, soweit sie Schichtverantwortung, Planung oder Leitung dieses
    Betriebs sind (und nicht die Person selbst). Bleibt keiner übrig, bekommt
    niemand eine Mitteilung — es gibt keine Ersatzempfänger (Commit 4a). Der
    Notruf selbst bleibt gespeichert und in der Anwendung sichtbar. Eine
    Rückfall-Alarmierung wäre eine eigene Produktentscheidung. */
export function notrufEmpfaenger(personen, notruf) {
  const liste = (Array.isArray(personen) ? personen : []).filter(istObjekt);
  const zulaessig = (p) => NOTRUF_EMPFAENGER.includes(p.rolle) && !gleichId(p.id, notruf.personId);
  const gewaehlt = new Set((Array.isArray(notruf.empfaenger) ? notruf.empfaenger : []).map(String));
  return liste.filter((p) => zulaessig(p) && gewaehlt.has(String(p.id)));
}

/**
 * Erzeugt die Mitteilungen, die aus den fachlichen Vorgängen dieser
 * Übermittlung folgen — nur aus Vorgängen der eigenen Person (`ich`):
 * - ein neuer eigener Notruf: je Empfänger eine Mitteilung „NOTRUF: …";
 * - eine neue eigene Meldung auf ein offenes fremdes Tauschgesuch: eine
 *   Mitteilung an die Person des Gesuchs.
 * Kennungen sind fest (n-notruf-<notruf>-<empfänger>, n-tausch-<gesuch>-<ich>):
 * Was es schon gibt, entsteht nicht noch einmal — auch nicht nach Ab- und
 * erneutem Anmelden auf dasselbe Gesuch.
 * Dazu: Eine neu geschriebene Push-Anmeldung an der eigenen Person wird zum
 * Merker `true`.
 * @returns {any} der Betrieb mit den neuen Mitteilungen vorn
 */
export function mitteilungenErzeugen(altM, neuM, ich) {
  if (!istObjekt(neuM)) return neuM;
  if (ich === null || ich === undefined) return neuM;
  let aus = neuM;
  /* Eine neu an die eigene Person geschriebene Push-Anmeldung wird zum
     Merker. Was schon gespeichert war, bleibt unverändert (ein Rundweg
     ändert nichts); solche älteren Anmeldungen liest niemand mehr — keine
     Sicht liefert sie fremd aus, der Versand nimmt das Push-Register. */
  const vorherIch = (Array.isArray(altM && altM.personen) ? altM.personen : []).find((p) => istObjekt(p) && gleichId(p.id, ich));
  const neuGesetzt = (p) => istObjekt(p) && gleichId(p.id, ich) && istObjekt(p.pushSchluessel)
    && JSON.stringify(p.pushSchluessel) !== JSON.stringify(vorherIch && vorherIch.pushSchluessel);
  if (Array.isArray(aus.personen) && aus.personen.some(neuGesetzt))
    aus = { ...aus, personen: aus.personen.map((p) => (neuGesetzt(p) ? { ...p, pushSchluessel: true } : p)) };

  const personen = (Array.isArray(altM && altM.personen) ? altM.personen : []).filter(istObjekt);
  const person = (id) => personen.find((p) => gleichId(p.id, id));
  const ichP = person(ich);
  if (!ichP) return aus;
  const vorhanden = new Set([...(Array.isArray(altM.nachrichten) ? altM.nachrichten : []),
    ...(Array.isArray(aus.nachrichten) ? aus.nachrichten : [])].filter(istObjekt).map((n) => String(n.id)));
  const neue = [];
  const dazu = (n) => { if (!vorhanden.has(n.id)) { vorhanden.add(n.id); neue.push(n); } };

  /* Notrufe. Nachtrag Opus-Review (B1): Mitteilungen (und damit Mail/Push)
     entstehen für höchstens notrufJeStunde() Notrufe je Person in der
     letzten Stunde — gezählt an den gespeicherten Notrufmitteilungen
     (Serverzeit `erstellt`). Ein Notruf darüber wird gespeichert und ist in
     der Anwendung sichtbar, löst aber keine weitere Benachrichtigung aus:
     Schutz gegen eine Flut, die das Betriebskontingent leert. */
  const alteNotrufe = new Set((Array.isArray(altM.notrufe) ? altM.notrufe : []).filter(istObjekt).map((n) => String(n.id)));
  const seit = Date.now() - 3600 * 1000;
  const frische = new Set((Array.isArray(altM.nachrichten) ? altM.nachrichten : [])
    .filter((x) => istObjekt(x) && istObjekt(x.quelle) && x.quelle.art === "notruf" && gleichId(x.quelle.von, ich)
      && Date.parse(x.erstellt || "") >= seit)
    .map((x) => String(x.quelle.id)));
  const jeStunde = notrufJeStunde();
  for (const n of Array.isArray(aus.notrufe) ? aus.notrufe : []) {
    if (!istObjekt(n) || alteNotrufe.has(String(n.id)) || !gleichId(n.personId, ich)) continue;
    if (!Object.prototype.hasOwnProperty.call(NOTRUF_ARTEN, n.art)) continue;
    const empfaenger = notrufEmpfaenger(personen, n);
    if (!empfaenger.length) continue;
    if (!frische.has(String(n.id)) && frische.size >= jeStunde) continue;
    frische.add(String(n.id));
    const zusatz = [n.dienst, n.ort, n.notiz].filter((x) => typeof x === "string" && x.trim()).join(" · ");
    for (const e of empfaenger)
      dazu(mitteilung({ id: `n-notruf-${n.id}-${e.id}`, personId: e.id, art: "einspringen",
        titel: `NOTRUF: ${NOTRUF_ARTEN[n.art]}`, text: `${name(ichP)}${zusatz ? ` · ${zusatz}` : ""}`,
        ziel: "notruf", quelle: { art: "notruf", id: n.id, von: ichP.id } }));
  }

  /* Meldungen auf Tauschgesuche */
  const alteAnfragen = new Map((Array.isArray(altM.anfragen) ? altM.anfragen : []).filter(istObjekt).map((a) => [String(a.id), a]));
  for (const a of Array.isArray(aus.anfragen) ? aus.anfragen : []) {
    const vorher = istObjekt(a) ? alteAnfragen.get(String(a.id)) : null;
    if (!vorher || vorher.typ !== "tausch" || vorher.status !== "offen" || vorher.partnerId) continue;
    if (gleichId(vorher.personId, ich) || !person(vorher.personId)) continue;
    const jetzt = (Array.isArray(a.interessenten) ? a.interessenten : []).some((x) => gleichId(x, ich));
    const frueher = (Array.isArray(vorher.interessenten) ? vorher.interessenten : []).some((x) => gleichId(x, ich));
    if (!jetzt || frueher) continue;
    const tag = typeof vorher.von === "string" && /^\d{4}-\d{2}-\d{2}$/.test(vorher.von)
      ? `${vorher.von.slice(8, 10)}.${vorher.von.slice(5, 7)}.` : "";
    dazu(mitteilung({ id: `n-tausch-${vorher.id}-${ichP.id}`, personId: vorher.personId, art: "tauschAngebot",
      titel: "Meldung auf dein Tauschgesuch",
      text: `${name(ichP)} bietet an, den Dienst${tag ? ` am ${tag}` : ""} zu übernehmen.`,
      ziel: "tausch", quelle: { art: "tausch", id: vorher.id, von: ichP.id }, tag: vorher.von }));
  }

  if (!neue.length) return aus;
  return { ...aus, nachrichten: [...neue, ...(Array.isArray(aus.nachrichten) ? aus.nachrichten
    : Array.isArray(altM.nachrichten) ? altM.nachrichten : [])] };
}

/** Die Kennungen der Mitteilungen des Servers, die in `neuM` neu sind —
    die stellt der Server nach dem Speichern selbst zu. */
export function neueServermitteilungen(altM, neuM) {
  const alt = new Set((Array.isArray(altM && altM.nachrichten) ? altM.nachrichten : []).filter(istObjekt).map((n) => String(n.id)));
  return (Array.isArray(neuM && neuM.nachrichten) ? neuM.nachrichten : [])
    .filter((n) => istObjekt(n) && n.quelle !== undefined && !alt.has(String(n.id))).map((n) => String(n.id));
}
