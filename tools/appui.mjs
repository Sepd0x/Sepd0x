// APPUI: the cs2-ip-changer Connection tab drawn as vectors (crisp at any size), from the app's own
// Theme.xaml colours and MainWindow.xaml layout, playing one real Change IP: the button reads
// "Changing…", the progress line shows the app's own attempt messages, the status holds until the new IP
// is measured, the new IP lands, a row is added to Previous IPs and the app's toast names the new range.
// Addresses are documentation ranges (RFC 5737). Units are app pixels, scaled to the width asked.
const T = {
  bg: '#121212', side: '#0b0b0b', surface: '#171717', surface2: '#1d1d1d', surface3: '#262626', line: '#2a2a2a', strong: '#383838',
  text: '#dddddd', muted: '#9b9b9b', faint: '#888888', good: '#7cc95a', warn: '#e3bf4b', accent: '#5ba8f0', accentHi: '#7ebcf5', onAccent: '#0b0b0b',
  top: ['#3bb4e5', '#c64fc6', '#d8e03a'],
};
const SANS = `'Segoe UI Variable Text','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Roboto,Arial,sans-serif`;
const MONO = `'Cascadia Mono',Consolas,'SFMono-Regular',Menlo,'Roboto Mono',monospace`;
const OLD = { ip: '198.51.100.188', isp: 'Telefonica Germany · Berlin · Germany', at: '00:22' };
const NEW = { ip: '192.0.2.23', isp: 'Telefonica Germany · Munich · Germany', at: '01:01' };
const EARLIER = { ip: '198.51.100.7', isp: 'Telefonica Germany · Munich · Germany', at: '27 Oct' };
export const CYCLE = 14;
// The story, in seconds: press, two progress messages, the new IP, the toast, then hold.
const PRESS = 2.0, P1 = 2.3, P2 = 4.6, DONE = 6.8, TOAST_OFF = 11.6, END = 13.4;
const p = (s) => `${+((s / CYCLE) * 100).toFixed(2)}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const shield = (cx, cy, r, col) => `<path d="M${cx} ${cy - r}l${r * 0.85} ${r * 0.32}v${r * 0.62}c0 ${r * 0.62}-${r * 0.38} ${r * 0.98}-${r * 0.85} ${r * 1.18}c-${r * 0.47}-${r * 0.2}-${r * 0.85}-${r * 0.56}-${r * 0.85}-${r * 1.18}v-${r * 0.62}z" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>`;
const txt = (x, y, s, size, fill, { mono = false, weight = 400, cls = '', anchor = 'start' } = {}) =>
  `<text${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;
const btn = (x, y, w, label, primary, cls = '') => `<g${cls ? ` class="${cls}"` : ''}><rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="27" rx="2" fill="${primary ? T.accent : T.surface2}" stroke="${primary ? T.accent : T.strong}"/>
${txt(x + w / 2, y + 18, label, 12, primary ? T.onAccent : T.text, { anchor: 'middle', weight: primary ? 600 : 400 })}</g>`;
function group(x, y, w, h, title) {
  const tw = title.length * 6.6 + 10;
  return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" fill="${T.surface}" stroke="${T.line}"/>
<rect x="${x + 8}" y="${y - 6}" width="${tw}" height="12" fill="${T.bg}"/>${txt(x + 13, y + 4, title, 12, T.text, { weight: 600 })}`;
}

/** narrow: a phone-sized cut of the same tab (no home IP column, no ISP in the history). */
export function appPanel(narrow = false) {
  const W = narrow ? 430 : 660, H = narrow ? 384 : 394;
  const gx = 14, gw = W - 28;
  const parts = [];
  // Window: dark frame, the app's three-colour bar on top, the breadcrumb.
  parts.push(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="8" fill="${T.bg}" stroke="${T.line}"/>
<linearGradient id="tb" x1="0" x2="1"><stop offset="0" stop-color="${T.top[0]}"/><stop offset=".5" stop-color="${T.top[1]}"/><stop offset="1" stop-color="${T.top[2]}"/></linearGradient>
<clipPath id="wc"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="7.5"/></clipPath>
<g clip-path="url(#wc)"><rect x="0" y="0" width="${W}" height="2" fill="url(#tb)"/></g>
${txt(16, 25, 'CS2 IP Changer', 12, T.muted)}${txt(110, 25, '/', 12, T.strong)}${txt(122, 25, 'Connection', 12, T.text, { weight: 600 })}
<path d="M0 39.5H${W}" stroke="${T.line}"/>`);

  // Status
  const sy = 56, sh = 196;
  parts.push(group(gx, sy, gw, sh, 'Status'));
  const hx = gx + 16, hy = sy + 18;
  const hero = (kind) => {
    const col = kind === 'good' ? T.good : T.warn;
    const title = kind === 'good' ? 'Protected' : 'Checking the phone’s IP…';
    const sub = kind === 'good' ? 'Servers on your list only see the phone’s IP. If the phone drops, they are blocked.'
      : 'Servers on your list stay blocked until the app confirms the new IP.';
    return `<g class="${kind === 'good' ? 'hg' : 'hw'}"><rect x="${hx}" y="${hy}" width="30" height="30" fill="${col}" fill-opacity=".12"/>${shield(hx + 15, hy + 9, 7.5, col)}
${txt(hx + 42, hy + 13, title, 16, col, { weight: 600 })}${txt(hx + 42, hy + 30, narrow && sub.length > 60 ? sub.slice(0, 57) + '…' : sub, 11.5, T.muted)}</g>`;
  };
  parts.push(hero('good'), hero('warn'));
  const ky = sy + 74;
  parts.push(txt(hx, ky, 'IP servers see', 11.5, T.faint));
  parts.push(`<clipPath id="ipc"><rect x="${hx}" y="${ky + 4}" width="${narrow ? 300 : 290}" height="44"/></clipPath><g clip-path="url(#ipc)">
<g class="io">${txt(hx, ky + 26, OLD.ip, 19, T.text, { mono: true })}${txt(hx, ky + 43, OLD.isp, 11.5, T.muted)}</g>
<g class="in">${txt(hx, ky + 26, NEW.ip, 19, T.text, { mono: true })}${txt(hx, ky + 43, NEW.isp, 11.5, T.muted)}</g></g>`);
  if (!narrow) {
    const rx = hx + 308;
    parts.push(txt(rx, ky, 'Your home IP', 11.5, T.faint), txt(rx, ky + 26, '203.0.•••.•••', 19, T.faint, { mono: true }),
      txt(rx, ky + 43, 'Deutsche Telekom AG · Hamburg · Germany', 11.5, T.faint));
  }
  const by = sy + 142;
  parts.push(`<g class="ar">${btn(hx, by, 96, 'Change IP', true, 'cb')}${btn(hx + 102, by, 148, 'Change IP and rejoin', false)}${narrow ? '' : btn(hx + 256, by, 104, 'Run leak test', false)}</g>`);
  const pw = narrow ? gw - 32 : 420;
  parts.push(`<g class="pr"><g class="m1">${txt(hx, by + 10, 'Attempt 1/3: turning off the phone’s data for 4 s…', 12, T.text)}</g>
<g class="m2">${txt(hx, by + 10, 'Attempt 1/3: waiting for the mobile network to come back…', 12, T.text)}</g>
<rect x="${hx}" y="${by + 18}" width="${pw}" height="4" fill="${T.surface3}"/>
<clipPath id="pb"><rect x="${hx}" y="${by + 18}" width="${pw}" height="4"/></clipPath>
<g clip-path="url(#pb)"><rect class="bar" x="${hx}" y="${by + 18}" width="${pw * 0.3}" height="4" fill="${T.accent}"/></g></g>`);

  // Previous IPs: the new row slides in on top, the others move down.
  const qy = sy + sh + 20, qh = H - qy - 14;
  parts.push(group(gx, qy, gw, qh, 'Previous IPs'));
  const row = (r, y, cls) => `<g class="${cls}"><g transform="translate(0 ${y})">${txt(hx, 0, r.at, 11.5, T.faint, { mono: true })}${txt(hx + 52, 0, r.ip, 11.5, T.text, { mono: true })}
${narrow ? '' : txt(hx + 172, 0, r.isp, 11.5, T.faint)}${txt(narrow ? hx + 180 : hx + 420, 0, r.at.includes(' ') ? 'at startup' : 'changed', 11.5, T.faint)}</g></g>`;
  const r0 = qy + 28;
  parts.push(`<clipPath id="hc"><rect x="${gx + 1}" y="${qy + 8}" width="${gw - 2}" height="${qh - 10}"/></clipPath><g clip-path="url(#hc)">
${row(NEW, r0, 'hn')}<g class="hd">${row(OLD, r0, '')}${row(EARLIER, r0 + 22, '')}</g></g>`);

  // The app's toast, bottom right.
  const toast = `New IP: ${NEW.ip}. New range (192.0.x.x).`;
  const tw = toast.length * 6.1 + 30, tx = W - 10 - tw, ty = 6;
  parts.push(`<g class="to"><rect x="${tx}" y="${ty}" width="${tw}" height="28" rx="3" fill="${T.surface3}" stroke="${T.strong}"/>
<rect x="${tx}" y="${ty}" width="3" height="28" fill="${T.good}"/>${txt(tx + 14, ty + 18.5, toast, 12, T.text)}</g>`);

  const css = `
.hw,.pr,.m1,.m2,.io,.to{opacity:0}.hd{transform:translateY(22px)}
.hg{animation:hg ${CYCLE}s linear infinite}.hw{animation:hw ${CYCLE}s linear infinite}
.ar{animation:ar ${CYCLE}s linear infinite}.pr{animation:pr ${CYCLE}s linear infinite}
.m1{animation:m1 ${CYCLE}s linear infinite}.m2{animation:m2 ${CYCLE}s linear infinite}
.io{animation:io ${CYCLE}s cubic-bezier(.6,0,.4,1) infinite}.in{animation:in ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite}
.hn{animation:hn ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite}.hd{animation:hd ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite}
.to{animation:to ${CYCLE}s cubic-bezier(.2,.8,.2,1) infinite}
.cb rect{animation:cb ${CYCLE}s linear infinite}
.bar{animation:bar 1.4s linear infinite}
@keyframes hg{0%,${p(P1)}{opacity:1}${p(P1 + 0.15)},${p(DONE)}{opacity:0}${p(DONE + 0.2)},100%{opacity:1}}
@keyframes hw{0%,${p(P1)}{opacity:0}${p(P1 + 0.15)},${p(DONE)}{opacity:1}${p(DONE + 0.2)},100%{opacity:0}}
@keyframes ar{0%,${p(P1)}{opacity:1}${p(P1 + 0.1)},${p(DONE)}{opacity:0}${p(DONE + 0.2)},100%{opacity:1}}
@keyframes pr{0%,${p(P1)}{opacity:0}${p(P1 + 0.1)},${p(DONE)}{opacity:1}${p(DONE + 0.2)},100%{opacity:0}}
@keyframes m1{0%,${p(P1)}{opacity:0}${p(P1 + 0.1)},${p(P2)}{opacity:1}${p(P2 + 0.1)},100%{opacity:0}}
@keyframes m2{0%,${p(P2)}{opacity:0}${p(P2 + 0.1)},${p(DONE)}{opacity:1}${p(DONE + 0.1)},100%{opacity:0}}
@keyframes cb{0%,${p(PRESS)}{fill:${T.accent}}${p(PRESS + 0.08)},${p(P1)}{fill:${T.accentHi}}${p(P1 + 0.1)},100%{fill:${T.accent}}}
@keyframes io{0%,${p(DONE)}{opacity:1;transform:translateY(0)}${p(DONE + 0.4)},${p(END)}{opacity:0;transform:translateY(-22px)}${p(END + 0.3)},100%{opacity:1;transform:translateY(0)}}
@keyframes in{0%,${p(DONE)}{opacity:0;transform:translateY(22px)}${p(DONE + 0.5)},${p(END)}{opacity:1;transform:translateY(0)}${p(END + 0.3)},100%{opacity:0;transform:translateY(0)}}
@keyframes hn{0%,${p(DONE + 0.2)}{opacity:0;transform:translateY(-10px)}${p(DONE + 0.7)},${p(END)}{opacity:1;transform:translateY(0)}${p(END + 0.3)},100%{opacity:0}}
@keyframes hd{0%,${p(DONE + 0.2)}{transform:translateY(0)}${p(DONE + 0.7)},${p(END)}{transform:translateY(22px)}${p(END + 0.4)},100%{transform:translateY(0)}}
@keyframes to{0%,${p(DONE + 0.3)}{opacity:0;transform:translateY(8px)}${p(DONE + 0.7)},${p(TOAST_OFF)}{opacity:1;transform:translateY(0)}${p(TOAST_OFF + 0.4)},100%{opacity:0}}
@keyframes bar{from{transform:translateX(-${pw * 0.3}px)}to{transform:translateX(${pw}px)}}`;
  return { W, H, body: parts.join('\n'), css };
}
