// Shared by the pack tools: reading intake spreadsheets (CSV) and the simple
// campus-map grid that buildings sit on.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Where a building sits on the campus map, and the default walking directions
// from the gate. A university only chooses a position; it never types coordinates.
export const POSITIONS = JSON.parse(readFileSync(new URL('../content/map-positions.json', import.meta.url), 'utf8'));

// RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  // Excel saves with semicolons in some regional settings: go by the header row.
  const head = src.split('\n', 1)[0];
  const sep = head.split(';').length > head.split(',').length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const filled = rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0].trim().startsWith('#'));
  if (!filled.length) return [];
  const header = filled[0].map((h) => h.trim());
  return filled.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function readCsv(path) {
  return existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : [];
}

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// { en, zu } from columns "<key>_en" and "<key>_zu"; undefined when the English is empty.
export function text(row, key) {
  if (!row[`${key}_en`]) return undefined;
  return { en: row[`${key}_en`], ...(row[`${key}_zu`] ? { zu: row[`${key}_zu`] } : {}) };
}

// The directory the app downloads first: one short entry per institution.
// The full pack is only fetched for the institution a student chooses.
export function directoryEntry(inst) {
  return {
    id: inst.id, name: inst.name, short: inst.short, tagline: inst.tagline || inst.campus,
    type: inst.type || 'university', province: inst.province || null, status: inst.status,
    version: inst.version, ...(inst.licence ? { licence: inst.licence } : {}),
  };
}

// Rebuild content/institutions/index.json from the pack files, keeping the current order.
export function writeDirectory(root) {
  const dir = join(root, 'content/institutions');
  const indexPath = join(dir, 'index.json');
  const order = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')).map((x) => x.id || x) : [];
  const packs = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  packs.sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9) || a.id.localeCompare(b.id));
  const entries = packs.map(directoryEntry);
  writeFileSync(indexPath, `${JSON.stringify(entries, null, 2)}\n`);
  return entries;
}

export const list = (value) => (value ? value.split(';').map((x) => x.trim()).filter(Boolean) : []);
