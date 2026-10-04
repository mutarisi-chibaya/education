// Translations. UI strings live in i18n/<lang>.json; game content carries
// its own { en, zu } objects. Anything missing falls back to English.

// `beta` languages translate the menus and pages; story cards fall back to English.
export const LANGS = [
  { id: 'en', label: 'English', code: 'EN' },
  { id: 'zu', label: 'isiZulu', code: 'ZU' },
  { id: 'xh', label: 'isiXhosa', code: 'XH', beta: true },
  { id: 'af', label: 'Afrikaans', code: 'AF', beta: true },
  { id: 'nso', label: 'Sepedi', code: 'NSO', beta: true },
  { id: 'tn', label: 'Setswana', code: 'TN', beta: true },
  { id: 'st', label: 'Sesotho', code: 'ST', beta: true },
];

let lang = 'en';
let strings = {};
let fallback = {};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

export async function loadLang(id) {
  if (!LANGS.some((l) => l.id === id)) id = 'en';
  if (!Object.keys(fallback).length) fallback = await fetchJson('i18n/en.json');
  strings = id === 'en' ? fallback : await fetchJson(`i18n/${id}.json`);
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
  return fill(obj[lang] ?? obj.en ?? '', vars);
}

// South African style: R1 200, -R300.
export function money(n) {
  const abs = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}R${abs}`;
}
