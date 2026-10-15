import json, pathlib, bau_web as w, toolkit as v
DUNKEL = """
:root{--grund:#0B1418;--kachel:#121E23;--kachel2:#18262C;--linie:#22343B;--ink:#E8F1F3;--ink2:#C2D0D4;--muted:#93A6AD;--leise:#6D8189;--akzent:#3FBFBF;--akzent-t:#8FE3E3;--akzent-h:#13292C;--auf-akzent:#04201F;--hero:#0F3238;--hero-ink:#E9F6F6;--hero-muted:#93BEC2;--hero-fl:rgba(255,255,255,.07);--f:#A2C3F6;--f-bg:#16243A;--s:#F2B784;--s-bg:#33230F;--n:#BEB2F6;--n-bg:#231E3C;--ok:#4ADE9B;--ok-bg:#0F2620;--warn:#F0B060;--warn-bg:#2A2013;--krit:#F5958A;--krit-bg:#341613;--a1:#13292C;--a2:#152A33;--a3:#2A2013;--a4:#1E1B2C;--a5:#0F2620;--verlauf-a:rgba(63,191,191,.22);--verlauf-b:rgba(80,232,244,.08);--verlauf-c:rgba(127,224,224,.10);--schatten:0 0 0 1px rgba(255,255,255,.05);--schatten2:0 16px 40px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.06);--auf-krit:#2A0B07}
.hauptnav{background:rgba(18,30,35,.82)}
.unter a.an{background:rgba(255,255,255,.08)}
.hauptnav .zahl{color:var(--auf-krit)}
.schalter::after{background:#E8F1F3}
"""
w.WEB_CSS = w.WEB_CSS + DUNKEL
r = w.bauen(dunkel=True, praefix="D")
print(len(r))
