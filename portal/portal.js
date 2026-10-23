// Staff portal. University staff edit their own institution's pack here; a
// second person reviews it; the server checks it and publishes it.
//
// The browser is only a form. Every rule (who may see what, who may approve,
// what may be changed, whether a pack is safe) is enforced on the server.

const app = document.getElementById('app');
const who = document.getElementById('who');

const S = {
  me: null, csrf: '', step: 'login', needCode: false, twoStep: null, linkToken: null,
  catalogue: null, institutions: [], inst: null,
  data: null,          // what the server last sent: { pack, rev, state, can, changes, ... }
  pack: null,          // the working copy being edited
  dirty: false, tab: 'details', layer: '',
  check: null, history: null, stats: null, users: null, notice: null,
};
const TABS = [['guide', 'Guide'], ['details', 'Details and look'], ['campuses', 'Campuses'], ['buildings', 'Buildings and map'], ['services', 'Services'],
  ['lists', 'Lists'], ['cards', 'Story cards'], ['review', 'Review and publish'], ['history', 'History'], ['numbers', 'Numbers']];

// ---------- small helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const en = (t) => (t && typeof t === 'object' ? t.en || '' : t || '');
const clone = (o) => JSON.parse(JSON.stringify(o));
const when = (seconds) => new Date(seconds * 1000).toLocaleString();

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3500);
}

async function api(method, route, body) {
  const res = await fetch(`api/${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method === 'GET' ? {} : { 'X-CSRF-Token': S.csrf }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'The server sent something unexpected.' }));
  if (res.status === 401 && route !== 'login' && S.me) { S.me = null; S.step = 'login'; render(); }
  return { ok: res.ok, status: res.status, data };
}

// Read and write a value inside the working pack by a dotted path, e.g. "support.health.room.en".
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  const last = keys[keys.length - 1];
  if (value === '' || value === undefined) delete o[last]; else o[last] = value;
}

// ---------- form pieces ----------

const val = (path) => esc(getPath(S.pack, path) ?? '');
const locked = () => (S.data?.can.edit ? '' : 'disabled');

function field(label, path, { type = 'text', hint = '', placeholder = '', number = false } = {}) {
  return `<label>${esc(label)} ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
    <input type="${type}" data-path="${path}" ${number ? 'data-number' : ''} value="${val(path)}" placeholder="${esc(placeholder)}" ${locked()}></label>`;
}

// Text students read. Staff write it in English only; the other languages are
// translated from the English, so a changed English text never shows an old translation.
function textBox(label, path, { area = false, placeholder = {} } = {}) {
  return area
    ? `<label>${esc(label)}<textarea data-path="${path}.en" placeholder="${esc(placeholder.en || '')}" ${locked()}>${val(`${path}.en`)}</textarea></label>`
    : `<label>${esc(label)}<input data-path="${path}.en" value="${val(`${path}.en`)}" placeholder="${esc(placeholder.en || '')}" ${locked()}></label>`;
}

function checks(label, path, options, all) {
  const chosen = getPath(S.pack, path) || all;
  return `<h3>${esc(label)}</h3><div class="checks">${options.map((o) => `<label><input type="checkbox" data-list="${path}" value="${esc(o.id)}" ${chosen.includes(o.id) ? 'checked' : ''} ${locked()}>${esc(en(o.label))}</label>`).join('')}</div>`;
}

// The layer being edited on the buildings and services tabs: the whole university, or one campus.
const layerPath = () => (S.layer === '' ? '' : `campuses.${S.pack.campuses.findIndex((c) => c.id === S.layer)}.`);
const layerObj = () => (S.layer === '' ? S.pack : S.pack.campuses.find((c) => c.id === S.layer));

function layerPicker() {
  const campuses = S.pack.campuses || [];
  if (!campuses.length) return '';
  return `<label>Editing <select data-action="layer">
    <option value="" ${S.layer === '' ? 'selected' : ''}>Whole university (used by every campus unless it says otherwise)</option>
    ${campuses.map((c) => `<option value="${esc(c.id)}" ${S.layer === c.id ? 'selected' : ''}>${esc(en(c.name))} only</option>`).join('')}
  </select></label>`;
}

const STYLES = { help_seeker: 'Asking for help', planner: 'Planning ahead', connector: 'Leaning on people', avoider: 'Avoiding it',
  borrower: 'Borrowing', self_sacrificer: 'Going without' };

// ---------- sign-in screens ----------

function viewLogin() {
  return `<section class="card narrow"><h1>Sign in</h1>
    <p class="muted">For university staff who look after their institution in University Simulator.</p>
    ${S.notice ? `<div class="note bad">${esc(S.notice)}</div>` : ''}
    <form data-form="login">
      <label>Email address<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      ${S.needCode ? '<label>6-digit code from your authenticator app <span class="hint">or one of your backup codes</span><input name="code" autocomplete="one-time-code" maxlength="14" required></label>' : ''}
      <button class="primary">Sign in</button>
    </form>
    <p><button class="link" data-action="forgot">Forgot your password?</button></p></section>`;
}

function viewForgot() {
  return `<section class="card narrow"><h1>Reset your password</h1>
    <p class="muted">Enter your email address. If it has an account, we send a link that works once, for one hour.</p>
    ${S.notice ? `<div class="note ok">${esc(S.notice)}</div>` : ''}
    <form data-form="forgot"><label>Email address<input name="email" type="email" autocomplete="username" required></label>
      <button class="primary">Send the link</button></form>
    <p><button class="link" data-action="to-login">Back to sign in</button></p></section>`;
}

function viewSetPassword() {
  return `<section class="card narrow"><h1>Choose your password</h1>
    <p class="muted">At least 12 characters. This link works once.</p>
    ${S.notice ? `<div class="note bad">${esc(S.notice)}</div>` : ''}
    <form data-form="set-password"><label>New password<input name="password" type="password" autocomplete="new-password" minlength="12" required></label>
      <button class="primary">Save password</button></form></section>`;
}

function viewPassword() {
  return `<section class="card narrow"><h1>Choose your password</h1>
    <p class="muted">You signed in with a temporary password. Choose your own: at least 12 characters.</p>
    ${S.notice ? `<div class="note bad">${esc(S.notice)}</div>` : ''}
    <form data-form="password">
      <label>Temporary password<input name="current" type="password" autocomplete="current-password" required></label>
      <label>New password<input name="new" type="password" autocomplete="new-password" minlength="12" required></label>
      <button class="primary">Save password</button>
    </form></section>`;
}

function viewTwoStep() {
  return `<section class="card narrow"><h1>Set up two-step login</h1>
    <p class="muted">Two-step login protects your students' information. You need an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.</p>
    ${S.notice ? `<div class="note bad">${esc(S.notice)}</div>` : ''}
    ${S.twoStep ? `<p>1. In the app, add an account and choose "enter a setup key". Use this key:</p>
      <code class="secret">${esc(S.twoStep.secret)}</code>
      <p>2. Type the 6-digit code the app shows.</p>
      <form data-form="two-step"><label>Code<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" required></label>
      <button class="primary">Finish</button></form>`
    : '<button class="primary" data-action="two-step-begin">Start</button>'}
  </section>`;
}

// Shown once, straight after two-step login is set up.
function viewBackupCodes() {
  return `<section class="card narrow"><h1>Save your backup codes</h1>
    <p class="muted">If you lose your phone, one of these codes signs you in instead of the authenticator app. Each works once.
      Write them down or print them now: they are not shown again.</p>
    <code class="secret">${S.backupCodes.map(esc).join('<br>')}</code>
    <button class="primary" data-action="codes-saved">I have saved them</button>
  </section>`;
}

// ---------- the guide ----------

// A built-in tutorial: how a change reaches students, what each tab is for, and
// step-by-step instructions for the common jobs. It opens by itself the first
// time someone signs in on a browser, and is always there as the first tab.
const GUIDE_SEEN = 'fys-portal-guide-seen';
const goTo = (tab, label) => `<button class="link" data-action="tab" data-id="${tab}">${esc(label)}</button>`;
const howTo = (title, steps, note = '') => `<details class="item"><summary>${esc(title)}</summary>
  <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>${note ? `<p class="muted small">${note}</p>` : ''}</details>`;
const SEND = `Press <strong>Save draft</strong> (top right), then send it for review (see "Send your changes for review").`;

function tabGuide() {
  const role = S.me.role;
  const admin = role === 'admin';
  const canReview = role === 'reviewer' || role === 'admin';
  const roleText = {
    editor: 'You are an <strong>editor</strong>. You can change your institution\'s draft, run the check and submit it for review. A reviewer has to approve it.',
    reviewer: 'You are a <strong>reviewer</strong>. You can do everything an editor can, and you approve or send back changes that someone else submitted. You can also publish an earlier version again.',
    viewer: 'You have a <strong>read-only demo account</strong>. You can open every tab, look at the draft, run the check and read the history, but nothing you do can change what students see. To try editing and approving, ask for an editor and a reviewer account.',
    admin: 'You are a <strong>platform admin</strong> on the University Simulator team. You can work on every institution, create institutions and accounts, set licences, and write an institution\'s own story cards.',
  }[role];
  return `<section class="card"><h2>How the portal works</h2>
    <p>This is where you keep your institution's information in University Simulator up to date. Students never see a change until a second person has approved it.</p>
    <ol>
      <li><strong>Edit.</strong> Change something on any tab, then press <strong>Save draft</strong> at the top right. Students still see the old version.</li>
      <li><strong>Check.</strong> On ${goTo('review', 'Review and publish')}, press <strong>Run the check</strong>. It plays the whole story on every campus and lists anything that must be fixed.</li>
      <li><strong>Submit.</strong> Press <strong>Submit for review</strong>. The draft is locked until it is approved or sent back.</li>
      <li><strong>Review.</strong> A different person signs in, reads what changed, and approves it or sends it back with a note. Nobody can approve their own submission.</li>
      <li><strong>Published.</strong> Students get the new version the next time they open the app online.</li>
    </ol>
    <p class="muted">The label beside your institution's name shows where you are: <span class="pill ok">Up to date</span> <span class="pill">Draft with changes</span> <span class="pill wait">Waiting for review</span></p>
    <p>${roleText}</p>
  </section>

  <section class="card"><h2>What each tab is for</h2>
    <ul>
      <li>${goTo('details', 'Details and look')}: your name, local costs, the courses and housing you offer, your monogram and colours.</li>
      <li>${goTo('campuses', 'Campuses')}: add campuses if you have more than one, with the courses taught on each.</li>
      <li>${goTo('buildings', 'Buildings and map')}: the buildings your services are in, and where each sits on the campus map.</li>
      <li>${goTo('services', 'Services')}: for each support service, what you call it, its building, room, hours, email, phone and website.</li>
      <li>${goTo('lists', 'Lists')}: lists a service points students to, such as accredited accommodation.</li>
      <li>${goTo('cards', 'Story cards')}: switch off a situation that does not fit your institution, or reword it.</li>
      <li>${goTo('review', 'Review and publish')}: see what changed, run the check, submit, and approve.</li>
      <li>${goTo('history', 'History')}: every published version, and a record of who did what.</li>
      <li>${goTo('numbers', 'Numbers')}: how many of your students finished each chapter, and their feedback. Anonymous.</li>
      ${admin ? `<li>${goTo('admin', 'Platform admin')}: licences, new institutions and staff accounts.</li>` : ''}
    </ul>
    <p class="muted">If you have more than one campus, the Buildings, Services and Lists tabs start with an <strong>Editing</strong> box. Choose "Whole university" for what is the same everywhere, or one campus for what differs there.</p>
  </section>

  <section class="card"><h2>How to…</h2>
    ${howTo("Update a service's room, hours or email address", [
      `Open ${goTo('services', 'Services')} and click the service, for example "Student counselling".`,
      'Change the room, opening hours or email address. Write in English: students who use another language see it translated, or in English until it is.',
      SEND,
    ])}
    ${howTo('Add or change a phone number', [
      `Open ${goTo('services', 'Services')} and click the service.`,
      'Fill in <strong>Phone number</strong> and <strong>Phone label</strong> (what students see, such as "Counselling desk").',
      'Fill in <strong>Phone checked by</strong> with the name of the person who phoned the number, and <strong>Date checked</strong>.',
      SEND,
    ], 'A phone number without a name and a date is refused by the check. A fictional demo institution cannot show phone numbers at all.')}
    ${howTo('Add a building and put a service in it', [
      `Open ${goTo('buildings', 'Buildings and map')}. Type a short id such as "library" and press <strong>Add building</strong>.`,
      'Give it a name, choose its place on the map (there are eight places), and write walking directions from the gate. The preview on the right updates as you go.',
      `Open ${goTo('services', 'Services')}, click a service and choose the building in its <strong>Building</strong> box.`,
      SEND,
    ], 'A service placed in a building that is not on the map is refused by the check.')}
    ${howTo('Add a list, such as accredited accommodation', [
      `Open ${goTo('lists', 'Lists')}. Type a short id such as "accredited" and press <strong>Add a list</strong>.`,
      'Give it a title and an introduction, then press <strong>Add an entry</strong> for each line.',
      `Open ${goTo('services', 'Services')}, click the service that should show it, and choose it under <strong>List this service points students to</strong>.`,
      SEND,
    ])}
    ${howTo('Switch a story card off, or reword it', [
      `Open ${goTo('cards', 'Story cards')} and click a chapter to see its cards.`,
      'To switch a card off, untick the box beside its title.',
      'To reword it, click the card and type your wording. The original is shown in each box; leave a box empty to keep it.',
      SEND,
    ], 'You can change wording only. A situation may be at most 40 words, an answer at most 6 words, and "what happens" at most 2 sentences. What a choice does to money, marks and wellbeing is the same at every institution.')}
    ${admin ? howTo("Write a card of an institution's own", [
      `Choose the institution at the top left, then open ${goTo('cards', 'Story cards')}.`,
      'Under <strong>Your own cards</strong>, choose the chapter, type a card id such as "KC-02" and press <strong>Add a card</strong>.',
      'Fill in the title, the situation, and two or three answers. For each answer set what happens, and its effect on money, marks and wellbeing. At least one answer must cost no money.',
      'Save the draft and submit it. The institution\'s reviewer approves it before students see it.',
    ], 'Only platform admins can add or change these cards. Institution staff can read them and switch them off.')
    : howTo('Get a story card of your own', [
      'Tell the University Simulator team about the situation: what happens, and the two or three things a student might do.',
      'We write the card and add it to your draft.',
      `It appears under <strong>Your own cards</strong> on ${goTo('cards', 'Story cards')}, and comes to your reviewer for approval like any other change.`,
    ], 'You can read your own cards and switch them off, but only our team can write or change them.')}
    ${howTo('Change your name, monogram or colours', [
      `Open ${goTo('details', 'Details and look')}.`,
      'Change the name, the monogram (up to 3 letters) or the colours. The small preview shows how they look together.',
      SEND,
    ], 'Text must be easy to read on your main colour. The check refuses colours that are too close together.')}
    ${howTo('Add a campus', [
      `Open ${goTo('campuses', 'Campuses')}. Type a short id such as "north" and press <strong>Add campus</strong>.`,
      'Give it a name and a description, and tick the courses taught there.',
      'On the Buildings, Services and Lists tabs, choose the campus in the <strong>Editing</strong> box to set what is different there.',
      SEND,
    ])}
    ${howTo('Send your changes for review', [
      'Press <strong>Save draft</strong> if it is not greyed out.',
      `Open ${goTo('review', 'Review and publish')}. The list shows what has changed, with a before-and-after table.`,
      'Press <strong>Run the check</strong>. If it lists problems, fix them, save, and run it again.',
      'Press <strong>Submit for review</strong>, then tell your reviewer it is waiting.',
    ])}
    ${canReview ? howTo('Approve a change, or send it back', [
      `Open ${goTo('review', 'Review and publish')}. A change that is waiting shows "Submitted by" and the before-and-after table.`,
      'Read each line: the middle column is what students see now, the right column is what they would see.',
      'Press <strong>Approve and publish</strong>, or write a note and press <strong>Send back</strong>.',
    ], 'You cannot approve something you submitted yourself. Ask another reviewer.') : ''}
    ${canReview ? howTo('Go back to an earlier version', [
      `Open ${goTo('history', 'History')}.`,
      'Beside the version you want, press <strong>Publish this version again</strong> and confirm.',
    ], 'It is published as a new version, so nothing in the history is lost.') : ''}
    ${admin ? howTo('Add an institution', [
      `Open ${goTo('admin', 'Platform admin')}. Under <strong>Add an institution</strong>, fill in the id, name, type and status, and press <strong>Create</strong>.`,
      'Fill in its details, buildings and services on the other tabs.',
      'Submit it for review. Students cannot see it until its first version is approved.',
    ]) : ''}
    ${admin ? howTo('Create a staff account, or help someone who cannot sign in', [
      `Open ${goTo('admin', 'Platform admin')}. Under <strong>Accounts</strong>, fill in the email, name, role and institution, and press <strong>Create account</strong>.`,
      'The person gets an invitation link to choose their own password. With no mail server set up, the link is shown to you on screen to pass on.',
      'If someone is locked out or has lost their phone, press <strong>New temporary password</strong> beside their account. This also clears their two-step login.',
      'To stop an account being used, press <strong>Switch off</strong>.',
    ]) : ''}
    ${admin ? howTo("Set an institution's licence", [
      `Choose the institution at the top left and open ${goTo('admin', 'Platform admin')}.`,
      'Under <strong>This institution\'s licence</strong>, set the status, type, tier and expiry date, and press <strong>Save licence</strong>.',
      'It is saved to the draft and goes live through review, like any other change.',
    ]) : ''}
  </section>

  <section class="card"><h2>If something goes wrong</h2>
    ${howTo('The check lists problems', [
      'Each line says where the problem is and what is wrong.',
      'Fix it on the tab it names, press <strong>Save draft</strong>, and run the check again.',
    ], 'Nothing can be submitted or published while the check finds a problem.')}
    ${howTo('"Someone else saved changes while you were editing"', [
      'A colleague saved the draft after you opened it.',
      'Reload the page to see their changes, then make your change again.',
    ])}
    ${howTo('I cannot edit anything', [
      'The draft is waiting for review, so it is locked.',
      'Ask your reviewer to approve it or send it back. Then you can edit again.',
    ])}
    ${howTo('I forgot my password, or my account is locked', [
      'On the sign-in screen, press <strong>Forgot your password?</strong> and enter your email address.',
      'Open the link we email you and choose a new password. This also unlocks a locked account.',
    ], 'An account locks after eight wrong passwords or codes, and stays locked until you do this or an admin resets it.')}
    ${howTo('I lost the phone with my authenticator app', [
      'Sign in with your email and password as usual.',
      'Where it asks for the 6-digit code, type one of the backup codes you saved when you set up two-step login. Each works once.',
      'If you have none left, ask a platform admin to reset your account.',
    ])}
  </section>`;
}

// ---------- the editor ----------

function header() {
  const d = S.data;
  const state = d.state === 'submitted' ? '<span class="pill wait">Waiting for review</span>'
    : d.changes.length ? '<span class="pill">Draft with changes</span>' : '<span class="pill ok">Up to date</span>';
  return `<div class="head">
    ${S.institutions.length > 1 ? `<select data-action="institution" aria-label="Institution">${S.institutions.map((i) => `<option value="${esc(i.id)}" ${i.id === S.inst ? 'selected' : ''}>${esc(en(i.name) || i.id)}</option>`).join('')}</select>`
    : `<h1>${esc(en(S.pack.name))}</h1>`}
    ${state}
    <span class="muted small">${d.publishedVersion ? `Students see version ${d.publishedVersion}` : 'Not published yet'}</span>
    <span class="spacer"></span>
    ${S.dirty ? '<span class="muted small">Unsaved changes</span>' : ''}
    <button class="primary" data-action="save" ${d.can.edit && S.dirty ? '' : 'disabled'}>Save draft</button>
  </div>
  ${d.can.viewOnly ? '<div class="note">Read-only demo account: you can look at everything, but nothing can be saved, submitted or published.</div>' : ''}
  ${d.state === 'submitted' ? `<div class="note">Submitted by ${esc(d.submittedBy || 'someone')}. It cannot be edited until it is approved or sent back.</div>` : ''}
  ${d.reviewNote ? `<div class="note bad"><strong>Sent back by the reviewer:</strong> ${esc(d.reviewNote)}</div>` : ''}
  <nav class="tabs">${[...TABS, ...(S.me.role === 'admin' ? [['admin', 'Platform admin']] : [])].map(([id, label]) => `<button class="${S.tab === id ? 'on' : ''}" data-action="tab" data-id="${id}">${esc(label)}</button>`).join('')}</nav>`;
}

function tabDetails() {
  const c = S.catalogue;
  const own = (S.pack.courseList || []).map((x) => ({ id: x.id, label: x.label }));
  const colours = (prefix, title) => `<h3>${title}</h3><div class="grid">
    ${field('Main colour', `${prefix}.brand`, { type: 'color' })}${field('Text on the main colour', `${prefix}.brandInk`, { type: 'color' })}
    ${field('Highlight colour', `${prefix}.accent`, { type: 'color' })}${field('Highlight colour for text', `${prefix}.accentInk`, { type: 'color' })}</div>`;
  return `<section class="card"><h2>Name</h2>
      ${textBox('Full name', 'name')}
      <div class="grid">${field('Short name', 'short', { hint: 'what students call it' })}${field('Province', 'province')}${field('Area name', 'area', { hint: 'used in some card text' })}</div>
      ${textBox('One line shown under the name', 'campus')}
      ${textBox('City, as it reads in a sentence', 'city', { placeholder: { en: 'the city' } })}
    </section>
    <section class="card"><h2>Local costs</h2><div class="grid">
      ${field('Monthly rent for a private room (rand)', 'costs.rent_private', { type: 'number', number: true })}
      ${field('A week of taxi fares (rand)', 'costs.taxi_week', { type: 'number', number: true })}</div>
    </section>
    <section class="card"><h2>What you offer</h2>
      ${(S.pack.campuses || []).length ? '<p class="muted">Courses are set per campus, on the Campuses tab.</p>' : checks('Courses', 'courses', [...c.courses, ...own], c.courses.map((x) => x.id))}
      ${checks('Housing options', 'housing', c.housing, c.housing.map((x) => x.id))}
    </section>
    <section class="card"><h2>Look</h2>
      <div class="grid">${field('Name in the top bar', 'brand.name')}${field('Monogram', 'brand.logo', { hint: 'up to 3 letters' })}</div>
      ${colours('brand.colors', 'Colours')}
      <p><span class="preview" id="preview"><span class="mono">${esc(S.pack.brand?.logo || 'AB')}</span><span class="btnp">A button</span><span class="acc">Highlight</span></span></p>
      ${colours('brand.colorsDark', 'Colours for dark mode (leave unchanged to keep the standard dark colours)')}
    </section>`;
}

function tabCampuses() {
  const list = S.pack.campuses || [];
  const c = S.catalogue;
  const own = (S.pack.courseList || []).map((x) => ({ id: x.id, label: x.label }));
  return `<section class="card"><h2>Campuses</h2>
    <p class="muted">Add campuses only if you have more than one. Each campus can have its own map, service locations and costs. Anything a campus does not set comes from the whole university.</p>
    ${list.map((campus, i) => `<details class="item" ${list.length < 4 ? 'open' : ''}><summary>${esc(en(campus.name) || campus.id)} <span class="tag">${esc(campus.id)}</span></summary>
      ${textBox('Name', `campuses.${i}.name`)}${textBox('Description', `campuses.${i}.desc`, { area: true })}
      ${checks('Courses taught here', `campuses.${i}.courses`, [...c.courses, ...own], [])}
      <div class="grid">${field('Monthly rent near this campus (rand)', `campuses.${i}.costs.rent_private`, { type: 'number', number: true })}
      ${field('A week of taxi fares (rand)', `campuses.${i}.costs.taxi_week`, { type: 'number', number: true })}</div>
      <button class="danger" data-action="campus-remove" data-id="${esc(campus.id)}" ${locked()}>Remove this campus</button>
    </details>`).join('') || '<p>This university has one campus.</p>'}
    <form data-form="campus-add" class="row"><label>New campus id <span class="hint">lower-case, no spaces, e.g. "north"</span><input name="id" pattern="[a-z][a-z0-9_]{1,20}" required ${locked()}></label>
      <button ${locked()}>Add campus</button></form>
  </section>`;
}

function mapSvg(buildings) {
  return `<svg class="map" viewBox="0 0 320 232" role="img" aria-label="Campus map preview">
    <rect width="320" height="232" rx="12" fill="#f0ebe2" />
    <path d="M160 232 V105 M8 105 H312" stroke="#ddd6ca" stroke-width="12" fill="none" stroke-linecap="round" />
    <text x="150" y="226" text-anchor="end" font-size="9" font-weight="700" fill="#5a6272">Gate</text>
    ${buildings.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="#fff" stroke="#12355b" />
      <text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 3}" text-anchor="middle" font-size="8" font-weight="600" fill="#17202e">${esc(en(b.name)).slice(0, 18)}</text>`).join('')}
  </svg>`;
}

function tabBuildings() {
  const base = layerPath();
  const buildings = layerObj().map?.buildings || [];
  const positions = Object.keys(S.catalogue.positions);
  const taken = buildings.map((b) => positions.find((p) => S.catalogue.positions[p].x === b.x && S.catalogue.positions[p].y === b.y));
  return `<section class="card">${layerPicker()}<h2>Buildings and map</h2>
    <p class="muted">These are the buildings your services are in. Students see them on a simple map with walking directions from the gate. There are eight places on the map.</p>
    ${field('Your official campus map', `${base}map.url`, { type: 'url', hint: 'starting with https://; students get a button to open it' })}
    <div class="split"><div>
    ${buildings.map((b, i) => `<details class="item" open><summary>${esc(en(b.name) || b.id)} <span class="tag">${esc(b.id)}</span></summary>
      ${textBox('Name on the map', `${base}map.buildings.${i}.name`)}
      <label>Place on the map<select data-action="position" data-index="${i}" ${locked()}>${positions.map((p) => `<option value="${p}" ${taken[i] === p ? 'selected' : ''} ${taken.includes(p) && taken[i] !== p ? 'disabled' : ''}>${esc(S.catalogue.positions[p].en.replace('From the gate, ', '').replace(/^./, (x) => x.toUpperCase()))}</option>`).join('')}</select></label>
      ${textBox('Walking directions from the gate', `${base}map.buildings.${i}.directions`, { area: true })}
      <button class="danger" data-action="building-remove" data-index="${i}" ${locked()}>Remove</button>
    </details>`).join('') || '<p>No buildings yet for this layer.</p>'}
    ${buildings.length < positions.length ? `<form data-form="building-add" class="row"><label>New building id <span class="hint">e.g. "library"</span><input name="id" pattern="[a-z][a-z0-9_]{1,24}" required ${locked()}></label><button ${locked()}>Add building</button></form>` : ''}
    </div><div>${mapSvg(buildings)}</div></div></section>`;
}

function tabServices() {
  const base = `${layerPath()}support`;
  const layer = layerObj();
  const buildings = layer.map?.buildings || S.pack.map?.buildings || [];
  return `<section class="card">${layerPicker()}<h2>Services</h2>
    <p class="muted">Fill in the services you have. Students are shown the building, room, hours and how to reach each one. A phone number needs the name of the person who checked it and the date; unchecked numbers cannot be published.</p>
    ${S.catalogue.services.map((svc) => {
      const mine = layer.support?.[svc.id] || {};
      const p = `${base}.${svc.id}`;
      const phone = (mine.contacts || []).find((c) => c.tel) || {};
      const site = (mine.contacts || []).find((c) => c.url) || {};
      const filled = Object.keys(mine).length > 0;
      return `<details class="item"><summary>${esc(en(mine.name) || en(svc.name))} ${filled ? '<span class="changed">filled in</span>' : ''} <span class="tag">${esc(svc.id)}</span></summary>
        <div class="original"><strong>What students are told:</strong> ${esc(en(svc.offers))}</div>
        ${textBox('What it is called here', `${p}.name`, { placeholder: svc.name })}
        <div class="grid">
          <label>Building<select data-path="${p}.building" ${locked()}><option value="">Not set</option>${buildings.map((b) => `<option value="${esc(b.id)}" ${mine.building === b.id ? 'selected' : ''}>${esc(en(b.name) || b.id)}</option>`).join('')}</select></label>
          ${field('Email address', `${p}.email`, { type: 'email' })}
        </div>
        ${textBox('Room', `${p}.room`)}${textBox('Opening hours', `${p}.hours`)}
        <div class="grid">
          <label>Phone number<input data-contact="tel" data-service="${p}" value="${esc(phone.tel || '')}" inputmode="tel" ${locked()}></label>
          <label>Phone label <span class="hint">as students see it</span><input data-contact="label" data-service="${p}" value="${esc(phone.label || '')}" ${locked()}></label>
          ${field('Phone checked by', `${p}.verified_by`)}${field('Date checked', `${p}.last_checked`, { type: 'date' })}
          <label>Website <span class="hint">starting with https://</span><input data-contact="url" data-service="${p}" value="${esc(site.url || '')}" type="url" ${locked()}></label>
        </div>
        <label>List this service points students to<select data-path="${p}.page" ${locked()}><option value="">None</option>${Object.entries({ ...S.pack.pages, ...layer.pages }).map(([pid, pg]) => `<option value="${esc(pid)}" ${mine.page === pid ? 'selected' : ''}>${esc(en(pg.title) || pid)}</option>`).join('')}</select></label>
        ${textBox('How to reach it, in your own words', `${p}.reach`, { area: true, placeholder: svc.reach })}
        ${S.layer !== '' ? textBox('If it is on another campus, say where', `${p}.away`, { area: true }) : ''}
      </details>`;
    }).join('')}</section>`;
}

function tabLists() {
  const base = `${layerPath()}pages`;
  const pages = layerObj().pages || {};
  return `<section class="card">${layerPicker()}<h2>Lists</h2>
    <p class="muted">Lists that a service tells students to look at, such as accredited accommodation or a workshop calendar. Students see the list inside the app, with a button to your official page.</p>
    ${Object.entries(pages).map(([pid, page]) => `<details class="item" open><summary>${esc(en(page.title) || pid)} <span class="tag">${esc(pid)}</span> <span class="tag">${(page.items || []).length} entries</span></summary>
      ${textBox('Title', `${base}.${pid}.title`)}${textBox('Introduction', `${base}.${pid}.intro`, { area: true })}
      ${field('Your official page for this list', `${base}.${pid}.url`, { type: 'url', hint: 'starting with https://' })}
      <h3>Entries</h3>
      ${(page.items || []).map((item, i) => `<div class="entry">${field('Name', `${base}.${pid}.items.${i}.name`)}${textBox('Detail', `${base}.${pid}.items.${i}.detail`)}
        <button class="danger" data-action="item-remove" data-id="${esc(pid)}" data-index="${i}" ${locked()}>Remove entry</button></div>`).join('')}
      <p><button data-action="item-add" data-id="${esc(pid)}" ${locked()}>Add an entry</button></p>
      ${textBox('Note at the end', `${base}.${pid}.note`, { area: true })}
      <button class="danger" data-action="page-remove" data-id="${esc(pid)}" ${locked()}>Remove this list</button>
    </details>`).join('') || '<p>No lists yet for this layer.</p>'}
    <form data-form="page-add" class="row"><label>New list id <span class="hint">e.g. "accredited"</span><input name="id" pattern="[a-z][a-z0-9_]{1,24}" required ${locked()}></label><button ${locked()}>Add a list</button></form>
  </section>`;
}

// The institution's own story cards. Unlike rewording, these do set what a
// choice does, so only our team writes them (the server refuses anyone else).
// Institution staff see them here and approve them in review.
function ownCards() {
  const add = S.pack.cards?.add || {};
  const chapters = S.catalogue.chapters.filter((ch) => ch.pools.length);
  const cards = Object.entries(add).flatMap(([chapter, list]) => list.map((card, i) => ({ chapter, card, i })));
  if (!S.data.can.addCards) {
    return `<section class="card"><h2>Your own cards</h2>
      <p class="muted">Situations particular to your institution. The University Simulator team writes these with you: ask us for one, and it comes to you for review before students see it.</p>
      ${cards.map(({ chapter, card }) => `<details class="item"><summary>${esc(en(card.title) || card.id)} <span class="tag">${esc(en(S.catalogue.chapters.find((x) => x.id === chapter)?.title))}</span></summary>
        <p>${esc(en(card.text))}</p>
        <ul>${(card.choices || []).map((c) => `<li><b>${esc(en(c.label))}</b>: ${esc(en(c.outcome))}</li>`).join('')}</ul>
      </details>`).join('') || '<p>You have no cards of your own yet.</p>'}
    </section>`;
  }
  const num = (label, path) => `<label>${label}<input type="number" data-number data-path="${path}" value="${val(path)}" ${locked()}></label>`;
  return `<section class="card"><h2>Your own cards</h2>
    <p class="muted">A situation that is particular to your institution. It needs a short title, a situation of at most 40 words, and two or three answers of at most six words each. At least one answer must cost no money.</p>
    ${cards.map(({ chapter, card, i }) => {
      const b = `cards.add.${chapter}.${i}`;
      const ch = S.catalogue.chapters.find((x) => x.id === chapter);
      return `<details class="item" open><summary>${esc(en(card.title) || card.id)} <span class="tag">${esc(card.id)}</span> <span class="tag">${esc(en(ch?.title))}</span></summary>
        ${textBox('Title', `${b}.title`)}${textBox('Situation', `${b}.text`, { area: true })}
        <label>Drawn together with<select data-path="${b}.pool" ${locked()}>${(ch?.pools || []).map((p) => `<option value="${esc(p)}" ${card.pool === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
        ${(card.choices || []).map((c, j) => `<h3>Answer ${j + 1}</h3>
          ${textBox('Answer', `${b}.choices.${j}.label`)}${textBox('What happens', `${b}.choices.${j}.outcome`, { area: true })}${textBox('Tip (optional)', `${b}.choices.${j}.tip`, { area: true })}
          <div class="grid">${num('Money (rand, minus to spend)', `${b}.choices.${j}.effects.money`)}${num('Marks (-20 to 20)', `${b}.choices.${j}.effects.marks`)}${num('Wellbeing (-20 to 20)', `${b}.choices.${j}.effects.wellbeing`)}
            <label>Coping style<select data-one="${b}.choices.${j}.tags" ${locked()}><option value="">None</option>${S.catalogue.styles.map((s) => `<option value="${s}" ${c.tags?.[0] === s ? 'selected' : ''}>${esc(STYLES[s] || s)}</option>`).join('')}</select></label>
            <label>Opens this service<select data-one="${b}.choices.${j}.support" ${locked()}><option value="">None</option>${S.catalogue.services.map((s) => `<option value="${esc(s.id)}" ${c.support?.[0] === s.id ? 'selected' : ''}>${esc(en(s.name))}</option>`).join('')}</select></label>
          </div>
          ${card.choices.length > 2 ? `<button class="danger" data-action="choice-remove" data-chapter="${chapter}" data-index="${i}" data-id="${j}" ${locked()}>Remove this answer</button>` : ''}`).join('')}
        <div class="row">${card.choices.length < 3 ? `<button data-action="choice-add" data-chapter="${chapter}" data-index="${i}" ${locked()}>Add a third answer</button>` : ''}
          <button class="danger" data-action="owncard-remove" data-chapter="${chapter}" data-index="${i}" ${locked()}>Remove this card</button></div>
      </details>`;
    }).join('') || '<p>You have no cards of your own yet.</p>'}
    <form data-form="owncard-add" class="row">
      <label>Chapter<select name="chapter" ${locked()}>${chapters.map((ch) => `<option value="${esc(ch.id)}">${esc(en(ch.title))}</option>`).join('')}</select></label>
      <label>Card id <span class="hint">your initials and a number, e.g. "KC-02"</span><input name="id" pattern="[A-Z][A-Z0-9]{1,5}-[0-9A-Z]{1,4}" required ${locked()}></label>
      <button ${locked()}>Add a card</button></form>
  </section>`;
}

function tabCards() {
  const off = new Set(S.pack.cards?.off || []);
  const edits = S.pack.cards?.edit || {};
  return `${ownCards()}<section class="card"><h2>Story cards</h2>
    <p class="muted">Switch off a card that does not fit your institution, or reword it. You can change wording only: what a choice does to money, marks and wellbeing is the same on every campus. Leave a box empty to keep the original wording.</p>
    ${S.catalogue.chapters.map((ch) => `<details class="item"><summary>${esc(en(ch.title))} <span class="tag">${ch.cards.length} cards</span>
        ${ch.cards.some((c) => off.has(c.id)) ? '<span class="off">some off</span>' : ''}${ch.cards.some((c) => edits[c.id]) ? '<span class="changed">some reworded</span>' : ''}</summary>
      ${ch.cards.map((card) => `<details class="item"><summary><input type="checkbox" data-action="card-toggle" data-id="${esc(card.id)}" ${off.has(card.id) ? '' : 'checked'} ${locked()} aria-label="Card is on">
          ${esc(en(edits[card.id]?.title) || en(card.title))} <span class="tag">${esc(card.id)}</span>
          ${off.has(card.id) ? '<span class="off">off</span>' : ''}${edits[card.id] ? '<span class="changed">reworded</span>' : ''}</summary>
        <div class="original">${esc(en(card.text))}</div>
        ${textBox('Title', `cards.edit.${card.id}.title`, { placeholder: card.title })}
        ${textBox('Situation', `cards.edit.${card.id}.text`, { area: true, placeholder: card.text })}
        ${card.choices.map((c) => `<h3>Answer: ${esc(en(c.label))}</h3>
          ${textBox('Answer', `cards.edit.${card.id}.choices.${c.id}.label`, { placeholder: c.label })}
          ${textBox('What happens', `cards.edit.${card.id}.choices.${c.id}.outcome`, { area: true, placeholder: c.outcome })}`).join('')}
      </details>`).join('')}
    </details>`).join('')}</section>`;
}

function checkResult() {
  const c = S.check;
  if (!c) return '';
  return `${c.errors.length ? `<div class="note bad"><strong>${c.errors.length} problem(s) to fix before this can be published:</strong><ul>${c.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : '<div class="note ok"><strong>The check passed.</strong> The story plays from start to finish on every campus.</div>'}
    ${c.warnings.length ? `<div class="note"><strong>Worth a look:</strong><ul>${c.warnings.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`;
}

function tabReview() {
  const d = S.data;
  return `<section class="card"><h2>What has changed</h2>
    ${d.changes.length ? `<ul>${d.changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <details class="item" ${d.state === 'submitted' ? 'open' : ''}><summary>Before and after, line by line <span class="tag">${d.diff.length} change(s)</span></summary>
      <table class="diff"><tr><th>Where</th><th>Students see now</th><th>After this change</th></tr>
      ${d.diff.map((r) => `<tr><td>${esc(r.where)}</td><td class="before">${esc(r.before) || '<span class="muted">(nothing)</span>'}</td><td class="after">${esc(r.after) || '<span class="muted">(removed)</span>'}</td></tr>`).join('')}</table></details>`
    : '<p class="muted">Nothing differs from what students see now.</p>'}
    ${S.dirty ? '<div class="note">You have unsaved changes. Save the draft first.</div>' : ''}
    <div class="row"><button data-action="check" ${S.dirty ? 'disabled' : ''}>Run the check</button>
      <button class="primary" data-action="submit" ${d.can.submit && !S.dirty ? '' : 'disabled'}>Submit for review</button></div>
    <p class="muted small">Submitting sends this to a reviewer at your institution. Students see nothing until a second person approves it.</p>
    ${checkResult()}
  </section>
  ${d.state === 'submitted' ? `<section class="card"><h2>Review</h2>
    <p>Submitted by ${esc(d.submittedBy || 'someone')}.</p>
    ${d.can.review ? `<form data-form="review"><label>Note to the editor <span class="hint">needed if you send it back</span><textarea name="note"></textarea></label>
        <div class="row"><button class="primary" name="decision" value="approve">Approve and publish</button><button class="danger" name="decision" value="reject">Send back</button></div></form>`
    : `<p class="muted">${d.can.ownSubmission ? 'You submitted this, so a second person has to review it.' : d.can.viewOnly ? 'A reviewer at this institution approves it or sends it back. A demo account can only watch.' : 'Only a reviewer can approve this.'}</p>`}
  </section>` : ''}`;
}

function tabHistory() {
  const h = S.history;
  if (!h) return '<p class="muted">Loading…</p>';
  return `<section class="card"><h2>Published versions</h2>
    ${h.versions.length ? `<table><tr><th>Version</th><th>Published</th><th>Submitted by</th><th>Approved by</th><th></th></tr>
      ${h.versions.map((v) => `<tr><td>${v.version}</td><td>${esc(when(v.at))}</td><td>${esc(v.submittedBy || '')}</td><td>${esc(v.approvedBy || '')}</td>
        <td>${S.data.can.rollback && v.version !== S.data.publishedVersion ? `<button data-action="rollback" data-id="${v.version}">Publish this version again</button>` : ''}</td></tr>`).join('')}</table>`
    : '<p class="muted">Nothing has been published through the portal yet.</p>'}
  </section>
  <section class="card"><h2>Who did what</h2>
    <table><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr>
    ${h.audit.map((a) => `<tr><td>${esc(when(a.at))}</td><td>${esc(a.who || '')}</td><td>${esc(a.action)}</td><td>${esc(a.detail || '')}</td></tr>`).join('')}</table>
    <p class="muted small">This record cannot be edited or deleted.</p>
  </section>`;
}

function tabNumbers() {
  const s = S.stats;
  if (!s) return '<p class="muted">Loading…</p>';
  const rows = (o) => Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td class="muted">None yet</td><td></td></tr>';
  return `<section class="card"><h2>Your students, anonymously</h2>
    <p><strong>${s.students}</strong> student(s) have completed at least one chapter. No names, logins or student numbers are collected.</p>
    <div class="split"><div><h3>Completions by chapter</h3><table>${rows(s.byChapter)}</table></div>
    <div><h3>Feedback</h3>${Object.entries(s.feedback).map(([q, a]) => `<h3>${esc(q)}</h3><table>${rows(a)}</table>`).join('')}</div></div></section>`;
}

function tabAdmin() {
  const u = S.users;
  return `<section class="card"><h2>This institution's licence</h2>
    <form data-form="licence" class="grid">
      <label>Status<select name="status"><option value="">No change</option><option value="demo">Demo (fictional)</option><option value="licensed">Licensed</option></select></label>
      <label>Type<select name="type"><option value="">No change</option><option value="university">University</option><option value="tvet">TVET college</option><option value="private">Private college</option></select></label>
      <label>Licence tier<input name="licenceTier" placeholder="${esc(S.pack.licence?.tier || 'standard')}"></label>
      <label>Licence expires<input name="licenceExpires" type="date" value="${esc(S.pack.licence?.expires || '')}"></label>
      <div><button>Save licence</button></div>
    </form>
    <p class="muted small">Now: ${esc(S.pack.status)} · ${esc(S.pack.type || 'university')}${S.pack.licence ? ` · ${esc(S.pack.licence.tier)} until ${esc(S.pack.licence.expires)}` : ''}. Changes go through review like any other.</p>
  </section>
  <section class="card"><h2>Add an institution</h2>
    <form data-form="institution-add" class="grid">
      <label>Id <span class="hint">lower-case and hyphens</span><input name="id" pattern="[a-z][a-z0-9-]{1,30}" required></label>
      <label>Name<input name="name" required></label><label>Short name<input name="short"></label>
      <label>Type<select name="type"><option value="university">University</option><option value="tvet">TVET college</option><option value="private">Private college</option></select></label>
      <label>Status<select name="status"><option value="licensed">Licensed</option><option value="demo">Demo (fictional)</option></select></label>
      <label>Licence expires<input name="licenceExpires" type="date"></label>
      <div><button class="primary">Create</button></div>
    </form>
    <p class="muted small">A new institution is invisible to students until its first pack is approved.</p>
  </section>
  <section class="card"><h2>Accounts</h2>
    <form data-form="user-add" class="grid">
      <label>Email<input name="email" type="email" required></label><label>Name<input name="name" required></label>
      <label>Role<select name="role"><option value="editor">Editor</option><option value="reviewer">Reviewer</option><option value="viewer">Viewer (read-only)</option><option value="admin">Platform admin</option></select></label>
      <label>Institution<select name="institution">${S.institutions.map((i) => `<option value="${esc(i.id)}" ${i.id === S.inst ? 'selected' : ''}>${esc(en(i.name) || i.id)}</option>`).join('')}</select></label>
      <div><button class="primary">Create account</button></div>
    </form>
    ${u ? `<table><tr><th>Email</th><th>Name</th><th>Role</th><th>Institution</th><th>Two-step</th><th></th></tr>
      ${u.map((x) => `<tr><td>${esc(x.email)}</td><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.institution || 'all')}</td><td>${x.twoStep ? 'on' : 'not set up'}</td>
        <td class="row"><button data-action="user-reset" data-id="${x.id}">New temporary password</button>
        <button class="danger" data-action="${x.disabled ? 'user-enable' : 'user-disable'}" data-id="${x.id}">${x.disabled ? 'Switch on' : 'Switch off'}</button></td></tr>`).join('')}</table>` : ''}
  </section>`;
}

// ---------- render ----------

function render() {
  who.innerHTML = S.me ? `<span>${esc(S.me.name)} · ${esc(S.me.role)}</span><button data-action="logout">Sign out</button>` : '';
  if (S.linkToken) app.innerHTML = viewSetPassword();
  else if (S.step === 'forgot') app.innerHTML = viewForgot();
  else if (S.step === 'login') app.innerHTML = viewLogin();
  else if (S.step === 'password') app.innerHTML = viewPassword();
  else if (S.backupCodes) app.innerHTML = viewBackupCodes();
  else if (S.step === 'two-step') app.innerHTML = viewTwoStep();
  else if (!S.data) app.innerHTML = '<p class="muted">Loading…</p>';
  else {
    const body = { guide: tabGuide, details: tabDetails, campuses: tabCampuses, buildings: tabBuildings, services: tabServices, lists: tabLists, cards: tabCards,
      review: tabReview, history: tabHistory, numbers: tabNumbers, admin: tabAdmin }[S.tab]();
    app.innerHTML = header() + body;
    paintPreview();
  }
  S.notice = null;
}

function paintPreview() {
  const el = document.getElementById('preview');
  const c = S.pack?.brand?.colors || {};
  if (!el) return;
  el.style.setProperty('--preview-brand', c.brand || '#12355b');
  el.style.setProperty('--preview-ink', c.brandInk || '#ffffff');
  el.style.setProperty('--preview-accent', c.accent || '#f2a93b');
}

// ---------- loading ----------

async function start() {
  // An invitation or reset link carries its token after the #, which is never sent to the server by the browser itself.
  const link = window.location.hash.match(/^#set-password=([\w-]+)$/);
  if (link) { S.linkToken = link[1]; window.history.replaceState(null, '', window.location.pathname); render(); return; }
  const me = await api('GET', 'me');
  if (!me.ok) { S.step = me.data.step || 'login'; render(); return; }
  await signedIn(me.data);
}

async function signedIn(info) {
  S.me = info.user;
  S.csrf = info.csrf;
  S.step = info.step;
  if (S.step !== 'ready') { render(); return; }
  const [cat, list] = await Promise.all([api('GET', 'catalogue'), api('GET', 'institutions')]);
  S.catalogue = cat.data;
  S.institutions = list.data;
  S.inst = S.me.institution || S.institutions[0]?.id;
  // The first time on this browser, start on the guide.
  try {
    if (!localStorage.getItem(GUIDE_SEEN)) { S.tab = 'guide'; localStorage.setItem(GUIDE_SEEN, '1'); }
  } catch { /* private mode: the Guide tab is still there */ }
  await loadPack();
}

async function loadPack() {
  const res = await api('GET', `pack/${S.inst}`);
  if (!res.ok) { toast(res.data.error); return; }
  S.data = res.data;
  S.pack = clone(res.data.pack);
  S.dirty = false;
  S.check = null;
  S.history = null;
  S.stats = null;
  if (S.layer && !(S.pack.campuses || []).some((c) => c.id === S.layer)) S.layer = '';
  render();
  loadTab();
}

async function loadTab() {
  if (S.tab === 'history' && !S.history) { S.history = (await api('GET', `pack/${S.inst}/history`)).data; render(); }
  if (S.tab === 'numbers' && !S.stats) { S.stats = (await api('GET', `pack/${S.inst}/stats`)).data; render(); }
  if (S.tab === 'admin' && !S.users) { S.users = (await api('GET', 'users')).data; render(); }
}

// Before saving: an edit with nothing in it, or the original wording again, is not an edit.
function tidy(pack) {
  const originals = Object.fromEntries(S.catalogue.chapters.flatMap((ch) => ch.cards.map((c) => [c.id, c])));
  const fill = (mine, original) => {
    if (!mine?.en || mine.en === original?.en) return undefined;
    return { en: mine.en };
  };
  const edits = pack.cards?.edit || {};
  for (const [id, edit] of Object.entries(edits)) {
    const card = originals[id];
    if (!card) continue; // a card not in the catalogue (the platform's doing): leave it as it is
    for (const key of ['title', 'text']) { const v = fill(edit[key], card[key]); if (v) edit[key] = v; else delete edit[key]; }
    for (const [cid, ch] of Object.entries(edit.choices || {})) {
      const orig = card.choices.find((c) => c.id === cid) || {};
      for (const key of ['label', 'outcome']) { const v = fill(ch[key], orig[key]); if (v) ch[key] = v; else delete ch[key]; }
      if (!Object.keys(ch).length) delete edit.choices[cid];
    }
    if (edit.choices && !Object.keys(edit.choices).length) delete edit.choices;
    if (!Object.keys(edit).length) delete edits[id];
  }
  for (const [chapter, list] of Object.entries(pack.cards?.add || {})) if (!list.length) delete pack.cards.add[chapter];
  if (pack.cards?.add && !Object.keys(pack.cards.add).length) delete pack.cards.add;
  // Empty objects left behind by cleared fields.
  const prune = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { prune(v); if (!Object.keys(v).length && !['support', 'edit', 'add'].includes(k)) delete o[k]; }
    }
  };
  for (const layer of [pack, ...(pack.campuses || [])]) for (const svc of Object.values(layer.support || {})) prune(svc);
  if (pack.brand) { prune(pack.brand); if (!Object.keys(pack.brand).length) delete pack.brand; }
  return pack;
}

async function save() {
  const res = await api('PUT', `pack/${S.inst}`, { pack: tidy(clone(S.pack)), rev: S.data.rev });
  if (!res.ok) { toast(res.data.error); return false; }
  toast('Draft saved. Students still see the published version.');
  await loadPack();
  return true;
}

// ---------- events ----------

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!S.pack) return;
  if (el.dataset.path) {
    setPath(S.pack, el.dataset.path, el.dataset.number !== undefined ? (el.value === '' ? '' : Number(el.value)) : el.value);
  } else if (el.dataset.one) {
    setPath(S.pack, el.dataset.one, el.value ? [el.value] : '');
  } else if (el.dataset.list) {
    const boxes = [...document.querySelectorAll(`[data-list="${el.dataset.list}"]`)];
    setPath(S.pack, el.dataset.list, boxes.filter((b) => b.checked).map((b) => b.value));
  } else if (el.dataset.contact) {
    // A service's phone and website are stored as its "contacts".
    const group = [...document.querySelectorAll(`[data-service="${el.dataset.service}"]`)];
    const get = (k) => group.find((g) => g.dataset.contact === k).value.trim();
    const contacts = [];
    if (get('tel')) contacts.push({ label: get('label') || get('tel'), tel: get('tel').replace(/[^\d+]/g, '') });
    if (get('url')) contacts.push({ label: get('url').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), url: get('url') });
    setPath(S.pack, `${el.dataset.service}.contacts`, contacts.length ? contacts : '');
  } else return;
  if (!S.dirty) { S.dirty = true; document.querySelector('[data-action="save"]')?.removeAttribute('disabled'); }
  paintPreview();
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const { action } = el.dataset;
  if (action === 'institution') {
    if (S.dirty && !window.confirm('You have unsaved changes. Leave without saving?')) { el.value = S.inst; return; }
    S.inst = el.value; S.users = null; await loadPack();
  } else if (action === 'layer') { S.layer = el.value; render(); }
  else if (action === 'card-toggle') {
    const cards = (S.pack.cards ||= {});
    const off = new Set(cards.off || []);
    if (el.checked) off.delete(el.dataset.id); else off.add(el.dataset.id);
    cards.off = [...off];
    S.dirty = true; render();
  } else if (action === 'position') {
    const b = layerObj().map.buildings[Number(el.dataset.index)];
    const old = Object.values(S.catalogue.positions).find((p) => p.x === b.x && p.y === b.y);
    const pos = S.catalogue.positions[el.value];
    // Standard directions follow the building to its new place; your own wording is kept.
    if (!b.directions || (old && b.directions.en === old.en)) b.directions = { en: pos.en };
    Object.assign(b, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
    S.dirty = true; render();
  }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('button[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  const ownCard = () => S.pack.cards.add[el.dataset.chapter][Number(el.dataset.index)];
  if (action === 'tab') { S.tab = id; render(); loadTab(); }
  else if (action === 'forgot') { S.step = 'forgot'; render(); }
  else if (action === 'codes-saved') { S.backupCodes = null; await start(); }
  else if (action === 'to-login') { S.step = 'login'; render(); }
  else if (action === 'page-remove') { if (window.confirm('Remove this list?')) { delete layerObj().pages[id]; S.dirty = true; render(); } }
  else if (action === 'item-add') { (layerObj().pages[id].items ||= []).push({ name: '', detail: { en: '' } }); S.dirty = true; render(); }
  else if (action === 'item-remove') { layerObj().pages[id].items.splice(Number(el.dataset.index), 1); S.dirty = true; render(); }
  else if (action === 'owncard-remove') { if (window.confirm('Remove this card?')) { S.pack.cards.add[el.dataset.chapter].splice(Number(el.dataset.index), 1); S.dirty = true; render(); } }
  else if (action === 'choice-add') { ownCard().choices.push({ id: 'c', label: { en: '' }, outcome: { en: '' }, effects: {} }); S.dirty = true; render(); }
  else if (action === 'choice-remove') { const c = ownCard().choices; c.splice(Number(id), 1); c.forEach((x, i) => { x.id = 'abc'[i]; }); S.dirty = true; render(); }
  else if (action === 'save') await save();
  else if (action === 'logout') { await api('POST', 'logout'); S.me = null; S.data = null; S.step = 'login'; render(); }
  else if (action === 'two-step-begin') { const r = await api('POST', 'two-step/begin'); if (r.ok) S.twoStep = r.data; else S.notice = r.data.error; render(); }
  else if (action === 'check') { el.disabled = true; toast('Checking: this plays the whole story on every campus…'); S.check = (await api('POST', `pack/${S.inst}/check`)).data; render(); }
  else if (action === 'submit') {
    el.disabled = true;
    toast('Checking before submitting…');
    const r = await api('POST', `pack/${S.inst}/submit`);
    if (r.ok) { toast('Submitted for review.'); await loadPack(); } else { S.check = r.data.errors ? r.data : null; toast(r.data.error); render(); }
  } else if (action === 'rollback') {
    if (!window.confirm(`Publish version ${id} again? Students will see it as a new version.`)) return;
    const r = await api('POST', `pack/${S.inst}/rollback`, { version: Number(id) });
    toast(r.ok ? `Published as version ${r.data.version}.` : r.data.error);
    await loadPack();
  } else if (action === 'campus-remove') {
    if (!window.confirm('Remove this campus and everything set for it?')) return;
    S.pack.campuses = S.pack.campuses.filter((c) => c.id !== id);
    if (!S.pack.campuses.length) delete S.pack.campuses;
    S.layer = ''; S.dirty = true; render();
  } else if (action === 'building-remove') {
    layerObj().map.buildings.splice(Number(el.dataset.index), 1);
    S.dirty = true; render();
  } else if (action.startsWith('user-')) {
    const r = await api('POST', `users/${id}/${action.slice(5)}`);
    if (r.ok && r.data.temporaryPassword) window.prompt('Temporary password. It is shown once: copy it now.', r.data.temporaryPassword);
    else toast(r.ok ? 'Done.' : r.data.error);
    S.users = (await api('GET', 'users')).data; render();
  }
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'login') {
    const r = await api('POST', 'login', f);
    if (r.ok) {
      S.needCode = false;
      await signedIn(r.data);
      if (r.data.backupCodesLeft !== undefined) toast(`You signed in with a backup code. ${r.data.backupCodesLeft} left.`);
      return;
    }
    S.needCode = r.data.need === 'code' || S.needCode;
    S.notice = r.data.need === 'code' && !f.code ? null : r.data.error;
    render();
    if (S.needCode) { app.querySelector('[name=email]').value = f.email; app.querySelector('[name=password]').value = f.password; app.querySelector('[name=code]').focus(); }
  } else if (kind === 'password') {
    const r = await api('POST', 'password', f);
    if (r.ok) await start(); else { S.notice = r.data.error; render(); }
  } else if (kind === 'two-step') {
    const r = await api('POST', 'two-step/confirm', f);
    if (r.ok) { S.twoStep = null; S.backupCodes = r.data.backupCodes || null; if (S.backupCodes) render(); else await start(); } else { S.notice = r.data.error; render(); }
  } else if (kind === 'forgot') {
    const r = await api('POST', 'reset/request', f);
    S.notice = 'If that address has an account, a link is on its way.';
    render();
    if (r.data.link) window.prompt('No mail server is set up, so the email was written to data/outbox/. This is the link in it:', r.data.link);
  } else if (kind === 'set-password') {
    const r = await api('POST', 'reset/confirm', { token: S.linkToken, password: f.password });
    if (!r.ok) { S.notice = r.data.error; render(); return; }
    S.linkToken = null; S.step = 'login';
    render();
    toast('Password saved. Sign in with it now.');
  } else if (kind === 'page-add') {
    const pages = (layerObj().pages ||= {});
    if (pages[f.id]) { toast('That list id is already used.'); return; }
    pages[f.id] = { title: { en: '' }, items: [] };
    S.dirty = true; render();
  } else if (kind === 'owncard-add') {
    const all = [...S.catalogue.chapters.flatMap((ch) => ch.cards.map((c) => c.id)), ...Object.values(S.pack.cards?.add || {}).flat().map((c) => c.id)];
    if (all.includes(f.id)) { toast('That card id is already used.'); return; }
    const chapter = S.catalogue.chapters.find((ch) => ch.id === f.chapter);
    const blank = (cid) => ({ id: cid, label: { en: '' }, outcome: { en: '' }, effects: {} });
    (((S.pack.cards ||= {}).add ||= {})[f.chapter] ||= []).push({ id: f.id, type: 'situational', pool: chapter.pools[0], title: { en: '' }, text: { en: '' }, choices: [blank('a'), blank('b')] });
    S.dirty = true; render();
  } else if (kind === 'campus-add') {
    const list = (S.pack.campuses ||= []);
    if (list.some((c) => c.id === f.id)) { toast('That campus id is already used.'); return; }
    list.push({ id: f.id, name: { en: '' }, courses: [] });
    S.dirty = true; render();
  } else if (kind === 'building-add') {
    const layer = layerObj();
    const buildings = ((layer.map ||= {}).buildings ||= []);
    if (buildings.some((b) => b.id === f.id)) { toast('That building id is already used.'); return; }
    const free = Object.values(S.catalogue.positions).find((p) => !buildings.some((b) => b.x === p.x && b.y === p.y));
    buildings.push({ id: f.id, name: { en: '' }, x: free.x, y: free.y, w: free.w, h: free.h, directions: { en: free.en } });
    S.dirty = true; render();
  } else if (kind === 'review') {
    const decision = e.submitter?.value;
    const r = await api('POST', `pack/${S.inst}/review`, { decision, note: f.note });
    toast(r.ok ? (decision === 'approve' ? `Published as version ${r.data.version}. Students get it the next time they open the app online.` : 'Sent back to the editor.') : r.data.error);
    if (!r.ok && r.data.errors) S.check = r.data;
    await loadPack();
  } else if (kind === 'licence') {
    const r = await api('POST', `pack/${S.inst}/licence`, f);
    toast(r.ok ? 'Saved to the draft. It goes live through review.' : r.data.error);
    await loadPack();
  } else if (kind === 'institution-add') {
    const r = await api('POST', 'institutions', f);
    if (!r.ok) { toast(r.data.error); return; }
    S.institutions = (await api('GET', 'institutions')).data;
    S.inst = r.data.id; S.tab = 'details';
    await loadPack();
    toast('Created. Fill it in, then submit it for review.');
  } else if (kind === 'user-add') {
    const r = await api('POST', 'users', f);
    if (!r.ok) { toast(r.data.error); return; }
    if (r.data.invited && r.data.link) window.prompt(`Invitation written to data/outbox/ for ${r.data.user.email}. No mail server is set up, so here is the link in it:`, r.data.link);
    else if (r.data.invited) toast(`Invitation emailed to ${r.data.user.email}.`);
    else window.prompt(`Account created for ${r.data.user.email}. Temporary password, shown once: copy it now.`, r.data.temporaryPassword);
    form.reset();
    S.users = (await api('GET', 'users')).data; render();
  }
});

window.addEventListener('beforeunload', (e) => { if (S.dirty) e.preventDefault(); });

start();
