# Business case

Why University Simulator exists, who it is for, who pays, and what it costs to run. It is
written for investors, universities and new team members. What the product does in detail is
in [APP_OVERVIEW.md](../APP_OVERVIEW.md); what is built and what comes next is in
[MVP.md](../MVP.md).

Last reviewed: 10 October 2026.

**Status of the numbers.** No university has licensed the app yet. Prices, targets and
workloads below are our estimates. Service prices come from published rates checked in
October 2026, and the basis for each is given beside it.

## The problem

South African students are getting into university and then not finishing, and it is rarely
because help does not exist. They meet predictable crises unprepared, and they cannot find
the support their university already offers in time. Of roughly 620,000 NSFAS-funded
first-years in 2023, only about 130,000 were still funded in 2024 (GroundUp). Some found
other funding or stopped qualifying, but many dropped out or failed the academic rules to
continue. A study of funded students in Northern Gauteng linked dropout to late and
insufficient funding together with personal, institutional and health factors (Unisa).
Universities South Africa's *Understanding Students* research and our own student
interviews (October 2026) add lecture shock, workload, loneliness, rent delays and pressure
to send money home.

The students who suffer most are first-generation students from low-income households,
often far from home, with no one in the family who has been to university. They have four
pain points:

- A late allowance, a failed module or a registration block arrives for the first time,
  with no practice at handling it.
- Food programmes, counselling, tutoring and financial aid exist, but students do not know
  a service's name, where it is, when it is open or whether it is meant for them.
- They find help only after they have already fallen behind.
- The university speaks in terms they have never heard, such as result codes and
  supplementary exams.

## The solution

University Simulator keeps students supported from acceptance through graduation. Students
rehearse each stage before it happens, and when real problems come up, Campus services shows
them where to go, any day of the year.

| Part | What it does |
|---|---|
| Personal setup | The student enters their own university, campus, course, housing, funding, monthly money, laptop and family needs, so everything that follows fits their actual life |
| Campus services | 25 needs in plain words ("I'm hungry", "My allowance is late"), each leading to the service at the student's own campus, plus national helplines that are always shown |
| Rehearsal | Seven chapters from matric to graduation, 106 situation cards, three meters (money, marks, wellbeing). Choosing to get help introduces the same service cards students use later |
| Forecast and plan | The riskiest weeks ahead, the week money runs short, and a survival plan to save or send to family |
| Campus Realities | Ten untracked topics on harassment, discrimination and safety |
| Staff portal | A university keeps its own details current; a second person approves every change |
| Access | Seven languages, offline after the first load, no account, no personal data |

We focus on the last part of the challenge, remaining supported through graduation. The
Before You Apply chapter introduces pathways, funding and applications; it is not an
application tool.

## Why it is different

Other tools either help students get in or publish information about support. University
Simulator gives students practice at the hard moments, built around their own situation,
then stays on their phone as a route to their own campus's services until graduation. It is
made for South African realities such as NSFAS delays, family obligations, accommodation
scams and data costs.

What we guarantee that others may not:

- **Support that is always reachable.** After the first load, Campus services works offline,
  with no data and no login.
- **Checked before students see it.** Every change a university makes is checked
  automatically. A phone number that staff have not confirmed and dated is refused, as is a
  service in a building that is not on the campus map. A campus number not re-confirmed in
  400 days is hidden.
- **The university is accountable for its accuracy.** Its own staff keep details current,
  with two-person approval and a permanent record of every change.
- **Students meet the service before they need it.** The game introduces almost every
  service inside a situation.

## Customers and users

| | Who |
|---|---|
| Users (never pay) | Students at South African public universities from acceptance to final year, especially first-generation and NSFAS-funded students on entry-level Android phones with limited data. Matriculants still deciding. Families, who receive the survival plan |
| Customers (pay) | Universities, through their Student Affairs and first-year experience offices |

## How it reaches students

- The university sends a link with the acceptance letter and again at orientation.
- It opens in any phone browser, with no app store, and installs to the home screen.
- Students pass it on: the survival plan and service cards share to WhatsApp.
- On campus: Student Affairs, SRCs, mentors, residence staff and QR codes on posters.

## Revenue

Students never pay. A university pays an annual licence by size, and a once-off setup fee.

| University size | Licence fee a year |
|---|---|
| Under 15,000 students | R60,000 |
| 15,000 to 30,000 students | R120,000 |
| Over 30,000 students | R180,000 |

- **The licence covers** the university's own campus services in the app, the staff portal,
  upkeep of the shared story, support, updates and its anonymous completion numbers. It
  works out to about R4 to R8 per student a year for most universities.
- **Setup fee:** R25,000 per university, for building its content and verifying every
  service before students see it.
- **Year 1 target:** three universities, one of each size: R360,000 in licences plus
  R75,000 in setup fees, R435,000 in total.

### Is the price defensible?

| Comparison | Published price | Against ours |
|---|---|---|
| Campus app platform (Modo Campus) | $25,000 to $250,000 a year, about R460,000 to R4.6 million | Our top tier is about 40% of its lowest price |
| Staff wellness programmes in South Africa | R30 to R50 per employee a month | We charge R4 to R8 per student a year |
| One first-year's tuition | About R59,000 to R65,000 at the University of Pretoria | A medium licence equals about two students' tuition |

A medium licence pays for itself if the app helps keep two students enrolled. These
comparisons do more than we do (a full campus app, live counsellors), so they support
"affordable", not "we could charge the same". We found no published South African price for
a comparable student app.

## Costs

| Item | Cost | Basis |
|---|---|---|
| Story upkeep and university support | R5,000 a month | About 12 hours a month at R400 an hour, a mid-level South African freelance rate |
| Hosting and backups | R150 a month | A 1 GB server hosted in South Africa. It runs the staff portal and stores the anonymous counts; the student app is served free from a content delivery network |
| Email service for staff invitations | R170 a month | Brevo's Starter plan at $9 a month; its free plan may be enough at first |
| Domain name | R100 a year | A .co.za domain is about R89 to R99 a year |
| First-language sense check of six translations (once-off) | R18,000 | About 10 hours per language at R300 an hour, for 18,652 words per language |
| Professional review of Campus Realities (once-off) | R6,500 | About 5 hours at R1,300 an hour, in line with psychologists' session rates |
| Onboarding and verifying each university (once-off, covered by its setup fee) | R10,000 per university | About 25 hours at R400 an hour |

Running costs are R5,320 a month, about R64,000 a year. With the once-off reviews and three
universities onboarded, the first-year total is about R118,000. Student outreach on campus
is the university's responsibility.

Story upkeep is our work, not the university's: updating cards when national rules change,
improving them from student feedback, translating changes, and supporting portal users. The
university keeps only its own campus details current.

## Profit

| Three universities in year 1 | Revenue | Costs | Result |
|---|---|---|---|
| All small | R255,000 | R118,000 | Surplus of about R137,000 |
| One of each size | R435,000 | R118,000 | Surplus of about R317,000 |
| All large | R615,000 | R118,000 | Surplus of about R497,000 |

Break-even in year 1 is one medium or large university, or two small ones. In year 2 the
once-off costs fall away, leaving about R64,000 a year.

These figures include no salaries beyond the part-time upkeep line.

## How we measure success

| Question | Metric | Source |
|---|---|---|
| Are universities adopting it? | 1 licensed within 6 months, 3 within 12 | Signed licences |
| Are students engaging? | 5,000 students complete at least one chapter in the first 6 months | Anonymous completion count |
| | An average of 2 or more chapters completed per student | Anonymous completion count |
| Is it helping? | 70% answer yes to "Did you learn about support you didn't know existed?" | In-app feedback form |
| | 80% answer yes or partly to "Did this feel like real university life?" | In-app feedback form |
| | 70% answer yes to "Would you recommend this to a friend?" | In-app feedback form |

These show that students learned a service exists, not that they used it. A pilot would
compare a university's own service-usage numbers before and after.

## Risks to this case

- **No signed university yet.** Prices and targets are untested with a real buyer.
- **Costs start before revenue.** A university may take months to sign and pay; running
  costs are about R5,300 a month in the meantime.
- **Scale needs a stronger server.** The current server is a simple single process. Students
  are unaffected by it, but a large rollout needs the upgrade described in
  [architecture.md](architecture.md#6-deployment).
- Product, security and privacy risks are tracked in [risks.md](risks.md).

## Sources

Problem evidence:

- GroundUp, on NSFAS-funded first-years in 2023 and 2024 (as cited in the project proposal)
- Unisa repository, study of NSFAS-funded students in Northern Gauteng (as cited in the project proposal)
- Universities South Africa and UFS, *Understanding Students*, Issues 1 and 2 (2018)
- Student interviews, October 2026

Prices, checked October 2026 and converted at about R18.50 to the US dollar:

- [Modo Campus pricing (AWS Marketplace)](https://aws.amazon.com/marketplace/pp/prodview-ii52btcnvm5kc)
- [EAP pricing in South Africa (Promote Balance)](https://promotebalance.co.za/eap-pricing-quotes-south-africa/)
- [Undergraduate tuition fees per faculty (University of Pretoria)](https://www.up.ac.za/student-fees/article/2735910/undergraduate-tuitionfees-per-faculty)
- [Freelance pricing in South Africa 2026 (Freelancian)](https://freelancian.co.za/freelance-pricing-in-south-africa/)
- [Linux VPS servers (HostAfrica)](https://www.hostafrica.com/servers/linux-vps-servers/)
- [Brevo pricing 2026 (EmailToolTester)](https://www.emailtooltester.com/en/reviews/brevo/pricing/)
- [Cheapest .co.za domain prices (MyBroadband)](https://mybroadband.co.za/news/cloud-hosting/589029-cheapest-co-za-domain-prices.html)
- [How much does therapy cost in South Africa in 2026 (TherapyRoute)](https://www.therapyroute.com/article/how-much-does-therapy-cost-in-south-africa-2025-by-therapyroute)

Most prices come from comparison sites and providers' marketing pages, not signed quotes.
