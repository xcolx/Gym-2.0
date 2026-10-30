import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast

import pytest
from conftest import image_file_exists, make_friends, png_bytes, run_sql
from starlette.requests import Request

from app.admin.views import ReportAdmin
from app.db.session import SessionLocal
from app.services import maintenance_service


def report(user, **target):
    return user.client.post("/v1/reports", json={"reason": "Not okay.", **target})


def report_row(report_id: int) -> dict:
    rows = run_sql("SELECT * FROM report WHERE id = :id", id=report_id)
    assert rows, f"Report {report_id} is missing"
    return rows[0]._asdict()


def upload_profile_image(user) -> str:
    response = user.client.put("/v1/users/me/profile-image", files={"file": ("me.png", png_bytes(), "image/png")})
    assert response.status_code == 200, response.text
    return response.json()["image_url"]


def direct_chat(a, b) -> int:
    response = a.client.post("/v1/chats", json={"user_id": b.id})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def send_photo(user, chat_id, content="Look at this") -> dict:
    response = user.client.post(
        f"/v1/chats/{chat_id}/messages", data={"content": content}, files={"image": ("photo.png", png_bytes(), "image/png")}
    )
    assert response.status_code == 201, response.text
    return response.json()


def prune() -> None:
    with SessionLocal() as session:
        maintenance_service.remove_old_data(session)
        session.commit()


def make_deleted_long_ago(table: str, row_id: int) -> None:
    run_sql(f'UPDATE "{table}" SET deleted_at = :at WHERE id = :id',
            at=datetime.now(UTC) - timedelta(days=31), id=row_id)


@pytest.fixture
def alice_and_bob(make_user):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    return alice, bob


def test_report_of_user_copies_username_and_profile_image(alice_and_bob):
    alice, bob = alice_and_bob
    profile_image = upload_profile_image(bob)

    response = report(alice, reported_user_id=bob.id)

    assert response.status_code == 201, response.text
    row = report_row(response.json()["id"])
    assert row["user_name"] == "bob"
    assert row["profile_image"] not in (None, profile_image)
    assert image_file_exists(row["profile_image"])
    assert row["chat_name"] is row["message_text"] is row["message_image"] is None


def test_report_of_group_copies_name_and_image(alice_and_bob):
    alice, bob = alice_and_bob
    response = bob.client.post(
        "/v1/chats/groups", data={"name": "Gym Crew", "user_ids": [alice.id]},
        files={"image": ("group.png", png_bytes(), "image/png")}
    )
    group = response.json()

    row = report_row(report(alice, reported_chat_id=group["id"]).json()["id"])

    assert row["chat_name"] == "Gym Crew"
    assert row["chat_image"] not in (None, group["image_url"])
    assert image_file_exists(row["chat_image"])


def test_report_of_message_keeps_its_copy_after_the_sender_deletes_it(alice_and_bob):
    alice, bob = alice_and_bob
    message = send_photo(bob, direct_chat(alice, bob), content="Harassing text")
    report_id = report(alice, reported_message_id=message["id"]).json()["id"]

    assert bob.client.delete(f"/v1/chats/messages/{message['id']}").status_code == 204

    row = report_row(report_id)
    assert (row["message_text"], row["user_name"]) == ("Harassing text", "bob")
    assert row["message_image"] != message["image_url"]
    assert image_file_exists(row["message_image"])
    assert not image_file_exists(message["image_url"])


def test_report_without_profile_image_has_no_image_copy(alice_and_bob):
    alice, bob = alice_and_bob

    row = report_row(report(alice, reported_user_id=bob.id).json()["id"])

    assert row["user_name"] == "bob" and row["profile_image"] is None


def test_reported_message_id_has_the_type_of_message_ids():
    rows = run_sql(
        "SELECT table_name, data_type FROM information_schema.columns "
        "WHERE (table_name, column_name) IN (('report', 'reported_message_id'), ('message', 'id'))"
    )
    assert {data_type for _, data_type in rows} == {"bigint"}


def test_report_stays_when_the_reported_message_is_removed_for_good(alice_and_bob):
    alice, bob = alice_and_bob
    message = send_photo(bob, direct_chat(alice, bob))
    report_id = report(alice, reported_message_id=message["id"]).json()["id"]
    bob.client.delete(f"/v1/chats/messages/{message['id']}")
    make_deleted_long_ago("message", message["id"])

    prune()

    assert run_sql("SELECT count(*) FROM message")[0][0] == 0
    row = report_row(report_id)
    assert row["reported_message_id"] is None
    assert image_file_exists(row["message_image"])


def test_report_stays_when_the_reported_account_is_removed_for_good(alice_and_bob):
    alice, bob = alice_and_bob
    upload_profile_image(bob)
    report_id = report(alice, reported_user_id=bob.id).json()["id"]
    assert bob.client.request("DELETE", "/v1/users/me", json={"password": bob.password}).status_code == 204
    make_deleted_long_ago("user", bob.id)

    prune()

    row = report_row(report_id)
    assert row["reported_user_id"] is None
    assert row["user_name"] == "bob" and image_file_exists(row["profile_image"])


def test_reports_of_a_removed_reporter_go_with_their_image_copies(alice_and_bob):
    alice, bob = alice_and_bob
    upload_profile_image(bob)
    copy = report_row(report(alice, reported_user_id=bob.id).json()["id"])["profile_image"]
    alice.client.request("DELETE", "/v1/users/me", json={"password": alice.password})
    make_deleted_long_ago("user", alice.id)

    prune()

    assert run_sql("SELECT count(*) FROM report")[0][0] == 0
    assert not image_file_exists(copy)


def test_deleting_a_report_in_the_admin_removes_its_image_copies(alice_and_bob):
    alice, bob = alice_and_bob
    upload_profile_image(bob)
    report_id = report(alice, reported_user_id=bob.id).json()["id"]
    copy = report_row(report_id)["profile_image"]

    asyncio.run(ReportAdmin().delete_model(cast(Request, None), str(report_id)))

    assert not run_sql("SELECT id FROM report WHERE id = :id", id=report_id)
    assert not image_file_exists(copy)
