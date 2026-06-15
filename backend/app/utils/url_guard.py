"""SSRF guard for outbound image fetches and user-supplied image URLs.

Any URL we fetch server-side (Gemini QA reading an image, or a boutique-supplied
"manual" standardized image) must be a public https URL — never a private,
loopback, link-local, or cloud-metadata address. This blocks SSRF where an
attacker points the fetcher at internal services (e.g. 169.254.169.254).
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException


class UnsafeURL(Exception):
    """Raised when a URL fails the SSRF safety checks."""


def _is_private_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        # Can't resolve → treat as unsafe rather than fetch a mystery host.
        return True
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return True
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return True
    return False


def is_safe_public_url(url: str) -> bool:
    """True only for a well-formed https URL whose host resolves to a public IP."""
    if not url or not isinstance(url, str):
        return False
    parsed = urlparse(url.strip())
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    return not _is_private_ip(parsed.hostname)


def ensure_safe_public_url(url: str) -> str:
    """Return the URL if safe, else raise HTTPException(400). Use at API ingress
    for user-supplied URLs."""
    if not is_safe_public_url(url):
        raise HTTPException(
            status_code=400,
            detail="URL must be a public https address (private/loopback hosts are not allowed).",
        )
    return url.strip()
