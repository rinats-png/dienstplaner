/* global document, window, getComputedStyle */
/* WP-21: gemeinsame Messfunktion der Browserproben (geraete-wp21.mjs, geraete-wp21-ablaeufe.mjs).
   Wird mit page.evaluate(messeSeite, ZIEL_MINDEST) im Browser ausgefuehrt und muss deshalb ohne Bezug auf
   Modulvariablen auskommen. Misst Seitenbreite, Innenscroll-Bereiche, Zielgroessen (WCAG 2.5.8 mit Ausnahme "Abstand")
   und den Hinweis "Fuer Tablet und Rechner ausgelegt". */
export function messeSeite(mindest) {
  const fenster = window.innerWidth;
  const sichtbar = (el) => { const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none") return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const beschr = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "")
    + "|" + (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 28));
  const klemmt = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
  /* 1. Querscrollen der Seite; wer ragt aus dem Fenster, ohne dass ein Elternteil es abschneidet */
  const ragt = [...document.body.querySelectorAll("*")].filter((el) => { if (!sichtbar(el)) return false;
    if (getComputedStyle(el).position === "fixed") return false;
    const r = el.getBoundingClientRect(); return r.right > fenster + 1 && !klemmt(el); });
  const ragtOben = ragt.filter((el) => !ragt.includes(el.parentElement)).slice(0, 4).map((el) => beschr(el) + "@" + Math.round(el.getBoundingClientRect().right));
  const innen = [...document.querySelectorAll("main *, .m-schale *")].filter((el) => el.scrollWidth > el.clientWidth + 1
    && /(auto|scroll)/.test(getComputedStyle(el).overflowX) && sichtbar(el)).map((el) => beschr(el) + "|" + el.scrollWidth + ">" + el.clientWidth);
  /* 2. Zielgroessen */
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=menuitem], [tabindex="0"]';
  const ziele = [];
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("[inert], [aria-hidden=true]") || el.disabled) continue;
    let ref = el;
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) { const l = el.closest("label") || (el.id && document.querySelector(`label[for="${el.id}"]`)); if (l) ref = l; }
    if (!sichtbar(ref)) { if (ref === el && getComputedStyle(el).opacity === "0") { /* unsichtbar gestaltetes Eingabefeld ohne Beschriftung */ } continue; }
    const r = ref.getBoundingClientRect();
    if (r.right <= 0 || r.left >= fenster) continue;                       /* ausserhalb des Fensters (zugeklappte Seitenleiste) */
    const cs = getComputedStyle(el);
    if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li, span, div") && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 12) continue; /* Satzlink (Ausnahme "inline") */
    if (el.classList.contains("sprung") || el.classList.contains("nurLeser")) continue;
    ziele.push({ el, r, wer: beschr(el) });
  }
  const klein = ziele.filter((z) => z.r.width < mindest - 0.5 || z.r.height < mindest - 0.5);
  const durchAbstand = (z) => { const cx = z.r.left + z.r.width / 2, cy = z.r.top + z.r.height / 2;
    return !ziele.some((o) => { if (o === z) return false; if (o.el.contains(z.el) || z.el.contains(o.el)) return false;
      const ocx = o.r.left + o.r.width / 2, ocy = o.r.top + o.r.height / 2;
      if (o.r.width < mindest - 0.5 || o.r.height < mindest - 0.5) return Math.hypot(cx - ocx, cy - ocy) < mindest;
      const nx = Math.max(o.r.left, Math.min(cx, o.r.right)), ny = Math.max(o.r.top, Math.min(cy, o.r.bottom));
      return Math.hypot(cx - nx, cy - ny) < mindest / 2; }); };
  const zuKlein = klein.filter((z) => !durchAbstand(z));
  /* ermittelter Hinweis auf dem Telefon */
  const hinweis = /Für Tablet und Rechner ausgelegt/.test(document.body.innerText);
  const seiteFehler = !!document.querySelector('[role="alert"]') && /Fehler|nicht verfügbar/i.test((document.querySelector('[role="alert"]') || {}).textContent || "");
  return { fenster, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, ragtOben, innen,
    ziele: ziele.length, kleinsteBreite: Math.round(Math.min(...ziele.map((z) => z.r.width))), kleinsteHoehe: Math.round(Math.min(...ziele.map((z) => z.r.height))), klein: klein.length, zuKlein: zuKlein.length,
    zuKleinListe: zuKlein.slice(0, 6).map((z) => z.wer + "=" + Math.round(z.r.width) + "x" + Math.round(z.r.height)), hinweis, seiteFehler };
}
