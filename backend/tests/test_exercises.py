import pytest
from conftest import image_file_exists, new_uuid, png_bytes


def exercise_form(catalog, **overrides) -> dict:
    return {
        "name": "Cable Fly",
        "muscle_group_id": catalog.muscle_group_id,
        "equipment_id": catalog.equipment_id,
        "primary_muscle_ids": [catalog.muscle_ids[0]],
        "secondary_muscle_ids": [catalog.muscle_ids[1]],
        "aliases": ["Fly", "cable fly", "Fly"],
        "reps": "true", "weights": "true", "time": "false", "intensity": "false", "distance": "false",
        **overrides,
    }


def create_exercise(user, catalog, images: int = 0, **overrides):
    files = [("images", (f"{i}.png", png_bytes(), "image/png")) for i in range(images)] or None
    return user.client.post("/v1/exercises", data=exercise_form(catalog, **overrides), files=files)


def test_create_exercise(make_user, catalog):
    user = make_user()

    response = create_exercise(user, catalog, images=2)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["verified"] is False
    # Duplicates and the name itself are removed from the aliases
    assert body["aliases"] == ["Fly"]
    assert body["primary_muscle_ids"] == [catalog.muscle_ids[0]]
    assert body["secondary_muscle_ids"] == [catalog.muscle_ids[1]]
    assert len(body["image_urls"]) == 2 and all(image_file_exists(h) for h in body["image_urls"])


def test_create_exercise_validation(make_user, catalog):
    user = make_user()

    assert create_exercise(user, catalog, reps="false", weights="false").status_code == 422
    assert create_exercise(user, catalog, muscle_group_id=9999).status_code == 400
    assert create_exercise(user, catalog, secondary_muscle_ids=[catalog.muscle_ids[0]]).status_code == 400
    assert create_exercise(user, catalog, primary_muscle_ids=[9999]).status_code == 400
    assert create_exercise(user, catalog, images=11).status_code == 400


def test_create_exercise_with_client_uuid_is_idempotent(make_user, catalog):
    user = make_user()
    client_uuid = new_uuid()

    first = create_exercise(user, catalog, client_uuid=client_uuid).json()
    retry = create_exercise(user, catalog, client_uuid=client_uuid).json()

    assert first["id"] == retry["id"]


def test_exercise_list_contains_verified_and_own_exercises(make_user, catalog, make_exercise):
    alice, bob = make_user(), make_user()
    verified = make_exercise("Squat")
    own = create_exercise(alice, catalog, name="Mine").json()
    create_exercise(bob, catalog, name="Bob's", client_uuid=new_uuid())

    body = alice.client.get("/v1/exercises").json()

    assert sorted(e["id"] for e in body["exercises"]) == sorted([verified, own["id"]])
    # The client UUID is only included for the user's own exercises
    assert all(e["client_uuid"] is None for e in body["exercises"])


def test_exercise_delta(make_user, catalog):
    alice, bob = make_user(), make_user()
    since = alice.client.get("/v1/exercises").json()["sync_time"]

    exercise = create_exercise(alice, catalog).json()
    created = alice.client.get("/v1/exercises/delta", params={"last_sync_time": since}).json()
    alice.client.delete(f"/v1/exercises/{exercise['id']}")
    deleted = alice.client.get("/v1/exercises/delta", params={"last_sync_time": created["sync_time"]}).json()
    others = bob.client.get("/v1/exercises/delta", params={"last_sync_time": since}).json()

    assert [(u["id"], u["action"]) for u in created["updates"]] == [(exercise["id"], 0)]
    assert [(u["id"], u["action"]) for u in deleted["updates"]] == [(exercise["id"], 2)]
    assert others["updates"] == []


def test_update_exercise_images(make_user, catalog):
    user = make_user()
    exercise = create_exercise(user, catalog, images=2).json()
    kept, removed = exercise["image_urls"]

    response = user.client.put(
        f"/v1/exercises/{exercise['id']}",
        data={**exercise_form(catalog, name="Renamed"), "image_urls": [kept, "f" * 64]},
        files=[("images", ("new.png", png_bytes(), "image/png"))]
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["image_urls"][0] == kept and len(body["image_urls"]) == 2
    assert not image_file_exists(removed)


def test_only_creator_can_change_unverified_exercises(make_user, catalog, make_exercise):
    alice, bob = make_user(), make_user()
    exercise = create_exercise(alice, catalog).json()
    verified = make_exercise()

    assert bob.client.delete(f"/v1/exercises/{exercise['id']}").status_code == 404
    assert bob.client.put(f"/v1/exercises/{exercise['id']}", data=exercise_form(catalog)).status_code == 404
    assert alice.client.delete(f"/v1/exercises/{verified}").status_code == 403


def test_exercise_in_use_cannot_be_deleted_or_change_metrics(make_user, catalog):
    user = make_user()
    exercise = create_exercise(user, catalog).json()
    user.client.post("/v1/workouts", json={
        "name": "W", "date": "2024-06-01T18:30:00Z", "duration": 10, "in_progress": False,
        "exercises": [{"exercise_id": exercise["id"], "unilateral": False, "index": 0, "reps": [1], "weights": [1]}]
    })

    deleted = user.client.delete(f"/v1/exercises/{exercise['id']}")
    metrics = user.client.put(f"/v1/exercises/{exercise['id']}", data=exercise_form(catalog, time="true"))
    renamed = user.client.put(f"/v1/exercises/{exercise['id']}", data=exercise_form(catalog, name="Renamed"))

    assert deleted.status_code == metrics.status_code == 409
    assert renamed.status_code == 200


def test_catalog_endpoints(make_user, catalog):
    user = make_user()

    assert [e["id"] for e in user.client.get("/v1/exercises/equipment").json()] == [catalog.equipment_id]
    assert [g["id"] for g in user.client.get("/v1/exercises/muscle-groups").json()] == [catalog.muscle_group_id]
    assert sorted(m["id"] for m in user.client.get("/v1/exercises/muscles").json()) == sorted(catalog.muscle_ids)


@pytest.mark.parametrize("path", ["/v1/exercises", "/v1/exercises/equipment", "/v1/exercises/muscle-groups", "/v1/exercises/muscles"])
def test_exercise_endpoints_require_a_session(client, path):
    assert client.get(path).status_code == 401
