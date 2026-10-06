# Engineering documentation

These documents describe how University Simulator is built, how we work on it and how it is
run. They are for engineers joining the project. Product intent lives in the documents at
the repository root and is not repeated here.

## Start here

| If you want to | Read |
|---|---|
| Understand what the product is and who it is for | [MVP.md](../MVP.md), then [README.md](../README.md) |
| See the full functional requirements | [First_Year_Sim_Build_Spec.md](../First_Year_Sim_Build_Spec.md) |
| Understand how the system fits together | [architecture.md](architecture.md) |
| Make a change and get it merged | [CONTRIBUTING.md](../CONTRIBUTING.md), then [sdlc.md](sdlc.md) |

## All documents

| Document | What it answers |
|---|---|
| [architecture.md](architecture.md) | What the parts are, how they talk, and what happens at runtime |
| [data-model.md](data-model.md) | What is stored, where, and in what shape |
| [api.md](api.md) | Every HTTP endpoint the server exposes |
| [sdlc.md](sdlc.md) | How work moves from an idea to students' phones |
| [testing.md](testing.md) | What is tested, how, and what is not |
| [security-privacy.md](security-privacy.md) | What we protect, from whom, and what data we hold |
| [runbook.md](runbook.md) | How to deploy, operate, back up and recover |
| [risks.md](risks.md) | Known limitations, accepted risks and open items |
| [adr/](adr/README.md) | Why the main design decisions were made |

## Existing documents these build on

| Document | Scope |
|---|---|
| [PORTAL.md](../PORTAL.md) | Staff portal: roles, workflow, first sign-in, security measures |
| [ADDING_A_UNIVERSITY.md](../ADDING_A_UNIVERSITY.md) | Step-by-step guide to onboarding an institution |
| [intake/README.md](../intake/README.md) | The guide sent to a university with the intake spreadsheets |
| [proposal-app/README.md](../proposal-app/README.md) | The separate backup app built to the original proposal |

## Keeping these current

A change that alters behaviour described here updates the document in the same pull
request. A decision that changes the architecture gets a new record in [adr/](adr/README.md);
existing records are superseded, not edited.
