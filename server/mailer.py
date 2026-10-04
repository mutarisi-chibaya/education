"""Sending email from the staff portal: invitations and password resets.

The portal only ever calls `mailer.send(to, subject, body)`. Which mailer it
gets is decided here, from the environment:

  - SMTP_HOST set  -> real email through that mail server (any provider's SMTP)
  - otherwise      -> the outbox: each message is written to data/outbox/ as a
                      text file, and the portal shows the link on screen. This
                      is what a demo or a developer's machine uses.

To use another delivery service, write a class with the same `send` method
and return it from `from_env`.
"""

import os
import smtplib
import time
from email.message import EmailMessage
from pathlib import Path


class Outbox:
    """Keeps messages as files instead of sending them. Links may be shown on screen."""
    reveals_links = True

    def __init__(self, folder):
        self.folder = Path(folder)
        self.sent = []

    def send(self, to, subject, body):
        self.folder.mkdir(parents=True, exist_ok=True)
        name = f"{time.strftime('%Y%m%d-%H%M%S')}-{len(self.sent):03d}-{to.replace('@', '_at_')}.txt"
        (self.folder / name).write_text(f"To: {to}\nSubject: {subject}\n\n{body}\n", encoding="utf-8")
        self.sent.append({"to": to, "subject": subject, "body": body})


class Smtp:
    """Real email through an SMTP server. Links are never shown on screen."""
    reveals_links = False

    def __init__(self, host, port, sender, user=None, password=None, starttls=True):
        self.host, self.port, self.sender, self.user, self.password, self.starttls = host, port, sender, user, password, starttls

    def send(self, to, subject, body):
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, to, subject
        message.set_content(body)
        with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
            if self.starttls:
                smtp.starttls()
            if self.user:
                smtp.login(self.user, self.password or "")
            smtp.send_message(message)


def from_env(root):
    host = os.environ.get("SMTP_HOST")
    if host:
        return Smtp(host, int(os.environ.get("SMTP_PORT", "587")), os.environ.get("SMTP_FROM", "portal@localhost"),
                    os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD"), os.environ.get("SMTP_STARTTLS", "on") != "off")
    return Outbox(Path(root) / "data" / "outbox")
