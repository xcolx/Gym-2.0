import io
import json
import os
import zipfile

import pytest
from conftest import (
    IMAGE_DIR,
    TEST_EMAIL_DOMAIN,
    image_file_exists,
    login,
    make_friends,
    new_client,
    png_bytes,
    read_takeout,
    run_sql,
    signup,
)


def test_get_me_returns_full_profile(make_user):
    user = make_user("alice")

    response = user.client.get("/v1/users/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == user.id
    assert body["username"] == "alice"
    assert body["email"] == user.email
    assert body["profile_image_url"] == "" and body["profile_icon_url"] == ""
    assert body["weight_unit"] == 0 and body["distance_unit"] == 0
    assert body["created_at"].endswith("+00:00")


def test_profile_of_others_depends_on_friendship(make_user):
    alice, bob, carol = make_user(), make_user(), make_user()
    make_friends(alice, bob)
    alice.client.patch("/v1/users/me", json={"language": "de"})

    as_friend = bob.client.get(f"/v1/users/{alice.id}").json()
    as_stranger = carol.client.get(f"/v1/users/{alice.id}").json()

    assert as_friend["language"] == "de"
    assert as_friend.get("email") is None
    assert as_stranger.get("language") is None
    assert as_stranger.get("email") is None
    assert as_stranger["username"] == alice.username


def test_profile_of_unknown_user_is_not_found(make_user):
    response = make_user().client.get("/v1/users/9999")

    assert response.status_code == 404
    assert response.json()["error"] == "UserNotFoundError"


def test_lookup_by_exact_username(make_user):
    alice, bob = make_user("alice"), make_user("bob")

    found = bob.client.get("/v1/users", params={"username": "alice"})
    wrong_case = bob.client.get("/v1/users", params={"username": "Alice"})

    assert found.status_code == 200 and found.json()["id"] == alice.id
    assert wrong_case.status_code == 404


def test_update_profile(make_user):
    user = make_user()

    response = user.client.patch("/v1/users/me", json={"bodyweight": 80.5, "scheme_color": "#00FF00", "weight_unit": 1})

    assert response.status_code == 200 and response.json()["success"] is True
    me = user.client.get("/v1/users/me").json()
    assert me["bodyweight"] == 80.5
    assert me["scheme_color"] == "#00FF00"
    assert me["weight_unit"] == 1


def test_update_profile_without_fields_changes_nothing(make_user):
    response = make_user().client.patch("/v1/users/me", json={})

    assert response.status_code == 200
    assert response.json()["success"] is False


def test_update_profile_validates_values(make_user):
    user = make_user()

    assert user.client.patch("/v1/users/me", json={"bodyweight": 0}).status_code == 422
    assert user.client.patch("/v1/users/me", json={"scheme_color": "red"}).status_code == 422
    assert user.client.patch("/v1/users/me", json={"weight_unit": 2}).status_code == 422
    assert user.client.patch("/v1/users/me", json={"language": "EN"}).status_code == 422
    assert user.client.patch("/v1/users/me", json={"weight_unit": None}).status_code == 400


def test_update_username(make_user):
    alice = make_user("alice")
    make_user("bob")

    taken = alice.client.patch("/v1/users/me/username", json={"username": "bob"})
    unchanged = alice.client.patch("/v1/users/me/username", json={"username": "alice"})
    rude = alice.client.patch("/v1/users/me/username", json={"username": "shithead"})
    changed = alice.client.patch("/v1/users/me/username", json={"username": "alice_new"})

    assert taken.status_code == 400
    assert unchanged.status_code == 200 and unchanged.json()["success"] is False
    assert rude.status_code == 400 and rude.json()["error"] == "ObjectionableContentError"
    assert changed.status_code == 200 and changed.json()["success"] is True
    assert alice.client.get("/v1/users/me").json()["username"] == "alice_new"


@pytest.mark.parametrize("sent, stored", [(999.94, 999.9), (0.06, 0.1), (72.0, 72.0)])
def test_bodyweight_is_rounded_to_one_decimal(make_user, sent, stored):
    user = make_user("alice")

    assert user.client.patch("/v1/users/me", json={"bodyweight": sent}).status_code == 200

    assert user.client.get("/v1/users/me").json()["bodyweight"] == stored


@pytest.mark.parametrize("sent", [999.95, 1000, 0.04, -1])
def test_bodyweight_that_rounds_out_of_range_is_rejected(make_user, sent):
    user = make_user("alice")

    assert user.client.patch("/v1/users/me", json={"bodyweight": sent}).status_code == 422


def test_update_password_keeps_current_session_and_ends_others(make_user):
    user = make_user()
    other_device = new_client()
    login(other_device, user.email)

    wrong = user.client.patch("/v1/users/me/password", json={"current_password": "Wrong-Passw0rd", "new_password": "New-Passw0rd"})
    weak = user.client.patch("/v1/users/me/password", json={"current_password": user.password, "new_password": "weakweak"})
    response = user.client.patch("/v1/users/me/password", json={"current_password": user.password, "new_password": "New-Passw0rd"})

    assert wrong.status_code == 403
    assert weak.status_code == 422
    assert response.status_code == 200
    assert user.client.get("/v1/users/me").status_code == 200
    assert other_device.get("/v1/users/me").status_code == 401
    assert login(new_client(), user.email, "New-Passw0rd").status_code == 200


def test_email_change_takes_effect_after_verification(make_user, outbox):
    user = make_user("alice")
    new_email = f"alice.new@{TEST_EMAIL_DOMAIN}"

    response = user.client.patch("/v1/users/me/email", json={"email": new_email, "password": user.password})

    assert response.status_code == 200 and response.json()["success"] is True
    mail = outbox.last("verification", new_email)
    assert mail.reason == "email_change"
    # Until the link is opened the old email stays in use
    assert user.client.get("/v1/users/me").json()["email"] == user.email
    assert login(new_client(), user.email).status_code == 200

    verified = user.client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token})

    assert verified.status_code == 200
    assert "new email" in verified.json()["message"]
    assert user.client.get("/v1/users/me").json()["email"] == new_email
    assert login(new_client(), user.email).status_code == 401
    assert login(new_client(), new_email).status_code == 200


def test_email_change_requires_password(make_user, outbox):
    user = make_user()
    sent = len(outbox.mails)

    response = user.client.patch("/v1/users/me/email", json={"email": f"x@{TEST_EMAIL_DOMAIN}", "password": "Wrong-Passw0rd"})

    assert response.status_code == 403
    assert len(outbox.mails) == sent


def test_email_change_to_registered_email_looks_like_a_change_but_only_notifies_the_address(make_user, outbox):
    alice, bob = make_user(), make_user()
    other = f"other@{TEST_EMAIL_DOMAIN}"
    expected = alice.client.patch("/v1/users/me/email", json={"email": other, "password": alice.password}).json()
    sent = len(outbox.mails)

    response = alice.client.patch("/v1/users/me/email", json={"email": bob.email, "password": alice.password})

    # The same answer as for an address without an account, so it doesn't reveal that bob's address is registered
    assert response.status_code == 200
    assert response.json() == {**expected, "message": expected["message"].replace(other, bob.email)}
    assert [(mail.kind, mail.email, mail.user_id) for mail in outbox.mails[sent:]] == [("already_registered", bob.email, alice.id)]
    # Nothing changed: the pending change to the other address is kept and works
    assert run_sql('SELECT email, email_change FROM "user" WHERE id = :id', id=alice.id)[0] == (alice.email, other)
    mail = outbox.last("verification", other)
    alice.client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token})
    assert alice.client.get("/v1/users/me").json()["email"] == other


def test_email_change_to_current_email_cancels_pending_change(make_user, outbox):
    user = make_user()
    user.client.patch("/v1/users/me/email", json={"email": f"pending@{TEST_EMAIL_DOMAIN}", "password": user.password})
    mail = outbox.last("verification", f"pending@{TEST_EMAIL_DOMAIN}")

    response = user.client.patch("/v1/users/me/email", json={"email": user.email, "password": user.password})

    assert response.status_code == 200
    assert "cancelled" in response.json()["message"]
    assert run_sql('SELECT email_change FROM "user" WHERE id = :id', id=user.id)[0][0] is None
    # The link of the cancelled change doesn't change the email anymore
    user.client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token})
    assert user.client.get("/v1/users/me").json()["email"] == user.email


def test_email_change_fails_if_address_was_registered_meanwhile(make_user, outbox, client):
    user = make_user()
    new_email = f"contested@{TEST_EMAIL_DOMAIN}"
    user.client.patch("/v1/users/me/email", json={"email": new_email, "password": user.password})
    mail = outbox.last("verification", new_email)
    assert signup(client, "contester", new_email).status_code == 201

    response = user.client.post("/v1/auth/verify-email", data={"user_id": mail.user_id, "token": mail.token})

    assert response.status_code == 403
    assert user.client.get("/v1/users/me").json()["email"] == user.email


def change_email(user, new_email):
    return user.client.patch("/v1/users/me/email", json={"email": new_email, "password": user.password})


def test_resend_email_change_sends_the_same_link_again(make_user, outbox):
    user = make_user("alice")
    new_email = f"new-alice@{TEST_EMAIL_DOMAIN}"
    assert change_email(user, new_email).status_code == 200
    first = outbox.last("verification", new_email)

    response = user.client.post("/v1/users/me/email/verification")

    assert response.status_code == 200, response.text
    again = outbox.last("verification", new_email)
    assert again is not first
    assert (again.token, again.reason) == (first.token, "email_change")

    assert user.client.post("/v1/auth/verify-email", data={"user_id": again.user_id, "token": again.token}).status_code == 200
    assert user.client.get("/v1/users/me").json()["email"] == new_email


def test_resend_email_change_without_pending_change_is_rejected(make_user, outbox):
    user = make_user("alice")
    sent = len(outbox.mails)

    response = user.client.post("/v1/users/me/email/verification")

    assert response.status_code == 400
    assert response.json()["error"] == "InvalidUserActionError"
    assert len(outbox.mails) == sent


def test_resend_email_change_requires_a_session(client):
    assert client.post("/v1/users/me/email/verification").status_code == 401


def _upload_profile_image(user, contents=None):
    return user.client.put(
        "/v1/users/me/profile-image", files={"file": ("me.png", contents or png_bytes((300, 200)), "image/png")}
    )


def test_upload_profile_image_stores_image_and_icon(make_user):
    user = make_user()

    response = _upload_profile_image(user)

    assert response.status_code == 200
    body = response.json()
    assert image_file_exists(body["image_url"]) and image_file_exists(body["icon_url"])
    me = user.client.get("/v1/users/me").json()
    assert me["profile_image_url"] == body["image_url"]
    assert me["profile_icon_url"] == body["icon_url"]

    image = user.client.get(f"/v1/images/{body['icon_url']}")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"


def test_replacing_profile_image_deletes_the_old_files(make_user):
    user = make_user()
    old = _upload_profile_image(user).json()

    new = _upload_profile_image(user).json()

    assert not image_file_exists(old["image_url"]) and not image_file_exists(old["icon_url"])
    assert image_file_exists(new["image_url"]) and image_file_exists(new["icon_url"])


def test_upload_rejects_files_that_are_not_images(make_user):
    user = make_user()

    response = _upload_profile_image(user, b"definitely not an image")

    assert response.status_code == 400
    assert response.json()["error"] == "InvalidImageError"
    assert user.client.get("/v1/users/me").json()["profile_image_url"] == ""


def test_delete_profile_image(make_user):
    user = make_user()
    uploaded = _upload_profile_image(user).json()

    response = user.client.delete("/v1/users/me/profile-image")

    assert response.status_code == 204
    me = user.client.get("/v1/users/me").json()
    assert me["profile_image_url"] == "" and me["profile_icon_url"] == ""
    assert not image_file_exists(uploaded["image_url"])
    assert not image_file_exists(uploaded["icon_url"])
    assert user.client.get(f"/v1/images/{uploaded['image_url']}").status_code == 404
    assert run_sql('SELECT updated_image_at FROM "user" WHERE id = :id', id=user.id)[0][0] is not None


def test_delete_profile_image_without_image_does_nothing(make_user):
    user = make_user()

    assert user.client.delete("/v1/users/me/profile-image").status_code == 204
    assert run_sql('SELECT updated_image_at FROM "user" WHERE id = :id', id=user.id)[0][0] is None


def test_images_require_a_session(make_user, client):
    uploaded = _upload_profile_image(make_user()).json()

    assert client.get(f"/v1/images/{uploaded['image_url']}").status_code == 401


def test_image_hash_is_validated(make_user):
    user = make_user()

    assert user.client.get("/v1/images/not-a-hash").status_code == 422
    assert user.client.get("/v1/images/" + "0" * 64).status_code == 404


def test_friend_request_flow(make_user):
    alice, bob = make_user(), make_user()

    sent = alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")
    again = alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")

    assert sent.status_code == 201
    assert again.json()["message"] == "Friend request already sent."
    assert [r["receiver"]["id"] for r in alice.client.get("/v1/users/me/friend-requests/sent").json()] == [bob.id]
    assert [r["sender"]["id"] for r in bob.client.get("/v1/users/me/friend-requests").json()] == [alice.id]

    accepted = bob.client.patch(f"/v1/users/me/friend-requests/{alice.id}", json={"status": True})

    assert accepted.status_code == 200
    assert accepted.json()["new_friend"]["id"] == alice.id
    assert [f["id"] for f in alice.client.get("/v1/users/me/friends").json()] == [bob.id]
    assert [f["id"] for f in bob.client.get("/v1/users/me/friends").json()] == [alice.id]
    assert bob.client.get("/v1/users/me/friend-requests").json() == []


def test_mutual_friend_request_is_accepted(make_user):
    alice, bob = make_user(), make_user()
    alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")

    response = bob.client.post(f"/v1/users/me/friend-requests/{alice.id}")

    assert response.json()["message"] == "Friend request accepted."
    assert [f["id"] for f in alice.client.get("/v1/users/me/friends").json()] == [bob.id]


def test_declined_friend_request_can_be_sent_again(make_user):
    alice, bob = make_user(), make_user()
    alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")

    declined = bob.client.patch(f"/v1/users/me/friend-requests/{alice.id}", json={"status": False})
    answered_twice = bob.client.patch(f"/v1/users/me/friend-requests/{alice.id}", json={"status": True})
    resent = alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")

    assert declined.status_code == 200 and declined.json()["new_friend"] is None
    assert answered_twice.status_code == 404
    assert resent.json()["message"] == "Friend request sent."
    assert len(bob.client.get("/v1/users/me/friend-requests").json()) == 1


def test_friend_request_cancel_and_invalid_targets(make_user):
    alice, bob = make_user(), make_user()

    assert alice.client.post(f"/v1/users/me/friend-requests/{alice.id}").status_code == 400
    assert alice.client.post("/v1/users/me/friend-requests/9999").status_code == 404
    assert alice.client.delete(f"/v1/users/me/friend-requests/{bob.id}").status_code == 404

    alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")
    assert bob.client.delete(f"/v1/users/me/friend-requests/{alice.id}").status_code == 204
    assert alice.client.get("/v1/users/me/friend-requests/sent").json() == []


def test_already_friends_and_remove_friend(make_user):
    alice, bob = make_user(), make_user()
    make_friends(alice, bob)

    assert alice.client.post(f"/v1/users/me/friend-requests/{bob.id}").status_code == 400
    assert bob.client.delete(f"/v1/users/me/friends/{alice.id}").status_code == 204
    assert alice.client.get("/v1/users/me/friends").json() == []
    assert alice.client.delete(f"/v1/users/me/friends/{bob.id}").status_code == 404


def test_block_removes_friendship_and_hides_profile(make_user):
    alice, bob = make_user(), make_user()
    make_friends(alice, bob)

    response = alice.client.put(f"/v1/users/me/blocked-users/{bob.id}")

    assert response.status_code == 201
    assert alice.client.get("/v1/users/me/friends").json() == []
    assert [u["id"] for u in alice.client.get("/v1/users/me/blocked-users").json()] == [bob.id]
    # Blocked in both directions
    assert bob.client.get(f"/v1/users/{alice.id}").status_code == 403
    assert alice.client.get(f"/v1/users/{bob.id}").status_code == 403
    assert bob.client.post(f"/v1/users/me/friend-requests/{alice.id}").status_code == 403
    assert alice.client.put(f"/v1/users/me/blocked-users/{bob.id}").json()["message"] == "User is already blocked."


def test_block_removes_pending_friend_requests(make_user):
    alice, bob = make_user(), make_user()
    bob.client.post(f"/v1/users/me/friend-requests/{alice.id}")

    alice.client.put(f"/v1/users/me/blocked-users/{bob.id}")

    assert alice.client.get("/v1/users/me/friend-requests").json() == []


def test_unblock(make_user):
    alice, bob = make_user(), make_user()
    alice.client.put(f"/v1/users/me/blocked-users/{bob.id}")

    assert alice.client.delete(f"/v1/users/me/blocked-users/{bob.id}").status_code == 204
    assert bob.client.get(f"/v1/users/{alice.id}").status_code == 200
    assert alice.client.delete(f"/v1/users/me/blocked-users/{bob.id}").status_code == 404
    assert alice.client.put(f"/v1/users/me/blocked-users/{alice.id}").status_code == 400


def test_delete_account_requires_password(make_user):
    user = make_user()

    missing = user.client.request("DELETE", "/v1/users/me", json={})
    wrong = user.client.request("DELETE", "/v1/users/me", json={"password": "Wrong-Passw0rd"})

    assert missing.status_code == wrong.status_code == 403
    assert user.client.get("/v1/users/me").status_code == 200


def test_delete_account_logs_out_everywhere(make_user):
    user = make_user()
    other_device = new_client()
    login(other_device, user.email)

    response = user.client.request("DELETE", "/v1/users/me", json={"password": user.password})

    assert response.status_code == 204
    assert 'session_token=""' in response.headers["set-cookie"]
    assert run_sql("SELECT count(*) FROM session WHERE user_id = :id", id=user.id)[0][0] == 0
    assert other_device.get("/v1/users/me").status_code == 401
    assert login(new_client(), user.email).status_code == 401
    assert run_sql('SELECT deleted_at IS NOT NULL FROM "user" WHERE id = :id', id=user.id)[0][0] is True


def test_deleted_account_is_hidden_and_reserves_username_and_email(make_user, client):
    alice, bob = make_user("alice"), make_user("bob")
    alice.client.request("DELETE", "/v1/users/me", json={"password": alice.password})

    assert bob.client.get(f"/v1/users/{alice.id}").status_code == 404
    assert bob.client.get("/v1/users", params={"username": "alice"}).status_code == 404
    assert signup(client, "alice", f"other@{TEST_EMAIL_DOMAIN}").status_code == 400
    assert run_sql('SELECT count(*) FROM "user" WHERE email = :email', email=alice.email)[0][0] == 1


def test_delete_account_deletes_profile_image(make_user):
    user = make_user()
    uploaded = _upload_profile_image(user).json()

    user.client.request("DELETE", "/v1/users/me", json={"password": user.password})

    assert not image_file_exists(uploaded["image_url"])
    assert not image_file_exists(uploaded["icon_url"])


def test_takeout_contains_the_users_data_without_secrets(make_user, make_exercise):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    exercise_id = make_exercise()
    alice.client.post("/v1/workouts", json={
        "name": "Push", "date": "2024-06-01T18:30:00Z", "duration": 60, "in_progress": False,
        "exercises": [{"exercise_id": exercise_id, "unilateral": False, "index": 0, "reps": [10], "weights": [52.5]}]
    })

    response = alice.client.get("/v1/users/me/takeout")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-disposition"].startswith('attachment; filename="gym2-data-takeout-')
    assert response.headers["cache-control"] == "no-store"
    takeout, images = read_takeout(response)
    assert images == {}
    assert takeout["export"]["format_version"] == 1
    assert takeout["account"]["username"] == "alice"
    assert takeout["account"]["email_verified"] is True
    assert [f["username"] for f in takeout["friends"]] == ["bob"]
    assert takeout["friend_requests"][0]["status"] == "accepted"
    assert takeout["workouts"][0]["exercises"][0]["exercise_name"] == "Bench Press"
    assert takeout["workouts"][0]["exercises"][0]["weights"] == [52.5]
    assert len(takeout["sessions"]) == 1

    raw = json.dumps(takeout)
    pw_hash, token_hash = run_sql(
        'SELECT u.pw_hash, s.session_token_hash FROM "user" u JOIN session s ON s.user_id = u.id WHERE u.id = :id',
        id=alice.id
    )[0]
    for secret in (pw_hash, token_hash, alice.session_token, alice.password):
        assert secret not in raw
    assert "pw_hash" not in takeout["account"]


def test_takeout_archive_contains_the_referenced_images(make_user):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    profile = _upload_profile_image(alice).json()
    chat_id = alice.client.post("/v1/chats", json={"user_id": bob.id}).json()["id"]
    for content in ("Kept", "Deleted"):
        response = alice.client.post(
            f"/v1/chats/{chat_id}/messages", data={"content": content}, files={"image": ("photo.png", png_bytes(), "image/png")}
        )
        assert response.status_code == 201, response.text
    [(kept_id, photo)] = run_sql("SELECT id, image_url FROM message WHERE content = 'Kept'")
    [deleted_id] = run_sql("SELECT id FROM message WHERE content = 'Deleted'")[0]
    assert alice.client.delete(f"/v1/chats/messages/{deleted_id}").status_code == 204

    response = alice.client.get("/v1/users/me/takeout")

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        folder = response.headers["content-disposition"].split('filename="')[1].removesuffix('.zip"')
        assert set(archive.namelist()) == {
            f"{folder}/data.json",
            *(f"{folder}/images/{image}.jpg" for image in (profile["image_url"], profile["icon_url"], photo)),
        }
    takeout, images = read_takeout(response)
    assert takeout["account"]["profile_image"] == profile["image_url"]
    assert {message["id"]: message["image"] for message in takeout["sent_messages"]}[kept_id] == photo
    with open(os.path.join(IMAGE_DIR, photo[:2], f"{photo[2:]}.jpg"), "rb") as file:
        assert images[photo] == file.read()
