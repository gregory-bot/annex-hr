"""Branded emails for scheduled reminders (same look as templates.py)."""

from __future__ import annotations

from html import escape

from ..config import settings
from .service import Email
from .templates import INK, MUTED, _button, _layout


def _url(href: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}{href}"


def reminder(to: str, name: str, subject: str, heading: str, intro: str, items: list[str], cta: str, href: str, company: str) -> Email:
    """A reminder with an optional bullet list of the things that need attention."""
    first = escape(name.split(" ")[0]) if name else "there"
    rows = "".join(f'<li style="margin:0 0 6px">{escape(i)}</li>' for i in items)
    listing = f'<ul style="margin:12px 0 0;padding-left:20px;color:{INK};font-size:14px;line-height:1.6">{rows}</ul>' if items else ""
    body = f"""
      <p style="margin:0;color:{MUTED};font-size:15px;line-height:1.6">Hi {first}, {escape(intro)}</p>
      {listing}
      {_button(cta, _url(href))}"""
    footer = f"You're receiving this automated reminder from {escape(company)} on Annex HR. HR admins can change reminders under Settings → Automations."
    text_items = "".join(f"\n- {i}" for i in items)
    return Email(
        to=to,
        subject=subject,
        html=_layout(heading, body, footer),
        text=f"Hi {name.split(' ')[0] if name else 'there'}, {intro}{text_items}\n\n{cta}: {_url(href)}\n\nAutomated reminder from {company} on Annex HR.",
    )
