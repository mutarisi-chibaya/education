# University Simulator: MVP and vision

## The vision

Every South African student should be able to rehearse the hard parts of studying before
they happen: the late allowance, the registration surprise, the failed module, the week
when everything is due at once. A student who has already made those choices once, in a
game, knows where the help is and asks for it sooner.

University Simulator is that rehearsal. It runs on a cheap phone, works offline, needs no
account, and stores nothing personal.

## Our focus now: universities

The MVP is a complete product for universities. We chose universities first because the
research the game is built on, and the student interviews behind the cards, are about
university life.

"Complete for universities" means a student can play the whole journey for their own
university and campus, and a university can be added without changing the app.

## What is in the MVP

**For the student**

- The full journey in seven chapters: Before You Apply, Arrival, First Term, First Exams,
  Bounce Back, Middle Years and Finish Line.
- A character built from their own situation: institution, campus, course, housing, funding,
  monthly money, where they come from, laptop, family needs and age.
- Three meters (money, marks, wellbeing), with choices that have consequences and a way
  through every crisis.
- Support that is specific: what each service offers, which building and room it is in, its
  hours, an email address, a campus map with directions, and the page it tells you to look at.
- A Semester Forecast and a survival plan after every chapter, which can be saved or shared.
- Campus Realities: ten optional topics on discrimination, harassment, abuse and safety.
  Never scored, and nothing about what is viewed is saved.
- English and isiZulu throughout; menus in five more languages.
- Offline play, no login, and progress kept only on the phone.

**For the university**

- Its own campus in the app: services, buildings, map, costs, lists, colours and name.
- Several campuses under one university, each with its own map, services and courses.
- Control over its cards: switch one off, reword it, or add its own. The game rules stay the
  same everywhere.
- Anonymous numbers for its own students: how many completed each chapter and what they said.

- A staff portal where its own people edit that campus. A second person must approve every
  change before students see it, each published version is kept and can be restored, and
  there is a permanent record of who changed what. Accounts use two-step login.

**For us, to run it**

- A university is added in the staff portal, or by filling in spreadsheets and running one command.
- An automatic check that refuses a pack with unverified phone numbers, services in
  buildings that do not exist, or a story that can no longer be played to the end.
- A yearly audit that lists phone numbers and licences that need re-checking.

The MVP ships with two fictional demo universities: Sizwe University (three campuses) and
Karoo Coast University (one campus, built from the spreadsheets to prove the process).

## Built to grow beyond universities

We are not building for colleges yet, but we have made sure nothing stops them joining.

What already works for any institution:

- Each institution has a type: university, TVET college or private college. Students see
  the list grouped by type and can search it by name or province.
- An institution can bring its own courses or programmes, not only the ones we ship.
- A phone downloads only the institution the student chooses, so the app stays small
  however many institutions join.
- Services, maps, costs, branding and campuses work the same for a college as for a
  university.

What a college would still need:

- **Its own storyline.** Our journey is university life: lectures, residences, semester
  exams, a three- or four-year degree. A college student's journey is different in its
  programmes, its year structure and its funding rules, so the chapters need to be written
  for it. This is content work on top of the same engine, not a new app.

## How we keep that door open

As we keep working on scale, we hold to four rules so that other institutions remain possible:

1. **Nothing about an institution lives in the code.** Names, services, courses, costs and
   card changes are data in that institution's pack.
2. **Shared content stays general.** A card in the shared story must make sense on any
   campus. Anything particular to one institution goes in its own pack.
3. **The story is separable from the engine.** Chapters are files the engine reads, so a
   different journey for a different kind of institution is a new set of files.
4. **Every pack is checked the same way.** The check that protects students at one
   university protects them at every institution, whatever its type.

## What comes after the MVP

In the order we expect to do it:

1. **Pilot with one or two real universities.** Their Student Affairs teams enter and verify
   every service and number in the staff portal, and real students play it.
2. **Professional review of Campus Realities**, and first-language review of every translation.
3. **Managed hosting**: a hosted database, a production web server, backups and email
   invitations for staff, so the portal, the anonymous numbers and pack updates work for
   many institutions at once.
4. **A college storyline**, written with TVET students and staff, once universities are
   working well.

## What we are not claiming

- The demo universities are fictional. No real university has licensed the app yet.
- Amounts, rules and dates in the game are examples, and the game is not professional advice.
- The forecast uses clear, research-based rules. It is not a trained AI model.
