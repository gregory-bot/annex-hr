"""Emails for time & attendance: timesheet approval reminders for managers."""

from __future__ import annotations

from html import escape

from ..config import settings
from .service import Email
from .templates import INK, MUTED, _button, _layout


def timesheet_reminder(to: str, name: str, company: str, items: list[tuple[str, str]]) -> Email:
    """`items` are (consultant name, week start ISO date) pairs awaiting this manager's approval."""
    url = f"{settings.APP_URL.rstrip('/')}/app/timesheets"
    n = len(items)
    rows = "".join(
        f'<li style="margin:0 0 6px"><strong style="color:{INK}">{escape(c)}</strong> · week of {escape(w)}</li>' for c, w in items[:12]
    )
    more = f'<p style="margin:0;color:{MUTED};font-size:13px">…and {n - 12} more.</p>' if n > 12 else ""
    body = f"""
      <p style="margin:0 0 14px;color:{MUTED};font-size:15px;line-height:1.6">Hi {escape(name.split(' ')[0])}, {n} consultant timesheet{'' if n == 1 else 's'} at {escape(company)} {'has' if n == 1 else 'have'} been waiting for your approval for more than 3 days.</p>
      <ul style="margin:0 0 8px;padding-left:18px;color:{MUTED};font-size:14px;line-height:1.5">{rows}</ul>{more}
      {_button("Review timesheets", url)}"""
    text_rows = "\n".join(f"- {c} · week of {w}" for c, w in items)
    return Email(
        to=to,
        subject=f"{n} timesheet{'' if n == 1 else 's'} waiting for your approval",
        html=_layout("Timesheets awaiting approval", body, "Approved hours flow to invoicing, so a quick review keeps billing on time."),
        text=f"Hi {name.split(' ')[0]},\n\n{n} timesheet(s) at {company} have been waiting for your approval for more than 3 days:\n{text_rows}\n\nReview them: {url}",
    )
