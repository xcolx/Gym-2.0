from collections import defaultdict
from datetime import datetime
from uuid import UUID

from PIL import Image
from sqlalchemy.orm import Session

import app.db.queries.chat as crud
import app.db.queries.users as user_crud
from app.core import content_filter, nudity_filter
from app.core.errors import (
    ChatNotFoundError,
    InvalidUserActionError,
    MessageNotFoundError,
    PermissionDeniedError,
    RelationshipNotFoundError,
    UserNotFoundError,
)
from app.core.nudity_filter import Verdict
from app.db.models import Chat, ChatUser, Message, User
from app.db.queries.sync import check_last_sync_time
from app.schemas import (
    AddMembersRequest,
    ChatDeltaResponse,
    ChatListResponse,
    ChatMemberResponse,
    ChatReadStateResponse,
    ChatResponse,
    CreateChatRequest,
    MarkReadRequest,
    MessageResponse,
    UpdateAdminRequest,
    UpdatePublicRequest,
)
from app.services import image_service, report_service
from app.util.time import to_iso

MAX_GROUP_NAME_LENGTH = 25
MAX_MESSAGE_LENGTH = 10000

CHAT_IMAGE_QUALITY = 80
CHAT_IMAGE_MAX_DIMENSION = 1024
MESSAGE_IMAGE_QUALITY = 80
MESSAGE_IMAGE_MAX_DIMENSION = 2048


def _map_message(message: Message) -> MessageResponse:
    # A deleted message only tells the clients to remove it, its text and photo aren't sent anymore
    deleted = message.deleted_at is not None
    return MessageResponse(
        id=message.id,
        chat_id=message.chat_id,
        sender_id=message.sender_id,
        created_at=message.created_at.isoformat(),
        content=None if deleted else message.content,
        image_url=None if deleted else message.image_url,
        deleted_at=message.deleted_at.isoformat() if message.deleted_at is not None else None
    )


def _message_preview(message: Message) -> str:
    """The latest message preview of a chat for the message, its text or a photo"""
    return message.content if message.content is not None else "📷 Photo"


def _map_member(membership: ChatUser) -> ChatMemberResponse:
    return ChatMemberResponse(
        user_id=membership.user_id,
        last_read_message_id=membership.last_read_message_id,
        admin=membership.admin
    )


def _map_chat(chat: Chat, memberships: list[ChatUser], messages: list[Message]) -> ChatResponse:
    return ChatResponse(
        id=chat.id,
        group_chat=chat.group_chat,
        name=chat.name,
        image_url=chat.image_url,
        created_at=chat.created_at.isoformat(),
        created_by=chat.created_by,
        public=chat.public,
        latest_message_timestamp=chat.latest_message_timestamp.isoformat() if chat.latest_message_timestamp else None,
        latest_message_preview=chat.latest_message_preview,
        latest_message_sender_id=chat.latest_message_sender_id,
        members=[
            _map_member(m)
            for m in memberships
        ],
        messages=[_map_message(m) for m in messages]
    )


def _build_chat_responses(db: Session, chats: list[Chat], messages: list[Message]) -> list[ChatResponse]:
    chat_ids = [chat.id for chat in chats]

    members_by_chat = defaultdict(list)
    for membership in crud.get_memberships_for_chats(db, chat_ids):
        members_by_chat[membership.chat_id].append(membership)

    messages_by_chat = defaultdict(list)
    for message in messages:
        messages_by_chat[message.chat_id].append(message)

    return [_map_chat(chat, members_by_chat[chat.id], messages_by_chat[chat.id]) for chat in chats]


def _validate_group_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise InvalidUserActionError("Group chat name cannot be empty.")
    if len(name) > MAX_GROUP_NAME_LENGTH:
        raise InvalidUserActionError(f"Group chat name cannot be longer than {MAX_GROUP_NAME_LENGTH} characters.")
    content_filter.check_group_name(name)
    return name


def _check_can_chat_with(db: Session, current_user: User, target_id: int) -> None:
    """
    Ensures the target user exists, is a friend of the current user and neither has blocked the other.
    """
    if current_user.id == target_id:
        raise InvalidUserActionError("Cannot create a chat with yourself.")

    if not user_crud.get_user_by_id(db, target_id):
        raise UserNotFoundError(f"User with ID {target_id} not found.")

    if user_crud.is_blocked(db, current_user.id, target_id):
        raise PermissionDeniedError(f"Cannot create a chat with user {target_id}.")

    if not user_crud.are_friends(db, current_user.id, target_id):
        raise PermissionDeniedError(f"You can only chat with friends. User {target_id} is not your friend.")


def _check_can_message_in_direct_chat(db: Session, current_user: User, chat_id: int) -> None:
    """
    Ensures the other member of a direct chat is still a friend of the current user and neither has blocked the other.
    The direct chat itself is kept after unfriending or blocking, so that it can be continued once they are friends again.
    Both cases share one message, so that a block is not revealed to the blocked user.
    """
    other_ids = [m.user_id for m in crud.get_memberships_for_chats(db, [chat_id]) if m.user_id != current_user.id]
    if not other_ids:
        return

    other_id = other_ids[0]
    if user_crud.is_blocked(db, current_user.id, other_id) or not user_crud.are_friends(db, current_user.id, other_id):
        raise PermissionDeniedError("You can only send messages to friends.")


def _report_chat_image(
    db: Session, verdict: Verdict, user: User, image: Image.Image, chat_id: int | None, name: str | None
) -> None:
    """Reports a group image that NudeNet flagged, see report_service.report_nudity. Raises if it was blocked."""
    report_service.report_nudity(
        db, verdict, user, image,
        image_column="chat_image", quality=CHAT_IMAGE_QUALITY, max_dimension=CHAT_IMAGE_MAX_DIMENSION,
        reported_chat_id=chat_id, chat_name=name
    )


def _report_message_photo(
    db: Session, verdict: Verdict, user: User, image: Image.Image, message_id: int | None, content: str | None
) -> None:
    """Reports a chat photo that NudeNet flagged, see report_service.report_nudity. Raises if it was blocked."""
    report_service.report_nudity(
        db, verdict, user, image,
        image_column="message_image", quality=MESSAGE_IMAGE_QUALITY, max_dimension=MESSAGE_IMAGE_MAX_DIMENSION,
        reported_message_id=message_id, user_name=user.user_name, message_text=content
    )


def get_all_chats(db: Session, user: User) -> ChatListResponse:
    # Taken before the query so that changes made while the query runs are included in the next delta
    sync_time = crud.get_sync_time(db)
    chats = crud.get_chats_for_user(db, user.id)
    messages = crud.get_messages_for_chats(db, [chat.id for chat in chats])

    return ChatListResponse(
        chats=_build_chat_responses(db, chats, messages),
        sync_time=to_iso(sync_time)
    )


def get_chat_delta(db: Session, user: User, last_sync_time: datetime) -> ChatDeltaResponse:
    # Taken before the queries so that changes made while they run are included in the next delta
    current_sync_time = crud.get_sync_time(db)
    last_sync_time = check_last_sync_time(db, last_sync_time)

    # The client doesn't have the earlier messages of chats the user was added to since the last sync
    joined_chat_ids = set(crud.get_chat_ids_joined_since(db, user.id, last_sync_time))
    messages = [
        message for message in crud.get_messages_for_user_since(db, user.id, last_sync_time)
        if message.chat_id not in joined_chat_ids
    ]
    messages += crud.get_messages_for_chats(db, list(joined_chat_ids))

    chat_ids = {message.chat_id for message in messages}
    chat_ids.update(joined_chat_ids)
    chat_ids.update(chat.id for chat in crud.get_chats_for_user(db, user.id, created_since=last_sync_time))
    chat_ids.update(crud.get_changed_chat_ids_for_user(db, user.id, last_sync_time))

    chats = sorted(crud.get_chats_by_ids(db, list(chat_ids)), key=lambda chat: chat.id)

    members_by_chat = defaultdict(list)
    all_chat_ids = [chat.id for chat in crud.get_chats_for_user(db, user.id)]
    for membership in crud.get_memberships_for_chats(db, all_chat_ids):
        members_by_chat[membership.chat_id].append(
            _map_member(membership)
        )

    return ChatDeltaResponse(
        chats=_build_chat_responses(db, chats, messages),
        read_states=[
            ChatReadStateResponse(chat_id=chat_id, members=members_by_chat[chat_id])
            for chat_id in sorted(all_chat_ids)
        ],
        sync_time=to_iso(current_sync_time)
    )


def create_chat(db: Session, user: User, payload: CreateChatRequest) -> tuple[ChatResponse, bool]:
    """
    Returns the chat and whether it was newly created. An existing direct chat is returned without messages, those are
    delivered through GET /chats and /chats/delta.
    """
    _check_can_chat_with(db, user, payload.user_id)

    # Serializes concurrent requests for the same pair of users, so that only one direct chat is created
    crud.lock_users(db, [user.id, payload.user_id])

    existing_chat = crud.get_direct_chat_between(db, user.id, payload.user_id)
    if existing_chat:
        return _map_chat(existing_chat, crud.get_memberships_for_chats(db, [existing_chat.id]), []), False

    db_chat = crud.create_chat(db, created_by=user.id, group_chat=False, name=None, image_url=None, public=False)
    memberships = [
        crud.join_chat(db, db_chat.id, user.id, admin=None),
        crud.join_chat(db, db_chat.id, payload.user_id, admin=None)
    ]
    db.flush()

    return _map_chat(db_chat, memberships, []), True


def create_group_chat(
    db: Session,
    user: User,
    name: str,
    user_ids: list[int],
    public: bool = False,
    image_contents: bytes | None = None
) -> ChatResponse:
    """
    The user becomes its first admin. Images that NudeNet blocks are rejected, the ones it flags or blocks are reported
    (report_service.report_nudity).
    """
    name = _validate_group_name(name)
    image = image_service.decode_image(image_contents) if image_contents is not None else None
    verdict = nudity_filter.check_image(image)

    # remove duplicates and the user themselves while keeping the order
    other_ids = [uid for uid in dict.fromkeys(user_ids) if uid != user.id]
    if not other_ids and not public:
        raise InvalidUserActionError("A private group chat needs at least one other member.")

    for other_id in other_ids:
        _check_can_chat_with(db, user, other_id)

    image_hash = None
    if image is not None:
        if verdict.blocked:
            _report_chat_image(db, verdict, user, image, None, name)
        image_hash = image_service.store_image(
            db, image, quality=CHAT_IMAGE_QUALITY, max_dimension=CHAT_IMAGE_MAX_DIMENSION
        )

    db_chat = crud.create_chat(db, created_by=user.id, group_chat=True, name=name, image_url=image_hash, public=public)

    memberships = [crud.join_chat(db, db_chat.id, user.id, admin=True)]
    memberships += [crud.join_chat(db, db_chat.id, member_id, admin=False) for member_id in other_ids]
    db.flush()
    if image is not None:
        _report_chat_image(db, verdict, user, image, db_chat.id, name)

    return _map_chat(db_chat, memberships, [])


def update_group_chat(
    db: Session,
    user: User,
    chat_id: int,
    name: str | None = None,
    image_contents: bytes | None = None
) -> ChatResponse:
    """
    Images that NudeNet blocks are rejected, the ones it flags or blocks are reported (report_service.report_nudity).
    """
    if name is None and image_contents is None:
        raise InvalidUserActionError("Provide a new name or image.")

    # Checked before the chat is locked, so that the check doesn't hold up the messages sent to it
    image = image_service.decode_image(image_contents) if image_contents is not None else None
    verdict = nudity_filter.check_image(image)

    db_chat = _get_group_chat_for_admin(db, user, chat_id, "Only group chats have a name and an image.")

    if name is not None:
        name = _validate_group_name(name)
        if name != db_chat.name:
            crud.update_chat_name(db, chat_id, user.id, name)

    if image is not None:
        _report_chat_image(db, verdict, user, image, chat_id, name if name is not None else db_chat.name)
        image_hash = image_service.store_image(
            db, image, quality=CHAT_IMAGE_QUALITY, max_dimension=CHAT_IMAGE_MAX_DIMENSION
        )
        image_service.discard_image(db, db_chat.image_url)
        crud.update_chat_image(db, chat_id, user.id, image_hash)

    db.flush()

    return _map_chat(db_chat, crud.get_memberships_for_chats(db, [chat_id]), [])


def delete_group_chat_image(db: Session, user: User, chat_id: int) -> ChatResponse:
    db_chat = _get_group_chat_for_admin(db, user, chat_id, "Only group chats have a name and an image.")

    if db_chat.image_url is not None:
        image_service.discard_image(db, db_chat.image_url)
        crud.update_chat_image(db, chat_id, user.id, None)
        db.flush()

    return _map_chat(db_chat, crud.get_memberships_for_chats(db, [chat_id]), [])


NOT_GROUP_CHAT_MESSAGE = "Only group chats have members that can be added, removed or made admins, or can be made public."


def _get_group_chat_for_member(
    db: Session, user: User, chat_id: int, not_group_message: str = NOT_GROUP_CHAT_MESSAGE
) -> tuple[Chat, ChatUser]:
    """
    Locks and returns the group chat and the user's membership, or raises if it doesn't exist, isn't a group chat or
    the user isn't a member of it.
    """
    db_chat = crud.get_chat_by_id(db, chat_id, for_update=True)
    if not db_chat:
        raise ChatNotFoundError(f"Chat with ID {chat_id} not found.")
    membership = crud.get_membership(db, chat_id, user.id)
    if not membership:
        raise PermissionDeniedError("You are not a member of this chat.")
    if not db_chat.group_chat:
        raise InvalidUserActionError(not_group_message)
    return db_chat, membership


def _get_group_chat_for_admin(db: Session, user: User, chat_id: int, not_group_message: str = NOT_GROUP_CHAT_MESSAGE) -> Chat:
    """
    Locks and returns the group chat, or raises like _get_group_chat_for_member or if the user isn't one of its admins.
    """
    db_chat, membership = _get_group_chat_for_member(db, user, chat_id, not_group_message)
    if not membership.admin:
        raise PermissionDeniedError("Only admins of the group chat can do that.")
    return db_chat


def add_members(db: Session, user: User, chat_id: int, payload: AddMembersRequest) -> ChatResponse:
    db_chat = _get_group_chat_for_admin(db, user, chat_id)
    if db_chat.public:
        raise InvalidUserActionError("Members cannot be added to a public group chat, everyone can join it themselves.")

    member_ids = {m.user_id for m in crud.get_memberships_for_chats(db, [chat_id])}
    new_ids = [uid for uid in dict.fromkeys(payload.user_ids) if uid not in member_ids]
    for new_id in new_ids:
        _check_can_chat_with(db, user, new_id)

    for new_id in new_ids:
        crud.join_chat(db, chat_id, new_id, admin=False)
    db.flush()

    return _map_chat(db_chat, crud.get_memberships_for_chats(db, [chat_id]), [])


def remove_member(db: Session, user: User, chat_id: int, member_id: int) -> None:
    db_chat, membership = _get_group_chat_for_member(db, user, chat_id)
    if member_id != user.id:
        if not membership.admin:
            raise PermissionDeniedError("Only admins of the group chat can remove members.")
        if db_chat.public:
            raise InvalidUserActionError("Members cannot be removed from a public group chat.")

    if not crud.leave_chat(db, chat_id, member_id):
        raise RelationshipNotFoundError(f"User {member_id} is not a member of this chat.")

    _after_member_left(db, chat_id)
    db.flush()


def _after_member_left(db: Session, chat_id: int) -> None:
    """
    Deletes the group chat if it has no members anymore, otherwise makes a random member admin if none is left.
    The chat has to be locked.
    """
    if not crud.get_memberships_for_chats(db, [chat_id]):
        crud.soft_delete_chat(db, chat_id)
    else:
        crud.ensure_admin(db, chat_id)


def update_admin(db: Session, user: User, chat_id: int, member_id: int, payload: UpdateAdminRequest) -> ChatResponse:
    db_chat = _get_group_chat_for_admin(db, user, chat_id)
    memberships = crud.get_memberships_for_chats(db, [chat_id])
    target = next((m for m in memberships if m.user_id == member_id), None)
    if target is None:
        raise RelationshipNotFoundError(f"User {member_id} is not a member of this chat.")

    if target.admin != payload.admin:
        if not payload.admin and not any(m.admin for m in memberships if m.user_id != member_id):
            raise InvalidUserActionError("A group chat needs at least one admin. Make another member admin first.")
        crud.set_admin(db, chat_id, member_id, payload.admin)
        db.flush()

    return _map_chat(db_chat, crud.get_memberships_for_chats(db, [chat_id]), [])


def delete_chat(db: Session, user: User, chat_id: int) -> None:
    db_chat = crud.get_chat_by_id(db, chat_id, for_update=True)
    if not db_chat:
        raise ChatNotFoundError(f"Chat with ID {chat_id} not found.")
    membership = crud.get_membership(db, chat_id, user.id)
    if not membership:
        raise PermissionDeniedError("You are not a member of this chat.")
    if db_chat.group_chat and not membership.admin:
        raise PermissionDeniedError("Only admins of the group chat can delete it.")

    # The members find out through /chats/delta, whose read states only contain the chats that still exist
    crud.soft_delete_chat(db, chat_id)
    db.flush()


def update_public(db: Session, user: User, chat_id: int, payload: UpdatePublicRequest) -> ChatResponse:
    db_chat = _get_group_chat_for_admin(db, user, chat_id)

    if db_chat.public != payload.public:
        crud.update_public_status(db, chat_id, user.id, payload.public)
        db.flush()
        db.refresh(db_chat)

    return _map_chat(db_chat, crud.get_memberships_for_chats(db, [chat_id]), [])


def get_public_chats(db: Session) -> list[ChatResponse]:
    return _build_chat_responses(db, crud.get_public_chats(db), [])


def join_public_chat(db: Session, user: User, chat_id: int) -> tuple[ChatResponse, bool]:
    """
    Returns the chat and whether the user newly joined it.
    """
    # Locks the chat, so that concurrent join requests of the same user cannot both add a membership
    db_chat = crud.get_chat_by_id(db, chat_id, for_update=True)
    # Private chats are reported as not found, so their existence is not revealed
    if not db_chat or not db_chat.public or not db_chat.group_chat:
        raise ChatNotFoundError(f"Chat with ID {chat_id} not found.")

    joined = crud.get_membership(db, chat_id, user.id) is None
    if joined:
        crud.join_chat(db, chat_id, user.id, admin=False)
        db.flush()

    messages = crud.get_messages_for_chats(db, [chat_id])
    return _build_chat_responses(db, [db_chat], messages)[0], joined


def mark_read(db: Session, user: User, chat_id: int, payload: MarkReadRequest) -> None:
    """
    A message older than the current read state leaves it unchanged.
    """
    db_chat = crud.get_chat_by_id(db, chat_id)
    if not db_chat:
        raise ChatNotFoundError(f"Chat with ID {chat_id} not found.")
    if not crud.get_membership(db, chat_id, user.id):
        raise PermissionDeniedError("You are not a member of this chat.")

    db_message = crud.get_message_by_id(db, payload.message_id)
    if not db_message or db_message.chat_id != chat_id:
        raise MessageNotFoundError(f"Message with ID {payload.message_id} not found in this chat.")

    crud.set_last_read(db, chat_id, user.id, payload.message_id)
    db.flush()


def send_message(
    db: Session,
    user: User,
    chat_id: int,
    content: str | None = None,
    image_contents: bytes | None = None,
    client_uuid: UUID | None = None
) -> MessageResponse:
    """
    If the user already sent a message with the same client UUID, that message is returned instead. Photos that NudeNet
    blocks are rejected, the ones it flags or blocks are reported (report_service.report_nudity).
    """
    if content is not None and not content.strip():
        content = None
    if content is None and image_contents is None:
        raise InvalidUserActionError("A message needs text or a photo.")
    if content is not None and len(content) > MAX_MESSAGE_LENGTH:
        raise InvalidUserActionError(f"A message cannot be longer than {MAX_MESSAGE_LENGTH} characters.")
    if content is not None:
        content_filter.check_message(content)

    # Checked before the chat is locked, so that the check doesn't hold up the other messages sent to it
    image = image_service.decode_image(image_contents) if image_contents is not None else None
    verdict = nudity_filter.check_image(image)

    # Locks the chat until the end of the transaction, so that concurrent messages to the same chat are
    # serialized and the latest message fields always belong to the message with the highest ID
    db_chat = crud.get_chat_by_id(db, chat_id, for_update=True)
    if not db_chat:
        raise ChatNotFoundError(f"Chat with ID {chat_id} not found.")
    if not crud.get_membership(db, chat_id, user.id):
        raise PermissionDeniedError("You are not a member of this chat.")

    # Checked after locking the chat, so that a concurrent retry of the same request finds the created message
    if client_uuid is not None:
        existing_message = crud.get_message_by_client_uuid(db, user.id, client_uuid)
        if existing_message:
            return _map_message(existing_message)

    if not db_chat.group_chat:
        _check_can_message_in_direct_chat(db, user, chat_id)

    image_hash = None
    if image is not None:
        if verdict.blocked:
            _report_message_photo(db, verdict, user, image, None, content)
        image_hash = image_service.store_image(
            db, image, quality=MESSAGE_IMAGE_QUALITY, max_dimension=MESSAGE_IMAGE_MAX_DIMENSION
        )

    db_message = crud.create_message(
        db, sender_id=user.id, chat_id=chat_id, content=content, image_url=image_hash, client_uuid=client_uuid
    )

    crud.update_latest_message(db, chat_id, user.id, _message_preview(db_message), db_message.created_at)
    db.flush()
    if image is not None:
        _report_message_photo(db, verdict, user, image, db_message.id, content)

    return _map_message(db_message)


def delete_message(db: Session, user: User, message_id: int) -> None:
    """
    Soft deletes the message: its text is emptied and its photo removed for good, only the row remains so that
    /chats/delta can deliver the deletion. If it was the latest message of the chat, the chat's latest message fields go
    back to the previous message.
    """
    db_message = crud.get_message_by_id(db, message_id)
    if not db_message:
        raise MessageNotFoundError(f"Message with ID {message_id} not found.")

    # Locked like for sending, so that a message sent at the same time can't be replaced by an older latest message
    db_chat = crud.get_chat_by_id(db, db_message.chat_id, for_update=True)
    if not db_chat:
        raise MessageNotFoundError(f"Message with ID {message_id} not found.")
    if db_message.sender_id != user.id:
        membership = crud.get_membership(db, db_chat.id, user.id)
        if not (db_chat.group_chat and membership and membership.admin):
            raise PermissionDeniedError("You can only delete your own messages, or those of others in groups you're an admin of.")

    image_service.discard_image(db, db_message.image_url)
    crud.soft_delete_message(db, message_id)
    refresh_latest_message(db, db_chat.id)
    db.flush()


def delete_messages_of_user(db: Session, user_id: int) -> None:
    """
    Like delete_message for every message of the user, e.g. when the account is deleted.
    """
    # Locked like for sending, so that a message sent at the same time can't be replaced by an older latest message
    chat_ids = crud.lock_chats_with_latest_sender(db, user_id)

    for image_hash in crud.get_message_image_urls_of_sender(db, user_id):
        image_service.discard_image(db, image_hash)
    crud.soft_delete_messages_of_sender(db, user_id)

    for chat_id in chat_ids:
        refresh_latest_message(db, chat_id)


def remove_user_from_chats(db: Session, user_id: int) -> None:
    """
    Removes a user from all of their chats, e.g. when the account is deleted: their direct chats are deleted for both
    members and they leave their group chats (private and public), like remove_member does.
    A group chat without members is deleted, one without admins gets a random member as admin.
    The other members find out through /chats/delta.
    """
    for chat in crud.lock_chats_of_user(db, user_id):
        if not chat.group_chat:
            crud.soft_delete_chat(db, chat.id)
            continue
        crud.leave_chat(db, chat.id, user_id)
        _after_member_left(db, chat.id)


def refresh_latest_message(db: Session, chat_id: int) -> None:
    """
    Points the latest message fields of the chat to its newest non-deleted message, or empties them if there is none.
    Used after a message was deleted (or restored in the admin).
    """
    latest = crud.get_latest_message(db, chat_id)
    if latest is None:
        crud.clear_latest_message(db, chat_id)
    else:
        crud.update_latest_message(db, chat_id, latest.sender_id, _message_preview(latest), latest.created_at)
