# Testing the staff portal by hand

Two tests for the staff portal and the platform admin screens, done in a browser.

| Part | What it is for | Time |
|---|---|---|
| [1. Quick check](#part-1-quick-check) | Confirm the portal works end to end after a change | About 10 minutes |
| [2. Full test](#part-2-full-test) | Go through every feature, including the security rules | About 2 hours |

The automated tests (`npm run test:portal`) cover the rules on the server. These tests cover
what they cannot: the screens.

How to use the portal is explained inside it, on the **Guide** tab, and in
[PORTAL.md](../PORTAL.md).

## Before you start

You need Python and Node.js installed, and the project folder open in PowerShell.

**Testing publishes real changes to your project files.** When a reviewer approves a change,
the portal rewrites files in `content/institutions/`. When you finish, undo them with the
commands under [Cleaning up](#cleaning-up), and do not commit them.

### Start from a clean portal

Stop the server if it is running (Ctrl+C), then:

```powershell
Remove-Item data\portal.db* -ErrorAction SilentlyContinue   # removes all portal accounts and drafts
.venv\Scripts\Activate.ps1
python -m server.admin demo
```

The last command prints seven accounts, each with a temporary password. **Copy them now:**
they are shown once.

| Role | Email |
|---|---|
| Platform admin | `admin@unisim.example` |
| Sizwe editor | `editor@sizwe.example` |
| Sizwe reviewer | `reviewer@sizwe.example` |
| Karoo Coast editor | `editor@karoocoast.example` |
| Karoo Coast reviewer | `reviewer@karoocoast.example` |
| Sizwe viewer (read-only) | `viewer@sizwe.example` |
| Karoo Coast viewer (read-only) | `viewer@karoocoast.example` |

Each account must choose a new password of at least 12 characters at first sign-in. For
testing, one passphrase for all of them is fine, for example `portal-test-2026`.

Use a normal browser window for one account and a private window for another, so two people
can be signed in at once.

---

## Part 1: Quick check

Two-step login is switched off for this part, so you do not need a phone.

### Start the server

```powershell
$env:PORTAL_MFA="off"
python serve.py
```

You should see `Staff portal: http://localhost:8080/portal/ (two-step login OFF: demo only)`.

### 1. An editor makes a change

| # | Do this | You should see |
|---|---|---|
| 1.1 | Open `http://localhost:8080/portal/` | The "Sign in" screen |
| 1.2 | Sign in as `editor@karoocoast.example` with its temporary password | "Choose your password" |
| 1.3 | Enter the temporary password and a new password, and press **Save password** | The editor opens on the **Guide** tab, with "Karoo Coast University (fictional)" and the label **Up to date** |
| 1.4 | Open **Services** and click **Karoo Coast Student Counselling** | Its building, room, hours and email |
| 1.5 | In **Opening hours** (English), change `16:00` to `17:00` | "Unsaved changes" appears at the top |
| 1.6 | Press **Save draft** | The message "Draft saved. Students still see the published version." The label becomes **Draft with changes** |
| 1.7 | Open **Story cards** | Under "Your own cards", the card "The last shuttle to town" can be opened and read. There is no "Add a card" button |

### 2. The editor sends it for review

| # | Do this | You should see |
|---|---|---|
| 2.1 | Open **Review and publish** | "What has changed" lists `Services: counselling` |
| 2.2 | Click **Before and after, line by line** | One row showing `16:00` now and `17:00` after |
| 2.3 | Press **Run the check** and wait a few seconds | "The check passed. The story plays from start to finish on every campus." |
| 2.4 | Press **Submit for review** | "Submitted for review." The label becomes **Waiting for review**, and the page says "You submitted this, so a second person has to review it." |
| 2.5 | Open **Services** and try to change something | Every box is greyed out |
| 2.6 | Press **Sign out** | The sign-in screen |

### 3. A reviewer approves it

| # | Do this | You should see |
|---|---|---|
| 3.1 | Sign in as `reviewer@karoocoast.example` and choose a password | The editor, with the label **Waiting for review** |
| 3.2 | Open **Review and publish** | "Submitted by Karoo Coast Editor", the before-and-after table, and the buttons **Approve and publish** and **Send back** |
| 3.3 | Press **Approve and publish** | "Published as version … Students get it the next time they open the app online." The label returns to **Up to date** |
| 3.4 | Open **History** | A new row under "Published versions" with who submitted and who approved, and the steps listed under "Who did what" |

### 4. Students see it

| # | Do this | You should see |
|---|---|---|
| 4.1 | In a private window, open `http://localhost:8080/?uni=karoo-coast&service=counselling` | The student app, showing the Karoo Coast Student Counselling card |
| 4.2 | Press **More details** | Hours ending `17:00` |

### 5. The platform admin

| # | Do this | You should see |
|---|---|---|
| 5.1 | Sign out, then sign in as `admin@unisim.example` and choose a password | A box at the top left for choosing the institution, and an extra tab, **Platform admin** |
| 5.2 | Open **Platform admin** | The licence form, "Add an institution", and an **Accounts** table listing the seven accounts |
| 5.3 | Choose **Karoo Coast University** at the top left and open **Story cards** | Under "Your own cards", the card is now editable and there is an "Add a card" form |

If all five sections behave as described, the portal is working. [Clean up](#cleaning-up)
when you are done.

---

## Part 2: Full test

This part uses two-step login, so you need an authenticator app on a phone (Google
Authenticator or Microsoft Authenticator).

Start from a clean portal again (see [Before you start](#start-from-a-clean-portal)), then
start the server with two-step login on:

```powershell
Remove-Item Env:PORTAL_MFA -ErrorAction SilentlyContinue
python serve.py
```

You should see `two-step login on`. No mail server is set up, so every email the portal
"sends" is written to `data\outbox\` and its link is also shown on screen.

Tick each row as you go. A row fails if what you see differs from the right-hand column.

### A. Signing in

Use `editor@sizwe.example` unless a row says otherwise.

| # | Do this | You should see |
|---|---|---|
| A1 | Sign in with the right email and a wrong password | "The email address or password is not right." |
| A2 | Sign in as `nobody@sizwe.example` with any password | Exactly the same message as A1 |
| A3 | Sign in with the temporary password | "Choose your password" |
| A4 | Try a new password of fewer than 12 characters | It is refused |
| A5 | Enter a new password of 12 or more characters | "Set up two-step login" |
| A6 | Press **Start**, add the setup key to your authenticator app, type the 6-digit code and press **Finish** | "Save your backup codes" with eight codes |
| A7 | Write the codes down and press **I have saved them** | The editor opens on the **Guide** tab |
| A8 | Sign out and sign in with the password only | It asks for the 6-digit code |
| A9 | Type a wrong code | "That code is not right. Codes change every 30 seconds." |
| A10 | Type the current code from the app | You are signed in |
| A11 | Sign out. Sign in, and where the code goes type one of your backup codes | You are signed in, with "You signed in with a backup code. 7 left." |
| A12 | Sign out. Sign in using the same backup code again | "That code is not right…" |

### B. Forgotten password and lockout

Use `reviewer@sizwe.example`, after signing it in once and choosing its password.

| # | Do this | You should see |
|---|---|---|
| B1 | On the sign-in screen press **Forgot your password?**, enter the email and press **Send the link** | "If that address has an account, a link is on its way." and a box showing the link |
| B2 | Look in `data\outbox\` | A text file addressed to the reviewer, containing the same link |
| B3 | Repeat B1 with `nobody@sizwe.example` | The same message, no link, and no new file in the outbox |
| B4 | Open the link from B1 and choose a new password | You can sign in with the new password |
| B5 | Open the same link again | "This link has expired or has already been used. Ask for a new one." |
| B6 | Sign out. Enter a wrong password eight times. If you see "Too many requests", wait a minute and carry on | After the eighth, the next attempt says "This account is locked after too many wrong attempts…" |
| B7 | Now enter the right password | Still locked |
| B8 | Look in `data\outbox\` | A new email with the subject "Your University Simulator account is locked" |
| B9 | Open the link in that email and choose a new password | You can sign in again |

### C. The Guide

| # | Do this | You should see |
|---|---|---|
| C1 | Sign in as an editor and open **Guide** | Four sections: how the portal works, what each tab is for, "How to…" and "If something goes wrong". It says you are an editor |
| C2 | Click a "How to…" line | It opens to show numbered steps |
| C3 | Click a tab name inside the guide, such as **Services** | That tab opens |
| C4 | Sign in as a reviewer and open **Guide** | Two more "How to…" lines: approving a change, and going back to an earlier version |
| C5 | Sign in as the admin and open **Guide** | Lines for adding an institution, creating an account, setting a licence and writing an institution's own card |

### D. Editing each tab

Sign in as `editor@karoocoast.example`. After each row that changes something, press
**Save draft**. Rows marked "check" mean: open **Review and publish** and press **Run the
check**.

| # | Do this | You should see |
|---|---|---|
| D1 | **Details and look:** change the short name | Saved. "What has changed" on Review and publish lists `Name` |
| D2 | **Details and look:** change "Monthly rent for a private room" | Saved. `Costs` is listed |
| D3 | **Details and look:** set "Text on the main colour" to nearly the same colour as "Main colour". Check | A problem: "text on the brand colour is too hard to read". Put the colour back |
| D4 | **Buildings and map:** type the id `hall` and press **Add building**. Name it and choose a free place | It appears on the map preview at the right |
| D5 | **Services:** open a service and choose the new building in its **Building** box | Saved |
| D6 | **Buildings and map:** remove the building from D4, leaving the service pointing at it. Check | A problem saying the building is not on this campus's map. Choose another building for the service |
| D7 | **Services:** type a phone number and a label for a service. Check | A problem: "a fictional pack must not carry phone numbers". Clear the number |
| D8 | **Services:** change an email address to end in `.co.za`. Check | A problem: a fictional pack may only use ".example" email addresses. Put it back |
| D9 | **Lists:** type the id `clinics` and press **Add a list**. Give it a title and press **Add an entry** twice | The list shows "2 entries" |
| D10 | **Services:** open a service and choose the new list under "List this service points students to" | Saved. `Lists` is listed under "What has changed" |
| D11 | **Story cards:** open a chapter and untick one card | It shows **off**. "Cards switched on or off" is listed |
| D12 | **Story cards:** open a card and type a new title | It shows **reworded** |
| D13 | **Story cards:** type a situation of more than 40 words for a card. Check | A problem saying the situation is over the 40-word limit. Shorten it |
| D14 | **Story cards:** look at "Your own cards" | "The last shuttle to town" can be read but not edited, and there is no "Add a card" form |
| D15 | Change something and try to close the browser tab without saving | The browser warns about unsaved changes |

Sizwe has three campuses, so use `editor@sizwe.example` for these:

| # | Do this | You should see |
|---|---|---|
| D16 | **Services:** look at the top of the tab | An **Editing** box with "Whole university" and each campus |
| D17 | Choose **Education Campus only**, open a service and change its room | Saved. Only that campus is changed |
| D18 | **Campuses:** type the id `north` and press **Add campus**, give it a name but tick no courses. Check | A problem saying the campus lists no courses. Remove the campus again |

### E. From draft to students

Continue with the Karoo Coast draft from section D.

| # | Do this | You should see |
|---|---|---|
| E1 | Leave one check problem unfixed and press **Submit for review** | "The pack check found problems. Fix them and submit again.", with the list. Nothing is submitted |
| E2 | Fix it, save, and press **Submit for review** | "Submitted for review." and **Waiting for review** |
| E3 | Try to edit any tab | Everything is greyed out |
| E4 | Still as the editor, open **Review and publish** | No approve button: "You submitted this, so a second person has to review it." |
| E5 | In a private window, sign in as `reviewer@karoocoast.example`. On **Review and publish**, press **Send back** with the note box empty | "Say what needs to change, so the editor knows." |
| E6 | Type a note and press **Send back** | "Sent back to the editor." |
| E7 | Back as the editor, reload the page | A red box: "Sent back by the reviewer:" and the note. Editing works again |
| E8 | Submit it again. As the reviewer, press **Approve and publish** | "Published as version …" |
| E9 | In a new private window, open `http://localhost:8080/?uni=karoo-coast&service=counselling` and look at a service you changed | The student app shows the change |
| E10 | As the reviewer, open **History** and press **Publish this version again** beside an earlier version. Confirm | "Published as version …", as a new row. The earlier rows are still there |
| E11 | Look at "Who did what" | Every step from this section, with who and when |
| E12 | Sign in as the editor in two windows. Change and save something in the first, then change and save something in the second | The second save is refused: "Someone else saved changes while you were editing. Reload to see them, then make your change again." |

### F. One institution cannot see another

| # | Do this | You should see |
|---|---|---|
| F1 | Sign in as `editor@karoocoast.example` | Only Karoo Coast. No box for choosing an institution, and no Platform admin tab |
| F2 | While signed in, open `http://localhost:8080/portal/api/pack/sizwe` in the same browser | `{"error": "No such institution."}` |
| F3 | Open `http://localhost:8080/portal/api/users` | `{"error": "Your role does not allow this."}` |

### G. Numbers

| # | Do this | You should see |
|---|---|---|
| G1 | As a Karoo Coast account, open **Numbers** and note the student count | A count, and completions by chapter |
| G2 | In a private window, open `http://localhost:8080/`, create a character at Karoo Coast University and play one chapter to its forecast | The chapter ends on the Semester Forecast |
| G3 | Reload the portal and open **Numbers** | The student count and that chapter's count have each gone up by one |

### H. Platform admin

Sign in as `admin@unisim.example`.

| # | Do this | You should see |
|---|---|---|
| H1 | Use the box at the top left to switch between the two universities | Each one's own details load |
| H2 | **Platform admin → Accounts:** create an editor for Sizwe with a new email address | A box with the invitation link. The account appears in the table with two-step "not set up" |
| H3 | Open the invitation link in a private window and choose a password | That person can sign in and is asked to set up two-step login |
| H4 | Try to create another account with the same email | "That email address already has an account." |
| H5 | Press **New temporary password** beside an account | A box showing a temporary password. That person must choose a new password and set up two-step login again |
| H6 | Press **Switch off** beside an account, then try to sign in as it | The sign-in is refused. Press **Switch on** and it works again |
| H7 | **Story cards → Your own cards:** choose a chapter, type the id `KC-02`, press **Add a card**, and fill in a title, a situation and two answers with what happens. Leave one answer costing no money. Save | Saved. "What has changed" shows the new card |
| H8 | Submit it. Sign in as `reviewer@karoocoast.example` and approve it | Published. The card is listed under "Your own cards" for Karoo Coast staff, read-only |
| H9 | **Platform admin → This institution's licence:** set an expiry date and press **Save licence** | "Saved to the draft. It goes live through review." |
| H10 | **Platform admin → Add an institution:** id `test-college`, a name, type and status, then **Create** | "Created. Fill it in, then submit it for review." The new institution is selected |
| H11 | In a private window, open `http://localhost:8080/` and start creating a character | The new institution is not in the list, because nothing has been approved for it |

Two commands in PowerShell, with the server still running in another window:

| # | Do this | You should see |
|---|---|---|
| H12 | `python -m server.admin audit` | Every action from this test, oldest first |
| H13 | `python -m server.admin backup` | Two files copied to a new folder under `data\backups\` |

### I. Private files stay private

Open each address in the browser.

| # | Address | You should see |
|---|---|---|
| I1 | `http://localhost:8080/data/portal.db` | `{"error": "not found"}` |
| I2 | `http://localhost:8080/Data/portal.db` | The same |
| I3 | `http://localhost:8080/%64ata/portal.db` | The same |
| I4 | `http://localhost:8080/serve.py` | The same |
| I5 | `http://localhost:8080/README.md` | The same |

---

## Cleaning up

Stop the server (Ctrl+C), then put the published content back and remove the test data:

```powershell
git checkout -- content/institutions
git clean -f content/institutions                 # removes any institution you created while testing
Remove-Item data\portal.db*, data\outbox\* -ErrorAction SilentlyContinue
```

Run `git status` afterwards. Nothing under `content/institutions/` should be listed.

## Recording a problem

Note the row number, what you did, what you expected and what you saw, with a screenshot.
Add it to [risks.md](risks.md) if it is a limitation you accept, or fix it and add a test.
