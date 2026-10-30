import os

import numpy as np
import pytest
from conftest import image_file_exists, make_friends, png_bytes, read_takeout, run_sql
from PIL import Image
from test_exercises import create_exercise

from app.core import nudity_filter
from app.core.config import settings

BLOCKED = {"FEMALE_BREAST_EXPOSED": 0.83, "BUTTOCKS_EXPOSED": 0.45}
FLAGGED = {"MALE_GENITALIA_EXPOSED": 0.31}
BLOCKED_REASON = "NudeNet flagged and blocked: FEMALE_BREAST_EXPOSED (0.83), BUTTOCKS_EXPOSED (0.45)"
FLAGGED_REASON = "NudeNet flagged but not blocked: MALE_GENITALIA_EXPOSED (0.31)"


@pytest.fixture
def scores(monkeypatch) -> dict[str, float]:
    """The scores the faked detector finds in every image, empty (a safe image) until a test fills them."""
    found: dict[str, float] = {}
    monkeypatch.setattr(nudity_filter, "detect", lambda image: dict(found))
    return found


@pytest.fixture
def friends(make_user):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    return alice, bob


def reports() -> list[dict]:
    return [row._asdict() for row in run_sql("SELECT * FROM report ORDER BY id")]


def stored_images() -> int:
    return sum(len(files) for _, _, files in os.walk(settings.IMAGE_STORAGE_PATH))


def upload_profile_image(user):
    return user.client.put("/v1/users/me/profile-image", files={"file": ("me.png", png_bytes(), "image/png")})


def create_group(user, member, name="Gym Crew"):
    return user.client.post(
        "/v1/chats/groups", data={"name": name, "user_ids": [member.id]},
        files={"image": ("group.png", png_bytes(), "image/png")}
    )


def update_group(user, chat_id, name=None):
    return user.client.patch(
        f"/v1/chats/{chat_id}", data={"name": name} if name else None,
        files={"image": ("group.png", png_bytes(), "image/png")}
    )


def direct_chat(a, b) -> int:
    response = a.client.post("/v1/chats", json={"user_id": b.id})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def send_photo(user, chat_id, content="Look at this"):
    return user.client.post(
        f"/v1/chats/{chat_id}/messages", data={"content": content}, files={"image": ("photo.png", png_bytes(), "image/png")}
    )


def assert_blocked(response) -> None:
    assert response.status_code == 400, response.text
    assert response.json()["error"] == "ObjectionableContentError"
    assert response.json()["detail"] == nudity_filter.BLOCKED_MESSAGE


@pytest.mark.parametrize("label, block_at, below", [
    ("FEMALE_BREAST_EXPOSED", 0.65, 0.64),
    ("FEMALE_GENITALIA_EXPOSED", 0.35, 0.34),
    ("ANUS_EXPOSED", 0.60, 0.59),
    ("MALE_GENITALIA_EXPOSED", 0.35, 0.34),
])
def test_exposed_genitals_breasts_and_anus_are_blocked_from_their_score_and_flagged_from_20(label, block_at, below):
    assert nudity_filter.judge({label: block_at}) == nudity_filter.Verdict({label: block_at}, blocked=True)
    assert nudity_filter.judge({label: below}) == nudity_filter.Verdict({label: below}, blocked=False)
    assert nudity_filter.judge({label: 0.20}).flagged
    assert not nudity_filter.judge({label: 0.19}).flagged


@pytest.mark.parametrize("label", ["FEMALE_GENITALIA_COVERED", "BUTTOCKS_EXPOSED"])
def test_covered_genitals_and_exposed_buttocks_are_only_flagged_from_40(label):
    assert nudity_filter.judge({label: 0.99}) == nudity_filter.Verdict({label: 0.99}, blocked=False)
    assert nudity_filter.judge({label: 0.40}).flagged
    assert not nudity_filter.judge({label: 0.39}).flagged


def test_other_labels_never_count():
    verdict = nudity_filter.judge({"MALE_BREAST_EXPOSED": 0.99, "BELLY_EXPOSED": 0.95, "FACE_FEMALE": 0.9})

    assert verdict == nudity_filter.SAFE and not verdict.flagged


def test_report_reason_lists_the_findings_by_score():
    assert nudity_filter.judge({"BUTTOCKS_EXPOSED": 0.45, "FEMALE_BREAST_EXPOSED": 0.83}).report_reason == BLOCKED_REASON
    assert nudity_filter.judge(FLAGGED).report_reason == FLAGGED_REASON


def test_no_image_is_safe():
    assert nudity_filter.check_image(None) == nudity_filter.SAFE


def test_image_is_scaled_and_padded_to_the_input_size():
    blob = nudity_filter._prepare(Image.new("RGB", (1280, 640), (255, 255, 255)))

    assert blob.shape == (1, 3, 640, 640) and blob.dtype == np.float32
    # The upper half is the image, the lower half black padding
    assert blob[0, :, :320].min() == 1.0
    assert blob[0, :, 320:].max() == 0.0


def test_detect_keeps_the_highest_score_of_each_boxes_most_likely_label(monkeypatch):
    labels = nudity_filter.LABELS
    # 4 box coordinates and a score per label for 3 boxes
    output = np.zeros((1, 4 + len(labels), 3), dtype=np.float32)
    output[0, 4 + labels.index("BUTTOCKS_EXPOSED"), 0] = 0.5
    output[0, 4 + labels.index("BUTTOCKS_EXPOSED"), 1] = 0.7
    output[0, 4 + labels.index("FEMALE_BREAST_EXPOSED"), 1] = 0.3   # not the most likely label of its box
    output[0, 4 + labels.index("ANUS_EXPOSED"), 2] = 0.1            # below MIN_SCORE

    class FakeSession:
        def get_inputs(self):
            return [type("Input", (), {"name": "images"})]

        def run(self, outputs, feed):
            assert feed["images"].shape == (1, 3, 640, 640)
            return [output]

    monkeypatch.setattr(settings, "NUDITY_FILTER_MODEL_PATH", "/model.onnx")
    monkeypatch.setattr(nudity_filter, "_session", FakeSession())

    assert nudity_filter.detect(Image.new("RGB", (10, 10))) == {"BUTTOCKS_EXPOSED": pytest.approx(0.7)}


def test_detect_finds_nothing_while_the_check_is_off():
    assert nudity_filter.detect(Image.new("RGB", (10, 10))) == {}


@pytest.mark.skipif(not os.environ.get("NUDENET_TEST_MODEL"), reason="Set NUDENET_TEST_MODEL to the path of 640m.onnx")
def test_real_model_passes_a_plain_image(monkeypatch):
    monkeypatch.setattr(settings, "NUDITY_FILTER_MODEL_PATH", os.environ["NUDENET_TEST_MODEL"])
    monkeypatch.setattr(nudity_filter, "_session", None)

    assert nudity_filter.check_image(Image.new("RGB", (800, 600), (40, 90, 160))) == nudity_filter.SAFE


def test_blocked_profile_image_is_rejected_and_reported(make_user, scores):
    alice = make_user("alice")
    scores.update(BLOCKED)
    images_before = stored_images()

    assert_blocked(upload_profile_image(alice))

    assert run_sql('SELECT profile_image_url, profile_icon_url FROM "user" WHERE id = :id', id=alice.id)[0] == (None, None)
    [report] = reports()
    assert report["reason"] == BLOCKED_REASON
    assert (report["reporter_id"], report["uploader_id"], report["reported_user_id"]) == (None, alice.id, alice.id)
    assert report["user_name"] == "alice" and image_file_exists(report["profile_image"])
    # Only the report's copy is stored
    assert stored_images() == images_before + 1


def test_flagged_profile_image_gets_through_and_is_reported(make_user, scores):
    alice = make_user("alice")
    scores.update(FLAGGED)

    response = upload_profile_image(alice)

    assert response.status_code == 200, response.text
    [report] = reports()
    assert report["reason"] == FLAGGED_REASON
    assert (report["reporter_id"], report["uploader_id"], report["reported_user_id"]) == (None, alice.id, alice.id)
    assert report["profile_image"] != response.json()["image_url"] and image_file_exists(report["profile_image"])


def test_safe_profile_image_is_not_reported(make_user, scores):
    alice = make_user("alice")
    scores.update({"MALE_BREAST_EXPOSED": 0.95})

    assert upload_profile_image(alice).status_code == 200
    assert reports() == []


def test_blocked_image_of_a_new_group_is_rejected_and_reported_without_the_group(friends, scores):
    alice, bob = friends
    scores.update(BLOCKED)
    images_before = stored_images()

    assert_blocked(create_group(alice, bob))

    assert run_sql("SELECT count(*) FROM chat")[0][0] == 0
    [report] = reports()
    assert report["reason"] == BLOCKED_REASON
    assert (report["uploader_id"], report["reported_chat_id"], report["chat_name"]) == (alice.id, None, "Gym Crew")
    assert image_file_exists(report["chat_image"]) and stored_images() == images_before + 1


def test_flagged_image_of_a_new_group_is_reported_with_the_group(friends, scores):
    alice, bob = friends
    scores.update(FLAGGED)

    response = create_group(alice, bob)

    assert response.status_code == 201, response.text
    [report] = reports()
    assert report["reason"] == FLAGGED_REASON
    assert (report["uploader_id"], report["reported_chat_id"], report["chat_name"]) == (alice.id, response.json()["id"], "Gym Crew")
    assert report["chat_image"] != response.json()["image_url"]


def test_blocked_image_of_a_group_is_rejected_with_its_new_name(friends, scores):
    alice, bob = friends
    group = create_group(alice, bob).json()
    scores.update(BLOCKED)

    assert_blocked(update_group(alice, group["id"], name="New Name"))

    assert run_sql("SELECT name, image_url FROM chat WHERE id = :id", id=group["id"])[0] == ("Gym Crew", group["image_url"])
    [report] = reports()
    assert (report["uploader_id"], report["reported_chat_id"], report["chat_name"]) == (alice.id, group["id"], "New Name")
    assert report["reason"] == BLOCKED_REASON


def test_flagged_image_of_a_group_is_reported(friends, scores):
    alice, bob = friends
    group = create_group(alice, bob).json()
    scores.update(FLAGGED)

    response = update_group(alice, group["id"])

    assert response.status_code == 200, response.text
    [report] = reports()
    assert (report["reported_chat_id"], report["chat_name"], report["reason"]) == (group["id"], "Gym Crew", FLAGGED_REASON)


def test_image_of_a_group_the_user_may_not_change_is_not_reported(friends, scores):
    alice, bob = friends
    group = create_group(alice, bob).json()
    scores.update(BLOCKED)

    assert update_group(bob, group["id"]).status_code == 403
    assert reports() == []


def test_blocked_photo_is_rejected_and_reported_without_a_message(friends, scores):
    alice, bob = friends
    chat_id = direct_chat(alice, bob)
    scores.update(BLOCKED)
    images_before = stored_images()

    assert_blocked(send_photo(alice, chat_id, content="Hi"))

    assert run_sql("SELECT count(*) FROM message")[0][0] == 0
    assert run_sql("SELECT latest_message_preview FROM chat WHERE id = :id", id=chat_id)[0][0] is None
    [report] = reports()
    assert report["reason"] == BLOCKED_REASON
    assert (report["uploader_id"], report["reported_message_id"]) == (alice.id, None)
    assert (report["user_name"], report["message_text"]) == ("alice", "Hi")
    assert image_file_exists(report["message_image"]) and stored_images() == images_before + 1


def test_flagged_photo_is_sent_and_reported_with_its_message(friends, scores):
    alice, bob = friends
    scores.update(FLAGGED)

    response = send_photo(alice, direct_chat(alice, bob))

    assert response.status_code == 201, response.text
    [report] = reports()
    assert (report["reported_message_id"], report["uploader_id"], report["reason"]) == (response.json()["id"], alice.id, FLAGGED_REASON)
    assert report["message_image"] != response.json()["image_url"] and image_file_exists(report["message_image"])


def test_photo_to_a_chat_of_others_is_not_reported(friends, make_user, scores):
    alice, bob = friends
    chat_id = direct_chat(alice, bob)
    scores.update(BLOCKED)

    assert send_photo(make_user("carol"), chat_id).status_code == 403
    assert reports() == []


def test_exercise_images_are_not_checked(make_user, catalog, monkeypatch):
    monkeypatch.setattr(nudity_filter, "detect", lambda image: pytest.fail("Exercise images aren't checked"))

    assert create_exercise(make_user(), catalog, images=1).status_code == 201


def test_report_stays_when_the_uploader_is_removed_for_good(make_user, scores):
    from test_reports import make_deleted_long_ago, prune

    alice = make_user("alice")
    scores.update(BLOCKED)
    upload_profile_image(alice)
    assert alice.client.request("DELETE", "/v1/users/me", json={"password": alice.password}).status_code == 204
    make_deleted_long_ago("user", alice.id)

    prune()

    [report] = reports()
    assert (report["uploader_id"], report["reported_user_id"], report["user_name"]) == (None, None, "alice")
    assert image_file_exists(report["profile_image"])


def test_admin_shows_nudenet_as_the_reporter(make_user, scores):
    from fastapi.testclient import TestClient

    from app.main import app

    alice = make_user("alice")
    scores.update(FLAGGED)
    upload_profile_image(alice)
    admin = TestClient(app, base_url="http://admin.localhost")

    response = admin.get("/report/list")

    assert response.status_code == 200, response.text
    assert "NudeNet" in response.text and "MALE_GENITALIA_EXPOSED" in response.text


def test_takeout_contains_the_nudenet_reports_of_the_users_uploads_only(friends, scores):
    alice, bob = friends
    scores.update(BLOCKED)
    assert_blocked(send_photo(alice, direct_chat(alice, bob), content="Hi"))
    scores.clear()
    scores.update(FLAGGED)
    upload_profile_image(bob)
    scores.clear()
    # A report of alice by bob is bob's data, not alice's
    assert bob.client.post("/v1/reports", json={"reason": "Not okay.", "reported_user_id": alice.id}).status_code == 201

    takeout, images = read_takeout(alice.client.get("/v1/users/me/takeout"))

    [report] = takeout["nudenet_reports"]
    copy = run_sql("SELECT message_image FROM report WHERE uploader_id = :id", id=alice.id)[0][0]
    assert report == {
        "upload": "chat_photo", "blocked": True, "reason": BLOCKED_REASON, "image": copy,
        "chat_id": None, "chat_name": None, "message_id": None, "message_text": "Hi",
        "created_at": report["created_at"],
    }
    assert copy in images
    assert takeout["reports"] == []
    assert read_takeout(bob.client.get("/v1/users/me/takeout"))[0]["nudenet_reports"][0]["upload"] == "profile_image"
