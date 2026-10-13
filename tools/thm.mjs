// TRYHACKME: the THM standing as one panel, read like a measuring instrument. On the left, the skill web
// as a dial: one rule per skill, zero on a small hub (a skill at 0 stands at the foot of its own rule),
// the reading written at the tip and a green cross-mark where it lands. The dial turns by itself through
// THM's four webs (foundational, security analyst, penetration tester, security engineer), about 4 s
// each; the tab of the web in view is the one in ink. On the right, the readouts: level in hex and the
// Capability Score as heroes, then points (on the rule to the next level), rooms (with the learning
// paths), day streak, badges (the rarest named) and the global rank. Under both, THM activity since he
// joined, the year's totals and his top tools.
// Every piece is drawn only when its field is in data/thm.json and passes its check; nothing is drawn
// from example values. The static picture is the final state with the penetration tester web, so
// reduced motion and renderers without CSS animation show everything. CSS keyframes only, no script.
//
// Data: data/thm.json (by hand, or passed to the Action). Only inside the GitHub Action (GITHUB_ACTIONS
// =true and THM_LIVE=1) ONE request goes to THM's public-profile API; the core fields must be found and
// plausible, the rest of the file is carried over.
// usage: node thm.mjs [outDir]   (or THM_OUT=dir; without either, assets/thm-{dark,light}.svg)
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, ROOT, glyphRun, writeAsset, tidy, n, isMain } from './lib.mjs';

const USER = 'Sepd';
const API = `https://tryhackme.com/api/v2/public-profile?username=${encodeURIComponent(USER)}`;
const DATA = path.join(ROOT, 'data', 'thm.json');
const STALE_DAYS = 3;

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

// Which keys may carry which field in the live answer. Exact shapes only.
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

// The richer fields: each one checked on its own; a bad one is dropped (its piece is not drawn), never
// repaired. The live answer never fills them: they come from the file and are carried over.
const EXTRA = ['score', 'league', 'best_streak', 'points', 'next_level', 'since', 'path_now', 'paths_done', 'skills', 'badge_list', 'tools', 'activity'];
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const nameOf = (v, max = 40) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : undefined);
const scoreOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000 ? v : undefined);
const leagueOf = (v) => (typeof v === 'string' && /^\s*[A-Za-z]{3,16}\s*$/.test(v) ? v.trim().toLowerCase() : undefined);
const webOf = (v) => {
  if (!Array.isArray(v) || v.length < 3 || v.length > 12) return undefined;
  const ok = v.every((a) => Array.isArray(a) && nameOf(a[0]) && typeof a[1] === 'number' && a[1] >= 0 && a[1] <= 100);
  return ok ? v.map(([k, x]) => [k.trim(), x]) : undefined;
};
const activityOf = (v) => {
  if (!v || typeof v !== 'object' || !isDate(v.from) || !Array.isArray(v.days)) return undefined;
  if (v.days.length < 7 || v.days.length > 400 || !v.days.every((x) => Number.isInteger(x) && x >= 0)) return undefined;
  const t = v.totals && typeof v.totals === 'object' ? v.totals : {};
  // totals.rooms counts room events, not completed rooms: never read, it would contradict "rooms".
  const totals = Object.fromEntries(['questions', 'machines'].map((k) => [k, between(0, 1_000_000)(t[k])]).filter(([, x]) => x !== undefined));
  return { from: v.from, days: v.days, totals };
};
const nextLevelOf = (v, points) => {
  if (!v || typeof v !== 'object' || points == null) return undefined;
  const lv = levelOf(v.level), from = between(0, 100_000_000)(v.from), at = between(1, 100_000_000)(v.at);
  if (!lv || from === undefined || at === undefined || at <= from || points < from || points > at) return undefined;
  return { lv, title: titleOf(v.title) || null, from, at };
};
const badgeListOf = (v) => {
  if (!Array.isArray(v) || !v.length) return undefined;
  const ok = v.every((b) => Array.isArray(b) && nameOf(b[0]) && typeof b[1] === 'number' && b[1] > 0 && b[1] <= 100);
  return ok ? v.map(([t, r, dt]) => [t.trim(), r, isDate(dt) ? dt : null]) : undefined;
};

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
    if (!isDate(d.as_of)) bad.push('as_of');
    if (bad.length) { console.log(`thm: data/thm.json unusable (${bad.join(', ')})`); return null; }
    const best = between(0, 5000)(d.best_streak);
    const points = FIELDS.points.ok(d.points) ?? null;
    const skills = {};
    if (d.skills && typeof d.skills === 'object') for (const [k, v] of Object.entries(d.skills)) { const w = webOf(v); if (w) skills[k] = w; }
    const tools = Array.isArray(d.tools) ? d.tools.map((t) => nameOf(t, 24)).filter(Boolean).slice(0, 12) : [];
    const done = Array.isArray(d.paths_done) ? d.paths_done.filter((p) => Array.isArray(p) && nameOf(p[0])).map(([p, dt]) => [p.trim(), isDate(dt) ? dt : null]) : [];
    return {
      ...d, lv, title: titleOf(d.title) || null, top_percent: percentOf(d.top_percent) ?? null,
      score: scoreOf(d.score) ?? null, league: leagueOf(d.league) ?? null,
      best_streak: best !== undefined && best >= toInt(d.streak) ? best : null,   // a best under the current is a wrong field
      points, next_level: nextLevelOf(d.next_level, points) ?? null,
      since: typeof d.since === 'string' && /^\d{4}-\d{2}$/.test(d.since) ? d.since : null,
      path_now: nameOf(d.path_now) ?? null, paths_done: done,
      skills, badge_list: badgeListOf(d.badge_list) ?? null, tools,
      activity: activityOf(d.activity) ?? null,
    };
  } catch (e) {
    console.log(`thm: data/thm.json unreadable (${e.message})`);
    return null;
  }
}

const keep = (prev, why) => {
  console.log(`thm: kept data/thm.json (${prev.source}, ${prev.as_of}): ${why}`);
  return prev;
};

/** One request, only in the Action. Never throws; on any doubt returns `prev` unchanged. The fields the
 *  answer is not read for (skills, badges list, activity...) are carried over from the file as they are. */
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

    // Everything else in the file stays as it was (raw, not the checked copy), so nothing is lost.
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    const extra = Object.fromEntries(EXTRA.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]));
    if (found.points !== undefined) extra.points = found.points;
    // next_level belongs to the level: it goes when the level changes (the file must bring the new one).
    if (found.level !== prev.lv) delete extra.next_level;
    kept.push(...Object.keys(extra).filter((k) => !(k === 'points' && found.points !== undefined)));
    const next = {
      username: USER,
      level: levelLabel(found.level),
      title,
      rank: found.rank,
      top_percent: top,
      badges: found.badges,
      streak: found.streak,
      rooms: found.rooms,
      source: 'live',
      as_of: new Date().toISOString().slice(0, 10),
      ...extra,
      ...(kept.length ? { kept } : {}),
    };
    fs.writeFileSync(DATA, JSON.stringify(next, null, 2) + '\n');
    console.log(`thm: wrote data/thm.json (live ${next.as_of})${kept.length ? '; kept from before: ' + kept.join(', ') : ''}`);
    return readData() || prev;
  } catch (e) {
    return keep(prev, `could not read the answer (${e.name}: ${String(e.message).slice(0, 100)})`);
  }
}

// ---------- drawing ----------
// Same scale and margins as the cards above (1 unit here is 1 unit there). The dial lives left of the
// gutter between the portrait and the card (JOINT); the readouts start right of it, on a three-line grid:
// names on the left edge, marks from M0, numbers on the right edge. Green means what it means everywhere
// on the page: now (today's cell and day, the path in progress) and where he stands (the cross-marks on
// the dial, the marker on the rank and on the points rule).
const W = 1045, R = 8;
const X0 = 20, X1 = W - 20, JOINT = 522.5;
const NUM = 18, HERO = 32, LAB = 10, VAL = 16;
// Phones: the panel is ~355 px wide (1 unit ≈ 0.34 px), so 26 units read at ~9 px, as in the strip.
const MOB = 26;
const HT = 262;                                                  // dial and readouts
const ACT_RAIL = 30, ACT_FOOT = 40;                              // the activity band under them
const DIAL = { cx: 266, cy: 150, R: 100, r0: 13 };
const C0 = JOINT + 25.5, M0 = C0 + 104, M1 = X1 - 112;           // readouts grid
const HY = 50;                                                   // hero baseline; TryHackMe sits on it
const ROW0 = 112, PITCH = 34;
const SLOT = 4;                                                  // seconds per web
const LAND = 'cubic-bezier(.2,.8,.2,1)', RISE = 'cubic-bezier(.2,.85,.25,1.06)';
const T0 = 0.8;

// The webs in THM's order, with the name THM gives each tab.
const WEBS = [['foundational', 'foundational'], ['analyst', 'security analyst'], ['pentester', 'penetration tester'], ['engineer', 'security engineer']];
const STILL = 'pentester';

// Axis names: short on desktop; on a phone the first that fits its side is used.
const NAMES = {
  'security operations': ['sec ops', ['sec ops', 'SOC']],
  'incident response': ['incident resp', ['incident', 'IR']],
  'malware analysis': ['malware', ['malware', 'MAL']],
  'penetration testing': ['pentest', ['pentest', 'PT']],
  'exploitation': ['exploit', ['exploit', 'EXP']],
  'red teaming': ['red team', ['red team', 'RT']],
  'enumeration': ['enum', ['enum']],
  'privilege escalation': ['privesc', ['privesc', 'PE']],
  'vulnerability analysis': ['vuln analysis', ['vuln']],
  'security analysis': ['sec analysis', ['analysis', 'SA']],
  'digital forensics': ['forensics', ['forensics', 'DF']],
  'threat hunting': ['threat hunting', ['hunting', 'TH']],
  'detection engineering': ['detection eng', ['detection', 'DE']],
  'security architecture': ['architecture', ['architecture', 'arch']],
  'threat management': ['threat mgmt', ['threat', 'TM']],
  'identity security': ['identity', ['identity', 'ID']],
  'security automation': ['automation', ['automation', 'auto']],
};
const namesOf = (full) => {
  const k = full.toLowerCase();
  if (NAMES[k]) return NAMES[k];
  const words = k.split(/\s+/);
  return [k.length <= 14 ? k : words[0].slice(0, 14), [words[0].slice(0, 9), words.map((w) => w[0]).join('').toUpperCase()]];
};
const fmtNum = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
const pct = (v) => `${n(v * 100, 2)}%`;

export function draw(d, today, { still = STILL } = {}) {
  const defs = new Map();
  const glyph = (ch, S) => {
    const key = `${S}_${ch}`;
    if (!defs.has(key)) defs.set(key, { id: 'g' + defs.size.toString(36), d: glyphRun(ch, 0, 0, S, { prec: 1 })[0].d });
    return defs.get(key).id;
  };
  const masks = new Set();
  const keyframes = new Map();                                  // the web cycle's keyframes, by window
  let last = 0;
  const settle = (t) => { last = Math.max(last, t); };

  /** Odometer (the strip's): one masked column per digit, rolling up from blank to the digit. */
  function odometer(str, x, y, S, t0) {
    masks.add(S);
    const digits = [...str].filter((c) => /\d/.test(c));
    const value = Number(digits.join(''));
    let cx = x, di = 0, out = '';
    for (const ch of str) {
      if (!/\d/.test(ch)) { out += `<use class="n" href="#${glyph(ch, S)}" x="${n(cx, 2)}" y="${n(y, 2)}"/>`; cx += 0.6 * S; continue; }
      const pos = digits.length - 1 - di;
      const turns = pos === 0 && value >= 10 ? 1 : 0;
      const stop = turns * 10 + Number(ch);
      let strip = '';
      for (let j = 0; j <= stop; j++) strip += `<use href="#${glyph(String(j % 10), S)}" y="${j * S}"/>`;
      const delay = n(t0 + 0.06 * di, 2), dur = n(0.8 + 0.15 * turns, 2);
      settle(delay + dur);
      out += `<g transform="translate(${n(cx, 2)} ${n(y, 2)})" mask="url(#k${S})"><g class="o n" style="--s:${S}px;transform:translateY(-${stop * S}px);animation-duration:${dur}s;animation-delay:${delay}s">${strip}</g></g>`;
      cx += 0.6 * S; di++;
    }
    return { svg: out, end: cx };
  }
  const wid = (str, S) => [...str].length * 0.6 * S;               // monospace advance

  const parts = [];
  // Text as <use> of one glyph per size (the font is monospace and unkerned, as textPath draws it).
  const text = (cls, s, x, y, size, { track = 0, align = 'start' } = {}, into = parts) => {
    const chars = [...s], adv = 0.6 * size + track, width = chars.length * adv - track;
    let cx = align === 'end' ? x - width : align === 'middle' ? x - width / 2 : x, g = '';
    for (const ch of chars) { if (ch !== ' ') g += `<use href="#${glyph(ch, size)}" x="${n(cx, 1)}"/>`; cx += adv; }
    into.push(`<g class="${cls}" transform="translate(0 ${n(y, 2)})">${g}</g>`);
    return { width };
  };
  const rise = (delay) => { settle(delay + 0.45); return `style="animation-delay:${n(delay, 3)}s"`; };
  const both = (fn) => { parts.push('<g class="dk">'); fn(false); parts.push('</g><g class="mb">'); fn(true); parts.push('</g>'); };

  const webs = WEBS.filter(([k]) => d.skills && d.skills[k]);
  const K = webs.length;
  const shown = webs.some(([k]) => k === still) ? still : K ? webs[0][0] : null;
  const act = d.activity || null;
  const H = HT + (act ? ACT_RAIL + ACT_FOOT : 0);
  const col0 = K ? C0 : X0, m0 = K ? M0 : X0 + 104;

  // The web cycle: K slots of SLOT seconds. Whatever is visible over slots [a..b] fades in over 0.5 s at
  // the start of its window and out across the start of the next one, so two webs crossfade. Each window
  // is a class in the stylesheet (never an inline style, so reduced motion can switch it off). The
  // static state (no animation) is the `still` web: its pieces carry class "on".
  const CYC = SLOT * K;
  const rules = new Map();
  const cyc = (a, b) => {
    const span = (b - a + 1) / K, f = 0.5 / CYC;
    const kf = `v${b - a + 1}`, cls = `c${a}${b}`;
    if (!keyframes.has(kf)) {
      const p = (x) => `${n(x * 100, 3)}%`;
      keyframes.set(kf, `@keyframes ${kf}{0%{opacity:0}${p(f)}{opacity:1}${p(span - f / 2)}{opacity:1}${p(span + f / 2)},100%{opacity:0}}`);
    }
    rules.set(cls, `.${cls}{animation:${kf} ${CYC}s linear ${n(T0 + a * SLOT, 2)}s infinite backwards}`);
    return cls;
  };
  const cycling = K > 1;

  // ---------- the dial ----------
  if (K) {
    const { cx, cy, R: RR, r0 } = DIAL;
    const geo = (N) => {
      const ang = (i) => ((-90 - 180 / N + (i * 360) / N) * Math.PI) / 180;
      const rad = (v) => r0 + ((RR - r0) * v) / 100;
      const pt = (i, r) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
      const ring = (r) => 'M' + Array.from({ length: N }, (_, i) => pt(i, r).map((v) => n(v, 2)).join(' ')).join('L') + 'z';
      return { ang, rad, pt, ring };
    };

    // Tabs: the four names THM gives its webs, the one in view in ink and underlined (desktop).
    {
      let x = X0;
      for (const [k, label] of webs) {
        const w = wid(label, LAB) + 0.3 * (label.length - 1);
        text('mu sm dk', label, x, 26, LAB, { track: 0.3 });
        const i = webs.findIndex(([kk]) => kk === k);
        parts.push(`<g class="w${k === shown ? ' on' : ''}${cycling ? ' ' + cyc(i, i) : ''} dk">`);
        text('ink', label, x, 26, LAB, { track: 0.3 });
        parts.push(`<path class="ul" d="M${n(x)} 31.5h${n(w)}"/></g>`);
        x += w + 22;
      }
    }

    // Grids: one per number of axes, shown over the slots of the webs that use it, so the hexagon stays
    // still while three six-axis webs pass and turns into a pentagon for the five-axis one. Rules, a ring
    // at 100, a dotted ring at 50, short marks at 25 and 75, and the hub where zero sits.
    const byN = new Map();
    webs.forEach(([k], i) => { const N = d.skills[k].length; if (!byN.has(N)) byN.set(N, []); byN.get(N).push(i); });
    for (const [N, slots] of byN) {
      const { ang, rad, pt, ring } = geo(N);
      let rulePath = '', marks = '';
      for (let i = 0; i < N; i++) {
        const a = ang(i), px = -Math.sin(a), py = Math.cos(a);
        const [ax, ay] = pt(i, r0), [bx, by] = pt(i, RR + 4);
        rulePath += `M${n(ax, 2)} ${n(ay, 2)}L${n(bx, 2)} ${n(by, 2)}`;
        for (const v of [25, 75]) {
          const [tx, ty] = pt(i, rad(v)), h = 2.2;
          marks += `M${n(tx - px * h, 2)} ${n(ty - py * h, 2)}L${n(tx + px * h, 2)} ${n(ty + py * h, 2)}`;
        }
      }
      // Contiguous runs of slots (with THM's order the six-axis webs are 0..2; anything else still works).
      const runs = [];
      for (const s of slots) { const r = runs[runs.length - 1]; if (r && r[1] === s - 1) r[1] = s; else runs.push([s, s]); }
      const all = slots.length === K;                              // one shape for every web: never fades
      for (const [a, b] of runs) {
        const on = all || webs.slice(a, b + 1).some(([k]) => k === shown);
        parts.push(`<g class="w${on ? ' on' : ''}${cycling && !all ? ' ' + cyc(a, b) : ''}">`);
        parts.push(`<path class="rg" d="${ring(rad(100))}"/><path class="rg rd" d="${ring(rad(50))}"/><path class="hub" d="${ring(r0)}"/>`);
        parts.push(`<path class="ru" d="${rulePath}"/><path class="gm" d="${marks}"/></g>`);
      }
    }

    // One group per web: its trace (drawn by the pen at the start of its slot, then still), the green
    // cross-marks, the readings at the tips and, on a phone, its name (the tabs do not fit there).
    webs.forEach(([k, label], wi) => {
      const axes = d.skills[k], N = axes.length;
      const { ang, rad, pt } = geo(N);
      const g = [];
      const V = axes.map(([, v], i) => pt(i, rad(v)));
      const poly = 'M' + V.map(([x, y]) => `${n(x, 2)} ${n(y, 2)}`).join('L') + 'z';
      g.push(`<path class="tr" pathLength="1"${cycling ? ` style="animation-delay:${n(T0 + wi * SLOT, 2)}s"` : ''} d="${poly}"/>`);
      let cb = '';
      V.forEach(([x1, y1], i) => {
        const a = ang(i), px = -Math.sin(a), py = Math.cos(a), h = 4.5;
        cb += `M${n(x1 - px * h, 2)} ${n(y1 - py * h, 2)}L${n(x1 + px * h, 2)} ${n(y1 + py * h, 2)}`;
      });
      g.push(`<path class="cb"${cycling ? ` style="animation-delay:${n(T0 + wi * SLOT, 2)}s"` : ''} d="${cb}"/>`);
      for (let i = 0; i < N; i++) {
        const a = ang(i), ux = Math.cos(a), uy = Math.sin(a);
        const [tx, ty] = pt(i, RR + 9);
        const side = ux < -0.3 ? 'l' : 'r';                       // an upright rule writes to its right
        const val = fmtNum(axes[i][1]);
        const [desk, mobs] = namesOf(axes[i][0]);
        for (const mob of [false, true]) {
          const S = mob ? MOB : VAL, L = mob ? MOB : LAB, gap = mob ? 7 : 5;
          const x0 = Math.abs(ux) <= 0.3 ? tx + 5 : tx;
          const room = side === 'l' ? x0 - X0 : col0 - 12 - x0;
          const name = mob ? mobs.find((m) => wid(m, L) + gap + wid(val, S) <= room) || mobs[mobs.length - 1] : desk;
          const vw = wid(val, S), nw = wid(name, L);
          const y = ty + (Math.abs(ux) <= 0.3 ? (uy > 0 ? 0.73 * S * 0.5 : 0) : 0.36 * S);
          const vx = side === 'r' ? x0 : x0 - vw, nx = side === 'r' ? x0 + vw + gap : x0 - vw - gap - nw;
          const cls = mob ? 'mb' : 'dk';
          g.push(`<g class="${cls}">`);
          text('n', val, vx, y, S, {}, g);
          text('mu', name, nx, y, L, {}, g);
          g.push('</g>');
        }
      }
      if (K > 1) text('ink mb', label, X0, 30, MOB, { track: -0.5 }, g);
      parts.push(`<g class="w${k === shown ? ' on' : ''}${cycling ? ' ' + cyc(wi, wi) : ''}">${g.join('')}</g>`);
    });
    if (cycling) settle(T0 + 0.5); else settle(T0);
  }

  // ---------- the readouts ----------
  // Where it comes from, as in the strip: "TryHackMe" in ink, top right, on the hero baseline.
  const tag = text('ink dk', 'TryHackMe', X1, HY, 16, { align: 'end', track: 0.2 });
  text('ink mb', 'TryHackMe', X1, HY, MOB, { align: 'end', track: -0.5 });
  const age = (Date.parse(today) - Date.parse(d.as_of)) / 864e5;
  if (age > STALE_DAYS) text('mu xs', d.as_of.replaceAll('-', '.'), X1 - tag.width - 12, HY, LAB, { align: 'end', track: 0.5 });

  // Heroes: the level in hex ("0x" muted, the digit in ink, still from the first frame) and the
  // Capability Score on the marks' line, each with its name under it.
  const heroName = (desk, mob, x) => { text('mu sm dk', desk, x, HY + 17, LAB, { track: 0.3 }); text('mu mb', mob, x, HY + 29, MOB, { track: -0.5 }); };
  {
    const lvs = d.lv.toString(16).toUpperCase();
    const hx = col0 + 0.9 - 0.068 * HERO;
    const w0 = text('mu', '0x', hx, HY, HERO).width;
    text('ink', lvs, hx + w0 + 0.6, HY, HERO);
    heroName(d.title ? `level · ${d.title.toLowerCase()}` : 'level', 'level', col0);
    if (d.score != null) {
      parts.push(odometer(fmtNum(d.score), m0, HY, HERO, T0).svg);
      heroName(`capability score${d.league ? ` · ${d.league} league` : ''}`, `score${d.league ? ` · ${d.league}` : ''}`, m0);
    }
  }

  // Rows: name on the left edge, mark from M0, number on the right edge, one baseline per row.
  const rows = [];
  if (d.points != null) rows.push('points');
  rows.push('rooms', 'streak', 'badges', 'rank');
  const rowY = (k) => ROW0 + rows.indexOf(k) * PITCH;
  const rowName = (desk, mob, y) => { text('mu sm dk', desk, col0, y, LAB, { track: 0.3 }); text('mu mb', mob, col0, y, MOB, { track: -0.5 }); };
  const rowNum = (str, y, t) => both((mob) => { const S = mob ? MOB : NUM; parts.push(odometer(str, X1 - wid(str, S), y, S, t).svg); });
  /** A 0..1 rule from m0 to M1 with the stretch behind the marker filled and a green marker sliding in. */
  const gauge = (y, f, t, ticks = []) => {
    const ax = m0 + 3, aw = M1 - ax, px = ax + aw * Math.min(1, Math.max(0, f));
    parts.push(`<path class="rail" d="M${n(m0)} ${y}H${n(M1)}M${n(m0)} ${y}v4M${n(M1)} ${y}v4"/>`);
    if (ticks.length) parts.push(`<path class="ax" d="${ticks.map((v) => `M${n(ax + aw * v)} ${y}v-3`).join('')}"/>`);
    const mT = n(t + 0.85, 2), mD = 0.9;
    parts.push(`<path class="fill" style="animation-delay:${mT}s" d="M${n(ax)} ${y}H${n(px)}"/>`);
    parts.push(`<path class="mk" style="--dx:${n(ax - px)}px;animation-delay:${mT}s" d="M${n(px - 3.5)} ${y - 12}h7l-3.5 5z"/>`);
    settle(mT + mD);
    return { px, ax, mT: mT + mD };
  };

  // Points: the number, and on the rule from this level's floor to the next level's mark, where he is.
  if (d.points != null) {
    const y = rowY('points'), t = T0 + 0.15;
    rowName('points', 'points', y);
    rowNum(String(d.points), y, t);
    const nl = d.next_level;
    if (nl) {
      const g = gauge(y, (d.points - nl.from) / (nl.at - nl.from), t);
      const nx = `0x${nl.lv.toString(16).toUpperCase()}`;
      parts.push(`<g class="tp" style="animation-delay:${n(g.mT - 0.1, 2)}s">`);
      text('mu dk', `${nx}${nl.title ? ' ' + nl.title.toLowerCase() : ''} at ${nl.at}`, M1, y - 6, LAB, { align: 'end', track: 0.3 });
      parts.push('</g>');
    }
  }

  // Rooms, and the learning paths they add up to: each finished path a solid node, the one in progress
  // an open green node (now), joined by the rule (desktop; their names do not fit on a phone).
  {
    const y = rowY('rooms'), t = T0 + 0.3;
    rowName('rooms', 'rooms', y);
    rowNum(String(d.rooms), y, t);
    const steps = [...d.paths_done.map(([p]) => [p, true]), ...(d.path_now ? [[d.path_now, false]] : [])];
    if (steps.length) {
      // Fit from the end: the path in progress and as many finished ones as there is room for.
      const NODE = 9, LINK = 26;
      const fit = [];
      let w = 0;
      for (let i = steps.length - 1; i >= 0; i--) {
        const sw = NODE + wid(steps[i][0].toLowerCase(), LAB) + (fit.length ? LINK : 0);
        if (w + sw > M1 - m0) break;
        fit.unshift(steps[i]); w += sw;
      }
      let x = m0 + 3, s = '';
      parts.push(`<g class="tp dk" style="animation-delay:${n(t + 0.5, 2)}s">`);
      fit.forEach(([p, done], i) => {
        const cy = y - 4;
        s += done ? `<circle class="nd" cx="${n(x + 3)}" cy="${cy}" r="3"/>` : `<circle class="nn" cx="${n(x + 3)}" cy="${cy}" r="2.6"/>`;
        x += NODE;
        text(done ? 'mu' : 'ink', p.toLowerCase(), x, y, LAB);
        x += wid(p.toLowerCase(), LAB);
        if (i < fit.length - 1) { s += `<path class="lk" d="M${n(x + 6)} ${cy}h${LINK - 12}"/>`; x += LINK; }
      });
      parts.push(s, '</g>');
    }
  }

  // Day streak: the last four weeks as day cells, today green with the dashed stem; the best beside it.
  {
    const y = rowY('streak'), t = T0 + 0.45, WIN = 28;
    const P = Math.min(9.5, (M1 - m0 - 3) / WIN), C = n(P * 0.68, 2);
    const lit = Math.min(d.streak, WIN);
    let s = '';
    for (let i = 0; i < WIN; i++) {
      const cx = n(m0 + 3 + i * P + (P - C) / 2, 2), k = i - (WIN - lit);
      if (k < 0) { s += `<rect class="cd rz" style="animation-delay:${n(t + 0.5, 3)}s" x="${cx}" y="${n(y - C, 2)}" width="${C}" height="${C}" rx=".8"/>`; continue; }
      s += `<rect class="${i === WIN - 1 ? 'ct' : 'cl'} rz" ${rise(t + 0.5 + k * 0.03)} x="${cx}" y="${n(y - C, 2)}" width="${C}" height="${C}" rx=".8"/>`;
    }
    if (lit) {
      const sx = n(m0 + 3 + (WIN - 1) * P + P / 2, 2), top = n(y - C - 2, 2);
      s += `<path class="stem rz" ${rise(t + 0.5 + lit * 0.03 + 0.1)} d="M${sx} ${top}V${n(top - 8, 2)}"/>`;
    }
    parts.push(s);
    rowName('day streak', 'streak', y);
    rowNum(String(d.streak), y, t);
    if (d.best_streak != null) {
      const bs = String(d.best_streak), bx = X1 - wid(String(d.streak), NUM) - 12;
      parts.push(`<g class="tp xs" style="animation-delay:${n(t + 0.6, 2)}s">`);
      text('n', bs, bx, y, LAB, { align: 'end' });
      text('mu', 'best ', bx - wid(bs, LAB), y, LAB, { align: 'end' });
      parts.push('</g>');
    }
  }

  // Badges: one flat-topped hexagon each, in the order he earned them, packed as honeycomb. With the
  // list, the rarest is the solid one (the rest in outline) and its name and rarity follow the comb.
  {
    const y = rowY('badges'), t = T0 + 0.6, avail = M1 - m0 - 3;
    const list = d.badge_list && d.badge_list.length === d.badges ? d.badge_list : null;
    const rarest = list ? list.reduce((a, b, i) => (b[1] < list[a][1] ? i : a), 0) : -1;
    let r = 5.2;
    const fits = (rr) => Math.floor((avail - 2 * rr) / (1.5 * rr)) + 1;
    if (d.badges > fits(r)) r = Math.max(3, avail / (1.5 * (d.badges - 1) + 2));
    const show = Math.min(d.badges, fits(r));
    const h = Math.sqrt(3) * r, rd = r - 0.7;
    const hex = (cx, cy) => 'M' + [0, 1, 2, 3, 4, 5].map((k) => { const a = (Math.PI / 3) * k; return `${n(cx + rd * Math.cos(a), 2)} ${n(cy + rd * Math.sin(a), 2)}`; }).join('L') + 'z';
    let s = '';
    for (let i = 0; i < show; i++) {
      const cy = y - h / 2 - (i % 2 ? h / 2 : 0);
      const cls = list ? (i === rarest ? 'hx' : 'ho') : 'hx';
      s += `<path class="${cls} rz" ${rise(t + 0.5 + i * 0.05)} d="${hex(m0 + 3 + r + i * 1.5 * r, cy)}"/>`;
    }
    parts.push(s);
    if (rarest >= 0 && rarest < show) {
      const [bt, br] = list[rarest];
      const x = m0 + 3 + (1.5 * (show - 1) + 2) * r + 12;
      const words = `${bt.toLowerCase()} ${fmtNum(br)}%`;
      if (x + wid('rarest ' + words, LAB) <= M1) {
        parts.push(`<g class="tp xs" style="animation-delay:${n(t + 0.5 + show * 0.05, 2)}s">`);
        const w1 = text('mu', 'rarest ', x, y, LAB).width;
        text('n', bt.toLowerCase(), x + w1, y, LAB);
        text('mu', ` ${fmtNum(br)}%`, x + w1 + wid(bt, LAB), y, LAB);
        parts.push('</g>');
      }
    }
    rowName('badges', 'badges', y);
    rowNum(String(d.badges), y, t);
  }

  // Global rank: the share he is ahead of on a 0-100 % rule, top on the right; the raw rank by the marker.
  {
    const y = rowY('rank'), t = T0 + 0.75;
    rowName('global rank', 'rank', y);
    const top = d.top_percent;
    if (top != null) {
      both((mob) => {
        const S = mob ? MOB : NUM, str = `top ${top}%`, x = X1 - wid(str, S);
        parts.push(`<g class="tp" style="animation-delay:${n(t, 2)}s">`);
        text('mu', 'top ', x, y, S);
        const o = odometer(String(top), x + wid('top ', S), y, S, t);
        text('mu', '%', o.end, y, S);
        parts.push('</g>', o.svg);
      });
      const g = gauge(y, (100 - top) / 100, t, [0.5]);
      const rk = `#${d.rank}`, rw = wid(rk, LAB) + 0.5 * (rk.length - 1);
      const lx = g.px - 7 - rw >= g.ax + 2 ? g.px - 7 - rw : g.px + 7;
      parts.push(`<g class="tp xs" style="animation-delay:${n(g.mT - 0.05, 2)}s">`);
      text('mu', rk, lx, y - 6, LAB, { track: 0.5 });
      parts.push('</g>');
      settle(g.mT + 0.3);
    } else {
      both((mob) => {
        const S = mob ? MOB : NUM, str = String(d.rank), x = X1 - wid('#' + str, S);
        text('mu', '#', x, y, S);
        parts.push(odometer(str, x + 0.6 * S, y, S, t).svg);
      });
    }
  }

  // ---------- activity since he joined ----------
  // One stroke per day on a square-root scale (a 132-day does not flatten the 2s), zero days empty on the
  // rail, the last day green when it is today. The band starts at the month he joined (or at the first
  // active day, if that is earlier), so months before he was a member do not take the width. On its left,
  // a small key: the year's totals and the start; under it, his top tools in one quiet line.
  if (act) {
    const AY = HT + ACT_RAIL, SX = 200;
    const day0 = Date.parse(act.from);
    const dateOf = (i) => new Date(day0 + i * 864e5).toISOString().slice(0, 10);
    let start = 0;
    const firstActive = act.days.findIndex((c) => c > 0);
    if (d.since) {
      const s = Math.round((Date.parse(d.since + '-01') - day0) / 864e5);
      start = Math.max(0, Math.min(s, firstActive < 0 ? s : firstActive));
    } else if (firstActive > 0) {
      start = Math.round((Date.parse(dateOf(firstActive).slice(0, 7) + '-01') - day0) / 864e5);
      start = Math.max(0, start);
    }
    const days = act.days.slice(start), N = days.length, P = (X1 - SX) / N;
    const max = Math.max(1, ...days);
    const isToday = dateOf(act.days.length - 1) === d.as_of;
    const t = T0 + 1.1;
    let bars = '', ticks = '';
    for (let i = 0; i < N; i++) {
      const x = n(SX + (i + 0.5) * P, 2), c = days[i];
      const now = isToday && i === N - 1;
      if (c > 0 || now) {
        const h = c > 0 ? n(2 + 15 * Math.sqrt(c / max), 2) : 3;
        bars += `<path class="${now ? 'at' : 'ab'} rz" ${rise(t + i * 0.005)} d="M${x} ${AY}v-${h}"/>`;
      }
      const ds = dateOf(start + i);
      if (ds.endsWith('-01')) {
        const mx = n(SX + i * P, 2);
        if (i > 0) ticks += `M${mx} ${AY}v4`;
        text('mu sm dk', ds.slice(5, 7), mx + 2, AY + 13, LAB, { track: 0.3 });
        text('mu mb', ds.slice(5, 7), mx + 2, AY + 27, MOB, { track: -0.5 });
      }
    }
    parts.push(`<path class="rail" d="M${SX} ${AY}H${X1}M${SX} ${AY}v4${ticks}"/>`, bars);

    // The key: numbers right-aligned on one edge, words after it.
    const KX = 56, key = [];
    if (act.totals.questions != null) key.push([String(act.totals.questions), 'questions']);
    if (act.totals.machines != null) key.push([String(act.totals.machines), 'machines']);
    const ys = key.length === 2 ? [AY - 20, AY - 4] : [AY - 4];
    key.forEach(([v, w], i) => { text('n dk', v, KX - 6, ys[i], 14, { align: 'end' }); text('mu dk', w, KX, ys[i], LAB, { track: 0.3 }); });
    const sinceStr = (d.since || dateOf(start).slice(0, 7)).replace('-', '.');
    text('mu dk', 'since', KX - 6, AY + 13, LAB, { align: 'end' });
    text('n dk', sinceStr, KX, AY + 13, LAB, { track: 0.3 });
    text('mu mb', 'since', X0, AY - 4, MOB, { track: -0.5 });
    text('n mb', sinceStr, X0, AY + 27, MOB, { track: -0.5 });
    if (d.tools.length) {
      text('mu dk', 'tools', KX - 6, AY + 31, LAB, { align: 'end' });
      text('mu dk', d.tools.map((x) => x.toLowerCase()).join(' · '), KX, AY + 31, LAB, { track: 0.3 });
    }
  }

  const sk = K ? '; skills: ' + webs.map(([k, label]) => `${label} (${d.skills[k].map(([a, v]) => `${a} ${fmtNum(v)}`).join(', ')})`).join('; ') : '';
  const rarestB = d.badge_list ? d.badge_list.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
  const label = [
    `TryHackMe: level 0x${d.lv.toString(16).toUpperCase()}${d.title ? ' ' + d.title : ''}`,
    d.score != null ? `capability score ${fmtNum(d.score)}${d.league ? ' (' + d.league + ' league)' : ''}` : '',
    d.points != null ? `${d.points} points${d.next_level ? ` (next level at ${d.next_level.at})` : ''}` : '',
    `${d.rooms} rooms`,
    d.paths_done.length ? `paths done: ${d.paths_done.map(([p]) => p).join(', ')}` : '',
    d.path_now ? `in progress: ${d.path_now}` : '',
    `${d.streak}-day streak${d.best_streak != null ? ` (best ${d.best_streak})` : ''}`,
    `${d.badges} badges${rarestB ? ` (rarest ${rarestB[0]}, ${fmtNum(rarestB[1])}%)` : ''}`,
    `rank ${d.rank}${d.top_percent != null ? ` (top ${d.top_percent}%)` : ''}`,
    act && act.totals.questions != null ? `${act.totals.questions} questions` : '',
    act && act.totals.machines != null ? `${act.totals.machines} machines` : '',
    d.since ? `since ${d.since}` : '',
    d.tools.length ? `tools: ${d.tools.join(', ')}` : '',
  ].filter(Boolean).join(', ') + sk + `; as of ${d.as_of}`;
  const maskDefs = [...masks].map((S) => {
    const y0 = n(-1.0 * S), hh = n(1.22 * S);
    return `<mask id="k${S}" maskUnits="userSpaceOnUse" x="-2" y="${y0}" width="${n(0.6 * S + 4)}" height="${hh}"><rect x="-2" y="${y0}" width="${n(0.6 * S + 4)}" height="${hh}" fill="url(#fade)"/></mask>`;
  }).join('');

  // The pen and the cross-marks replay at the start of every slot: same keyframes, same cycle.
  const penAt = (s) => `${n((s / Math.max(CYC, 1)) * 100, 3)}%`;
  const out = {};
  for (const [name, c] of Object.entries(THEMES)) {
    const ink = (o) => `fill:${c.ink};fill-opacity:${name === 'light' ? o.l : o.d}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">
<style>
.frame{fill:none;stroke:${c.faint}}
.mu{fill:${c.muted}}.ink,.n{fill:${c.ink}}
.rail,.ax{fill:none;stroke:${c.line};stroke-width:1}
.w{opacity:0}.w.on{opacity:1}
.ul{fill:none;stroke:${c.ink};stroke-width:1.2}
.rg{fill:none;stroke:${c.faint};stroke-width:1}.rd{stroke-dasharray:1 3}
.hub{fill:none;stroke:${c.line};stroke-width:.8}
.ru{fill:none;stroke:${c.faint};stroke-width:1}
.gm{fill:none;stroke:${c.line};stroke-width:.9}
.tr{fill:none;stroke:${c.ink};stroke-width:1.6;stroke-linejoin:round${cycling ? `;animation:pen ${CYC}s linear infinite backwards` : ''}}
.cb{fill:none;stroke:${c.acc};stroke-width:2.2;stroke-linecap:round${cycling ? `;animation:cbin ${CYC}s linear infinite backwards` : ''}}
.o{animation:roll .9s ${LAND} backwards}
.rz{transform-box:fill-box;transform-origin:50% 100%;animation:rise .45s ${RISE} backwards}
.cl{${ink({ l: 0.8, d: 0.88 })}}.ct{fill:${c.acc}}
.cd{fill:${c.faint}}
.stem{fill:none;stroke:${c.acc};stroke-width:1;stroke-dasharray:1.5 2}
.hx{${ink({ l: 0.85, d: 0.92 })}}.ho{fill:none;stroke:${c.muted};stroke-width:1}
.nd{fill:${c.muted}}.nn{fill:none;stroke:${c.acc};stroke-width:1.6}.lk{fill:none;stroke:${c.line};stroke-width:1}
.ab{fill:none;stroke:${c.ink};stroke-opacity:${name === 'light' ? 0.75 : 0.8};stroke-width:1.6}
.at{fill:none;stroke:${c.acc};stroke-width:2}
.fill{fill:none;stroke:${c.edge};stroke-width:1.5;transform-box:fill-box;transform-origin:0 50%;animation:grow .9s ${LAND} backwards}
.mk{fill:${c.acc};animation:slide .9s ${LAND} backwards}
.tp{animation:in .3s ease-out backwards}
@keyframes roll{from{transform:translateY(var(--s))}}
@keyframes rise{from{transform:scaleY(0)}}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes slide{0%{opacity:0;transform:translateX(var(--dx))}10%{opacity:1}}
@keyframes in{from{opacity:0}}
${[...keyframes.values(), ...rules.values()].join('\n')}
@keyframes pen{0%,${penAt(0.15)}{stroke-dasharray:1 1;stroke-dashoffset:1}${penAt(1.25)},100%{stroke-dasharray:1 1;stroke-dashoffset:0}}
@keyframes cbin{0%,${penAt(0.15)}{opacity:0}${penAt(1.25)},100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.o,.rz,.fill,.mk,.tp,.w,.tr,.cb{animation:none}}
.mb{display:none}
@media (max-width:600px){/*mb*/.xs,.dk{display:none}.mb{display:inline}.rail,.ax{stroke-width:2}.ru,.rg,.hub{stroke-width:1.6}.gm{stroke-width:1.6}.tr{stroke-width:3.2}.cb{stroke-width:4}.ab{stroke-width:2.6}.at{stroke-width:3}.ho{stroke-width:1.8}}/*/mb*/
</style>
<defs>${[...defs.values()].map((g) => `<path id="${g.id}" d="${g.d}"/>`).join('')}<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".16" stop-color="#fff"/><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>${maskDefs}</defs>
<rect class="frame" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${R}"/>
${parts.join('')}
</svg>`;
    out[name] = tidy(svg);
  }
  return { out, settle: n(last, 2), height: H, cycle: CYC, webs: webs.map(([k]) => k), still: shown };
}

/** Refresh (in the Action only), then draw. Never throws, so the rest of the profile always renders;
 *  on bad data the old SVGs stay. With a directory (argument or THM_OUT) the SVGs go there instead. */
export async function render(outDir = process.env.THM_OUT) {
  let d = readData();
  if (!d) { console.log('thm: nothing drawn; assets/thm-*.svg left as they were'); return; }
  try { d = await refresh(d); } catch (e) { console.log(`thm: refresh error ignored (${e.message})`); }
  const today = new Date().toISOString().slice(0, 10);
  let drawn;
  try { drawn = draw(d, today); } catch (e) { console.log(`thm: draw failed (${e.message}); assets/thm-*.svg left as they were`); return; }
  const { out, settle, height, cycle, webs, still } = drawn;
  for (const [name, svg] of Object.entries(out)) {
    if (!outDir) { writeAsset(`thm-${name}.svg`, svg); continue; }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `thm-${name}.svg`), svg);
    console.log(`wrote  thm-${name}.svg  ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB`);
  }
  console.log(`thm: ${d.source} ${d.as_of}; ${W}x${height}; webs ${webs.join(' > ') || 'none'} (${cycle}s cycle, still ${still}); settles at ${settle}s`);
}

if (isMain(import.meta.url)) render(process.argv[2] || process.env.THM_OUT);
