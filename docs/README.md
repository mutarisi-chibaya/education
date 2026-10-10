# Documentation

These documents describe why University Simulator exists, how it is built, how we work on it
and how it is run. Most are for engineers joining the project; the business case, privacy
notice and security policy are also for investors and universities. Product intent lives in
the documents at the repository root and is not repeated here.

## Start here

| If you want to | Read |
|---|---|
| Understand what the product is and who it is for | [MVP.md](../MVP.md), then [README.md](../README.md) |
| Understand why it exists, who pays and what it costs | [business-case.md](business-case.md) |
| See the full functional requirements | [First_Year_Sim_Build_Spec.md](../First_Year_Sim_Build_Spec.md) |
| Understand how the system fits together | [architecture.md](architecture.md) |
| Make a change and get it merged | [CONTRIBUTING.md](../CONTRIBUTING.md), then [sdlc.md](sdlc.md) |

## All documents

| Document | What it answers |
|---|---|
| [business-case.md](business-case.md) | The problem, customers, revenue, costs and how success is measured |
| [architecture.md](architecture.md) | What the parts are, how they talk, and what happens at runtime |
| [data-model.md](data-model.md) | What is stored, where, and in what shape |
| [api.md](api.md) | Every HTTP endpoint the server exposes |
| [sdlc.md](sdlc.md) | How work moves from an idea to students' phones |
| [testing.md](testing.md) | What is tested, how, and what is not |
| [portal-testing.md](portal-testing.md) | Testing the staff portal by hand: a 10-minute check and a full test |
| [security-privacy.md](security-privacy.md) | What we protect, from whom, and what data we hold |
| [SECURITY.md](SECURITY.md) | How to report a security problem, and what is in scope |
| [privacy-policy.md](privacy-policy.md) | Draft privacy notice for students and university staff |
| [runbook.md](runbook.md) | How to deploy, operate, back up and recover |
| [risks.md](risks.md) | Known limitations, accepted risks and open items |
| [CHANGELOG.md](CHANGELOG.md) | What changed, newest first |
| [adr/](adr/README.md) | Why the main design decisions were made |

## Existing documents these build on

| Document | Scope |
|---|---|
| [PORTAL.md](../PORTAL.md) | Staff portal: roles, workflow, first sign-in, security measures |
| [ADDING_A_UNIVERSITY.md](../ADDING_A_UNIVERSITY.md) | Step-by-step guide to onboarding an institution |
| [intake/README.md](../intake/README.md) | The guide sent to a university with the intake spreadsheets |

## Where each standard document lives

A map from the documents a software project is usually expected to have to where ours are.

| Phase | Document | Where |
|---|---|---|
| Planning | Business case, success metrics | [business-case.md](business-case.md) |
| Planning | Product requirements and scope | [MVP.md](../MVP.md), [APP_OVERVIEW.md](../APP_OVERVIEW.md) |
| Planning | Functional requirements | [First_Year_Sim_Build_Spec.md](../First_Year_Sim_Build_Spec.md) |
| Planning | Risk register and technical debt | [risks.md](risks.md) |
| Planning | Roadmap | [MVP.md](../MVP.md#what-comes-after-the-mvp) |
| Design | Architecture, deployment layout | [architecture.md](architecture.md) |
| Design | Decision records | [adr/](adr/README.md) |
| Design | Database design | [data-model.md](data-model.md) |
| Design | API specification | [api.md](api.md) |
| Design | Threat model, data inventory | [security-privacy.md](security-privacy.md) |
| Development | README, setup | [README.md](../README.md) |
| Development | Contributing guide, conventions, definition of done | [CONTRIBUTING.md](../CONTRIBUTING.md), [sdlc.md](sdlc.md#definition-of-done) |
| Testing | Test strategy and known gaps | [testing.md](testing.md) |
| Testing | Manual test cases for the staff portal | [portal-testing.md](portal-testing.md) |
| Release | Release checklist, versioning, rollback | [sdlc.md](sdlc.md#release-checklist), [runbook.md](runbook.md) |
| Release | Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Operations | Runbook, incidents, backup and recovery, monitoring | [runbook.md](runbook.md) |
| Operations | Security reporting | [SECURITY.md](SECURITY.md) |
| Users | Staff and admin guide | The **Guide** tab inside the portal, [PORTAL.md](../PORTAL.md), [ADDING_A_UNIVERSITY.md](../ADDING_A_UNIVERSITY.md), [intake/README.md](../intake/README.md) |
| Users | Privacy notice | [privacy-policy.md](privacy-policy.md) (draft) |

Not written yet, because each needs something we do not have:

| Document | What it is waiting for |
|---|---|
| Terms of use and the university licence agreement | A lawyer; these are contracts |
| Accessibility statement | An accessibility audit against WCAG |
| Performance and load test report | A load test of the server |
| User acceptance sign-off | The first pilot with real students and staff |
| Software licence (`LICENSE`) | A decision by the owners on how the code may be used |
| CI/CD pipeline documentation | A pipeline; see [sdlc.md](sdlc.md#5-review) |

## Keeping these current

A change that alters behaviour described here updates the document in the same pull
request. A decision that changes the architecture gets a new record in [adr/](adr/README.md);
existing records are superseded, not edited.
