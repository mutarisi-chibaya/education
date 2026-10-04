// Lists what needs attention across every institution's pack: phone numbers
// whose verification is getting old, licences about to expire, and packs
// that fail the check.   node tools/pack-audit.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkPack } from './pack-check.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const DAY = 864e5;
const days = (date) => Math.round((Date.now() - Date.parse(date)) / DAY);
let due = 0;
for (const entry of read('content/institutions/index.json')) {
  const inst = read(`content/institutions/${entry.id}.json`);
  const notes = [];
  const { errors } = checkPack(entry.id);
  if (errors.length) notes.push(`fails the pack check (${errors.length} error(s))`);
  if (inst.licence?.expires && Date.parse(inst.licence.expires) - Date.now() < 60 * DAY) notes.push(`licence expires ${inst.licence.expires}`);
  const layers = [['', inst.support], ...(inst.campuses || []).map((c) => [`${c.id}: `, c.support])];
  for (const [where, support] of layers) {
    for (const [id, s] of Object.entries(support || {})) {
      if (!(s.contacts || []).some((c) => c.tel)) continue;
      if (!s.last_checked) notes.push(`${where}${id}: phone never verified`);
      else if (days(s.last_checked) > 300) notes.push(`${where}${id}: phone last checked ${days(s.last_checked)} days ago (hidden from students after 400)`);
    }
  }
  due += notes.length;
  console.log(`${entry.id} (v${inst.version}): ${notes.length ? '' : 'nothing due'}`);
  for (const n of notes) console.log(`  - ${n}`);
}
console.log(`\n${due} item(s) need attention.`);
