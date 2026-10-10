# Security policy

How to report a security problem in University Simulator, and what is in scope. How the
system is protected is described in [security-privacy.md](security-privacy.md) and
[PORTAL.md](../PORTAL.md#security).

## Reporting a problem

Please report it privately, not in a public issue.

- Use **Report a vulnerability** under the Security tab of the
  [GitHub repository](https://github.com/mutarisi-chibaya/education/security). This needs
  private vulnerability reporting to be switched on in the repository settings.
- A contact email address has not been published yet. This is open item C3 in
  [risks.md](risks.md).

Include what you found, the steps to reproduce it, and what an attacker could do with it.
Please do not access other people's data, change published content or disrupt the service
while testing.

We will confirm that we received your report, tell you whether we accept it, and tell you
when it is fixed.

## What is in scope

| In scope | Examples |
|---|---|
| The staff portal | Signing in as someone else, reaching another university's content, publishing without a second person |
| The public API | Reading private files, inflating statistics, bypassing validation or rate limits |
| The student app | Content that runs as script, leaking what a student viewed in Campus Realities |
| Content safety | A way to show students an unconfirmed phone number |

Out of scope: a student changing their own saved game on their own device, and anything
that needs physical access to an unlocked phone.

## Supported versions

Only the latest version on the `main` branch is supported. No version has been released for
public use yet.

## Known issues

Security weaknesses we already know about are listed openly in
[risks.md](risks.md#security), with their status. Check there before reporting.

## If a wrong helpline number is shown

This is treated as a security incident because it can harm a student. The steps are in
[runbook.md](runbook.md#a-helpline-number-is-wrong).
