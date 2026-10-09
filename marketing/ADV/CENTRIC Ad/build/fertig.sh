#!/usr/bin/env bash
# Teilbilder (3 je Bild, 180°-Verschluss) zu 60 fps mitteln, Ton anlegen, Kontaktbogen erzeugen.
# Aufruf: bash fertig.sh <teilbilder-ordner> <16x9|9x16> <ausgabe.mp4>
set -euo pipefail
SUBDIR="$1"; FMT="$2"; OUT="$3"
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
HIER="$(cd "$(dirname "$0")" && pwd)"
TON="$HIER/../stems/MASTER_CENTRIC_45s.wav"
"$FF" -loglevel error -y -framerate 180 -i "$SUBDIR/s%06d.jpg" -i "$TON" \
  -vf "tmix=frames=3,select='eq(mod(n\,3)\,2)',setpts=N/60/TB,format=yuv420p" -r 60 \
  -c:v libx264 -preset slow -crf 16 -profile:v high -movflags +faststart \
  -c:a aac -b:a 256k -ar 48000 -shortest "$OUT"
# Kontaktbogen: ein Bild je Beat (Mitte der Beats, Zeiten aus der Stimme)
SHEET="${OUT%.mp4}_kontaktbogen.jpg"
ZEITEN="0.6 1.4 3.9 5.4 8.3 10.6 12.4 14.2 16.4 18.8 21.0 22.2 23.9 26.0 27.6 29.9 31.8 32.9 34.0 35.5 36.2 38.0 39.4 42.8"
TMP=$(mktemp -d); i=0
for t in $ZEITEN; do "$FF" -loglevel error -y -ss "$t" -i "$OUT" -frames:v 1 -vf "scale=640:-1,drawtext=text='${t}s':x=12:y=10:fontcolor=white:fontsize=22:box=1:boxcolor=black@0.5" "$TMP/k$(printf %02d $i).jpg" 2>/dev/null || \
  "$FF" -loglevel error -y -ss "$t" -i "$OUT" -frames:v 1 -vf "scale=640:-1" "$TMP/k$(printf %02d $i).jpg"; i=$((i+1)); done
if [ "$FMT" = "9x16" ]; then TILE=8x3; else TILE=4x6; fi
"$FF" -loglevel error -y -pattern_type glob -i "$TMP/k*.jpg" -vf "tile=$TILE:padding=6:color=0x04080A" -frames:v 1 "$SHEET"
rm -rf "$TMP"; ls -la "$OUT" "$SHEET"
