from datetime import UTC, datetime, timedelta

import pytest
from conftest import image_file_exists, make_friends, new_uuid, png_bytes, run_sql


def create_direct(a, b) -> dict:
    response = a.client.post("/v1/chats", json={"user_id": b.id})
    assert response.status_code == 201, response.text
    return response.json()


def create_group(creator, members, name="Gym Crew", public=False, image: bytes | None = None) -> dict:
    files = {"image": ("group.png", image, "image/png")} if image else None
    response = creator.client.post(
        "/v1/chats/groups",
        data={"name": name, "user_ids": [m.id for m in members], "public": str(public).lower()},
        files=files
    )
    assert response.status_code == 201, response.text
    return response.json()


def send(user, chat_id, content="Hello", **data):
    return user.client.post(f"/v1/chats/{chat_id}/messages", data={"content": content, **data})


def sync_time(user) -> str:
    response = user.client.get("/v1/chats")
    assert response.status_code == 200, response.text
    return response.json()["sync_time"]


def delta(user, since: str) -> dict:
    response = user.client.get("/v1/chats/delta", params={"last_sync_time": since})
    assert response.status_code == 200, response.text
    return response.json()


def chat_in(body: dict, chat_id: int) -> dict:
    chat = next((chat for chat in body["chats"] if chat["id"] == chat_id), None)
    assert chat is not None, f"Chat {chat_id} is missing"
    return chat


def admins(chat: dict) -> dict[int, bool | None]:
    return {m["user_id"]: m["admin"] for m in chat["members"]}


def set_admin(user, chat_id, member_id, admin: bool):
    return user.client.patch(f"/v1/chats/{chat_id}/members/{member_id}", json={"admin": admin})


@pytest.fixture
def friends(make_user):
    """alice, bob and carol, alice is friends with both"""
    alice, bob, carol = make_user("alice"), make_user("bob"), make_user("carol")
    make_friends(alice, bob)
    make_friends(alice, carol)
    return alice, bob, carol


def test_create_direct_chat(friends):
    alice, bob, _ = friends

    chat = create_direct(alice, bob)

    assert chat["group_chat"] is False
    assert chat["created_by"] == alice.id
    assert admins(chat) == {alice.id: None, bob.id: None}
    assert chat["messages"] == []


def test_existing_direct_chat_is_returned(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)

    response = bob.client.post("/v1/chats", json={"user_id": alice.id})

    assert response.status_code == 200
    assert response.json()["id"] == chat["id"]


def test_direct_chat_requires_friendship(friends):
    alice, bob, carol = friends

    assert bob.client.post("/v1/chats", json={"user_id": carol.id}).status_code == 403
    assert alice.client.post("/v1/chats", json={"user_id": alice.id}).status_code == 400
    assert alice.client.post("/v1/chats", json={"user_id": 9999}).status_code == 404


def test_messages_in_direct_chat_require_friendship(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    alice.client.delete(f"/v1/users/me/friends/{bob.id}")

    response = bob.client.post(f"/v1/chats/{chat['id']}/messages", data={"content": "still there?"})

    assert response.status_code == 403
    assert response.json()["detail"] == "You can only send messages to friends."


def test_block_prevents_messages_without_revealing_it(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    unfriended = create_direct(alice, friends[2])
    alice.client.put(f"/v1/users/me/blocked-users/{bob.id}")
    alice.client.delete(f"/v1/users/me/friends/{friends[2].id}")

    blocked = send(bob, chat["id"])
    not_friends = send(friends[2], unfriended["id"])

    assert blocked.status_code == not_friends.status_code == 403
    assert blocked.json() == not_friends.json()
    # The chat itself is kept
    assert chat_in(bob.client.get("/v1/chats").json(), chat["id"]) is not None


def test_delete_direct_chat_for_both_and_start_again_empty(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    send(alice, chat["id"])

    assert bob.client.delete(f"/v1/chats/{chat['id']}").status_code == 204

    assert alice.client.get("/v1/chats").json()["chats"] == []
    assert send(alice, chat["id"]).status_code == 404
    new_chat = create_direct(alice, bob)
    assert new_chat["id"] != chat["id"]
    assert chat_in(alice.client.get("/v1/chats").json(), new_chat["id"])["messages"] == []


def test_send_message_updates_latest_message(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)

    response = send(alice, chat["id"], "  Leg day?  ")

    assert response.status_code == 201
    message = response.json()
    assert message["sender_id"] == alice.id and message["chat_id"] == chat["id"]
    assert message["content"] == "  Leg day?  "
    stored = chat_in(bob.client.get("/v1/chats").json(), chat["id"])
    assert stored["latest_message_preview"] == "  Leg day?  "
    assert stored["latest_message_sender_id"] == alice.id
    assert [m["id"] for m in stored["messages"]] == [message["id"]]


def test_message_preview_is_cut_to_50_characters(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)

    send(alice, chat["id"], "x" * 80)

    assert chat_in(bob.client.get("/v1/chats").json(), chat["id"])["latest_message_preview"] == "x" * 50


def test_send_photo_message(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)

    response = alice.client.post(f"/v1/chats/{chat['id']}/messages", files={"image": ("p.png", png_bytes(), "image/png")})

    assert response.status_code == 201
    message = response.json()
    assert message["content"] is None
    assert image_file_exists(message["image_url"])
    assert chat_in(bob.client.get("/v1/chats").json(), chat["id"])["latest_message_preview"] == "📷 Photo"


def test_send_message_validation(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)

    assert send(alice, chat["id"], "   ").status_code == 400
    assert alice.client.post(f"/v1/chats/{chat['id']}/messages").status_code == 400
    rude = send(alice, chat["id"], "send nudes")
    assert rude.status_code == 400 and rude.json()["error"] == "ObjectionableContentError"
    assert send(alice, chat["id"], "x" * 10001).status_code == 422
    assert send(alice, 9999).status_code == 404


def test_only_members_can_send_and_mark_read(friends):
    alice, bob, carol = friends
    chat = create_direct(alice, bob)
    message = send(alice, chat["id"]).json()

    assert send(carol, chat["id"]).status_code == 403
    assert carol.client.put(f"/v1/chats/{chat['id']}/read-marker", json={"message_id": message["id"]}).status_code == 403


def test_send_message_with_client_uuid_is_idempotent(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    client_uuid = new_uuid()

    first = send(alice, chat["id"], "once", client_uuid=client_uuid)
    retry = send(alice, chat["id"], "once", client_uuid=client_uuid)

    assert first.status_code == retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]
    assert len(chat_in(alice.client.get("/v1/chats").json(), chat["id"])["messages"]) == 1


def test_delete_message(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    first = send(alice, chat["id"], "first").json()
    second = send(alice, chat["id"], "second").json()

    assert bob.client.delete(f"/v1/chats/messages/{second['id']}").status_code == 403
    assert alice.client.delete(f"/v1/chats/messages/{second['id']}").status_code == 204
    assert alice.client.delete(f"/v1/chats/messages/{second['id']}").status_code == 404

    stored = chat_in(bob.client.get("/v1/chats").json(), chat["id"])
    assert [m["id"] for m in stored["messages"]] == [first["id"]]
    # The latest message goes back to the previous one
    assert stored["latest_message_preview"] == "first"
    assert run_sql("SELECT content FROM message WHERE id = :id", id=second["id"])[0][0] == ""


def test_admins_delete_messages_of_others_in_groups(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])
    photo = bob.client.post(f"/v1/chats/{group['id']}/messages", files={"image": ("p.png", png_bytes(), "image/png")}).json()
    text = send(carol, group["id"], "spam").json()

    assert carol.client.delete(f"/v1/chats/messages/{photo['id']}").status_code == 403
    assert alice.client.delete(f"/v1/chats/messages/{photo['id']}").status_code == 204
    set_admin(alice, group["id"], bob.id, True)
    assert bob.client.delete(f"/v1/chats/messages/{text['id']}").status_code == 204

    assert chat_in(carol.client.get("/v1/chats").json(), group["id"])["messages"] == []
    assert not image_file_exists(photo["image_url"])


def test_admins_report_a_message_before_deleting_it(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])
    message = bob.client.post(
        f"/v1/chats/{group['id']}/messages", data={"content": "spam"}, files={"image": ("p.png", png_bytes(), "image/png")}
    ).json()

    reported = alice.client.post("/v1/reports", json={"reported_message_id": message["id"], "reason": "Spam"})
    deleted = alice.client.delete(f"/v1/chats/messages/{message['id']}")

    assert reported.status_code == 201, reported.text
    assert deleted.status_code == 204
    # The report keeps its copy of the text and photo
    text, image = run_sql("SELECT message_text, message_image FROM report WHERE id = :id", id=reported.json()["id"])[0]
    assert text == "spam" and image_file_exists(image)
    assert not image_file_exists(message["image_url"])


def test_deleting_the_only_message_clears_latest_message(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    message = send(alice, chat["id"]).json()

    alice.client.delete(f"/v1/chats/messages/{message['id']}")

    stored = chat_in(alice.client.get("/v1/chats").json(), chat["id"])
    assert stored["latest_message_preview"] is None
    assert stored["latest_message_timestamp"] is None
    assert stored["latest_message_sender_id"] is None


def test_deleting_a_photo_message_removes_the_file(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    message = alice.client.post(f"/v1/chats/{chat['id']}/messages", files={"image": ("p.png", png_bytes(), "image/png")}).json()

    alice.client.delete(f"/v1/chats/messages/{message['id']}")

    assert not image_file_exists(message["image_url"])


def test_mark_read_only_moves_forward(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    first = send(alice, chat["id"], "first").json()
    second = send(alice, chat["id"], "second").json()

    assert bob.client.put(f"/v1/chats/{chat['id']}/read-marker", json={"message_id": second["id"]}).status_code == 204
    assert bob.client.put(f"/v1/chats/{chat['id']}/read-marker", json={"message_id": first["id"]}).status_code == 204
    assert bob.client.put(f"/v1/chats/{chat['id']}/read-marker", json={"message_id": 999999}).status_code == 404

    members = chat_in(alice.client.get("/v1/chats").json(), chat["id"])["members"]
    assert {m["user_id"]: m["last_read_message_id"] for m in members}[bob.id] == second["id"]


def test_delta_contains_only_messages_since_last_sync(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    send(alice, chat["id"], "old")
    since = sync_time(bob)

    new = send(alice, chat["id"], "new").json()
    body = delta(bob, since)

    assert [m["id"] for m in chat_in(body, chat["id"])["messages"]] == [new["id"]]
    assert body["sync_time"] > since


def test_delta_with_its_own_sync_time_is_empty(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    since = sync_time(bob)
    send(alice, chat["id"])

    first = delta(bob, since)
    second = delta(bob, first["sync_time"])

    assert chat_in(first, chat["id"]) is not None
    assert second["chats"] == []
    # The read states of all chats are always included
    assert [state["chat_id"] for state in second["read_states"]] == [chat["id"]]


def test_delta_contains_newly_created_chats(friends):
    alice, bob, _ = friends
    since = sync_time(bob)

    chat = create_direct(alice, bob)

    assert chat_in(delta(bob, since), chat["id"]) is not None


def test_delta_delivers_deleted_messages_without_their_content(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    message = send(alice, chat["id"], "oops").json()
    since = sync_time(bob)

    alice.client.delete(f"/v1/chats/messages/{message['id']}")
    delivered = chat_in(delta(bob, since), chat["id"])

    assert len(delivered["messages"]) == 1
    deleted = delivered["messages"][0]
    assert deleted["id"] == message["id"]
    assert deleted["deleted_at"] is not None
    assert deleted["content"] is None and deleted["image_url"] is None


def test_delta_for_chat_joined_since_last_sync_contains_all_messages(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob])
    first = send(alice, group["id"], "before carol").json()
    since = sync_time(carol)

    response = alice.client.post(f"/v1/chats/{group['id']}/members", json={"user_ids": [carol.id]})
    second = send(bob, group["id"], "welcome").json()

    assert response.status_code == 200
    delivered = chat_in(delta(carol, since), group["id"])
    assert [m["id"] for m in delivered["messages"]] == [first["id"], second["id"]]


def test_delta_contains_renamed_chats_and_new_images(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])
    since = sync_time(bob)

    renamed = alice.client.patch(f"/v1/chats/{group['id']}", data={"name": "Night Owls"})
    after_rename = delta(bob, since)
    image = alice.client.patch(
        f"/v1/chats/{group['id']}", files={"image": ("g.png", png_bytes(), "image/png")}
    )
    after_image = delta(bob, after_rename["sync_time"])

    assert renamed.status_code == image.status_code == 200
    assert chat_in(after_rename, group["id"])["name"] == "Night Owls"
    assert chat_in(after_image, group["id"])["image_url"] == image.json()["image_url"]


def test_only_admins_change_name_and_image(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob], image=png_bytes())

    assert bob.client.patch(f"/v1/chats/{group['id']}", data={"name": "Mine"}).status_code == 403
    assert bob.client.patch(
        f"/v1/chats/{group['id']}", files={"image": ("g.png", png_bytes(), "image/png")}
    ).status_code == 403
    assert bob.client.delete(f"/v1/chats/{group['id']}/image").status_code == 403
    assert image_file_exists(group["image_url"])
    set_admin(alice, group["id"], bob.id, True)

    assert bob.client.patch(f"/v1/chats/{group['id']}", data={"name": "Mine"}).json()["name"] == "Mine"


def test_delta_drops_deleted_chats(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    since = sync_time(bob)

    alice.client.delete(f"/v1/chats/{chat['id']}")
    body = delta(bob, since)

    assert body["chats"] == []
    assert body["read_states"] == []


def test_delta_never_contains_chats_of_others(friends):
    alice, bob, carol = friends
    since = sync_time(carol)
    chat = create_direct(alice, bob)
    send(alice, chat["id"])

    body = delta(carol, since)

    assert body["chats"] == [] and body["read_states"] == []


def test_delta_rejects_sync_times_older_than_28_days(friends):
    alice = friends[0]
    old = (datetime.now(UTC) - timedelta(days=29)).isoformat()
    recent = (datetime.now(UTC) - timedelta(days=27)).isoformat()

    response = alice.client.get("/v1/chats/delta", params={"last_sync_time": old})

    assert response.status_code == 400
    assert response.json()["error"] == "SyncTimeExpiredError"
    assert alice.client.get("/v1/chats/delta", params={"last_sync_time": recent}).status_code == 200


def test_delta_treats_sync_time_without_timezone_as_utc(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    naive = (datetime.now(UTC) - timedelta(minutes=5)).replace(tzinfo=None).isoformat()

    body = delta(bob, naive)

    assert chat_in(body, chat["id"]) is not None


def test_delta_requires_sync_time(friends):
    assert friends[0].client.get("/v1/chats/delta").status_code == 422


def test_create_group_chat(friends):
    alice, bob, carol = friends

    group = create_group(alice, [bob, carol, bob, alice], name="  Gym Crew  ")

    assert group["group_chat"] is True and group["public"] is False
    assert group["name"] == "Gym Crew"
    # The creator is the only admin
    assert admins(group) == {alice.id: True, bob.id: False, carol.id: False}


def test_group_chat_validation(friends):
    alice, bob, carol = friends

    def create(**data):
        return alice.client.post("/v1/chats/groups", data={"name": "Crew", **data})

    assert create().status_code == 400  # a private group needs another member
    assert create(public="true").status_code == 201
    assert create(name="   ", user_ids=[bob.id]).status_code == 400
    assert create(name="Heil Hitler", user_ids=[bob.id]).status_code == 400
    assert create(name="x" * 26, user_ids=[bob.id]).status_code == 422
    # Only friends can be added
    assert bob.client.post("/v1/chats/groups", data={"name": "Crew", "user_ids": [carol.id]}).status_code == 403


def test_add_members_only_adds_friends_and_skips_members(friends, make_user):
    alice, bob, carol = friends
    stranger = make_user()
    group = create_group(alice, [bob])

    added = alice.client.post(f"/v1/chats/{group['id']}/members", json={"user_ids": [bob.id, carol.id]})
    not_friend = alice.client.post(f"/v1/chats/{group['id']}/members", json={"user_ids": [stranger.id]})
    not_member = carol.client.post(f"/v1/chats/{create_group(alice, [bob])['id']}/members", json={"user_ids": [alice.id]})

    assert added.status_code == 200
    assert admins(added.json()) == {alice.id: True, bob.id: False, carol.id: False}
    assert not_friend.status_code == 403
    assert not_member.status_code == 403


def test_only_admins_add_members(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob])

    assert bob.client.post(f"/v1/chats/{group['id']}/members", json={"user_ids": [alice.id]}).status_code == 403
    set_admin(alice, group["id"], bob.id, True)
    make_friends(bob, carol)

    assert bob.client.post(f"/v1/chats/{group['id']}/members", json={"user_ids": [carol.id]}).status_code == 200


def test_only_admins_remove_members(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])

    assert bob.client.delete(f"/v1/chats/{group['id']}/members/{carol.id}").status_code == 403
    assert bob.client.delete(f"/v1/chats/{group['id']}/members/{alice.id}").status_code == 403
    assert alice.client.delete(f"/v1/chats/{group['id']}/members/{carol.id}").status_code == 204
    assert alice.client.delete(f"/v1/chats/{group['id']}/members/{carol.id}").status_code == 404
    assert carol.client.get("/v1/chats").json()["chats"] == []


def test_admins_can_remove_the_creator(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])
    set_admin(alice, group["id"], bob.id, True)

    assert bob.client.delete(f"/v1/chats/{group['id']}/members/{alice.id}").status_code == 204
    assert alice.client.get("/v1/chats").json()["chats"] == []


def test_admins_make_members_admins_and_remove_it(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])
    since = sync_time(carol)

    assert set_admin(bob, group["id"], carol.id, True).status_code == 403
    granted = set_admin(alice, group["id"], bob.id, True)
    # The other members receive it with the read states
    read_state = next(s for s in delta(carol, since)["read_states"] if s["chat_id"] == group["id"])
    revoked = set_admin(bob, group["id"], alice.id, False)

    assert granted.status_code == 200
    assert admins(granted.json()) == {alice.id: True, bob.id: True, carol.id: False}
    assert {m["user_id"]: m["admin"] for m in read_state["members"]} == {alice.id: True, bob.id: True, carol.id: False}
    assert revoked.status_code == 200
    assert admins(revoked.json()) == {alice.id: False, bob.id: True, carol.id: False}
    # Alice isn't an admin anymore
    assert set_admin(alice, group["id"], carol.id, True).status_code == 403


def test_last_admin_cannot_remove_their_admin_status(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])

    response = set_admin(alice, group["id"], alice.id, False)

    assert response.status_code == 400
    # Making an admin admin again changes nothing
    assert admins(set_admin(alice, group["id"], alice.id, True).json()) == {alice.id: True, bob.id: False}


def test_update_admin_validation(friends, make_user):
    alice, bob, carol = friends
    group = create_group(alice, [bob])
    direct = create_direct(alice, bob)

    assert set_admin(alice, group["id"], carol.id, True).status_code == 404
    assert set_admin(carol, group["id"], bob.id, True).status_code == 403
    assert set_admin(alice, direct["id"], bob.id, True).status_code == 400
    assert set_admin(alice, 9999, bob.id, True).status_code == 404
    assert alice.client.patch(f"/v1/chats/{group['id']}/members/{bob.id}", json={}).status_code == 422


def test_random_member_becomes_admin_when_the_last_admin_leaves(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])

    assert alice.client.delete(f"/v1/chats/{group['id']}/members/{alice.id}").status_code == 204

    remaining = admins(chat_in(bob.client.get("/v1/chats").json(), group["id"]))
    assert sorted(remaining) == sorted([bob.id, carol.id])
    assert set(remaining.values()) == {False, True}


def test_no_member_becomes_admin_while_an_admin_is_left(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])
    set_admin(alice, group["id"], bob.id, True)

    alice.client.delete(f"/v1/chats/{group['id']}/members/{alice.id}")

    assert admins(chat_in(bob.client.get("/v1/chats").json(), group["id"])) == {bob.id: True, carol.id: False}


def test_last_member_leaving_deletes_group(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])

    assert alice.client.delete(f"/v1/chats/{group['id']}/members/{alice.id}").status_code == 204
    assert run_sql("SELECT deleted_at FROM chat WHERE id = :id", id=group["id"])[0][0] is None
    assert bob.client.delete(f"/v1/chats/{group['id']}/members/{bob.id}").status_code == 204

    assert run_sql("SELECT deleted_at FROM chat WHERE id = :id", id=group["id"])[0][0] is not None


def test_only_admins_delete_group(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])

    assert bob.client.delete(f"/v1/chats/{group['id']}").status_code == 403
    set_admin(alice, group["id"], bob.id, True)
    assert bob.client.delete(f"/v1/chats/{group['id']}").status_code == 204
    assert bob.client.get("/v1/chats").json()["chats"] == []


def test_public_groups(friends, make_user):
    alice, bob, _ = friends
    outsider = make_user()
    public = create_group(alice, [], name="Open Gym", public=True)
    create_group(alice, [bob], name="Secret")
    send(alice, public["id"], "welcome all")

    listed = outsider.client.get("/v1/chats/public").json()
    joined = outsider.client.post(f"/v1/chats/{public['id']}/members/me")
    joined_again = outsider.client.post(f"/v1/chats/{public['id']}/members/me")

    assert [c["id"] for c in listed] == [public["id"]]
    assert listed[0]["messages"] == []
    assert joined.status_code == 201
    assert admins(joined.json())[outsider.id] is False
    assert [m["content"] for m in joined.json()["messages"]] == ["welcome all"]
    assert joined_again.status_code == 200
    # Members can't be added to or removed from a public group, but everyone can leave
    assert alice.client.post(f"/v1/chats/{public['id']}/members", json={"user_ids": [bob.id]}).status_code == 400
    assert alice.client.delete(f"/v1/chats/{public['id']}/members/{outsider.id}").status_code == 400
    assert outsider.client.delete(f"/v1/chats/{public['id']}/members/{outsider.id}").status_code == 204


def test_private_group_cannot_be_joined(friends, make_user):
    alice, bob, _ = friends
    group = create_group(alice, [bob])

    response = make_user().client.post(f"/v1/chats/{group['id']}/members/me")

    assert response.status_code == 404


def test_only_admins_change_public_status(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])
    since = sync_time(bob)

    assert bob.client.patch(f"/v1/chats/{group['id']}/visibility", json={"public": True}).status_code == 403
    set_admin(alice, group["id"], bob.id, True)
    response = bob.client.patch(f"/v1/chats/{group['id']}/visibility", json={"public": True})

    assert response.status_code == 200 and response.json()["public"] is True
    assert chat_in(delta(bob, since), group["id"])["public"] is True


def test_direct_chats_have_no_name_or_members_to_change(friends):
    alice, bob, carol = friends
    chat = create_direct(alice, bob)

    assert alice.client.patch(f"/v1/chats/{chat['id']}", data={"name": "x"}).status_code == 400
    assert alice.client.post(f"/v1/chats/{chat['id']}/members", json={"user_ids": [carol.id]}).status_code == 400
    assert alice.client.patch(f"/v1/chats/{chat['id']}").status_code == 400


def test_create_group_with_image(friends):
    alice, bob, _ = friends

    group = create_group(alice, [bob], image=png_bytes())

    assert image_file_exists(group["image_url"])


def test_replacing_group_image_deletes_old_file(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob], image=png_bytes())

    response = alice.client.patch(f"/v1/chats/{group['id']}", files={"image": ("g.png", png_bytes(), "image/png")})

    assert response.status_code == 200
    assert not image_file_exists(group["image_url"])
    assert image_file_exists(response.json()["image_url"])


def test_delete_group_image(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob], image=png_bytes())
    set_admin(alice, group["id"], bob.id, True)
    since = sync_time(alice)

    # Every admin can remove it
    response = bob.client.delete(f"/v1/chats/{group['id']}/image")

    assert response.status_code == 200
    assert response.json()["image_url"] is None
    assert response.json()["id"] == group["id"]
    assert not image_file_exists(group["image_url"])
    delivered = chat_in(delta(alice, since), group["id"])
    assert delivered is not None and delivered["image_url"] is None
    assert run_sql("SELECT image_updated_by FROM chat WHERE id = :id", id=group["id"])[0][0] == bob.id


def test_delete_group_image_without_image_changes_nothing(friends):
    alice, bob, _ = friends
    group = create_group(alice, [bob])

    response = alice.client.delete(f"/v1/chats/{group['id']}/image")

    assert response.status_code == 200
    assert run_sql("SELECT image_updated_at FROM chat WHERE id = :id", id=group["id"])[0][0] is None


def test_delete_group_image_permissions(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob], image=png_bytes())
    direct = create_direct(alice, bob)

    assert carol.client.delete(f"/v1/chats/{group['id']}/image").status_code == 403
    assert alice.client.delete(f"/v1/chats/{direct['id']}/image").status_code == 400
    assert alice.client.delete("/v1/chats/9999/image").status_code == 404
    assert image_file_exists(group["image_url"])


def delete_account(user):
    response = user.client.request("DELETE", "/v1/users/me", json={"password": user.password})
    assert response.status_code == 204, response.text


def test_account_deletion_deletes_direct_chats_for_both_members(friends):
    alice, bob, _ = friends
    chat = create_direct(alice, bob)
    send(bob, chat["id"])

    delete_account(alice)

    assert run_sql("SELECT deleted_at FROM chat WHERE id = :id", id=chat["id"])[0][0] is not None
    assert bob.client.get("/v1/chats").json()["chats"] == []


def test_account_deletion_leaves_groups(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])
    since = sync_time(bob)

    delete_account(alice)

    stored = chat_in(bob.client.get("/v1/chats").json(), group["id"])
    assert sorted(m["user_id"] for m in stored["members"]) == sorted([bob.id, carol.id])
    # Alice was the only admin, so one of the others became admin
    assert set(admins(stored).values()) == {False, True}
    read_state = next(s for s in delta(bob, since)["read_states"] if s["chat_id"] == group["id"])
    assert alice.id not in [m["user_id"] for m in read_state["members"]]


def test_account_deletion_deletes_groups_without_other_members(friends):
    alice = friends[0]
    public = create_group(alice, [], name="Solo", public=True)

    delete_account(alice)

    assert run_sql("SELECT deleted_at FROM chat WHERE id = :id", id=public["id"])[0][0] is not None


def test_account_deletion_deletes_sent_messages(friends):
    alice, bob, carol = friends
    group = create_group(alice, [bob, carol])
    kept = send(bob, group["id"], "from bob").json()
    send(alice, group["id"], "from alice")
    photo = alice.client.post(f"/v1/chats/{group['id']}/messages", files={"image": ("p.png", png_bytes(), "image/png")}).json()
    since = sync_time(bob)

    delete_account(alice)

    stored = chat_in(bob.client.get("/v1/chats").json(), group["id"])
    assert [m["id"] for m in stored["messages"]] == [kept["id"]]
    # The latest message goes back to the newest remaining one
    assert stored["latest_message_preview"] == "from bob"
    assert stored["latest_message_sender_id"] == bob.id
    assert not image_file_exists(photo["image_url"])
    deleted = [m for m in chat_in(delta(bob, since), group["id"])["messages"] if m["deleted_at"]]
    assert len(deleted) == 2 and all(m["content"] is None for m in deleted)
