"""Minimaler Werkzeugkasten für die Website-Mockups (Stil: Version 3)."""
import pathlib
HIER = pathlib.Path(__file__).parent
P = pathlib.Path(__import__("os").environ.get("DESIGN_ZIEL", HIER.parent.parent / "canvas"))  # Ziel: design/canvas
P.mkdir(parents=True, exist_ok=True)
CSS = (HIER / "basis.css").read_text()
AN = ' class="an"'
FONTS = "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;display=swap"

def svg(d, w=18):
    return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'

I = {
 "heute": '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"></path>',
 "plan": '<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
 "entscheiden": '<path d="M5 12.5l4 4L19 7"></path>',
 "team": '<circle cx="9" cy="8.5" r="3.2"></circle><path d="M3.5 19c.7-3 3-4.6 5.5-4.6s4.8 1.6 5.5 4.6"></path><circle cx="17" cy="9.5" r="2.4"></circle><path d="M16.5 14.6c2 .2 3.4 1.6 4 4"></path>',
 "pruefung": '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"></path><path d="M9 12l2 2 4-4"></path>',
 "suche": '<circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4-4"></path>',
 "funke": '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"></path>',
 "pfeil": '<path d="M7 17L17 7M9 7h8v8"></path>',
 "pfeilr": '<path d="M5 12h14M13 6l6 6-6 6"></path>',
 "links": '<path d="M15 6l-6 6 6 6"></path>', "rechts": '<path d="M9 6l6 6-6 6"></path>',
 "haken2": '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
 "achtung": '<path d="M12 8v5M12 16.5v.5"></path><path d="M10.3 3.8L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0z"></path>',
 "plus": '<path d="M12 5v14M5 12h14"></path>',
 "hoch": '<path d="M12 16V4M7 9l5-5 5 5"></path><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path>',
 "download": '<path d="M12 4v11M7 10l5 5 5-5"></path><path d="M4 18v2h16v-2"></path>',
 "tausch": '<path d="M7 7h12l-3-3M17 17H5l3 3"></path>',
 "krank": '<path d="M12 21s-7-4.5-7-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 7 2.8C19 16.5 12 21 12 21z"></path><path d="M9.5 13h5M12 10.5v5"></path>',
 "uhr": '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
 "regel": '<path d="M6 4h9l3 3v13H6z"></path><path d="M9 11h6M9 15h6"></path>',
 "schloss": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"></rect><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"></path>',
 "schluessel": '<circle cx="8" cy="15" r="4"></circle><path d="M11 12l8-8M16 7l2 2M14 9l2 2"></path>',
 "kalender": '<rect x="3.5" y="5" width="17" height="15" rx="3"></rect><path d="M3.5 10h17M8 3v4M16 3v4"></path>',
 "ich": '<circle cx="12" cy="8.5" r="3.5"></circle><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"></path>',
 "frage": '<circle cx="12" cy="12" r="8.5"></circle><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5M12 16.8v.2"></path>',
 "mehr": '<circle cx="5.5" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="18.5" cy="12" r="1.3"></circle>',
 "menue": '<path d="M4 7h16M4 12h16M4 17h16"></path>',
 "post": '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>',
 "gebaeude": '<path d="M4 20V8l8-4 8 4v12"></path><path d="M9 20v-5h6v5M8 11h2M14 11h2"></path>',
 "feuer": '<path d="M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 12 15.5 4 4 0 0 1 8 11.5C8 10 9 9 9 7c1.5 1 2.5 1.5 3-4z"></path><path d="M10 19.5h4"></path>',
 "krankenhaus": '<rect x="4" y="5" width="16" height="15" rx="2.5"></rect><path d="M12 9v7M8.5 12.5h7"></path>',
 "kreuz": '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"></path>',
 "fabrik": '<path d="M3.5 20V10l5 3V10l5 3V8l7 3.5V20z"></path>',
 "lkw": '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"></path><circle cx="7.5" cy="17.5" r="1.7"></circle><circle cx="17" cy="17.5" r="1.7"></circle>',
 "tasse": '<path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"></path><path d="M16 9h2a2 2 0 0 1 0 5h-2M7 4.5v1.5M11 4.5v1.5"></path>',
 "korb": '<path d="M4 9h16l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.2H7a1.5 1.5 0 0 1-1.5-1.2zM8 9l3-5M16 9l-3-5"></path>',
 "besen": '<path d="M14 3l-4 9M7 12h9l1.5 8h-12z"></path>',
 "headset": '<path d="M5 14v-2a7 7 0 0 1 14 0v2"></path><rect x="3.5" y="13.5" width="4" height="5.5" rx="1.5"></rect><rect x="16.5" y="13.5" width="4" height="5.5" rx="1.5"></rect>',
 "schild": '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"></path>',
 "welt": '<circle cx="12" cy="12" r="8.5"></circle><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"></path>',
}
def ic(n, w=18): return svg(I[n], w)

LOGO = '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="9" style="fill: var(--ink)"></rect><path d="M18.6 9.6a6 6 0 1 0 0 8.8" fill="none" stroke-width="2.6" stroke-linecap="round" style="stroke: var(--kachel)"></path><circle cx="19" cy="14" r="1.9" style="fill: var(--akzent)"></circle></svg>'

def pille(c, t, punkt=True):
    return f'<span class="pille {c}">' + ('<span class="p"></span>' if punkt else '') + f'{t}</span>'
def ava(ini, n=1, kl=""):
    return f'<span class="ava a{n}{(" " + kl) if kl else ""}">{ini}</span>'
def knopf(t, art="", icon=None, href=None):
    i = ic(icon, 17) if icon else ""
    if href: return f'<a class="knopf {art}" href="{href}">{i}{t}</a>'
    return f'<button class="knopf {art}" type="button">{i}{t}</button>'
def zeile(links, t, u="", rechts="", stil=""):
    uu = f'<div class="u">{u}</div>' if u else ""
    r = f'<div class="r">{rechts}</div>' if rechts else ""
    return f'<div class="zeile" style="{stil}">{links}<div style="min-width: 0"><div class="t">{t}</div>{uu}</div>{r}</div>'
def minichip(farbe, icon, gr=34):
    return f'<span class="chip {farbe}" style="width: {gr}px; height: {gr}px; border-radius: 11px">{ic(icon,16)}</span>'
def kachel(inhalt, stil="", cls=""):
    return f'<section class="k {cls}" style="{stil}">{inhalt}</section>'

def ring(wert, gesamt, gr=132, dicke=12, farbe="var(--akzent)", grund="var(--hero-fl)", text="", unter=""):
    r = (gr - dicke) / 2; u = 2 * 3.14159 * r; voll = u * wert / gesamt; c = gr / 2
    return f'''<div style="position: relative; width: {gr}px; height: {gr}px; flex: none">
<svg width="{gr}" height="{gr}" viewBox="0 0 {gr} {gr}" aria-hidden="true"><circle cx="{c}" cy="{c}" r="{r:.1f}" fill="none" stroke-width="{dicke}" style="stroke: {grund}"></circle>
<circle cx="{c}" cy="{c}" r="{r:.1f}" fill="none" stroke-width="{dicke}" stroke-linecap="round" stroke-dasharray="{voll:.1f} {u:.1f}" transform="rotate(-90 {c} {c})" style="stroke: {farbe}"></circle></svg>
<div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center"><span class="num" style="font-size: {int(gr/4.2)}px; font-weight: 600; letter-spacing: -.03em; line-height: 1">{text}</span><span style="font-size: 12px; opacity: .75; margin-top: 4px">{unter}</span></div></div>'''

def bogen(anteil, breite=240, farbe="var(--akzent)"):
    r = breite / 2 - 12; laenge = 3.14159 * r; h = breite / 2 + 4
    return f'''<svg width="{breite}" height="{h:.0f}" viewBox="0 0 {breite} {h:.0f}" aria-hidden="true">
<path d="M12 {breite/2:.0f} A{r:.0f} {r:.0f} 0 0 1 {breite-12} {breite/2:.0f}" fill="none" stroke-width="16" stroke-linecap="round" style="stroke: var(--kachel2)"></path>
<path d="M12 {breite/2:.0f} A{r:.0f} {r:.0f} 0 0 1 {breite-12} {breite/2:.0f}" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="{laenge*anteil:.1f} {laenge:.1f}" style="stroke: {farbe}"></path></svg>'''

def datei(titel, w, h, koerper, dunkel=False, extra_css=""):
    css = CSS + extra_css
    return f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>{titel}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; overflow: hidden; background: var(--grund); color: var(--ink); font-family: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif">
{koerper}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    return {{}};
  }}
}}
</script>
</body>
</html>
'''
