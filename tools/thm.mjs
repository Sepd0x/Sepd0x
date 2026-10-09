// TRYHACKME: the THM standing as one strip under the cards. The level leads, in hex as THM writes it;
// four readouts follow, each with a mark drawn from what it counts: a ruler of rooms, a four-week
// window for the streak with today in green, a comb of solid hexagons for the badges, and the share of
// players he is ahead of on a 0-100 % rule. Digits roll up from blank like an odometer. The static
// picture is the final state, so reduced motion and renderers without CSS animation show the numbers.
//
// Data: data/thm.json (seeded by hand from the owner's profile; it is also the fallback). Only inside
// the GitHub Action (GITHUB_ACTIONS=true and THM_LIVE=1) ONE request goes to THM's public-profile API.
// The answer is accepted only if every core field is found and plausible; otherwise the file stays.
// usage: node thm.mjs
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, ROOT, textPath, glyphRun, writeAsset, tidy, n, isMain } from './lib.mjs';

const USER = 'Sepd';
const API = `https://tryhackme.com/api/v2/public-profile?username=${encodeURIComponent(USER)}`;
const DATA = path.join(ROOT, 'data', 'thm.json');
const W = 1045, H = 104, R = 8;
const STALE_DAYS = 3;                              // older than this, the strip shows the date

// ---------- data ----------
const toInt = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\s*\d[\d,]*\s*$/.test(v)) return Number(v.replace(/[,\s]/g, ''));
  return NaN;
};
const between = (lo, hi) => (v) => { const x = toInt(v); return Number.isInteger(x) && x >= lo && x <= hi ? x : undefined; };
const levelOf = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 255 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const hex = v.match(/^\s*\[?\s*0x([0-9a-f]{1,2})\s*\]?\s*$/i);
  const x = hex ? parseInt(hex[1], 16) : /^\s*\d{1,3}\s*$/.test(v) ? Number(v) : NaN;
  return x >= 1 && x <= 255 ? x : undefined;
};
const titleOf = (v) => (typeof v === 'string' && /^\s*[A-Za-z]{3,16}\s*$/.test(v) ? v.trim().toUpperCase() : undefined);
const percentOf = (v) => { const x = typeof v === 'string' ? Number(v) : v; return typeof x === 'number' && x > 0 && x <= 100 ? Math.round(x * 10) / 10 : undefined; };

// Which keys may carry which field. Exact shapes only: "longestStreak", "badges" (a list) or a
// display "name" never match.
const FIELDS = {
  rank: { key: /^(global_?|user_?)?rank$/i, ok: between(1, 100_000_000) },
  rooms: { key: /^(completed_?rooms?|rooms_?completed)(_?(number|count))?$/i, ok: between(0, 5000) },
  badges: { key: /^badges?_?(number|count)$/i, ok: between(0, 500) },
  streak: { key: /^(current_?)?streak(_?days)?$/i, ok: between(0, 5000) },
  level: { key: /^(user_?)?level$/i, ok: levelOf },
  title: { key: /^(level_?title|level_?name|rank_?title|title)$/i, ok: titleOf },
  top_percent: { key: /^top_?percent(age)?$/i, ok: percentOf },
  points: { key: /^(total_?)?points$/i, ok: between(0, 100_000_000) },
};
const CORE = ['rank', 'rooms', 'badges', 'streak', 'level'];

/** Breadth-first over plain objects (arrays are never entered, so a list of rooms or badges cannot
 *  lend its fields); the shallowest match wins. */
function walk(root) {
  const out = [];
  let queue = [[root, '']];
  for (let depth = 0; depth < 6 && queue.length; depth++) {
    const next = [];
    for (const [o, p] of queue) {
      for (const [k, v] of Object.entries(o)) {
        const at = p ? `${p}.${k}` : k;
        out.push({ k, v, at });
        if (v && typeof v === 'object' && !Array.isArray(v)) next.push([v, at]);
      }
    }
    queue = next;
  }
  return out;
}

const levelLabel = (lv) => `[0x${lv.toString(16).toUpperCase()}]`;

/** Reads data/thm.json and checks it with the same rules as the live answer. null if unusable. */
export function readData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    const lv = levelOf(d.level);
    const bad = ['rank', 'rooms', 'badges', 'streak'].filter((f) => FIELDS[f].ok(d[f]) === undefined);
    if (!lv) bad.push('level');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.as_of || '')) bad.push('as_of');
    if (bad.length) { console.log(`thm: data/thm.json unusable (${bad.join(', ')})`); return null; }
    return { ...d, lv, title: titleOf(d.title) || null, top_percent: percentOf(d.top_percent) ?? null };
  } catch (e) {
    console.log(`thm: data/thm.json unreadable (${e.message})`);
    return null;
  }
}

const keep = (prev, why) => {
  console.log(`thm: kept data/thm.json (${prev.source}, ${prev.as_of}): ${why}`);
  return prev;
};

/** One request, only in the Action. Never throws; on any doubt returns `prev` unchanged. */
export async function refresh(prev) {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.THM_LIVE !== '1') {
    console.log('thm: live off (only in the Action with THM_LIVE=1); using data/thm.json');
    return prev;
  }
  let body;
  try {
    const r = await fetch(API, {
      headers: { 'user-agent': 'sepd0x-profile (+https://github.com/Sepd0x/Sepd0x)', accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return keep(prev, `HTTP ${r.status}`);
    const text = await r.text();
    if (text.length > 2_000_000) return keep(prev, `answer too large (${text.length} chars)`);
    body = JSON.parse(text);
  } catch (e) {
    return keep(prev, `request failed (${e.name}: ${String(e.message).slice(0, 100)})`);
  }
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return keep(prev, 'answer is not a JSON object');
    if (typeof body.status === 'string' && !/^(success|ok)$/i.test(body.status)) return keep(prev, `status "${body.status.slice(0, 40)}"`);
    const entries = walk(body);
    const who = entries.find((e) => /^username$/i.test(e.k) && typeof e.v === 'string');
    if (who && who.v.toLowerCase() !== USER.toLowerCase()) return keep(prev, 'answer is for another username');

    const found = {};
    for (const [f, spec] of Object.entries(FIELDS)) {
      for (const e of entries) {
        if (!spec.key.test(e.k)) continue;
        const v = spec.ok(e.v);
        if (v !== undefined) { found[f] = v; break; }
      }
    }
    console.log('thm: found ' + (Object.entries(found).map(([k, v]) => `${k}=${k === 'level' ? levelLabel(v) : v}`).join(' ') || 'nothing'));

    const missing = CORE.filter((f) => found[f] === undefined);
    if (missing.length) {
      console.log('thm: keys in the answer: ' + entries.map((e) => e.at).slice(0, 60).join(' '));
      return keep(prev, `missing or implausible: ${missing.join(', ')}`);
    }
    // Counters that only grow: a big drop means the wrong field, not a real change.
    for (const f of ['rooms', 'badges']) {
      if (found[f] < prev[f] * 0.8) return keep(prev, `${f} fell from ${prev[f]} to ${found[f]}; not trusted`);
    }
    if (found.level < prev.lv) return keep(prev, `level fell from ${levelLabel(prev.lv)} to ${levelLabel(found.level)}; not trusted`);

    const kept = [];
    let title = found.title;
    if (!title) {
      // The title belongs to the level: keep it only while the level is the same, never guess one.
      title = found.level === prev.lv ? prev.title : null;
      kept.push(title ? 'title' : 'title (dropped: new level, no title in the answer)');
    }
    let top = found.top_percent;
    if (top === undefined) { top = prev.top_percent; kept.push('top_percent'); }

    const next = {
      username: USER,
      level: levelLabel(found.level),
      title,
      rank: found.rank,
      top_percent: top,
      badges: found.badges,
      streak: found.streak,
      rooms: found.rooms,
      ...(found.points !== undefined ? { points: found.points } : {}),
      source: 'live',
      as_of: new Date().toISOString().slice(0, 10),
      ...(kept.length ? { kept } : {}),
    };
    fs.writeFileSync(DATA, JSON.stringify(next, null, 2) + '\n');
    console.log(`thm: wrote data/thm.json (live ${next.as_of})${kept.length ? '; kept from before: ' + kept.join(', ') : ''}`);
    return { ...next, lv: found.level };
  } catch (e) {
    return keep(prev, `could not read the answer (${e.name}: ${String(e.message).slice(0, 100)})`);
  }
}

// ---------- drawing ----------
// The strip sits under the two cards at their exact scale (README width 98.5 %, W = 1045, so one unit
// here is one unit there) and keeps their grid: the side margin is the cards' 20, and the tick between
// streak and badges falls on the gutter between the portrait and the card. One survey rail runs the
// width, like the terrain's front rail: every mark stands on it, the columns are separated by downward
// ticks and named underneath, as the months are there. Green means one thing, as in the terrain: now
// (today's cell) and where he stands (the rank marker).
// Type ranks under the page's identity: the terrain's shape first, then the handle and the card's name,
// then the level (HERO), then the readouts (NUM, just under the handle at page scale). The badges
// column is as wide as its comb; the rank axis takes the rest.
const X0 = 20, X1 = W - 20;
const JOINT = 522.5;                                            // the gutter between the cards above
const HEX_R = 5.5;
const NUM = 18, HERO = 32, LAB = 10, RANK_LAB = 10, TAG = 16;
const Y = { num: 41, rail: 68, foot: 85 };                     // baselines; every mark stands on the rail
const GAP = 18;                                                 // free space before the next column's tick
const columns = (badges) => {
  const wb = Math.min(136, Math.max(96, Math.ceil(3 + (1.5 * (Math.max(badges, 1) - 1) + 2) * HEX_R + GAP + 0.5)));
  return [['level', 98], ['rooms', 214], ['streak', 190.5], ['badges', wb], ['rank', X1 - JOINT - wb]];
};
const LAND = 'cubic-bezier(.2,.8,.2,1)', RISE = 'cubic-bezier(.2,.85,.25,1.06)';   // RISE = the terrain's prisms
const T0 = 0.8;                                                 // the strip starts after the cards have begun

export function draw(d, today) {
  const defs = new Map();                                       // glyph defs, shared by both themes
  const glyph = (ch, S) => {
    const id = `g${S}${ch}`;
    if (!defs.has(id)) defs.set(id, `<path id="${id}" d="${glyphRun(ch, 0, 0, S, { prec: 2 })[0].d}"/>`);
    return id;
  };
  const masks = new Set();
  let last = 0;                                                 // when the last thing settles
  const settle = (t) => { last = Math.max(last, t); };

  /** Odometer: one masked column per digit; the strip rolls up from blank to the digit (the first frame
   *  shows nothing, never a zero that is not his). The units take one extra turn when the number is
   *  big enough, as if it had really counted up. Anything that is not a digit is drawn still. */
  function odometer(str, x, y, S, t0) {
    masks.add(S);
    const digits = [...str].filter((c) => /\d/.test(c));
    const value = Number(digits.join(''));
    let cx = x, di = 0, out = '';
    for (const ch of str) {
      if (!/\d/.test(ch)) { out += `<use class="n" href="#${glyph(ch, S)}" x="${n(cx)}" y="${y}"/>`; cx += 0.6 * S; continue; }
      const pos = digits.length - 1 - di;
      const turns = pos === 0 && value >= 10 ? 1 : 0;
      const stop = turns * 10 + Number(ch);
      let strip = '';
      for (let j = 0; j <= stop; j++) strip += `<use href="#${glyph(String(j % 10), S)}" y="${j * S}"/>`;
      const delay = n(t0 + 0.06 * di, 2), dur = n(0.8 + 0.15 * turns, 2);
      settle(delay + dur);
      out += `<g transform="translate(${n(cx)} ${y})" mask="url(#k${S})"><g class="o n" style="--s:${S}px;transform:translateY(-${stop * S}px);animation-duration:${dur}s;animation-delay:${delay}s">${strip}</g></g>`;
      cx += 0.6 * S; di++;
    }
    return { svg: out, end: cx };
  }

  const parts = [];                                             // svg, in paint order
  const text = (cls, s, x, y, size, o = {}) => { const t = textPath(s, x, y, size, o); parts.push(`<path class="${cls}" d="${t.d}"/>`); return t; };
  const rise = (delay) => { settle(delay + 0.45); return `style="animation-delay:${n(delay, 3)}s"`; };

  // Columns, the rail, its ticks (down) and the names under it.
  const at = {};
  let gx = X0, ticks = '';
  const COLS = columns(d.badges);
  for (const [k, w] of COLS) { at[k] = { x: gx, w, end: gx + w - GAP }; ticks += `M${n(gx)} ${Y.rail}v5`; gx += w; }
  parts.push(`<path class="rail" d="M${X0} ${Y.rail}H${X1}${ticks}"/>`);
  // Readouts and names exist twice: as drawn (.dk) and for narrow screens (.mb, see the media query).
  // On a phone the strip is ~355 px wide (1 unit ≈ 0.34 px), so MOB = 26 units reads at ~9 px.
  const MOB = 26, MOB_FOOT = 98;
  const name = (desk, mob, x) => { text('mu sm dk', desk, x, Y.foot, LAB, { track: 0.3 }); text('mu mb', mob, x, MOB_FOOT, MOB - 1, { track: -0.5 }); };
  const num = (str, x, t) => `<g class="dk">${odometer(str, x, Y.num, NUM, t).svg}</g><g class="mb">${odometer(str, x, Y.num, MOB, t).svg}</g>`;
  // Each number says what it counts in plain words (a friend could not tell "streak" or "rank" apart
  // from the marks): day streak, global rank.
  const NAMES = { streak: 'day streak', badges: 'badges', rank: 'global rank' };
  for (const [k] of COLS) {
    if (k === 'rooms') continue;
    // The title belongs to the level: "level · hacker" where there is room, "level" on a phone.
    if (k === 'level' && d.title) name(`level · ${d.title.toLowerCase()}`, k, at[k].x);
    else name(NAMES[k] || k, k === 'rank' ? k : NAMES[k] || k, at[k].x);   // phone: "rank", or it runs into "badges"
  }

  // Level: the anchor, still from the first frame like the handle in the terrain. "0x" is the notation,
  // the digit the value. Its ink edge sits on the card's "marco-polo" above (the 0 has a wider bearing).
  {
    const lvs = d.lv.toString(16).toUpperCase();
    const HS = n(Math.min(HERO, (at.level.w - GAP) / ((2 + lvs.length) * 0.6)), 1);   // 0x10 and up shrink
    const hx = X0 + 0.9 - 0.068 * HS;
    const w0 = text('mu', '0x', hx, Y.num, HS).width;
    text('ink', lvs, hx + w0 + 0.6, Y.num, HS);
  }

  // Rooms: a ruler, one tick per room (or per 5, 10, 25... when they no longer fit at a readable pitch);
  // every 5th and 10th tick is longer, so 55 reads as five tens and a five at a glance. The ticks spread
  // to fill the column, so every mark ends on the same margin.
  {
    const { x, end } = at.rooms, t = T0, avail = end - x - 3;
    parts.push(num(String(d.rooms), x, t));
    const unit = [1, 5, 10, 25, 50, 100, 250].find((u) => avail / Math.ceil(d.rooms / u) >= 3) || 500;
    const count = Math.ceil(d.rooms / unit);
    const P = Math.min(6, avail / Math.max(count, 1));
    const step = Math.min(0.012, 0.6 / Math.max(count, 1));
    let s = '';
    for (let i = 0; i < count; i++) {
      const h = (i + 1) % 10 === 0 ? 13 : (i + 1) % 5 === 0 ? 9 : 5;
      s += `<path class="tk rz${h > 5 ? ' tl' : ''}" ${rise(t + 0.5 + i * step)} d="M${n(x + 3 + i * P + P / 2)} ${Y.rail}v-${h}"/>`;
    }
    parts.push(s);
    name(unit > 1 ? `rooms ×${unit}` : 'rooms', unit > 1 ? `rooms ×${unit}` : 'rooms', x);
  }

  // Streak: the last four weeks as day cells, today on the right. Today is green with the terrain's
  // dashed stem over it; a 14-day streak fills half the window, so the window itself says something.
  {
    const { x, end } = at.streak, t = T0 + 0.25, WIN = 28;
    parts.push(num(String(d.streak), x, t));
    const P = (end - x - 3) / WIN, C = n(P * 0.7, 2);
    const lit = Math.min(d.streak, WIN);
    let s = '';
    for (let i = 0; i < WIN; i++) {
      const cx = n(x + 3 + i * P + (P - C) / 2, 2), k = i - (WIN - lit);
      if (k < 0) { s += `<rect class="cd rz" style="animation-delay:${n(t + 0.5, 3)}s" x="${cx}" y="${n(Y.rail - 2 - C, 2)}" width="${C}" height="${C}" rx=".8"/>`; continue; }
      const today = i === WIN - 1;
      s += `<rect class="${today ? 'ct' : 'cl'} rz" ${rise(t + 0.5 + k * 0.03)} x="${cx}" y="${n(Y.rail - 2 - C, 2)}" width="${C}" height="${C}" rx=".8"/>`;
    }
    if (lit) {
      const sx = n(x + 3 + (WIN - 1) * P + P / 2, 2), top = n(Y.rail - 2 - C - 2, 2);
      s += `<path class="stem rz" ${rise(t + 0.5 + lit * 0.03 + 0.1)} d="M${sx} ${top}V${n(top - 10, 2)}"/>`;
    }
    parts.push(s);
  }

  // Badges: one solid hexagon each (solid = earned, as the streak's cells), flat-topped and packed as a
  // strip of honeycomb, so nine read as a comb and not as a row of zeros.
  {
    const { x, end } = at.badges, t = T0 + 0.5, avail = end - x - 3;
    parts.push(num(String(d.badges), x, t));
    let r = HEX_R;
    const fits = (rr) => Math.floor((avail - 2 * rr) / (1.5 * rr)) + 1;
    if (d.badges > fits(r)) r = Math.max(3, avail / (1.5 * (d.badges - 1) + 2));
    const show = Math.min(d.badges, fits(r));
    const h = Math.sqrt(3) * r, rd = r - 0.7;
    const hex = (cx, cy) => 'M' + [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 3) * k; return `${n(cx + rd * Math.cos(a), 2)} ${n(cy + rd * Math.sin(a), 2)}`; }).join('L') + 'z';
    let s = '';
    for (let i = 0; i < show; i++) {
      const cy = Y.rail - 2 - h / 2 - (i % 2 ? h / 2 : 0);
      s += `<path class="hx rz" ${rise(t + 0.5 + i * 0.05)} d="${hex(x + 3 + r + i * 1.5 * r, cy)}"/>`;
    }
    parts.push(s);
  }

  // Rank: the headline is the share he is ahead of ("top 8%", the "top" and "%" muted like "0x" and
  // "#"); the raw rank stays small by the marker. The rail here is the 0-100 % axis with the top on the
  // right: the marker travels in from 0 and the stretch it leaves behind is everyone it beats.
  {
    const { x } = at.rank, t = T0 + 0.75;
    const top = d.top_percent;
    if (top != null) {
      for (const [cls, S] of [['dk', NUM], ['mb', MOB]]) {
        parts.push(`<g class="${cls}"><g class="tp" style="animation-delay:${n(t, 2)}s">`);  // the notation arrives with its number
        const tw = text('mu', 'top ', x, Y.num, S).width;
        const o = odometer(String(top), x + tw, Y.num, S, t);
        text('mu', '%', o.end + 0.6, Y.num, S);
        parts.push('</g>', o.svg, '</g>');
      }
      const ax = x + 3, aw = X1 - ax;
      const px = ax + (aw * (100 - top)) / 100;
      let tk = '';
      for (let i = 1; i <= 10; i++) tk += `M${n(ax + (aw * i) / 10)} ${Y.rail}v-${i % 5 === 0 ? 5 : 3}`;
      parts.push(`<path class="ax" d="${tk}"/>`);
      const mT = n(t + 0.85, 2), mD = 0.9;
      settle(mT + mD);
      parts.push(`<path class="fill" style="animation-delay:${mT}s" d="M${n(ax)} ${Y.rail}H${n(px)}"/>`);
      parts.push(`<path class="mk" style="--dx:${n(ax - px)}px;animation-delay:${mT}s" d="M${n(px - 3.5)} ${Y.rail - 12}h7l-3.5 5z"/>`);
      const rk = `#${d.rank}`, rw = textPath(rk, 0, 0, RANK_LAB, { track: 0.5 }).width;
      const lx = px - 7 - rw >= ax + 2 ? px - 7 - rw : px + 7;
      parts.push(`<g class="tp" style="animation-delay:${n(mT + mD - 0.05, 2)}s">`);
      text('mu xs', rk, lx, Y.rail - 7, RANK_LAB, { track: 0.5 });
      parts.push('</g>');
      settle(mT + mD + 0.3);
    } else {
      const hs = text('mu', '#', x, Y.num, NUM).width;
      parts.push(odometer(String(d.rank), x + hs + 0.6, Y.num, NUM, t).svg);
    }
  }

  // Where it comes from, named the way the site writes it: "TryHackMe" in ink, top right on the numbers'
  // baseline, on desktop and on a phone, so the strip reads as THM at first sight (plain type, not their
  // logo). The end of the axis stays free for the marker (the better the rank, the further right it
  // goes). The date only when the numbers are older than a few days (the Action keeps them fresh).
  const tag = text('ink dk', 'TryHackMe', X1, Y.num, TAG, { align: 'end', track: 0.2 });
  text('ink mb', 'TryHackMe', X1, Y.num, MOB, { align: 'end', track: -0.5 });
  const age = (Date.parse(today) - Date.parse(d.as_of)) / 864e5;
  if (age > STALE_DAYS) text('mu xs', d.as_of.replaceAll('-', '.'), X1 - tag.width - 12, Y.num, LAB, { align: 'end', track: 0.5 });

  const label = `TryHackMe: level 0x${d.lv.toString(16).toUpperCase()}${d.title ? ' ' + d.title : ''}, ${d.rooms} rooms, ${d.streak}-day streak, ${d.badges} badges, rank ${d.rank}${d.top_percent != null ? ` (top ${d.top_percent}%)` : ''}, as of ${d.as_of}`;
  const maskDefs = [...masks].map((S) => {
    const y0 = n(-1.0 * S), hh = n(1.22 * S);
    return `<mask id="k${S}" maskUnits="userSpaceOnUse" x="-2" y="${y0}" width="${n(0.6 * S + 4)}" height="${hh}"><rect x="-2" y="${y0}" width="${n(0.6 * S + 4)}" height="${hh}" fill="url(#fade)"/></mask>`;
  }).join('');

  const out = {};
  for (const [name, c] of Object.entries(THEMES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">
<style>
.frame{fill:none;stroke:${c.faint}}
.mu{fill:${c.muted}}.ink,.n{fill:${c.ink}}
.rail{fill:none;stroke:${c.line};stroke-width:1}
.ax{fill:none;stroke:${c.line};stroke-width:1}
.o{animation:roll .9s ${LAND} backwards}
.rz{transform-box:fill-box;transform-origin:50% 100%;animation:rise .45s ${RISE} backwards}
.tk{stroke:${c.muted};stroke-width:1.2}.tl{stroke:${c.ink}}
.cl{fill:${c.ink};fill-opacity:${name === 'light' ? .8 : .88}}.ct{fill:${c.acc}}
.cd{fill:${c.faint}}
.stem{fill:none;stroke:${c.acc};stroke-width:1;stroke-dasharray:1.5 2}
.hx{fill:${c.ink};fill-opacity:${name === 'light' ? .8 : .88}}
.fill{fill:none;stroke:${c.edge};stroke-width:1.5;transform-box:fill-box;transform-origin:0 50%;animation:grow .9s ${LAND} backwards}
.mk{fill:${c.acc};animation:slide .9s ${LAND} backwards}
.tp{animation:in .3s ease-out backwards}
@keyframes roll{from{transform:translateY(var(--s))}}
@keyframes rise{from{transform:scaleY(0)}}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes slide{0%{opacity:0;transform:translateX(var(--dx))}10%{opacity:1}}
@keyframes in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.o,.rz,.fill,.mk,.tp{animation:none}}
.mb{display:none}
@media (max-width:600px){/*mb*/.xs,.dk{display:none}.mb{display:inline}.rail,.ax{stroke-width:2}}/*/mb*/
</style>
<defs>${[...defs.values()].join('')}<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".16" stop-color="#fff"/><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>${maskDefs}</defs>
<rect class="frame" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R}"/>
${parts.join('')}
</svg>`;
    out[name] = tidy(svg);
  }
  return { out, settle: n(last, 2) };
}

/** Refresh (in the Action only), then draw. Never throws, so the rest of the profile always renders;
 *  on bad data the old SVGs stay. */
export async function render() {
  let d = readData();
  if (!d) { console.log('thm: nothing drawn; assets/thm-*.svg left as they were'); return; }
  try { d = await refresh(d); } catch (e) { console.log(`thm: refresh error ignored (${e.message})`); }
  const today = new Date().toISOString().slice(0, 10);
  let drawn;
  try { drawn = draw(d, today); } catch (e) { console.log(`thm: draw failed (${e.message}); assets/thm-*.svg left as they were`); return; }
  const { out, settle } = drawn;
  for (const [name, svg] of Object.entries(out)) writeAsset(`thm-${name}.svg`, svg);
  console.log(`thm: ${d.source} ${d.as_of}; level ${levelLabel(d.lv)} rooms ${d.rooms} streak ${d.streak} badges ${d.badges} rank ${d.rank} top ${d.top_percent}%; settles at ${settle}s`);
}

if (isMain(import.meta.url)) render();
