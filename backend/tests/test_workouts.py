from datetime import UTC, datetime, timedelta

import pytest
from conftest import new_uuid, run_sql


def workout_payload(exercise_id: int, **overrides) -> dict:
    return {
        "name": "Push Day",
        "date": "2024-06-01T18:30:00+02:00",
        "duration": 60,
        "in_progress": False,
        "exercises": [{"exercise_id": exercise_id, "unilateral": False, "index": 0, "reps": [10, 8], "weights": [60, 62.5]}],
        **overrides,
    }


def create_workout(user, exercise_id: int, **overrides) -> dict:
    response = user.client.post("/v1/workouts", json=workout_payload(exercise_id, **overrides))
    assert response.status_code == 201, response.text
    return response.json()


def create_op(exercise_id: int, index: int, **fields) -> dict:
    return {"op": "create", "exercise_id": exercise_id, "unilateral": False, "index": index, **fields}


def update_op(workout_exercise_id: int, **fields) -> dict:
    return {"op": "update", "id": workout_exercise_id, **fields}


def patch_workout(user, workout_id: int, *changes: dict, **fields):
    return user.client.patch(f"/v1/workouts/{workout_id}", json={**fields, "exercise_changes": list(changes)})


def exercise_by(workout: dict, **match) -> dict:
    return next(ex for ex in workout["exercises"] if all(ex[key] == value for key, value in match.items()))


def sync_time(user) -> str:
    return user.client.get("/v1/workouts").json()["sync_time"]


def delta(user, since: str) -> dict:
    response = user.client.get("/v1/workouts/delta", params={"last_sync_time": since})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def exercise_id(make_exercise) -> int:
    return make_exercise()


def test_create_workout(make_user, exercise_id):
    user = make_user()

    workout = create_workout(user, exercise_id, name="  Push Day  ")

    assert workout["name"] == "Push Day"
    assert workout["date"] == "2024-06-01T16:30:00+00:00"
    exercise = workout["exercises"][0]
    assert exercise["reps"] == [10, 8] and exercise["weights"] == [60.0, 62.5]
    # Metrics the exercise doesn't track are null
    assert exercise["time"] is None and exercise["distance"] is None


def test_get_all_returns_only_own_non_deleted_workouts(make_user, exercise_id):
    alice, bob = make_user(), make_user()
    kept = create_workout(alice, exercise_id)
    deleted = create_workout(alice, exercise_id)
    create_workout(bob, exercise_id)
    alice.client.delete(f"/v1/workouts/{deleted['id']}")

    body = alice.client.get("/v1/workouts").json()

    assert [w["id"] for w in body["workouts"]] == [kept["id"]]
    assert body["sync_time"].endswith("+00:00")


def test_create_workout_with_client_uuid_is_idempotent(make_user, exercise_id):
    user = make_user()
    client_uuid = new_uuid()

    first = create_workout(user, exercise_id, client_uuid=client_uuid)
    retry = create_workout(user, exercise_id, client_uuid=client_uuid)

    assert first["id"] == retry["id"]
    assert first["client_uuid"] == client_uuid
    assert len(user.client.get("/v1/workouts").json()["workouts"]) == 1


def test_create_workout_validation(make_user, exercise_id, make_exercise):
    user = make_user()
    other = make_user()
    private_exercise = make_exercise("Secret Move", verified=False, user_id=other.id)

    def create(**overrides):
        return user.client.post("/v1/workouts", json=workout_payload(exercise_id, **overrides))

    assert create(date="2024-06-01T18:30:00").status_code == 422  # without timezone
    assert create(name="   ").status_code == 422
    assert create(duration=1441).status_code == 422
    assert create(exercises=[
        {"exercise_id": exercise_id, "unilateral": False, "index": 1, "reps": [1], "weights": [1]}
    ]).status_code == 422
    assert create(exercises=[
        {"exercise_id": exercise_id, "unilateral": False, "index": 0, "reps": [1, 2], "weights": [1]}
    ]).status_code == 400
    assert create(exercises=[
        {"exercise_id": exercise_id, "unilateral": False, "index": 0, "reps": [1], "weights": [1], "time": [30]}
    ]).status_code == 400
    # Unverified exercises of other users can't be used
    assert create(exercises=[
        {"exercise_id": private_exercise, "unilateral": False, "index": 0, "reps": [1], "weights": [1]}
    ]).status_code == 404


def test_workouts_of_other_users_are_not_found(make_user, exercise_id):
    alice, bob = make_user(), make_user()
    workout = create_workout(alice, exercise_id)
    workout_exercise_id = workout["exercises"][0]["id"]

    assert bob.client.patch(f"/v1/workouts/{workout['id']}", json={"name": "Mine"}).status_code == 404
    assert bob.client.delete(f"/v1/workouts/{workout['id']}").status_code == 404
    assert patch_workout(bob, workout["id"], update_op(workout_exercise_id, reps=[1, 1])).status_code == 404
    assert bob.client.delete(f"/v1/workout-exercises/{workout_exercise_id}").status_code == 404
    assert patch_workout(bob, workout["id"], create_op(exercise_id, 0)).status_code == 404
    # Not through a workout of their own either
    bobs_workout = create_workout(bob, exercise_id)
    assert patch_workout(bob, bobs_workout["id"], update_op(workout_exercise_id, reps=[1, 1])).status_code == 404
    assert alice.client.get("/v1/workouts").json()["workouts"][0]["name"] == "Push Day"


def test_deleted_workout_cannot_be_changed(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    user.client.delete(f"/v1/workouts/{workout['id']}")

    assert user.client.patch(f"/v1/workouts/{workout['id']}", json={"name": "x"}).status_code == 404
    assert user.client.delete(f"/v1/workouts/{workout['id']}").status_code == 404


def test_update_workout(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)

    response = user.client.patch(f"/v1/workouts/{workout['id']}", json={"in_progress": True, "duration": 75})
    null_name = user.client.patch(f"/v1/workouts/{workout['id']}", json={"name": None})

    assert response.status_code == 200
    assert response.json()["in_progress"] is True and response.json()["duration"] == 75
    assert response.json()["name"] == "Push Day"
    assert null_name.status_code == 422


def _indexes(user) -> list[tuple[int, int]]:
    workout = user.client.get("/v1/workouts").json()["workouts"][0]
    return sorted((ex["index"], ex["id"]) for ex in workout["exercises"])


def test_insert_move_and_delete_workout_exercises_keep_order(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    first = workout["exercises"][0]["id"]

    def insert(index):
        client_uuid = new_uuid()
        response = patch_workout(user, workout["id"], create_op(
            exercise_id, index, unilateral=True, reps=[5], weights=[20], client_uuid=client_uuid
        ))
        assert response.status_code == 200, response.text
        return exercise_by(response.json(), client_uuid=client_uuid)["id"]

    second = insert(0)      # second, first
    third = insert(2)       # second, first, third
    assert _indexes(user) == [(0, second), (1, first), (2, third)]

    assert patch_workout(user, workout["id"], create_op(exercise_id, 5)).status_code == 400

    moved = patch_workout(user, workout["id"], update_op(third, index=0))
    assert moved.status_code == 200
    assert _indexes(user) == [(0, third), (1, second), (2, first)]
    # The response contains the whole workout, ordered by index
    assert [ex["id"] for ex in moved.json()["exercises"]] == [third, second, first]
    assert patch_workout(user, workout["id"], update_op(third, index=3)).status_code == 400

    assert user.client.delete(f"/v1/workout-exercises/{second}").status_code == 204
    assert _indexes(user) == [(0, third), (1, first)]
    assert user.client.delete(f"/v1/workout-exercises/{second}").status_code == 404


def test_update_workout_exercise_sets_must_fit_the_exercise(make_user, exercise_id, make_exercise):
    user = make_user()
    workout = create_workout(user, exercise_id)
    workout_exercise_id = workout["exercises"][0]["id"]
    run = make_exercise("Run", reps=False, weights=False, time=True, distance=True)

    uneven = patch_workout(user, workout["id"], update_op(workout_exercise_id, reps=[1, 2, 3]))
    switched_without_sets = patch_workout(user, workout["id"], update_op(workout_exercise_id, exercise_id=run))
    switched = patch_workout(
        user, workout["id"], update_op(workout_exercise_id, exercise_id=run, reps=None, weights=None, time=[600], distance=[2000])
    )

    assert uneven.status_code == 400
    # The old reps and weights don't fit the new exercise
    assert switched_without_sets.status_code == 400
    assert switched.status_code == 200
    body = exercise_by(switched.json(), id=workout_exercise_id)
    assert body["reps"] is None and body["weights"] is None
    assert body["time"] == [600] and body["distance"] == [2000.0]


def test_exercise_changes_are_applied_in_order_after_the_workout_fields(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    first = workout["exercises"][0]["id"]
    a, b = new_uuid(), new_uuid()

    response = patch_workout(
        user, workout["id"],
        create_op(exercise_id, 1, client_uuid=a, reps=[1], weights=[1]),     # first, a
        create_op(exercise_id, 0, client_uuid=b, reps=[2], weights=[2]),     # b, first, a
        update_op(first, index=2, reps=[3, 3]),                              # b, a, first
        name="Pull Day",
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Pull Day"
    created_a, created_b = exercise_by(body, client_uuid=a), exercise_by(body, client_uuid=b)
    assert [ex["id"] for ex in body["exercises"]] == [created_b["id"], created_a["id"], first]
    assert [ex["index"] for ex in body["exercises"]] == [0, 1, 2]
    assert exercise_by(body, id=first)["reps"] == [3, 3]
    assert _indexes(user) == [(0, created_b["id"]), (1, created_a["id"]), (2, first)]


def test_exercise_changes_are_atomic(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    first = workout["exercises"][0]["id"]

    response = patch_workout(
        user, workout["id"],
        create_op(exercise_id, 0, client_uuid=new_uuid(), reps=[1], weights=[1]),
        update_op(first, reps=[5, 5]),
        update_op(first, index=7),
        name="Pull Day",
    )

    assert response.status_code == 400
    # Neither the workout fields nor the earlier changes were kept
    stored = user.client.get("/v1/workouts").json()["workouts"][0]
    assert stored["name"] == "Push Day"
    assert [(ex["id"], ex["index"], ex["reps"]) for ex in stored["exercises"]] == [(first, 0, [10, 8])]


def test_exercise_change_of_another_workout_is_not_found(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    other = create_workout(user, exercise_id)

    response = patch_workout(user, workout["id"], update_op(other["exercises"][0]["id"], reps=[1, 1]), name="Changed")

    assert response.status_code == 404
    assert response.json()["error"] == "WorkoutExerciseNotFoundError"
    workouts = user.client.get("/v1/workouts").json()["workouts"]
    assert all(w["name"] == "Push Day" and w["exercises"][0]["reps"] == [10, 8] for w in workouts)


def test_create_exercise_change_with_client_uuid_is_idempotent(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    client_uuid = new_uuid()
    change = create_op(exercise_id, 0, client_uuid=client_uuid, reps=[1], weights=[1])

    # Twice in the same request
    first = patch_workout(user, workout["id"], change, change)
    assert first.status_code == 200, first.text
    created = exercise_by(first.json(), client_uuid=client_uuid)
    assert len(first.json()["exercises"]) == 2

    # And again as a retry of the whole request, with another index: the existing exercise is left as it is
    retry = patch_workout(user, workout["id"], {**change, "index": 1})
    assert retry.status_code == 200
    assert retry.json()["exercises"] == first.json()["exercises"]
    assert exercise_by(retry.json(), client_uuid=client_uuid) == created


def test_exercise_changes_validation(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    first = workout["exercises"][0]["id"]

    assert patch_workout(user, workout["id"], {"op": "delete", "id": first}).status_code == 422
    assert patch_workout(user, workout["id"], {"id": first, "reps": [1, 1]}).status_code == 422
    assert patch_workout(user, workout["id"], update_op(first, index=None)).status_code == 422
    # Without changes only the workout fields are applied
    assert patch_workout(user, workout["id"]).status_code == 200


def test_delta_reports_created_updated_and_deleted_workouts(make_user, exercise_id):
    user = make_user()
    since = sync_time(user)

    workout = create_workout(user, exercise_id)
    created = delta(user, since)
    assert [(u["id"], u["action"]) for u in created["updates"]] == [(workout["id"], 0)]
    assert created["updates"][0]["exercises"][0]["reps"] == [10, 8]

    user.client.patch(f"/v1/workouts/{workout['id']}", json={"name": "Pull Day"})
    updated = delta(user, created["sync_time"])
    assert [(u["id"], u["action"], u["name"]) for u in updated["updates"]] == [(workout["id"], 1, "Pull Day")]

    user.client.delete(f"/v1/workouts/{workout['id']}")
    deleted = delta(user, updated["sync_time"])
    assert len(deleted["updates"]) == 1
    deletion = deleted["updates"][0]
    assert (deletion["id"], deletion["action"]) == (workout["id"], 2)
    assert deletion["name"] is None and deletion["date"] is None and deletion["exercises"] == []

    assert delta(user, deleted["sync_time"])["updates"] == []


def test_delta_reports_changes_of_workout_exercises_as_update(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    since = sync_time(user)

    patch_workout(user, workout["id"], update_op(workout["exercises"][0]["id"], reps=[12, 12]))
    body = delta(user, since)

    assert [(u["id"], u["action"]) for u in body["updates"]] == [(workout["id"], 1)]
    assert body["updates"][0]["exercises"][0]["reps"] == [12, 12]


def test_delta_reports_deletion_of_workout_created_since_last_sync(make_user, exercise_id):
    user = make_user()
    since = sync_time(user)

    workout = create_workout(user, exercise_id)
    user.client.delete(f"/v1/workouts/{workout['id']}")

    assert [(u["id"], u["action"]) for u in delta(user, since)["updates"]] == [(workout["id"], 2)]


def test_delta_skips_deletions_before_last_sync(make_user, exercise_id):
    user = make_user()
    workout = create_workout(user, exercise_id)
    user.client.delete(f"/v1/workouts/{workout['id']}")
    since = sync_time(user)
    # An update after the deletion (e.g. by the admin) doesn't bring the workout back
    run_sql("UPDATE workout SET updated_at = now() WHERE id = :id", id=workout["id"])

    assert delta(user, since)["updates"] == []


def test_delta_only_contains_own_workouts(make_user, exercise_id):
    alice, bob = make_user(), make_user()
    since = sync_time(bob)

    create_workout(alice, exercise_id)

    assert delta(bob, since)["updates"] == []


def test_delta_rejects_expired_sync_time(make_user):
    user = make_user()
    old = (datetime.now(UTC) - timedelta(days=29)).isoformat()

    response = user.client.get("/v1/workouts/delta", params={"last_sync_time": old})

    assert response.status_code == 400
    assert response.json()["error"] == "SyncTimeExpiredError"


def test_sync_time_waits_for_running_transactions(make_user, exercise_id, db):
    """
    A transaction that started before the sync time was taken can commit rows with an older timestamp later,
    so the sync time is the start of the oldest running transaction.
    """
    from sqlalchemy import text

    user = make_user()
    started = db.execute(text("SELECT now()")).scalar_one()  # opens a transaction

    sync = datetime.fromisoformat(sync_time(user))

    assert sync <= started
    db.rollback()
    assert datetime.fromisoformat(sync_time(user)) > started
