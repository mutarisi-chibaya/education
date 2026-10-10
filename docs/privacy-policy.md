# Privacy notice (draft)

What University Simulator collects, where it is kept and who can see it, for students and
for university staff. The technical detail behind each statement is in
[security-privacy.md](security-privacy.md#data-inventory).

**Status: draft, not yet published.** This describes what the software does today. It has
not been reviewed by a lawyer and is not legal advice. The items under
[To complete before publishing](#to-complete-before-publishing) must be settled before it is
shown to students or given to a university.

Last reviewed: 10 October 2026.

## For students

### What we do not collect

There is no account and no login. We never ask for your name, phone number, email address or
student number.

### What stays on your phone

Your setup answers, your choices and your progress are stored on your device only. They are
not sent to us or to your university.

### Campus Realities

Nothing about what you open in Campus Realities is saved or sent, even on your own device.

### What is sent to our server

| What | When | Why |
|---|---|---|
| A random device code, your university's id and the chapter name | When you finish a chapter, or the next time you are online | To count how many students completed each chapter. The code is made up on your phone and is not linked to you |
| Your answers to three feedback questions | Only if you tap Send | To improve the app |

Your university can see these counts and answers for its own students, in total. It cannot
see who anyone is.

### The forecast and plan

The app's forecast and plan are worked out on your phone. Nothing about them is sent
anywhere, and no AI service is involved.

### Sharing

Saving or sharing your survival plan or a service card is your choice. It goes only where
you send it, and nothing about you is added to it.

### Erasing your data

The Privacy screen has an "Erase everything on this device" button. It removes your saved
game and preferences. Because nothing else about you is stored anywhere, that erases
everything except the anonymous completion counts, which cannot be linked back to you.

## For university staff

Staff who use the portal have an account, so we hold personal information about them.

| What | Why | Who can see it |
|---|---|---|
| Name, work email address and role | To sign you in and show who made a change | Platform administrators |
| A hash of your password and your two-step login secret | To check your sign-in. We cannot read your password | Nobody in readable form |
| A record of your actions: email address, action, time and internet address | To keep a permanent history of who changed what students see | Platform administrators, and your university's reviewers for your own university |
| Invitation and password-reset emails | To let you set your password | The mail service that delivers them |

This information is kept while your account exists. The record of actions is permanent by
design and cannot be edited or deleted.

## Where information is kept

On the server that runs the staff portal. The student app itself is delivered as files and
keeps student data on the student's own device.

## Your rights

South Africa's Protection of Personal Information Act (POPIA) gives you the right to ask
what personal information is held about you, to have it corrected or deleted, to object to
its use, and to complain to the Information Regulator. Students: we hold nothing that
identifies you. Staff: ask your platform administrator.

## Changes

If this notice changes, the date at the top changes with it.

## To complete before publishing

These are open decisions, also listed in [risks.md](risks.md#privacy-and-compliance):

- [ ] The name of the responsible party and a contact address for privacy questions
- [ ] How long completion counts are kept
- [ ] How long staff accounts and the record of actions are kept after a licence ends
- [ ] Where the server is hosted, and whether any information leaves South Africa
- [ ] Review by someone with legal responsibility
- [ ] Matching wording on the app's Privacy screen
