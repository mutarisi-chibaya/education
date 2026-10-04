# First Year Sim — Build Spec for Claude Code (v2)

A mobile-first, offline-capable web game (PWA) with a small Python server, where South African students rehearse university life before it happens. Demo campus: **Sizwe University** (fictional), plus a **general version** for any South African university. Hackathon deadline: **23 October**. Stop adding chapters around **18 October**.

Everything content-related is **data**. The engine reads content packs, so cards can be added or rewritten without touching game logic.

---

## 1. Product rules

- **Judges play alone in Round 1.** The app must explain itself: 2–3 intro screens, an About screen, a For universities screen, no broken or "coming soon" screens.
- **Short runs:** each chapter draws a fixed budget of content (see section 6). First Term ≈ 10 minutes; other chapters ≈ 5–8 minutes.
- **Home screen = journey map** from matric to graduation. Built chapters tappable; unbuilt chapters greyed out, labelled "Roadmap", not tappable.
- **Offline first:** content packs are bundled in the app. The server only supplies updates. If the server is down or asleep, the app silently uses the bundled packs.
- **No logins, nothing personal stored.** Progress stays on the device.
- **Tone:** real, not scary. No judgement. Every crisis has a way through. Include humour and wins.
- **Fair game:** setups differ in difficulty, and the final screen says so honestly.
- **Legal:** no real university names, logos or copied text. Independence disclaimer. Not professional advice. Never invent phone numbers; urgent help uses real, verified national services only.

---

## 2. Setup questions

| Key | Question | Options |
| --- | --- | --- |
| `institution` | Which version? | sizwe (fictional demo), general |
| `status` | Which describes you? | deciding, accepted, current_student |
| `course` | Course | BSc, BCom, BA, BEng |
| `housing` | Where will you live? | residence, private_rental, commuting, living_at_home |
| `funding` | How are you funded? | nsfas, bursary, family, self |
| `origin` | Where are you coming from? | same_city, other_city, village_rural |
| `laptop` | Do you have a laptop? | yes, no |
| `family_needs` | Might your family need money from you? | yes, no |
| `age_role` | Which describes you? | straight_from_school, older_with_responsibilities |

---

## 3. State model

**Visible meters (0–100):** `money`, `marks`, `wellbeing`.

**Hidden trackers (persist across chapters):**

| Tracker | Meaning | Effect |
| --- | --- | --- |
| `connection` | Friends, societies, O-Week | Low → loneliness cards; high → chosen family win |
| `buffer` | Emergency money saved | Softens surprise expenses |
| `help_seeking` | Times the player reached out | Coping profile, forecast |
| `family_obligation` | Money sent home | Family pressure scales in later chapters |
| `confidence` | Feeling able to cope and ask | Raised by asking and wins; lowered by staying quiet |
| `debt` | Unpaid fees or loans | Registration-block and certificate cards |
| `bunk_count` | Lectures skipped | Raises chance of failing a module in First Exams |

**Coping tags:** `help_seeker`, `avoider`, `borrower`, `planner`, `self_sacrificer`, `connector`.

**Effect sizes:** small ±5, medium ±10, large ±20.

**Flags:** e.g. `went_to_oweek`, `joined_sports`, `signed_gym_contract`, `borrowed_from_friend`, `failed_module`, `repeating_module`, `came_with_friend`.

---

## 4. Content types

| Type | What it is | Player time | Effort to write |
| --- | --- | --- | --- |
| `core` | Big moment everyone faces, 2–3 choices | ~45 s | High |
| `situational` | Core-style card shown only when conditions match | ~45 s | High |
| `mini` | One tap on the week dashboard, 2 options, one-line result | ~5 s | Low |
| `tip` | One sentence attached to an outcome or support card, no choice | ~3 s | Very low |
| `random` | Drawn from a pool (surprise expense, outage) | ~30 s | Medium |
| `recurring` | A returning thread from an earlier chapter | ~45 s | Medium |
| `friend_story` | Light main-game moment that links to Campus Realities | ~30 s | Medium |
| `win` / `light` | Positive or humorous moment | ~15 s | Low |

**Writing rules (enforce in content validation):**
- Situation text ≤ 40 words
- Choice labels ≤ 6 words, 2–3 choices (mini: exactly 2)
- Outcome text ≤ 2 sentences
- Longer information belongs on a support card or in the survival plan

---

## 5. Data schema

```json
{
  "id": "FT-03",
  "chapter": "first_term",
  "type": "core",
  "week": 3,
  "conditions": { "funding": ["nsfas", "bursary"] },
  "weight": 1.0,
  "title": "Your allowance is late",
  "text": "It's been two weeks. You have R60 left and your fridge is almost empty.",
  "choices": [
    { "label": "Borrow from a friend", "effects": { "money": 10, "connection": 1, "debt": 1 },
      "flags": ["borrowed_from_friend"], "tags": ["borrower"],
      "outcome": "Your friend lends you R200. Food is sorted, but you owe money next month." },
    { "label": "Skip meals until it arrives", "effects": { "wellbeing": -15, "marks": -5 },
      "tags": ["self_sacrificer", "avoider"],
      "outcome": "You get through it, but you're tired and can't focus in lectures." },
    { "label": "Ask about campus food vouchers", "effects": { "money": 5, "wellbeing": 5, "help_seeking": 1 },
      "tags": ["help_seeker"], "support": ["food_programme", "financial_aid_office"],
      "tip": "Most South African universities run food support. Ask student affairs what yours offers.",
      "outcome": "The food programme gives you vouchers, and financial aid checks your payment." }
  ],
  "forecast_tags": ["money_shortfall"],
  "research": "USAf Understanding Students Issue 2 (2018)"
}
```

**Mini moment:**

```json
{ "id": "MM-KFC", "type": "mini", "chapter": "first_term",
  "text": "Your friends are heading to KFC. You have R40 left for the week.",
  "choices": [
    { "label": "Go and pay anyway", "effects": { "money": -10, "connection": 1 }, "outcome": "Fun night. Thin week." },
    { "label": "Suggest something cheaper", "effects": { "connection": 1, "confidence": 1 }, "outcome": "Two friends were relieved you said it." }
  ] }
```

**Support cards** live in each content pack (`support`), keyed by id: name, what it offers, how to reach it, `verified` flag, `last_checked` date. Fictional campus services have names and descriptions only, no phone numbers.

**Content pack (one per institution):**

```json
{ "institution": "sizwe", "version": 3, "name": "Sizwe University (fictional)",
  "costs": { "rent_private": 3500, "taxi_week": 250 },
  "support": [ ... ], "cards": [ ... ], "minis": [ ... ], "tips": [ ... ] }
```

---

## 6. Run budgets and selection

| Chapter | Cards per run | Minis per run |
| --- | --- | --- |
| Prequel | 5 | 2 |
| Arrival | 5 | 2 |
| First Term | 8 | 4 |
| First Exams | 6 | 3 |
| Bounce Back | 5 | 2 |
| Middle Years | 6 | 3 |
| Finish Line | 6 | 2 |

Selection: fixed-week core cards first, then fill remaining slots with situational and random cards whose conditions match, weighted by trackers (adaptive). Every chapter includes at least one win.

---

## 7. Global mechanics

- **Friday choice** (First Term onward): go out or stay in. If out, a safety mini may follow (travel together, plan transport).
- **Small spends** and **social spending** minis (friends' money vs yours).
- **Bunking mini** ("Go to the 8am lecture?"), feeding `bunk_count`.
- **Random surprise expense** (softened by `buffer`) and **random outage** (worse in test/exam weeks).
- **Chapter forecast** at the end of every chapter (section 10).

---

## 8. Chapters

Build order: **First Term → Arrival → First Exams → Finish Line → Bounce Back → Prequel → Middle Years.**

### Prequel: Before You Apply (matric) — if time

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| PRE-01 | core | Choosing a course: love vs pay vs marks | Follow passion; choose for pay; ask a careers advisor |
| PRE-02 | core | Your friends are all applying to one university | Follow them; compare yourself; apply to both |
| PRE-03 | core | How many applications, and the fees | One; three; check fee waivers |
| PRE-04 | core | NSFAS application: missing consent form, details don't match | Submit anyway; fix it first; get help at school |
| PRE-05 | situational | Family wants you close to home or in another course | Agree; negotiate; follow your plan |
| PRE-06 | core | Results day: lower than expected | Panic; check what you qualify for; consider a rewrite |
| PRE-07 | situational | Rejected or waitlisted | Wait a year; TVET college; late placement |
| PRE-W1 | win | Acceptance letter | — |
| Minis | mini | Try a university's version before choosing; parent asks how much it all costs | — |

### Chapter 0: Arrival — build

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| ARR-01 | core | Saying goodbye; first night alone | Call home; unpack and explore; stay in your room |
| ARR-02 | core | O-Week: where most first friends are made | Go to everything; go to some; skip it |
| ARR-03 | situational | No residence space; students being turned away (`housing`=residence) | Take the first room offered; check it's legitimate; ask the university for help |
| ARR-04 | core | Unexpected registration payment, or funding not confirmed | Borrow; ask family; ask financial aid about options |
| ARR-05 | situational | First time in the city; lost on campus (`origin`≠same_city) | Wing it; ask a senior; use orientation |
| ARR-06 | situational | No laptop; compulsory computer-skills module and portal setup (`laptop`=no) | Borrow a friend's; computer labs; ask about device support |
| ARR-07 | situational | None of your friends came here | Keep to yourself; talk to your neighbour; join activities |
| ARR-08 | situational | Arranging care for someone at home (`age_role`=older) | Commute daily; family help; ask about flexible support |
| ARR-W1 | win | First friend in the registration queue | — |
| Minis | mini | "You're on your own now": cooking, waking up, managing time | — |

### Chapter 1: First Term (8 weeks) — build (core)

| ID | Week | Event | Choices |
| --- | --- | --- | --- |
| FT-01 | 1 | **Lecture shock:** "you did this in high school"; you didn't, and you're embarrassed to ask in English | Ask in class; ask after class; ask a friend in your language; stay quiet |
| FT-02 | 2 | **Societies Day** | Sports team; expensive gym contract; cheaper student gym; join nothing; "I can't afford to join" |
| FT-03 | 3 | Allowance late, food running out | Borrow; skip meals; ask about campus food vouchers |
| FT-04 | 4 | Family asks for R400 | Send it; send part; explain you can't |
| FT-05 | 5 | Workload clash; no laptop; textbook you can't afford | Cram alone; drop one; tutorials, library, second-hand book |
| FT-06 | 6 | Lonely, thinking of going home (weighted by low `connection`) | Push through; call home; counselling or a mentor |
| FT-07 | 7 | Test week | Outcome from earlier choices |
| FT-08 | 8 | Results: passed, but lower than you hoped | Give up on it; find out why; get help |

**Situational / random**

| ID | Event | Conditions |
| --- | --- | --- |
| FT-S1 | Rent delayed by funding; landlord cuts Wi-Fi or threatens action | private_rental + nsfas/bursary |
| FT-S2 | "Cheap room, pay the deposit today" scam | private_rental |
| FT-S3 | Taxi fares rise / taxi doesn't come before a test | commuting |
| FT-S4 | Gym debit order you forgot about | `signed_gym_contract` |
| FT-R1 | Surprise expense (stolen phone, lab coat) | any |
| FT-R2 | Water or power outage | any |

**Minis:** class WhatsApp group (join / start one / ignore); friends to KFC; 8am lecture or skip; someone mocks your accent; getting home safely after a night out; takeaway temptation.

**Friend's story (light, links to Campus Realities):** a friend seems shaken after a party; an international friend faces xenophobic comments; a friend is treated unfairly because of race.

**Main-game positive moments:** a friend thinks she might be pregnant and you help her find campus health services; a friend comes out to you and later finds their community in a society; a new relationship eats your time and money (keep it funny).

**Wins:** a good test mark; a new friend from your team (`joined_sports`).

### Chapter 2: First Exams — build

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| EX-01 | core | Three exams in four days | Cram all night; make a timetable; drop social plans |
| EX-02 | core | **Study help:** private tutor, bought notes or past papers, paid "assignment help", or free options | Pay a tutor; buy notes; pay for "help" (misconduct risk); free tutorials and department past papers |
| EX-03 | random | Outage in exam week | Library; candlelight cram; a friend's place |
| EX-04 | core | Exam anxiety | Push through; sleep and breathing; talk to someone |
| EX-05 | core | You failed a module (more likely with high `bunk_count`) | Hide it; find out options; see an advisor |
| EX-06 | core | What results mean for funding and progression | Ignore it; check the rules; plan next semester |
| EX-07 | situational | Bursary cut off mid-year (`funding`=bursary) | Panic; appeal; financial aid and other funding |
| EX-08 | core | Holidays: go home or stay and work | Go home; stay and work; split it |
| EX-F1 | friend_story | A friend failed and wants to drop out | Agree; help find options; connect to support |
| EX-W1 | win | Passed the module you feared | — |
| EX-W2 | win | Dean's List (if `marks` high) | — |

### Chapter 3: Bounce Back — if time

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| BB-01 | situational | Academic warning letter (`failed_module`) | Ignore; read carefully; see an advisor |
| BB-02 | situational | Repeating a module plus new ones | Overload; drop an elective; plan with an advisor |
| BB-03 | core | "Am I in the wrong course?" | Quit; change course; careers advisor |
| BB-04 | recurring | The friend you came with leaves (`came_with_friend`) or a close friend drops out | Withdraw; stay in touch; build new connections |
| BB-05 | core | Part-time job vs study time | Take it; decline; fewer hours |
| BB-06 | situational | Funding at risk: appeal | Give up; appeal with evidence; get help writing it |
| BB-07 | core | Seeing your lecturer about your marks | Avoid it; email; consultation hours |
| BB-W1 | win | Chosen family: friends bring food and notes when you're sick (high `connection`) | — |
| BB-W2 | win | Passed the module you failed | — |

### Chapter 4: Middle Years — if time

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| MY-00 | situational | Can't register: outstanding fees (`debt`>0) | Panic; payment plan; debt relief options |
| MY-01 | core | Moving off campus: lease, deposit, housemates | Sign quickly; read the lease; view with a senior |
| MY-02 | core | Choosing your major | Follow friends; follow interest; careers advisor |
| MY-03 | core | Side hustle and part-time work | Go big; small and steady; not now |
| MY-04 | recurring | Friends move ahead; you're behind (`repeating_module`) | Hide; tell them; new study friends |
| MY-05 | recurring | Family expects more as you near earning | Send more; set a limit; explain your plan |
| MY-06 | core | Vacation work, internships, talking to a lecturer about careers | Skip it; apply widely; CV help |
| MY-07 | core | Chance to tutor or lead a society | Decline; accept; small role |
| MY-08 | core | Burnout | Push through; rest; get help |
| MY-W1 | win | Landed vacation work | — |

### Chapter 5: Finish Line — build

| ID | Type | Event | Choices |
| --- | --- | --- | --- |
| FL-01 | core | Final-year project pressure | Leave it late; plan milestones; meet your supervisor |
| FL-02 | core | Graduate applications and rejections | Stop applying; ask for feedback; widen search |
| FL-03 | recurring | Friends graduate before you | Isolate; celebrate them; find your people |
| FL-04 | situational | Certificate held back until fees are paid (`debt`>0) | Give up; payment plan; debt relief programmes |
| FL-05 | situational | Funding running out because you took longer | Drop out; part-time; appeal or find a bursary |
| FL-06 | core | Job offer far from home vs family expectations | Decline; accept; negotiate |
| FL-07 | core | "Do I actually feel job-ready?" | Hope for the best; build skills; career support |
| FL-08 | core | Graduation costs: gown, family travel | Skip it; budget; ask for help |
| FL-W1 | win | Graduation day → final journey summary | — |

---

## 9. Campus Realities (separate, optional section)

Topics: xenophobia; racism and discrimination; sexual assault and rape; sexual harassment (including by people in power); abuse in relationships; drink spiking and party safety; homophobia and transphobia; exclusion of students with disabilities; residence initiations and hazing; online abuse including sharing intimate images.

MVP: at least 3 topics (suggest xenophobia, sexual assault, drink spiking).

Each topic screen:
1. **Recognise it** (including subtle forms)
2. **Short scenario** with choices and explanatory feedback — **never scored**
3. **If it happens to you** — options at your own pace, no pressure to report
4. **If it happens to a friend, or you see it** — support and safe bystander action
5. **Rights and where to go** — campus office types, reporting options, verified national helplines

Rules: opt-in; content note first; quick-exit button on every screen; **nothing recorded about what was viewed**; wording reviewed by a support professional before launch.

---

## 10. Semester Forecast (Intelligence)

Runs at the end of every chapter, remembers earlier chapters.

1. **Money forecast:** weekly cash flow from setup and pack costs; week money runs out (on time vs allowance two weeks late).
2. **Spending leaks:** total of Friday, social and small-spend choices.
3. **Coping profile:** most frequent tag.
4. **Risk weeks:** 1–2 highest-risk weeks of the next chapter.
5. **Adaptive selection:** trackers weight next chapter's cards.
6. **Cross-chapter memory:** e.g. "In First Term you avoided help three times…"
7. **Fair game reflection** (final screen).
8. **Optional AI plan:** server endpoint writes the plan in natural language when online; template fallback offline.

**Survival plan:** budget, buffer target, "allowance is late" playbook, risk weeks, support types. Advice phrased to hold on any real campus. Shareable as an image.

---

## 11. Server (Python, small)

| Endpoint | Purpose |
| --- | --- |
| `GET /institutions` | List available versions (sizwe, general) |
| `GET /packs/{institution}` | Latest content pack (JSON) with version number |
| `POST /stats` | Anonymous completion counts `{device_id (random), chapter, completed, feedback?}` |
| `POST /plan` (optional) | AI-written survival plan; API key held server-side |

App behaviour: try server for newer pack; on failure or timeout, use bundled pack. Store pack version with saved game; migrate or restart chapter if versions differ.

**Later (not for hackathon):** licence registry (institution, status, tier, expiry); Partner Portal with staff logins + MFA, roles (editor/reviewer), review before publish, audit log.

---

## 12. Security and privacy

- HTTPS everywhere
- No secrets in front-end code; API keys in server environment variables
- Public endpoints read-only except `/stats` and `/plan`
- `/stats`: validate schema, rate-limit, restrict CORS to the app domain, dedupe by random device ID
- Render all card and pack text as **plain text**, never HTML (prevents XSS, important once partners write content)
- Minimal, updated dependencies
- Progress stored on device only; Campus Realities never tracked
- Privacy notice screen in plain language

---

## 13. Screens

1. Intro (2–3 swipes)
2. Setup
3. Journey map (home)
4. Week dashboard (meters, Friday choice, minis)
5. Event card
6. Outcome (+ tip)
7. Support card
8. Content note
9. Chapter forecast
10. Survival plan
11. Final journey summary + fair game reflection
12. Campus Realities (topic list + topic screens)
13. About (what it's based on; "Tested by X students in October 2026" — real numbers only)
14. For universities (licensing explained, contact)
15. Feedback (3 questions after a chapter)
16. Privacy notice

---

## 14. Testing checklist

- [ ] Every chapter completes for every setup combination; no dead ends
- [ ] No placeholder text in playable chapters
- [ ] Works offline after first load; works with server down
- [ ] Tested on a low-cost Android phone with slow data
- [ ] Content validation passes (word limits, choice counts)
- [ ] National helpline numbers verified; no invented numbers anywhere
- [ ] "Sizwe University" confirmed as not a real institution name
- [ ] Campus Realities reviewed; quick exit works on every screen
- [ ] Testing round 1 (12–14 Oct) and round 2 (18–20 Oct); results recorded honestly

---

## 15. Research sources

- USAf & UFS, *Understanding Students* Issue 1 (2018) — http://www.usaf.ac.za/wp-content/uploads/2018/04/Understanding-students_WEB.pdf
- USAf & UFS, *Understanding Students* Issue 2 (2018) — https://usaf.ac.za/wp-content/uploads/2018/04/Understanding-student-Putting-Students-at-the-Centre-of-Institutional-Design_-Web.pdf
- National student mental health survey — https://www.mentalhealthdataprizeafrica.aphrc.org/repository/paper/36211/the-mental-health-of-university-students-in-south-africa-results-of-the-national-student-survey
- Violence and mental health among female students — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9266174/
- Higher Health — https://higherhealth.ac.za/suicide-prevention-and-mourning-the-tragic-loss-of-students/
- DHET cohort report coverage — https://www.ru.ac.za/equityandinstitutionalculture/latestnews/archives2015/black_drop-out_rate_shock.html
- RU Game — https://grocotts.ru.ac.za/?p=673734
- Student interviews (October 2026): lecture shock, WhatsApp groups, study help costs, social spending, rent delays, O-Week, tech skills, bursary cuts
