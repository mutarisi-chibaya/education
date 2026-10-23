# How to add a university

There are two ways to add a university.

- **In the staff portal**, on screen: a platform admin creates the institution, staff fill it
  in, and a second person approves it. See [PORTAL.md](PORTAL.md). This is the way to use
  once a real university is involved.
- **With spreadsheets and one command**, described on this page. It needs no server and no
  accounts, so it is the quickest way to add a demo university yourself.

Neither is done inside the student app itself.

## The short version

1. Copy the folder `intake/template` and rename the copy, for example `intake/my-university`.
2. Fill in the spreadsheets in that folder.
3. Run `node tools/build-pack.mjs intake/my-university`.
4. If it says "published", start the app and pick the university in setup.

The rest of this page explains each step.

## What is actually happening

Each university in the app is one file in `content/institutions/`. Sizwe is
`sizwe.json`; Karoo Coast is `karoo-coast.json`. That file holds everything that is
particular to the university: its name, colours, campuses, map, services, costs and any
changes to the story cards.

`content/institutions/index.json` is the directory: one short entry per institution (name,
type, province, version). The app downloads that small directory first, and downloads an
institution's own file only when a student chooses it. So a phone never carries the other
institutions, however many there are.

You could write that file by hand, but it is long and easy to get wrong. So instead:

```
spreadsheets you fill in          the command            the file the app reads
intake/my-university/*.csv  --->  build-pack.mjs  --->  content/institutions/my-university.json
```

The command also checks the result. If anything is wrong, it tells you what and
publishes nothing.

`intake/karoo-coast/` is a finished example. Karoo Coast University in the app was made
from those sheets, exactly this way. Open its files next to the template while you work.

## Step 1: copy the template

Copy `intake/template` and give the copy your university's name in lower-case letters and
hyphens, for example `intake/my-university`.

Open the `.csv` files in Excel or Google Sheets. When you save, keep them as CSV. If Excel
offers "CSV UTF-8", choose that one.

## Step 2: fill in the sheets

You must fill in three sheets. The others are optional.

### university.csv (required)

Two columns: `key` and `value`. Fill in the `value` column.

| key | What to put | Example |
|---|---|---|
| `id` | Short name, lower-case letters and hyphens. Once chosen, it never changes | `my-university` |
| `name_en` | Full name | `My University` |
| `short` | The name students use | `MyU` |
| `tagline_en` | One line shown under the name in setup | `Two campuses in the city` |
| `city_en`, `area` | Used inside some card text | `the city`, `MyU` |
| `status` | `demo` for a made-up university, `licensed` for a real one | `demo` |
| `type` | `university`, `tvet` or `private`. Groups the list students choose from | `university` |
| `province` | Shown in the list, and searchable | `Limpopo` |
| `licence_tier`, `licence_expires` | Required when status is `licensed`. After the expiry date the institution drops out of the list | `standard`, `2027-12-31` |
| `courses` | What it offers, separated by `;`. Empty means all | `bsc;bcom;ba` |
| `housing` | Housing options, separated by `;`. Empty means all | `residence;private_rental;commuting` |
| `taxi_week` | A week of taxi fares to campus and back, in rand. Commuting students pay it in the game | `250` |
| `supp_code` | The result code a student sees when admitted to a supplementary exam. Empty means `999`. List all your codes on a `result_codes` page (see pages.csv) and point the `supp_exams` service at it | `999` |
| `brand_name`, `logo_text` | Name and up to three letters for the top bar | `MyU`, `MU` |
| `colour_brand`, `colour_brand_text` | Main colour, and the text colour on top of it | `#0b5d5e`, `#ffffff` |
| `colour_accent`, `colour_accent_text` | Highlight colour, and a darker shade of it for text | `#f4b942`, `#6b4a00` |
| `dark_colour_...` | The same four for dark mode. Leave empty to keep the default dark colours | |
| `signed_off_by`, `signed_off_date` | Who approved it and when. Required when status is `licensed` | `2026-10-03` |

Courses you can list: `bsc`, `bcom`, `ba`, `beng`, `bed`, `bhsc`, plus any of your own
from `courses.csv` (see the optional sheets).
Housing you can list: `residence`, `private_rental`, `commuting`.

### buildings.csv (required)

One row per building that a service is in. These become the campus map.

| Column | What to put |
|---|---|
| `campus_id` | Leave empty if the university has one campus |
| `building_id` | A short name you make up, such as `library`. You use it again in the services sheet |
| `name_en` | The name shown on the map |
| `position` | Where it sits on the map: `nw`, `n`, `ne` (top row), `w`, `cw`, `ce`, `e` (bottom row) or `gate` |
| `directions_en` | Leave empty to get standard walking directions, or write your own |

Each position can hold one building, so a campus map has at most eight.

### services.csv (required)

One row per support service. Look in `intake/service-list.csv` for the list of services
you can fill in; the first column is the `service_id` to copy.

| Column | What to put |
|---|---|
| `campus_id` | Leave empty if it applies to the whole university |
| `service_id` | From `service-list.csv`, for example `food_programme` |
| `name_en` | What it is called at this university |
| `building_id` | A building from `buildings.csv` |
| `room_en`, `hours_en` | Room and opening hours |
| `email` | For a `demo` university this must end in `.example`, for example `pantry@myu.example` |
| `phone`, `phone_label` | Only for a real, `licensed` university |
| `verified_by`, `last_checked` | Required with every phone number: who checked it, and the date |
| `website` | A web address starting with `https://` |
| `page_id` | A list from `pages.csv` that this service points to |
| `how_to_reach_en` | Your own "how to reach it" wording. Empty keeps the standard wording |
| `located_elsewhere_en` | Fill this in instead of a building if the service is on another campus |

You do not have to fill in every service. Any service you leave out keeps its general
description, with no room or email.

### Optional sheets

- **campuses.csv:** only if there is more than one campus. One row per campus, with the
  courses taught there. Then put that campus's `campus_id` on its buildings and services.
- **courses.csv:** the institution's own courses or programmes, for example a college's
  "N4 Engineering Studies". One row each, with a short `course_id`, a label and the two key
  modules students are tested on. A third module (`module3`) is optional: it is the one the
  supplementary exam card is about. List the `course_id` in the `courses` row of
  `university.csv` (or of a campus) to offer it.
- **pages.csv and page-items.csv:** lists such as accredited accommodation. One row in
  `pages.csv` for the list, one row in `page-items.csv` for each entry.
- **cards.csv:** switch a story card off, or reword it. You need the card's ID, such as
  `FT-02`. The IDs are in the files under `content/chapters/`.
  - Switch off: `action` = `off`.
  - Reword: `action` = `edit`, and `field` = `title`, `text`, or
    `choice:<choice id>:label` (also `:outcome` or `:tip`).
- **extra-cards.json:** the university's own story cards. This one is not a spreadsheet;
  copy the shape from `intake/karoo-coast/extra-cards.json`.

## Step 3: run the command

In a terminal in the project folder:

```
node tools/build-pack.mjs intake/my-university
```

**If it worked**, the last line looks like this:

```
my-university: version 1 published to content/institutions/my-university.json (0 warning(s)).
```

The command has then done two things for you:

- written `content/institutions/my-university.json`;
- added the university to the directory, `content/institutions/index.json`, so the app
  lists it.

**If something is wrong**, it lists each problem and publishes nothing:

```
  ERROR    university: food_programme: building "pantry" is not on this campus's map
  ERROR    university: health: a fictional pack must not carry phone numbers

my-university: 2 error(s). The pack was not published.
```

Fix the sheet, save, and run the command again.

Lines that start with `warning` do not stop publishing. They are things worth a look.

## Step 4: see it in the app

Start the app the usual way (`python serve.py` or `npm start`) and open
`http://localhost:8080`. Create a character: the university is now in the "Choose an
institution" list.

If you had the app open already and do not see it, close the tab and open it again. The
app keeps an offline copy and picks up the new version on the next load.

## Changing a university later

Edit its sheets and run the same command again. The version number goes up by one each
time, and students get the new version the next time they open the app online. A saved
game keeps its finished chapters; a chapter that was half played restarts.

To check a university without rebuilding it:

```
node tools/pack-check.mjs my-university
```

## Removing a university

1. Delete `content/institutions/my-university.json`.
2. Run `node tools/reindex.mjs`, which rebuilds the directory without it.

## Once a year: what needs re-checking

```
node tools/pack-audit.mjs
```

This goes through every institution and lists phone numbers whose check is getting old,
licences close to expiring, and packs that no longer pass the check. A campus phone number
that has not been re-checked for 400 days is hidden from students automatically; the
national helplines always stay.

## Demo or licensed?

| | `demo` (made-up university) | `licensed` (real university) |
|---|---|---|
| Email addresses | Must end in `.example` | Must be real |
| Phone numbers | Not allowed | Allowed, each with `verified_by` and `last_checked` |
| Sign-off | Not needed | `signed_off_by` and `signed_off_date` required |
| Licence | Not needed | `licence_tier` and `licence_expires` required |

## What a university cannot change

- What a choice does to money, marks and wellbeing. Wording can change; the rules cannot.
- The national helplines.
- The Campus Realities section.

## Common errors and what they mean

| Message | What to fix |
|---|---|
| `university.csv has no "id" row` | Fill in the `id` row in `university.csv` |
| `building "x" is not on this campus's map` | The service names a building that is not in `buildings.csv` |
| `"x" is not a known service` | The `service_id` is not one from `service-list.csv` |
| `a fictional pack may only use ".example" email addresses` | Status is `demo`: change the email ending, or set status to `licensed` |
| `a fictional pack must not carry phone numbers` | Remove the phone, or set status to `licensed` |
| `phone ... is not marked verified` | Fill in `verified_by` and `last_checked` for that row |
| `text on the brand colour is too hard to read` | Pick a darker brand colour or a lighter text colour |
| `cannot switch off "x": no such card` | The card ID in `cards.csv` is misspelt |
| `is a game rule and cannot be changed` | The edit tries to change effects, not wording |
| `label is over 6 words` | A reworded answer is too long for its button |
| `the journey breaks for ...` | A switched-off card left the story unable to finish; switch it back on |
