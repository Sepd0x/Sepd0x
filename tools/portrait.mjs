// PORTRAIT: the GitHub avatar re-drawn in monospace type, in two passes.
//  1. Tone: every candidate glyph of JetBrains Mono Bold is rasterised and ranked by measured ink
//     coverage; the ramp is resampled so each step adds an equal amount of ink.
//  2. Contour: a Sobel pass over the image finds strong edges; there the tone glyph is replaced by the
//     stroke that follows the edge ( | / - \ _ ), so the silhouette is drawn, not just shaded.
// Rows are revealed top to bottom; afterwards a read-head passes down the image every few seconds.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { THEMES, profile, download, glyphRun, writeAsset, tidy, n, isMain, CACHE, ASSETS, readState, writeState } from './lib.mjs';

const FW = 520, FH = 372, R = 8;                 // same frame as the marco-polo card
const CW = 4.4, CH = 7.4;                        // cell; glyph size = CW / .6 (monospace advance)
const COLS = Math.floor((FW - 8) / CW), ROWS = Math.floor((FH - 10) / CH);
const SIZE = CW / 0.6;
const CANDIDATES = [..." .'`,:;-~=+*\"!ilrtx<>?|()[]{}1sepd0zcvnuo#%&@$8BMWQNHKRmwqbhkg"];
const LEVELS = 13;
const EDGE_Q = 0.86;                              // cells above this edge-strength quantile become strokes

async function coverage(ch) {
  const [g] = glyphRun(ch, 0, 80, 100);
  if (!g.d) return 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="100"><rect width="60" height="100"/><path d="${g.d}" fill="#fff"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  let s = 0; for (const v of data) s += v;
  return s / data.length / 255;
}

async function toneRamp() {
  const measured = [];
  for (const ch of CANDIDATES) measured.push({ ch, c: await coverage(ch) });
  measured.sort((a, b) => a.c - b.c);
  const top = measured[measured.length - 1].c;
  const prefer = new Set([...'sepd0x']);           // the handle's letters win near-ties
  const out = [];
  for (let i = 0; i < LEVELS; i++) {
    const want = (i / (LEVELS - 1)) * top;
    let best = null;
    for (const m of measured) {
      const err = Math.abs(m.c - want) - (prefer.has(m.ch) ? 0.012 : 0);
      if (!best || err < best.err) best = { ...m, err };
    }
    if (!out.length || out[out.length - 1].ch !== best.ch) out.push(best);
  }
  return out.map((m) => m.ch);
}

export async function render({ force = false } = {}) {
  const user = await profile();
  const state = readState();
  const buf = await download(user.avatarUrl, path.join(CACHE, 'avatar.png'));
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  if (!force && state.avatar === hash && fs.existsSync(path.join(ASSETS, 'portrait-dark.svg'))) {
    console.log('same  portrait (avatar unchanged)');
    return;
  }

  const meta = await sharp(buf).metadata();
  const side = Math.min(meta.width, meta.height);
  // Crop to the frame's aspect, centred a little below the middle (where the car sits).
  const cwid = Math.round(side * 0.97), chei = Math.round(cwid * (ROWS * CH) / (COLS * CW));
  const crop = { left: Math.round((meta.width - cwid) / 2), top: Math.round(Math.min(meta.height - chei, Math.max(0, meta.height * 0.56 - chei / 2))), width: cwid, height: chei };
  const rows = ROWS;
  const base = sharp(buf).extract(crop).greyscale();
  const { data: raw } = await base.clone().sharpen({ sigma: 0.6 }).resize(COLS, rows, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  // Edges at 3x the cell resolution, pooled per cell.
  const EX = 3, ew = COLS * EX, eh = rows * EX;
  const { data: big } = await base.clone().blur(1.1).resize(ew, eh, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });

  // Tone: percentile stretch, half histogram-equalised, half gamma; darkest 30 % stays blank.
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.997)];
  const lin = [...raw].map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
  const hist = new Float64Array(257);
  for (const v of lin) hist[Math.round(v * 256)]++;
  for (let i = 1; i < 257; i++) hist[i] += hist[i - 1];
  const tone = lin.map((v) => {
    const t = 0.45 * (hist[Math.round(v * 256)] / lin.length) + 0.55 * v ** 0.7;
    return t < 0.24 ? 0 : (t - 0.24) / 0.76;
  });

  // Sobel per cell: strongest gradient inside the cell and its direction.
  const at = (x, y) => big[Math.min(eh - 1, Math.max(0, y)) * ew + Math.min(ew - 1, Math.max(0, x))];
  const mag = new Float64Array(COLS * rows), ang = new Float64Array(COLS * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
    let bm = 0, ba = 0;
    for (let y = r * EX; y < (r + 1) * EX; y++) for (let x = c * EX; x < (c + 1) * EX; x++) {
      const gx = -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const m = Math.hypot(gx, gy);
      if (m > bm) { bm = m; ba = Math.atan2(gy, gx); }
    }
    mag[r * COLS + c] = bm; ang[r * COLS + c] = ba;
  }
  const mags = [...mag].sort((a, b) => a - b);
  const edgeMin = mags[Math.floor(mags.length * EDGE_Q)];
  // Edge direction is perpendicular to the gradient; the cell is taller than wide, so correct the angle.
  const stroke = (a) => {
    let d = (Math.atan2(Math.sin(a) * (CW / CH), Math.cos(a)) * 180) / Math.PI + 90; // edge direction, degrees
    d = ((d % 180) + 180) % 180;
    if (d < 22.5 || d >= 157.5) return '-';
    if (d < 67.5) return '\\';
    if (d < 112.5) return '|';
    return '/';
  };

  const ramp = await toneRamp();
  const glyphs = [...new Set([...ramp.slice(1), '-', '\\', '|', '/'])];
  const gid = new Map(glyphs.map((ch, i) => [ch, 'g' + i.toString(36)]));
  const used = new Set();
  const OX = (FW - COLS * CW) / 2, OY = (FH - rows * CH) / 2;
  const rowsSvg = [];
  const READ_AT = 0.15 + ROWS * 0.03 + 1.2, READ_ROW = 0.055;
  for (let r = 0; r < rows; r++) {
    let cells = '';
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      let ch = ramp[Math.min(ramp.length - 1, Math.round(tone[i] * (ramp.length - 1)))];
      const edge = mag[i] >= edgeMin && (tone[i] > 0.05 || lin[i] > 0.12);
      if (edge) ch = stroke(ang[i]);
      if (ch === ' ') continue;
      used.add(ch);
      const hot = lin[i] > 0.93 && r > rows * 0.35;           // light sources low in the frame: the headlights
      const cls = hot ? ' class="a"' : edge ? ' class="e"' : '';
      cells += `<use href="#${gid.get(ch)}" x="${n(OX + c * CW, 1)}"${cls}/>`;
    }
    if (cells) rowsSvg.push(`<g transform="translate(0 ${n(OY + (r + 1) * CH - 1.5, 1)})"><g class="r" style="animation-delay:${n(0.15 + r * 0.03, 3)}s,${n(READ_AT + r * READ_ROW, 3)}s">${cells}</g></g>`);
  }
  const defs = [...used].map((ch) => `<path id="${gid.get(ch)}" d="${glyphRun(ch, 0, 0, SIZE, { prec: 2 })[0].d}"/>`).join('');
  const cycle = n(READ_AT + rows * READ_ROW + 6, 2);
  const headY0 = OY, headY1 = OY + rows * CH;

  for (const [name, c] of Object.entries(THEMES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" width="${FW}" height="${FH}" role="img" aria-label="portrait">
<style>
.frame{fill:${c.paper};stroke:${c.faint}}
.r{fill:${c.muted};opacity:0;animation:row .45s steps(3,end) both,read ${cycle}s linear infinite}
.e{fill:${c.ink}}.a{fill:${c.acc}}
.head{opacity:0;animation:head ${cycle}s linear ${READ_AT}s infinite}
@keyframes row{0%{opacity:0;transform:translateX(-5px)}100%{opacity:1}}
@keyframes read{0%,100%{fill:${c.muted}}.8%{fill:${c.accHi}}4%{fill:${c.muted}}}
@keyframes head{0%{opacity:1;transform:translateY(${n(headY0)}px)}${n((rows * READ_ROW / cycle) * 100, 2)}%{opacity:1;transform:translateY(${n(headY1)}px)}${n(((rows * READ_ROW + 0.3) / cycle) * 100, 2)}%,100%{opacity:0;transform:translateY(${n(headY1)}px)}}
@media (prefers-reduced-motion:reduce){.r,.head{animation:none}.r{opacity:1}}
</style>
<defs>${defs}<linearGradient id="hg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c.acc}" stop-opacity=".22"/><stop offset="1" stop-color="${c.acc}" stop-opacity="0"/></linearGradient>
<clipPath id="cf"><rect x=".5" y=".5" width="${FW - 1}" height="${FH - 1}" rx="${R}"/></clipPath></defs>
<rect class="frame" x=".5" y=".5" width="${FW - 1}" height="${FH - 1}" rx="${R}"/>
<g clip-path="url(#cf)">
${rowsSvg.join('')}
<g class="head"><rect y="-28" width="${FW}" height="28" fill="url(#hg)"/><path d="M0 0H${FW}" stroke="${c.acc}" stroke-width="1"/></g>
</g>
</svg>`;
    writeAsset(`portrait-${name}.svg`, tidy(svg));
  }
  writeState({ ...readState(), avatar: hash });
  console.log('ramp:', JSON.stringify(ramp.join('')), 'cells:', rows, 'x', COLS);
}

if (isMain(import.meta.url)) render({ force: process.argv.includes('--force') });
