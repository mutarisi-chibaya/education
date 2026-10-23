# Putting your university into University Simulator

You fill in a few spreadsheets. We turn them into your campus in the app. Nothing goes live
until your Student Affairs office has signed it off and our checks have passed.

Start by copying the `template` folder and renaming the copy to your university. The
`karoo-coast` folder is a complete, filled-in example for a made-up university.

Every sheet opens in Excel or Google Sheets. Save each one as CSV when you are done. Write
everything in English (the columns ending in `_en`): we translate it into the app's other
languages, and students see the English until a translation is ready.

## The sheets

| Sheet | What goes in it | Required? |
|---|---|---|
| `university.csv` | Your name, colours, costs and who signed the pack off | Yes |
| `services.csv` | Each support service: where it is, when it is open, how to reach it | Yes |
| `buildings.csv` | The buildings those services are in, for the campus map | Yes |
| `campuses.csv` | Your campuses, if you have more than one | Only for several campuses |
| `pages.csv`, `page-items.csv` | Lists students are told to look at, such as accredited accommodation | Optional |
| `courses.csv` | Courses or programmes of your own, if ours do not fit | Optional |
| `cards.csv` | Story cards you want switched off or reworded | Optional |
| `extra-cards.json` | Story cards of your own (we help you write these) | Optional |

### university.csv

One setting per row.

- `id`: a short name in lower-case letters and hyphens, for example `karoo-coast`. It never changes.
- `name_en`, `short`: your full name and the short name students use.
- `status`: `licensed`.
- `type`, `province`: `university`, `tvet` or `private`, and your province. Students see
  institutions grouped by type and can search by name or province.
- `licence_tier`, `licence_expires`: from your licence agreement.
- `courses`, `housing`: what you offer, separated by semicolons. Courses: `bsc`, `bcom`, `ba`,
  `beng`, `bed`, `bhsc`. Housing: `residence`, `private_rental`, `commuting`. Leave a row empty
  to offer everything.
- `taxi_week`: a week of taxi fares to campus and back, in rand. Students who live at home
  pay it in the game. Rent is not asked for: it is paid straight to the residence or the
  landlord, so it is never part of a student's money in the game.
- `supp_code`: the result code a student sees when admitted to a supplementary exam (the game
  shows `999` if you leave it empty). To explain your other codes, add a `result_codes` page in
  `pages.csv`, with its official `website`, and set it as the `page_id` of the `supp_exams` service.
- `map_website`: your official campus map, starting with `https://`. Every "Show on campus map"
  screen gets a button that opens it. A campus with its own map can set `map_website` in
  `campuses.csv` too.
- `brand_name`, `logo_text`: the name and a monogram of up to three letters for the top bar.
- `colour_brand`, `colour_brand_text`, `colour_accent`, `colour_accent_text`: your colours as
  hex codes, such as `#0b5d5e`. The text colour must be easy to read on the brand colour. The
  `dark_` rows are the same four colours for phones in dark mode; leave them empty to keep our
  default dark colours.
- `signed_off_by`, `signed_off_date`: the person in Student Affairs who approved this pack, and
  the date as `2026-10-03`.

### services.csv

One row per service. Choose `service_id` from `service-list.csv`, which lists every service
the game can point students to and what students are told about it.

- `campus_id`: leave empty if the row applies to the whole university.
- `name_en`: what the service is called on your campus.
- `building_id`, `room_en`, `hours_en`: where it is and when it is open. The building must be
  in `buildings.csv`.
- `email`, `phone`, `phone_label`, `website`: how to reach it.
- `verified_by`, `last_checked`: **required for every phone number.** Someone on your side must
  have called the number and confirmed it works. A pack with an unverified phone number is
  refused.
- `located_elsewhere_en`: fill this in instead of a building when the service is on another
  campus, for example "Main Campus: Admin Building, Room 104. The shuttle leaves every 30
  minutes."
- `page_id`: the list this service points to, if any.

### buildings.csv

One row per building. `position` places it on the simple campus map: `nw`, `n`, `ne` (top
row), `w`, `cw`, `ce`, `e` (bottom row) or `gate`. Leave `directions_en` empty to use the
standard walking directions for that position, or write your own.

### cards.csv

- To switch a card off: `action` is `off`, and `card_id` is the card.
- To reword a card: `action` is `edit`, and `field` is `title`, `text`, or
  `choice:<choice id>:label`, `choice:<choice id>:outcome` or `choice:<choice id>:tip`.

You can change wording. You cannot change what a choice does to a student's money, marks or
wellbeing: those are the game's rules and are the same on every campus.

## What stays the same everywhere

- The game rules and the national helplines.
- The Campus Realities section, which only changes through a reviewed process.

## What we do with your sheets

```
node tools/build-pack.mjs intake/your-university
```

This builds your pack and checks it. It is refused if a phone number is unverified, a service
points to a building that is not on the map, an email address is a placeholder, a colour is
unreadable, a reworded card breaks the writing limits, or the story can no longer be played
from start to finish on any of your campuses. Students get the new version the next time they
open the app online.
