import re
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
# The actions of sqladmin's list and details pages (e.g. verify, delete permanently) change data with a GET request
ACTION_PATH = re.compile(r"^/[^/]+/action/[^/]+$")


def _host_of(url: str | None) -> str | None:
    return urlsplit(url).netloc if url else None


def is_same_origin(method: str, path: str, headers: Headers) -> bool:
    """
    Whether a request that changes data comes from a page of the admin itself. Browsers send Sec-Fetch-Site with every
    request, without it (older browsers) the Origin they send with every POST and DELETE, or the Referer the buttons of
    the actions send, must be the admin's host. Other requests (pages, images) change nothing and are always allowed.
    """
    if method in SAFE_METHODS and not ACTION_PATH.match(path):
        return True

    fetch_site = headers.get("sec-fetch-site")
    if fetch_site is not None:
        return fetch_site == "same-origin"

    source = headers.get("origin") if method not in SAFE_METHODS else headers.get("referer")
    return _host_of(source) == headers.get("host")


class SameOriginMiddleware:
    """
    Rejects requests of other sites that would change data in the admin (CSRF). The admin has no login of its own, the
    reverse proxy in front of it lets every request of an admin's browser through, also the forms, links and images of
    other sites. SameSite cookies of the proxy don't help either, since admin.gym2.app is the same site as gym2.app.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and not is_same_origin(scope["method"], scope["path"], Headers(scope=scope)):
            response = JSONResponse({"detail": "Requests from other sites are not allowed."}, status_code=403)
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
