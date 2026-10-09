#!/usr/bin/env bash
# Legt den Master-Ton (build/ton/mix.wav) unter die gerenderten Bilder und schreibt out/.
# Erwartet build/video/{16x9,9x16,1x1,16x9_rm}.mp4 aus render.mjs.
set -euo pipefail
HIER="$(cd "$(dirname "$0")" && pwd)"; V="$HIER/../build/video"; O="$HIER/../out"; TON="$HIER/../build/ton/mix.wav"
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
mkdir -p "$O"
ton() { "$FF" -loglevel error -y -i "$V/$1.mp4" -i "$TON" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "$O/$2"; }
ton 16x9 master_16x9.mp4
ton 9x16 cut_9x16.mp4
ton 1x1 cut_1x1.mp4
ton 16x9_rm master_16x9_reduzierte_bewegung.mp4
ls -la "$O"
