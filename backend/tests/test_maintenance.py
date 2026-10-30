from conftest import run_sql, signup

from app.services import maintenance_service


def prune(db) -> dict[str, int]:
    removed, _ = maintenance_service.remove_old_data(db)
    db.commit()
    return removed


def test_prune_removes_accounts_deleted_longer_than_30_days_ago(make_user, make_exercise, db):
    old, recent = make_user(), make_user()
    exercise_id = make_exercise()
    for user in (old, recent):
        user.client.post("/v1/workouts", json={
            "name": "W", "date": "2024-06-01T18:30:00Z", "duration": 10, "in_progress": False,
            "exercises": [{"exercise_id": exercise_id, "unilateral": False, "index": 0, "reps": [1], "weights": [1]}]
        })
        user.client.request("DELETE", "/v1/users/me", json={"password": user.password})
    run_sql('UPDATE "user" SET deleted_at = now() - interval \'31 days\' WHERE id = :id', id=old.id)

    removed = prune(db)

    assert removed["users"] == 1
    assert [row[0] for row in run_sql('SELECT id FROM "user"')] == [recent.id]
    assert run_sql("SELECT count(*) FROM workout WHERE user_id = :id", id=old.id)[0][0] == 0
    assert run_sql("SELECT count(*) FROM workout WHERE user_id = :id", id=recent.id)[0][0] == 1
    # Verified exercises stay
    assert run_sql("SELECT count(*) FROM exercise")[0][0] == 1


def test_prune_removes_stale_unverified_accounts(client, make_user, db):
    signup(client, "stale", "stale@tests.gym2.app")
    signup(client, "fresh", "fresh@tests.gym2.app")
    run_sql('UPDATE "user" SET created_at = now() - interval \'4 days\' WHERE user_name = \'stale\'')

    removed = prune(db)

    assert removed["unverified accounts"] == 1
    assert [row[0] for row in run_sql('SELECT user_name FROM "user"')] == ["fresh"]


def test_prune_removes_old_deleted_messages_and_expired_sessions(make_user, db):
    alice, bob = make_user(), make_user()
    alice.client.post(f"/v1/users/me/friend-requests/{bob.id}")
    bob.client.patch(f"/v1/users/me/friend-requests/{alice.id}", json={"status": True})
    chat = alice.client.post("/v1/chats", json={"user_id": bob.id}).json()
    message = alice.client.post(f"/v1/chats/{chat['id']}/messages", data={"content": "bye"}).json()
    alice.client.delete(f"/v1/chats/messages/{message['id']}")
    run_sql("UPDATE message SET deleted_at = now() - interval '31 days'")
    run_sql("UPDATE session SET created_at = now() - interval '800 days' WHERE user_id = :id", id=bob.id)

    prune(db)

    assert run_sql("SELECT count(*) FROM message")[0][0] == 0
    assert run_sql("SELECT user_id FROM session") == [(alice.id,)]
