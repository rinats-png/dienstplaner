# Kontaktbogen aus Standbildern: python3 bogen.py <ausgabe> <spalten> <breite> bilder…
import sys
from PIL import Image, ImageDraw
out, sp, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); fs = sys.argv[4:]
ims = [Image.open(f).convert("RGB") for f in fs]; h = int(b * ims[0].height / ims[0].width)
zeilen = (len(ims) + sp - 1) // sp
S = Image.new("RGB", (sp * (b + 8) + 8, zeilen * (h + 30) + 8), "#2A2E2D"); d = ImageDraw.Draw(S)
for i, (im, f) in enumerate(zip(ims, fs)):
    x, y = 8 + (i % sp) * (b + 8), 8 + (i // sp) * (h + 30)
    S.paste(im.resize((b, h)), (x, y + 22)); d.text((x, y + 4), f.rsplit("/", 1)[-1].rsplit(".", 1)[0], fill="#E8EAE6")
S.save(out, quality=88)
