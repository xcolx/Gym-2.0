from datetime import datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import CursorResult, and_, delete, false, func, or_, select, true, update
from sqlalchemy.orm import Session

from app.db.models import Chat, ChatUser, Message, User
from app.db.queries.sync import get_sync_time  # noqa: F401 (re-exported for the chat service)


def lock_users(db: Session, user_ids: list[int]) -> None:
    """
    Locks the rows of the given users until the end of the transaction, to serialize checks
    like "only one direct chat per pair of users" between concurrent requests.
    The rows are locked in ID order to avoid deadlocks.
    """
    db.execute(select(User.id).where(User.id.in_(user_ids)).order_by(User.id).with_for_update()).all()


def create_chat(
    db: Session,
    created_by: int,
    group_chat: bool = False,
    name: str | None = None,
    image_url: str | None = None,
    public: bool = False
) -> Chat:
    db_chat = Chat(
        created_by=created_by,
        group_chat=group_chat,
        name=name,
        image_url=image_url,
        created_at=func.now(),
        public=public
    )
    db.add(db_chat)
    db.flush()
    db.refresh(db_chat)
    return db_chat


def create_message(
    db: Session,
    sender_id: int,
    chat_id: int,
    content: str | None = None,
    image_url: str | None = None,
    client_uuid: UUID | None = None
) -> Message:
    db_message = Message(
        client_uuid=client_uuid,
        chat_id=chat_id,
        sender_id=sender_id,
        created_at=func.now(),
        content=content,
        image_url=image_url
    )
    db.add(db_message)
    db.flush()
    db.refresh(db_message)
    return db_message


def get_chat_by_id(db: Session, chat_id: int, for_update: bool = False) -> Chat | None:
    """
    for_update locks the row until the end of the transaction.
    """
    statement = select(Chat).where(Chat.id == chat_id, Chat.deleted_at.is_(None))
    if for_update:
        statement = statement.with_for_update()
    return db.scalars(statement).first()


def get_chats_by_ids(db: Session, chat_ids: list[int]) -> list[Chat]:
    if not chat_ids:
        return []
    return list(db.scalars(
        select(Chat).where(Chat.id.in_(chat_ids), Chat.deleted_at.is_(None))
    ).all())


def get_chats_for_user(db: Session, user_id: int, created_since: datetime | None = None) -> list[Chat]:
    """
    With created_since only chats created at or after that timestamp.
    """
    statement = (
        select(Chat)
        .join(ChatUser, ChatUser.chat_id == Chat.id)
        .where(ChatUser.user_id == user_id, Chat.deleted_at.is_(None))
    )
    if created_since is not None:
        statement = statement.where(Chat.created_at >= created_since)
    return list(db.scalars(statement).all())


def get_public_chats(db: Session) -> list[Chat]:
    return list(db.scalars(
        select(Chat)
        .where(Chat.public == true(), Chat.group_chat == true(), Chat.deleted_at.is_(None))
        .order_by(Chat.id)
    ).all())


def get_changed_chat_ids_for_user(db: Session, user_id: int, since: datetime) -> list[int]:
    """
    The user's chats whose name, image or public status changed at or after since.
    """
    user_chat_ids = select(ChatUser.chat_id).where(ChatUser.user_id == user_id)

    return list(db.scalars(
        select(Chat.id).where(
            Chat.id.in_(user_chat_ids),
            Chat.deleted_at.is_(None),
            or_(
                Chat.name_updated_at >= since,
                Chat.image_updated_at >= since,
                Chat.public_updated_at >= since
            )
        )
    ).all())


def get_chat_ids_joined_since(db: Session, user_id: int, since: datetime) -> list[int]:
    return list(db.scalars(
        select(ChatUser.chat_id)
        .join(Chat, Chat.id == ChatUser.chat_id)
        .where(ChatUser.user_id == user_id, ChatUser.joined_at >= since, Chat.deleted_at.is_(None))
    ).all())


def get_membership(db: Session, chat_id: int, user_id: int) -> ChatUser | None:
    return db.scalars(
        select(ChatUser).where(ChatUser.chat_id == chat_id, ChatUser.user_id == user_id)
    ).first()


def get_memberships_for_chats(db: Session, chat_ids: list[int]) -> list[ChatUser]:
    if not chat_ids:
        return []
    return list(db.scalars(
        select(ChatUser).where(ChatUser.chat_id.in_(chat_ids))
    ).all())


def get_direct_chat_between(db: Session, user_id_a: int, user_id_b: int) -> Chat | None:
    shared_chat_ids = (
        select(ChatUser.chat_id)
        .where(ChatUser.user_id.in_([user_id_a, user_id_b]))
        .group_by(ChatUser.chat_id)
        .having(func.count(ChatUser.user_id) == 2)
    )
    return db.scalars(
        select(Chat).where(
            Chat.id.in_(shared_chat_ids),
            Chat.group_chat == false(),
            Chat.deleted_at.is_(None)
        )
    ).first()


def get_messages_for_chats(db: Session, chat_ids: list[int]) -> list[Message]:
    """
    Oldest first.
    """
    if not chat_ids:
        return []
    return list(db.scalars(
        select(Message)
        .where(Message.chat_id.in_(chat_ids), Message.deleted_at.is_(None))
        .order_by(Message.id)
    ).all())


def get_messages_for_user_since(db: Session, user_id: int, since: datetime) -> list[Message]:
    """
    Fetch the messages in the user's non-deleted chats that were created, deleted or changed (e.g. restored in the
    admin) at or after the given timestamp, ordered from oldest to newest. Deleted messages are included (deleted_at is
    set), so that clients remove them.
    """
    return list(db.scalars(
        select(Message)
        .join(ChatUser, ChatUser.chat_id == Message.chat_id)
        .join(Chat, Chat.id == Message.chat_id)
        .where(
            ChatUser.user_id == user_id,
            or_(
                and_(Message.created_at >= since, Message.deleted_at.is_(None)),
                and_(Message.updated_at >= since, Message.deleted_at.is_(None)),
                Message.deleted_at >= since
            ),
            Chat.deleted_at.is_(None)
        )
        .order_by(Message.id)
    ).all())


def get_latest_message(db: Session, chat_id: int) -> Message | None:
    return db.scalars(
        select(Message)
        .where(Message.chat_id == chat_id, Message.deleted_at.is_(None))
        .order_by(Message.id.desc())
        .limit(1)
    ).first()


def get_message_by_id(db: Session, message_id: int) -> Message | None:
    return db.scalars(
        select(Message).where(Message.id == message_id, Message.deleted_at.is_(None))
    ).first()


def get_message_by_client_uuid(db: Session, sender_id: int, client_uuid: UUID) -> Message | None:
    """
    Including deleted ones.
    """
    return db.scalars(
        select(Message).where(Message.sender_id == sender_id, Message.client_uuid == client_uuid)
    ).first()


def join_chat(db: Session, chat_id: int, user_id: int, admin: bool | None) -> ChatUser:
    """
    As admin or not (None for direct chats). Does nothing if the user already is a member.
    """
    statement = select(ChatUser).where(
        ChatUser.chat_id == chat_id, ChatUser.user_id == user_id
    )
    existing_membership = db.scalars(statement).first()

    if existing_membership:
        return existing_membership

    membership = ChatUser(
        chat_id=chat_id,
        user_id=user_id,
        last_read_message_id=0,
        admin=admin
    )
    db.add(membership)
    db.flush()
    db.refresh(membership)
    return membership


def leave_chat(db: Session, chat_id: int, user_id: int) -> bool:
    """
    Returns whether the user was a member.
    """
    result = db.execute(
        delete(ChatUser)
        .where(ChatUser.chat_id == chat_id, ChatUser.user_id == user_id)
    )
    return cast(CursorResult[Any], result).rowcount > 0


def set_admin(db: Session, chat_id: int, user_id: int, admin: bool) -> None:
    db.execute(
        update(ChatUser)
        .where(ChatUser.chat_id == chat_id, ChatUser.user_id == user_id)
        .values(admin=admin)
    )


def ensure_admin(db: Session, chat_id: int) -> None:
    """
    Makes a random member an admin of the group chat if none of its members is one, e.g. after the last admin left.
    Does nothing for a chat without members.
    """
    has_admin = select(ChatUser.user_id).where(ChatUser.chat_id == chat_id, ChatUser.admin == true()).exists()
    random_member = (
        select(ChatUser.user_id).where(ChatUser.chat_id == chat_id).order_by(func.random()).limit(1).scalar_subquery()
    )
    db.execute(
        update(ChatUser)
        .where(ChatUser.chat_id == chat_id, ChatUser.user_id == random_member, ~has_admin)
        .values(admin=True)
    )


def set_last_read(db: Session, chat_id: int, user_id: int, message_id: int) -> None:
    """
    Never moves it backwards.
    """
    db.execute(
        update(ChatUser)
        .where(
            ChatUser.chat_id == chat_id,
            ChatUser.user_id == user_id,
            ChatUser.last_read_message_id < message_id
        )
        .values(last_read_message_id=message_id)
    )


def update_public_status(db: Session, chat_id: int, user_id: int, public: bool) -> Chat | None:
    result = db.execute(
        update(Chat)
        .where(Chat.id == chat_id)
        .values(
            public=public,
            public_updated_at=func.now(),
            public_updated_by=user_id
        )
        .returning(Chat)
    )
    return result.scalar_one_or_none()


def update_chat_name(db: Session, chat_id: int, user_id: int, name: str) -> Chat | None:
    result = db.execute(
        update(Chat)
        .where(Chat.id == chat_id)
        .values(
            name=name,
            name_updated_at=func.now(),
            name_updated_by=user_id
        )
        .returning(Chat)
    )
    return result.scalar_one_or_none()


def update_chat_image(db: Session, chat_id: int, user_id: int, image_url: str | None) -> Chat | None:
    result = db.execute(
        update(Chat)
        .where(Chat.id == chat_id)
        .values(
            image_url=image_url,
            image_updated_at=func.now(),
            image_updated_by=user_id
        )
        .returning(Chat)
    )
    return result.scalar_one_or_none()

def update_latest_message(db: Session, chat_id: int, user_id: int | None, preview: str, timestamp: datetime) -> Chat | None:
    result = db.execute(
        update(Chat)
        .where(Chat.id == chat_id)
        .values(
            latest_message_timestamp=timestamp,
            latest_message_preview=preview[:50],
            latest_message_sender_id=user_id
        )
        .returning(Chat)
    )
    return result.scalar_one_or_none()


def clear_latest_message(db: Session, chat_id: int) -> None:
    """
    Empties the latest message fields, e.g. after the only message of the chat was deleted.
    """
    db.execute(
        update(Chat)
        .where(Chat.id == chat_id)
        .values(
            latest_message_timestamp=None,
            latest_message_preview=None,
            latest_message_sender_id=None
        )
    )


def soft_delete_message(db: Session, message_id: int) -> None:
    """
    Marks a message as deleted and empties its text and photo. The row stays in the database, so that /chats/delta
    can deliver the deletion.
    """
    db.execute(
        update(Message)
        .where(Message.id == message_id, Message.deleted_at.is_(None))
        .values(content="", image_url=None, deleted_at=func.now(), updated_at=func.now())
    )


def get_message_image_urls_of_sender(db: Session, sender_id: int) -> list[str]:
    image_urls = db.scalars(
        select(Message.image_url).where(
            Message.sender_id == sender_id, Message.deleted_at.is_(None), Message.image_url.is_not(None)
        )
    ).all()
    return [image_url for image_url in image_urls if image_url is not None]


def lock_chats_with_latest_sender(db: Session, sender_id: int) -> list[int]:
    """
    Locks the chats whose latest message was sent by the user until the end of the transaction, in ID order to avoid
    deadlocks, and returns their IDs.
    """
    return list(db.scalars(
        select(Chat.id).where(Chat.latest_message_sender_id == sender_id).order_by(Chat.id).with_for_update()
    ).all())


def lock_chats_of_user(db: Session, user_id: int) -> list[Chat]:
    """
    Locks the non-deleted chats the user is a member of until the end of the transaction, in ID order to avoid
    deadlocks, and returns them.
    """
    return list(db.scalars(
        select(Chat)
        .join(ChatUser, ChatUser.chat_id == Chat.id)
        .where(ChatUser.user_id == user_id, Chat.deleted_at.is_(None))
        .order_by(Chat.id)
        .with_for_update(of=Chat)
    ).all())


def soft_delete_messages_of_sender(db: Session, sender_id: int) -> int:
    """
    Marks all non-deleted messages of the user as deleted and empties their text and photo, like soft_delete_message.
    Returns the number of deleted messages.
    """
    result = db.execute(
        update(Message)
        .where(Message.sender_id == sender_id, Message.deleted_at.is_(None))
        .values(content="", image_url=None, deleted_at=func.now(), updated_at=func.now())
    )
    return cast(CursorResult[Any], result).rowcount


def delete_chat(db: Session, chat_id: int) -> bool:
    result = db.execute(
        delete(Chat).where(Chat.id == chat_id)
    )
    return cast(CursorResult[Any], result).rowcount > 0



def soft_delete_chat(db: Session, chat_id: int) -> None:
    db.execute(update(Chat).where(Chat.id == chat_id).values(deleted_at=func.now()))
