from html import escape
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Form, Request, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.cookies import SESSION_COOKIE_NAME, clear_session_cookie, set_session_cookie
from app.core.deps import DbSession
from app.core.errors import AuthenticationError, EmailVerificationError, FeatureNotImplementedError, WeakPasswordError
from app.core.rate_limit import limiter
from app.core.security import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH
from app.schemas import (
    AuthResponse,
    EmailLoginRequest,
    EmailSignUpRequest,
    ForgotPasswordRequest,
    OAuthAuthLoginRequest,
    OAuthAuthSignUpRequest,
    ResendVerificationRequest,
)
from app.services import auth_service, mail_service

router = APIRouter()

SIGNUP_MESSAGE = (
    "Registration received. Please check your inbox to verify your email. "
    "If no email arrives, you can request a new one."
)
RESEND_MESSAGE = "If an unverified account exists for this email, a verification email has been sent."
FORGOT_PASSWORD_MESSAGE = "If an account exists for this email, we sent you a link to reset your password."


@router.post("/signup/email", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
@limiter.limit("3/minute")
def signup_with_email(
    request: Request,
    payload: EmailSignUpRequest,
    background_tasks: BackgroundTasks,
    db: Session = DbSession
):
    """
    Sends the verification email. The response is the same whether or not the email is already registered.
    """
    result = auth_service.signup_with_email(db, payload)

    # Sent after the response, so the response time doesn't reveal whether the email was already registered
    if result:
        user, raw_token = result
        assert user.email_verify_expire is not None  # Set with the token
        background_tasks.add_task(
            mail_service.send_verification_email, user.email, user.id, raw_token, user.email_verify_expire
        )

    return {"success": True, "message": SIGNUP_MESSAGE}


@router.post("/verify-email/resend", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("2/minute")
def resend_verification_email(
    request: Request,
    payload: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = DbSession
):
    """
    Sends the verification email again, e.g. if it didn't arrive. The link stays the same until it expires.
    The response is the same whether or not an unverified account exists for the email.
    """
    result = auth_service.resend_verification_email(db, payload.email)

    if result:
        user, raw_token = result
        assert user.email_verify_expire is not None  # Set with the token
        background_tasks.add_task(
            mail_service.send_verification_email, auth_service.verification_address(user), user.id, raw_token,
            user.email_verify_expire, mail_service.verification_reason(user)
        )

    return {"success": True, "message": RESEND_MESSAGE}


@router.get("/verify-email", response_class=HTMLResponse, include_in_schema=False)
@limiter.limit("10/minute")
def verify_email_page(request: Request, user_id: int, token: str):
    """
    The page the link of the verification email opens. It only shows a button that submits the verification,
    because email link scanners open links with GET and would otherwise verify the email or trigger new emails.
    """
    content = f"""
    <form method="post" action="verify-email">
        <input type="hidden" name="user_id" value="{user_id}">
        <input type="hidden" name="token" value="{escape(token)}">
        <button type="submit">Verify my email</button>
    </form>"""
    return _simple_page("Verify Email", content)


@router.post("/verify-email", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("5/minute")
def verify_email(
    request: Request,
    user_id: Annotated[int, Form()],
    token: Annotated[str, Form()],
    db: Session = DbSession
):
    """
    Submitted by the button of the verification page. Validates the token and marks the email as verified.
    If the link has expired, a new verification email is sent automatically.
    Browsers get a simple HTML page with the result, API clients that ask for JSON get the usual JSON response and errors.
    """
    if not _wants_html(request):
        message = auth_service.verify_email(db, user_id, token)
        return {"success": True, "message": message}

    try:
        message = auth_service.verify_email(db, user_id, token)
    except (AuthenticationError, EmailVerificationError) as error:
        # Invalid or expired link (an expired one already sent a new email if possible)
        return _simple_page("Verify Email", f"<p>{escape(error.message)}</p>", status_code=status.HTTP_400_BAD_REQUEST)

    return _simple_page("Verify Email", f"<p>{escape(message)}</p>")


@router.post("/forgot-password", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("2/minute")
def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = DbSession
):
    """
    Sends an email with a link to the password reset page (GET /reset-password).
    The response is the same whether or not an account exists for the email.
    """
    result = auth_service.request_password_reset(db, payload.email)

    # Sent after the response, so the response time doesn't reveal whether an account exists
    if result:
        user, raw_token = result
        assert user.pw_reset_expire is not None  # Set with the token
        background_tasks.add_task(
            mail_service.send_password_reset_email, user.email, user.id, raw_token, user.pw_reset_expire
        )

    return {"success": True, "message": FORGOT_PASSWORD_MESSAGE}


@router.get("/reset-password", response_class=HTMLResponse, include_in_schema=False)
@limiter.limit("10/minute")
def reset_password_page(
    request: Request,
    token: str = "",
    db: Session = DbSession
):
    """The page the link of the password reset email opens: a form to set a new password."""
    try:
        auth_service.get_user_for_password_reset(db, token)
    except AuthenticationError as error:
        return _reset_password_page(message=error.message, status_code=status.HTTP_400_BAD_REQUEST)

    return _reset_password_page(token=token)


@router.post("/reset-password", response_class=HTMLResponse, include_in_schema=False)
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    token: Annotated[str, Form()],
    password: Annotated[str, Form(max_length=PASSWORD_MAX_LENGTH)],
    password_confirmation: Annotated[str, Form(max_length=PASSWORD_MAX_LENGTH)],
    db: Session = DbSession
):
    """Sets the new password submitted by the form of the reset page and logs the user out on all devices."""
    if password != password_confirmation:
        return _reset_password_page(token=token, error="The passwords don't match.", status_code=status.HTTP_400_BAD_REQUEST)

    try:
        auth_service.reset_password(db, token, password)
    except AuthenticationError as error:
        return _reset_password_page(message=error.message, status_code=status.HTTP_400_BAD_REQUEST)
    except WeakPasswordError as error:
        return _reset_password_page(token=token, error=error.message, status_code=status.HTTP_400_BAD_REQUEST)

    return _reset_password_page(message="Your password has been changed. You can now log in with your new password in the app.")


@router.post("/signup/oauth", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
@limiter.limit("5/minute")
def signup_with_oauth(
    request: Request,
    payload: OAuthAuthSignUpRequest,
    response: Response,
    db: Session = DbSession
):
    raise FeatureNotImplementedError(f"Signing up with {payload.provider} is not available yet.")


@router.post("/login/email", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("5/minute")
def login_with_email(
    request: Request,
    payload: EmailLoginRequest,
    response: Response,
    db: Session = DbSession
):
    """
    Sets an HTTP-only session cookie on success.
    """

    raw_token, max_age_seconds = auth_service.login_with_email(db, payload, request.client.host if request.client else None)

    set_session_cookie(response, raw_token, max_age_seconds)

    return {
        "success": True,
        "message": "Authentication successful."
    }


@router.post("/login/oauth", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("5/minute")
def login_with_oauth(
    request: Request,
    payload: OAuthAuthLoginRequest,
    response: Response,
    db: Session = DbSession
):
    raise FeatureNotImplementedError(f"Logging in with {payload.provider} is not available yet.")


@router.post("/logout", status_code=status.HTTP_200_OK, response_model=AuthResponse)
@limiter.limit("10/minute")
def logout(
    request: Request,
    response: Response,
    db: Session = DbSession
):
    """
    Deletes the session and clears its cookie.
    """
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    auth_service.logout_session(db, raw_token)

    clear_session_cookie(response)

    return {"success": True, "message": "Logout successful."}


# The pages have no scripts and only post to themselves. No referrer, so the token of the URL isn't passed on.
PAGE_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


def _wants_html(request: Request) -> bool:
    """True for browsers opening a link of an email, which ask for text/html, unlike the API clients (application/json)."""
    return "text/html" in request.headers.get("accept", "")


def _simple_page(title: str, content: str, status_code: int = status.HTTP_200_OK) -> HTMLResponse:
    """Renders a minimal page with the title and the already escaped HTML content."""
    html = f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(title)} - Gym 2.0</title>
    <style>
        body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 400px; margin: 40px auto; padding: 0 16px; }}
        input, button {{ display: block; width: 100%; box-sizing: border-box; margin: 8px 0; padding: 10px; font-size: 16px; }}
        .error {{ color: #d00; }}
        .hint {{ color: #666; font-size: 13px; }}
    </style>
</head>
<body>
    <h1>{escape(title)}</h1>
    {content}
</body>
</html>"""

    return HTMLResponse(html, status_code=status_code, headers=PAGE_HEADERS)


def _reset_password_page(
    token: str | None = None,
    error: str | None = None,
    message: str | None = None,
    status_code: int = status.HTTP_200_OK
) -> HTMLResponse:
    """
    Renders the password reset page: the form if a token is given (with an error above it, if any),
    otherwise only the message, e.g. after the reset or for an invalid link.
    """
    if token is not None:
        error_html = f'<p class="error">{escape(error)}</p>' if error else ""
        content = f"""
        {error_html}
        <form method="post" action="reset-password">
            <input type="hidden" name="token" value="{escape(token)}">
            <input type="password" name="password" placeholder="New password" autocomplete="new-password" minlength="{PASSWORD_MIN_LENGTH}" maxlength="{PASSWORD_MAX_LENGTH}" required>
            <input type="password" name="password_confirmation" placeholder="Repeat new password" autocomplete="new-password" minlength="{PASSWORD_MIN_LENGTH}" maxlength="{PASSWORD_MAX_LENGTH}" required>
            <p class="hint">{PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters with at least two of: lowercase letters, uppercase letters, digits, special characters.</p>
            <button type="submit">Set new password</button>
        </form>"""
    else:
        content = f"<p>{escape(message or '')}</p>"

    return _simple_page("Reset Password", content, status_code=status_code)
