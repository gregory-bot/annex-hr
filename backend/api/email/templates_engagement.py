"""Emails for compliance document requests and reminders, policy reminders and probation updates."""

from __future__ import annotations

from html import escape

from ..config import settings
from .service import Email
from .templates import INK, MUTED, _button, _layout


def _url(path: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}{path}"


def _p(text: str) -> str:
    return f'<p style="margin:0 0 12px;color:{MUTED};font-size:15px;line-height:1.6">{text}</p>'


def document_request(to: str, name: str, doc_type: str, company: str, requester: str, note: str | None = None) -> Email:
    url = _url("/app/compliance?tab=documents")
    first = escape(name.split(" ")[0])
    body = _p(f"Hi {first}, {escape(requester)} from <strong style=\"color:{INK}\">{escape(company)}</strong> HR asked you to upload your <strong style=\"color:{INK}\">{escape(doc_type)}</strong>.")
    if note:
        body += _p(f"“{escape(note)}”")
    body += _button("Upload your document", url)
    return Email(
        to=to,
        subject=f"Please upload your {doc_type}",
        html=_layout(f"Please upload your {doc_type}", body, "Only you can upload documents to your file. HR can view them once uploaded."),
        text=f"Hi {name.split(' ')[0]}, {requester} ({company} HR) asked you to upload your {doc_type}.\n{note or ''}\nUpload it here: {url}",
    )


def document_expiry(to: str, name: str, doc_type: str, company: str, expires: str | None, renewal: bool) -> Email:
    url = _url("/app/compliance?tab=alerts")
    first = escape(name.split(" ")[0])
    when = f"expires on <strong style=\"color:{INK}\">{escape(expires)}</strong>" if expires else "needs attention"
    ask = "Please renew it and upload the new copy." if renewal else "Please plan the renewal so your file stays compliant."
    title = f"Renew your {doc_type}" if renewal else f"Your {doc_type} is expiring"
    body = _p(f"Hi {first}, your {escape(doc_type)} on file with {escape(company)} {when}. {ask}") + _button("Open my documents", url)
    return Email(
        to=to,
        subject=title,
        html=_layout(title, body, "You're receiving this because your HR team tracks this document for compliance."),
        text=f"Hi {name.split(' ')[0]}, your {doc_type} on file with {company} {'expires on ' + expires if expires else 'needs attention'}. {ask}\n{url}",
    )


def probation_update(to: str, name: str, company: str, headline: str, detail: str) -> Email:
    url = _url("/app/onboarding?tab=probation")
    body = _p(f"Hi {escape(name.split(' ')[0])}, {escape(detail)}") + _button("View in Annex HR", url)
    return Email(
        to=to,
        subject=f"{headline} — {company}",
        html=_layout(headline, body),
        text=f"Hi {name.split(' ')[0]}, {detail}\n{url}",
    )
