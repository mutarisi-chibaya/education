import {
  newJourney, startChapter, backToMap, eventForWeek, choose, acknowledge, nextWeek, advance, setPhase, openEvent,
  skipEvent, seekHelp, canSeekHelp, fridayDue, friday, fridayTemptation, fridayAmount, setHabit, activeSubscriptions, resolveEvent,
  computeTests, computeResults, findById, monthlyEssentials, chapterOf, currentChapter, TAGS, currentMini, answerMini,
  affordableChoices, canAffordTreat,
} from './engine.js';
import { loadCatalogue, loadInstitution, openDirectory, searchDirectory, mergeContent, fetchNewerPack } from './content.js';
import { computeBudget, suggestedIncome } from './budget.js';
import { LANGS, loadLang, currentLang, t, tx, money, cardText } from './i18n.js';
import {
  buildPlan, budgetFor, tierAdvice, contactIds, serviceText, planImageBlob, forecastView, cardVars, setPlanColors,
} from './plan.js';
import { moneyForecast, aiPayload, LEAKS, fairGame, nextChapterId, copingProfile } from './forecast.js';
import { cashFlowChart, showChartWeek, riskStrip } from './charts.js';
import { serverCapabilities, aiPlan, sendStats, fetchStats } from './ai.js';
import { termIndex, linkTerms } from './glossary.js';

const SAVE_VERSION = 6;
const SAVE_KEY = 'fys-save-v6';
const PREFS_KEY = 'fys-prefs-v1';
const INTRO_SLIDES = 3;
const STEPS = ['institution', 'campus', 'status', 'course', 'housing', 'funding', 'income', 'origin', 'laptop', 'family_needs', 'age_role', 'review'];
const SETUP_KEYS = ['institution', 'campus', 'status', 'course', 'housing', 'funding', 'origin', 'laptop', 'family_needs', 'age_role', 'monthlyIncome'];
const INFO_PAGES = ['about', 'universities', 'privacy'];
const SEARCH_FROM = 7;  // the institution list gets a search box and groups once it is this long
const TYPES = ['university', 'tvet', 'private'];
const FEEDBACK = { realistic: ['yes', 'partly', 'no'], learned: ['yes', 'no'], recommend: ['yes', 'maybe', 'no'] };
const HUD_PHASES = ['dashboard', 'note', 'event', 'outcome', 'support', 'friday'];
// The home screen's year cards, and the chapters inside each.
const YEARS = [
  { id: 'before', icon: '📝', chapters: ['prequel'] },
  { id: 'first', icon: '🎒', chapters: ['arrival', 'first_term', 'first_exams', 'bounce_back'] },
  { id: 'middle', icon: '🏠', chapters: ['middle_years'] },
  { id: 'final', icon: '🎓', chapters: ['finish_line'] },
];
const TYPE_TAG = { win: 'card.win', light: 'card.light', friend_story: 'card.friend', recurring: 'card.recurring' };

const app = document.getElementById('app');
const hud = document.getElementById('hud');
const topRight = document.getElementById('topbar-right');

let catalogue;          // { core, institutions, chapterIndex, chapterFiles }
let content;            // merged content for the current institution
let ownContent = null;  // the player's own content, set aside while a shared link shows another university's services
let state = null;       // the journey (null before setup)
let screen = 'onboard'; // onboard | home | year | setup | summary | game | services
let obStep = 0;         // onboarding page: 0 welcome, 1 why it matters, 2 how it works
let yearId = 'first';   // which year card is open
let introStep = 0;
let step = 0;           // setup step index
let draft = {};         // setup answers in progress
let fromReview = false;
let overlay = null;     // support ids shown as an overlay
let sheet = null;       // a campus map or demo page shown on top: { kind, id }
let installPrompt = null;
let lastMeters = null;
let caps = { ai: false, stats: false };
let tested = null;      // real completion count from the server, for the About screen
// Campus Realities: kept in memory only. Nothing about what was viewed is saved or sent.
let cr = { topic: null, step: 0, picked: null };
let undo = null;        // the state before the last choice, so an answer can be changed
let lastView = null;    // the page only jumps to the top when the view changes
let lastNav = null;     // the browser-history entry for the current screen
let navMode = 'push';   // 'replace' while restoring a history entry or leaving a sensitive card
let aiPending = false;
let showAi = true;

// ---------- storage (wrapped: private mode can throw) ----------

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } },
};
const save = () => state && store.set(SAVE_KEY, state);
const prefs = () => store.get(PREFS_KEY) || {};

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cta = (inner) => `<div class="cta">${inner}</div>`;
const findEvent = (id) => content.eventIndex[id];

function contentFor(id, campusId) {
  const inst = catalogue.institutions.find((i) => i.id === id) || catalogue.institutions[0];
  return mergeContent(catalogue.core, inst, catalogue.chapterIndex, catalogue.chapterFiles, campusId);
}

const vars = (ev) => cardVars(content, state, ev);

// Card text with its glossary words made tappable (see glossary.js).
let terms = {};
function rich(text) {
  if (terms.lang !== currentLang() || terms.glossary !== content.glossary) {
    terms = { lang: currentLang(), glossary: content.glossary, index: termIndex(content.glossary, currentLang(), cardText) };
  }
  return linkTerms(text, terms.index, esc);
}

function delta(n, kind) {
  if (!n) return '';
  const text = kind === 'money' ? money(n).replace(/^R/, '+R') : `${n > 0 ? '+' : ''}${n}`;
  const unit = kind === 'money' ? '' : ` data-unit="${esc(t(`meter.${kind}`).toLowerCase())}"`;
  return `<span class="delta ${n > 0 ? 'up' : 'down'} ${kind}"${unit}>${esc(text)}</span>`;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

function contactLink(c) {
  if (c.tel) return `<a class="contact tel" href="tel:${esc(c.tel)}"><span aria-hidden="true">📞</span> ${esc(c.label)}</a>`;
  return `<button class="contact" data-action="sheet" data-kind="link" data-id="${esc(c.url)}"><span aria-hidden="true">🔗</span> ${esc(c.label)}</button>`;
}

function unitLabel(n) {
  const ch = currentChapter(content, state);
  return t('unit.label', { unit: tx(ch.unit), n, total: ch.weeks });
}

// "Next week" only when nothing else is left this week.
function nextLabel() {
  const more = state.qi + 1 < (state.queue || []).length
    || fridayDue(content, state);
  return t(more ? 'common.continue' : 'outcome.next');
}

// ---------- first-time tips ----------

// A short pointer shown the first time a player meets a part of the app. It
// sits right above the thing it explains, and goes away for good when the
// player taps "Got it" or simply uses that thing.
const coachSeen = (id) => Boolean(prefs().coach?.[id]);

function coachDone(id) {
  if (!coachSeen(id)) store.set(PREFS_KEY, { ...prefs(), coach: { ...prefs().coach, [id]: true } });
}

function coach(id) {
  if (coachSeen(id)) return '';
  return `<div class="nudge help coach" role="note">
    <span><span aria-hidden="true">💡</span> ${esc(t(`coach.${id}`))}</span>
    <button class="btn small" data-action="coach-done" data-id="${id}">${esc(t('coach.ok'))}</button>
  </div>`;
}

// ---------- top bar + HUD ----------

// A licensed university's name, monogram and colours, from its pack. With no
// brand in the pack (or in dark mode without dark colours) the defaults stay.
const BRAND_VARS = { brand: '--brand', brandInk: '--brand-ink', accent: '--accent', accentInk: '--accent-ink' };

function applyBrand() {
  const brand = content?.brand || {};
  const dark = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const colors = (dark ? brand.colorsDark : brand.colors) || {};
  for (const [key, name] of Object.entries(BRAND_VARS)) {
    if (colors[key]) document.documentElement.style.setProperty(name, colors[key]);
    else document.documentElement.style.removeProperty(name);
  }
  setPlanColors(brand.colors);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.brand || '#12355b');
}

function brandChip() {
  const brand = content?.brand;
  if (!brand?.name) return '';
  return `<span class="uni-brand" title="${esc(tx(content.name))}">${brand.logo ? `<span class="monogram" aria-hidden="true">${esc(brand.logo)}</span>` : ''}<span class="uni-brand-name">${esc(brand.name)}</span></span>`;
}

function renderTopbar() {
  const cur = LANGS.find((l) => l.id === currentLang()) || LANGS[0];
  applyBrand();
  topRight.innerHTML = `${brandChip()}<div class="lang-menu">
    <button class="lang-btn" data-action="lang-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(t('lang.choose'))}: ${esc(cur.label)}">
      <span class="globe" aria-hidden="true">🌐</span>
      <span class="lang-cur">${esc(cur.label)}</span><span class="lang-code">${esc(cur.code)}</span>
      <svg class="chev" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="lang-pop" hidden>
      <p class="lang-pop-title">${esc(t('lang.choose'))}</p>
      <ul role="listbox" aria-label="${esc(t('lang.choose'))}">
        ${LANGS.map((l) => `<li><button role="option" aria-selected="${l.id === cur.id}" class="lang-opt ${l.id === cur.id ? 'on' : ''}" data-action="lang-pick" data-id="${l.id}">
          <span class="lang-badge" aria-hidden="true">${esc(l.code)}</span>
          <span class="lang-name">${esc(l.label)}</span>
          <span class="tick" aria-hidden="true">${l.id === cur.id ? '✓' : ''}</span>
        </button></li>`).join('')}
      </ul>
    </div>
  </div>`;
}

function setLangMenu(open) {
  const menu = topRight.querySelector('.lang-menu');
  if (!menu) return;
  menu.querySelector('.lang-pop').hidden = !open;
  menu.querySelector('.lang-btn').setAttribute('aria-expanded', String(open));
  menu.classList.toggle('open', open);
  if (open) (menu.querySelector('.lang-opt.on') || menu.querySelector('.lang-opt')).focus();
}

function popMeter(el, diff, kind) {
  const pop = el.querySelector('.pop');
  pop.textContent = kind === 'money' ? money(diff).replace(/^R/, '+R') : `${diff > 0 ? '+' : ''}${diff}`;
  pop.className = `pop ${diff > 0 ? 'up' : 'down'}`;
  void pop.offsetWidth; // restart the animation
  pop.classList.add('show');
}

function updateHud() {
  const show = screen === 'game' && state?.chapter && HUD_PHASES.includes(state.phase);
  hud.hidden = !show;
  document.body.classList.toggle('with-hud', Boolean(show));
  if (!show) { lastMeters = null; return; }

  const ch = currentChapter(content, state);
  const scale = monthlyEssentials(content, state.setup) || 2000;
  const meters = {
    money: { pct: (state.money / scale) * 100, label: money(state.money), low: state.money < 150 },
    marks: { pct: state.marks, label: `${state.marks}%`, low: state.marks < 50 },
    wellbeing: { pct: state.wellbeing, label: `${state.wellbeing}%`, low: state.wellbeing < 35 },
  };
  for (const [kind, m] of Object.entries(meters)) {
    const el = hud.querySelector(`[data-meter="${kind}"]`);
    el.querySelector('.fill').style.width = `${Math.max(0, Math.min(100, m.pct))}%`;
    el.querySelector('.val').textContent = m.label;
    el.querySelector('.name').textContent = t(`meter.${kind}`);
    el.classList.toggle('low', m.low);
    const diff = lastMeters ? state[kind] - lastMeters[kind] : 0;
    if (diff) popMeter(el, diff, kind);
  }
  lastMeters = { money: state.money, marks: state.marks, wellbeing: state.wellbeing };

  hud.querySelector('.week').textContent = unitLabel(state.week);
  hud.querySelector('.inst').textContent = tx(ch.title);
  hud.querySelector('.dots').innerHTML = Array.from({ length: ch.weeks }, (_, i) =>
    `<span class="dot ${i + 1 < state.week ? 'done' : i + 1 === state.week ? 'now' : ''}"></span>`).join('');
}

// ---------- intro slides ----------

function renderIntro() {
  const n = introStep + 1;
  const last = n === INTRO_SLIDES;
  return `<section class="intro screen" data-slide="${n}">
    <div class="intro-art" aria-hidden="true">${['📉', '🎮', '🗺️'][introStep]}</div>
    <h1>${esc(t(`intro.${n}.title`))}</h1>
    <p class="lead">${esc(t(`intro.${n}.body`))}</p>
    <div class="intro-dots" aria-hidden="true">${Array.from({ length: INTRO_SLIDES }, (_, i) => `<span class="${i === introStep ? 'on' : ''}"></span>`).join('')}</div>
    ${cta(`<button class="btn primary big" data-action="${last ? 'intro-done' : 'intro-next'}">${esc(t(last ? 'intro.go' : 'intro.next'))}</button>
      ${last ? '' : `<button class="btn ghost" data-action="intro-done">${esc(t('intro.skip'))}</button>`}`)}
  </section>`;
}

// ---------- journey map (home) ----------

function setupChips() {
  const st = state.setup;
  const items = [
    content.campuses.length > 1 ? `${tx(content.short)} · ${tx(content.campus)}` : tx(content.short),
    tx(findById(content.courses, st.course)?.label),
    tx(findById(content.housing, st.housing)?.label),
    tx(findById(content.funding, st.funding)?.label),
    money(st.monthlyIncome),
  ];
  return `<div class="setup-chips">${items.map((x) => `<span class="uni">${esc(x)}</span>`).join('')}</div>`;
}

const isBuilt = (id) => content.chapterOrder.find((c) => c.id === id)?.status === 'built';

function yearProgress(y) {
  const built = y.chapters.filter(isBuilt);
  return { built, done: built.filter((id) => state?.completed.includes(id)).length };
}

// "Welcome to the" set along an arc above the title.
function welcomeArc() {
  return `<svg class="arc" viewBox="0 0 600 200" aria-hidden="true">
    <defs><path id="arc-path" d="M 80 190 A 330 330 0 0 1 520 190" /></defs>
    <path class="arc-line" d="M 30 178 A 345 345 0 0 1 570 178" />
    <circle class="arc-dot" cx="30" cy="178" r="5" /><circle class="arc-dot" cx="570" cy="178" r="5" />
    <text class="arc-text"><textPath href="#arc-path" startOffset="50%" text-anchor="middle">${esc(t('home.arc'))}</textPath></text>
  </svg>`;
}

const OB_PAGES = 3;

function obNav(isLast) {
  // The welcome page stands alone; "How it works" is the two pages after it.
  const dots = Array.from({ length: OB_PAGES - 1 }, (_, i) => `<span class="${i === obStep - 1 ? 'on' : ''}"></span>`).join('');
  return `<div class="ob-nav">
    ${obStep ? `<div class="intro-dots" aria-hidden="true">${dots}</div>` : ''}
    ${cta(`<div class="btn-row">
        ${obStep > 0 ? `<button class="btn primary big" data-action="ob-back">← ${esc(t('ob.back'))}</button>` : ''}
        <button class="btn primary big" data-action="ob-next">${esc(t(isLast ? 'ob.start' : 'ob.next'))} →</button>
      </div>
      ${state ? `<div class="ob-links"><button class="link" data-action="home">${esc(t('ob.skip'))}</button></div>` : ''}`)}
  </div>`;
}

function renderWelcome() {
  return `<section class="onboard welcome-page screen">
    <div class="welcome">
      ${welcomeArc()}
      <div class="logo welcome-logo" aria-hidden="true"><span></span><span></span><span></span></div>
      <h1 class="welcome-title">${esc(t('home.title'))}</h1>
      <p class="welcome-about">${esc(t('home.about'))}</p>
      <p class="welcome-sub">${esc(t('home.about2'))}</p>
    </div>
    <blockquote class="hook">${esc(t('why.stat1'))}<cite>${esc(t('why.stat1src'))}</cite></blockquote>
    ${obNav(true)}
    ${installPrompt ? `<div class="stack narrow"><button class="btn ghost" data-action="install">${esc(t('home.install'))}</button></div>` : ''}
  </section>`;
}

function renderWhy() {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const icons = ['💸', '🏠', '💻', '🫂', '📚', '🌧️', '⏰', '📄'];
  return `<section class="onboard screen">
    <p class="tag">${esc(t('why.tag'))}</p>
    <h1>${esc(t('why.title'))}</h1>
    <div class="why-stats">
      <blockquote class="hook">${esc(t('why.stat1'))}<cite>${esc(t('why.stat1src'))}</cite></blockquote>
      <blockquote class="hook">${esc(t('why.stat2'))}<cite>${esc(t('why.stat2src'))}</cite></blockquote>
    </div>
    <h2>${esc(t('why.listTitle'))}</h2>
    <ul class="why-list">${items.map((n, i) => `<li><span class="why-icon" aria-hidden="true">${icons[i]}</span>${esc(t(`why.i${n}`))}</li>`).join('')}</ul>
    <p class="why-everyone">${esc(t('why.everyone'))}</p>
    ${obNav(false)}
  </section>`;
}

function renderHow() {
  const steps = [1, 2, 3, 4];
  const icons = ['🧑‍🎓', '📅', '🤝', '🔮'];
  return `<section class="onboard screen">
    <p class="tag">${esc(t('how.tag'))}</p>
    <h1>${esc(t('how.title'))}</h1>
    <ol class="how-steps">${steps.map((n, i) => `<li>
      <span class="how-num">${n}</span>
      <div><h2><span aria-hidden="true">${icons[i]}</span> ${esc(t(`how.s${n}t`))}</h2><p>${esc(t(`how.s${n}`))}</p></div>
    </li>`).join('')}</ol>
    <p class="fine center">${esc(t('how.note'))}</p>
    ${obNav(true)}
  </section>`;
}

function renderHome() {
  const setupCard = `<article class="year-card setup-card ${state ? 'ready' : 'todo'}">
    <div class="year-icon" aria-hidden="true">🧑‍🎓</div>
    <div class="year-body">
      <h2>${esc(t('home.card.setup'))}</h2>
      ${state ? `<p>${esc(t('home.card.setupDone'))}</p>${setupChips()}` : `<p>${esc(t('home.card.setupNew'))}</p>`}
    </div>
    <button class="btn ${state ? '' : 'primary'}" data-action="${state ? 'change-setup' : 'start'}">${esc(t(state ? 'home.card.edit' : 'home.card.create'))}</button>
  </article>`;
  // A new character can start anywhere; one card is marked as the place most people begin.
  const playing = state?.chapter && !['map', 'forecast', 'plan'].includes(state.phase);
  const startId = state && !state.completed.length && !playing ? (state.setup.status === 'deciding' ? 'before' : 'first') : null;
  const yearCard = (y) => {
    const { built, done } = yearProgress(y);
    const title = t(`home.card.${y.id}`);
    const desc = t(`home.card.${y.id}Desc`);
    const meta = state ? t(built.length === 1 ? 'home.card.progress1' : 'home.card.progress', { n: done, total: built.length })
      : built.length === 1 ? t('home.card.chapter1') : t('home.card.chapters', { n: built.length });
    const all = state && done === built.length;
    const inProgress = state?.chapter && y.chapters.includes(state.chapter) && !['map', 'forecast', 'plan'].includes(state.phase);
    const startHere = y.id === startId;
    return `<article class="year-card ${all ? 'complete' : ''} ${inProgress || startHere ? 'now' : ''}">
      <div class="year-icon" aria-hidden="true">${y.icon}</div>
      <div class="year-body">
        <h2>${esc(title)} ${all ? `<span class="pill pilot">✓ ${esc(t('map.done'))}</span>` : ''}${startHere ? `<span class="pill preview">${esc(t('map.start'))}</span>` : ''}${y.id === 'before' && state && state.setup.status !== 'deciding' ? `<span class="pill general">${esc(t('cr.optional'))}</span>` : ''}</h2>
        <p>${esc(desc)}</p>
        <p class="year-meta">${esc(meta)}</p>
        ${state ? `<div class="year-bar" aria-hidden="true"><span style="width:${(done / built.length) * 100}%"></span></div>` : ''}
      </div>
      <button class="btn ${state && (!startId || startHere) ? 'primary' : ''}" data-action="year" data-id="${y.id}">${esc(state ? t('home.card.open') : t('home.card.needSetup'))}</button>
    </article>`;
  };
  return `<section class="home screen">
    <p class="tag">${esc(t('app.title'))}</p>
    <h1>${esc(t('home.cardsTitle'))}</h1>
    <p class="lead">${esc(t('home.cardsLead'))}</p>
    ${coach(state ? 'homeYears' : 'homeSetup')}
    <div class="year-cards">${setupCard}${YEARS.map(yearCard).join('')}${servicesCard()}${realitiesCard()}</div>
    <div class="stack narrow">
      ${state?.completed.length ? `<button class="btn" data-action="summary">${esc(t('map.summary'))}</button>` : ''}
      ${installPrompt ? `<button class="btn ghost" data-action="install">${esc(t('home.install'))}</button>` : ''}
    </div>
    <div class="ob-links info-links"><button class="link" data-action="how">${esc(t('intro.how'))}</button>${INFO_PAGES.map((p) => `<button class="link" data-action="page" data-id="${p}">${esc(t(`${p}.link`))}</button>`).join('')}</div>
    <p class="fine center">${esc(t('home.privacy'))} ${esc(t('footer.examples'))}</p>
    <p class="fine center">${esc(t('about.independent'))}</p>
  </section>`;
}

// ---------- Services: every support card, at any time, named by the need ----------

const serviceList = () => (content.services || []).filter((x) => content.support[x.support]
  && (!x.housing || content.housing.some((h) => x.housing.includes(h.id))));

// Services and contacts differ by university, so these stay closed until one is chosen.
const lockedOpen = (action) => (state
  ? `<button class="btn ${state.completed.length ? 'primary' : ''}" data-action="${action}">${esc(t('home.card.open'))}</button>`
  : `<button class="btn" data-action="start">${esc(t('home.card.needSetup'))}</button>`);

function servicesCard() {
  return `<article class="year-card">
    <div class="year-icon" aria-hidden="true">🧭</div>
    <div class="year-body">
      <h2>${esc(t('svc.title'))}</h2>
      <p>${esc(t('svc.cardDesc'))}</p>
      ${state ? `<p class="year-meta">${esc(t('svc.meta', { n: serviceList().length }))}</p>` : ''}
    </div>
    ${lockedOpen('services')}
  </article>`;
}

function renderServices() {
  const where = content.campuses.length > 1 ? `${tx(content.name)} · ${tx(content.campus)}` : tx(content.name);
  // Someone who followed a friend's link is looking at the friend's university.
  const guest = ownContent
    ? `<div class="nudge info" role="note"><span>${esc(t('svc.visiting', { inst: tx(content.name) }))}</span>
        <button class="btn small" data-action="services">${esc(t('svc.mine'))}</button></div>`
    : !state ? `<div class="nudge info" role="note"><span>${esc(t('svc.guest', { inst: tx(content.name) }))}</span>
        <button class="btn small" data-action="start">${esc(t('home.card.create'))}</button></div>` : '';
  return `<section class="year screen">
    <button class="link back-link" data-action="home">← ${esc(t('year.back'))}</button>
    <div class="year-head">
      <div class="year-icon big" aria-hidden="true">🧭</div>
      <div>
        <h1>${esc(t('svc.title'))}</h1>
        <p class="lead">${esc(t('svc.lead'))}</p>
        <p class="fine">${esc(where)}</p>
      </div>
    </div>
    ${guest}
    <div class="options needs">
      ${serviceList().map((x) => `<button class="option need" data-action="service" data-id="${esc(x.support)}">
        <span class="need-icon" aria-hidden="true">${x.icon}</span>
        <span class="opt-title">${esc(tx(x.need))}</span>
        <span class="opt-desc">${esc(tx(content.support[x.support].name))}</span>
      </button>`).join('')}
    </div>
  </section>`;
}

function realitiesCard() {
  return `<article class="year-card">
    <div class="year-icon" aria-hidden="true">🛟</div>
    <div class="year-body">
      <h2>${esc(t('cr.title'))}</h2>
      <p>${esc(t('cr.cardDesc'))}</p>
      <p class="year-meta">${esc(t('cr.meta', { n: catalogue.realities.topics.length }))}</p>
    </div>
    ${lockedOpen('realities')}
  </article>`;
}

function renderYear() {
  const y = YEARS.find((x) => x.id === yearId) || YEARS[0];
  const { built, done } = yearProgress(y);
  // Judges playing alone should land on First Term: it shows everything in ~10 minutes.
  const recommended = y.id === 'first' && state.setup.status !== 'current_student' && !state.completed.includes('first_term')
    ? 'first_term' : built.find((id) => !state.completed.includes(id));
  const cards = built.map((id) => {
    const ch = chapterOf(content, id);
    const finished = state.completed.includes(id);
    const inProgress = state.chapter === id && !['map', 'forecast', 'plan'].includes(state.phase);
    const badge = finished ? `<span class="pill pilot">✓ ${esc(t('map.done'))}</span>`
      : id === recommended ? `<span class="pill preview">${esc(id === 'first_term' ? t('year.startHere') : t('map.start'))}</span>` : '';
    const label = inProgress ? t('map.continue', { unit: tx(ch.unit), n: state.week }) : finished ? t('map.replay') : t('map.play');
    return `<article class="chapter-card ${id === recommended ? 'recommended' : ''} ${finished ? 'done' : ''}">
      <div class="chapter-num" aria-hidden="true">${finished ? '✓' : built.indexOf(id) + 1}</div>
      <div>
        <h2>${esc(tx(ch.title))} ${badge}</h2>
        <p class="opt-desc">${esc(tx(ch.subtitle))}</p>
        <p class="fine">${esc(tx(ch.blurb))}</p>
        <button class="btn ${inProgress || id === recommended ? 'primary' : ''} small" data-action="chapter" data-id="${id}">${esc(label)}</button>
      </div>
    </article>`;
  }).join('');
  return `<section class="year screen">
    <button class="link back-link" data-action="home">← ${esc(t('year.back'))}</button>
    <div class="year-head">
      <div class="year-icon big" aria-hidden="true">${y.icon}</div>
      <div>
        <h1>${esc(t(`home.card.${y.id}`))}</h1>
        <p class="lead">${esc(t(`home.card.${y.id}Desc`))}</p>
        <p class="fine">${esc(t(built.length === 1 ? 'home.card.progress1' : 'home.card.progress', { n: done, total: built.length }))}</p>
      </div>
    </div>
    <div class="chapter-cards">${cards}</div>
  </section>`;
}

// ---------- setup (one question per step) ----------

function option(key, value, label, desc, badge) {
  const on = draft[key] === value;
  return `<button class="option ${on ? 'on' : ''}" data-action="pick" data-key="${key}" data-value="${esc(String(value))}" aria-pressed="${on}">
    <span class="opt-title">${esc(label)}${badge ? ` <span class="pill ${badge.kind}">${esc(badge.text)}</span>` : ''}</span>
    ${desc ? `<span class="opt-desc">${esc(desc)}</span>` : ''}
  </button>`;
}

function incomePreview(amount) {
  const b = computeBudget(content, { ...draft, monthlyIncome: amount });
  return `<p>${esc(t('setup.incomeBasics', { area: tx(content.area), essentials: money(b.essentials) }))}</p>
    <p class="tier-pill tier-${b.tier}">${esc(t(`tier.${b.tier}.short`))}</p>`;
}

// The institution list. With a handful it is a plain list; with many it gets
// a search box and groups by kind of institution.
function institutionOptions(query = '') {
  const all = openDirectory(catalogue.directory);
  const found = searchDirectory(all, query, currentLang());
  const row = (d) => option('institution', d.id, tx(d.name), [tx(d.tagline), d.province].filter(Boolean).join(' · '), { kind: 'pilot', text: t(`setup.${d.status}`) });
  if (!found.length) return `<p class="fine">${esc(t('setup.noMatch'))}</p>`;
  if (all.length < SEARCH_FROM) return `<div class="options">${found.map(row).join('')}</div>`;
  return TYPES.map((type) => {
    const group = found.filter((d) => (d.type || 'university') === type);
    return group.length ? `<h2 class="sub">${esc(t(`setup.type.${type}`))} (${group.length})</h2><div class="options">${group.map(row).join('')}</div>` : '';
  }).join('');
}

function institutionPicker() {
  const many = openDirectory(catalogue.directory).length >= SEARCH_FROM;
  return `${many ? `<label class="income-input">${esc(t('setup.search'))}
      <input id="inst-search" type="search" autocomplete="off" placeholder="${esc(t('setup.searchHint'))}"></label>` : ''}
    <div id="inst-list">${institutionOptions()}</div>`;
}

function setupStep(key) {
  const v = { area: tx(content.area), short: tx(content.short) };
  const list = (items, k) => items.map((x) => option(k, x.id, tx(x.label), tx(x.desc, v))).join('');
  const yesNo = (k, yes, no, noDesc) => `<div class="options two">${option(k, 'yes', yes)}${option(k, 'no', no, noDesc)}</div>`;
  switch (key) {
    case 'institution':
      return {
        title: t('setup.institution'),
        hint: t('setup.institutionHint'),
        body: institutionPicker(),
      };
    case 'campus':
      return {
        title: t('setup.campus'),
        hint: t('setup.campusHint'),
        body: `<div class="options">${content.campuses.map((c) => option('campus', c.id, tx(c.name), tx(c.desc))).join('')}</div>`,
      };
    case 'status': return { title: t('setup.status'), body: `<div class="options">${list(content.statuses, 'status')}</div>` };
    case 'course': return { title: t('setup.course'), body: `<div class="options">${list(content.courses, 'course')}</div>` };
    case 'housing': return { title: t('setup.housing'), body: `<div class="options">${list(content.housing, 'housing')}</div>` };
    case 'origin': return { title: t('setup.hometown'), body: `<div class="options">${list(content.origins, 'origin')}</div>` };
    case 'funding': return { title: t('setup.funding'), body: `<div class="options">${list(content.funding, 'funding')}</div>` };
    case 'income': {
      const suggested = suggestedIncome(content, draft);
      const value = draft.monthlyIncome ?? suggested;
      const funding = findById(content.funding, draft.funding);
      return {
        title: t('setup.income'),
        hint: t('setup.incomeHint'),
        body: `<div class="income">
          <div class="presets">${content.incomePresets.map((p) => `<button class="chip ${p === value ? 'on' : ''}" data-action="preset" data-value="${p}">${esc(money(p))}</button>`).join('')}</div>
          <label class="income-input">${esc(t('setup.incomeCustom'))}
            <span class="rand">R<input id="income" type="number" inputmode="numeric" min="0" step="50" value="${value}"></span>
          </label>
          ${funding ? `<p class="fine">${esc(t('setup.incomeSuggest', { funding: tx(funding.label), amount: money(suggested) }))}</p>` : ''}
          <div class="income-preview" id="income-preview">${incomePreview(value)}</div>
        </div>`,
        cta: `<button class="btn primary big" data-action="income-next">${esc(t('setup.next'))}</button>`,
      };
    }
    case 'laptop': return { title: t('setup.laptop'), body: yesNo('laptop', t('setup.laptopYes'), t('setup.laptopNo'), t('setup.laptopNoDesc')) };
    case 'family_needs': return { title: t('setup.family'), body: yesNo('family_needs', t('setup.familyYes'), t('setup.familyNo')) };
    case 'age_role': return { title: t('setup.age'), body: `<div class="options two">${list(content.ages, 'age_role')}</div>` };
    default: {
      const stepFor = { age: 'age_role', family: 'family_needs' };
      const label = (k, val) => `<li><span class="k">${esc(t(`setup.label.${k}`))}</span><span class="v">${esc(val)}</span>
        <button class="link" data-action="goto-step" data-step="${STEPS.indexOf(stepFor[k] || k)}">${esc(t('setup.change'))}</button></li>`;
      const inst = catalogue.directory.find((i) => i.id === draft.institution);
      return {
        title: t('setup.review'),
        hint: `${t('setup.reviewHint')}${state ? ` ${t('map.resetWarn')}` : ''}`,
        body: `<ul class="review">
          ${label('institution', tx(inst.name))}
          ${content.campuses.length > 1 ? label('campus', tx(content.campus)) : ''}
          ${label('status', tx(findById(content.statuses, draft.status).label))}
          ${label('course', tx(findById(content.courses, draft.course).label))}
          ${label('housing', tx(findById(content.housing, draft.housing).label))}
          ${label('funding', tx(findById(content.funding, draft.funding).label))}
          ${label('income', money(draft.monthlyIncome))}
          ${label('origin', tx(findById(content.origins, draft.origin).label))}
          ${label('laptop', draft.laptop === 'yes' ? t('setup.laptopYes') : t('setup.laptopNo'))}
          ${draft.funding === 'family' ? '' : label('family', draft.family_needs === 'yes' ? t('setup.familyYes') : t('setup.familyNo'))}
          ${label('age', tx(findById(content.ages, draft.age_role).label))}
        </ul>
        <p class="note">${esc(t('setup.startMoney', { money: money(content.start.money) }))}</p>`,
        cta: `<button class="btn primary big" data-action="begin">${esc(t('setup.save'))}</button>`,
      };
    }
  }
}

function renderSetup() {
  const key = STEPS[step];
  const s = setupStep(key);
  const total = STEPS.length - 1;
  return `<section class="setup screen">
    <div class="progress">
      <button class="back" data-action="setup-back" aria-label="${esc(t('setup.back'))}">←</button>
      <div class="progress-bar"><span style="width:${(Math.min(step, total) / total) * 100}%"></span></div>
      <span class="progress-label">${key === 'review' ? '✓' : esc(t('setup.step', { n: step + 1, total }))}</span>
    </div>
    <h1>${esc(s.title)}</h1>
    ${s.hint ? `<p class="lead">${esc(s.hint)}</p>` : ''}
    ${s.body}
    ${s.cta ? cta(s.cta) : ''}
  </section>`;
}

// Steps that don't apply: family-funded students aren't asked whether family
// needs money from them, and a one-campus university has no campus question.
const skipStep = (i) => (STEPS[i] === 'family_needs' && draft.funding === 'family')
  || (STEPS[i] === 'campus' && content.campuses.length < 2);

// After a change made from the review screen, any answer it invalidated is asked again.
function firstMissing() {
  return STEPS.findIndex((k, i) => k !== 'review' && !skipStep(i) && (k === 'income' ? draft.monthlyIncome : draft[k]) === undefined);
}

function advanceSetup() {
  const missing = fromReview ? firstMissing() : -1;
  if (missing >= 0) step = missing;
  else if (fromReview) { step = STEPS.indexOf('review'); fromReview = false; } else {
    step = Math.min(step + 1, STEPS.length - 1);
    while (skipStep(step)) step += 1;
  }
  render();
}

// ---------- chapter intro (with the money forecast for First Term) ----------

function ledgerList(entries) {
  return `<ul class="ledger">${entries.map((e) => {
    const label = e.key ? t(e.key, { label: tx(e.label) }) : tx(e.label);
    const any = e.money || e.marks || e.wellbeing;
    return `<li><span>${esc(label)}</span><span class="deltas">${delta(e.money, 'money')}${delta(e.marks, 'marks')}${delta(e.wellbeing, 'wellbeing')}${any ? '' : '<span class="delta zero">R0</span>'}</span></li>`;
  }).join('')}</ul>`;
}

// Support a player starting in a later year hasn't met yet. Anyone who played
// the earlier chapters has already seen these, so they aren't repeated.
function recapBlock(ch) {
  const ids = (ch.recap || []).filter((id) => content.support[id] && !state.supportSeen.includes(id));
  if (!ids.length) return '';
  return `${coach('recap')}<div class="card flat recap">
    <h2>${esc(t('chapter.recap'))}</h2>
    <p class="fine">${esc(t('chapter.recapLead'))}</p>
    <div class="chips">${ids.map((id) => `<button class="chip" data-action="overlay" data-ids="${id}">${esc(tx(content.support[id].name))}</button>`).join('')}</div>
  </div>`;
}

function renderChapterIntro() {
  const ch = currentChapter(content, state);
  let moneyBlock = '';
  if (ch.moneyIntro) {
    const f = moneyForecast(content, state.setup);
    const lines = [
      f.late.runOut ? t('money.lateRunOut', { n: f.lateWeeks, week: f.late.runOut }) : t('money.lateOk', { n: f.lateWeeks }),
      f.onTime.runOut ? t('money.onTimeRunOut', { week: f.onTime.runOut }) : t('money.onTimeOk'),
    ];
    moneyBlock = `<h2>${esc(t('money.title'))}</h2>
      <div class="card headline ${f.late.runOut ? 'warn' : 'ok'}">
        <p class="big-line">${esc(lines[0])}</p><p>${esc(lines[1])}</p>
      </div>
      <div class="card">${cashFlowChart(f, f.lateWeeks)}</div>
      <p class="fine">${esc(t('money.weekly', { income: money(f.income), costs: money(f.costs), start: money(f.start) }))}
        ${esc(t('money.inGame'))} ${esc(t('footer.examples'))}</p>`;
  }
  return `<section class="chapter-intro centred screen">
    <div class="centred-body">
      <p class="tag">${esc(t('map.title'))}</p>
      <h1>${esc(tx(ch.title))}</h1>
      <p class="lead">${esc(tx(ch.subtitle))}</p>
      <p>${esc(tx(ch.blurb))}</p>
      ${recapBlock(ch)}
      ${state.ledger.length ? `<div class="card flat">${ledgerList(state.ledger)}</div>` : ''}
      ${moneyBlock}
    </div>
    ${cta(`<button class="btn primary big" data-action="start-week">${esc(t('chapter.start', { chapter: tx(ch.title) }))}</button>`)}
  </section>`;
}

// ---------- weekly screens ----------

function renderDashboard() {
  const ch = currentChapter(content, state);
  const ev = eventForWeek(content, state);
  const goKey = ev?.type === 'tests' ? 'dash.goTests' : ev?.type === 'results' ? 'dash.goResults' : 'dash.go';
  const nudges = [];
  if (state.week === 1 && ch.economy && computeBudget(content, state.setup).tier === 'gap') {
    nudges.push(`<div class="nudge info">${esc(t('dash.gapNotice'))}</div>`);
  }
  if (state.money < 0) nudges.push(`<div class="nudge warn">${esc(t('dash.inDebt'))}</div>`);
  if (ch.economy && state.money < 150 && canSeekHelp(content, state, 'food')) {
    nudges.push(`<div class="nudge help">${esc(t('dash.lowMoney'))}
      <button class="btn small" data-action="seek" data-kind="food">${esc(t('dash.seekFood'))}</button></div>`);
  }
  if (state.wellbeing < 35) {
    nudges.push(`<div class="nudge care">${esc(t('dash.lowWellbeing'))}
      <button class="btn small" data-action="overlay" data-ids="counselling">${esc(t('dash.lowWellbeingBtn'))}</button></div>`);
  }
  return `<section class="dash centred screen">
    <div class="centred-body">
      <p class="tag">${esc(tx(ch.title))} · ${esc(t('dash.breakTag'))}</p>
      <h1>${esc(t(state.week === 1 ? 'dash.beforeFirst' : 'dash.before', { unit: tx(ch.unit), n: state.week, prev: state.week - 1 }))}</h1>
      <p class="lead">${esc(t(state.ledger.length ? 'dash.breakLead' : 'dash.breakQuiet'))}</p>
      ${state.ledger.length ? `<h2 class="sub">${esc(t('dash.since'))}</h2><div class="card flat">${ledgerList(state.ledger)}</div>` : ''}
      ${nudges.join('')}
      ${coach(currentMini(content, state) && state.mini.choice === null ? 'mini' : 'break')}
      ${miniBlock()}
      ${ch.economy && state.nightHabit ? habitPicker() : ''}
    </div>
    ${cta(`${ev ? `<button class="btn primary big" data-action="open-event">${esc(t(goKey, { unit: tx(ch.unit), n: state.week }))}</button>`
      : `<button class="btn primary big" data-action="next">${esc(t('outcome.next'))}</button>`}
      <button class="btn ghost" data-action="leave">${esc(t('dash.leave'))}</button>`)}
  </section>`;
}

// A mini: one tap, two options, a one-line result.
function miniBlock() {
  const mini = currentMini(content, state);
  if (!mini) return '';
  const v = vars();
  if (state.mini.choice === null) {
    return `<article class="card mini" role="group" aria-label="${esc(t('mini.label'))}">
      <p class="tag">${esc(t('mini.label'))}</p>
      <p>${rich(tx(mini.text, v))}</p>
      <div class="choices">${mini.choices.map((c, i) => `<button class="choice" data-action="mini" data-id="${i}">
        <span class="choice-text">${esc(tx(c.label, v))}</span></button>`).join('')}</div>
    </article>`;
  }
  const picked = mini.choices[state.mini.choice];
  return `<article class="card mini done" role="status">
    <p class="tag">${esc(t('mini.label'))}</p>
    <p><strong>${esc(tx(picked.label, v))}.</strong> ${rich(tx(picked.outcome, v))}</p>
  </article>`;
}

// Change the going-out habit any week; the cost comes off at the end of the week.
function habitPicker() {
  return `<div class="habit-picker" role="group" aria-label="${esc(t('dash.habit'))}">
    <span class="habit-label">🎶 ${esc(t('dash.habit'))}</span>
    <span class="chips">${['often', 'sometimes', 'rarely'].map((h) => `<button class="chip ${state.nightHabit === h ? 'on' : ''}" data-action="habit" data-id="${h}" aria-pressed="${state.nightHabit === h}">${esc(t(`habit.${h}`))}</button>`).join('')}</span>
  </div>`;
}

function crisisLinks() {
  return [...(content.support.counselling.contacts || []), ...(content.support.higher_health?.contacts || [])].map(contactLink).join('');
}

function renderNote() {
  return `<section class="note-screen screen">
    <article class="card event-card soft">
      <p class="tag">${esc(t('note.title'))}</p>
      <h1>${esc(t('note.title'))}</h1>
      <p>${esc(t('note.body'))}</p>
      <div class="contacts">${crisisLinks()}</div>
    </article>
    ${cta(`<button class="btn primary big" data-action="note-continue">${esc(t('note.continue'))}</button>
      <button class="btn ghost" data-action="note-skip">${esc(t('note.skip'))}</button>`)}
  </section>`;
}

function renderEvent() {
  const ev = eventForWeek(content, state);
  if (ev.type === 'tests') return renderTests(ev);
  if (ev.type === 'results') return renderResults(ev);
  const v = vars(ev);
  // A step can hold more than one question: say which one this is.
  const questions = state.queue.filter((id) => findEvent(id)?.choices);
  const part = questions.length > 1 && ev.choices ? ` · ${t('card.part', { n: questions.indexOf(ev.id) + 1, total: questions.length })}` : '';
  const tag = TYPE_TAG[ev.type] ? t(TYPE_TAG[ev.type]) : unitLabel(state.week) + part;
  if (!ev.choices) {
    return `<section class="event screen">
      <article class="card event-card ${ev.type}">
        <p class="tag">${esc(tag)}</p>
        <h1>${ev.type === 'win' ? '🎉 ' : ''}${esc(tx(ev.title, v))}</h1>
        <p>${rich(tx(ev.text, v))}</p>
        ${ev.effects ? `<div class="deltas big">${delta(ev.effects.money, 'money')}${delta(ev.effects.marks, 'marks')}${delta(ev.effects.wellbeing, 'wellbeing')}</div>` : ''}
      </article>
      ${cta(`<button class="btn primary big" data-action="ack">${esc(t('card.ack'))}</button>`)}
    </section>`;
  }
  const soft = ev.sensitive || ev.content_note;
  const canPay = affordableChoices(state, ev);
  const text = rich(tx(ev.text, v));
  return `<section class="event screen">
    ${coachSeen('card') && text.includes('class="term"') ? coach('terms') : coach('card')}
    <article class="card event-card ${soft ? 'soft' : ''} ${ev.type}">
      <p class="tag">${esc(tag)}</p>
      <h1>${esc(tx(ev.title, v))}</h1>
      <p>${text}</p>
      ${ev.tradeoff ? `<p class="note">${esc(t('event.tradeoff'))}</p>` : ''}
      ${ev.type === 'friend_story' ? `<p class="note">${esc(t('card.friendNote'))}</p>` : ''}
    </article>
    ${soft ? `<div class="sensitive" role="note"><p>${esc(t('event.sensitive'))}</p><div class="contacts">${crisisLinks()}</div></div>` : ''}
    <div class="choices">
      ${ev.choices.map((c, i) => `<button class="choice" data-action="choose" data-id="${c.id}" ${canPay.includes(c.id) ? '' : `disabled title="${esc(t('event.cantAfford', { money: money(state.money) }))}"`}>
        <span class="key" aria-hidden="true">${i + 1}</span>
        <span class="choice-text">${esc(tx(c.label, v))}</span>
      </button>`).join('')}
    </div>
    <p class="fine keys-tip">${esc(t('event.keys'))}</p>
  </section>`;
}

function renderOutcome() {
  const ev = resolveEvent(content, state, state.last.eventId);
  const choice = findById(ev.choices, state.last.choiceId);
  const d = state.last.deltas;
  const v = vars(ev);
  const hasSupport = state.last.support.length > 0;
  const { buffer, bufferSaved } = state.last;
  return `<section class="outcome screen">
    ${hasSupport ? coach('support') : undo ? coach('outcome') : ''}
    <article class="card">
      <p class="tag">${esc(t('outcome.title'))}</p>
      <h1>${esc(tx(choice.label, v))}</h1>
      <div class="deltas big">${delta(d.money, 'money')}${delta(d.marks, 'marks')}${delta(d.wellbeing, 'wellbeing')}</div>
      <p>${rich(tx(choice.outcome, v))}</p>
      ${d.short > 0 && !buffer ? `<p class="nudge warn">${esc(t('outcome.short', { short: money(d.short) }))}</p>` : ''}
      ${bufferSaved ? `<p class="nudge help">${esc(t('buffer.saved', { saved: money(bufferSaved) }))}</p>` : ''}
      ${buffer ? `<p class="nudge ${buffer === 'ok' ? 'help' : 'warn'}">${esc(t(`buffer.${buffer}`))}</p>` : ''}
      ${choice.tip ? `<div class="lesson"><strong>${esc(t('outcome.tip'))}</strong> ${rich(tx(choice.tip, v))}</div>` : ''}
      ${ev.realities ? `<p class="note">${esc(t('cr.fromCard'))}</p>` : ''}
    </article>
    ${cta(`<button class="btn primary big" data-action="${hasSupport ? 'show-support' : 'next'}">
      ${esc(hasSupport ? t('outcome.support') : nextLabel())}</button>
      ${undo ? `<button class="btn ghost" data-action="undo">← ${esc(t('outcome.undo'))}</button>` : ''}`)}
  </section>`;
}

// Where a service is and how to reach it: building, room, hours, email, a
// campus map and, where there is one, the page it tells you to look at.
function whereParts(s) {
  const b = content.map?.buildings.find((x) => x.id === s.building);
  const page = content.pages?.[s.page];
  const place = b ? [tx(b.name), tx(s.room), tx(s.hours)].filter(Boolean).join(' · ') : tx(s.away);
  const links = [
    page ? `<button class="contact" data-action="sheet" data-kind="page" data-id="${esc(s.page)}"><span aria-hidden="true">📄</span> ${esc(tx(page.title))}</button>` : '',
    b ? `<button class="contact" data-action="sheet" data-kind="map" data-id="${esc(b.id)}"><span aria-hidden="true">🗺️</span> ${esc(t('support.map'))}</button>` : '',
    s.email ? `<a class="contact" href="mailto:${esc(s.email)}"><span aria-hidden="true">✉️</span> ${esc(s.email)}</a>` : '',
  ].join('');
  return { place: place ? `<p><strong>${esc(t('support.where'))}</strong> ${esc(place)}</p>` : '', links };
}

function whereBlock(s) {
  const { place, links } = whereParts(s);
  return `${place}${links ? `<div class="contacts">${links}</div>` : ''}`;
}

function campusMap(active) {
  const lines = (name) => { const w = name.split(' '); const mid = Math.ceil(w.length / 2); return w.length > 2 ? [w.slice(0, mid).join(' '), w.slice(mid).join(' ')] : w.length === 2 && name.length > 13 ? w : [name]; };
  return `<svg class="campus-map" viewBox="0 0 320 232" role="img" aria-label="${esc(t('support.map'))}">
    <rect width="320" height="232" rx="12" fill="var(--surface-2)" />
    <path d="M160 232 V105 M8 105 H312" stroke="var(--line)" stroke-width="12" fill="none" stroke-linecap="round" />
    <text x="150" y="226" text-anchor="end" font-size="9" font-weight="700" fill="var(--muted)">${esc(t('support.gate'))}</text>
    ${content.map.buildings.map((b) => {
      const on = b.id === active;
      const text = lines(tx(b.name));
      return `<g><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="${on ? 'var(--accent)' : 'var(--surface)'}" stroke="var(--brand)" stroke-width="${on ? 2.5 : 1}" />
        ${text.map((l, i) => `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 3 + (i - (text.length - 1) / 2) * 10}" text-anchor="middle" font-size="8.5" font-weight="${on ? 800 : 600}" fill="${on ? '#17202e' : 'var(--ink)'}">${esc(l)}</text>`).join('')}</g>`;
    }).join('')}
  </svg>`;
}

function renderSheet() {
  let body = '';
  let official = '';
  if (sheet.kind === 'term') {
    const g = content.glossary[sheet.id];
    body = `<p class="tag">${esc(t('term.tag'))}</p>
      <h2>${esc(tx(g.term))}</h2>
      <p>${esc(tx(g.def))}</p>`;
  } else if (sheet.kind === 'link') {
    // A real external site: say what it is before leaving the app.
    const link = Object.values(content.support).flatMap((s) => s.contacts || []).find((c) => c.url === sheet.id);
    body = `<p class="tag">${esc(t('link.tag'))}</p>
      <h2>${esc(link.label)}</h2>
      <p>${esc(link.preview ? tx(link.preview) : t('link.leaving'))}</p>`;
    official = `<a class="btn primary big" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(t('link.open', { site: link.label }))} ↗</a>`;
  } else if (sheet.kind === 'map') {
    const b = content.map.buildings.find((x) => x.id === sheet.id);
    body = `<p class="tag">${esc(t('support.map'))}</p>
      <h2>${esc(tx(b.name))}</h2>
      ${campusMap(b.id)}
      <h3>${esc(t('support.directions'))}</h3>
      <p>${esc(tx(b.directions))}</p>`;
  } else {
    const p = content.pages[sheet.id];
    body = `<p class="tag">${esc(tx(content.short))}</p>
      <h2>${esc(tx(p.title))}</h2>
      <p>${esc(tx(p.intro))}</p>
      <ul class="rehearsed">${p.items.map((x) => `<li><b>${esc(tx(x.name))}</b><span>${esc(tx(x.detail))}</span></li>`).join('')}</ul>
      ${p.note ? `<div class="lesson">${esc(tx(p.note))}</div>` : ''}`;
    // A licensed campus sets "url" on the page; the fictional demo has no site to open.
    official = p.url
      ? `<a class="btn primary big" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(t('link.openPage'))} ↗</a>`
      : `<button class="btn primary big" data-action="no-site">${esc(t('link.openPage'))} ↗</button>`;
  }
  return `<div class="overlay" role="dialog" aria-modal="true" data-action="close-sheet-bg">
    <div class="overlay-inner">
      <article class="card support-card">${body}
        ${['link', 'term'].includes(sheet.kind) ? '' : `<p class="fine preview-note">${esc(t('support.demo', { short: tx(content.short) }))}</p>`}
      </article>
      <div class="stack">${official}
        <button class="btn ${official ? '' : 'primary big'}" data-action="close-sheet">${esc(t('support.close'))}</button></div>
    </div>
  </div>`;
}

// What the service is and the buttons to reach it; the rest opens on a tap.
function supportCard(id) {
  const s = content.support[id];
  const v = { short: tx(content.short), area: tx(content.area) };
  const { place, links } = whereParts(s);
  const ways = `${(s.contacts || []).map(contactLink).join('')}${links}`;
  return `<article class="card support-card">
    <p class="tag">${esc(t('support.title', { inst: tx(content.short) }))}</p>
    <h2>${esc(tx(s.name))}</h2>
    <p>${rich(tx(s.offers, v))}</p>
    ${ways ? `<div class="contacts">${ways}</div>` : ''}
    <details class="more">
      <summary>${esc(t('support.more'))}</summary>
      <h3>${esc(t('support.reach'))}</h3>
      <p>${rich(tx(s.reach, v).replace(/:\s*$/, '.'))}</p>
      ${place}
      ${s.tip ? `<div class="lesson"><strong>${esc(t('outcome.tip'))}</strong> ${rich(tx(s.tip, v))}</div>` : ''}
      <div class="contacts"><button class="contact" data-action="share-service" data-id="${esc(id)}"><span aria-hidden="true">📤</span> ${esc(t('svc.share'))}</button></div>
    </details>
  </article>`;
}

// Said once under the cards, not on every one.
function supportNote() {
  const note = content.status === 'demo' ? t('support.demo', { short: tx(content.short) })
    : content.status === 'general' ? t('support.general') : '';
  return `${screen === 'services' ? '' : `<p class="saved">✓ ${esc(t('support.saved'))}</p>`}
    ${note ? `<p class="fine preview-note">${esc(note)}</p>` : ''}`;
}

// Whether a support card has something to tap: a map, an email, a page or a link.
const hasWays = (id) => { const s = content.support[id]; return Boolean((s.building && content.map?.buildings.some((b) => b.id === s.building)) || s.email || content.pages?.[s.page] || s.contacts?.length); };

function renderSupport() {
  return `<section class="support screen">
    ${state.last.support.some(hasWays) && !coachSeen('reach') ? coach('reach') : coach('services')}
    <div class="support-list">${state.last.support.map((id, i) => (i === 0 ? supportCard(id)
      : `<details class="fold"><summary>${esc(tx(content.support[id].name))}</summary>${supportCard(id)}</details>`)).join('')}</div>
    ${supportNote()}
    ${cta(`<button class="btn primary big" data-action="next">${esc(nextLabel())}</button>`)}
  </section>`;
}

function renderFriday() {
  if (state.fridayStep === 'habit') {
    const night = fridayAmount(content, state);
    return `<section class="friday screen">
      <article class="card event-card friday-card">
        <p class="tag">${esc(unitLabel(state.week))}</p>
        <h1>${esc(t('friday.habitTitle'))}</h1>
        <p>${esc(t('friday.habitText', { amount: money(night) }))}</p>
        <p class="note">${esc(t('friday.habitNote'))}</p>
      </article>
      <div class="choices">
        ${['often', 'sometimes', 'rarely'].map((h, i) => `<button class="choice" data-action="friday" data-id="${h}"><span class="key" aria-hidden="true">${i + 1}</span>
          <span class="choice-text">${esc(t(`friday.${h}`))}</span></button>`).join('')}
      </div>
    </section>`;
  }
  const tm = fridayTemptation(content, state);
  const amount = money(tm.amount);
  return `<section class="friday screen">
    <article class="card event-card friday-card">
      <p class="tag">${esc(t('friday.title'))}</p>
      <h1>${esc(t('friday.treatTitle'))}</h1>
      <p>${esc(tx(tm.text, { amount }))}</p>
    </article>
    <div class="choices">
      <button class="choice" data-action="friday" data-id="yes" ${canAffordTreat(content, state) ? '' : `disabled title="${esc(t('event.cantAfford', { money: money(state.money) }))}"`}><span class="key" aria-hidden="true">1</span><span class="choice-text">${esc(t('friday.yes', { amount }))}</span></button>
      <button class="choice" data-action="friday" data-id="no"><span class="key" aria-hidden="true">2</span><span class="choice-text">${esc(t('friday.no'))}</span></button>
    </div>
  </section>`;
}

function testBlock(test) {
  return `<article class="card test ${test.passed ? 'pass' : 'fail'}">
    <div class="test-head">
      <h2>${esc(tx(test.name))}</h2>
      <span class="score">${test.score}%</span>
    </div>
    <div class="bar"><span style="width:${test.score}%"></span><i style="left:50%"></i></div>
    <p class="verdict">${esc(test.passed ? t('tests.pass') : t('tests.fail'))}</p>
    <details>
      <summary>${esc(t('tests.why'))}</summary>
      <ul class="ledger">${test.factors.map((f) => `<li><span>${esc(f.key ? t(f.key) : tx(f.label, vars()))}</span><span class="delta ${f.value >= 0 ? 'up' : 'down'}">${f.key === 'tests.base' ? f.value : (f.value > 0 ? '+' : '') + f.value}</span></li>`).join('')}</ul>
    </details>
  </article>`;
}

function renderTests(ev) {
  const tests = state.results[state.chapter] || computeTests(content, state);
  return `<section class="tests screen">
    <article class="card">
      <p class="tag">${esc(unitLabel(state.week))}</p>
      <h1>${esc(tx(ev.title))}</h1>
      <p>${rich(tx(ev.text))}</p>
    </article>
    <div class="test-grid">${tests.map(testBlock).join('')}</div>
    ${cta(`<button class="btn primary big" data-action="next">${esc(t('tests.continue'))}</button>`)}
  </section>`;
}

function renderResults(ev) {
  const r = computeResults(content, state);
  const v = vars();
  return `<section class="results screen">
    <article class="card">
      <p class="tag">${esc(tx(ev.title))}</p>
      <h1>${esc(tx(r.tier.title))}</h1>
      <p class="big-stat">${esc(t('results.passed', { n: r.passed, total: r.tests.length }))}</p>
      <p>${rich(tx(r.tier.body))}</p>
      <ul class="final">
        <li><span>${esc(t('meter.money'))}</span><b>${esc(money(state.money))}</b></li>
        <li><span>${esc(t('meter.marks'))}</span><b>${state.marks}%</b></li>
        <li><span>${esc(t('meter.wellbeing'))}</span><b>${state.wellbeing}%</b></li>
      </ul>
    </article>
    <article class="card support-card">
      <h2>${esc(tx(content.support.progression.name))}</h2>
      <p>${rich(tx(r.progressionAll, v))}</p>
      <p>${rich(tx(r.progression, v))}</p>
      <p>${rich(tx(content.support.progression.reach))}</p>
    </article>
    ${cta(`<button class="btn primary big" data-action="finish">${esc(t('results.plan'))}</button>`)}
  </section>`;
}

// ---------- Semester Forecast (end of every chapter) ----------

function forecastSummaryHtml(view) {
  const ai = state.ai?.[`${state.chapter}:${currentLang()}`];
  const template = `<p class="big-line">${esc(view.highest)}</p>
    <p>${esc(view.cause)} ${esc(view.pattern)}</p>
    ${view.memory ? `<p class="memory">${esc(view.memory)}</p>` : ''}
    <p><strong>${esc(t('fc.planIntro'))}</strong></p>
    <ol class="steps">${view.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>`;
  if (ai && showAi) {
    return `<p class="ai-label">✨ ${esc(t('fc.aiLabel'))}</p>
      ${ai.split(/\n{2,}/).map((para) => `<p>${esc(para)}</p>`).join('')}
      <button class="link" data-action="toggle-ai">${esc(t('fc.aiOriginal'))}</button>`;
  }
  return template + (ai ? `<button class="link" data-action="toggle-ai">${esc(t('fc.aiShow'))}</button>` : '');
}

function renderForecast() {
  const view = forecastView(content, state);
  const { fc } = view;
  const p = fc.profile;
  const pips = (n) => `<span class="pips">${Array.from({ length: Math.max(p.total, 1) }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  requestAi(view);
  return `<section class="forecast screen">
    <p class="tag">${esc(tx(currentChapter(content, state).title))}</p>
    <h1>${esc(t('fc.title'))}</h1>
    <p class="lead">${esc(fc.isNext ? t('fc.leadNext', { chapter: view.targetTitle }) : t('fc.leadFinal'))}</p>

    ${fc.isNext ? `<div class="nudge info" role="note">🔮 ${esc(t('fc.ahead', { chapter: view.targetTitle, current: tx(currentChapter(content, state).title) }))}</div>` : ''}
    ${coach('forecast')}
    <article class="card fc-summary" id="fc-summary" aria-live="polite">
      <h2>${esc(t('fc.summary'))}</h2>
      ${forecastSummaryHtml(view)}
    </article>

    <details class="fold">
    <summary>${esc(t('fc.details'))}</summary>
    <div class="fc-grid">
      <article class="card">
        <h2>${esc(t('fc.weeksFor', { chapter: view.targetTitle }))}</h2>
        ${riskStrip(fc.risks, fc.top, (c) => t(`fc.c.${c}`))}
      </article>

      <article class="card">
        <h2>${esc(t('fc.patternTitle'))}</h2>
        <p>${esc(view.count || view.pattern)}</p>
        <ul class="coping">
          ${TAGS.map((k) => `<li><span>${esc(t(`fc.tag.${k}`))}</span>${pips(p.counts[k])}<b>${p.counts[k]}</b></li>`).join('')}
        </ul>
      </article>

      <article class="card">
        <h2>${esc(t('fc.leaksTitle'))}</h2>
        <p>${esc(view.leaks)}</p>
        <ul class="coping">
          ${LEAKS.map((k) => `<li><span>${esc(t(`leak.${k}`))}</span><span></span><b>${esc(money(fc.leaks.byKind[k] || 0))}</b></li>`).join('')}
        </ul>
        ${subscriptionsHtml()}
      </article>

      <article class="card">
        <h2>${esc(t('plan.buffer'))}</h2>
        <p class="big-line">${esc(money(fc.buffer.target))}</p>
        <p>${esc(t('plan.bufferBody', { target: money(fc.buffer.target) }))}</p>
      </article>

      <article class="card wide">
        <h2>${esc(t('money.title'))}</h2>
        ${cashFlowChart(fc.money, fc.money.lateWeeks)}
      </article>
    </div>
    </details>

    <details class="card how">
      <summary>${esc(t('fc.how'))}</summary>
      <p>${esc(t('fc.howBody'))}</p>
    </details>

    ${cta(`<button class="btn primary big" data-action="to-plan">${esc(t('fc.go'))}</button>`)}
  </section>`;
}

function subscriptionsHtml() {
  const subs = activeSubscriptions(state);
  if (!subs.length) return `<p class="fine">${esc(t('fc.subsNone'))}</p>`;
  const year = subs.reduce((a, x) => a + x.yearly, 0);
  return `<h3>${esc(t('fc.subs'))}</h3>
    <ul class="coping">${subs.map((x) => `<li><span>${esc(tx(x.label))}</span><span></span><b>${esc(t('fc.subsMonth', { amount: money(x.monthly) }))}</b></li>`).join('')}</ul>
    <p class="fine">${esc(t('fc.subsYear', { amount: money(year) }))}</p>`;
}

// Ask the optional AI writer once per chapter and language; the template shows meanwhile.
function requestAi(view) {
  const key = `${state.chapter}:${currentLang()}`;
  if (!caps.ai || aiPending || state.ai?.[key] || !navigator.onLine) return;
  aiPending = true;
  const payload = aiPayload(content, state, view.fc, {
    lang: currentLang(),
    tx,
    tier: computeBudget(content, state.setup).tier,
    actions: view.actions,
    services: contactIds(content, state).map((id) => {
      const s = content.support[id];
      return { name: tx(s.name), phones: (s.contacts || []).filter((c) => c.tel).map((c) => c.label) };
    }),
  });
  aiPlan(payload).then((text) => {
    aiPending = false;
    if (!text) return;
    state = { ...state, ai: { ...state.ai, [key]: text } };
    save();
    const el = document.getElementById('fc-summary');
    if (el) el.innerHTML = `<h2>${esc(t('fc.summary'))}</h2>${forecastSummaryHtml(forecastView(content, state))}`;
  });
}

// ---------- survival plan ----------

function renderBudgetCard() {
  const b = budgetFor(content, state);
  const advice = tierAdvice(b);
  const funding = findById(content.funding, state.setup.funding);
  const total = b.totalPct === 100 ? t('plan.allocated', { n: 100 })
    : b.unallocated > 0 ? t('plan.unallocated', { n: b.unallocated }) : t('plan.over', { n: -b.unallocated });
  return `<article class="card budget-card" id="budget-card">
    <h2>${esc(t('plan.budget'))}</h2>
    <label class="income-row">${esc(t('plan.incomeLabel'))}
      <span class="rand">R<input data-income type="number" inputmode="numeric" min="0" step="50" value="${b.income}"></span>
    </label>
    <div class="advice tier-${b.tier}">
      <h3>${esc(advice.title)}</h3>
      <p>${esc(advice.body)}</p>
      ${advice.steps.length ? `<ol>${advice.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    </div>
    <ul class="split">${b.items.map((i) => `<li class="${i.belowMin ? 'warn' : ''}">
      <div class="split-label">
        <label for="p-${i.id}">${esc(t(`budget.${i.id}`))}</label>
        ${i.min ? `<span class="min">${esc(t('plan.basics', { min: money(i.min) }))}${i.belowMin ? ` · ${esc(t('plan.belowMin'))}` : ''}</span>` : ''}
      </div>
      <span class="pct"><input id="p-${i.id}" data-pct="${i.id}" type="number" inputmode="numeric" min="0" max="100" step="1" value="${i.pct}">%</span>
      <b class="amt">${esc(money(i.amount))}</b>
      <span class="split-bar"><span style="width:${Math.min(100, i.pct)}%"></span></span>
    </li>`).join('')}</ul>
    <div class="split-total ${b.totalPct === 100 ? 'good' : 'bad'}">
      <span>${esc(total)}</span>
      <button class="link" data-action="budget-reset">${esc(t('plan.reset'))}</button>
    </div>
    <p class="fine">${esc(t('plan.budgetNote', { area: tx(content.area) }))}</p>
    <p class="fine"><strong>${esc(t('plan.rent'))}:</strong> ${esc(tx(funding.rentNote))}</p>
  </article>`;
}

function renderFeedback() {
  return `<article class="card feedback" id="feedback">
    <h2>${esc(t('fb.title'))}</h2>
    <p class="fine">${esc(t('fb.body'))}</p>
    <div class="fb-options">${Object.entries(FEEDBACK).map(([q, answers]) => `<div class="fb-question" role="group" aria-label="${esc(t(`fb.q.${q}`))}">
      <p>${esc(t(`fb.q.${q}`))}</p>
      <span class="chips">${answers.map((a) => `<button class="chip" data-action="fb-pick" data-q="${q}" data-value="${a}" aria-pressed="false">${esc(t(`fb.a.${a}`))}</button>`).join('')}</span>
    </div>`).join('')}</div>
    <button class="btn" data-action="send-feedback">${esc(t('fb.send'))}</button>
  </article>`;
}

function renderPlan() {
  const plan = buildPlan(content, state);
  const next = nextChapterId(content, state.chapter);
  return `<section class="plan screen">
    <header class="plan-head">
      <p class="tag">${esc(t('app.title'))} · ${esc(tx(currentChapter(content, state).title))}</p>
      <h1>${esc(t('plan.title'))}</h1>
      <p>${esc(plan.inst)} · ${esc(plan.subtitle)}</p>
    </header>

    <div class="actions">
      <button class="btn primary" data-action="share-image">${esc(t('plan.share'))}</button>
      <button class="btn" data-action="save-image">${esc(t('plan.saveImage'))}</button>
    </div>

    <div class="plan-grid">
      <article class="card wide plan-forecast">
        <h2>${esc(t('plan.forecast'))}</h2>
        <p class="big-line">${esc(plan.forecast.highest)}</p>
        <p>${esc(plan.forecast.cause)} ${esc(plan.forecast.pattern)}</p>
        <ol class="steps">${plan.forecast.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
        <p class="fine">${esc(plan.forecast.leaks)}</p>
      </article>

      <details class="fold wide"><summary>${esc(t('plan.budget'))}</summary>${renderBudgetCard()}</details>

      <details class="fold"><summary>${esc(t('plan.buffer'))}</summary><article class="card buffer-card">
        <h2>${esc(t('plan.buffer'))}</h2>
        <p class="big-line">${esc(money(plan.buffer.target))}</p>
        <p>${esc(plan.buffer.body)}</p>
        <p>${esc(plan.buffer.save)}</p>
        ${plan.buffer.tested ? `<p class="fine">${esc(plan.buffer.tested)}</p>` : ''}
      </article></details>

      <details class="fold"><summary>${esc(t('plan.late'))}</summary><article class="card">
        <h2>${esc(t('plan.late'))}</h2>
        <ol class="steps">${plan.late.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      </article></details>

      <details class="fold"><summary>${esc(t('plan.dates'))}</summary><article class="card">
        <h2>${esc(t('plan.dates'))}</h2>
        <ul class="dates">${plan.dates.map((d) => `<li><b>${esc(d.when)}</b><span>${esc(d.what)}</span></li>`).join('')}</ul>
        <p class="fine">${esc(t('plan.datesNote', { short: tx(content.short) }))}</p>
      </article></details>

      <article class="card wide">
        <h2>${esc(t('plan.contacts'))}</h2>
        <div class="contacts">${crisisLinks()}</div>
        <details class="more"><summary>${esc(t('plan.contactsAll', { n: contactIds(content, state).length }))}</summary>
        <div class="contact-rows">${contactIds(content, state).map((id) => {
          const s = content.support[id];
          return `<div class="contact-row"><h3>${esc(tx(s.name))}</h3><p>${esc(tx(s.reach, vars()))}</p>
            ${whereBlock(s)}
            ${s.contacts ? `<div class="contacts">${s.contacts.map(contactLink).join('')}</div>` : ''}</div>`;
        }).join('')}</div>
        </details>
      </article>

      <details class="fold wide"><summary>${esc(t('plan.rehearsed'))}</summary><article class="card wide">
        <h2>${esc(t('plan.rehearsed'))}</h2>
        <ul class="rehearsed">${plan.rehearsed.map((r) => `<li>
          <span class="wk">${esc(unitLabel(r.week))}</span>
          <b>${esc(r.event)}</b>
          <span>→ ${esc(r.choice)}</span>
          ${r.tip ? `<em>${esc(r.tip)}</em>` : ''}</li>`).join('')}</ul>
      </article></details>
    </div>

    ${caps.stats && !state.feedbackSent?.includes(state.chapter) ? renderFeedback() : ''}

    <div class="stack narrow">
      ${next ? `<button class="btn primary" data-action="chapter" data-id="${next}">${esc(t('chapter.next', { chapter: tx(chapterOf(content, next).title) }))}</button>` : ''}
      <button class="btn ${next ? 'ghost' : 'primary'}" data-action="to-map">${esc(t('plan.toMap'))}</button>
    </div>
    <p class="fine center">${esc(t('footer.examples'))}</p>
  </section>`;
}

// ---------- journey summary + fair-game reflection ----------

function renderSummary() {
  const fair = fairGame(content, state);
  const done = content.chapterOrder.filter((c) => state.completed.includes(c.id));
  const wins = state.history.filter((h) => findEvent(h.eventId)?.type === 'win')
    .map((h) => resolveEvent(content, { ...state, chapter: h.chapter }, h.eventId));
  const graduated = state.completed.includes('finish_line');
  return `<section class="summary screen">
    <header class="plan-head">
      <p class="tag">${esc(t('app.title'))}</p>
      <h1>${esc(graduated ? t('summary.final') : t('summary.title'))}</h1>
      <p>${esc(tx(content.short))} · ${esc(tx(findById(content.courses, state.setup.course).label))}</p>
    </header>

    <div class="plan-grid">
      <article class="card wide fair">
        <h2>${esc(t('fair.title'))}</h2>
        <p class="big-line">${esc(t(`fair.lead.${fair.level}`))}</p>
        <div class="fair-cols">
          <div>
            <h3>${esc(t('fair.pressures'))}</h3>
            <ul class="fair-list minus">${fair.pressures.map((id) => `<li>${esc(t(`fair.f.${id}`))}</li>`).join('') || '<li>—</li>'}</ul>
          </div>
          <div>
            <h3>${esc(t('fair.advantages'))}</h3>
            <ul class="fair-list plus">${fair.advantages.map((id) => `<li>${esc(t(`fair.a.${id}`))}</li>`).join('') || '<li>—</li>'}</ul>
          </div>
        </div>
        ${fair.supports.length ? `<h3>${esc(t('fair.supports'))}</h3>
          <div class="unis">${fair.supports.map((id) => `<span class="uni">${esc(tx(content.support[id].name))}</span>`).join('')}</div>` : ''}
        <p class="note">${esc(t('fair.closing'))}</p>
      </article>

      <article class="card">
        <h2>${esc(t('summary.chapters'))}</h2>
        <ul class="rehearsed">${done.map((c) => {
          const p = copingProfile(state, c.id);
          return `<li><b>✓ ${esc(tx(chapterOf(content, c.id).title))}</b>
            ${p.top ? `<em>${esc(t('fc.count', { verb: t(`fc.verb.${p.top}`), n: p.counts[p.top], total: p.total }))}</em>` : ''}</li>`;
        }).join('')}</ul>
      </article>

      <article class="card">
        <h2>${esc(t('summary.wins'))}</h2>
        ${wins.length ? `<ul class="rehearsed">${wins.map((w) => `<li><b>🎉 ${esc(tx(w.title, vars(w)))}</b></li>`).join('')}</ul>`
          : `<p class="fine">${esc(t('summary.noWins'))}</p>`}
      </article>

      <article class="card">
        <h2>${esc(t('summary.now'))}</h2>
        <ul class="final">
          <li><span>${esc(t('meter.money'))}</span><b>${esc(money(state.money))}</b></li>
          <li><span>${esc(t('meter.marks'))}</span><b>${state.marks}%</b></li>
          <li><span>${esc(t('meter.wellbeing'))}</span><b>${state.wellbeing}%</b></li>
        </ul>
      </article>
    </div>

    <div class="stack narrow">
      <button class="btn primary" data-action="to-map">${esc(t('summary.back'))}</button>
    </div>
  </section>`;
}

// ---------- About, For universities, Privacy ----------

function renderInfo() {
  const back = `<button class="link back-link" data-action="home">← ${esc(t('year.back'))}</button>`;
  const paras = (keys) => keys.map((k) => `<p>${esc(t(k))}</p>`).join('');
  const list = (keys) => `<ul class="why-list">${keys.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>`;
  if (screen === 'privacy') {
    return `<section class="onboard screen">${back}
      <p class="tag">${esc(t('app.title'))}</p>
      <h1>${esc(t('privacy.title'))}</h1>
      <p class="lead">${esc(t('privacy.lead'))}</p>
      ${list(['privacy.p1', 'privacy.p2', 'privacy.p3', 'privacy.p4', 'privacy.p5'])}
      <div class="stack narrow"><button class="btn" data-action="erase">${esc(t('privacy.erase'))}</button></div>
    </section>`;
  }
  if (screen === 'universities') {
    const email = content.contact?.email;
    return `<section class="onboard screen">${back}
      <p class="tag">${esc(t('uni.tag'))}</p>
      <h1>${esc(t('uni.title'))}</h1>
      <p class="lead">${esc(t('uni.lead'))}</p>
      <ol class="how-steps">${[1, 2, 3, 4].map((n) => `<li>
        <span class="how-num">${n}</span>
        <div><h2>${esc(t(`uni.s${n}t`))}</h2><p>${esc(t(`uni.s${n}`))}</p></div>
      </li>`).join('')}</ol>
      <article class="card">
        <h2>${esc(t('uni.contactTitle'))}</h2>
        <p>${esc(t('uni.contact'))}</p>
        ${email ? `<div class="contacts"><a class="contact" href="mailto:${esc(email)}"><span aria-hidden="true">✉️</span> ${esc(email)}</a></div>` : ''}
      </article>
      <p class="fine center">${esc(t('about.independent'))}</p>
    </section>`;
  }
  return `<section class="onboard screen">${back}
    <p class="tag">${esc(t('app.title'))}</p>
    <h1>${esc(t('about.title'))}</h1>
    <p class="lead">${esc(t('about.lead'))}</p>
    ${paras(['about.p1', 'about.p2'])}
    <h2>${esc(t('about.basedTitle'))}</h2>
    <ul class="why-list">${(content.sources || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    ${tested ? `<p class="why-everyone">${esc(t('about.tested', { n: tested }))}</p>` : ''}
    <h2>${esc(t('about.limitsTitle'))}</h2>
    ${paras(['about.independent', 'about.advice', 'about.numbers'])}
  </section>`;
}

// ---------- Campus Realities (opt-in, never scored, never recorded) ----------

const CR_PARTS = 5;

function crBar(backAction, exit = true) {
  return `<div class="cr-bar">
    <button class="link back-link" data-action="${backAction}">← ${esc(t('cr.back'))}</button>
    ${exit ? `<button class="btn small quick-exit" data-action="quick-exit">${esc(t('cr.exit'))} ✕</button>` : ''}
  </div>`;
}

function crContacts(labels) {
  const all = catalogue.realities.contacts;
  return `<div class="contacts">${labels.map((l) => all.find((c) => c.label === l)).filter(Boolean).map(contactLink).join('')}</div>`;
}

function renderRealities() {
  const data = catalogue.realities;
  const topic = data.topics.find((x) => x.id === cr.topic);
  if (!topic) {
    return `<section class="year screen">${crBar('home', false)}
      <div class="year-head">
        <div class="year-icon big" aria-hidden="true">🛟</div>
        <div>
          <h1>${esc(t('cr.title'))}</h1>
          <p class="lead">${esc(t('cr.lead'))}</p>
          <p class="fine">${esc(t('cr.meta', { n: data.topics.length }))}</p>
        </div>
      </div>
      <div class="sensitive" role="note"><p>${esc(t('cr.note'))}</p>${crContacts(data.contacts.map((c) => c.label))}</div>
      <div class="chapter-cards">
        ${data.topics.map((x, i) => `<article class="chapter-card">
          <div class="chapter-num" aria-hidden="true">${i + 1}</div>
          <div><h2>${esc(tx(x.title))}</h2><p class="opt-desc">${esc(tx(x.summary))}</p>
            <button class="btn small" data-action="cr-topic" data-id="${x.id}">${esc(t('cr.open'))}</button></div>
        </article>`).join('')}
      </div>
      <p class="fine">${esc(t('cr.private'))} ${esc(t(data.reviewed ? 'cr.reviewed' : 'cr.notReviewed'))}</p>
    </section>`;
  }
  // Steps: 0 content note, 1 recognise, 2 scenario, 3 its feedback, 4 you, 5 a friend, 6 rights.
  const part = [0, 1, 2, 2, 3, 4, 5][cr.step];
  const tag = cr.step ? t('cr.part', { n: part, total: CR_PARTS }) : t('note.title');
  const bar = crBar(cr.step <= 1 ? 'realities' : 'cr-prev');
  const dots = `<div class="intro-dots" aria-hidden="true">${Array.from({ length: CR_PARTS }, (_, i) => `<span class="${i + 1 === part ? 'on' : ''}"></span>`).join('')}</div>`;
  const bullets = (items) => `<ul class="why-list">${items.map((x) => `<li>${esc(tx(x))}</li>`).join('')}</ul>`;
  const next = (action, label) => `<button class="btn primary big" data-action="${action}">${esc(label)}</button>`;

  if (cr.step === 0) {
    return `<section class="note-screen screen">${bar}
      <article class="card event-card">
        <p class="tag">${esc(tag)}</p>
        <h1>${esc(tx(topic.title))}</h1>
        <p>${esc(tx(topic.summary))}</p>
        <p>${esc(t('cr.topicNote'))}</p>
        ${crContacts(topic.contacts)}
      </article>
      ${cta(`${next('cr-continue', t('note.continue'))}
        <button class="btn ghost" data-action="realities">${esc(t('cr.notNow'))}</button>`)}
    </section>`;
  }
  if (cr.step === 2) {
    return `<section class="event screen">${bar}
      <article class="card event-card">
        <p class="tag">${esc(tag)}</p>
        <h1>${esc(t('cr.scenario'))}</h1>
        <p>${esc(tx(topic.scenario.text))}</p>
        <p class="note">${esc(t('cr.noScore'))}</p>
      </article>
      <div class="choices">${topic.scenario.choices.map((c, i) => `<button class="choice" data-action="cr-pick" data-id="${i}">
        <span class="key" aria-hidden="true">${i + 1}</span><span class="choice-text">${esc(tx(c.label))}</span></button>`).join('')}</div>
      ${dots}
    </section>`;
  }
  if (cr.step === 3) {
    const picked = topic.scenario.choices[cr.picked];
    return `<section class="outcome screen">${bar}
      <article class="card">
        <p class="tag">${esc(t('cr.happens'))}</p>
        <h1>${esc(tx(picked.label))}</h1>
        <p>${esc(tx(picked.feedback))}</p>
        <p class="note">${esc(t('card.friendNote'))}</p>
      </article>
      ${dots}
      ${cta(`${next('cr-continue', t('common.continue'))}
        <button class="btn ghost" data-action="cr-prev">${esc(t('cr.again'))}</button>`)}
    </section>`;
  }
  const info = {
    1: { title: 'cr.recognise', items: topic.recognise },
    4: { title: 'cr.you', items: topic.you, note: 'cr.youNote' },
    5: { title: 'cr.friend', items: topic.friend },
    6: { title: 'cr.rights', items: topic.rights },
  }[cr.step];
  const last = cr.step === 6;
  return `<section class="event screen">${bar}
    <article class="card event-card">
      <p class="tag">${esc(tag)}</p>
      <h1>${esc(t(info.title))}</h1>
      ${info.note ? `<p class="note">${esc(t(info.note))}</p>` : ''}
      ${bullets(info.items)}
      ${last ? `${crContacts(topic.contacts)}<p class="fine">${esc(t('about.advice'))}</p>` : ''}
    </article>
    ${dots}
    ${cta(last ? next('realities', t('cr.done')) : next('cr-continue', t('common.continue')))}
  </section>`;
}

function renderOverlay() {
  if (sheet) return renderSheet();
  if (!overlay) return '';
  return `<div class="overlay" role="dialog" aria-modal="true" data-action="close-overlay-bg">
    <div class="overlay-inner">
      ${overlay.map(supportCard).join('')}
      ${supportNote()}
      <button class="btn primary big" data-action="close-overlay">${esc(t('support.close'))}</button>
    </div>
  </div>`;
}

// ---------- browser history: Back goes to the previous screen ----------

// Where the player is, apart from the game itself. A chapter in play is one
// history entry: choices can't be undone, so Back leaves it (it stays saved).
function navState() {
  return { screen, obStep, step, yearId, cr: { ...cr } };
}

function navKey(n) {
  const detail = { onboard: n.obStep, setup: n.step, year: n.yearId, realities: `${n.cr.topic}:${n.cr.step}` }[n.screen];
  return `${n.screen}|${detail ?? ''}`;
}

function syncHistory() {
  const n = navState();
  const key = navKey(n);
  if (key === lastNav) return;
  if (lastNav === null || navMode === 'replace') window.history.replaceState(n, '');
  else window.history.pushState(n, '');
  lastNav = key;
}

window.addEventListener('popstate', (e) => {
  if (!e.state) return;
  const leavingGame = screen === 'game';
  ({ screen, obStep, step, yearId } = e.state);
  const year = leavingGame && state?.chapter && YEARS.find((y) => y.chapters.includes(state.chapter));
  if (year) { screen = 'year'; yearId = year.id; }
  cr = { ...e.state.cr };
  overlay = null;
  fromReview = false;
  navMode = 'replace';
  render();
  navMode = 'push';
});

function render() {
  // Leaving a friend's shared service card: back to the player's own university.
  if (ownContent && screen !== 'services') { content = ownContent; ownContent = null; }
  renderTopbar();
  let html;
  if (screen === 'onboard') html = [renderWelcome, renderWhy, renderHow][obStep]();
  else if (screen === 'intro') html = renderIntro();
  else if (screen === 'setup') html = renderSetup();
  else if (INFO_PAGES.includes(screen)) html = renderInfo();
  else if (screen === 'realities') html = renderRealities();
  else if (screen === 'services') html = renderServices();
  else if (screen === 'summary' && state) html = renderSummary();
  else if (screen === 'year' && state) html = renderYear();
  else if (screen === 'game' && state?.chapter && state.phase !== 'map') {
    html = {
      intro: renderChapterIntro,
      dashboard: renderDashboard,
      note: renderNote,
      event: renderEvent,
      outcome: renderOutcome,
      support: renderSupport,
      friday: renderFriday,
      forecast: renderForecast,
      plan: renderPlan,
    }[state.phase]();
  } else {
    screen = 'home';
    html = renderHome();
  }
  app.innerHTML = html + renderOverlay();
  app.dataset.screen = screen === 'game' ? state.phase : screen;
  syncHistory();
  updateHud();
  // Answering a mini, changing a habit or closing a support card redraws the
  // same view, so the page stays where the player was.
  const view = [screen, obStep, step, yearId, cr.topic, cr.step, state?.chapter, state?.phase, state?.week, state?.qi, state?.fridayStep].join('|');
  const moved = view !== lastView;
  lastView = view;
  const focus = overlay || sheet ? app.querySelector('.overlay h2') : moved ? app.querySelector('h1') : null;
  if (focus) { focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); }
  if (moved) window.scrollTo(0, 0);
}

function deviceId() {
  let id = prefs().device;
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    store.set(PREFS_KEY, { ...prefs(), device: id });
  }
  return id;
}

function update(next) {
  const finished = state?.phase !== 'forecast' && next.phase === 'forecast';
  state = next;
  save();
  render();
  // An anonymous count that a chapter was completed: a random id, no answers.
  if (finished && caps.stats) sendStats({ device_id: deviceId(), institution: content.id, chapter: state.chapter, completed: true });
}

// A saved game remembers its pack version. If the pack has changed, an
// unfinished chapter restarts on the new content; finished chapters are kept.
function syncPack() {
  if (!state || state.packVersion === content.version) return;
  const midChapter = state.chapter && !['map', 'forecast', 'plan'].includes(state.phase);
  state = { ...(midChapter ? backToMap(state) : state), packVersion: content.version };
  if (midChapter) toast(t('pack.updated'));
  save();
}

// ---------- sharing ----------

async function shareImage(download) {
  const blob = await planImageBlob(buildPlan(content, state));
  const file = new File([blob], 'university-survival-plan.png', { type: 'image/png' });
  if (!download && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('plan.title'), text: `${t('app.title')}: ${t('plan.title')}` });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('plan.imageSaved'));
}

// Text goes to the phone's share sheet; without one, to WhatsApp, or the clipboard when offline.
async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (navigator.onLine) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    return;
  }
  try { await navigator.clipboard.writeText(text); toast(t('plan.copied')); } catch { /* nothing else to try */ }
}


// A link that opens the app on one service card, at this university and campus.
function serviceUrl(id) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.search = new URLSearchParams({ uni: content.id, ...(content.campusId ? { campus: content.campusId } : {}), service: id });
  return url.href;
}

// A shared service link opens that card at the sender's university. The
// player's own game is not touched: their content comes back when they leave.
async function openServiceLink() {
  const q = new URLSearchParams(window.location.search);
  const uni = q.get('uni');
  const id = q.get('service');
  if (!uni || !id) return;
  window.history.replaceState(null, '', window.location.pathname);
  if (!openDirectory(catalogue.directory).some((d) => d.id === uni)) return;
  try { await loadInstitution(catalogue, uni); } catch { return; }
  const linked = contentFor(uni, q.get('campus'));
  if (state && (linked.id !== content.id || linked.campusId !== content.campusId)) ownContent = content;
  content = linked;
  screen = 'services';
  if (content.support[id]) overlay = [id];
}

// ---------- events ----------

function startSetup(prefill) {
  draft = prefill ? { ...prefill } : {};
  if (draft.institution) content = contentFor(draft.institution, draft.campus);
  step = prefill ? STEPS.indexOf('review') : 0;
  fromReview = false;
  screen = 'setup';
  render();
}

function refreshBudgetCard() {
  document.getElementById('budget-card').outerHTML = renderBudgetCard();
}

// Close the language menu on any click outside it
document.addEventListener('click', (e) => {
  if (!e.target.closest('.lang-menu')) setLangMenu(false);
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'lang-toggle':
      setLangMenu(el.getAttribute('aria-expanded') !== 'true');
      break;
    case 'lang-pick':
      setLangMenu(false);
      if (id !== currentLang()) {
        store.set(PREFS_KEY, { ...prefs(), lang: id });
        await loadLang(id);
        render();
      }
      topRight.querySelector('.lang-btn')?.focus();
      break;
    case 'page':
      screen = id;
      render();
      break;
    case 'realities':
      cr = { topic: null, step: 0, picked: null };
      screen = 'realities';
      render();
      break;
    case 'services':
      coachDone('services');
      if (ownContent) { content = ownContent; ownContent = null; }
      overlay = null;
      screen = 'services';
      render();
      break;
    case 'service':
      overlay = [id];
      render();
      break;
    case 'share-service':
      shareText(tx(content.support[id].name), serviceText(content, id, serviceUrl(id)));
      break;
    case 'cr-topic':
      cr = { topic: id, step: 0, picked: null };
      render();
      break;
    case 'cr-continue':
      cr.step = cr.step === 1 ? 2 : cr.step + 1;
      render();
      break;
    case 'cr-pick':
      cr.picked = Number(id);
      cr.step = 3;
      render();
      break;
    case 'cr-prev':
      cr.step = cr.step === 4 ? 2 : cr.step - 1;
      render();
      break;
    case 'quick-exit':
      // Straight back to the topic list (or home, from the list). The card just
      // left is replaced in the browser history instead of being stacked on it.
      if (!cr.topic) screen = 'home';
      cr = { topic: null, step: 0, picked: null };
      navMode = 'replace';
      render();
      navMode = 'push';
      break;
    case 'erase':
      try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(PREFS_KEY); } catch { /* ignore */ }
      state = null;
      screen = 'home';
      render();
      toast(t('privacy.erased'));
      break;
    case 'mini':
      coachDone('mini');
      update(answerMini(content, state, Number(id)));
      break;
    case 'fb-pick':
      el.parentElement.querySelectorAll('.chip').forEach((c) => {
        c.classList.toggle('on', c === el);
        c.setAttribute('aria-pressed', String(c === el));
      });
      break;
    case 'home':
    case 'to-map':
      overlay = null;
      cr = { topic: null, step: 0, picked: null };
      if (state && action === 'to-map' && ['forecast', 'plan'].includes(state.phase)) state = backToMap(state);
      save();
      screen = 'home';
      render();
      break;
    case 'start':
      coachDone('homeSetup');
      startSetup(null);
      break;
    case 'year':
      coachDone('homeYears');
      if (!state) { startSetup(null); break; }
      yearId = id;
      screen = 'year';
      render();
      break;
    case 'how':
      obStep = 1;
      screen = 'onboard';
      render();
      break;
    case 'ob-next':
      if (obStep > 0 && obStep < OB_PAGES - 1) obStep += 1;
      else screen = 'home';
      render();
      break;
    case 'ob-back':
      obStep = Math.max(0, obStep - 1);
      render();
      break;
    case 'intro-next':
      introStep = Math.min(introStep + 1, INTRO_SLIDES - 1);
      render();
      break;
    case 'intro-done':
      store.set(PREFS_KEY, { ...prefs(), introSeen: true });
      if (state) { screen = 'home'; render(); } else startSetup(null);
      break;
    case 'change-setup':
      startSetup(state.setup);
      break;
    case 'install':
      installPrompt?.prompt();
      installPrompt = null;
      render();
      break;
    case 'summary':
      screen = 'summary';
      render();
      break;

    // setup
    case 'setup-back':
      if (step === 0) { screen = 'home'; render(); } else { step -= skipStep(step - 1) ? 2 : 1; fromReview = false; render(); }
      break;
    case 'pick': {
      const { key, value } = el.dataset;
      if (key === 'institution') {
        // Download this institution's pack now; after that it is kept for offline play.
        el.disabled = true;
        try { await loadInstitution(catalogue, value); } catch { el.disabled = false; toast(t('setup.needOnline')); break; }
      }
      if (key === 'funding') {
        if (value === 'family') draft.family_needs = 'no';
        else if (draft.funding === 'family') delete draft.family_needs; // now worth asking
      }
      draft[key] = value;
      if (key === 'institution') { delete draft.campus; content = contentFor(value); }
      if (key === 'campus') content = contentFor(draft.institution, value);
      // A course that isn't taught on the chosen campus is asked again.
      if (draft.course && !findById(content.courses, draft.course)) delete draft.course;
      if (key === 'funding' || key === 'housing') delete draft.monthlyIncome;
      advanceSetup();
      break;
    }
    case 'preset': {
      const input = document.getElementById('income');
      input.value = el.dataset.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
    case 'income-next':
      draft.monthlyIncome = Math.max(0, Math.round(Number(document.getElementById('income').value) || 0));
      advanceSetup();
      break;
    case 'goto-step':
      step = Number(el.dataset.step);
      fromReview = true;
      render();
      break;
    case 'begin': {
      content = contentFor(draft.institution, draft.campus);
      screen = 'home';
      update({ ...newJourney(content, Object.fromEntries(SETUP_KEYS.map((k) => [k, draft[k]]))), packVersion: content.version });
      break;
    }

    // chapters
    case 'chapter':
      screen = 'game';
      lastMeters = null;
      if (state.chapter === id && !['map', 'forecast', 'plan'].includes(state.phase)) render();
      else update(startChapter(content, state, id));
      break;
    case 'start-week':
      // A chapter opens on its first step; breaks only come between steps.
      update(eventForWeek(content, state) ? openEvent(content, state) : setPhase(state, 'dashboard'));
      break;
    case 'open-event':
      coachDone('break');
      update(openEvent(content, state));
      break;
    case 'note-continue':
      update(setPhase(state, 'event'));
      break;
    case 'note-skip':
      update(skipEvent(content, state));
      break;
    case 'choose':
      coachDone('card');
      undo = state;
      update(choose(content, state, id));
      break;
    case 'undo':
      if (undo) update(undo);
      undo = null;
      break;
    case 'ack':
      update(acknowledge(content, state));
      break;
    case 'show-support':
      coachDone('support');
      update(setPhase(state, 'support'));
      break;
    case 'next':
      coachDone('outcome');
      undo = null;
      update(advance(content, state));
      break;
    case 'finish':
      update(nextWeek(content, state));
      break;
    case 'friday':
      update(friday(content, state, id));
      break;
    case 'habit':
      update(setHabit(content, state, id));
      break;
    case 'seek': {
      const kind = el.dataset.kind;
      overlay = content.anytimeHelp[kind].support;
      update(seekHelp(content, state, kind));
      break;
    }
    case 'overlay':
      coachDone('recap');
      overlay = el.dataset.ids.split(',');
      render();
      break;
    case 'close-overlay':
      overlay = null;
      render();
      break;
    case 'sheet':
      if (el.dataset.kind === 'term') coachDone('terms');
      else if (screen === 'game' && state?.phase === 'support') coachDone('reach');
      sheet = { kind: el.dataset.kind, id };
      render();
      break;
    case 'close-sheet':
      sheet = null;
      render();
      break;
    case 'no-site':
      toast(t('link.noSite', { short: tx(content.short) }));
      break;
    case 'coach-done':
      coachDone(id);
      render();
      break;
    case 'close-sheet-bg':
      if (e.target === el) { sheet = null; render(); }
      break;
    case 'leave':
      // Progress is saved; the chapter shows "Continue" on its year page.
      yearId = (YEARS.find((y) => y.chapters.includes(state.chapter)) || YEARS[0]).id;
      screen = 'year';
      render();
      toast(t('dash.left'));
      break;
    case 'close-overlay-bg':
      if (e.target === el) { overlay = null; render(); }
      break;
    case 'to-plan':
      coachDone('forecast');
      update(setPhase(state, 'plan'));
      break;
    case 'toggle-ai':
      showAi = !showAi;
      document.getElementById('fc-summary').innerHTML = `<h2>${esc(t('fc.summary'))}</h2>${forecastSummaryHtml(forecastView(content, state))}`;
      break;

    // plan
    case 'budget-reset':
      state = { ...state, budget: {} };
      save();
      refreshBudgetCard();
      break;
    case 'share-image':
      shareImage(false);
      break;
    case 'save-image':
      shareImage(true);
      break;
    case 'send-feedback': {
      const box = document.getElementById('feedback');
      const feedback = Object.fromEntries([...box.querySelectorAll('.chip.on')].map((c) => [c.dataset.q, c.dataset.value]));
      if (!Object.keys(feedback).length) break;
      el.disabled = true;
      const ok = await sendStats({ device_id: deviceId(), institution: content.id, chapter: state.chapter, completed: true, feedback });
      if (ok) {
        state = { ...state, feedbackSent: [...(state.feedbackSent || []), state.chapter] };
        save();
        box.remove();
        toast(t('fb.thanks'));
      } else {
        el.disabled = false;
        toast(t('fb.fail'));
      }
      break;
    }
    default:
      break;
  }
});

function chartHover(e) {
  const hit = e.target.closest?.('[data-chart-week]');
  if (hit) { showChartWeek(hit); return; }
  const col = e.target.closest?.('[data-risk]');
  if (col) col.closest('.card').querySelector('.risk-readout').textContent = col.dataset.risk;
}
document.addEventListener('pointerover', chartHover);
document.addEventListener('focusin', chartHover);
document.addEventListener('click', chartHover);

document.addEventListener('input', (e) => {
  if (e.target.id === 'inst-search') document.getElementById('inst-list').innerHTML = institutionOptions(e.target.value);
  if (e.target.id === 'income') {
    const amount = Math.max(0, Number(e.target.value) || 0);
    document.getElementById('income-preview').innerHTML = incomePreview(amount);
    document.querySelectorAll('[data-action=preset]').forEach((c) => c.classList.toggle('on', Number(c.dataset.value) === amount));
  }
});

document.addEventListener('change', async (e) => {
  const input = e.target;
  if (input.hasAttribute('data-income')) {
    const income = Math.max(0, Number(input.value) || 0);
    state = { ...state, budget: { ...state.budget, income } };
  } else if (input.dataset.pct) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(input.value) || 0)));
    state = { ...state, budget: { ...state.budget, pct: { ...state.budget?.pct, [input.dataset.pct]: pct } } };
  } else return;
  save();
  refreshBudgetCard();
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('.lang-menu')) {
    if (e.key === 'Escape') { setLangMenu(false); topRight.querySelector('.lang-btn').focus(); }
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const opts = [...topRight.querySelectorAll('.lang-opt')];
      if (topRight.querySelector('.lang-pop').hidden) { setLangMenu(true); return; }
      const i = opts.indexOf(document.activeElement);
      opts[(i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
    }
    return;
  }
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Enter' && e.target.id === 'income') document.querySelector('[data-action=income-next]')?.click();
    return;
  }
  if (e.key === 'Escape' && sheet) { sheet = null; render(); return; }
  if (e.key === 'Escape' && overlay) { overlay = null; render(); return; }
  if (screen === 'game' && ['event', 'friday'].includes(state?.phase) && /^[1-9]$/.test(e.key)) {
    app.querySelectorAll('[data-action=choose], [data-action=friday]')[Number(e.key) - 1]?.click();
  }
  if (screen === 'realities' && /^[1-9]$/.test(e.key)) app.querySelectorAll('[data-action=cr-pick]')[Number(e.key) - 1]?.click();
});

// ---------- PWA ----------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (catalogue && (screen === 'home' || (screen === 'onboard' && obStep === 0))) render();
});

function connectivity() {
  document.body.classList.toggle('offline', !navigator.onLine);
}
window.addEventListener('online', connectivity);
window.addEventListener('offline', () => { connectivity(); toast(t('home.offline')); });

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    // On a first visit the directory and the chosen pack were fetched before the
    // service worker took over, so fetch them once more to store them for offline play.
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        for (const url of ['content/institutions/index.json', `content/institutions/${content.id}.json`]) fetch(url).catch(() => {});
      }, { once: true });
    }
    if (!navigator.serviceWorker.controller) {
      const sw = reg.installing || reg.waiting;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'activated') toast(t('home.offlineReady'));
      });
    }
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

// ---------- boot ----------

async function boot() {
  const saved = prefs().lang;
  const guess = (navigator.language || 'en').toLowerCase().startsWith('zu') ? 'zu' : 'en';
  await loadLang(saved || guess);
  catalogue = await loadCatalogue();
  const saveData = store.get(SAVE_KEY);
  // The general version was folded into the demo campus.
  if (saveData?.setup?.institution === 'general') saveData.setup.institution = 'sizwe';
  // Only one institution's pack is loaded: the saved one, or the first in the directory.
  const wanted = saveData?.v === SAVE_VERSION ? saveData.setup?.institution : null;
  const first = openDirectory(catalogue.directory)[0]?.id || catalogue.directory[0].id;
  let loaded = null;
  if (wanted) loaded = await loadInstitution(catalogue, wanted).catch(() => null);
  if (!loaded) await loadInstitution(catalogue, first);
  if (loaded) {
    state = saveData;
    if (state.setup.housing === 'living_at_home') state.setup.housing = 'commuting';
    if (!state.setup.campus) state.setup.campus = catalogue.institutions.find((i) => i.id === state.setup.institution).campuses?.[0]?.id;
    content = contentFor(state.setup.institution, state.setup.campus);
    syncPack();
    screen = 'onboard';
  } else {
    content = contentFor(first);
    screen = 'onboard';
  }
  await openServiceLink();
  connectivity();
  render();
  registerSW();
  caps = await serverCapabilities();
  if (caps.ai && screen === 'game' && state?.phase === 'forecast') render();
  if (caps.stats) tested = (await fetchStats())?.students || null;
  // A newer pack from the server replaces the bundled one, but never mid-card.
  const own = ownContent || content;
  const newer = await fetchNewerPack(catalogue, own.id);
  if (newer && screen !== 'game' && screen !== 'setup') {
    const visiting = ownContent ? content : null;
    catalogue = newer;
    content = contentFor(own.id, own.campusId);
    syncPack();
    if (visiting) { ownContent = content; content = contentFor(visiting.id, visiting.campusId); }
    render();
  }
}

boot().catch((err) => {
  console.error(err);
  app.innerHTML = `<p class="error">${esc(t('error.load'))}</p>`;
});
