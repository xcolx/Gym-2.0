from typing import Any
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db.models import AIConversation, AIMessage


def create_conversation(db: Session, user_id: int, title: str | None = None) -> AIConversation:
    db_conversation = AIConversation(
        user_id=user_id,
        title=title,
        created_at=func.now(),
        updated_at=func.now()
    )
    db.add(db_conversation)
    db.flush()
    db.refresh(db_conversation)
    return db_conversation


def create_message(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    client_uuid: UUID | None = None
) -> AIMessage:
    db_message = AIMessage(
        client_uuid=client_uuid,
        conversation_id=conversation_id,
        role=role,
        content=content,
        created_at=func.now()
    )
    db.add(db_message)
    db.flush()
    db.refresh(db_message)
    return db_message


def get_conversation(db: Session, conversation_id: int, user_id: int, for_update: bool = False) -> AIConversation | None:
    """
    for_update locks the row until the end of the transaction.
    """
    statement = select(AIConversation).where(
        AIConversation.id == conversation_id,
        AIConversation.user_id == user_id,
        AIConversation.deleted_at.is_(None)
    )
    if for_update:
        statement = statement.with_for_update()
    return db.scalars(statement).first()


def get_conversations_for_user(db: Session, user_id: int) -> list[AIConversation]:
    """
    The most recently updated first.
    """
    return list(db.scalars(
        select(AIConversation)
        .where(AIConversation.user_id == user_id, AIConversation.deleted_at.is_(None))
        .order_by(AIConversation.updated_at.desc(), AIConversation.id.desc())
    ).all())


def get_messages(db: Session, conversation_id: int) -> list[AIMessage]:
    """
    Oldest first.
    """
    return list(db.scalars(
        select(AIMessage)
        .where(AIMessage.conversation_id == conversation_id)
        .order_by(AIMessage.id)
    ).all())


def get_message_by_client_uuid(db: Session, conversation_id: int, client_uuid: UUID) -> AIMessage | None:
    return db.scalars(
        select(AIMessage).where(AIMessage.conversation_id == conversation_id, AIMessage.client_uuid == client_uuid)
    ).first()


def get_answer_to(db: Session, message: AIMessage) -> AIMessage | None:
    """
    Fetch the assistant message that directly follows the given message in its conversation.
    """
    return db.scalars(
        select(AIMessage)
        .where(
            AIMessage.conversation_id == message.conversation_id,
            AIMessage.id > message.id,
            AIMessage.role == "assistant"
        )
        .order_by(AIMessage.id)
    ).first()


def update_conversation(db: Session, conversation_id: int, title: str | None = None) -> None:
    """
    Sets updated_at to now and, if given, changes the title of the conversation.
    """
    values: dict[str, Any] = {"updated_at": func.now()}
    if title is not None:
        values["title"] = title
    db.execute(update(AIConversation).where(AIConversation.id == conversation_id).values(**values))


def soft_delete_conversation(db: Session, conversation_id: int) -> None:
    db.execute(update(AIConversation).where(AIConversation.id == conversation_id).values(deleted_at=func.now()))
