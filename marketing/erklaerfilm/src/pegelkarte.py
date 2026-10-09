# Pegelkarte der Stems über die Zeit (für die Prüfung ohne Bild): build/ton/*.wav → stills/pegelkarte.png
import os, json, wave, numpy as np
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); T = os.path.join(H, "..", "build", "ton")
tl = json.load(open(os.path.join(H, "..", "build", "timeline.json")))
def lesen(p):
    w = wave.open(p); x = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(float).reshape(-1, 2)[:, 0] / 32768; return x
B, Hh, L = 1800, 120, 90
spuren = [("stimme", "#071317"), ("bett", "#017070"), ("klang", "#955410"), ("mix", "#3D4E55")]
im = Image.new("RGB", (B + L + 20, len(spuren) * (Hh + 16) + 60), "#F5F5F2"); d = ImageDraw.Draw(im)
for j, (n, farbe) in enumerate(spuren):
    x = lesen(os.path.join(T, n + ".wav")); fen = len(x) // B
    db = 20 * np.log10(np.sqrt((x[: fen * B].reshape(B, fen) ** 2).mean(1)) + 1e-6)
    y0 = 20 + j * (Hh + 16); d.text((8, y0 + Hh // 2 - 6), n, fill="#071317")
    for i, v in enumerate(db):
        h = int(np.clip((v + 60) / 60, 0, 1) * Hh); d.line([(L + i, y0 + Hh), (L + i, y0 + Hh - h)], fill=farbe)
    for lvl in (-20, -40): yy = y0 + Hh - int((lvl + 60) / 60 * Hh); d.line([(L, yy), (L + B, yy)], fill="#D6DAD6")
for s in tl["szenen"]:
    xx = L + int(s["von"] / tl["dauer"] * B); d.line([(xx, 10), (xx, im.height - 30)], fill="#9DA7A3"); d.text((xx + 4, im.height - 26), s["id"] + " " + s["name"], fill="#071317")
for c in tl["klang"]:
    if c["typ"] in ("motiv", "ok", "schluss", "schlag"): xx = L + int(c["t"] / tl["dauer"] * B); d.text((xx - 3, 4), "▼" if c["typ"] != "motiv" else "M", fill="#955410")
im.save(os.path.join(H, "..", "stills", "pegelkarte.png")); print("ok")
