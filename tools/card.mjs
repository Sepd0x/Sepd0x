// CARD: marco-polo, told by its own screenshot. The repo's "area locked" capture is fetched, the
// dashed area-of-interest it shows is located, and every pool inside it is found by colour (cyan
// water, high saturation, bright) with a connected-component pass. The imagery is posterised to four
// tones in the theme's ink (CARD_STYLE=dither gives a 1-bit Atkinson dither instead); the card then
// re-enacts a scan: the area draws itself, a sweep crosses it, and each pool lights up as the sweep
// reaches it, with its trace marked on the rail below.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { THEMES, textPath, glyphRun, writeAsset, tidy, n, isMain, CACHE, ASSETS, download, readState, writeState } from './lib.mjs';

const REPO = 'Sepd0x/marco-polo';
const MEDIA = 'docs/media';
const PREFER = ['area-locked.png', 'scan-live.png', 'results.png'];
const W = 520, IH = 300, H = 372, R = 8;
const PX = 2;                                   // dither cell, in card pixels

async function listMedia() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${MEDIA}`, { headers: { authorization: `bearer ${token}`, 'user-agent': 'sepd0x-profile' } });
    if (!r.ok) throw new Error('contents API ' + r.status);
    return r.json();
  }
  return JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/contents/${MEDIA}`], { encoding: 'utf8' }));
}

function hsvPool(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn || mx < 120) return false;
  const s = (mx - mn) / mx;
  let h = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4);
  if (h < 0) h += 360;
  return h > 170 && h < 210 && s > 0.35 && b > r + 40;
}

function components(mask, w, h) {
  const lab = new Int32Array(w * h), out = [];
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    const c = { n: 0, sx: 0, sy: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1 };
    const st = [i]; lab[i] = 1;
    while (st.length) {
      const j = st.pop(), x = j % w, y = (j / w) | 0;
      c.n++; c.sx += x; c.sy += y;
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w]) {
        if (k >= 0 && k < w * h && mask[k] && !lab[k]) { lab[k] = 1; st.push(k); }
      }
    }
    out.push({ ...c, x: c.sx / c.n, y: c.sy / c.n, w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1 });
  }
  return out;
}

/** The AOI in the capture is a dashed cyan rectangle: many equal small dashes sharing a row or column. */
function findAOI(comps) {
  const dashes = comps.filter((c) => c.n < 60 && ((c.w > 2 * c.h) || (c.h > 2 * c.w)));
  const vote = (key) => {
    const m = new Map();
    for (const c of dashes) { const k = Math.round(c[key] / 3) * 3; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].filter(([, v]) => v >= 8).map(([k]) => k).sort((a, b) => a - b);
  };
  const xs = vote('x'), ys = vote('y');
  if (xs.length < 2 || ys.length < 2) return null;
  return { x0: xs[0], x1: xs[xs.length - 1], y0: ys[0], y1: ys[ys.length - 1] };
}

/** Atkinson error diffusion; returns 0/1 per cell. */
function atkinson(gray, w, h) {
  const g = Float32Array.from(gray), out = new Uint8Array(w * h);
  const spread = [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = g[i], o = v > 127 ? 255 : 0;
    out[i] = o ? 1 : 0;
    const err = (v - o) / 8;
    for (const [dx, dy] of spread) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < w && yy < h) g[yy * w + xx] += err;
    }
  }
  return out;
}

export async function render({ force = false } = {}) {
  const media = (await listMedia()).filter((f) => /\.(png|jpe?g)$/i.test(f.name));
  const pick = PREFER.map((p) => media.find((m) => m.name === p)).find(Boolean) || media[0];
  if (!pick) throw new Error('no media in ' + MEDIA);
  const state = readState();
  if (!force && state.card === pick.sha && fs.existsSync(path.join(ASSETS, 'marco-polo-dark.svg'))) {
    console.log('same  marco-polo card (media unchanged)');
    return;
  }
  const file = path.join(CACHE, pick.name);
  const buf = fs.existsSync(file) && state.card === pick.sha ? fs.readFileSync(file) : await download(pick.download_url, file);

  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: SW, height: SH } = info;
  const mask = new Uint8Array(SW * SH);
  for (let i = 0; i < SW * SH; i++) mask[i] = hsvPool(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) ? 1 : 0;
  const comps = components(mask, SW, SH);
  const aoi = findAOI(comps) || { x0: SW * 0.38, x1: SW * 0.62, y0: SH * 0.34, y1: SH * 0.66 };
  const near = (v, a) => Math.abs(v - a) < 8;
  const pools = comps.filter((c) => c.n >= 12 && c.n < 4000 && c.w < 90 && c.h < 90
    && c.x > aoi.x0 + 4 && c.x < aoi.x1 - 4 && c.y > aoi.y0 + 4 && c.y < aoi.y1 - 4
    && !near(c.x, aoi.x0) && !near(c.x, aoi.x1) && !near(c.y, aoi.y0) && !near(c.y, aoi.y1));

  // Crop around the AOI so that it sits a little right of centre, at the card's aspect.
  const cw = Math.min(SW, (aoi.x1 - aoi.x0) * 2.05), ch = cw * (IH / W);
  const cx = Math.max(0, Math.min(SW - cw, (aoi.x0 + aoi.x1) / 2 - cw * 0.56));
  const cy = Math.max(0, Math.min(SH - ch, (aoi.y0 + aoi.y1) / 2 - ch * 0.5));
  const k = W / cw;                                   // source px -> card px
  const map = (x, y) => [(x - cx) * k, (y - cy) * k];

  const STYLE = process.env.CARD_STYLE || 'poster';
  const px = STYLE === 'dither' ? PX : 1 / (+process.env.CARD_RES || 2);
  const gw = Math.round(W / px), gh = Math.round(IH / px);
  const { data: gray } = await sharp(buf).removeAlpha()
    .extract({ left: Math.round(cx), top: Math.round(cy), width: Math.round(cw), height: Math.round(ch) })
    .greyscale().normalise({ lower: 3, upper: 99 }).linear(1.25, -22).resize(gw, gh, { kernel: 'lanczos3' })
    .raw().toBuffer({ resolveWithObject: true });
  // Dither: 1 bit per cell. Poster: four tones split at the image's own quartiles.
  const bits = STYLE === 'dither' ? atkinson(gray, gw, gh) : null;
  const q = [...gray].sort((a, b) => a - b);
  const cuts = [0.4, 0.68, 0.88].map((t) => q[Math.floor(q.length * t)]);
  const tone = (v) => (v < cuts[0] ? 0 : v < cuts[1] ? 1 : v < cuts[2] ? 2 : 3);

  // One PNG per theme, in the theme's ink with transparency, so it sits on either page colour.
  async function rasterPng(hex, alphas, invert) {
    const rgb = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
    const out = Buffer.alloc(gw * gh * 4);
    for (let i = 0; i < gw * gh; i++) {
      let lvl = bits ? bits[i] * 3 : tone(gray[i]);
      if (invert) lvl = 3 - lvl;
      out.set([...rgb, alphas[lvl]], i * 4);
    }
    const png = await sharp(out, { raw: { width: gw, height: gh, channels: 4 } })
      .png({ palette: true, colours: 4, compressionLevel: 9, effort: 10 }).toBuffer();
    return 'data:image/png;base64,' + png.toString('base64');
  }

  const [ax0, ay0] = map(aoi.x0, aoi.y0), [ax1, ay1] = map(aoi.x1, aoi.y1);
  const aw = ax1 - ax0, ah = ay1 - ay0;
  const T0 = 1.1, SWEEP = 3.6, CYCLE = 10;           // seconds
  const pct = (t) => n((t / CYCLE) * 100, 2);
  const found = pools.map((p) => { const [x, y] = map(p.x, p.y); return { x, y, r: Math.max(2.2, Math.sqrt(p.n) * k * 0.6), t: T0 + SWEEP * ((x - ax0) / aw) }; })
    .sort((a, b) => a.x - b.x);

  // Per-pool keyframes, all on the same clock, so the whole scene resets together.
  const kf = found.map((p, i) => {
    const a = pct(p.t), b = pct(p.t + 0.25);
    return `@keyframes f${i}{0%,${a}%{opacity:0;transform:scale(2.4)}${b}%{opacity:1;transform:scale(1)}92%{opacity:1;transform:scale(1)}97%,100%{opacity:0;transform:scale(1)}}`;
  }).join('');
  const marks = found.map((p, i) => {
    const s = n(p.r + 3.2);
    const br = `M${n(-s)} ${n(-s + 2.6)}V${n(-s)}H${n(-s + 2.6)}M${n(s - 2.6)} ${n(-s)}H${s}V${n(-s + 2.6)}M${s} ${n(s - 2.6)}V${s}H${n(s - 2.6)}M${n(-s + 2.6)} ${s}H${n(-s)}V${n(s - 2.6)}`;
    return `<g transform="translate(${n(p.x)} ${n(p.y)})"><g class="m" style="animation-name:f${i}"><circle r="${n(p.r * 0.75)}"/><path d="${br}"/></g></g>`;
  }).join('');
  // Rail: the sweep's progress, with one tick per pool found at its x position.
  const RY = IH + 20;
  const ticks = found.map((p, i) => `<path class="tk" style="animation-name:f${i}" d="M${n(p.x)} ${RY - 4}v8"/>`).join('');

  const name = glyphRun('marco-polo', 20, H - 20, 19, { track: -0.3 });
  const line = textPath('draw an area · find every pool', W - 20, H - 22, 11, { align: 'end', track: 0.2 });

  for (const [theme, c] of Object.entries(THEMES)) {
    const dark = theme === 'dark';
    const img = await rasterPng(dark ? '#c9d1d9' : '#1f2328', dark ? [0, 40, 95, 165] : [0, 35, 80, 150], !dark);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="marco-polo">
<style>
.frame{fill:${c.paper};stroke:${c.faint}}
.aoi{fill:none;stroke:${c.acc};stroke-width:1.2;stroke-dasharray:1;stroke-dashoffset:1;animation:draw .9s cubic-bezier(.65,0,.35,1) .15s forwards}
.veil{fill:${c.paper};fill-opacity:.55}
.sw{animation:sweep ${CYCLE}s linear ${T0}s infinite;transform:translateX(${n(ax0)}px);opacity:0}
.m{fill:${c.acc};stroke:${c.accHi};stroke-width:1.1;opacity:0;animation:${CYCLE}s linear 0s infinite}
.m circle{stroke:none}
.m path{fill:none}
.rail{stroke:${c.faint};stroke-width:1}
.prog{stroke:${c.acc};stroke-width:1;transform-origin:20px 0;transform:scaleX(0);animation:prog ${CYCLE}s linear ${T0}s infinite}
.tk{stroke:${c.ink};stroke-width:1.2;opacity:0;transform-box:fill-box;transform-origin:center;animation:${CYCLE}s linear 0s infinite}
.nm{fill:${c.ink}}.ln{fill:${c.muted}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes sweep{0%{opacity:1;transform:translateX(${n(ax0)}px)}${pct(SWEEP)}%{opacity:1;transform:translateX(${n(ax1)}px)}${pct(SWEEP + 0.3)}%,100%{opacity:0;transform:translateX(${n(ax1)}px)}}
@keyframes prog{0%{transform:scaleX(0)}${pct(SWEEP)}%{transform:scaleX(1)}${pct(CYCLE * 0.92)}%{transform:scaleX(1);opacity:1}${pct(CYCLE * 0.97)}%,100%{transform:scaleX(1);opacity:0}}
${kf}
@media (prefers-reduced-motion:reduce){.aoi,.sw,.m,.prog,.tk{animation:none}.aoi{stroke-dashoffset:0}.m,.tk{opacity:1}.prog{transform:none}}
</style>
<defs>
<clipPath id="ci"><path d="M${R} .5H${W - R}a${R - 0.5} ${R - 0.5} 0 0 1 ${R - 0.5} ${R - 0.5}V${IH}H.5V${R}a${R - 0.5} ${R - 0.5} 0 0 1 ${R - 0.5}-${R - 0.5}z"/></clipPath>
<linearGradient id="tr" x1="1" x2="0"><stop offset="0" stop-color="${c.acc}" stop-opacity=".2"/><stop offset="1" stop-color="${c.acc}" stop-opacity="0"/></linearGradient>
</defs>
<rect class="frame" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R}"/>
<g clip-path="url(#ci)">
<image href="${img}" width="${W}" height="${IH}" preserveAspectRatio="none" style="image-rendering:pixelated" image-rendering="optimizeSpeed"/>
<path class="veil" fill-rule="evenodd" d="M0 0H${W}V${IH}H0z M${n(ax0)} ${n(ay0)}V${n(ay1)}H${n(ax1)}V${n(ay0)}z"/>
<g clip-path="url(#ca)"><g class="sw"><rect x="-34" y="${n(ay0)}" width="34" height="${n(ah)}" fill="url(#tr)"/><path d="M0 ${n(ay0)}V${n(ay1)}" stroke="${c.acc}" stroke-width="1.4"/></g></g>
${marks}
<path class="aoi" pathLength="1" d="M${n(ax0)} ${n(ay0)}H${n(ax1)}V${n(ay1)}H${n(ax0)}Z"/>
</g>
<clipPath id="ca"><rect x="${n(ax0)}" y="${n(ay0)}" width="${n(aw)}" height="${n(ah)}"/></clipPath>
<path class="rail" d="M20 ${RY}H${W - 20}M0 ${IH}.5H${W}"/>
<path class="prog" d="M20 ${RY}H${W - 20}"/>
${ticks}
${name.map((g) => `<path class="nm" d="${g.d}"/>`).join('')}
<path class="ln" d="${line.d}"/>
</svg>`;
    writeAsset(`marco-polo-${theme}.svg`, tidy(svg));
  }
  writeState({ ...readState(), card: pick.sha });
  console.log(`card: ${pick.name}, AOI ${JSON.stringify(aoi)}, pools ${found.length}`);
}

if (isMain(import.meta.url)) render({ force: process.argv.includes('--force') });
