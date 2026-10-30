from datetime import UTC, datetime

import pytest
import test_workouts as workouts
from conftest import image_file_exists, login, make_friends, png_bytes, run_sql
from fastapi.testclient import TestClient
from test_chat import create_direct, create_group, delta, sync_time

from app.admin.base import admin_session_maker
from app.admin.views import ExerciseAdmin, MessageAdmin
from app.db.models import Message
from app.main import app


@pytest.fixture
def admin() -> TestClient:
    """A client of the admin host that sends its requests like the browser does from the admin's own pages."""
    return TestClient(
        app, base_url="http://admin.localhost",
        headers={"origin": "http://admin.localhost", "sec-fetch-site": "same-origin"},
    )


@pytest.fixture
def friends(make_user):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    return alice, bob


def chat_image(chat_id: int) -> str | None:
    return run_sql("SELECT image_url FROM chat WHERE id = :id", id=chat_id)[0][0]


def test_dashboard_has_no_exercise_review(admin):
    response = admin.get("/")
    assert response.status_code == 200, response.text
    assert "Open reports" in response.text
    assert "Exercises to review" not in response.text


@pytest.mark.parametrize("period", ["24h", "7d", "30d", "90d"])
def test_traffic_with_hours_without_errors(admin, period):
    # Only successful requests, so the sums of the error bars have no rows
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    run_sql(
        "INSERT INTO request_stats (hour, route, method, status, api_version, platform, requests, duration_ms_sum, "
        "duration_ms_max, duration_buckets) VALUES (:hour, '/v1/health', 'GET', 200, 'v1', 'web', 3, 30, 15, :buckets)",
        hour=now, buckets=[3, 0, 0, 0, 0, 0, 0, 0],
    )
    response = admin.get("/traffic", params={"period": period})
    assert response.status_code == 200, response.text
    assert "/v1/health" in response.text


def test_images_lists_every_kind_newest_first(admin, friends):
    alice, bob = friends
    group = create_group(alice, [bob], image=png_bytes())
    direct = create_direct(alice, bob)
    first = alice.client.post(f"/v1/chats/{direct['id']}/messages", files={"image": ("a.png", png_bytes(), "image/png")})
    second = bob.client.post(f"/v1/chats/{direct['id']}/messages", files={"image": ("b.png", png_bytes(), "image/png")})
    assert first.status_code == 201 and second.status_code == 201, (first.text, second.text)
    profile = alice.client.put("/v1/users/me/profile-image", files={"file": ("p.png", png_bytes(), "image/png")})
    assert profile.status_code == 200, profile.text

    response = admin.get("/images")
    assert response.status_code == 200, response.text
    text = response.text
    assert "Messages (2)" in text and "Group chats (1)" in text and "Profile images (1)" in text and "Icons (1)" in text
    assert text.index(f"Message {second.json()['id']} by bob") < text.index(f"Message {first.json()['id']} by alice")
    assert f"/message/action/remove-image?pks={second.json()['id']}" in text

    for kind, label in [("chat", f"Gym Crew ({group['id']})"), ("profile", f"alice ({alice.id})"), ("icon", f"alice ({alice.id})")]:
        response = admin.get("/images", params={"type": kind})
        assert response.status_code == 200, response.text
        assert label in response.text


def test_images_lists_catalog_images_with_edit_links(admin, catalog, make_exercise):
    exercise_id = make_exercise()
    run_sql("UPDATE exercise SET image_urls = :hashes WHERE id = :id", hashes=["c" * 64, "d" * 64], id=exercise_id)

    response = admin.get("/images", params={"type": "exercise"})
    assert response.status_code == 200, response.text
    text = response.text
    assert "Exercises (2)" in text and "Muscles (2)" in text
    assert f"Bench Press ({exercise_id}), image 1 of 2" in text and f"Bench Press ({exercise_id}), image 2 of 2" in text
    assert f"/exercise/edit/{exercise_id}" in text and "remove-image" not in text

    response = admin.get("/images", params={"type": "muscle"})
    assert response.status_code == 200, response.text
    for muscle_id in catalog.muscle_ids:
        assert f"/muscle/edit/{muscle_id}" in response.text
    assert "Pectoralis" in response.text and "Triceps" in response.text


def chat_form(name: str, image: bytes | None = None, clear: bool = False):
    data = {"name": name, "public": "n"}
    if clear:
        data["image_url_checkbox"] = "y"
    files = {"image_url": ("group.png", image or b"", "image/png" if image else "application/octet-stream")}
    return data, files


def test_admin_replaces_and_clears_group_image(admin, friends):
    alice, bob = friends
    group = create_group(alice, [bob], image=png_bytes())
    old_image = group["image_url"]
    since = sync_time(bob)

    data, files = chat_form("Gym Crew", png_bytes((80, 80), (0, 0, 255, 255)))
    response = admin.post(f"/chat/edit/{group['id']}", data=data, files=files, follow_redirects=False)
    assert response.status_code == 302, response.text
    new_image = chat_image(group["id"])
    assert new_image and new_image != old_image
    assert image_file_exists(new_image) and not image_file_exists(old_image)
    # The members receive the new image with their next delta
    chat = next(chat for chat in delta(bob, since)["chats"] if chat["id"] == group["id"])
    assert chat["image_url"] == new_image

    # Saving without a file keeps the image
    data, files = chat_form("Renamed")
    assert admin.post(f"/chat/edit/{group['id']}", data=data, files=files, follow_redirects=False).status_code == 302
    assert chat_image(group["id"]) == new_image

    data, files = chat_form("Renamed", clear=True)
    assert admin.post(f"/chat/edit/{group['id']}", data=data, files=files, follow_redirects=False).status_code == 302
    assert chat_image(group["id"]) is None
    assert not image_file_exists(new_image)


def test_direct_chats_get_no_image(admin, friends):
    alice, bob = friends
    direct = create_direct(alice, bob)
    data, files = chat_form("", png_bytes())
    response = admin.post(f"/chat/edit/{direct['id']}", data=data, files=files, follow_redirects=False)
    assert response.status_code != 302
    assert "Only group chats have an image." in response.text
    assert chat_image(direct["id"]) is None


def test_deleting_the_last_admin_makes_another_member_admin(admin, friends):
    alice, bob = friends
    group = create_group(alice, [bob])

    response = admin.delete("/chat-user/delete", params={"pks": f"{group['id']};{alice.id}"})

    assert response.status_code == 200, response.text
    assert run_sql("SELECT user_id, admin FROM chat_user WHERE chat_id = :id", id=group["id"]) == [(bob.id, True)]


def _chat_with_message(alice, bob, content="Hello"):
    chat_id = create_direct(alice, bob)["id"]
    message = alice.client.post(f"/v1/chats/{chat_id}/messages", data={"content": content}).json()
    return chat_id, message


def _admin(action: str, message_id: int) -> None:
    """Runs an action of the message admin like its buttons do, with the admin's session (and its timestamp hook)."""
    view = MessageAdmin()
    with admin_session_maker() as session:
        getattr(view, action)(session, session.get(Message, message_id))
        session.commit()


def test_message_restored_in_the_admin_reaches_the_apps(friends):
    alice, bob = friends
    chat_id, message = _chat_with_message(alice, bob)
    _admin("soft_delete", message["id"])
    since = sync_time(bob)

    _admin("restore", message["id"])

    chat = next(chat for chat in delta(bob, since)["chats"] if chat["id"] == chat_id)
    assert [(m["id"], m["content"], m["deleted_at"]) for m in chat["messages"]] == [(message["id"], "Hello", None)]
    assert chat["latest_message_preview"] == "Hello"


def test_message_deleted_by_its_sender_cannot_be_restored(friends):
    alice, bob = friends
    _, message = _chat_with_message(alice, bob)
    alice.client.delete(f"/v1/chats/messages/{message['id']}")

    with pytest.raises(ValueError, match="deleted by its sender"):
        _admin("restore", message["id"])

    assert run_sql("SELECT deleted_at IS NOT NULL FROM message WHERE id = :id", id=message["id"])[0][0] is True


def test_show_next_opens_the_following_report(admin, friends):
    alice, bob = friends
    # Far in the future, so that no report of another test comes after them
    ids = [
        run_sql(
            "INSERT INTO report (reporter_id, reported_user_id, reason, created_at) "
            "VALUES (:reporter, :reported, 'Spam', :created_at) RETURNING id",
            reporter=alice.id, reported=bob.id, created_at=created_at,
        )[0][0]
        for created_at in (datetime(2100, 1, 2, tzinfo=UTC), datetime(2100, 1, 1, tzinfo=UTC), datetime(2100, 1, 2, tzinfo=UTC))
    ]

    def show_next(pk: int) -> str:
        response = admin.get("/report/action/show-next", params={"pks": pk}, follow_redirects=False)
        assert response.status_code == 302, response.text
        return response.headers["location"]

    assert show_next(ids[1]).endswith(f"/report/details/{ids[0]}")
    assert show_next(ids[0]).endswith(f"/report/details/{ids[2]}")
    assert show_next(ids[2]).endswith("/report/list")


def action(admin, identity: str, name: str, *pks, **params) -> str:
    """Runs an action of a list page like its buttons do and returns where it redirects."""
    response = admin.get(
        f"/{identity}/action/{name}", params={"pks": ",".join(map(str, pks)), **params},
        headers={"referer": f"http://admin.localhost/{identity}/list"}, follow_redirects=False,
    )
    assert response.status_code == 302, response.text
    return response.headers["location"]


def exercise_ids(user) -> list[int]:
    return sorted(e["id"] for e in user.client.get("/v1/exercises").json()["exercises"])


def test_verified_exercises_are_visible_to_every_user(admin, friends, make_exercise):
    alice, bob = friends
    exercise_id = make_exercise("Alice's Curl", verified=False, user_id=alice.id)
    assert exercise_id not in exercise_ids(bob)

    assert action(admin, "exercise", "verify", exercise_id).endswith("/exercise/list")
    assert exercise_id in exercise_ids(bob)

    action(admin, "exercise", "unverify", exercise_id)
    assert exercise_id not in exercise_ids(bob)
    assert exercise_id in exercise_ids(alice)


def test_merge_moves_workouts_to_the_kept_exercise(admin, make_user, make_exercise):
    user = make_user()
    kept, duplicate = make_exercise("Bench Press"), make_exercise("Bench press")
    workout = workouts.create_workout(user, duplicate)
    since = workouts.sync_time(user)

    form = admin.get("/exercise/action/merge", params={"pks": duplicate})
    assert form.status_code == 200, form.text
    assert "Bench press" in form.text

    location = action(admin, "exercise", "merge", duplicate, into=kept)

    assert location.endswith(f"/exercise/details/{kept}")
    [changed] = workouts.delta(user, since)["updates"]
    assert changed["id"] == workout["id"]
    assert [e["exercise_id"] for e in changed["exercises"]] == [kept]
    assert run_sql("SELECT deleted_at IS NOT NULL FROM exercise WHERE id = :id", id=duplicate)[0][0] is True


@pytest.mark.parametrize(("into", "error"), [
    ("abc", "Enter the ID of an exercise."),
    ("self", "can&#39;t be merged into itself"),
    ("missing", "doesn&#39;t exist or is deleted"),
    ("foreign", "is unverified and belongs to another user"),
    ("other metrics", "tracks reps, weights, but exercise"),
])
def test_merge_rejects_invalid_targets(admin, friends, make_exercise, into, error):
    alice, bob = friends
    duplicate = make_exercise("Curl", verified=False, user_id=alice.id)
    targets = {
        "abc": "abc", "self": duplicate, "missing": 999999,
        "foreign": make_exercise("Bob's Curl", verified=False, user_id=bob.id),
        "other metrics": make_exercise("Curl Hold", reps=False, time=True),
    }

    response = admin.get("/exercise/action/merge", params={"pks": duplicate, "into": targets[into]})

    assert response.status_code == 200, response.text
    assert error in response.text
    assert run_sql("SELECT deleted_at FROM exercise WHERE id = :id", id=duplicate)[0][0] is None


def test_merge_form_lists_similar_verified_exercises(admin, make_user, make_exercise):
    user = make_user()
    duplicate = make_exercise("bench press", verified=False, user_id=user.id)
    similar = make_exercise("Barbell Bench Press")
    contained = make_exercise("Bench")
    unverified = make_exercise("Bench Press 2", verified=False, user_id=user.id)
    unrelated = make_exercise("Squat")

    form = admin.get("/exercise/action/merge", params={"pks": duplicate})

    similar_section = form.text.split("Similar verified exercises")[1]
    assert f"'{similar}'" in similar_section and f"'{contained}'" in similar_section
    assert f"'{unverified}'" not in similar_section and f"'{unrelated}'" not in similar_section
    assert f"'{duplicate}'" not in similar_section


def test_merge_with_other_metrics_leaves_the_workouts_unchanged(admin, make_user, make_exercise):
    user = make_user()
    kept, duplicate = make_exercise("Rowing", reps=False, weights=False, time=True, distance=True), make_exercise("Row")
    workout = workouts.create_workout(user, duplicate)

    form = admin.get("/exercise/action/merge", params={"pks": duplicate})
    assert "reps, weights" in form.text

    response = admin.get("/exercise/action/merge", params={"pks": duplicate, "into": kept})

    assert "Only exercises with the same metrics can be merged." in response.text
    assert run_sql("SELECT exercise_id FROM workout_exercise WHERE workout_id = :id", id=workout["id"]) == [(duplicate,)]
    assert run_sql("SELECT deleted_at FROM exercise WHERE id = :id", id=duplicate)[0][0] is None


def test_exercise_details_show_its_muscles(admin, catalog, make_exercise):
    exercise_id = make_exercise()
    run_sql(
        "INSERT INTO exercise_muscles (exercise_id, muscle_id, is_primary) VALUES (:e, :m1, true), (:e, :m2, false)",
        e=exercise_id, m1=catalog.muscle_ids[0], m2=catalog.muscle_ids[1],
    )

    response = admin.get(f"/exercise/details/{exercise_id}")

    assert response.status_code == 200, response.text
    assert response.text.index("Pectoralis") < response.text.index("Triceps")


def test_soft_deleted_rows_can_be_restored_or_deleted_permanently(admin, make_user, make_exercise):
    user = make_user()
    workout = workouts.create_workout(user, make_exercise())

    # Only soft deleted rows can be deleted permanently
    location = action(admin, "workout", "delete-permanently", workout["id"])
    assert "Only+soft+deleted+rows" in location
    assert [w["id"] for w in user.client.get("/v1/workouts").json()["workouts"]] == [workout["id"]]

    assert admin.delete("/workout/delete", params={"pks": workout["id"]}).status_code == 200
    assert user.client.get("/v1/workouts").json()["workouts"] == []

    action(admin, "workout", "restore", workout["id"])
    assert [w["id"] for w in user.client.get("/v1/workouts").json()["workouts"]] == [workout["id"]]

    admin.delete("/workout/delete", params={"pks": workout["id"]})
    action(admin, "workout", "delete-permanently", workout["id"])
    assert run_sql("SELECT count(*) FROM workout")[0][0] == 0
    assert run_sql("SELECT count(*) FROM workout_exercise")[0][0] == 0


def test_deleting_a_user_in_the_admin_deletes_the_account(admin, make_user):
    user = make_user()

    assert admin.delete("/user/delete", params={"pks": user.id}).status_code == 200

    assert user.client.get("/v1/users/me").status_code == 401
    assert login(user.client, user.email).status_code == 401
    action(admin, "user", "restore", user.id)
    assert login(user.client, user.email).status_code == 200


def test_log_out_everywhere(admin, make_user):
    user, other = make_user(), make_user()

    action(admin, "user", "logout", user.id)

    assert user.client.get("/v1/users/me").status_code == 401
    assert other.client.get("/v1/users/me").status_code == 200


def test_mark_email_verified(admin, make_user):
    user = make_user(verify=False)

    action(admin, "user", "verify-email", user.id)

    assert run_sql('SELECT active FROM "user" WHERE id = :id', id=user.id) == [(True,)]
    assert login(user.client, user.email).status_code == 200


def test_send_verification_email(admin, make_user, outbox):
    unverified, verified = make_user(verify=False), make_user()
    outbox.mails.clear()

    assert action(admin, "user", "send-verification", unverified.id).endswith("/user/list")
    assert [(m.kind, m.email) for m in outbox.mails] == [("verification", unverified.email)]
    # The link of the new email verifies the account
    response = unverified.client.post("/v1/auth/verify-email", data={"user_id": unverified.id, "token": outbox.last().token})
    assert response.status_code == 200, response.text

    # Users without an unverified email are refused, the other selected users get no email either
    other = make_user(verify=False)
    outbox.mails.clear()
    assert f"User+{verified.id}+has+no+unverified+email" in action(admin, "user", "send-verification", other.id, verified.id)
    assert outbox.mails == []

    outbox.accept = False
    assert "could+not+be+sent" in action(admin, "user", "send-verification", other.id)


def test_remove_profile_image(admin, make_user):
    user = make_user()
    profile = user.client.put("/v1/users/me/profile-image", files={"file": ("p.png", png_bytes(), "image/png")}).json()
    image, icon = profile["image_url"], profile["icon_url"]
    assert image_file_exists(image) and image_file_exists(icon)

    action(admin, "user", "remove-image", user.id)

    me = user.client.get("/v1/users/me").json()
    assert me["profile_image_url"] == "" and me["profile_icon_url"] == ""
    assert not image_file_exists(image) and not image_file_exists(icon)


def test_deleting_a_chat_permanently_discards_its_message_images(admin, friends):
    alice, bob = friends
    chat_id = create_direct(alice, bob)["id"]
    message = alice.client.post(f"/v1/chats/{chat_id}/messages", files={"image": ("a.png", png_bytes(), "image/png")}).json()
    assert image_file_exists(message["image_url"])

    admin.delete("/chat/delete", params={"pks": chat_id})
    action(admin, "chat", "delete-permanently", chat_id)

    assert run_sql("SELECT count(*) FROM message")[0][0] == 0
    assert not image_file_exists(message["image_url"])


def test_remove_message_image(admin, friends):
    alice, bob = friends
    chat_id = create_direct(alice, bob)["id"]
    message = alice.client.post(
        f"/v1/chats/{chat_id}/messages", data={"content": "Look"}, files={"image": ("a.png", png_bytes(), "image/png")}
    ).json()

    action(admin, "message", "remove-image", message["id"])

    assert run_sql("SELECT content, image_url FROM message WHERE id = :id", id=message["id"]) == [("Look", None)]
    assert not image_file_exists(message["image_url"])


def test_failed_action_shows_the_error_and_changes_nothing(admin, make_user, make_exercise, monkeypatch):
    user = make_user()
    exercise_id = make_exercise(verified=False, user_id=user.id)

    def failing(session, obj):
        obj.verified = True
        raise RuntimeError("Something broke")

    monkeypatch.setattr(ExerciseAdmin, "_set_verified", lambda self, verified: failing)
    assert "error=Something+broke" in action(admin, "exercise", "verify", exercise_id)
    assert run_sql("SELECT verified FROM exercise WHERE id = :id", id=exercise_id)[0][0] is False


def test_lists_show_linked_names_and_filter_by_value(admin, make_user, make_exercise):
    alice, bob = make_user("alice"), make_user("bob")
    exercise_id = make_exercise()
    mine = workouts.create_workout(alice, exercise_id, name="Alice Day")
    workouts.create_workout(bob, exercise_id, name="Bob Day")

    response = admin.get("/workout/list", params={"user_id": alice.id})

    assert response.status_code == 200, response.text
    assert "Alice Day" in response.text and "Bob Day" not in response.text
    assert f"alice ({alice.id})" in response.text
    assert f"/workout/details/{mine['id']}" in response.text


def test_lists_filter_by_whether_a_column_is_set(admin, make_user):
    make_user("kept")
    deleted = make_user("gone")
    deleted.client.request("DELETE", "/v1/users/me", json={"password": deleted.password})

    def listed(value: str) -> set[str]:
        response = admin.get("/user/list", params={"deleted_at_set": value})
        assert response.status_code == 200, response.text
        return {name for name in ("kept", "gone") if f"{name}@" in response.text}

    assert listed("set") == {"gone"}
    assert listed("unset") == {"kept"}
    assert listed("__all") == {"kept", "gone"}


def test_friend_and_request_lists_show_both_sides_of_a_user(admin, make_user):
    alice, bob, carol = make_user("alice"), make_user("bob"), make_user("carol")
    make_friends(bob, alice)
    assert carol.client.post(f"/v1/users/me/friend-requests/{alice.id}").status_code == 201

    friends = admin.get("/friend/list", params={"user_id": alice.id}).text
    requests = admin.get("/friend-request/list", params={"user_id": alice.id}).text
    others = admin.get("/friend-request/list", params={"user_id": carol.id}).text

    assert f"bob ({bob.id})" in friends
    assert f"bob ({bob.id})" in requests and f"carol ({carol.id})" in requests
    assert f"bob ({bob.id})" not in others


def test_friendships_created_in_the_admin_are_stored_in_order(admin, make_user):
    alice, bob = make_user(), make_user()

    response = admin.post("/friend/create", data={"user_id_1": bob.id, "user_id_2": alice.id}, follow_redirects=False)
    assert response.status_code == 302, response.text
    assert run_sql("SELECT user_id_1, user_id_2 FROM friend") == [(min(alice.id, bob.id), max(alice.id, bob.id))]
    assert [f["id"] for f in alice.client.get("/v1/users/me/friends").json()] == [bob.id]

    response = admin.post("/friend/create", data={"user_id_1": alice.id, "user_id_2": alice.id}, follow_redirects=False)
    assert response.status_code != 302
    assert "can&#39;t be friends with themselves" in response.text


def workout_exercise_form(exercise_id: int, **fields) -> dict:
    return {"exercise_id": exercise_id, "index": 0, "reps": "", "weights": "", "time": "", "intensity": "", "distance": "", **fields}


def test_editing_sets_keeps_repeated_values_and_updates_the_workout(admin, make_user, make_exercise):
    user = make_user()
    exercise_id = make_exercise()
    workout = workouts.create_workout(user, exercise_id)
    workout_exercise_id = workout["exercises"][0]["id"]
    since = workouts.sync_time(user)

    response = admin.post(
        f"/workout-exercise/edit/{workout_exercise_id}",
        data=workout_exercise_form(exercise_id, reps="10, 10,10", weights="60, 62.5, 62.5"), follow_redirects=False,
    )

    assert response.status_code == 302, response.text
    [changed] = workouts.delta(user, since)["updates"]
    assert changed["exercises"][0]["reps"] == [10, 10, 10]
    assert changed["exercises"][0]["weights"] == [60, 62.5, 62.5]

    response = admin.post(
        f"/workout-exercise/edit/{workout_exercise_id}", data=workout_exercise_form(exercise_id, reps="10, ten")
    )
    assert "Enter numbers separated by commas." in response.text
    assert run_sql("SELECT reps FROM workout_exercise WHERE id = :id", id=workout_exercise_id) == [([10, 10, 10],)]


def exercise_edit_form(catalog, **fields) -> dict:
    return {
        "name": "Bench Press", "aliases": "", "description": "", "muscle_group_id": catalog.muscle_group_id,
        "equipment_id": catalog.equipment_id, "verified": "y", "user_id": "", "reps": "y", "weights": "y", **fields,
    }


def test_exercise_aliases_are_trimmed_and_deduplicated(admin, catalog, make_exercise):
    exercise_id = make_exercise()
    files = {"image_urls": ("", b"", "application/octet-stream")}

    response = admin.post(
        f"/exercise/edit/{exercise_id}", data=exercise_edit_form(catalog, aliases=" Bench , bench,, Flat Bench "),
        files=files, follow_redirects=False,
    )
    assert response.status_code == 302, response.text
    assert run_sql("SELECT aliases FROM exercise WHERE id = :id", id=exercise_id) == [(["Bench", "Flat Bench"],)]

    response = admin.post(f"/exercise/edit/{exercise_id}", data=exercise_edit_form(catalog, aliases="x" * 51), files=files)
    assert "at most 50 characters" in response.text


def test_user_created_at_can_be_edited(admin, make_user):
    user = make_user()
    data = {
        "user_name": user.username, "email": user.email, "email_change": "", "active": "y", "bodyweight": "",
        "scheme_color": "", "weight_unit": "0", "distance_unit": "0", "language": "", "uses_web": "y",
        "failed_login_attempts": "0", "created_at": "2024-03-01 12:30:00",
    }

    response = admin.post(f"/user/edit/{user.id}", data=data, follow_redirects=False)
    assert response.status_code == 302, response.text
    assert run_sql("SELECT created_at FROM \"user\" WHERE id = :id", id=user.id) == [(datetime(2024, 3, 1, 12, 30, tzinfo=UTC),)]


def test_host_check_ignores_forwarded_host_and_port(client):
    # The admin is only served for the Host header itself, a proxy header or another port doesn't open it
    assert client.get("/", headers={"x-forwarded-host": "admin.localhost"}).status_code == 404
    assert TestClient(app, base_url="http://admin.localhost:8080").get("/").status_code == 200


def verified(exercise_id: int) -> bool:
    return run_sql("SELECT verified FROM exercise WHERE id = :id", id=exercise_id)[0][0]


@pytest.mark.parametrize("headers", [
    {"sec-fetch-site": "cross-site"},
    # admin.gym2.app is the same site as gym2.app
    {"sec-fetch-site": "same-site"},
    # An image or link of another site in a browser without Sec-Fetch-Site
    {"referer": "https://evil.example/page"},
    {},
])
def test_actions_of_other_sites_are_rejected(make_exercise, headers):
    exercise_id = make_exercise(verified=False)
    client = TestClient(app, base_url="http://admin.localhost")

    response = client.get("/exercise/action/verify", params={"pks": exercise_id}, headers=headers, follow_redirects=False)
    assert response.status_code == 403, response.text
    assert not verified(exercise_id)


@pytest.mark.parametrize("headers", [
    {"sec-fetch-site": "same-origin"},
    # A browser without Sec-Fetch-Site
    {"referer": "http://admin.localhost/exercise/list"},
])
def test_actions_of_the_admin_itself_are_allowed(make_exercise, headers):
    exercise_id = make_exercise(verified=False)
    client = TestClient(app, base_url="http://admin.localhost")

    response = client.get("/exercise/action/verify", params={"pks": exercise_id}, headers=headers, follow_redirects=False)
    assert response.status_code == 302, response.text
    assert verified(exercise_id)


@pytest.mark.parametrize("headers", [
    {"sec-fetch-site": "cross-site", "origin": "http://admin.localhost"},
    {"origin": "https://evil.example"},
    {},
])
def test_forms_and_deletes_of_other_sites_are_rejected(make_exercise, headers):
    exercise_id = make_exercise()
    client = TestClient(app, base_url="http://admin.localhost")

    assert client.post("/maintenance/remove-old-data", headers=headers).status_code == 403
    assert client.delete("/exercise/delete", params={"pks": exercise_id}, headers=headers).status_code == 403
    assert run_sql("SELECT count(*) FROM exercise WHERE id = :id", id=exercise_id) == [(1,)]


def test_pages_can_be_opened_from_other_sites():
    # Opening a page changes nothing, e.g. a link to a report in an email
    client = TestClient(app, base_url="http://admin.localhost")
    assert client.get("/exercise/list", headers={"sec-fetch-site": "cross-site"}).status_code == 200
