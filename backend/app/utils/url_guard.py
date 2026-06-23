"""SSRF guard for outbound image fetches and user-supplied image URLs.

Any URL we fetch server-side (Gemini QA reading an image, or a boutique-supplied
"manual" standardized image) must be a public https URL — never a private,
loopback, link-local, or cloud-metadata address. This blocks SSRF where an
attacker points the fetcher at internal services (e.g. 169.254.169.254).
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException


class UnsafeURL(Exception):
    """Raised when a URL fails the SSRF safety checks."""


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _resolve_public_ip(host: str) -> Optional[str]:
    """Resolve `host` and return ONE public IP, or None if it can't resolve or
    any resolved address is non-public. Returning the concrete IP lets callers
    pin the connection to it, closing the validate-then-refetch (DNS-rebinding)
    gap — we connect to the exact IP we validated, not whatever DNS returns next."""
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return None
    resolved = {info[4][0] for info in infos}
    if not resolved:
        return None
    # If ANY resolved address is non-public, reject the whole host (a rebinding
    # set could mix a public and a private answer).
    if any(not _is_public_ip(ip) for ip in resolved):
        return None
    return next(iter(resolved))


def safe_public_ip_for(url: str) -> Optional[str]:
    """Return a validated public IP to pin to for `url`, or None if unsafe."""
    if not url or not isinstance(url, str):
        return None
    parsed = urlparse(url.strip())
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    return _resolve_public_ip(parsed.hostname)


def is_safe_public_url(url: str) -> bool:
    """True only for a well-formed https URL whose host resolves to a public IP."""
    return safe_public_ip_for(url) is not None


def ensure_safe_public_url(url: str) -> str:
    """Return the URL if safe, else raise HTTPException(400). Use at API ingress
    for user-supplied URLs."""
    if not is_safe_public_url(url):
        raise HTTPException(
            status_code=400,
            detail="URL must be a public https address (private/loopback hosts are not allowed).",
        )
    return url.strip()


class _PinnedTransport(httpx.HTTPTransport):
    """httpx transport that pins resolution: only the pre-validated hostname is
    allowed, and it connects to the validated IP. TLS keeps the real hostname for
    SNI/cert verification. Any other host (e.g. via a redirect) is rejected, so
    DNS can't be re-pointed at a private address after validation.
    """

    def __init__(self, hostname: str, ip: str) -> None:
        super().__init__(local_address=None, retries=0)
        self._hostname = hostname
        self._ip = ip

    def handle_request(self, request):  # type: ignore[override]
        if request.url.host != self._hostname:
            raise UnsafeURL(f"Refusing to connect to unvalidated host: {request.url.host}")
        # Rewrite the connection target to the validated IP while leaving the
        # request URL (and therefore Host header + TLS SNI) on the hostname.
        request.extensions = dict(request.extensions or {})
        request.extensions["sni_hostname"] = self._hostname
        new_url = request.url.copy_with(host=self._ip)
        request.url = new_url
        request.headers["Host"] = self._hostname
        return super().handle_request(request)


def fetch_safe_image(url: str, *, timeout_seconds: float = 30.0) -> httpx.Response:
    """Fetch an image URL with SSRF protection.

    Resolves + validates the host to a public IP, pins the connection to that IP
    (no re-resolution), keeps TLS SNI on the hostname, and disables redirects so
    a 302 can't escape the check. Raises UnsafeURL if the URL isn't safe.
    """
    parsed = urlparse((url or "").strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise UnsafeURL("Only public https URLs may be fetched.")
    ip = _resolve_public_ip(parsed.hostname)
    if ip is None:
        raise UnsafeURL("URL host does not resolve to a public address.")

    transport = _PinnedTransport(parsed.hostname, ip)
    with httpx.Client(
        timeout=timeout_seconds, follow_redirects=False, verify=True, transport=transport
    ) as client:
        resp = client.get(url.strip())
    resp.raise_for_status()
    return resp
