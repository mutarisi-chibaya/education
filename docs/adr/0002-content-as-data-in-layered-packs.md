# 0002. All story content is data, in layered packs

- **Status:** Accepted
- **Date:** 2026-10-05 (recorded retrospectively)
- **Deciders:** project team

## Context

The story has hundreds of cards across seven chapters, in two full languages. It will be
rewritten often after play-testing, by people who are not engineers. The product is meant to
be licensed to many institutions, each with its own services, buildings, costs and wording,
and some with several campuses.

## Decision

Every card, mini, service, cost and rule parameter lives in JSON, not in code. A playable
pack is assembled at runtime by `mergeContent` from four layers, each overriding only what
differs:

1. `content/core.json`: shared options, services and cards
2. `content/chapters/*.json`: one file per chapter
3. `content/institutions/{id}.json`: one institution
4. a campus inside the institution file

The engine interprets a small declarative vocabulary (conditions, effects, variants, slots,
budgets) and contains no card-specific logic.

An institution may switch cards off, reword them and add its own. It may not change effects,
flags or conditions on existing cards.

## Options considered

| Option | For | Against |
|---|---|---|
| Layered JSON packs | Content changes need no code change; one engine for every institution; packs can be validated mechanically; a phone downloads only its institution | The schema is a small language that must be documented and validated; errors show up at play time unless checked |
| Cards as code | Full flexibility per card | Every content change is an engineering change; no safe way to let institutions edit |
| A separate build per institution | Simple runtime | Does not scale past a handful; fixes must be applied to every copy |

## Consequences

- Adding an institution is data entry plus a check, by spreadsheet or portal.
- Content correctness depends on validation. `npm test` enforces the writing rules and
  referential integrity; `tools/pack-check.mjs` plays every journey for every pack.
- Rules that must hold everywhere (what a choice does) are protected by the pack check, not
  by the file format. The check is therefore a security control.
- The condition vocabulary is implicit in `condOk`. An unknown key is treated as a setup
  field, so a misspelt condition silently hides a card. New keys need a test.
- A different journey for another kind of institution is a new set of chapter files.

## Revisit when

Institutions need to change rules, not only wording, or the condition vocabulary grows
enough to need a formal schema.
