"""Branded transactional email templates (inline styles for broad client support)."""

from __future__ import annotations

from html import escape

from ..config import settings
from .service import Email

RED = "#C1121F"
INK = "#111827"
MUTED = "#6B7280"


def _layout(title: str, body_html: str, footer: str = "") -> str:
    return f"""<!doctype html>
<html><body style="margin:0;background:#F6F7F9;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:{INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E8E9EE;border-radius:16px">
        <tr><td style="padding:28px 32px 0">
          <span style="display:inline-block;width:32px;height:32px;line-height:32px;border-radius:8px;background:{RED};color:#fff;font-weight:800;text-align:center;font-size:16px">A</span>
          <span style="vertical-align:middle;margin-left:8px;font-size:17px;font-weight:800;letter-spacing:-0.2px"><span style="color:{RED}">ANNEX</span> HR</span>
        </td></tr>
        <tr><td style="padding:24px 32px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">{escape(title)}</h1>
          {body_html}
        </td></tr>
        <tr><td style="padding:16px 32px 28px;color:{MUTED};font-size:12px;line-height:1.6">{footer}</td></tr>
      </table>
      <p style="color:{MUTED};font-size:12px;margin:16px 0 0">Annex HR · Annex Technologies Limited</p>
    </td></tr>
  </table>
</body></html>"""


def _button(label: str, url: str) -> str:
    return (
        f'<p style="margin:24px 0"><a href="{escape(url)}" style="display:inline-block;background:{RED};color:#fff;'
        f'text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">{escape(label)}</a></p>'
        f'<p style="font-size:12px;color:{MUTED};word-break:break-all">Or paste this link into your browser:<br>{escape(url)}</p>'
    )


def verification_code(to: str, code: str, company: str, minutes: int) -> Email:
    body = f"""
      <p style="margin:0 0 20px;color:{MUTED};font-size:15px;line-height:1.6">Use this code to verify your email and finish creating the <strong style="color:{INK}">{escape(company)}</strong> workspace.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;background:#FFE5E5;color:{RED};border-radius:12px;padding:16px 0;text-align:center">{escape(code)}</div>
      <p style="margin:20px 0 0;color:{MUTED};font-size:13px">The code expires in {minutes} minutes.</p>"""
    return Email(
        to=to,
        subject=f"{code} is your Annex HR verification code",
        html=_layout("Verify your email", body, "If you didn't try to create a workspace, you can ignore this email."),
        text=f"Your Annex HR verification code is {code}.\nIt expires in {minutes} minutes.\n\nIf you didn't request this, ignore this email.",
    )


def invitation(to: str, inviter: str | None, company: str, token: str) -> Email:
    url = f"{settings.APP_URL.rstrip('/')}/invite/{token}"
    who = escape(inviter) if inviter else "Your HR team"
    body = f"""
      <p style="margin:0;color:{MUTED};font-size:15px;line-height:1.6">{who} invited you to join <strong style="color:{INK}">{escape(company)}</strong> on Annex HR — where you'll complete onboarding, request leave and find your payslips.</p>
      {_button("Accept invitation", url)}"""
    return Email(
        to=to,
        subject=f"You're invited to join {company} on Annex HR",
        html=_layout(f"Join {company} on Annex HR", body, "This invitation expires in 14 days. Not expecting it? You can ignore this email."),
        text=f"{inviter or 'Your HR team'} invited you to join {company} on Annex HR.\nAccept your invitation: {url}\n\nThis link expires in 14 days.",
    )


def password_reset(to: str, name: str, token: str, minutes: int) -> Email:
    url = f"{settings.APP_URL.rstrip('/')}/reset-password?token={token}"
    body = f"""
      <p style="margin:0;color:{MUTED};font-size:15px;line-height:1.6">Hi {escape(name.split(' ')[0])}, we received a request to reset your Annex HR password.</p>
      {_button("Reset password", url)}
      <p style="margin:0;color:{MUTED};font-size:13px">This link expires in {minutes} minutes and can be used once.</p>"""
    return Email(
        to=to,
        subject="Reset your Annex HR password",
        html=_layout("Reset your password", body, "If you didn't ask to reset your password, you can ignore this email — your password won't change."),
        text=f"Reset your Annex HR password: {url}\nThis link expires in {minutes} minutes.\n\nIf you didn't request this, ignore this email.",
    )
