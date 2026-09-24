"""Transactional email with provider fallback: Resend → Brevo → SMTP → console (development)."""

from __future__ import annotations

import logging
import smtplib
import ssl
import time
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import httpx

from ..config import settings
from ..errors import HttpError

log = logging.getLogger("annex.email")


@dataclass
class Email:
    to: str
    subject: str
    html: str
    text: str


class EmailError(Exception):
    pass


def _sender() -> tuple[str, str]:
    return settings.EMAIL_FROM_NAME.strip() or "Annex HR", settings.EMAIL_FROM_ADDRESS.strip()


def _send_resend(msg: Email) -> str:
    name, address = _sender()
    r = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={"from": formataddr((name, address)), "to": [msg.to], "subject": msg.subject, "html": msg.html, "text": msg.text},
        timeout=15,
    )
    if r.status_code >= 300:
        raise EmailError(f"Resend {r.status_code}: {r.text[:300]}")
    return r.json().get("id", "")


_brevo_senders: tuple[float, set[str]] | None = None


def _brevo_verified_senders() -> set[str]:
    """Active senders on the Brevo account (cached for 10 minutes).

    Brevo accepts a send request even when the sender isn't verified, then drops the
    email asynchronously — so we check up front and fall back to the next provider instead.
    """
    global _brevo_senders
    now = time.monotonic()
    if _brevo_senders and now - _brevo_senders[0] < 600:
        return _brevo_senders[1]
    r = httpx.get("https://api.brevo.com/v3/senders", headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"}, timeout=15)
    r.raise_for_status()
    active = {s["email"].lower() for s in r.json().get("senders", []) if s.get("active")}
    _brevo_senders = (now, active)
    return active


def _send_brevo(msg: Email) -> str:
    name, address = _sender()
    if address.lower() not in _brevo_verified_senders():
        raise EmailError(f"Brevo sender {address} is not verified on this Brevo account")
    r = httpx.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"},
        json={"sender": {"name": name, "email": address}, "to": [{"email": msg.to}], "subject": msg.subject, "htmlContent": msg.html, "textContent": msg.text},
        timeout=15,
    )
    if r.status_code >= 300:
        raise EmailError(f"Brevo {r.status_code}: {r.text[:300]}")
    return r.json().get("messageId", "")


def _send_smtp(msg: Email) -> str:
    name, address = _sender()
    m = EmailMessage()
    # Gmail only sends "From" addresses the account owns; others are rewritten to the account address.
    m["From"] = formataddr((name, address or settings.SMTP_USER))
    m["To"] = msg.to
    m["Subject"] = msg.subject
    m["Message-ID"] = make_msgid(domain=(address or settings.SMTP_USER).split("@")[-1])
    m.set_content(msg.text)
    m.add_alternative(msg.html, subtype="html")
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(m)
    return m["Message-ID"]


def _providers() -> list[tuple[str, object]]:
    available = {
        "resend": (bool(settings.RESEND_API_KEY), _send_resend),
        "brevo": (bool(settings.BREVO_API_KEY), _send_brevo),
        "smtp": (bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD), _send_smtp),
    }
    choice = settings.EMAIL_PROVIDER.strip().lower()
    order = ["resend", "brevo", "smtp"] if choice in ("", "auto") else [p.strip() for p in choice.split(",")]
    return [(p, available[p][1]) for p in order if p in available and available[p][0]]


def send_email(msg: Email, *, required: bool = True) -> str:
    """Sends through the first provider that succeeds. Returns the provider name used.

    With no provider configured (local development) the email is logged instead.
    When `required` and every configured provider fails, raises a 502 for the client.
    """
    providers = _providers()
    if not providers:
        log.warning("No email provider configured — email to %s not sent.\nSubject: %s\n%s", msg.to, msg.subject, msg.text)
        return "console"
    errors: list[str] = []
    for name, fn in providers:
        try:
            fn(msg)  # type: ignore[operator]
            log.info("Email '%s' sent to %s via %s", msg.subject, msg.to, name)
            return name
        except Exception as exc:  # noqa: BLE001 — try the next provider
            errors.append(f"{name}: {exc}")
            log.warning("Email via %s failed: %s", name, exc)
    log.error("All email providers failed for %s: %s", msg.to, " | ".join(errors))
    if required:
        raise HttpError(502, "We couldn't send the email right now. Please try again in a minute.")
    return "failed"
