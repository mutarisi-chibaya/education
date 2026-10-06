// Translations. UI strings live in i18n/<lang>.json; game content carries
// its own { en, zu } objects. Anything missing falls back to English.

// English and isiZulu card text is written by hand, inside the content. The
// `machine` languages are machine-translated (tools/translate.mjs): their card
// text is one file per language, content/lang/<id>.json, keyed by the English,
// and only the chosen language is downloaded.
export const LANGS = [
  { id: 'en', label: 'English', code: 'EN' },
  { id: 'zu', label: 'isiZulu', code: 'ZU' },
  { id: 'xh', label: 'isiXhosa', code: 'XH', machine: true },
  { id: 'af', label: 'Afrikaans', code: 'AF', machine: true },
  { id: 'nso', label: 'Sepedi', code: 'NSO', machine: true },
  { id: 'tn', label: 'Setswana', code: 'TN', machine: true },
  { id: 'st', label: 'Sesotho', code: 'ST', machine: true },
];

let lang = 'en';
let strings = {};
let fallback = {};
let cards = {};   // English card text -> the current language

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

export async function loadLang(id) {
  if (!LANGS.some((l) => l.id === id)) id = 'en';
  if (!Object.keys(fallback).length) fallback = await fetchJson('i18n/en.json');
  strings = id === 'en' ? fallback : await fetchJson(`i18n/${id}.json`);
  // Without its card file (first use while offline) a language shows the cards in English.
  cards = LANGS.find((l) => l.id === id).machine ? await fetchJson(`content/lang/${id}.json`).catch(() => ({})) : {};
  lang = id;
  document.documentElement.lang = id;
}

export const currentLang = () => lang;

function fill(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

// UI string by key.
export function t(key, vars) {
  return fill(strings[key] ?? fallback[key] ?? key, vars);
}

// Content text: a plain string or a { en, zu } object.
export function tx(obj, vars) {
  if (obj == null) return '';
  if (typeof obj === 'string') return fill(obj, vars);
  return fill(obj[lang] ?? cards[obj.en] ?? obj.en ?? '', vars);
}

// One English card text in the current language, if it has been translated.
export const cardText = (en) => cards[en];

// South African style: R1 200, -R300.
export function money(n) {
  const abs = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}R${abs}`;
}
