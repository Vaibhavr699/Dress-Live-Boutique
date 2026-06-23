"""
Branded HTML email templates for Dress Live.

Design notes:
  - Email HTML is rendered by Gmail / Apple Mail / Outlook 365 / etc.
    Each renderer is its own little 2003 browser. We use table-based
    layouts + inline styles for the broadest compatibility.
  - Palette matches the app:
        background  #FAF7F2  (warm off-white)
        card        #FFFFFF
        ink         #1A1A1A  (near-black body text)
        muted       #6E6E6E
        accent      #1A1A1A  (CTA button)
        soft-divider #EFE9E1
  - Type stack: Helvetica Neue → Helvetica → Arial. The Inter / Playfair
    web fonts the app uses are not safe to assume in email, so we fall
    back to system fonts that read the same.
  - One central wrapper (`render_branded_email`) builds the chrome.
    Each transactional helper supplies a title, body paragraphs, and
    (optionally) a single primary CTA button.

If you ever need to change colours or layout, do it here once and every
email picks it up.
"""

from html import escape
from typing import Optional, Sequence


_BRAND_NAME = "Dress Live"
_BRAND_TAGLINE = "Live virtual fittings, one boutique at a time."

# Inline styles only — no <style> blocks (some clients strip them).
_BG = "#FAF7F2"
_CARD = "#FFFFFF"
_INK = "#1A1A1A"
_MUTED = "#6E6E6E"
_DIVIDER = "#EFE9E1"
_BUTTON_BG = "#1A1A1A"
_BUTTON_TEXT = "#FFFFFF"

_FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"


def render_branded_email(
    *,
    preheader: str,
    title: str,
    intro: str,
    paragraphs: Sequence[str] = (),
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
    footer_note: Optional[str] = None,
) -> str:
    """Wrap content in the Dress Live branded shell.

    Args:
      preheader: short text shown in the inbox preview snippet.
      title: bold headline at the top of the card.
      intro: lead paragraph below the title.
      paragraphs: additional paragraphs after the intro (optional).
      cta_label / cta_url: button drawn after the paragraphs (optional).
      footer_note: extra muted line above the standard footer (e.g. "If
        you didn't request this, ignore the email").
    """
    body_blocks: list[str] = []
    if intro:
        body_blocks.append(_paragraph(intro))
    for p in paragraphs:
        body_blocks.append(_paragraph(p))
    if cta_label and cta_url:
        body_blocks.append(_cta_button(cta_label, cta_url))
    if footer_note:
        body_blocks.append(_footer_note(footer_note))

    body_html = "\n".join(body_blocks)
    title_html = escape(title)
    preheader_html = escape(preheader)

    return f"""\
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title_html}</title>
  </head>
  <body style="margin:0;padding:0;background:{_BG};font-family:{_FONT_STACK};color:{_INK};">
    <!-- preheader (hidden in body but shown in inbox previews) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      {preheader_html}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:{_BG};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:{_CARD};border:1px solid {_DIVIDER};">
            <tr>
              <td style="padding:32px 40px 24px 40px;text-align:center;border-bottom:1px solid {_DIVIDER};">
                <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:{_MUTED};">{escape(_BRAND_NAME)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 16px 40px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;font-weight:400;letter-spacing:0.3px;color:{_INK};">
                  {title_html}
                </h1>
                {body_html}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px 40px;border-top:1px solid {_DIVIDER};text-align:center;">
                <div style="font-size:11px;color:{_MUTED};line-height:18px;">
                  {escape(_BRAND_TAGLINE)}
                </div>
                <div style="font-size:10px;color:{_MUTED};line-height:18px;margin-top:8px;letter-spacing:1.5px;text-transform:uppercase;">
                  &copy; {escape(_BRAND_NAME)}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _paragraph(text: str) -> str:
    """Render a paragraph. `text` is escaped, so callers can pass raw
    strings without worrying about HTML injection. If you need a link
    inside a paragraph use `_paragraph_with_link` below."""
    return (
        f'<p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:{_INK};">'
        f"{escape(text)}"
        f"</p>"
    )


def paragraph_with_link(text_before: str, link_label: str, link_url: str, text_after: str = "") -> str:
    """Build a paragraph that contains an inline anchor. Caller passes
    the surrounding text and the anchor pieces separately so we can
    escape each safely."""
    return (
        f'<p style="margin:0 0 16px 0;font-size:14px;line-height:22px;color:{_INK};">'
        f"{escape(text_before)}"
        f'<a href="{escape(link_url)}" style="color:{_INK};text-decoration:underline;">'
        f"{escape(link_label)}"
        f"</a>"
        f"{escape(text_after)}"
        f"</p>"
    )


def _cta_button(label: str, url: str) -> str:
    """Big black button. Inline styles only so it survives Gmail."""
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px 0;">'
        '<tr><td>'
        f'<a href="{escape(url)}" '
        f'style="display:inline-block;padding:14px 28px;background:{_BUTTON_BG};color:{_BUTTON_TEXT};'
        f"text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:500;"
        f'border-radius:0;">'
        f"{escape(label)}"
        f"</a>"
        "</td></tr></table>"
    )


def _footer_note(text: str) -> str:
    """Smaller, muted footer paragraph (e.g. fallback URL, ignore-this notice)."""
    return (
        f'<p style="margin:20px 0 0 0;font-size:12px;line-height:18px;color:{_MUTED};">'
        f"{escape(text)}"
        f"</p>"
    )


def render_long_link_for_text(url: str) -> str:
    """Plain-text variant — used in the text/multipart fallback when we
    want to ensure the URL is visible to people reading raw text."""
    return url
