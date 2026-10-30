import logging
from typing import Literal, cast

import httpx
from sqlalchemy.orm import Session

import app.db.queries.ai as crud
from app.core.config import settings
from app.core.errors import AIConversationNotFoundError, AIServiceUnavailableError, InvalidUserActionError
from app.db.models import AIConversation, AIMessage, User
from app.schemas import (
    AIConversationResponse,
    AIMessageResponse,
    CreateAIConversationRequest,
    SendAIMessageRequest,
    SendAIMessageResponse,
    UpdateAIConversationRequest,
)

logger = logging.getLogger(__name__)

MAX_TITLE_LENGTH = 50
MAX_MESSAGE_LENGTH = 10000
# Only the newest messages are sent to the model, so long conversations don't exceed its context window
MAX_HISTORY_MESSAGES = 50

SYSTEM_PROMPT = (
    "You are the AI coach of Gym 2.0, a workout tracking app. "
    "Help the user with training, exercises, workout plans, recovery and nutrition. "
    "Answer concisely and in the language of the user. If the language is unclear, use english as the default."
)


def _map_message(message: AIMessage) -> AIMessageResponse:
    return AIMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        role=cast(Literal["user", "assistant"], message.role),  # Checked by AIMessageResponse
        content=message.content,
        created_at=message.created_at.isoformat()
    )


def _map_conversation(conversation: AIConversation, messages: list[AIMessage]) -> AIConversationResponse:
    return AIConversationResponse(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
        messages=[_map_message(m) for m in messages]
    )


def _get_conversation(db: Session, user: User, conversation_id: int, for_update: bool = False) -> AIConversation:
    """
    Conversations of other users are reported as not found.
    """
    db_conversation = crud.get_conversation(db, conversation_id, user.id, for_update=for_update)
    if not db_conversation:
        raise AIConversationNotFoundError(f"AI conversation with ID {conversation_id} not found.")
    return db_conversation


def _validate_title(title: str) -> str:
    title = title.strip()
    if not title:
        raise InvalidUserActionError("Conversation title cannot be empty.")
    if len(title) > MAX_TITLE_LENGTH:
        raise InvalidUserActionError(f"Conversation title cannot be longer than {MAX_TITLE_LENGTH} characters.")
    return title


def _ask_model(history: list[AIMessage], content: str) -> str:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in history[-MAX_HISTORY_MESSAGES:]]
    messages.append({"role": "user", "content": content})

    try:
        response = httpx.post(
            f"{settings.OLLAMA_URL}/api/chat",
            # Thinking is turned off, because it makes the answers of small models a lot slower
            json={"model": settings.OLLAMA_MODEL, "messages": messages, "stream": False, "think": False},
            timeout=settings.OLLAMA_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        answer = response.json()["message"]["content"]
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
        logger.exception("Failed to get an answer from the Ollama server")
        raise AIServiceUnavailableError("The AI is currently unavailable. Please try again later.") from error

    if not isinstance(answer, str) or not answer.strip():
        logger.error("The Ollama server returned an empty answer")
        raise AIServiceUnavailableError("The AI returned an empty answer. Please try again.")
    return answer.strip()


def get_all_conversations(db: Session, user: User) -> list[AIConversationResponse]:
    return [_map_conversation(c, []) for c in crud.get_conversations_for_user(db, user.id)]


def get_conversation(db: Session, user: User, conversation_id: int) -> AIConversationResponse:
    db_conversation = _get_conversation(db, user, conversation_id)
    return _map_conversation(db_conversation, crud.get_messages(db, conversation_id))


def create_conversation(db: Session, user: User, payload: CreateAIConversationRequest) -> AIConversationResponse:
    title = _validate_title(payload.title) if payload.title is not None else None
    return _map_conversation(crud.create_conversation(db, user.id, title), [])


def update_conversation(db: Session, user: User, conversation_id: int, payload: UpdateAIConversationRequest) -> AIConversationResponse:
    title = _validate_title(payload.title)
    db_conversation = _get_conversation(db, user, conversation_id)

    crud.update_conversation(db, conversation_id, title=title)
    db.flush()
    db.refresh(db_conversation)

    return _map_conversation(db_conversation, [])


def delete_conversation(db: Session, user: User, conversation_id: int) -> None:
    _get_conversation(db, user, conversation_id)
    crud.soft_delete_conversation(db, conversation_id)
    db.flush()


def send_message(db: Session, user: User, conversation_id: int, payload: SendAIMessageRequest) -> SendAIMessageResponse:
    content = payload.content.strip()
    if not content:
        raise InvalidUserActionError("A message cannot be empty.")
    if len(content) > MAX_MESSAGE_LENGTH:
        raise InvalidUserActionError(f"A message cannot be longer than {MAX_MESSAGE_LENGTH} characters.")

    # Locks the conversation until the end of the transaction, so that messages to the same conversation are answered
    # one after another (each one seeing the previous answer) and a concurrent retry finds the stored message
    db_conversation = _get_conversation(db, user, conversation_id, for_update=True)

    if payload.client_uuid is not None:
        existing_message = crud.get_message_by_client_uuid(db, conversation_id, payload.client_uuid)
        if existing_message:
            existing_answer = crud.get_answer_to(db, existing_message)
            if existing_answer:
                return SendAIMessageResponse(
                    user_message=_map_message(existing_message),
                    assistant_message=_map_message(existing_answer)
                )

    answer = _ask_model(crud.get_messages(db, conversation_id), content)

    user_message = crud.create_message(db, conversation_id, "user", content, client_uuid=payload.client_uuid)
    assistant_message = crud.create_message(db, conversation_id, "assistant", answer)

    title = content[:MAX_TITLE_LENGTH].strip() if db_conversation.title is None else None
    crud.update_conversation(db, conversation_id, title=title)
    db.flush()

    return SendAIMessageResponse(
        user_message=_map_message(user_message),
        assistant_message=_map_message(assistant_message)
    )
