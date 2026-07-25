"""Transactional email via Emergent's managed Resend integration.

The platform owns the Resend account — we authenticate with a per-app key and
send through the integration proxy. The sender email address is fixed by the
platform; we only control the display name (`from_name`) and optional reply-to.
"""
from __future__ import annotations

import logging
import os

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Managed email proxy — a CONSTANT (never read from env, so it survives deploy).
EMAIL_BASE_URL = "https://integrations.emergentagent.com"


def _key() -> str:
    load_dotenv()  # defensive: auth (hence emailer) is imported before server calls load_dotenv
    return os.environ.get("EMERGENT_EMAIL_KEY", "")


def _from_name() -> str:
    return os.environ.get("EMAIL_FROM_NAME", "ROUJAUNE")

BRAND_YELLOW = "#FFC20A"
BRAND_DARK = "#0B0C0C"


async def send_email(to: str, subject: str, html: str, reply_to: str | None = None) -> bool:
    """Send one HTML email. Returns True on success; logs and returns False on
    failure (callers should not leak send failures to the client)."""
    key = _key()
    if not key:
        logger.error("EMERGENT_EMAIL_KEY not configured — cannot send email")
        return False
    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": _from_name(),  # REQUIRED brand/display sender name
    }
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": key},
                json=payload,
            )
        resp.raise_for_status()
        return True
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        return False
    except Exception as e:  # noqa: BLE001
        logger.error("Email send error: %s", str(e))
        return False


def _shell(title: str, body_html: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:{BRAND_DARK};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BRAND_DARK};padding:28px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#141615;border-radius:16px;border:1px solid rgba(255,194,10,0.28);overflow:hidden;">
          <tr><td style="padding:26px 32px 8px 32px;">
            <div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#F3F1EA;">ROU<span style="color:{BRAND_YELLOW};">JAUNE</span></div>
          </td></tr>
          <tr><td style="padding:8px 32px 4px 32px;">
            <h1 style="margin:0;color:#F3F1EA;font-size:20px;font-weight:800;">{title}</h1>
          </td></tr>
          <tr><td style="padding:12px 32px 28px 32px;color:#C9CAC7;font-size:15px;line-height:1.6;">
            {body_html}
          </td></tr>
          <tr><td style="padding:0 32px 26px 32px;color:#7C7D7A;font-size:12px;line-height:1.5;border-top:1px solid rgba(255,255,255,0.08);padding-top:18px;">
            ROUJAUNE — your cycling companion. If you didn't request this email, you can safely ignore it.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def _button(url: str, label: str) -> str:
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>'
        f'<td align="center" bgcolor="{BRAND_YELLOW}" style="border-radius:12px;">'
        f'<a href="{url}" target="_blank" '
        f'style="display:inline-block;padding:14px 30px;color:#241B00;font-size:15px;font-weight:800;text-decoration:none;border-radius:12px;">'
        f'{label}</a></td></tr></table>'
    )


def verification_email_html(name: str, link: str) -> str:
    body = (
        f"<p>Hi {name},</p>"
        "<p>Welcome to ROUJAUNE. Please confirm your email address so we can keep your "
        "account secure and send you important updates about your training.</p>"
        f"{_button(link, 'Verify my email')}"
        "<p style='font-size:13px;color:#9A9B98;'>Or paste this link into your browser:<br>"
        f"<a href='{link}' style='color:{BRAND_YELLOW};word-break:break-all;'>{link}</a></p>"
    )
    return _shell("Verify your email", body)


def reset_email_html(name: str, link: str) -> str:
    body = (
        f"<p>Hi {name},</p>"
        "<p>We received a request to reset your ROUJAUNE password. Tap the button below "
        "to choose a new one. This link expires in 60 minutes.</p>"
        f"{_button(link, 'Reset my password')}"
        "<p style='font-size:13px;color:#9A9B98;'>Or paste this link into your browser:<br>"
        f"<a href='{link}' style='color:{BRAND_YELLOW};word-break:break-all;'>{link}</a></p>"
        "<p style='font-size:13px;color:#9A9B98;'>If you didn't request this, your password "
        "stays the same and no action is needed.</p>"
    )
    return _shell("Reset your password", body)
