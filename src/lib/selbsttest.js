/* WP-39: aus src/App.jsx herausgeloest (Text unveraendert). */



/* Der Selbsttest wohnt in pruefung.jsx und wird nur geladen, wenn ihn
   jemand aufruft. 397 Prüfungen sind für die Entwicklung unentbehrlich und
   für einen Kunden totes Gewicht — 63 KB, die niemand herunterladen soll. */
export let _selbsttest = null;
export async function selbsttestLaden() {
  if (_selbsttest) return _selbsttest;
  const mod = await import("../pruefung.jsx");
  _selbsttest = mod.selbsttest;
  return _selbsttest;
}
