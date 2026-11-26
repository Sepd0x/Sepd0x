// Renders every asset of the profile page (the "vitrine", 19 Nov 2026): the hero and the cs2 card read the
// latest cs2-ip-changer release, its downloads, releases, stars and VirusTotal result from GitHub; the
// TryHackMe card reads data/thm.json. The earlier pages' generators (produto, terrain, portrait, cards) stay
// in tools/ but are no longer drawn.
// 26 Nov 2026: the README's image links carry ?v=<hash of the assets>, so a new star or a new picture gets a
// new address and no browser or cache keeps showing the old one (the fixed ?v=6 kept 5 stars on screen).
// usage: node render.mjs [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { render } from './vitrine.mjs';
import { ROOT, ASSETS } from './lib.mjs';

await render();

/** One short hash of every svg in assets/: it changes only when something drawn changes. */
export function assetsHash(dir) {
  const h = createHash('sha256');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  return h.digest('hex').slice(0, 8);
}

/** Every ?v=... on an assets/ link in the README becomes ?v=<hash>. */
export function stamp(readme, v) {
  return readme.replace(/(assets\/[\w.-]+\.svg)\?v=[\w]+/g, `$1?v=${v}`);
}

if (!process.env.OUT) {
  const file = path.join(ROOT, 'README.md');
  const v = assetsHash(ASSETS), before = fs.readFileSync(file, 'utf8'), after = stamp(before, v);
  if (after !== before) fs.writeFileSync(file, after);
  console.log(`readme: image links at ?v=${v}${after === before ? ' (unchanged)' : ''}`);
}
