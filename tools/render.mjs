// Renders every asset. The terrain is redrawn on every run (the calendar moves daily); the portrait
// and the marco-polo card only when their source image changed (hashes kept in assets/.state.json);
// the TryHackMe strip from data/thm.json, refreshed first when running in the Action (THM_LIVE=1).
// usage: node render.mjs [--force] [--offline]
import { render as terrain } from './terrain.mjs';
import { render as portrait } from './portrait.mjs';
import { render as card } from './card.mjs';
import { render as thm } from './thm.mjs';

const force = process.argv.includes('--force');
await terrain();
await portrait({ force });
await card({ force });
await thm();
