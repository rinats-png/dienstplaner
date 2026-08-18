/* ==========================================================================
   WER DARF WELCHE ROLLE VERGEBEN

   Bis hierher hing das Vergeben an einem einzigen Recht: `roles.assign`.
   Wer es hatte, durfte jede Rolle setzen — auch eine zweite
   Organisationsleitung. Wer es nicht hatte, durfte gar nichts. Das sind
   zwei Stufen für eine Frage, die vier hat.

   Die Regel ist einfach und in jedem Betrieb dieselbe: **Niemand vergibt
   die eigene Rolle oder eine darüber.** Eine Planung kann Leute unter sich
   einsetzen, aber keine zweite Planung neben sich stellen und erst recht
   keine Leitung. Sonst genügt ein einziger nachlässig vergebener Zugang,
   damit sich jemand auf Leitungsebene hochzieht.

   Die Leitung ist davon nicht ausgenommen. Auch sie vergibt keine zweite
   Leitung über diesen Weg — dafür gibt es den Betreiber, der den Betrieb
   einrichtet. Eine Leitung, die versehentlich eine zweite ernennt, kann
   sich anschließend selbst herabsetzen lassen; das ist eine
   Vertragsfrage, keine Bedienfrage.

   ---------------------------------------------------------------------------
   Warum das hier liegt und nicht in App.jsx

   Weil es der Server durchsetzen muss. Eine Auswahlliste, die nur die
   erlaubten Rollen anzeigt, ist Bedienkomfort — kein Schutz. Wer die
   Anfrage von Hand stellt, umgeht sie. Dieselbe Funktion beantwortet
   deshalb beide Fragen: Was zeigt die Oberfläche an, und was lässt der
   Server durch.
   ========================================================================== */

/* Von oben nach unten. Der Rang entscheidet, nichts sonst. */
export const RANG = {
  betreiber: 100,
  leitung: 40,
  planer: 30,
  subplaner: 20,
  mitarbeiter: 10,
  betriebsrat: 10,
};

/* Der Betriebsrat steht bewusst auf derselben Stufe wie eine beschäftigte
   Person: Sein Zugang ist rein lesend und kostenfrei, er führt keine
   Planung. Vergeben werden darf er von allen, die überhaupt vergeben
   dürfen — die Arbeitnehmervertretung soll nicht daran scheitern, dass
   gerade niemand aus der Leitung greifbar ist. */

/** Welche Rollen darf jemand mit dieser Rolle vergeben? */
export function vergebbareRollen(vergeber) {
  const meiner = RANG[vergeber];
  if (!meiner) return [];
  /* Der Betreiber richtet den Betrieb ein und setzt die erste Leitung. */
  if (vergeber === "betreiber") return ["leitung", "planer", "subplaner", "mitarbeiter", "betriebsrat"];
  return Object.keys(RANG).filter((r) => r !== "betreiber" && RANG[r] < meiner);
}

/**
 * Darf `vergeber` jemandem die Rolle `ziel` geben?
 *
 * `bisher` ist die Rolle, die die Person heute trägt. Sie zählt mit: Wer
 * eine Rolle nicht vergeben darf, darf sie auch niemandem *wegnehmen* —
 * sonst setzt eine Planung die Leitung auf „Beschäftigte" herab und
 * übernimmt den Betrieb von unten.
 *
 * @returns {{ok: boolean, grund: (string|null)}}
 */
export function darfVergeben(vergeber, ziel, bisher) {
  const erlaubt = vergebbareRollen(vergeber);
  if (!erlaubt.length)
    return { ok: false, grund: "Diese Rolle vergibt keine Zugänge." };

  if (!erlaubt.includes(ziel))
    return { ok: false, grund: `„${ziel}" liegt nicht unterhalb der eigenen Rolle.` };

  /* Die bisherige Rolle muss ebenfalls im eigenen Bereich liegen. */
  if (bisher && bisher !== ziel && !erlaubt.includes(bisher))
    return { ok: false, grund: `„${bisher}" liegt nicht unterhalb der eigenen Rolle und lässt sich nicht ändern.` };

  return { ok: true, grund: null };
}

/**
 * Prüft alle Rollenänderungen zwischen zwei Personenlisten.
 *
 * Der Server bekommt nicht „setze Rolle X", sondern einen ganzen Betrieb.
 * Was sich geändert hat, muss er selbst herausfinden — auch das Anlegen
 * einer neuen Person mit einer Rolle, die der Anlegende nicht vergeben
 * dürfte.
 *
 * @returns {{ok: boolean, grund: (string|null), person: (string|null)}}
 */
export function pruefeRollenwechsel(alt, neu, vergeber) {
  const alteRollen = new Map((Array.isArray(alt) ? alt : [])
    .filter(Boolean).map((p) => [p.id, p.rolle]));

  for (const p of (Array.isArray(neu) ? neu : []).filter(Boolean)) {
    const bisher = alteRollen.get(p.id);
    /* Unverändert? Dann gibt es nichts zu prüfen — sonst könnte niemand
       mehr eine Person speichern, deren Rolle über der eigenen liegt. */
    if (bisher === p.rolle) continue;

    const urteil = darfVergeben(vergeber, p.rolle, bisher);
    if (!urteil.ok)
      return { ok: false, grund: urteil.grund, person: p.id };
  }

  /* Entfernte Personen: Wer eine Rolle nicht vergeben darf, darf ihre
     Trägerin auch nicht löschen. */
  const neueIds = new Set((Array.isArray(neu) ? neu : []).filter(Boolean).map((p) => p.id));
  const erlaubt = vergebbareRollen(vergeber);
  for (const [id, r] of alteRollen) {
    if (neueIds.has(id)) continue;
    if (!erlaubt.includes(r))
      return { ok: false, grund: `„${r}" liegt nicht unterhalb der eigenen Rolle und lässt sich nicht entfernen.`,
        person: id };
  }

  return { ok: true, grund: null, person: null };
}

/* --------------------------------------------------------------------------
   EIGENE ROLLENBEZEICHNUNGEN

   „Sub-Planer" heißt in einer Klinik Stationsleitung, im Wachdienst
   Objektleiter und in der Pflege Wohnbereichsleitung. Die Rolle bleibt
   dieselbe, ihr Name nicht. Umbenannt wird deshalb nur die Anzeige — die
   Kennung `subplaner` und alles, was daran hängt, rührt sich nicht.
   -------------------------------------------------------------------------- */

/** Nur die Anzeige, nie die Kennung. Leerer Name heißt: Vorgabe. */
export function rollennamen(m, vorgabe) {
  const eigen = (m && m.rollennamen) || {};
  const aus = {};
  for (const id of Object.keys(vorgabe)) {
    const name = String(eigen[id] || "").trim();
    aus[id] = name || vorgabe[id];
  }
  return aus;
}

/** Prüft einen eingegebenen Namen, bevor er in den Bestand geht. */
export function nameGueltig(name) {
  const s = String(name || "").trim();
  if (!s) return { ok: true, wert: "" };            // leeren heißt zurücksetzen
  if (s.length < 2) return { ok: false, grund: "Mindestens zwei Zeichen." };
  if (s.length > 40) return { ok: false, grund: "Höchstens vierzig Zeichen." };
  return { ok: true, wert: s };
}
