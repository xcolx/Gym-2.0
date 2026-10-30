from datetime import timedelta

from conftest import DEFAULT_PASSWORD, TEST_EMAIL_DOMAIN, login, new_client, run_sql, signup


def email_of(username: str) -> str:
    return f"{username}@{TEST_EMAIL_DOMAIN}"


def verify(client, mail, **headers):
    return client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token}, headers=headers)


def test_signup_creates_unverified_user_and_sends_verification(client, outbox):
    response = signup(client, "alice", email_of("alice"), platform="mobile")

    assert response.status_code == 201
    assert response.json()["success"] is True
    mail = outbox.last("verification")
    assert mail.email == email_of("alice")
    assert mail.reason == "signup"

    rows = run_sql('SELECT active, uses_ios, uses_web, pw_hash FROM "user" WHERE id = :id', id=mail.user_id)
    active, uses_ios, uses_web, pw_hash = rows[0]
    assert active is False
    assert (uses_ios, uses_web) == (True, False)
    assert pw_hash.startswith("$2b$") and DEFAULT_PASSWORD not in pw_hash


def test_signup_normalizes_email(client, outbox):
    response = signup(client, "alice", f"  ALICE@{TEST_EMAIL_DOMAIN.upper()} ")

    assert response.status_code == 201
    assert outbox.last("verification").email == email_of("alice")


def test_signup_with_registered_email_gives_same_response_without_email(client, outbox):
    first = signup(client, "alice", email_of("alice"))
    second = signup(client, "alice2", email_of("alice"))

    assert second.status_code == first.status_code == 201
    assert second.json() == first.json()
    assert len(outbox.mails) == 1
    assert run_sql('SELECT count(*) FROM "user"')[0][0] == 1


def test_signup_with_taken_username_is_rejected(client):
    signup(client, "alice", email_of("alice"))

    response = signup(client, "alice", email_of("other"))

    assert response.status_code == 400
    assert response.json()["error"] == "UserAlreadyExistsError"


def test_usernames_are_case_sensitive(client):
    signup(client, "alice", email_of("alice"))

    assert signup(client, "Alice", email_of("alice-upper")).status_code == 201


def test_signup_rejects_objectionable_username(client):
    response = signup(client, "fuckface", email_of("rude"))

    assert response.status_code == 400
    assert response.json()["error"] == "ObjectionableContentError"


def test_signup_validates_password_policy(client):
    for password in ["short1A", "alllowercase", "x" * 51, "12345678"]:
        response = signup(client, "alice", email_of("alice"), password=password)
        assert response.status_code == 422, password


def test_signup_validates_username_format(client):
    for username in ["ab", "a" * 21, "has space", "umlaut_ä"]:
        response = signup(client, username, email_of("alice"))
        assert response.status_code == 422, username


def test_login_requires_verified_email(client, outbox):
    signup(client, "alice", email_of("alice"))

    response = login(client, email_of("alice"))

    assert response.status_code == 403
    assert response.json()["error"] == "EmailVerificationError"
    assert "session_token" not in response.cookies


def test_verify_email_activates_account(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")

    response = verify(client, mail)

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert run_sql('SELECT active, email_verify_token FROM "user" WHERE id = :id', id=mail.user_id)[0] == (True, None)
    assert login(client, email_of("alice")).status_code == 200


def test_verify_email_twice_reports_already_verified(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")
    verify(client, mail)

    response = verify(client, mail)

    assert response.status_code == 200
    assert "already verified" in response.json()["message"]


def test_verify_email_with_wrong_token_is_rejected(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")

    response = client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": "wrong"})

    assert response.status_code == 401
    assert run_sql('SELECT active FROM "user" WHERE id = :id', id=mail.user_id)[0][0] is False


def test_verify_email_of_unknown_user_is_rejected(client):
    response = client.post("/v1/auth/verify-email", data={"user_id": 999, "token": "x"})

    assert response.status_code == 401


def test_opening_verify_email_link_only_shows_the_confirm_button(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")

    page = client.get("/v1/auth/verify-email", params={"user_id": mail.user_id, "token": mail.token}, headers={"accept": "text/html"})

    assert page.status_code == 200
    assert 'method="post"' in page.text
    assert login(client, email_of("alice")).status_code == 403


def test_verify_email_link_in_browser_gets_html_page(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")

    bad = client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": "wrong"}, headers={"accept": "text/html"})
    good = verify(client, mail, accept="text/html")

    assert bad.status_code == 400
    assert bad.headers["content-type"].startswith("text/html")
    assert good.status_code == 200
    assert good.headers["content-type"].startswith("text/html")
    assert good.headers["referrer-policy"] == "no-referrer"


def test_expired_verification_link_sends_new_one(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")
    run_sql('UPDATE "user" SET email_verify_expire = now() - interval \'1 minute\' WHERE id = :id', id=mail.user_id)

    response = verify(client, mail)

    assert response.status_code == 403
    assert "new one has been sent" in response.json()["detail"]
    assert len(outbox.mails) == 2
    new_mail = outbox.last("verification")
    # The new expiry was committed although the request failed, so the new link works
    assert verify(client, new_mail).status_code == 200


def test_expired_verification_link_reports_failed_resend(client, outbox):
    signup(client, "alice", email_of("alice"))
    mail = outbox.last("verification")
    run_sql('UPDATE "user" SET email_verify_expire = now() - interval \'1 minute\' WHERE id = :id', id=mail.user_id)
    outbox.accept = False

    response = verify(client, mail)

    assert response.status_code == 403
    assert "request a new verification email" in response.json()["detail"]


def test_resend_verification_keeps_the_same_link(client, outbox):
    signup(client, "alice", email_of("alice"))
    first = outbox.last("verification")

    response = client.post("/v1/auth/verify-email/resend", json={"email": email_of("alice")})

    assert response.status_code == 200
    assert outbox.last("verification").token == first.token


def test_resend_verification_for_unknown_or_verified_account_sends_nothing(client, make_user, outbox):
    user = make_user()
    sent = len(outbox.mails)

    unknown = client.post("/v1/auth/verify-email/resend", json={"email": email_of("nobody")})
    verified = client.post("/v1/auth/verify-email/resend", json={"email": user.email})

    assert unknown.status_code == verified.status_code == 200
    assert unknown.json() == verified.json()
    assert len(outbox.mails) == sent


def test_login_sets_http_only_session_cookie(make_user):
    user = make_user(log_in=False)

    response = login(user.client, user.email)

    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("session_token=")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert f"Max-Age={730 * 24 * 3600}" in cookie
    # Development runs without HTTPS
    assert "Secure" not in cookie


def test_login_stores_only_the_hash_of_the_session_token(make_user):
    user = make_user()

    rows = run_sql("SELECT session_token_hash, agent, host(ip_address) FROM session WHERE user_id = :id", id=user.id)

    assert len(rows) == 1
    token_hash, agent, ip = rows[0]
    assert token_hash != user.session_token and len(token_hash) == 64
    assert agent == "web"
    assert ip == "127.0.0.1"


def test_login_is_case_insensitive_for_email(make_user):
    user = make_user(log_in=False)

    assert login(user.client, user.email.upper()).status_code == 200


def test_login_with_wrong_password_counts_failed_attempt(make_user):
    user = make_user(log_in=False)

    response = login(user.client, user.email, "Wrong-Passw0rd")

    assert response.status_code == 401
    assert response.json()["error"] == "AuthenticationError"
    assert run_sql('SELECT failed_login_attempts FROM "user" WHERE id = :id', id=user.id)[0][0] == 1


def test_login_with_unknown_email_gives_same_error(client, make_user):
    user = make_user(log_in=False)

    unknown = login(client, email_of("nobody"))
    wrong = login(client, user.email, "Wrong-Passw0rd")

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_successful_login_resets_failed_attempts_and_records_platform(make_user):
    user = make_user(log_in=False)
    login(user.client, user.email, "Wrong-Passw0rd")

    assert login(user.client, user.email, platform="mobile").status_code == 200

    failed, last_login, uses_ios = run_sql(
        'SELECT failed_login_attempts, last_login, uses_ios FROM "user" WHERE id = :id', id=user.id
    )[0]
    assert failed == 0
    assert last_login is not None
    assert uses_ios is True


def test_protected_endpoint_without_cookie_is_unauthorized(client):
    response = client.get("/v1/users/me")

    assert response.status_code == 401


def test_invalid_session_cookie_is_rejected_and_cleared(client):
    client.cookies.set("session_token", "not-a-session")

    response = client.get("/v1/users/me")

    assert response.status_code == 401
    assert 'session_token=""' in response.headers["set-cookie"]


def test_logout_deletes_session(make_user):
    user = make_user()
    token = user.session_token

    response = user.client.post("/v1/auth/logout")

    assert response.status_code == 200
    assert 'session_token=""' in response.headers["set-cookie"]
    assert run_sql("SELECT count(*) FROM session WHERE user_id = :id", id=user.id)[0][0] == 0

    stale = new_client()
    stale.cookies.set("session_token", token)
    assert stale.get("/v1/users/me").status_code == 401


def test_logout_without_session_succeeds(client):
    assert client.post("/v1/auth/logout").status_code == 200


def test_each_login_creates_its_own_session(make_user):
    user = make_user()
    other_device = new_client()
    login(other_device, user.email)

    assert run_sql("SELECT count(*) FROM session WHERE user_id = :id", id=user.id)[0][0] == 2
    assert user.client.get("/v1/users/me").status_code == 200
    assert other_device.get("/v1/users/me").status_code == 200


def _set_session_times(user_id: int, created_days_ago: int, active_days_ago: int) -> None:
    run_sql(
        "UPDATE session SET created_at = now() - make_interval(days => :created), "
        "last_active_at = now() - make_interval(days => :active) WHERE user_id = :id",
        created=created_days_ago, active=active_days_ago, id=user_id
    )


def test_session_stays_valid_during_minimum_lifetime(make_user):
    user = make_user()
    _set_session_times(user.id, created_days_ago=20, active_days_ago=20)

    assert user.client.get("/v1/users/me").status_code == 200


def test_session_expires_after_sliding_lifetime_without_use(make_user):
    user = make_user()
    _set_session_times(user.id, created_days_ago=40, active_days_ago=8)

    assert user.client.get("/v1/users/me").status_code == 401


def test_session_used_within_sliding_lifetime_stays_valid_and_is_refreshed(make_user):
    user = make_user()
    _set_session_times(user.id, created_days_ago=40, active_days_ago=6)

    assert user.client.get("/v1/users/me").status_code == 200

    age = run_sql("SELECT now() - last_active_at FROM session WHERE user_id = :id", id=user.id)[0][0]
    assert age < timedelta(minutes=1)


def test_session_expires_after_maximum_lifetime(make_user):
    user = make_user()
    _set_session_times(user.id, created_days_ago=731, active_days_ago=0)

    assert user.client.get("/v1/users/me").status_code == 401


def test_oauth_is_not_implemented(client):
    login_response = client.post("/v1/auth/login/oauth", json={"client": "web", "id_token": "x", "provider": "google"})
    signup_response = client.post(
        "/v1/auth/signup/oauth", json={"client": "web", "id_token": "x", "provider": "apple", "username": "alice"}
    )

    assert login_response.status_code == signup_response.status_code == 501


def test_forgot_password_sends_reset_link(make_user, outbox):
    user = make_user()

    response = user.client.post("/v1/auth/forgot-password", json={"email": user.email})

    assert response.status_code == 200
    mail = outbox.last("password_reset")
    assert mail.email == user.email
    stored = run_sql('SELECT pw_reset_token FROM "user" WHERE id = :id', id=user.id)[0][0]
    assert stored and stored != mail.token


def test_forgot_password_for_unknown_email_sends_nothing(client, outbox):
    response = client.post("/v1/auth/forgot-password", json={"email": email_of("nobody")})

    assert response.status_code == 200
    assert outbox.mails == []


def test_reset_password_page_shows_form_for_valid_token(make_user, outbox):
    user = make_user()
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    token = outbox.last("password_reset").token

    valid = user.client.get("/v1/auth/reset-password", params={"token": token})
    invalid = user.client.get("/v1/auth/reset-password", params={"token": "wrong"})

    assert valid.status_code == 200
    assert "<form" in valid.text and token in valid.text
    assert valid.headers["cache-control"] == "no-store"
    assert invalid.status_code == 400
    assert "<form" not in invalid.text


def _reset(client, token, password, confirmation=None):
    return client.post("/v1/auth/reset-password", data={
        "token": token, "password": password, "password_confirmation": confirmation or password
    })


def test_reset_password_sets_new_password_and_logs_out_everywhere(make_user, outbox):
    user = make_user()
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    token = outbox.last("password_reset").token

    response = _reset(new_client(), token, "New-Passw0rd")

    assert response.status_code == 200
    assert "has been changed" in response.text
    assert user.client.get("/v1/users/me").status_code == 401
    assert login(new_client(), user.email, user.password).status_code == 401
    assert login(new_client(), user.email, "New-Passw0rd").status_code == 200
    # The link only works once
    assert _reset(new_client(), token, "Other-Passw0rd").status_code == 400


def test_reset_password_rejects_mismatch_and_weak_password(make_user, outbox):
    user = make_user()
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    token = outbox.last("password_reset").token

    mismatch = _reset(user.client, token, "New-Passw0rd", "Other-Passw0rd")
    weak = _reset(user.client, token, "lowercaseonly")

    assert mismatch.status_code == weak.status_code == 400
    assert "don&#x27;t match" in mismatch.text or "don't match" in mismatch.text
    # The token is still valid after the rejected attempts
    assert _reset(user.client, token, "New-Passw0rd").status_code == 200


def test_reset_password_with_expired_token_is_rejected(make_user, outbox):
    user = make_user()
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    token = outbox.last("password_reset").token
    run_sql('UPDATE "user" SET pw_reset_expire = now() - interval \'1 minute\' WHERE id = :id', id=user.id)

    assert _reset(user.client, token, "New-Passw0rd").status_code == 400


def test_newer_reset_link_replaces_older_one(make_user, outbox):
    user = make_user()
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    old_token = outbox.last("password_reset").token
    user.client.post("/v1/auth/forgot-password", json={"email": user.email})
    new_token = outbox.last("password_reset").token

    assert _reset(user.client, old_token, "New-Passw0rd").status_code == 400
    assert _reset(user.client, new_token, "New-Passw0rd").status_code == 200


def test_reset_password_activates_unverified_account(client, outbox):
    signup(client, "alice", email_of("alice"))
    client.post("/v1/auth/forgot-password", json={"email": email_of("alice")})
    token = outbox.last("password_reset").token

    assert _reset(client, token, "New-Passw0rd").status_code == 200
    assert login(client, email_of("alice"), "New-Passw0rd").status_code == 200


def test_rate_limit_rejects_requests_over_the_limit(client, rate_limits):
    # forgot-password allows 2 requests per minute and IP
    statuses = [
        client.post("/v1/auth/forgot-password", json={"email": email_of("nobody")}).status_code
        for _ in range(3)
    ]

    assert statuses == [200, 200, 429]


def test_rate_limits_are_counted_per_endpoint(client, rate_limits):
    for _ in range(2):
        client.post("/v1/auth/forgot-password", json={"email": email_of("nobody")})

    assert client.post("/v1/auth/verify-email/resend", json={"email": email_of("nobody")}).status_code == 200
