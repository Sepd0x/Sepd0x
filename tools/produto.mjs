// PRODUTO: the profile as a product page (28 Oct 2026). Quiet cards on the page colour (translucent
// fill and edge, so they sit on every GitHub theme), large normal type, mono only for digits, one accent
// taken from the cs2-ip-changer app. One SVG per link, each full width, each with a narrow phone version:
//   hero       the handle, one line, the app icon and its newest release (read from GitHub on render)
//   btn-download  the only button: straight to the newest release
//   cs2        the app, large: what it does, four things a CS2 player recognises, the real Connection tab
//              with Change IP pressed and the address the servers see moving to another range
//              (documentation addresses), and what it never touches
//   marco-polo the aerial capture with a sweep over the area (pools light up), links to the live demo
//   thm        the TryHackMe standing and the pentester skill web, dated as a whole
// usage: node produto.mjs [--offline]   (PALETA=azul|verde|mono, OUT=dir; default azul into assets/)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, ASSETS, CACHE, OFFLINE, isMain, n, profile } from './lib.mjs';
import { appPanel } from './appui.mjs';

// Source images, kept in the repo (tools/.cache is not committed, so the Action would not find them there).
const SRC = path.join(ROOT, 'tools', 'src');
const SANS = `'Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Roboto,Arial,sans-serif`;
const MONO = `'Cascadia Mono',Consolas,'SFMono-Regular',Menlo,'Roboto Mono',monospace`;

const BASE = {
  dark: { ink: '#f0f6fc', muted: '#9198a1', faint: '#7d8590', fill: 'rgba(240,246,252,.035)', edge: 'rgba(240,246,252,.13)', rule: 'rgba(240,246,252,.1)', prim: '#f0f6fc', onPrim: '#0d1117', shade: '#000', veil: 0.5 },
  light: { ink: '#1f2328', muted: '#59636e', faint: '#6e7781', fill: 'rgba(31,35,40,.025)', edge: 'rgba(31,35,40,.15)', rule: 'rgba(31,35,40,.12)', prim: '#1f2328', onPrim: '#ffffff', shade: '#1f2328', veil: 0.2 },
};
// One accent, used small: the dots, the pools, the web. azul is the app's own blue.
export const PALETAS = {
  azul: { dark: '#5ba8f0', light: '#2b74c2' },
  verde: { dark: '#3fb950', light: '#1a7f37' },
  mono: { dark: '#f0f6fc', light: '#1f2328' },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tidy = (s) => s.replace(/>\s+</g, '><').replace(/\n\s*/g, '').trim() + '\n';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const CYCLE = 12, PRESS = 2.4, ROLL = 3.3;                    // seconds; the page's one loop clock
const pct = (s) => n((s / CYCLE) * 100, 2);

// ---------- data ----------
async function api(p) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    const r = await fetch(`https://api.github.com/${p}`, { headers: { authorization: `bearer ${token}`, 'user-agent': 'sepd0x-profile' } });
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  }
  return JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8' }));
}
async function release() {
  const file = path.join(CACHE, 'release.json');
  if (OFFLINE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = (await api('repos/Sepd0x/cs2-ip-changer/releases?per_page=1'))[0];
  const d = r ? { tag: r.tag_name, at: r.published_at, pre: r.prerelease } : null;
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d));
  return d;
}
function readThm() {
  const f = path.join(ROOT, 'data', 'thm.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
const logo = () => { const f = path.join(SRC, 'cs2-logo.svg'); return fs.existsSync(f) ? 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64') : null; };

// ---------- shared ----------
const head = (W, H, label, css, c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<style>
.s{font-family:${SANS}}.m{font-family:${MONO}}
.ink{fill:${c.ink}}.mu{fill:${c.muted}}.fa{fill:${c.faint}}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`;
const card = (c, x, y, w, h, r = 16) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${c.fill}" stroke="${c.edge}"/>`;
const lines = (cls, x, y, size, step, arr) => arr.map((l, i) => `<text class="${cls}" x="${x}" y="${n(y + i * step)}" font-size="${size}">${l}</text>`).join('');

// ---------- hero ----------
// The year's contributions per week as one smooth line (Catmull-Rom to Bezier), from the first active week
// to this one, over a thin axis; the month it starts and "today" under the ends. Drawn in on load; the
// static picture is the whole line. The Action re-renders daily, so the number follows GitHub's own.
function signal(c, a, prof, x0, x1, base, hgt, mob) {
  const cal = prof.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.map((w) => ({ at: w.contributionDays[0].date, v: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0) }));
  const first = Math.max(0, weeks.findIndex((w) => w.v > 0) - 1), ws = weeks.slice(first);
  const max = Math.max(1, ...ws.map((w) => w.v));
  const P = ws.map((w, i) => [x0 + ((x1 - x0) * i) / Math.max(1, ws.length - 1), base - hgt * Math.sqrt(w.v / max)]);
  let d = `M${n(P[0][0])} ${n(P[0][1])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${n(c1[0])} ${n(Math.min(base, c1[1]))} ${n(c2[0])} ${n(Math.min(base, c2[1]))} ${n(p2[0])} ${n(p2[1])}`;
  }
  const end = P[P.length - 1], fs = mob ? 19 : 14.5;
  const month = MONTHS[new Date(ws[0].at).getUTCMonth()];
  return `<defs><linearGradient id="fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}" stop-opacity=".14"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>
<text x="${x0}" y="${n(base - hgt - (mob ? 22 : 18))}" font-size="${mob ? 21 : 15.5}"><tspan class="m ink" font-weight="600">${cal.totalContributions}</tspan><tspan dx="0.3em" class="s mu">contributions in the last year</tspan></text>
<path d="M${x0} ${base}H${x1}" stroke="${c.rule}"/>
<path class="ar" d="${d}L${n(x1)} ${base}L${n(x0)} ${base}Z" fill="url(#fd)"/>
<path class="ln" pathLength="1" d="${d}" fill="none" stroke="${a}" stroke-width="${mob ? 2.2 : 1.7}" stroke-linejoin="round"/>
<circle class="now" cx="${n(end[0])}" cy="${n(end[1])}" r="${mob ? 5 : 4}" fill="${a}"/>
<text class="s fa" x="${x0}" y="${base + (mob ? 30 : 24)}" font-size="${fs}">${month}</text><text class="s fa" x="${x1}" y="${base + (mob ? 30 : 24)}" font-size="${fs}" text-anchor="end">today</text>`;
}
const SIGNAL_CSS = `.ln{stroke-dasharray:1;animation:draw 2.4s cubic-bezier(.45,0,.2,1) .3s backwards}@keyframes draw{from{stroke-dashoffset:1}}
.ar{animation:fade 1s ease-out 1.8s backwards}@keyframes fade{from{opacity:0}}
.now{animation:pulse 2.6s ease-in-out 2.7s infinite}@keyframes pulse{50%{opacity:.3}}`;

function hero(c, a, t, R, mob, prof) {
  const W = mob ? 600 : 1000, H = mob ? 500 : 350, X = mob ? 32 : 40;
  const L = logo();
  const rx = mob ? X : W - X - 318, ry = mob ? 238 : 92, iz = mob ? 44 : 40;
  const rel = R ? `${L ? `<image href="${L}" x="${rx}" y="${ry - iz / 2 - 4}" width="${iz}" height="${iz}"/>` : ''}
<text x="${rx + iz + 12}" y="${ry - 2}" font-size="${mob ? 21 : 16}"><tspan class="s ink" font-weight="600">CS2 IP Changer</tspan><tspan dx="0.3em" class="m mu">${esc(R.tag)}</tspan></text>
<text class="s fa" x="${rx + iz + 12}" y="${ry + (mob ? 24 : 19)}" font-size="${mob ? 19 : 15}">${R.pre ? 'pre-release' : 'release'} · ${day(R.at)}</text>` : '';
  const sg = prof ? signal(c, a, prof, X, W - X, mob ? 430 : 296, mob ? 74 : 62, mob) : '';
  return tidy(`${head(W, H, 'Sepd0x, maker of CS2 IP Changer; contributions in the last year', SIGNAL_CSS, c)}
${card(c, 0, 0, W, H)}
<text class="s ink" x="${X - 5}" y="${mob ? 124 : 116}" font-size="${mob ? 100 : 84}" font-weight="600" letter-spacing="${mob ? -4 : -3.2}">Sepd0x</text>
<text class="s mu" x="${X}" y="${mob ? 172 : 156}" font-size="${mob ? 28 : 21}">Maker of CS2 IP Changer.</text>
${rel}
${sg}
</svg>`);
}

// ---------- the button ----------
function button(c, text, w) {
  const H = 46;
  return tidy(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(text)}">
<rect x=".5" y=".5" width="${w - 1}" height="${H - 1}" rx="${H / 2 - 0.5}" fill="${c.prim}"/>
<text x="26" y="28.5" font-family="${SANS}" font-size="15" font-weight="600" fill="${c.onPrim}">${esc(text)}</text>
<g transform="translate(${w - 28} 23)"><path d="M0 -6v10M-4.5 0l4.5 4.5 4.5-4.5M-6 8h12" fill="none" stroke="${c.onPrim}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`);
}

// ---------- cs2 ----------
// Crops of the Connection tab (1240 x 800): the Status panel on desktop, its left half on a phone.
const CROPS = { desk: { x: 98, y: 50, w: 555, h: 205 }, mob: { x: 98, y: 122, w: 264, h: 128 } };
const IP = { x: 110, y: 146, w: 162, h: 28, base: 167, size: 18.6 };
const BTN = { x: 114, y: 209, w: 101, h: 31 };
const APPBLUE = '#5ba8f0';                                   // the app's own accent, for its pressed button
const FROM = '198.51.100.188', TO = '192.0.2.23';            // documentation ranges (RFC 5737), another /16
const POINTS = ['Ctrl+Shift+F10 in game: new IP, same server', 'Tells you if the new IP left the /16', 'Kill switch: never falls back to your home IP', 'Switches Steam accounts without passwords'];
async function shot(crop) {
  const src = path.join(SRC, 'cs2-connection.png');
  const png = await sharp(src).extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
    .png({ compressionLevel: 9, palette: true, colours: 128, effort: 10 }).toBuffer();
  const { data } = await sharp(src).extract({ left: IP.x + IP.w + 40, top: IP.y + 4, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true });
  return { uri: 'data:image/png;base64,' + png.toString('base64'), bg: '#' + [0, 1, 2].map((k) => data[k].toString(16).padStart(2, '0')).join(''), crop };
}
function app(S, c, x0, y0, w) {
  const C = S.crop, k = w / C.w, h = C.h * k;
  const mp = (x, y) => [n(x0 + (x - C.x) * k), n(y0 + (y - C.y) * k)];
  const [ix, iy] = mp(IP.x, IP.y), [bx, by] = mp(BTN.x, BTN.y), [tx, ty] = mp(IP.x + 3, IP.base);
  const fz = n(IP.size * k), lift = n(fz * 1.25);
  const ipText = (cls, s) => `<text class="${cls}" x="${tx}" y="${ty}" font-family="${MONO}" font-size="${fz}" font-weight="600" fill="#f2f2f2">${s}</text>`;
  const svg = `<filter id="sh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="${c.shade}" flood-opacity=".35"/></filter>
<rect x="${x0}" y="${y0}" width="${n(w)}" height="${n(h)}" rx="10" fill="#141414" filter="url(#sh)"/>
<clipPath id="ap"><rect x="${x0}" y="${y0}" width="${n(w)}" height="${n(h)}" rx="10"/></clipPath>
<g clip-path="url(#ap)"><image href="${S.uri}" x="${x0}" y="${y0}" width="${n(w)}" height="${n(h)}"/>
<rect x="${ix}" y="${iy}" width="${n(IP.w * k)}" height="${n(IP.h * k)}" fill="${S.bg}"/>
<clipPath id="ic"><rect x="${ix}" y="${iy}" width="${n(IP.w * k)}" height="${n(IP.h * k)}"/></clipPath>
<g clip-path="url(#ic)">${ipText('old', FROM)}${ipText('new', TO)}</g>
<rect class="press" x="${n(bx - 1)}" y="${n(by - 1)}" width="${n(BTN.w * k + 2)}" height="${n(BTN.h * k + 2)}" rx="${n(2 * k)}" fill="none" stroke="${APPBLUE}" stroke-width="${n(1.4 * k)}"/></g>
<rect x="${x0 + 0.5}" y="${y0 + 0.5}" width="${n(w - 1)}" height="${n(h - 1)}" rx="9.5" fill="none" stroke="rgba(255,255,255,.12)"/>`;
  const css = `.old{opacity:0;animation:out ${CYCLE}s cubic-bezier(.6,0,.4,1) infinite}
.new{animation:in ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite}
.press{opacity:0;animation:press ${CYCLE}s linear infinite}
@keyframes out{0%,${pct(ROLL)}%{opacity:1;transform:translateY(0)}${pct(ROLL + 0.45)}%,96%{opacity:0;transform:translateY(-${lift}px)}100%{opacity:1;transform:translateY(0)}}
@keyframes in{0%,${pct(ROLL)}%{opacity:0;transform:translateY(${lift}px)}${pct(ROLL + 0.55)}%,94%{opacity:1;transform:translateY(0)}97%,100%{opacity:0}}
@keyframes press{0%,${pct(PRESS)}%{opacity:0}${pct(PRESS + 0.1)}%,${pct(ROLL + 0.6)}%{opacity:1}${pct(ROLL + 1.3)}%,100%{opacity:0}}`;
  return { svg, css, h };
}
function cs2(c, a, R, S, mob) {
  const W = mob ? 600 : 1000, X = mob ? 32 : 40;
  const pitch = mob
    ? ['Sends CS2 and Steam through your', 'Android phone’s mobile data, so', 'community servers see your carrier’s', 'IP and not your home IP.']
    : ['Sends CS2 and Steam through your Android phone’s mobile data,', 'so community servers see your carrier’s IP and not your home IP.'];
  const tsize = mob ? 56 : 44, psize = mob ? 25 : 19, pstep = mob ? 35 : 27;
  const yT = mob ? 96 : 92, yP = yT + (mob ? 52 : 44);
  const yA = yP + (pitch.length - 1) * pstep + (mob ? 40 : 36);
  // The app itself, drawn as vectors and playing one Change IP (appui.mjs).
  const P = appPanel(mob), k = (W - 2 * X) / P.W;
  const A = { h: P.H * k, css: P.css, svg: `<filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="${c.shade}" flood-opacity=".4"/></filter>
<rect x="${X}" y="${yA}" width="${n(W - 2 * X)}" height="${n(P.H * k)}" rx="${n(8 * k)}" fill="#121212" filter="url(#sh)"/>
<g transform="translate(${X} ${yA}) scale(${n(k, 4)})">${P.body}</g>` };
  const yF = yA + A.h + (mob ? 64 : 58), fstep = mob ? 40 : 32, fsize = mob ? 22 : 17;
  const pts = POINTS.map((p, i) => {
    const col = mob ? 0 : i % 2, row = mob ? i : Math.floor(i / 2);
    const x = X + col * 470, y = yF + row * fstep;
    return `<circle cx="${x + 4}" cy="${n(y - fsize * 0.33)}" r="${mob ? 4 : 3}" fill="${a}"/><text class="s ink" x="${x + (mob ? 20 : 16)}" y="${y}" font-size="${fsize}">${esc(p)}</text>`;
  }).join('');
  const yR = yF + ((mob ? POINTS.length : 2) - 1) * fstep + (mob ? 64 : 52);
  const trust = R ? (mob
    ? `<text class="s fa" x="${X}" y="${yR}" font-size="19">Never touches the game or its files.</text><text x="${X}" y="${yR + 30}" font-size="19"><tspan class="s fa">Anonymous stats, no IP&#160;·</tspan><tspan dx="0.3em" class="m fa">${esc(R.tag)}</tspan><tspan class="s fa" dx="0.3em">·&#160;Windows</tspan></text>`
    : `<text x="${X}" y="${yR}" font-size="15.5"><tspan class="s fa">Never touches the game process or its files · anonymous stats, no IP&#160;·</tspan><tspan dx="0.3em" class="m fa">${esc(R.tag)}</tspan><tspan class="s fa" dx="0.3em">·&#160;Windows 10/11</tspan></text>`) : '';
  const H = Math.round(yR + (mob ? 30 : 0) + (mob ? 44 : 40));
  return tidy(`${head(W, H, 'CS2 IP Changer: sends CS2 and Steam through your Android phone\'s mobile data, so community servers see your carrier\'s IP and not your home IP.', A.css, c)}
${card(c, 0, 0, W, H)}
<text class="s ink" x="${X - 2}" y="${yT}" font-size="${tsize}" font-weight="600" letter-spacing="-1">CS2 IP Changer</text>
${lines('s mu', X, yP, psize, pstep, pitch.map(esc))}
${A.svg}
${pts}
${trust}
</svg>`);
}

// ---------- marco-polo ----------
async function aerial(ratio) {
  // A crop of marco-polo's "area locked" capture, taken at (880, 430) of the 2340 x 1320 original.
  const src = path.join(SRC, 'area-crop.png');
  const AOI = { x0: 20, x1: 557, y0: 20, y1: 440 };               // the dashed area (card.mjs found it)
  const cw = Math.min(760, Math.floor(460 / ratio)), ch = Math.round(cw * ratio), cx = 5;
  const cy = Math.round(Math.min(460 - ch, Math.max(0, (AOI.y0 + AOI.y1) / 2 - ch / 2)));
  const jpg = await sharp(src).removeAlpha().extract({ left: cx, top: cy, width: cw, height: ch })
    .resize(Math.round(cw * 1.2), Math.round(ch * 1.2)).modulate({ saturation: 0.2, brightness: 0.9 }).jpeg({ quality: 74 }).toBuffer();
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const isPool = (i) => { const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 120 || mx === mn) return false; const s = (mx - mn) / mx; let h = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4); if (h < 0) h += 360; return h > 170 && h < 210 && s > 0.35 && b > r + 40; };
  const seen = new Uint8Array(info.width * info.height), pools = [];
  for (let y = AOI.y0 + 6; y < AOI.y1 - 6; y++) for (let x = AOI.x0 + 6; x < AOI.x1 - 6; x++) {
    const i = y * info.width + x; if (seen[i] || !isPool(i)) continue;
    let cnt = 0, sx = 0, sy = 0; const st = [i]; seen[i] = 1;
    while (st.length) { const j = st.pop(); cnt++; sx += j % info.width; sy += (j / info.width) | 0;
      for (const q of [j - 1, j + 1, j - info.width, j + info.width]) if (q > 0 && q < seen.length && !seen[q] && isPool(q)) { seen[q] = 1; st.push(q); } }
    if (cnt >= 12 && cnt < 4000) pools.push({ x: sx / cnt, y: sy / cnt, a: cnt });
  }
  const map = (x, y) => [(x - cx) / cw, (y - cy) / cw];             // in crop widths
  return { uri: 'data:image/jpeg;base64,' + jpg.toString('base64'), aoi: [...map(AOI.x0, AOI.y0), ...map(AOI.x1, AOI.y1)], pools: pools.map((p) => ({ xy: map(p.x, p.y), r: Math.sqrt(p.a) / cw * 0.55 })) };
}
function marco(c, a, A, mob) {
  const W = mob ? 600 : 1000, X = mob ? 32 : 40;
  const iw = mob ? W - 2 : 470, ih = mob ? 300 : 298, ix = 1, iy = 1, s = iw;
  const [a0, b0, a1, b1] = A.aoi.map((v) => v * s);
  const SW = 3.6, T0 = 1;
  const marks = A.pools.map((p) => ({ x: ix + p.xy[0] * s, y: iy + p.xy[1] * s, r: p.r * s })).sort((p, q) => p.x - q.x);
  const kf = marks.map((m, i) => { const ts = T0 + SW * ((m.x - ix - a0) / (a1 - a0)); return `@keyframes p${i}{0%,${pct(ts)}%{opacity:0;transform:scale(2)}${pct(ts + 0.25)}%,92%{opacity:1;transform:scale(1)}97%,100%{opacity:0}}`; }).join('');
  const css = `.sw{animation:sw ${CYCLE}s linear ${T0}s infinite;opacity:0}
@keyframes sw{0%{opacity:1;transform:translateX(0)}${pct(SW)}%{opacity:1;transform:translateX(${n(a1 - a0)}px)}${pct(SW + 0.3)}%,100%{opacity:0;transform:translateX(${n(a1 - a0)}px)}}
.pl{transform-box:fill-box;transform-origin:center}${kf}`;
  const clip = mob ? `M${ix} ${iy + 15}a15 15 0 0 1 15 -15H${n(ix + iw - 15)}a15 15 0 0 1 15 15V${iy + ih}H${ix}z`
    : `M${ix} ${iy + 15}a15 15 0 0 1 15 -15H${ix + iw}V${iy + ih}H${ix + 15}a15 15 0 0 1 -15 -15z`;
  const tx = mob ? X : iw + 44, ty = mob ? ih + 64 : 92;
  const desc = mob ? ['Draw an area on a map and it finds,', 'measures and ranks the swimming', 'pools in the aerial imagery.'] : ['Draw an area on a map and it finds,', 'measures and ranks the swimming pools', 'in the aerial imagery.'];
  const H = mob ? ty + 52 + desc.length * 33 + 60 : 300;
  return { css, svg: tidy(`${head(W, H, 'marco-polo: draw an area on a map and it finds, measures and ranks the swimming pools. Runs in the browser.', css, c)}
${card(c, 0, 0, W, H)}
<clipPath id="mi"><path d="${clip}"/></clipPath>
<g clip-path="url(#mi)"><image href="${A.uri}" x="${ix}" y="${iy}" width="${iw}" height="${ih}" preserveAspectRatio="xMidYMid slice"/>
<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#0d1117" fill-opacity="${c.veil}"/>
<g class="sw"><rect x="${n(ix + a0 - 34)}" y="${n(iy + b0)}" width="34" height="${n(b1 - b0)}" fill="${a}" fill-opacity=".22"/><path d="M${n(ix + a0)} ${n(iy + b0)}V${n(iy + b1)}" stroke="${a}" stroke-width="1.8"/></g>
${marks.map((m, i) => `<circle class="pl" style="animation:p${i} ${CYCLE}s linear infinite" cx="${n(m.x)}" cy="${n(m.y)}" r="${n(m.r + 3)}" fill="none" stroke="${a}" stroke-width="2"/>`).join('')}
<path d="M${n(ix + a0)} ${n(iy + b0)}H${n(ix + a1)}V${n(iy + b1)}H${n(ix + a0)}Z" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.3" stroke-dasharray="5 4"/></g>
<path d="${mob ? `M${ix} ${iy + ih}H${ix + iw}` : `M${ix + iw} ${iy}V${iy + ih}`}" stroke="${c.edge}"/>
<text class="s ink" x="${tx - 2}" y="${ty}" font-size="${mob ? 44 : 34}" font-weight="600" letter-spacing="-.8">marco-polo</text>
${lines('s mu', tx, ty + (mob ? 50 : 42), mob ? 24 : 18.5, mob ? 33 : 27, desc.map(esc))}
<text class="s fa" x="${tx}" y="${mob ? H - 40 : 252}" font-size="${mob ? 20 : 15.5}">TypeScript · runs in your browser, open it and try</text>
</svg>`) };
}

// ---------- tryhackme ----------
function thm(c, a, d, mob) {
  const W = mob ? 600 : 1000, X = mob ? 32 : 40;
  if (!d) return null;
  const lv = String(d.level || '').replace(/[[\]]/g, '');
  const axes = d.skills && d.skills.pentester;
  const short = { 'penetration testing': 'pentest', 'red teaming': 'red team', exploitation: 'exploit', enumeration: 'enum', 'privilege escalation': 'privesc', 'vulnerability analysis': 'vuln' };
  const H = mob ? 760 : 300;
  const cx = mob ? W / 2 : 760, cy = mob ? 540 : 150, R = mob ? 104 : 92, ls = mob ? 21 : 16;
  let web = '';
  if (axes) {
    const N = axes.length, ang = (i) => ((-90 + (i * 360) / N) * Math.PI) / 180;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
    const ring = (v) => 'M' + axes.map((_, i) => pt(i, v).map((q) => n(q)).join(' ')).join('L') + 'z';
    web = `<path d="${ring(1)}${ring(0.5)}" fill="none" stroke="${c.rule}"/>
${axes.map((_, i) => `<path d="M${cx} ${cy}L${pt(i, 1).map((q) => n(q)).join(' ')}" stroke="${c.rule}"/>`).join('')}
<path class="wb" d="${'M' + axes.map(([, v], i) => pt(i, Math.max(0.03, v / 100)).map((q) => n(q)).join(' ')).join('L')}z" fill="${a}" fill-opacity=".16" stroke="${a}" stroke-width="1.8" stroke-linejoin="round"/>
${axes.map(([nm, v], i) => { const [lx, ly] = pt(i, 1.17); const anc = Math.abs(lx - cx) < 4 ? 'middle' : lx < cx ? 'end' : 'start'; const dy = Math.abs(lx - cx) < 4 ? (ly < cy ? -2 : ls * 0.9) : ls * 0.35;
      return `<text x="${n(lx)}" y="${n(ly + dy)}" font-size="${ls}" text-anchor="${anc}"><tspan class="s mu">${esc(short[nm.toLowerCase()] || nm.toLowerCase())}</tspan><tspan dx="0.3em" class="m ink">${v}</tspan></text>`; }).join('')}`;
  }
  const stats = [[`top ${d.top_percent}%`, 'worldwide'], [String(d.rooms), 'rooms'], [String(d.badges), 'badges']];
  const sx = mob ? [X, X + 230, X + 390] : [X, X + 170, X + 280], sy = mob ? 290 : 238;
  const css = `.wb{transform-box:fill-box;transform-origin:center;animation:wb 1s cubic-bezier(.2,.8,.2,1) .4s backwards}@keyframes wb{from{transform:scale(.2);opacity:0}}`;
  return tidy(`${head(W, H, `TryHackMe: level ${lv}, top ${d.top_percent}%, ${d.rooms} rooms, ${d.badges} badges; pentester skills`, css, c)}
${card(c, 0, 0, W, H)}
<text x="${X}" y="${mob ? 64 : 58}" font-size="${mob ? 22 : 17}"><tspan class="s ink" font-weight="600">TryHackMe</tspan><tspan class="s fa" dx="0.3em">·&#160;${esc(day(d.as_of))}</tspan></text>
<text class="m ink" x="${X - 3}" y="${mob ? 168 : 138}" font-size="${mob ? 96 : 68}" font-weight="600" letter-spacing="-2">${esc(lv)}</text>
<text class="s mu" x="${X}" y="${mob ? 206 : 170}" font-size="${mob ? 23 : 18}">level · ${esc(String(d.title || '').toLowerCase())}</text>
${stats.map(([v, k], i) => `<text class="m ink" x="${sx[i]}" y="${sy}" font-size="${mob ? 38 : 28}" font-weight="600">${esc(v)}</text><text class="s mu" x="${sx[i]}" y="${sy + (mob ? 32 : 25)}" font-size="${mob ? 20 : 15.5}">${esc(k)}</text>`).join('')}
${web}
<text class="s fa" x="${mob ? W / 2 : W - X}" y="${H - (mob ? 34 : 22)}" font-size="${mob ? 19 : 15}" text-anchor="${mob ? 'middle' : 'end'}">pentester skills</text>
</svg>`);
}

export async function render({ paleta = process.env.PALETA || 'mono', out = process.env.OUT || ASSETS } = {}) {
  const pal = PALETAS[paleta];
  const R = await release(), d = readThm();
  let prof = null; try { prof = await profile(); } catch (e) { console.log(`hero: no contributions (${e.message})`); }
  const AD = await aerial(298 / 470), AM = await aerial(300 / 598);
  fs.mkdirSync(out, { recursive: true });
  const put = (name, svg) => { if (!svg) return; fs.writeFileSync(path.join(out, name), svg); console.log(`wrote  ${name}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`); };
  for (const t of ['dark', 'light']) {
    const c = BASE[t], a = pal[t];
    for (const mob of [false, true]) {
      const sfx = `${mob ? '-m' : ''}-${t}.svg`;
      put(`hero${sfx}`, hero(c, a, t, R, mob, prof));
      put(`cs2${sfx}`, cs2(c, a, R, null, mob));
      put(`marco-polo${sfx}`, marco(c, a, mob ? AM : AD, mob).svg);
      put(`thm${sfx}`, thm(c, a, d, mob));
    }
    put(`btn-download-${t}.svg`, button(c, 'Download CS2 IP Changer', 262));
  }
}

if (isMain(import.meta.url)) render();
