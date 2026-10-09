/* ==========================================================================
   SCHREIBTOR — Schreibvorgänge der Ablage anhalten, zählen, scheitern lassen

   Ein Race ist nur dann prüfbar, wenn die Reihenfolge feststeht. Dieser
   Helfer hüllt jeden Store, den `getStore` herausgibt, in ein Tor:

     halten(...)     ein setJSON auf passende Schlüssel kehrt erst zurück,
                     wenn `freigeben()` gerufen wird — der Aufrufer (auch ein
                     Produktivcode, der den Rückgabewert nicht abwartet)
                     sieht bis dahin nichts. So steht fest: Die Anfrage hat
                     gelesen, ihr Schreibvorgang ist unterwegs, aber noch
                     nicht gelandet.
     fehlerBei(...)  ein delete/setJSON auf passende Schlüssel wirft.
     protokoll       jeder Schreib- und Löschvorgang, in Reihenfolge.
     leer()          wartet, bis kein (nicht angehaltener) Schreibvorgang mehr
                     läuft — statt zu schlafen.

   Eingebunden wird der Helfer in der Testdatei mit

     vi.mock("../server/lib/ablage.mjs", async (orig) => {
       const echt = await orig();
       const { umhuellen } = await import("./hilfen/schreibtor.mjs");
       return { ...echt, getStore: (a) => umhuellen(echt.getStore(a),
         typeof a === "string" ? a : a.name) };
     });

   Er kennt keinen Produktivcode und keine Schlüsselnamen der Anwendung; er
   arbeitet nur mit Speichername und Schlüsselpräfix.
   ========================================================================== */

const zustand = {
  regeln: /** @type {any[]} */ ([]),
  fehler: /** @type {any[]} */ ([]),
  protokoll: /** @type {Array<{store: string, op: string, key: string}>} */ ([]),
  laufend: /** @type {Set<Promise<any>>} */ (new Set()),
};

const passt = (regel, store, key) =>
  regel.store === store && regel.praefixe.some((p) => key.startsWith(p));

export const tor = {
  /** Alle setJSON-Aufrufe auf `praefixe` im Store `store` anhalten. */
  halten({ store, praefixe }) {
    const regel = {
      store, praefixe, aktiv: true,
      /** Schlüssel der angehaltenen Schreibvorgänge, in Reihenfolge. */
      gehalten: /** @type {string[]} */ ([]),
      warten: /** @type {Array<() => void>} */ ([]),
      offen: /** @type {Promise<any>[]} */ ([]),
      /** Lässt alle angehaltenen Schreibvorgänge landen; spätere gehen frei durch. */
      freigeben() { regel.aktiv = false; for (const f of regel.warten.splice(0)) f(); },
      /** Wartet, bis die angehaltenen Schreibvorgänge wirklich auf der Platte sind. */
      abwarten() { return Promise.allSettled(regel.offen); },
    };
    zustand.regeln.push(regel);
    return regel;
  },

  /** Ein Vorgang (`delete` oder `setJSON`) auf passende Schlüssel wirft. */
  fehlerBei({ store, praefixe, op = "delete" }) {
    const f = { store, praefixe, op, ausgeloest: /** @type {string[]} */ ([]) };
    zustand.fehler.push(f);
    return f;
  },

  get protokoll() { return zustand.protokoll; },

  /** Alle Schreibvorgänge auf einen Schlüssel (genau), in Reihenfolge. */
  schreibungen(store, key) {
    return zustand.protokoll.filter((p) => p.store === store && p.key === key
      && (p.op === "setJSON" || p.op === "set"));
  },

  /** Wartet, bis kein freier Schreibvorgang mehr unterwegs ist. */
  async leer() {
    while (zustand.laufend.size) await Promise.allSettled([...zustand.laufend]);
  },

  zuruecksetzen() {
    for (const r of zustand.regeln) r.freigeben();
    zustand.regeln.length = 0;
    zustand.fehler.length = 0;
    zustand.protokoll.length = 0;
  },
};

/**
 * Hüllt einen Store in das Tor.
 * @param {any} echt
 * @param {string} name
 */
export function umhuellen(echt, name) {
  const schreib = (op) => (key, ...rest) => {
    const k = String(key);
    zustand.protokoll.push({ store: name, op, key: k });
    const f = zustand.fehler.find((x) => x.op === op && passt(x, name, k));
    if (f) { f.ausgeloest.push(k); return Promise.reject(new Error(`Tor: ${op} auf ${k} scheitert (Absicht)`)); }

    const regel = zustand.regeln.find((r) => r.aktiv && op !== "delete" && passt(r, name, k));
    let p;
    if (regel) {
      regel.gehalten.push(k);
      p = new Promise((f2) => regel.warten.push(f2)).then(() => echt[op](key, ...rest));
      regel.offen.push(p);
    } else {
      p = Promise.resolve().then(() => echt[op](key, ...rest));
    }
    /* Angehaltene Vorgänge zählen nicht als „unterwegs": leer() würde sonst
       auf eine Freigabe warten, die der Test erst danach gibt. */
    if (!regel) {
      zustand.laufend.add(p);
      const weg = () => zustand.laufend.delete(p);
      p.then(weg, weg);
    }
    return p;
  };
  return {
    get: (...a) => echt.get(...a),
    getWithMetadata: (...a) => echt.getWithMetadata(...a),
    getMetadata: (...a) => echt.getMetadata(...a),
    list: (...a) => echt.list(...a),
    set: schreib("set"),
    setJSON: schreib("setJSON"),
    delete: schreib("delete"),
  };
}
