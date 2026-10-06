// Words a first-year may not know yet (supp, perusal, credits...) are data in
// core.json's "glossary". In card text the first mention of each becomes a
// button that opens its definition.

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pattern for every glossary word in this language, longest first, so
// "supplementary exam" wins over "exam". A language without its own word list
// matches the English words and the translated name of the term.
export function termIndex(glossary = {}, lang = 'en', translate = () => null) {
  const ids = {};
  const exact = {}; // abbreviations ("IT", "LO") count only as written, never as "it" or "lo"
  for (const [id, g] of Object.entries(glossary)) {
    const words = g.match?.[lang] || [...(g.match?.en || []), translate(g.term?.en)].filter(Boolean);
    for (const w of words) {
      ids[w.toLowerCase()] = id;
      if (g.exact) exact[w.toLowerCase()] = w;
    }
  }
  const words = Object.keys(ids).sort((a, b) => b.length - a.length);
  if (!words.length) return { re: null, ids, exact };
  // Whole words only: "credits" is not found inside "accredited".
  return { re: new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(escRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu'), ids, exact };
}

// Text as safe HTML, with the first mention of each glossary word made tappable.
export function linkTerms(text, index, esc) {
  if (!index?.re || !text) return esc(text);
  const seen = new Set();
  let out = '';
  let last = 0;
  for (const m of text.matchAll(index.re)) {
    const key = m[2].toLowerCase();
    const id = index.ids[key];
    if (index.exact?.[key] && index.exact[key] !== m[2]) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const start = m.index + m[1].length;
    out += `${esc(text.slice(last, start))}<button class="term" data-action="sheet" data-kind="term" data-id="${esc(id)}">${esc(m[2])}</button>`;
    last = start + m[2].length;
  }
  return out + esc(text.slice(last));
}
