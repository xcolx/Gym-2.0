import json
import logging
import threading
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

import httpx
from sqlalchemy.orm import Session

import app.db.queries.ai as crud
from app.core.config import settings
from app.core.errors import (
    AIAnswerPendingError,
    AIConversationNotFoundError,
    AIServiceUnavailableError,
    InvalidUserActionError,
)
from app.db.models import AIConversation, AIMessage, User
from app.db.session import SessionLocal
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
# A stream that has nothing to send for this long sends a comment, so that no proxy closes the silent connection
# (Cloudflare does after 100 s)
HEARTBEAT_SECONDS = 15.0
# A message that is unanswered for longer than an answer can take was left behind, e.g. by a restart of the backend
ABANDONED_AFTER = timedelta(seconds=settings.AI_ANSWER_TIMEOUT_SECONDS + settings.OLLAMA_TIMEOUT_SECONDS + 30)

SYSTEM_PROMPT = (
    "You are the AI coach of Gym 2.0, a workout tracking app. "
    "Help the user with training, exercises, workout plans, recovery and nutrition. "
    "Answer concisely and in the language of the user. If the language is unclear, use english as the default."
)


def _map_message(message: AIMessage) -> AIMessageResponse:
    return AIMessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        client_uuid=message.client_uuid,
        role=cast(Literal["user", "assistant"], message.role),  # Checked by AIMessageResponse
        content=message.content,
        created_at=message.created_at.isoformat()
    )


def _map_conversation(
    conversation: AIConversation, messages: list[AIMessage], answer_pending: bool = False
) -> AIConversationResponse:
    return AIConversationResponse(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at.isoformat(),
        updated_at=conversation.updated_at.isoformat(),
        messages=[_map_message(m) for m in messages],
        answer_pending=answer_pending
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


def _ask_model(messages: list[dict[str, str]], on_text: Callable[[str], None]) -> str:
    """
    Returns the answer of the model. on_text is called with every part of it as soon as the model has written it.
    """
    deadline = time.monotonic() + settings.AI_ANSWER_TIMEOUT_SECONDS
    answer = ""
    finished = False

    try:
        with httpx.stream(
            "POST",
            f"{settings.OLLAMA_URL}/api/chat",
            # Thinking is turned off, because it makes the answers of small models a lot slower
            json={"model": settings.OLLAMA_MODEL, "messages": messages, "stream": True, "think": False},
            # For connecting and for each part of the answer, the whole answer is limited by the deadline
            timeout=settings.OLLAMA_TIMEOUT_SECONDS
        ) as response:
            response.raise_for_status()
            # One JSON object per line, the last one has "done": true
            for line in response.iter_lines():
                if not line.strip():
                    continue
                part = json.loads(line)
                if part.get("error"):
                    raise ValueError(f"The Ollama server reported an error: {part['error']}")
                text = (part.get("message") or {}).get("content") or ""
                if not answer:
                    # The stored answer is stripped, so its beginning is sent stripped as well
                    text = text.lstrip()
                if text:
                    answer += text
                    on_text(text)
                if part.get("done"):
                    finished = True
                    break
                if time.monotonic() > deadline:
                    raise TimeoutError(f"The answer took longer than {settings.AI_ANSWER_TIMEOUT_SECONDS} seconds")
        if not finished:
            raise ValueError("The answer of the Ollama server ended early")
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, TimeoutError) as error:
        logger.exception("Failed to get an answer from the Ollama server")
        raise AIServiceUnavailableError("The AI is currently unavailable. Please try again later.") from error

    if not answer.strip():
        logger.error("The Ollama server returned an empty answer")
        raise AIServiceUnavailableError("The AI returned an empty answer. Please try again.")
    return answer.strip()


def _server_sent_event(event: str, data: str) -> str:
    """data has to be a single line, like JSON. The apps rely on the event line coming right before its data line."""
    return f"event: {event}\ndata: {data}\n\n"


class AIAnswer:
    """
    The answer to one message of a user. The model writes it in a thread of its own (see _write_answer), so it is
    finished and stored no matter if the request that started it is still waiting. Any number of requests can follow
    it: the ones that stream it (server_sent_events) and the ones that wait for the whole answer (wait).
    """

    def __init__(self, user_message: AIMessageResponse) -> None:
        self.user_message = user_message
        self._changed = threading.Condition()
        self._text = ""
        self._response: SendAIMessageResponse | None = None
        self._error: AIServiceUnavailableError | None = None

    @classmethod
    def stored(cls, response: SendAIMessageResponse) -> AIAnswer:
        """An answer that is in the database already."""
        answer = cls(response.user_message)
        answer._response = response
        return answer

    def add_text(self, text: str) -> None:
        with self._changed:
            self._text += text
            self._changed.notify_all()

    def finish(self, response: SendAIMessageResponse) -> None:
        with self._changed:
            self._response = response
            self._changed.notify_all()

    def fail(self, error: AIServiceUnavailableError) -> None:
        with self._changed:
            self._error = error
            self._changed.notify_all()

    def wait(self) -> SendAIMessageResponse:
        """Waits for the whole answer. Raises AIServiceUnavailableError if the AI failed."""
        with self._changed:
            self._changed.wait_for(lambda: self._response is not None or self._error is not None)
            if self._response is None:
                # A new exception for each waiting request, they would share the traceback otherwise
                raise AIServiceUnavailableError(str(self._error))
            return self._response

    def server_sent_events(self) -> Iterator[str]:
        """
        The answer as a text/event-stream, from its beginning also when the answer has been written for a while:
        - start: {"user_message": ...}, the stored message of the user
        - delta: {"content": "..."}, the next part of the answer
        - done: the stored message and answer (SendAIMessageResponse), the content of the answer replaces the deltas
        - error: {"error": "AIServiceUnavailableError", "detail": "..."}, nothing was stored
        """
        yield _server_sent_event("start", json.dumps({"user_message": self.user_message.model_dump(mode="json")}))
        sent = 0
        while True:
            with self._changed:
                if len(self._text) == sent and self._response is None and self._error is None:
                    self._changed.wait(HEARTBEAT_SECONDS)
                text, response, error = self._text[sent:], self._response, self._error

            if text and response is None:
                sent += len(text)
                yield _server_sent_event("delta", json.dumps({"content": text}))
            elif response is not None:
                yield _server_sent_event("done", response.model_dump_json())
                return
            elif error is not None:
                yield _server_sent_event("error", json.dumps({"error": error.__class__.__name__, "detail": str(error)}))
                return
            else:
                yield ": ping\n\n"


# The answers that are being written in this process by the ID of the message they answer. The backend runs as a single
# process; with several, a request could only follow the answers of its own process and gets a 409 for the others.
_running_answers: dict[int, AIAnswer] = {}
_running_answers_lock = threading.Lock()


def _running_answer(message_id: int) -> AIAnswer | None:
    with _running_answers_lock:
        return _running_answers.get(message_id)


def _is_abandoned(message: AIMessage) -> bool:
    """Whether nothing writes the answer to this unanswered message anymore."""
    return _running_answer(message.id) is None and datetime.now(UTC) - message.created_at > ABANDONED_AFTER


def _write_answer(answer: AIAnswer, conversation_id: int, messages: list[dict[str, str]], title: str | None) -> None:
    """
    Runs in a thread per answer. Stores the answer of the model, or removes the message of the user again if the model
    failed: like that only messages with an answer stay in a conversation, and the user can send the message again.
    """
    message_id = answer.user_message.id
    try:
        content = _ask_model(messages, answer.add_text)
        with SessionLocal() as db:
            assistant_message = crud.create_message(db, conversation_id, "assistant", content)
            crud.update_conversation(db, conversation_id, title=title)
            response = SendAIMessageResponse(
                user_message=answer.user_message,
                assistant_message=_map_message(assistant_message)
            )
            db.commit()
        answer.finish(response)
    except Exception as error:
        if not isinstance(error, AIServiceUnavailableError):
            logger.exception("Failed to store the answer of the AI")
            error = AIServiceUnavailableError("The AI is currently unavailable. Please try again later.")
        try:
            with SessionLocal() as db:
                crud.delete_message(db, message_id)
                db.commit()
        except Exception:
            # Removed once it is abandoned, see _is_abandoned
            logger.exception("Failed to remove the unanswered message %s", message_id)
        answer.fail(error)
    finally:
        with _running_answers_lock:
            _running_answers.pop(message_id, None)


def get_all_conversations(db: Session, user: User) -> list[AIConversationResponse]:
    return [_map_conversation(c, []) for c in crud.get_conversations_for_user(db, user.id)]


def get_conversation(db: Session, user: User, conversation_id: int) -> AIConversationResponse:
    db_conversation = _get_conversation(db, user, conversation_id)
    messages = crud.get_messages(db, conversation_id)

    answer_pending = bool(messages) and messages[-1].role == "user"
    if answer_pending and _is_abandoned(messages[-1]):
        crud.delete_message(db, messages.pop().id)
        answer_pending = False
    return _map_conversation(db_conversation, messages, answer_pending)


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


def start_message(db: Session, user: User, conversation_id: int, payload: SendAIMessageRequest) -> AIAnswer:
    """
    Stores the message and starts writing its answer, which the returned AIAnswer follows. The message is committed
    here instead of at the end of the request: the answer is written outside of the request, and loading the
    conversation shows the message while it is being answered.

    A message that was sent before (same client_uuid) returns its answer instead, also while it is being written.
    """
    content = payload.content.strip()
    if not content:
        raise InvalidUserActionError("A message cannot be empty.")
    if len(content) > MAX_MESSAGE_LENGTH:
        raise InvalidUserActionError(f"A message cannot be longer than {MAX_MESSAGE_LENGTH} characters.")

    # Locks the conversation until the message is stored, so that of two messages sent at the same time (e.g. a
    # retry) the second one finds the first
    db_conversation = _get_conversation(db, user, conversation_id, for_update=True)
    history = crud.get_messages(db, conversation_id)

    if payload.client_uuid is not None:
        existing_message = crud.get_message_by_client_uuid(db, conversation_id, payload.client_uuid)
        if existing_message:
            existing_answer = crud.get_answer_to(db, existing_message)
            if existing_answer:
                return AIAnswer.stored(SendAIMessageResponse(
                    user_message=_map_message(existing_message),
                    assistant_message=_map_message(existing_answer)
                ))
            running_answer = _running_answer(existing_message.id)
            if running_answer:
                return running_answer

    # Only the last message can be unanswered: no other message is accepted until it has its answer or is removed
    if history and history[-1].role == "user":
        if not _is_abandoned(history[-1]):
            raise AIAnswerPendingError("Gym-AI is still answering the previous message. Please wait for its answer.")
        crud.delete_message(db, history.pop().id)

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in history[-MAX_HISTORY_MESSAGES:]]
    messages.append({"role": "user", "content": content})

    user_message = crud.create_message(db, conversation_id, "user", content, client_uuid=payload.client_uuid)
    # Set together with the answer, so a failed first message leaves the conversation without a title
    title = content[:MAX_TITLE_LENGTH].strip() if db_conversation.title is None else None
    answer = AIAnswer(_map_message(user_message))

    # Registered before the commit: a retry that finds the message also finds its answer
    with _running_answers_lock:
        _running_answers[user_message.id] = answer
    try:
        db.commit()
    except Exception:
        with _running_answers_lock:
            _running_answers.pop(user_message.id, None)
        raise

    threading.Thread(
        target=_write_answer,
        args=(answer, conversation_id, messages, title),
        name=f"ai-answer-{user_message.id}",
        daemon=True
    ).start()
    return answer


def send_message(db: Session, user: User, conversation_id: int, payload: SendAIMessageRequest) -> SendAIMessageResponse:
    """Waits for the whole answer. Raises AIServiceUnavailableError if the AI failed, nothing is stored then."""
    return start_message(db, user, conversation_id, payload).wait()
