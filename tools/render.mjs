// Renders every asset of the profile (the "produto" page, 28 Oct 2026): the hero (contributions and the
// latest cs2-ip-changer release change daily), the buttons, the cs2 card and the marco-polo + TryHackMe
// row, from tools/.cache, the GitHub API and data/thm.json. The pieces of the earlier page (terrain,
// portrait, the old cards and THM panel) keep their generators but are no longer drawn.
// usage: node render.mjs [--offline]
import { render } from './produto.mjs';

await render();
