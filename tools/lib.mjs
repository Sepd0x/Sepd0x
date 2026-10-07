// Shared helpers: palettes, font-to-path text, GitHub data access.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import opentype from 'opentype.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS = path.join(ROOT, 'assets');
export const CACHE = path.join(ROOT, 'tools', '.cache');
export const LOGIN = 'Sepd0x';

// One ink, one accent. Dark values sit on #0d1117, light values on #ffffff.
export const THEMES = {
  dark: {
    ink: '#e6edf3', muted: '#7d8590', faint: '#30363d',
    acc: '#3fb950', accHi: '#56d364',
    edge: '#6e7681', hatch: '#484f58',
    paper: '#0d1117',
  },
  light: {
    ink: '#1f2328', muted: '#656d76', faint: '#d0d7de',
    acc: '#1a7f37', accHi: '#2da44e',
    edge: '#57606a', hatch: '#afb8c1',
    paper: '#ffffff',
  },
};

const FONT = opentype.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fonts', 'JetBrainsMono-Bold.ttf')));
export const n = (v, d = 1) => +v.toFixed(d);

// opentype's toPathData(decimals) occasionally emits NaN; serialise the commands ourselves.
function pathData(p, prec) {
  // Relative commands on pre-rounded coordinates: compact, and no drift.
  const r = (v) => Math.round(v * 10 ** prec);
  const f = (v) => String(v / 10 ** prec);
  let out = '', cx = 0, cy = 0, sx = 0, sy = 0;
  for (const c of p.commands) {
    if (c.type === 'Z') { out += 'z'; cx = sx; cy = sy; continue; }
    const x = r(c.x), y = r(c.y);
    if (c.type === 'M') { out += 'M' + f(x) + ' ' + f(y); sx = x; sy = y; }
    else if (c.type === 'L') { if (x === cx && y === cy) continue; out += 'l' + f(x - cx) + ' ' + f(y - cy); }
    else if (c.type === 'Q') out += 'q' + [r(c.x1) - cx, r(c.y1) - cy, x - cx, y - cy].map(f).join(' ');
    else out += 'c' + [r(c.x1) - cx, r(c.y1) - cy, r(c.x2) - cx, r(c.y2) - cy, x - cx, y - cy].map(f).join(' ');
    cx = x; cy = y;
  }
  return out.replace(/ -/g, '-').replace(/(^|[^0-9.])0\./g, '$1.');
}

/** Text run → single path `d` (JetBrains Mono Bold). Returns {d, width}. align: start|end|middle */
export function textPath(str, x, y, size, { track = 0, align = 'start', prec = 1 } = {}) {
  const scale = size / FONT.unitsPerEm;
  const glyphs = [...str].map((ch) => FONT.charToGlyph(ch));
  const width = glyphs.reduce((w, g) => w + g.advanceWidth * scale + track, 0) - track;
  let cx = align === 'end' ? x - width : align === 'middle' ? x - width / 2 : x;
  const parts = [];
  for (const g of glyphs) {
    const d = pathData(g.getPath(cx, y, size), prec);
    if (d) parts.push(d);
    cx += g.advanceWidth * scale + track;
  }
  return { d: parts.join(''), width };
}

/** Per-character paths (for the handle, where the 0 takes the accent). */
export function glyphRun(str, x, y, size, { track = 0, prec = 2 } = {}) {
  const scale = size / FONT.unitsPerEm;
  let cx = x;
  return [...str].map((ch) => {
    const g = FONT.charToGlyph(ch);
    const out = { ch, x: cx, d: pathData(g.getPath(cx, y, size), prec), w: g.advanceWidth * scale };
    cx += g.advanceWidth * scale + track;
    return out;
  });
}

function ghGraphQL(query) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    return fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'sepd0x-profile' },
      body: JSON.stringify({ query }),
    }).then(async (r) => {
      const j = await r.json();
      if (!r.ok || j.errors) throw new Error('GraphQL: ' + JSON.stringify(j.errors || j));
      return j;
    });
  }
  // Local fallback: the gh CLI session.
  const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  return Promise.resolve(JSON.parse(out));
}

let cached;
/** Public profile data, fetched once per run and cached on disk for offline re-renders. */
export async function profile({ offline = process.argv.includes('--offline') } = {}) {
  if (cached) return cached;
  const file = path.join(CACHE, 'profile.json');
  if (offline && fs.existsSync(file)) return (cached = JSON.parse(fs.readFileSync(file, 'utf8')));
  const j = await ghGraphQL(`query{user(login:"${LOGIN}"){login name avatarUrl(size:460)
    contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}}}`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(j.data.user, null, 1));
  return (cached = j.data.user);
}

export async function download(url, file) {
  const r = await fetch(url, { headers: { 'user-agent': 'sepd0x-profile' } });
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf;
}

export function writeAsset(name, svg) {
  fs.mkdirSync(ASSETS, { recursive: true });
  const file = path.join(ASSETS, name);
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (prev !== svg) fs.writeFileSync(file, svg);
  console.log(`${prev === svg ? 'same' : 'wrote'}  ${name}  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
}

/** Minify whitespace between tags; keeps attribute content intact. */
export const tidy = (s) => s.replace(/>\s+</g, '><').replace(/\n\s*/g, '').trim() + '\n';

export const STATE_FILE = path.join(ASSETS, '.state.json');
export const readState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {});
export const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');

export const isMain = (url) => process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;
