import pytest
from conftest import make_friends, run_sql

import app.db.queries.takeout as takeout_crud
from app.core import content_filter
from app.core.errors import ObjectionableContentError
from app.db.session import SessionLocal


@pytest.mark.parametrize("message", [
    "you are a whore",
    "send nudes",
    "SEND   NUDES!!",
    "kys",
    "Kill Yourself",
    "n1gg3r",
    "whoooore",
    "sieg heil",
    "porno",
    "du Hurensohn",
])
def test_messages_with_objectionable_words_are_rejected(message):
    assert content_filter.contains_objectionable_words(message)
    with pytest.raises(ObjectionableContentError):
        content_filter.check_message(message)


@pytest.mark.parametrize("message", [
    "Leg day was great",
    "fuck this is heavy",          # ordinary swearing is fine between friends
    "that set was shit",
    "my therapist says rest more",
    "grapes after the workout",
    "spicy food",
    "peacock",
    "Scunthorpe",
    "",
])
def test_ordinary_messages_are_allowed(message):
    assert not content_filter.contains_objectionable_words(message)
    content_filter.check_message(message)


@pytest.mark.parametrize("username", [
    "fuckface",
    "xX_n1gger_Xx",
    "fuuuuck",
    "big_cock",
    "dick69",
    "ass.man",
    "shithead",
    "Hitler88",
])
def test_objectionable_usernames_are_rejected(username):
    assert content_filter.is_objectionable_username(username)
    with pytest.raises(ObjectionableContentError):
        content_filter.check_username(username)


@pytest.mark.parametrize("username", [
    "hancock",
    "therapist",
    "analysis",
    "grape_lover",
    "passion.fruit",
    "class_act",
    "marggus",
    "fit_guy123",
])
def test_harmless_usernames_are_allowed(username):
    assert not content_filter.is_objectionable_username(username)
    content_filter.check_username(username)


@pytest.mark.parametrize("name, objectionable", [
    ("Glass Hole", False),          # the end and start of two words don't match
    ("Heil Hitler", True),          # phrases are matched across words
    ("Shit Lifters", True),
    ("Morning Crew", False),
    ("Bench Bros", False),
])
def test_group_names(name, objectionable):
    assert content_filter.is_objectionable_group_name(name) is objectionable
    if objectionable:
        with pytest.raises(ObjectionableContentError):
            content_filter.check_group_name(name)
    else:
        content_filter.check_group_name(name)


def _direct_chat(make_user):
    alice, bob = make_user("alice"), make_user("bob")
    make_friends(alice, bob)
    response = alice.client.post("/v1/chats", json={"user_id": bob.id})
    assert response.status_code == 201, response.text
    return alice, response.json()["id"]


def test_rejected_message_is_reported_with_an_unchanged_response(make_user):
    alice, chat_id = _direct_chat(make_user)

    response = alice.client.post(f"/v1/chats/{chat_id}/messages", data={"content": "send nudes"})

    assert response.status_code == 400, response.text
    assert response.json()["error"] == "ObjectionableContentError"
    assert response.json()["detail"] == (
        "Your message contains words that aren't allowed. See the Terms of Use at gym2.app/tos."
    )
    assert run_sql("SELECT count(*) FROM message")[0][0] == 0
    [report] = [row._asdict() for row in run_sql("SELECT * FROM report")]
    assert report["reason"] == f"{content_filter.REJECTED_MESSAGE_REASON} to chat {chat_id}"
    assert (report["reporter_id"], report["uploader_id"]) == (None, alice.id)
    assert (report["user_name"], report["message_text"]) == ("alice", "send nudes")
    assert (report["reported_user_id"], report["reported_chat_id"], report["reported_message_id"]) == (None, None, None)


def test_allowed_message_is_not_reported(make_user):
    alice, chat_id = _direct_chat(make_user)

    assert alice.client.post(f"/v1/chats/{chat_id}/messages", data={"content": "leg day?"}).status_code == 201
    assert run_sql("SELECT count(*) FROM report")[0][0] == 0


def test_report_of_a_rejected_message_is_not_in_the_takeout_image_reports(make_user):
    alice, chat_id = _direct_chat(make_user)
    alice.client.post(f"/v1/chats/{chat_id}/messages", data={"content": "kys"})

    with SessionLocal() as db:
        assert takeout_crud.get_nudenet_reports(db, alice.id) == []
