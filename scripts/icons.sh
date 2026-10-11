#!/bin/sh
# Renders public/icons/icon-{16,32,48,128}.png from public/icons/logo.svg (the Nodkey logo).
# Needs Python with cairosvg. ImageMagick's SVG reader crops this logo; do not use it.
set -eu
for size in 16 32 48 128; do
  python3 -c "import cairosvg; cairosvg.svg2png(url='public/icons/logo.svg', write_to='public/icons/icon-$size.png', output_width=$size, output_height=$size)"
done
