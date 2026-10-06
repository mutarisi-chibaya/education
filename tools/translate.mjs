// Machine-translates the app into the languages that are not written by hand.
//
//   node tools/translate.mjs              every language below, only what is missing
//   node tools/translate.mjs xh af        just these
//   node tools/translate.mjs --redo xh    translate everything again
//
// English and isiZulu are written by hand and live in the content itself.
// For the other languages this writes two files each:
//   i18n/<lang>.json          menus, buttons and pages (kept strings are not touched)
//   content/lang/<lang>.json  card text: { "English text": "translation" }
// Run it again after adding or rewording cards: only new text is sent.
//
// With GOOGLE_TRANSLATE_KEY set it uses the Google Cloud Translation API.
// Without one it uses Google's free web endpoint, which is fine for a demo but
// is unofficial and rate-limited: use a key for anything you publish.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MACHINE_LANGS = ['xh', 'af', 'nso', 'tn', 'st'];
const BATCH = 3200;
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const write = (p, v) => writeFileSync(resolve(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every English card text in the content files. Campus Realities keeps its body
// in English until a professional has reviewed it, so only its titles count.
export function cardTexts(root = ROOT) {
  const out = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && typeof node.en === 'string') { if (node.en.trim()) out.add(node.en); return; }
    for (const v of Object.values(node)) walk(v);
  };
  const dir = (d) => readdirSync(resolve(root, d)).filter((f) => f.endsWith('.json')).map((f) => `${d}/${f}`);
  for (const f of ['content/core.json', ...dir('content/chapters'), ...dir('content/institutions')]) walk(JSON.parse(readFileSync(resolve(root, f), 'utf8')));
  for (const t of JSON.parse(readFileSync(resolve(root, 'content/realities.json'), 'utf8')).topics) walk(t.title);
  return [...out];
}

// {money}, {n}... must come back untouched: they go out as {0}, {1}.
export const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');
function mask(s) {
  const names = [];
  const text = s.replace(/\{\w+\}/g, (m) => { names.push(m); return `{${names.length - 1}}`; });
  return { text, names };
}
const unmask = (s, names) => s.replace(/\{\s*(\d+)\s*\}/g, (m, i) => names[Number(i)] ?? m);

async function google(texts, lang) {
  const key = process.env.GOOGLE_TRANSLATE_KEY;
  if (key) {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target: lang, format: 'text' }),
    });
    if (!res.ok) throw new Error(`Translation API answered ${res.status}`);
    return (await res.json()).data.translations.map((t) => t.translatedText);
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t`, {
      method: 'POST', body: new URLSearchParams({ q: texts.join('\n') }), signal: AbortSignal.timeout(30000),
    }).catch(() => ({ ok: false, status: 'no answer' }));
    if (res.ok) {
      const lines = (await res.json())[0].map((seg) => seg[0]).join('').split('\n');
      return lines.length === texts.length ? lines : null; // null: the lines did not come back one for one
    }
    // Too many requests: wait longer each time before giving up.
    if (attempt >= 5) throw new Error(`Google Translate answered ${res.status}`);
    await sleep(20000 * (attempt + 1));
  }
}

// English strings -> { english: translation }. Anything that comes back with a
// placeholder missing is left out, so the app shows the English for it.
async function translateAll(strings, lang) {
  const done = {};
  const failed = [];
  const jobs = strings.map((src) => {
    const [, lead, body, tail] = src.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { src, lead, tail, ...mask(body.replace(/\n/g, ' ')) };
  });
  const accept = (job, out) => {
    const text = out == null ? null : `${job.lead}${unmask(out.trim(), job.names)}${job.tail}`;
    if (text && text.trim() && placeholders(text) === placeholders(job.src)) { done[job.src] = text; return true; }
    return false;
  };
  const todo = [];
  for (const job of jobs) {
    if (!/\p{L}/u.test(job.text.replace(/\{\d+\}/g, ''))) done[job.src] = job.src; // nothing to translate
    else todo.push(job);
  }
  let stopped = null;
  try {
    for (let i = 0; i < todo.length;) {
      const batch = [];
      let size = 0;
      while (i < todo.length && (!batch.length || size + todo[i].text.length < BATCH)) { size += todo[i].text.length + 1; batch.push(todo[i++]); }
      const out = await google(batch.map((j) => j.text), lang);
      const retry = out ? batch.filter((j, n) => !accept(j, out[n])) : batch;
      for (const job of retry) {
        const one = await google([job.text], lang);
        if (!accept(job, one?.[0])) failed.push(job.src);
        await sleep(300);
      }
      process.stdout.write(`\r  ${lang}: ${Object.keys(done).length}/${strings.length}`);
      await sleep(1200);
    }
  } catch (e) {
    stopped = e.message; // what was translated so far is still saved
  }
  process.stdout.write('\n');
  return { done, failed, stopped };
}

async function run(lang, redo) {
  const en = read('i18n/en.json');
  const uiPath = `i18n/${lang}.json`;
  const ui = existsSync(resolve(ROOT, uiPath)) ? read(uiPath) : {};
  const wantUi = Object.keys(en).filter((k) => redo || !ui[k] || placeholders(ui[k]) !== placeholders(en[k]));
  const uiOut = await translateAll([...new Set(wantUi.map((k) => en[k]))], lang);
  // Same key order as English, so the files are easy to compare.
  write(uiPath, Object.fromEntries(Object.keys(en).map((k) => [k, wantUi.includes(k) ? uiOut.done[en[k]] : ui[k]]).filter(([, v]) => v)));

  const cardPath = `content/lang/${lang}.json`;
  mkdirSync(resolve(ROOT, 'content/lang'), { recursive: true });
  const cards = !redo && existsSync(resolve(ROOT, cardPath)) ? read(cardPath) : {};
  const texts = cardTexts();
  const cardOut = await translateAll(texts.filter((s) => !cards[s]), lang);
  // Text that is no longer in any card is dropped.
  write(cardPath, Object.fromEntries(texts.map((s) => [s, cards[s] || cardOut.done[s]]).filter(([, v]) => v)));

  const failed = [...uiOut.failed, ...cardOut.failed];
  console.log(`  ${lang}: ${wantUi.filter((k) => uiOut.done[en[k]]).length} interface and ${Object.keys(cardOut.done).length} card strings translated${failed.length ? `, ${failed.length} left in English:` : '.'}`);
  for (const f of failed) console.log(`    - ${f.slice(0, 90)}`);
  const stopped = uiOut.stopped || cardOut.stopped;
  if (stopped) {
    console.log(`  ${lang}: stopped early (${stopped}). What was done is saved; run it again later for the rest.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const redo = args.includes('--redo');
  const langs = args.filter((a) => !a.startsWith('--'));
  for (const lang of langs.length ? langs : MACHINE_LANGS) {
    if (!MACHINE_LANGS.includes(lang)) { console.error(`"${lang}" is not one of ${MACHINE_LANGS.join(', ')}`); process.exit(2); }
    await run(lang, redo);
  }
}
