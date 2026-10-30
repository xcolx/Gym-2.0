import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.applications import Starlette
from starlette.datastructures import Headers, MutableHeaders
from starlette.routing import Route
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.admin import GymAdmin, all_admin_views
from app.admin.same_origin import SameOriginMiddleware
from app.api import health as global_health
from app.api.v1.router import api_router as v1_router
from app.core import errors, nudity_filter
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.request_stats import RequestStatsMiddleware, flush_periodically
from app.db.session import engine
from app.schemas import ImageResponse
from app.services import image_service

SHOW_DOCS = settings.ENVIRONMENT != "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loads the NudeNet model right away, so that a missing one fails the start (and the deploy) instead of an upload
    await asyncio.to_thread(nudity_filter.load)
    # Writes the counted requests to request_stats once a minute and the rest when the backend stops
    flusher = asyncio.create_task(flush_periodically())
    yield
    flusher.cancel()
    await asyncio.gather(flusher, return_exceptions=True)


app = FastAPI(
    lifespan=lifespan,
    title=settings.PROJECT_NAME,
    description=settings.PROJECT_DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs" if SHOW_DOCS else None,
    redoc_url="/redoc" if SHOW_DOCS else None,
    openapi_url="/openapi.json" if SHOW_DOCS else None
)

# The limits are set per endpoint with @limiter.limit
app.state.limiter = limiter
# slowapi types the handler for its own exception, Starlette expects one for any exception
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


class ApiVersionMiddleware:
    """
    Retires and deprecates API versions (e.g. /v1/...) through the settings, also after their routes were removed:
    - retired: every request is answered with 410, the apps show an update screen then. 410 isn't used otherwise.
    - deprecated: the requests work, the responses get the header Deprecation: true, the apps show an update notice.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        version = scope["path"].lstrip("/").split("/", 1)[0]
        if version in settings.RETIRED_API_VERSIONS:
            response = JSONResponse(
                status_code=410,
                content={
                    "error": "ApiVersionRetiredError",
                    "detail": "This version of Gym 2.0 is no longer supported. Please update the app in the App Store."
                }
            )
            await response(scope, receive, send)
        elif version in settings.DEPRECATED_API_VERSIONS:
            async def send_with_header(message: Message) -> None:
                if message["type"] == "http.response.start":
                    MutableHeaders(scope=message).append("Deprecation", "true")
                await send(message)

            await self.app(scope, receive, send_with_header)
        else:
            await self.app(scope, receive, send)


# Added before CORS, so that CORS wraps its responses as well
app.add_middleware(ApiVersionMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Version-less, for the infrastructure monitoring
app.include_router(
    global_health.router,
    prefix="/health",
    tags=["System Infrastructure"]
)

app.include_router(
    v1_router,
    prefix="/v1"
)

# Served at the root of its own host (e.g. https://admin.gym2.app), so it can't be reached through the API host.
# It has no authentication of its own, access is protected by the reverse proxy in front of the admin host.
def admin_image(request: Request):
    """Serves the stored images for the previews in the admin, which can't use the API endpoint that requires a user."""
    try:
        return ImageResponse(image_service.get_image_path(request.path_params["image_hash"]))
    except errors.ImageNotFoundError:
        return JSONResponse({"detail": "Image not found."}, status_code=404)

# Added before the admin is mounted at the root, which would catch the path otherwise
admin_app = Starlette(routes=[Route("/images/{image_hash}", admin_image, name="image")])
admin_app.add_middleware(SameOriginMiddleware)
admin = GymAdmin(admin_app, engine=engine, base_url="")
for view in all_admin_views:
    admin.add_view(view)


class AdminHostMiddleware:
    """
    Hands the requests for the admin host to the admin app before the API routes them. Unlike app.host(), the admin
    then builds its URLs from the request, so they keep the port (e.g. http://admin.localhost:5000 in development).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket") and Headers(scope=scope).get("host", "").split(":")[0] == settings.ADMIN_HOST:
            await admin_app(scope, receive, send)
        else:
            await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    """
    Defaults for every API response that doesn't set its own: the API only answers with JSON and images, so nothing
    may run, load or be framed (also when an image URL is opened directly). Pages with their own policy, like the
    password reset page, keep it. The Swagger UI (only outside of production) loads its scripts from a CDN and is
    left out. HSTS, X-Content-Type-Options and Referrer-Policy come from the reverse proxy. Not for the admin, which
    AdminHostMiddleware hands over before this runs; the reverse proxy forbids framing it.
    """

    HEADERS = {
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
    }
    DOCS_PATHS = ("/docs", "/redoc")

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith(self.DOCS_PATHS):
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.HEADERS.items():
                    if name not in headers:
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


# Outside of CORS and the version middleware, so their responses (preflights, 410) get the headers too
app.add_middleware(SecurityHeadersMiddleware)
# Counts every API request incl. the ones answered by the middlewares added above, not the admin's (AdminHostMiddleware)
app.add_middleware(RequestStatsMiddleware)
app.add_middleware(AdminHostMiddleware)


@app.exception_handler(errors.UserNotFoundError)
@app.exception_handler(errors.WorkoutNotFoundError)
@app.exception_handler(errors.ExerciseNotFoundError)
@app.exception_handler(errors.WorkoutExerciseNotFoundError)
@app.exception_handler(errors.WorkoutSchemeNotFoundError)
@app.exception_handler(errors.RelationshipNotFoundError)
@app.exception_handler(errors.ChatNotFoundError)
@app.exception_handler(errors.MessageNotFoundError)
@app.exception_handler(errors.ImageNotFoundError)
@app.exception_handler(errors.AIConversationNotFoundError)
async def resource_not_found_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=404,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.AuthenticationError)
async def unauthorized_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=401,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.PermissionDeniedError)
@app.exception_handler(errors.EmailVerificationError)
async def forbidden_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=403,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.UserAlreadyExistsError)
@app.exception_handler(errors.WeakPasswordError)
@app.exception_handler(errors.InvalidWorkoutStateError)
@app.exception_handler(errors.InvalidRepetitionCountError)
@app.exception_handler(errors.InvalidUserActionError)
@app.exception_handler(errors.ExerciseCreationError)
@app.exception_handler(errors.InvalidImageError)
@app.exception_handler(errors.SyncTimeExpiredError)
@app.exception_handler(errors.ObjectionableContentError)
async def business_validation_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=400,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.ExerciseInUseError)
async def conflict_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=409,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.ImageTooLargeError)
async def payload_too_large_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=413,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.FeatureNotImplementedError)
async def not_implemented_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=501,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.DatabaseTimeoutError)
@app.exception_handler(errors.AIServiceUnavailableError)
async def infrastructure_failure_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=503,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )

@app.exception_handler(errors.DatabaseError)
async def database_error_handler(request: Request, exc: errors.AppException):
    return JSONResponse(
        status_code=500,
        content={
            "error": exc.__class__.__name__,
            "detail": str(exc)
        }
    )
