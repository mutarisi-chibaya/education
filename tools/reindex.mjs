// Rebuilds the institution directory (content/institutions/index.json) from the pack files.
// Run it after deleting a pack:   node tools/reindex.mjs
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeDirectory } from './pack-lib.mjs';

const entries = writeDirectory(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
console.log(`Directory rebuilt: ${entries.map((e) => e.id).join(', ')}`);
