"""Transactional email via the app's own Resend account.

Sends directly to the Resend API (https://api.resend.com/emails) with the app's
RESEND_API_KEY, from a verified custom-domain sender configured via
EMAIL_FROM_NAME / EMAIL_FROM_ADDRESS. Callers get a simple True/False; provider
errors are logged server-side and never surfaced to the client.
"""
from __future__ import annotations

import hashlib
import logging
import os

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


def _key() -> str:
    load_dotenv()  # defensive: auth (hence emailer) is imported before server calls load_dotenv
    return os.environ.get("RESEND_API_KEY", "")


def _from_name() -> str:
    return os.environ.get("EMAIL_FROM_NAME", "ROUJAUNE")


def _from_address() -> str:
    return os.environ.get("EMAIL_FROM_ADDRESS", "noreply@harmonywellnessgroup.com.au")


def _from() -> str:
    return f"{_from_name()} <{_from_address()}>"

BRAND_YELLOW = "#FFC20A"
BRAND_DARK = "#0B0C0C"


async def send_email(to: str, subject: str, html: str, reply_to: str | None = None) -> bool:
    """Send one HTML email via Resend. Returns True on success; logs and returns
    False on failure (callers must not leak send failures to the client)."""
    key = _key()
    if not key:
        logger.error("RESEND_API_KEY not configured — cannot send email")
        return False
    payload = {
        "from": _from(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if reply_to:
        payload["reply_to"] = reply_to
    # Deterministic idempotency key so a retry of the same message doesn't double-send.
    idem = hashlib.sha256(f"{to}|{subject}|{html}".encode()).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                         "Idempotency-Key": idem},
                json=payload,
            )
        resp.raise_for_status()
        return True
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text[:200])
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


def welcome_email_html(name: str) -> str:
    body = (
        f"<p>Hi {name},</p>"
        "<p>Welcome to ROUJAUNE — we're thrilled to have you. Your coach is ready to "
        "guide every ride, track your fitness, and celebrate every climb and milestone "
        "along the way.</p>"
        "<p>Here's how to get rolling:</p>"
        "<ul style='margin:8px 0 0;padding-left:18px;color:#C9CAC7;'>"
        "<li style='margin-bottom:6px;'>Pick your HuCentAI coach and set your goal event.</li>"
        "<li style='margin-bottom:6px;'>Start a scenic ride or upload a GPS file to see your stats.</li>"
        "<li>Build a consistency streak and unlock your first milestone.</li>"
        "</ul>"
        "<p style='margin-top:18px;'>Your strongest ride is your own. See you out there.</p>"
    )
    return _shell("Welcome to ROUJAUNE", body)


def weekly_digest_email_html(name: str, digest: dict, unsub_url: str | None = None, preview: bool = False) -> str:
    tw = digest.get("this_week", {}) or {}
    d = digest.get("deltas", {}) or {}

    def _delta(v, unit=""):
        if not v:
            return "<span style='color:#7C7D7A;'>±0 vs last wk</span>"
        col = "#3FB68B" if v > 0 else "#C9CAC7"
        sign = "+" if v > 0 else ""
        return f"<span style='color:{col};'>{sign}{v}{unit} vs last wk</span>"

    def _tile(val, label, delta):
        return (
            "<td align='center' style='padding:12px 8px;background:rgba(255,255,255,0.05);"
            "border:1px solid rgba(255,194,10,0.22);border-radius:12px;'>"
            f"<div style='color:#F3F1EA;font-size:22px;font-weight:800;'>{val}</div>"
            f"<div style='color:#9A9B98;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-top:2px;'>{label}</div>"
            f"<div style='font-size:11px;margin-top:5px;font-weight:700;'>{delta}</div></td>"
        )

    records = digest.get("new_records") or []
    rec_html = ""
    if records:
        items = "".join(
            f"<li style='margin-bottom:5px;'><b style='color:{BRAND_YELLOW};'>{r.get('watts')} W</b> "
            f"— {r.get('label')} best</li>" for r in records
        )
        rec_html = ("<p style='margin-top:20px;'><b style='color:#F3F1EA;'>New power records 🏆</b></p>"
                    f"<ul style='margin:6px 0 0;padding-left:18px;color:#C9CAC7;'>{items}</ul>")

    grid = (
        "<table role='presentation' width='100%' cellpadding='0' cellspacing='6' style='margin-top:14px;'><tr>"
        + _tile(tw.get("tss", 0), "TSS", _delta(d.get("tss", 0)))
        + _tile(f"{tw.get('hours', 0)} h", "TIME", _delta(d.get("hours", 0), "h"))
        + "</tr><tr>"
        + _tile(tw.get("rides", 0), "RIDES", _delta(d.get("rides", 0)))
        + _tile(f"{tw.get('distance_km', 0)} km", "DISTANCE", _delta(d.get("distance_km", 0), "km"))
        + "</tr></table>"
    )
    banner = (
        "<div style='background:rgba(255,194,10,0.14);border:1px solid rgba(255,194,10,0.5);"
        "border-radius:12px;padding:10px 14px;margin-bottom:16px;color:#FFD24A;font-size:13px;"
        "font-weight:700;text-align:center;'>🔍 This is a PREVIEW of your weekly recap email — "
        "sent because you asked to see what it looks like.</div>"
    ) if preview else ""
    body = (
        f"{banner}"
        f"<p>Hi {name},</p>"
        "<p>Here's your training recap for the week.</p>"
        f"{grid}{rec_html}"
        "<p style='margin-top:20px;color:#9A9B98;font-size:13px;'>Open ROUJAUNE to see your fitness "
        "trend, streak and milestones.</p>"
    )
    if unsub_url:
        body += (
            "<p style='margin-top:18px;color:#7C7D7A;font-size:12px;line-height:1.5;'>"
            "Don't want these weekly recaps? "
            f"<a href='{unsub_url}' style='color:{BRAND_YELLOW};'>Unsubscribe in one tap</a>."
            "</p>"
        )
    return _shell("Your week in review", body)


def milestone_email_html(name: str, items: list[dict]) -> str:
    hero = items[0]
    chips = "".join(
        f"<li style='margin-bottom:6px;'><b style='color:{BRAND_YELLOW};'>{it['label']}</b> — {it['blurb']}</li>"
        for it in items
    )
    body = (
        f"<p>Hi {name},</p>"
        f"<p style='font-size:17px;'>🎉 <b style='color:#F3F1EA;'>{hero['label']}</b> — {hero['blurb']}</p>"
        + (f"<p style='margin-top:16px;color:#F3F1EA;'>You just unlocked:</p>"
           f"<ul style='margin:6px 0 0;padding-left:18px;color:#C9CAC7;'>{chips}</ul>" if len(items) > 1 else "")
        + "<p style='margin-top:20px;'>Every kilometre counts. Keep the momentum going — your next "
          "milestone is already in sight.</p>"
    )
    return _shell("A new milestone! 🏆", body)
