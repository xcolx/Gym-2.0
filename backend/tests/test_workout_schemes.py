from conftest import new_uuid


def create_scheme(user, exercise_ids, **overrides):
    return user.client.post("/v1/workout-schemes", json={
        "name": "Push Day",
        "exercises": [{"exercise_id": e, "index": i} for i, e in enumerate(exercise_ids)],
        **overrides,
    })


def test_scheme_lifecycle_and_delta(make_user, make_exercise):
    user = make_user()
    bench, squat = make_exercise("Bench"), make_exercise("Squat")
    since = user.client.get("/v1/workout-schemes").json()["sync_time"]

    created = create_scheme(user, [bench, squat], client_uuid=new_uuid())
    assert created.status_code == 201, created.text
    scheme = created.json()
    assert [(e["exercise_id"], e["index"]) for e in scheme["exercises"]] == [(bench, 0), (squat, 1)]

    first = user.client.get("/v1/workout-schemes/delta", params={"last_sync_time": since}).json()
    assert [(u["id"], u["action"]) for u in first["updates"]] == [(scheme["id"], 0)]

    updated = user.client.patch(f"/v1/workout-schemes/{scheme['id']}", json={
        "name": "Leg Day", "exercises": [{"exercise_id": squat, "index": 0}]
    })
    performed = user.client.post(f"/v1/workout-schemes/{scheme['id']}/performances")
    assert updated.status_code == performed.status_code == 200
    assert updated.json()["name"] == "Leg Day"
    assert performed.json()["last_performed"] is not None

    second = user.client.get("/v1/workout-schemes/delta", params={"last_sync_time": first["sync_time"]}).json()
    assert [(u["id"], u["action"]) for u in second["updates"]] == [(scheme["id"], 1)]

    assert user.client.delete(f"/v1/workout-schemes/{scheme['id']}").status_code == 204
    third = user.client.get("/v1/workout-schemes/delta", params={"last_sync_time": second["sync_time"]}).json()
    assert [(u["id"], u["action"]) for u in third["updates"]] == [(scheme["id"], 2)]
    assert user.client.get("/v1/workout-schemes").json()["schemes"] == []


def test_scheme_with_client_uuid_is_idempotent(make_user, make_exercise):
    user = make_user()
    bench = make_exercise()
    client_uuid = new_uuid()

    first = create_scheme(user, [bench], client_uuid=client_uuid).json()
    retry = create_scheme(user, [bench], client_uuid=client_uuid).json()

    assert first["id"] == retry["id"]


def test_scheme_validation_and_ownership(make_user, make_exercise):
    alice, bob = make_user(), make_user()
    bench = make_exercise()
    scheme = create_scheme(alice, [bench]).json()

    assert alice.client.post("/v1/workout-schemes", json={
        "name": "Bad", "exercises": [{"exercise_id": bench, "index": 1}]
    }).status_code == 422
    assert create_scheme(alice, [9999]).status_code == 404
    assert bob.client.patch(f"/v1/workout-schemes/{scheme['id']}", json={"name": "Mine"}).status_code == 404
    assert bob.client.post(f"/v1/workout-schemes/{scheme['id']}/performances").status_code == 404
    assert bob.client.delete(f"/v1/workout-schemes/{scheme['id']}").status_code == 404
    assert bob.client.get("/v1/workout-schemes").json()["schemes"] == []


def test_exercise_in_scheme_cannot_be_deleted(make_user, catalog, make_exercise):
    user = make_user()
    own = make_exercise("Own", verified=False, user_id=user.id)
    create_scheme(user, [own])

    assert user.client.delete(f"/v1/exercises/{own}").status_code == 409
