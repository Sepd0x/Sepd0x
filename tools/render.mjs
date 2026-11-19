// Renders every asset of the profile page (the "vitrine", 19 Nov 2026): the hero and the cs2 card read the
// latest cs2-ip-changer release, its downloads, releases, stars and VirusTotal result from GitHub; the
// TryHackMe card reads data/thm.json. The earlier pages' generators (produto, terrain, portrait, cards) stay
// in tools/ but are no longer drawn.
// usage: node render.mjs [--offline]
import { render } from './vitrine.mjs';

await render();
