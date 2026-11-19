/* WP-39: Aktionen aus dem Aktionsobjekt `akt` in src/App.jsx (AppInnen), Text unveraendert.
   Der Kontext k kommt aus AppInnen (useMemo von akt) und traegt dieselben Werte wie vorher der Abschluss. */
import { AUFGABEN_PFLBG } from "../../regelwerk.js";
import { uid } from "../../lib/format.js";
import { heute } from "../../lib/datum.js";

export function aktionenBranchen(k) {
  const { mUpd, sitz } = k;
  return {
      /* --- PPP-RL: therapeutisches Personal je Woche --- */
      setzeTherapie: (einheitId, woche, feld, wert) => mUpd((m) => {
        const k = `${einheitId}|${woche}`;
        const alt = (m.therapie || {})[k] || {};
        const neu = { ...alt, minuten: { ...(alt.minuten || {}) } };
        const roh = String(wert).trim();
        const zahl = roh === "" ? null : Number(roh);
        if (roh !== "" && (!Number.isFinite(zahl) || zahl < 0)) return m;
        if (feld === "patienten") {
          if (roh === "") delete neu.patienten; else neu.patienten = Math.round(zahl * 10) / 10;
        } else if (roh === "") delete neu.minuten[feld];
        else neu.minuten[feld] = Math.round(zahl);
        if (!Object.keys(neu.minuten).length) delete neu.minuten;
        const alle = { ...(m.therapie || {}) };
        if (Object.keys(neu).length) alle[k] = neu; else delete alle[k];
        return { ...m, therapie: alle };
      }, null),

      setzeEinheitPpp: (einheitId, bereich, art) => mUpd((m) => ({ ...m,
        einheiten: m.einheiten.map((e) => (e.id === einheitId
          ? { ...e, pppBereich: bereich, pppArt: art || e.pppArt || "vollstationaer" } : e)),
      }), "Behandlungsbereich gesetzt"),

      /* --- Vorbehaltene Aufgaben ---

         Anders als eine Quote ist das eine Anwesenheit: mindestens eine
         Person im Dienst, die sie ausüben darf. Der Vorschlag aus § 4 PflBG
         wird beim Anlegen mit der Fachkraftqualifikation des Betriebs
         verknüpft — steht keine bereit, bleibt das Feld offen und die
         Prüfung sagt das, statt stillschweigend „gedeckt" zu melden. */
      legeAufgabenVor: () => mUpd((m) => {
        const fk = m.qualifikationen.find((q) => q.fachkraft);
        const vorhanden = new Set((m.aufgaben || []).map((a) => a.name));
        const neue = AUFGABEN_PFLBG.filter((a) => !vorhanden.has(a.name)).map((a) => ({
          id: uid("af"), name: a.name, grundlage: a.grundlage, vorbehalten: true,
          qualifikationId: fk ? fk.id : null, mindestens: 1, dienstarten: [],
        }));
        if (!neue.length) return m;
        return { ...m, aufgaben: [...(m.aufgaben || []), ...neue] };
      }, "Vorbehaltene Aufgaben angelegt"),

      speichereAufgabe: (a) => mUpd((m) => {
        const rein = {
          id: a.id || uid("af"),
          name: String(a.name || "").trim(),
          grundlage: String(a.grundlage || "").trim(),
          vorbehalten: a.vorbehalten !== false,
          qualifikationId: a.qualifikationId || null,
          mindestens: Math.max(1, Number(a.mindestens) || 1),
          dienstarten: a.dienstarten || [],
        };
        const liste = m.aufgaben || [];
        return { ...m, aufgaben: liste.some((x) => x.id === rein.id)
          ? liste.map((x) => (x.id === rein.id ? rein : x)) : [...liste, rein] };
      }, "Aufgabe gespeichert"),

      loescheAufgabe: (id) => mUpd((m) => ({ ...m,
        aufgaben: (m.aufgaben || []).filter((x) => x.id !== id) }), "Aufgabe gelöscht"),

      /* --- Pflegepersonaluntergrenzen ---

         Die Belegung ist eine Zahl je Einheit, Tag und Schicht. Ein leeres
         Feld löscht den Eintrag, statt ihn auf null zu setzen: „nichts
         eingetragen" und „null Patienten" sind zwei verschiedene Aussagen,
         und nur die zweite darf als eingehalten gelten. */
      setzeBelegung: (einheitId, datum, schicht, wert) => mUpd((m) => {
        const k = `${einheitId}|${datum}|${schicht}`;
        const b = { ...(m.belegung || {}) };
        const roh = String(wert).trim();
        if (roh === "") delete b[k];
        else {
          const n = Number(roh);
          if (!Number.isFinite(n) || n < 0) return m;
          b[k] = { patienten: Math.round(n) };
        }
        return { ...m, belegung: b };
      }, null),

      setzeEinheitBereich: (einheitId, bereich) => mUpd((m) => ({ ...m,
        einheiten: m.einheiten.map((e) => (e.id === einheitId ? { ...e, ppugvBereich: bereich } : e)),
      }), "Pflegesensitiver Bereich gesetzt"),

      /* --- Kompetenzen ---

         Anlegen, ändern, löschen — und die Freigabe an einer Person. Wer
         eine Freigabe zurücknimmt, löscht sie nicht: Der Eintrag bleibt mit
         Datum stehen, damit nachvollziehbar ist, dass es sie einmal gab.
         Bei einer Prüfung ist das der Unterschied zwischen „war nie da" und
         „wurde entzogen". */
      speichereKompetenz: (k) => mUpd((m) => {
        const rein = {
          id: k.id || uid("kp"),
          name: String(k.name || "").trim(),
          art: k.art || "taetigkeit",
          betriebsmittelId: k.art === "geraet" ? (k.betriebsmittelId || null) : null,
          stufe: k.stufe || "",
          freigabeStelle: String(k.freigabeStelle || "").trim(),
          wiederholungMonate: k.wiederholungMonate === "" ? null : (k.wiederholungMonate ?? null),
          grundlage: String(k.grundlage || "").trim(),
          pflichtFuer: k.pflichtFuer || [],
          zugedacht: k.zugedacht || [],
        };
        const liste = m.kompetenzen || [];
        return { ...m, kompetenzen: liste.some((x) => x.id === rein.id)
          ? liste.map((x) => (x.id === rein.id ? rein : x)) : [...liste, rein] };
      }, "Kompetenz gespeichert"),

      loescheKompetenz: (kid) => mUpd((m) => ({ ...m,
        kompetenzen: (m.kompetenzen || []).filter((x) => x.id !== kid),
        personen: m.personen.map((p) => ({ ...p,
          kompetenzNachweise: (p.kompetenzNachweise || []).filter((n) => n.kompetenzId !== kid) })),
      }), "Kompetenz gelöscht"),

      setzeKompetenz: (pid, kid, erteilen) => mUpd((m) => ({ ...m,
        personen: m.personen.map((p) => {
          if (p.id !== pid) return p;
          const liste = (p.kompetenzNachweise || []).filter((x) => x.kompetenzId !== kid);
          if (!erteilen) {
            const vorher = (p.kompetenzNachweise || []).find((x) => x.kompetenzId === kid);
            if (!vorher) return { ...p, kompetenzNachweise: liste };
            return { ...p, kompetenzNachweise: [...liste,
              { ...vorher, zurueckgenommen: heute(),
                durch: `${sitz.person.vorname} ${sitz.person.nachname}` }] };
          }
          return { ...p, kompetenzNachweise: [...liste,
            { kompetenzId: kid, ab: heute(), bis: null, zurueckgenommen: null,
              durch: `${sitz.person.vorname} ${sitz.person.nachname}` }] };
        }),
      }), "Kompetenz erteilt oder zurückgenommen"),

      setzeKontrastmodus: (an) => mUpd((m) => ({ ...m, personen: m.personen.map((p) =>
        p.id === sitz.person.id ? { ...p, kontrastmodus: an } : p) }), null),

      /* --- Schwarzes Brett --- */
      neuerAushang: (f) => mUpd((m) => ({ ...m, aushang: [{ id: uid("ah"), titel: f.titel, text: f.text,
        wichtig: !!f.wichtig, bis: f.bis || null, von: `${sitz.person.vorname} ${sitz.person.nachname}`,
        zeit: new Date().toLocaleString("de-DE") }, ...(m.aushang || [])] }), "Aushang angeschlagen"),
      loescheAushang: (id) => mUpd((m) => ({ ...m, aushang: (m.aushang || []).filter((x) => x.id !== id) }), "Aushang abgenommen"),

      /* --- Betriebsmittel --- */
      neuesMittel: (f) => mUpd((m) => ({ ...m, betriebsmittel: [...(m.betriebsmittel || []),
        { id: uid("bm"), art: f.art, name: f.name, kennung: f.kennung,
          personId: f.personId || null, seit: f.personId ? heute() : null }] }), "Betriebsmittel angelegt"),
      setzeMittel: (id, k, v) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).map((x) =>
        x.id === id ? { ...x, [k]: v, seit: k === "personId" ? (v ? heute() : null) : x.seit } : x) }), null),
      loescheMittel: (id) => mUpd((m) => ({ ...m, betriebsmittel: (m.betriebsmittel || []).filter((x) => x.id !== id) }), "Betriebsmittel gelöscht"),

  };
}
