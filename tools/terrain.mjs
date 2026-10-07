// HERO: the last year of contributions as an engraved landscape seen through a perspective camera.
// The past recedes into the distance; the present stands closest. Empty days are survey dots on the
// plain; active days rise as hatched prisms (height = log2(1 + count)) with a lit cap. After the build
// wave, a survey beam crosses the ground every few seconds and the caps it touches catch the light.
import { THEMES, profile, textPath, glyphRun, writeAsset, tidy, n, isMain } from './lib.mjs';

const W = 960, H = 300;
const PAD = { l: 24, r: 44, t: 16, b: 40 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function camera(eye, target) {
  const f = norm(sub(target, eye)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
  return { eye, f, raw: (p) => { const d = sub(p, eye), z = dot(d, f); return [dot(d, r) / z, -dot(d, u) / z, z]; } };
}

export async function render() {
  const user = await profile();
  const cal = user.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap((w, wi) => w.contributionDays.map((d) => ({ ...d, wi })));
  const weeks = days[days.length - 1].wi + 1;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const last = days[days.length - 1];

  // World: X = week, Y = row (Saturday in front, Sunday at the back), Z = height.
  const inset = 0.2;
  const hk = 4.2 / Math.log2(1 + Math.max(max, 24)); // a quiet year never looks like a mountain range
  const heightOf = (c) => (c ? Math.max(0.15, hk * Math.log2(1 + c)) : 0);
  // Camera: eye x, eye y, eye z, target x, target y, target z (x as a fraction of the year). Overridable via CAM.
  const CAM = (process.env.CAM || '0.9,-45.5,34,0.58,3.5,0').split(',').map(Number);
  const cam = camera([weeks * CAM[0], CAM[1], CAM[2]], [weeks * CAM[3], CAM[4], CAM[5]]);
  // The far past is allowed to run out of frame on the left, into the fog.
  const FIT_FROM = Math.round(weeks * (+process.env.FIT_FROM || 0.2));
  const depthOf = (X) => dot(sub([X, 3.5, 0], cam.eye), cam.f);
  const dNear = depthOf(weeks), dFar = depthOf(0);
  const fog = (X) => n(1 - 0.88 * Math.min(1, Math.max(0, (depthOf(X) - dNear) / (dFar - dNear))) ** 1.3, 2);

  // Pass 1: everything that must fit, in raw camera space.
  const probe = [];
  for (const X of [FIT_FROM, weeks]) for (const Y of [-1.9, 7.35]) probe.push(cam.raw([X, Y, 0]));
  for (const d of days) if (d.contributionCount && d.wi >= FIT_FROM) probe.push(cam.raw([d.wi + 0.5, 6 - d.weekday + 0.5, heightOf(d.contributionCount) + 1.2]));
  { const l = days[days.length - 1]; probe.push(cam.raw([l.wi + 0.5, 6 - l.weekday + 0.5, Math.max(heightOf(l.contributionCount), heightOf(max)) + 1.4])); }
  const bx = [Math.min(...probe.map((p) => p[0])), Math.max(...probe.map((p) => p[0]))];
  const by = [Math.min(...probe.map((p) => p[1])), Math.max(...probe.map((p) => p[1]))];
  const bw = W - PAD.l - PAD.r, bh = H - PAD.t - PAD.b;
  const s = Math.min(bw / (bx[1] - bx[0]), bh / (by[1] - by[0]));
  const ox = PAD.l + (bw - (bx[1] - bx[0]) * s) / 2 - bx[0] * s;
  const oy = PAD.t + (bh - (by[1] - by[0]) * s) / 2 - by[0] * s;
  const P = (p) => { const q = cam.raw(p); return [ox + q[0] * s, oy + q[1] * s, q[2]]; };
  const pt = (p) => { const q = P(p); return `${n(q[0])} ${n(q[1])}`; };
  const poly = (ps) => 'M' + ps.map(pt).join('L') + 'Z';
  const seg = (a, b) => `M${pt(a)}L${pt(b)}`;

  // Timing.
  const BUILD = 1.8, BEAM_AT = BUILD + 1.2, BEAM_T = 3.4, PERIOD = 12;
  const waveDelay = (wi) => n(0.2 + BUILD * (wi / weeks), 3);
  const beamDelay = (x) => n(BEAM_AT + BEAM_T * (x / weeks), 3);

  // Ground: survey dots, grouped per week so the wave and the beam can address a column at once.
  const ground = [];
  for (let wi = 0; wi < weeks; wi++) {
    const dots = days.filter((d) => d.wi === wi && !d.contributionCount).map((d) => {
      const [px, py, z] = P([wi + 0.5, 6 - d.weekday + 0.5, 0]);
      return `<circle cx="${n(px)}" cy="${n(py)}" r="${n(Math.max(0.5, 26 / z * s / 1000 * 1.0 + 0.35), 2)}"/>`;
    });
    if (dots.length) ground.push(`<g class="w" fill-opacity="${fog(wi + 0.5)}" style="animation-delay:${waveDelay(wi)}s,${beamDelay(wi + 0.5)}s">${dots.join('')}</g>`);
  }
  const rungs = [];
  for (let wi = 0; wi <= weeks; wi++) rungs.push(`<path class="b" stroke-opacity="${fog(wi)}" style="animation-delay:${beamDelay(wi)}s" d="${seg([wi, -0.35, 0], [wi, 7.35, 0])}"/>`);

  // Prisms: opaque paper faces, engraved with vertical hatching (denser = darker side), lit cap.
  const sides = [[3, 2, [0, -1, 0], 4], [1, 2, [1, 0, 0], 7], [0, 3, [-1, 0, 0], 7], [0, 1, [0, 1, 0], 4]];
  const prisms = [];
  for (const d of days) {
    if (!d.contributionCount) continue;
    const X = d.wi, Y = 6 - d.weekday, h = heightOf(d.contributionCount);
    const a = X + inset, b = X + 1 - inset, c = Y + inset, e = Y + 1 - inset;
    const base = [[a, c, 0], [b, c, 0], [b, e, 0], [a, e, 0]];
    const top = base.map(([x, y]) => [x, y, h]);
    let faces = '', hatch = '';
    for (const [i, j, nrm, lines] of sides) {
      const mid = [(base[i][0] + base[j][0]) / 2, (base[i][1] + base[j][1]) / 2, h / 2];
      if (dot(nrm, sub(cam.eye, mid)) <= 0) continue;
      faces += poly([base[i], base[j], top[j], top[i]]);
      for (let k = 1; k < lines; k++) {
        const t = k / lines;
        hatch += seg(lerp(base[i], base[j], t), lerp(top[i], top[j], t));
      }
    }
    const lvl = Math.log2(1 + d.contributionCount) / Math.log2(1 + max);
    const [ax, ay] = P([X + 0.5, Y + 0.5, 0]);
    prisms.push({
      depth: dot(sub([X + 0.5, Y + 0.5, h / 2], cam.eye), cam.f),
      svg: `<g class="p" style="transform-origin:${n(ax)}px ${n(ay)}px;animation-delay:${waveDelay(X)}s">`
        + `<path class="f" d="${faces}"/><path class="hx" d="${hatch}"/>`
        + `<path class="t" style="fill-opacity:${n(0.12 + 0.7 * lvl, 2)}" d="${poly(top)}"/>`
        + `<path class="k" style="animation-delay:${beamDelay(X + 0.5)}s" d="${poly(top)}"/></g>`,
    });
  }
  prisms.sort((p, q) => q.depth - p.depth);

  // Ground frame: front rail with month ticks, faint back rail.
  const rail = seg([0, -0.6, 0], [weeks, -0.6, 0]);
  const back = seg([0, 7.35, 0], [weeks, 7.35, 0]);
  let ticks = '', labels = '', lastMonth = -1;
  for (const d of days) {
    const m = +d.date.slice(5, 7);
    if (m === lastMonth || d.weekday !== 0) continue;
    lastMonth = m;
    ticks += seg([d.wi, -0.6, 0], [d.wi, -1.1, 0]);
    const [lx, ly, z] = P([d.wi + 0.08, -1.75, 0]);
    const size = Math.max(5.5, Math.min(8, (s / z) * 0.36));
    labels += `<path fill-opacity="${fog(d.wi)}" d="${textPath(String(m).padStart(2, '0'), lx, ly + size * 0.36, size).d}"/>`;
  }

  // Today: a cursor stands above the last day of the calendar.
  const lh = heightOf(last.contributionCount);
  const [gx, gy] = P([last.wi + 0.5, 6 - last.weekday + 0.5, lh]);
  const [tx, ty] = P([last.wi + 0.5, 6 - last.weekday + 0.5, Math.max(lh, heightOf(max)) + 0.8]);

  // Type.
  const fmt = (iso) => iso.replaceAll('-', '.');
  const handle = glyphRun('sepd0x', PAD.l + 6, H - 18, 18, { track: -0.3 });
  const meta = textPath(`${fmt(days[0].date)} → ${fmt(last.date)}`, W - PAD.r - 6, 30, 8, { align: 'end', track: 0.6 });
  const count = textPath(String(cal.totalContributions), W - PAD.r - 6, 18, 8, { align: 'end', track: 0.7 });

  const out = {};
  for (const [name, c] of Object.entries(THEMES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="sepd0x: ${cal.totalContributions} contributions, ${days[0].date} to ${last.date}">
<style>
.rail{fill:none;stroke:url(#rg);stroke-width:1}
.lab,.meta{fill:${c.muted}}
.w{fill:${c.muted};opacity:0;animation:in .6s ease-out both,glint ${PERIOD}s linear infinite}
.b{stroke:${c.acc};stroke-width:1.2;stroke-linecap:round;opacity:0;animation:beam ${PERIOD}s linear infinite}
.p{transform-box:view-box;transform:scaleY(0);animation:rise 1s cubic-bezier(.2,.85,.25,1.06) both}
.f{fill:${c.paper};stroke:${c.edge};stroke-width:.7;stroke-linejoin:round}
.hx{fill:none;stroke:${c.hatch};stroke-width:.55}
.t{fill:${c.ink};stroke:${c.ink};stroke-width:.8;stroke-linejoin:round}
.k{fill:${c.acc};fill-opacity:.85;stroke:${c.accHi};stroke-width:1.2;stroke-linejoin:round;opacity:0;animation:beam ${PERIOD}s linear infinite}
.h{fill:${c.ink}}.z{fill:${c.acc}}
.stem{stroke:${c.acc};stroke-width:1;stroke-dasharray:2 2;opacity:0;animation:in .4s ease-out ${BUILD + 0.9}s forwards}
.cur{fill:${c.acc};stroke:${c.paper};stroke-width:1.5;paint-order:stroke;opacity:0;animation:in .01s ${BUILD + 0.9}s forwards,blink 1.1s steps(1) ${BUILD + 0.9}s infinite}
@keyframes rise{to{transform:scaleY(1)}}
@keyframes in{to{opacity:1}}
@keyframes glint{0%,100%{fill:${c.muted}}1%{fill:${c.accHi}}8%{fill:${c.muted}}}
@keyframes beam{0%{opacity:0}.6%{opacity:1}5%{opacity:0}100%{opacity:0}}
@keyframes blink{50%{fill-opacity:0}}
@media (prefers-reduced-motion:reduce){.p,.w,.b,.k,.cur,.stem{animation:none}.p{transform:none}.w,.cur,.stem{opacity:1}}
</style>
<defs><linearGradient id="rg" gradientUnits="userSpaceOnUse" x1="${n(P([0, 0, 0])[0])}" y1="0" x2="${n(P([weeks, 0, 0])[0])}" y2="0"><stop offset="0" stop-color="${c.faint}" stop-opacity=".1"/><stop offset=".6" stop-color="${c.faint}"/></linearGradient></defs>
<path class="rail" d="${rail}${back}${ticks}"/>
<g class="lab">${labels}</g>
${rungs.join('')}
${ground.join('')}
${prisms.map((p) => p.svg).join('')}
<path class="stem" d="M${n(gx)} ${n(gy)}L${n(tx)} ${n(ty)}"/>
<rect class="cur" x="${n(tx - 3)}" y="${n(ty - 8)}" width="6" height="8"/>
${handle.map((g) => `<path class="${g.ch === '0' ? 'z' : 'h'}" d="${g.d}"/>`).join('')}
<path class="meta" d="${meta.d}${count.d}"/>
</svg>`;
    out[name] = tidy(svg);
    writeAsset(`terrain-${name}.svg`, out[name]);
  }
  return out;
}

if (isMain(import.meta.url)) render();
