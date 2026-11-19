// VITRINE: the profile page from 19 Nov 2026. Solid black panels that look the same on GitHub's light and dark
// themes, large system type, mono only for digits, no outlines, dashes or spiky charts. One SVG per link, each
// with a phone version (-m); the buttons come per theme (-dark, -light) because they sit on the page colour.
//   hero        the handle, one line, the app icon and its latest release (GitHub's /releases/latest)
//   btn-*       Download (the latest release), the website, marco-polo, TryHackMe
//   cs2         the app: downloads, releases, stars and the VirusTotal result of the latest release, what it
//               does, what it never touches, and the real Regions page (a drawn region list on phones)
//   marco-polo  the aerial capture, the pools it finds appearing from left to right
//   thm         the TryHackMe level, standing and the points to the next level (data/thm.json)
// usage: node vitrine.mjs [--offline]   (OUT=dir; default assets/)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, ASSETS, CACHE, OFFLINE, isMain } from './lib.mjs';

const SRC = path.join(ROOT, 'tools', 'src');
const SANS = `'Segoe UI Variable Display','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Roboto,Arial,sans-serif`;
const MONO = `'Cascadia Mono',Consolas,'SFMono-Regular',Menlo,'Roboto Mono',monospace`;
const C = { panel: '#0b0b0c', panel2: '#18181b', ink: '#f4f4f2', mu: '#a3a39f', fa: '#8a8a86', acc: '#ffffff', track: 'rgba(255,255,255,.12)' };
const BTN = {
  dark: { prim: '#f4f4f2', onPrim: '#0b0b0c', sec: '#212124', onSec: '#f4f4f2' },
  light: { prim: '#0b0b0c', onPrim: '#f4f4f2', sec: '#e6e6e3', onSec: '#0b0b0c' },
};

const n = (v, d = 1) => +(+v).toFixed(d);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso) => { const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const comma = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// Rough width of a Segoe UI run, for the pills.
const tw = (s, fs) => [...s].reduce((a, ch) => a + (/[A-Z0-9]/.test(ch) ? 0.6 : /[mw]/.test(ch) ? 0.8 : /[il.,'·|\s]/.test(ch) ? 0.27 : 0.52), 0) * fs * 1.03;
const wrap = (s, max) => s.split(' ').reduce((a, w) => { const l = a[a.length - 1]; if (l && (l + ' ' + w).length <= max) a[a.length - 1] = l + ' ' + w; else a.push(w); return a; }, []);
const tidy = (s) => s.replace(/>\s+</g, '><').trim() + '\n';

const head = (W, H, label, css = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<style>.s{font-family:${SANS}}.m{font-family:${MONO}}
${css}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>`;
const panel = (W, H) => `<rect width="${W}" height="${H}" rx="28" fill="${C.panel}"/>`;
const T = (x, y, fs, fill, s, { w = 400, f = 's', a = 'start', ls = 0 } = {}) =>
  `<text class="${f}" x="${n(x)}" y="${n(y)}" font-size="${fs}" font-weight="${w}" fill="${fill}"${a !== 'start' ? ` text-anchor="${a}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`;
const lines = (x, y, fs, step, fill, arr) => arr.map((l, i) => T(x, y + i * step, fs, fill, l)).join('');

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
async function cs2Data() {
  const file = path.join(CACHE, 'vitrine.json');
  if (OFFLINE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const repo = await api('repos/Sepd0x/cs2-ip-changer');
  const rels = [];
  for (let p = 1; p < 10; p++) { const page = await api(`repos/Sepd0x/cs2-ip-changer/releases?per_page=100&page=${p}`); rels.push(...page); if (page.length < 100) break; }
  const pub = rels.filter((r) => !r.draft);
  const latest = await api('repos/Sepd0x/cs2-ip-changer/releases/latest');
  // The VirusTotal result of the latest release, from the file the app's site and README are built from.
  let vt = null;
  try { const f = await api('repos/Sepd0x/cs2-ip-changer/contents/site/release.json'); const j = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); if (j.tag === latest.tag_name && j.virustotal) vt = `${j.virustotal.flagged}/${j.virustotal.engines}`; } catch {}
  const d = {
    stars: repo.stargazers_count,
    releases: pub.length,
    downloads: pub.reduce((a, r) => a + r.assets.filter((x) => /\.exe$/i.test(x.name)).reduce((b, x) => b + x.download_count, 0), 0),
    tag: latest.tag_name, at: latest.published_at, vt,
  };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d));
  return d;
}
function thmData() {
  const f = path.join(ROOT, 'data', 'thm.json');
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  return { ...d, level: String(d.level).replace(/[[\]]/g, ''), title: String(d.title || '').toLowerCase(),
    next: d.next_level ? { level: String(d.next_level.level).replace(/[[\]]/g, ''), title: String(d.next_level.title).toLowerCase(), from: d.next_level.from, at: d.next_level.at } : null };
}
async function aerial() {
  const src = path.join(SRC, 'area-crop.png');
  const AOI = { x0: 20, x1: 557, y0: 20, y1: 440 };                // the dashed area of the capture
  const cw = 524, ch = 404, cx = 27, cy = 27;                       // inside it, so no dashes show
  const jpg = await sharp(src).removeAlpha().extract({ left: cx, top: cy, width: cw, height: ch }).modulate({ saturation: 0.15, brightness: 0.85 }).jpeg({ quality: 76 }).toBuffer();
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const isPool = (i) => { const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 120 || mx === mn) return false; const s = (mx - mn) / mx; let h = mx === r ? 60 * (((g - b) / (mx - mn)) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4); if (h < 0) h += 360; return h > 170 && h < 210 && s > 0.35 && b > r + 40; };
  const seen = new Uint8Array(info.width * info.height), pools = [];
  for (let y = AOI.y0 + 6; y < AOI.y1 - 6; y++) for (let x = AOI.x0 + 6; x < AOI.x1 - 6; x++) {
    const i = y * info.width + x; if (seen[i] || !isPool(i)) continue;
    let cnt = 0, sx = 0, sy = 0; const st = [i]; seen[i] = 1;
    while (st.length) { const j = st.pop(); cnt++; sx += j % info.width; sy += (j / info.width) | 0;
      for (const q of [j - 1, j + 1, j - info.width, j + info.width]) if (q > 0 && q < seen.length && !seen[q] && isPool(q)) { seen[q] = 1; st.push(q); } }
    if (cnt >= 12 && cnt < 4000) pools.push({ x: (sx / cnt - cx) / cw, y: (sy / cnt - cy) / ch, r: Math.sqrt(cnt) / cw });
  }
  return { uri: 'data:image/jpeg;base64,' + jpg.toString('base64'), ratio: ch / cw, pools: pools.sort((a, b) => a.x - b.x) };
}

// ---------- pieces ----------
const SAFE = 'Never touches the game process, its memory or its program files.';
const PICK = ['Server picker.', 'Choose which of CS2’s 30 matchmaking regions you queue in, with the ping of each. No phone needed.'];
const PHONE = ['Your phone’s IP.', 'CS2 plays over your phone’s mobile data, so community servers only see your carrier’s IP. Get a new one from the app, or with Ctrl+Shift+F10 in game.'];
const para = (x, y, fs, step, [lead, ...rest]) => `<text x="${x}" y="${y}" font-size="${fs}"><tspan class="s" fill="${C.ink}" font-weight="600">${esc(lead)}</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">${esc(rest[0])}</tspan></text>${rest.slice(1).map((l, i) => T(x, y + (i + 1) * step, fs, C.mu, l)).join('')}`;
const fact = (v, k, first) => `<tspan class="m" fill="${C.ink}" font-weight="600"${first ? '' : ' dx="0.45em"'}>${esc(v)}</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">${esc(k)}</tspan>`;
const dot = `<tspan class="s" fill="${C.fa}" dx="0.45em">·</tspan>`;
const stats = (d) => [[d.downloads, 'downloads'], [d.releases, 'releases'], [d.stars, d.stars === 1 ? 'star' : 'stars']].concat(d.vt ? [[d.vt, 'on VirusTotal']] : []);

export function pill(text, theme, { primary = false, mob = false } = {}) {
  const b = BTN[theme], fs = 16, h = 52, pad = mob ? 18 : 26, aw = mob ? 0 : 14, w = Math.round(tw(text, fs) + pad * 2 + (aw ? aw + 10 : 0));
  const fill = primary ? b.prim : b.sec, ink = primary ? b.onPrim : b.onSec, ax = w - pad - aw + 2, ay = h / 2;
  const ar = !aw ? '' : primary
    ? `<path d="M${ax + 6} ${ay - 7}V${ay + 6}M${ax + 1} ${ay + 1.5}l5 5 5-5" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${ax + 1} ${ay + 6}l10-10M${ax + 3} ${ay - 4}h8v8" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return tidy(`${head(w, h, text)}<rect width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>${T(pad, 32.5, fs, ink, text, { w: 600 })}${ar}</svg>`);
}

// The phone version draws the region list (the capture would be unreadable at 360 px); values from the app's demo.
const REGIONS = [['Frankfurt', 'Germany', 24, 1], ['Vienna', 'Austria', 30, 1], ['Amsterdam', 'Netherlands', 31, 1], ['Warsaw', 'Poland', 33, 1], ['London', 'United Kingdom', 39, 1], ['Sterling', 'United States', 112, 0], ['Chicago', 'United States', 128, 0]];
function regionList(x, y, w, fs, step) {
  return REGIONS.map(([city, ctry, ms, on], i) => {
    const yy = y + i * step, r = fs * 0.46;
    return `<circle cx="${n(x + r)}" cy="${n(yy - fs * 0.36)}" r="${n(r)}" fill="${on ? C.acc : C.track}"/>${T(x + r * 2 + 14, yy, fs, on ? C.ink : C.fa, city, { w: 600 })}${T(x + w * 0.42, yy, fs * 0.91, C.mu, ctry)}
<rect x="${n(x + w - fs * 4.2)}" y="${n(yy - fs * 1.3)}" width="${n(fs * 4.2)}" height="${n(fs * 1.7)}" rx="${n(fs * 0.85)}" fill="${C.track}"/>${T(x + w - fs * 2.1, yy - fs * 0.1, fs * 0.88, ms < 60 ? C.ink : C.fa, `${ms} ms`, { f: 'm', a: 'middle' })}`;
  }).join('');
}

function hero(R, icon, mob) {
  const W = mob ? 600 : 1000, H = mob ? 330 : 236, X = mob ? 40 : 56;
  const cw = mob ? 520 : 380, ch = mob ? 76 : 66, cx = mob ? X : W - X - cw, cy = mob ? 214 : 60, ic = mob ? 48 : 42;
  return tidy(`${head(W, H, 'Sepd0x, maker of CS2 IP Changer and marco-polo')}${panel(W, H)}
${T(X - 6, mob ? 132 : 136, 104, C.ink, 'Sepd0x', { w: 650, ls: -4 })}
${T(X, mob ? 180 : 186, mob ? 25 : 22, C.mu, 'I make CS2 IP Changer and marco-polo.')}
<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${ch / 2}" fill="${C.panel2}"/>
<image href="${icon}" x="${cx + (ch - ic) / 2 + 2}" y="${cy + (ch - ic) / 2}" width="${ic}" height="${ic}"/>
<text x="${cx + ch + 8}" y="${cy + (mob ? 34 : 30)}" font-size="${mob ? 20 : 16.5}"><tspan class="s" fill="${C.ink}" font-weight="600">CS2 IP Changer</tspan><tspan class="m" fill="${C.ink}" dx="0.4em">${esc(R.tag)}</tspan></text>
<text class="s" x="${cx + ch + 8}" y="${cy + (mob ? 60 : 52)}" font-size="${mob ? 18 : 14.5}" fill="${C.mu}">latest release · ${day(R.at)}</text></svg>`);
}

function cs2(R, icon, shot, mob) {
  const W = mob ? 600 : 1000, X = mob ? 40 : 56;
  const label = 'CS2 IP Changer: a CS2 server picker for the 30 matchmaking regions, and CS2 over your phone’s mobile data so community servers only see your carrier’s IP. Never touches the game.';
  const S = stats(R);
  if (mob) {
    const pk = [PICK[0], ...wrap(PICK[1], 40)], ph = [PHONE[0], ...wrap(PHONE[1], 40)];
    const y1 = 312, y2 = y1 + pk.length * 30 + 36, LY = y2 + ph.length * 30 + 30, LH = 372, H = LY + LH + 150;
    const l1 = S.slice(0, 3), l2 = S.slice(3);
    return tidy(`${head(W, H, label)}${panel(W, H)}
<image href="${icon}" x="${X}" y="44" width="72" height="72"/>
${T(X - 2, 176, 50, C.ink, 'CS2 IP Changer', { w: 650, ls: -1.4 })}
<text x="${X}" y="220" font-size="20">${l1.map(([v, k], i) => (i ? dot : '') + fact(v, k, !i)).join('')}</text>
<text x="${X}" y="250" font-size="20">${l2.map(([v, k]) => fact(v, k, true) + dot).join('')}<tspan class="s" fill="${C.mu}" dx="0.45em">Windows 10/11</tspan></text>
${T(X, y1, 21, C.ink, pk[0], { w: 600 })}${lines(X, y1 + 30, 20, 30, C.mu, pk.slice(1))}
${T(X, y2, 21, C.ink, ph[0], { w: 600 })}${lines(X, y2 + 30, 20, 30, C.mu, ph.slice(1))}
<rect x="${X - 16}" y="${LY}" width="${W - 2 * X + 32}" height="${LH}" rx="22" fill="${C.panel2}"/>
${T(X + 6, LY + 50, 20, C.ink, 'Regions', { w: 600 })}${T(W - X - 6, LY + 50, 17, C.mu, 'CS2 can play in 5 of 30', { a: 'end' })}
${regionList(X + 6, LY + 104, W - 2 * X - 12, 19, 38)}
${lines(X, H - 84, 18, 27, C.mu, [`${R.tag} · ${day(R.at)}`, 'Never touches the game process or its files.'])}</svg>`);
  }
  const sx = X, sy = 372, k = (W - sx) / shot.w, sh = shot.h * k, H = Math.round(sy + sh);
  const pk = wrap(PICK[1], 100), ph = wrap(PHONE[1], 100);
  return tidy(`${head(W, H, label)}${panel(W, H)}
<image href="${icon}" x="${X}" y="52" width="64" height="64"/>
${T(X + 84, 96, 46, C.ink, 'CS2 IP Changer', { w: 650, ls: -1.4 })}
<text x="${X + 86}" y="128" font-size="16.5">${S.map(([v, k2], i) => (i ? dot : '') + fact(v, k2, !i)).join('')}</text>
${para(X, 196, 17.5, 27, [PICK[0], ...pk])}
${para(X, 196 + 27 * pk.length + 22, 17.5, 27, [PHONE[0], ...ph])}
<text x="${X}" y="${sy - 26}" font-size="15"><tspan class="s" fill="${C.mu}">Windows 10/11 ·</tspan><tspan class="m" fill="${C.mu}" dx="0.3em">${esc(R.tag)}</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">· ${SAFE}</tspan></text>
<clipPath id="pc"><rect width="${W}" height="${H}" rx="28"/></clipPath>
<g clip-path="url(#pc)"><clipPath id="sc"><path d="M${sx} ${sy + 18}a18 18 0 0 1 18-18H${W}V${H}H${sx}z"/></clipPath>
<image clip-path="url(#sc)" href="${shot.uri}" x="${sx}" y="${sy}" width="${n(shot.w * k)}" height="${n(sh)}"/></g></svg>`);
}

function marco(A, mob) {
  const W = mob ? 600 : 1000, iw = mob ? W : 470, ih = mob ? Math.round(W * 0.56) : 300;
  const kh = iw * A.ratio, oy = (ih - kh) / 2;
  // Solid dots, no halo; none touching the photo's edge.
  const dots = A.pools.map((p, i) => ({ x: p.x * iw, y: oy + p.y * kh, r: Math.max(4.5, p.r * iw * 0.9), i })).filter((d) => d.x - d.r > 14 && d.x + d.r < iw - 14 && d.y - d.r > 14 && d.y + d.r < ih - 14);
  const css = `.pl{opacity:0;animation:pl 9s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes pl{0%{opacity:0}8%,88%{opacity:1}96%,100%{opacity:0}}
${dots.map((d) => `.p${d.i}{animation-delay:${n(0.6 + d.x / iw * 2.6, 2)}s}`).join('')}`;
  const clip = mob ? `M0 28a28 28 0 0 1 28-28H${W - 28}a28 28 0 0 1 28 28V${ih}H0z` : `M0 28a28 28 0 0 1 28-28H${iw}V${ih}H28a28 28 0 0 1-28-28z`;
  const X = mob ? 40 : iw + 52, Y = mob ? ih + 70 : 104;
  const desc = mob ? ['Draw an area on a map and it finds,', 'measures and ranks the swimming', 'pools in the aerial imagery.'] : ['Draw an area on a map and it finds,', 'measures and ranks the swimming pools', 'in the aerial imagery.'];
  const st = mob ? 34 : 28, H = mob ? Y + 50 + desc.length * st + 64 : 300;
  return tidy(`${head(W, H, 'marco-polo: draw an area on a map and it finds, measures and ranks the swimming pools. Runs in the browser.', css)}${panel(W, H)}
<clipPath id="mc"><path d="${clip}"/></clipPath>
<g clip-path="url(#mc)"><image href="${A.uri}" x="0" y="${n(oy)}" width="${iw}" height="${n(kh)}" preserveAspectRatio="none"/>
${dots.map((d) => `<circle class="pl p${d.i}" cx="${n(d.x)}" cy="${n(d.y)}" r="${n(d.r)}" fill="${C.acc}"/>`).join('')}</g>
${T(X - 2, Y, mob ? 46 : 36, C.ink, 'marco-polo', { w: 600, ls: -0.8 })}
${lines(X, Y + (mob ? 50 : 44), mob ? 24 : 18.5, st, C.mu, desc)}
${T(X, mob ? H - 44 : 250, mob ? 20 : 15.5, C.mu, 'TypeScript · runs in your browser')}</svg>`);
}

const GROW = `.grow{transform-box:fill-box;transform-origin:left center;animation:grow 2.4s cubic-bezier(.2,.8,.2,1) both}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}`;
function thm(d, mob) {
  const W = mob ? 600 : 1000, X = mob ? 40 : 56;
  const label = `TryHackMe: level ${d.level} ${d.title}, top ${d.top_percent}%, ${d.rooms} rooms, ${d.badges} badges`;
  const facts = (x, y, fs) => `<text x="${x}" y="${y}" font-size="${fs}"><tspan class="s" fill="${C.mu}">${esc(d.title)} · top</tspan><tspan class="m" fill="${C.ink}" font-weight="600" dx="0.3em">${d.top_percent}%</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">worldwide ·</tspan><tspan class="m" fill="${C.ink}" font-weight="600" dx="0.3em">${d.rooms}</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">rooms ·</tspan><tspan class="m" fill="${C.ink}" font-weight="600" dx="0.3em">${d.badges}</tspan><tspan class="s" fill="${C.mu}" dx="0.3em">badges</tspan></text>`;
  const bar = (x, y, w) => {
    if (!d.next || d.points == null) return '';
    const k = Math.max(0, Math.min(1, (d.points - d.next.from) / (d.next.at - d.next.from))), h = mob ? 14 : 12, fs = mob ? 20 : 15, ty = y + h + (mob ? 32 : 26);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${C.track}"/><rect class="grow" x="${x}" y="${y}" width="${n(w * k)}" height="${h}" rx="${h / 2}" fill="${C.acc}"/>
<text x="${x}" y="${ty}" font-size="${fs}"><tspan class="m" fill="${C.ink}" font-weight="600">${comma(d.points)}</tspan><tspan class="s" fill="${C.mu}" dx="0.35em">points</tspan></text>
<text x="${x + w}" y="${ty}" font-size="${fs}" text-anchor="end"><tspan class="s" fill="${C.mu}">${esc(d.next.level)} ${esc(d.next.title)} at</tspan><tspan class="m" fill="${C.ink}" font-weight="600" dx="0.35em">${comma(d.next.at)}</tspan></text>`;
  };
  if (mob) {
    const H = 420;
    return tidy(`${head(W, H, label, GROW)}${panel(W, H)}
<text x="${X}" y="70" font-size="22"><tspan class="s" fill="${C.ink}" font-weight="600">TryHackMe</tspan><tspan class="s" fill="${C.mu}" dx="0.4em">${day(d.as_of)}</tspan></text>
${T(X - 3, 172, 96, C.ink, d.level, { f: 'm', w: 600, ls: -3 })}${facts(X, 228, 21)}${bar(X, 300, W - 2 * X)}</svg>`);
  }
  const H = 270;
  return tidy(`${head(W, H, label, GROW)}${panel(W, H)}
<text x="${X}" y="64" font-size="17"><tspan class="s" fill="${C.ink}" font-weight="600">TryHackMe</tspan><tspan class="s" fill="${C.mu}" dx="0.4em">${day(d.as_of)}</tspan></text>
${T(X - 3, 146, 76, C.ink, d.level, { f: 'm', w: 600, ls: -2 })}${facts(X + 170, 144, 18)}${bar(X, 184, W - 2 * X)}</svg>`);
}

export async function render({ out = process.env.OUT || ASSETS } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const R = await cs2Data(), D = thmData(), A = await aerial();
  const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(SRC, 'cs2-icon.svg')).toString('base64');
  const jpg = fs.readFileSync(path.join(SRC, 'cs2-regions.jpg')), meta = await sharp(jpg).metadata();
  const shot = { uri: 'data:image/jpeg;base64,' + jpg.toString('base64'), w: meta.width, h: meta.height };
  const files = {
    'hero.svg': hero(R, icon, false), 'hero-m.svg': hero(R, icon, true),
    'cs2.svg': cs2(R, icon, shot, false), 'cs2-m.svg': cs2(R, icon, shot, true),
    'marco-polo.svg': marco(A, false), 'marco-polo-m.svg': marco(A, true),
  };
  if (D) { files['thm.svg'] = thm(D, false); files['thm-m.svg'] = thm(D, true); }
  const BTNS = [['download', 'Download CS2 IP Changer'], ['site', 'Website'], ['marco', 'marco-polo'], ['thm', 'TryHackMe']];
  for (const theme of ['dark', 'light']) BTNS.forEach(([id, text], i) => {
    files[`btn-${id}-${theme}.svg`] = pill(text, theme, { primary: i === 0 });
    if (i) files[`btn-${id}-m-${theme}.svg`] = pill(text, theme, { mob: true });
  });
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(out, f), s);
  console.log(`vitrine: ${Object.keys(files).length} files (${R.tag}, ${R.downloads} downloads, ${R.releases} releases, ${R.stars} stars, VT ${R.vt ?? 'n/a'}; THM ${D ? D.as_of : 'none'})`);
}

if (isMain(import.meta.url)) await render();
