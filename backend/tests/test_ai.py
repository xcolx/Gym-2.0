import json
import re
import threading
from concurrent.futures import Future
from contextlib import contextmanager
from datetime import timedelta

import httpx
import pytest
from conftest import new_client, new_uuid, run_sql

from app.db.models import User
from app.schemas import SendAIMessageRequest
from app.services import ai_service


class FakeOllama:
    """Answers the calls of ai_service instead of the Ollama server: streams the answer word by word."""

    def __init__(self, answer="Do squats.", fail=False):
        self.answer = answer
        self.fail = fail
        # Set to make the answer break off after its first word
        self.fail_midway = False
        self.requests = []
        # Cleared by a test to hold the answer back after its first word, until the test sets it again
        self.release = threading.Event()
        self.release.set()
        # Set once the first word of an answer was sent
        self.started = threading.Event()

    @contextmanager
    def __call__(self, method, url, json=None, timeout=None, **kwargs):
        self.requests.append({"url": url, "json": json})
        if self.fail:
            raise httpx.ConnectError("connection refused")
        yield self

    def raise_for_status(self):
        pass

    def iter_lines(self):
        words = re.findall(r"\s*\S+\s*", self.answer) or [self.answer]
        for index, word in enumerate(words):
            yield json.dumps({"message": {"role": "assistant", "content": word}, "done": False})
            if index == 0:
                self.started.set()
                assert self.release.wait(10), "The test never released the answer."
                if self.fail_midway:
                    raise httpx.ReadError("connection lost")
        yield json.dumps({"message": {"role": "assistant", "content": ""}, "done": True})


@pytest.fixture
def ollama(monkeypatch):
    fake = FakeOllama()
    monkeypatch.setattr(httpx, "stream", fake)
    return fake


def read_events(response) -> list[tuple[str, dict]]:
    """The events of a text/event-stream response, without the comments that keep the connection open."""
    events = []
    for block in response.text.split("\n\n"):
        lines = [line for line in block.split("\n") if line and not line.startswith(":")]
        if lines:
            assert lines[0].startswith("event: ") and lines[1].startswith("data: ") and len(lines) == 2, block
            events.append((lines[0].removeprefix("event: "), json.loads(lines[1].removeprefix("data: "))))
    return events


def in_thread(function, *args, **kwargs) -> Future:
    """Runs a request next to the test, e.g. one that waits for an answer the test holds back."""
    future: Future = Future()

    def run():
        try:
            future.set_result(function(*args, **kwargs))
        except BaseException as error:
            future.set_exception(error)

    threading.Thread(target=run, daemon=True).start()
    return future


def create_conversation(user, **payload) -> dict:
    response = user.client.post("/v1/ai/conversations", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_send_message_stores_message_and_answer(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)

    response = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "  How do I get stronger?  "})

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user_message"]["role"] == "user" and body["user_message"]["content"] == "How do I get stronger?"
    assert body["assistant_message"]["role"] == "assistant" and body["assistant_message"]["content"] == "Do squats."
    sent = ollama.requests[0]["json"]
    assert ollama.requests[0]["url"].endswith("/api/chat")
    assert sent["messages"][0]["role"] == "system"
    assert sent["messages"][-1] == {"role": "user", "content": "How do I get stronger?"}
    # The first message becomes the title
    stored = user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()
    assert stored["title"] == "How do I get stronger?"
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant"]


def test_history_is_sent_with_next_message(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user, title="Coach")
    user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "first"})

    user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "second"})

    roles = [(m["role"], m["content"]) for m in ollama.requests[1]["json"]["messages"][1:]]
    assert roles == [("user", "first"), ("assistant", "Do squats."), ("user", "second")]
    assert user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()["title"] == "Coach"


def test_unavailable_ai_stores_nothing(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    ollama.fail = True

    response = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "hello"})

    assert response.status_code == 503
    assert response.json()["error"] == "AIServiceUnavailableError"
    assert run_sql("SELECT count(*) FROM ai_message")[0][0] == 0


def test_empty_answer_is_unavailable(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    ollama.answer = "   "

    assert user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "hello"}).status_code == 503


def test_resent_message_returns_stored_answer(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    client_uuid = new_uuid()

    first = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "hi", "client_uuid": client_uuid}).json()
    retry = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "hi", "client_uuid": client_uuid}).json()

    assert retry == first
    assert len(ollama.requests) == 1


def test_conversations_are_private(make_user, ollama):
    alice, bob = make_user(), make_user()
    conversation = create_conversation(alice)

    assert bob.client.get(f"/v1/ai/conversations/{conversation['id']}").status_code == 404
    assert bob.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "hi"}).status_code == 404
    assert bob.client.patch(f"/v1/ai/conversations/{conversation['id']}", json={"title": "x"}).status_code == 404
    assert bob.client.delete(f"/v1/ai/conversations/{conversation['id']}").status_code == 404
    assert bob.client.get("/v1/ai/conversations").json() == []
    assert ollama.requests == []


def test_rename_and_delete_conversation(make_user):
    user = make_user()
    conversation = create_conversation(user, title="Old")

    renamed = user.client.patch(f"/v1/ai/conversations/{conversation['id']}", json={"title": "  New  "})
    empty = user.client.patch(f"/v1/ai/conversations/{conversation['id']}", json={"title": "   "})
    deleted = user.client.delete(f"/v1/ai/conversations/{conversation['id']}")

    assert renamed.status_code == 200 and renamed.json()["title"] == "New"
    assert empty.status_code == 400
    assert deleted.status_code == 204
    assert user.client.get("/v1/ai/conversations").json() == []
    assert user.client.get(f"/v1/ai/conversations/{conversation['id']}").status_code == 404


def test_empty_message_is_rejected(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)

    assert user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages", json={"content": "   "}).status_code == 400
    assert ollama.requests == []


def test_stream_sends_the_answer_in_parts(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    ollama.answer = "  Do squats\nand rest. "

    response = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages/stream", json={"content": " Legs? "})

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "no-transform" in response.headers["cache-control"]
    events = read_events(response)
    # How many parts there are depends on how fast they are read, the end may only come with the stored answer
    assert [name for name, _ in events] == ["start", *["delta"] * (len(events) - 2), "done"] and len(events) > 2
    assert events[0][1]["user_message"]["content"] == "Legs?"
    assert "Do squats\nand rest. ".startswith("".join(data["content"] for name, data in events if name == "delta"))
    done = events[-1][1]
    assert done["user_message"] == events[0][1]["user_message"]
    assert done["assistant_message"]["content"] == "Do squats\nand rest."
    assert ollama.requests[0]["json"]["stream"] is True
    stored = user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()
    assert stored["messages"] == [done["user_message"], done["assistant_message"]]
    assert stored["title"] == "Legs?" and stored["answer_pending"] is False


def test_stream_reports_a_failing_ai_and_stores_nothing(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    ollama.fail_midway = True

    response = user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages/stream", json={"content": "hello"})

    events = read_events(response)
    assert [name for name, _ in events] == ["start", "delta", "error"]
    assert events[-1][1]["error"] == "AIServiceUnavailableError"
    assert run_sql("SELECT count(*) FROM ai_message")[0][0] == 0
    stored = user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()
    assert stored["title"] is None and stored["answer_pending"] is False


def test_stream_rejects_before_streaming(make_user, ollama):
    alice, bob = make_user(), make_user()
    conversation = create_conversation(alice)
    path = f"/v1/ai/conversations/{conversation['id']}/messages/stream"

    assert alice.client.post(path, json={"content": "   "}).status_code == 400
    assert bob.client.post(path, json={"content": "hi"}).status_code == 404
    assert new_client().post(path, json={"content": "hi"}).status_code == 401
    assert ollama.requests == []


def test_resent_stream_returns_stored_answer(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    payload = {"content": "hi", "client_uuid": new_uuid()}

    first = read_events(user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages/stream", json=payload))
    retry = read_events(user.client.post(f"/v1/ai/conversations/{conversation['id']}/messages/stream", json=payload))

    assert retry == [first[0], first[-1]]
    assert first[0][1]["user_message"]["client_uuid"] == payload["client_uuid"]
    assert len(ollama.requests) == 1


def test_answer_is_pending_while_it_is_written(make_user, ollama):
    user = make_user()
    conversation = create_conversation(user)
    path = f"/v1/ai/conversations/{conversation['id']}"
    payload = {"content": "hi", "client_uuid": new_uuid()}
    ollama.release.clear()

    stream = in_thread(user.client.post, f"{path}/messages/stream", json=payload)
    assert ollama.started.wait(10)

    # The message is stored already and the conversation accepts no other one
    pending = user.client.get(path).json()
    assert pending["answer_pending"] is True
    assert [(m["role"], m["content"]) for m in pending["messages"]] == [("user", "hi")]
    other = user.client.post(f"{path}/messages", json={"content": "and this?"})
    assert other.status_code == 409 and other.json()["error"] == "AIAnswerPendingError"
    # The same message sent again follows the answer that is being written, from its beginning
    retry_stream = in_thread(user.client.post, f"{path}/messages/stream", json=payload)
    retry = in_thread(user.client.post, f"{path}/messages", json=payload)

    ollama.release.set()
    events = read_events(stream.result(10))
    retry_events = read_events(retry_stream.result(10))

    assert events[-1][0] == "done" and retry_events[0] == events[0] and retry_events[-1] == events[-1]
    assert retry.result(10).json() == events[-1][1]
    assert len(ollama.requests) == 1
    assert user.client.get(path).json()["answer_pending"] is False


def test_answer_is_stored_without_a_waiting_request(make_user, ollama, db):
    """Like after a lost connection: nothing reads the events, the conversation has the answer anyway."""
    user = make_user()
    conversation = create_conversation(user)
    ollama.release.clear()

    answer = ai_service.start_message(db, db.get(User, user.id), conversation["id"], SendAIMessageRequest(content="hi"))
    db.rollback()
    assert ollama.started.wait(10)
    assert user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()["answer_pending"] is True
    ollama.release.set()
    answer.wait()

    stored = user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()
    assert [(m["role"], m["content"]) for m in stored["messages"]] == [("user", "hi"), ("assistant", "Do squats.")]
    assert stored["answer_pending"] is False


def test_abandoned_message_is_removed(make_user, ollama):
    """A message whose answer was never stored, e.g. because the backend was restarted meanwhile."""
    user = make_user()
    conversation = create_conversation(user)
    path = f"/v1/ai/conversations/{conversation['id']}"
    run_sql(
        "INSERT INTO ai_message (conversation_id, role, content, created_at) VALUES (:id, 'user', 'lost', now() - :age)",
        id=conversation["id"], age=ai_service.ABANDONED_AFTER - timedelta(seconds=5)
    )

    # Could still be answered by another process
    assert user.client.get(path).json()["answer_pending"] is True
    assert user.client.post(f"{path}/messages", json={"content": "hi"}).status_code == 409

    run_sql("UPDATE ai_message SET created_at = created_at - interval '10 seconds'")
    response = user.client.post(f"{path}/messages", json={"content": "hi"})

    assert response.status_code == 201, response.text
    assert [m["content"] for m in ollama.requests[0]["json"]["messages"][1:]] == ["hi"]
    assert [m["content"] for m in user.client.get(path).json()["messages"]] == ["hi", "Do squats."]


def test_loading_removes_an_abandoned_message(make_user):
    user = make_user()
    conversation = create_conversation(user)
    run_sql(
        "INSERT INTO ai_message (conversation_id, role, content, created_at) VALUES (:id, 'user', 'lost', now() - :age)",
        id=conversation["id"], age=ai_service.ABANDONED_AFTER + timedelta(seconds=5)
    )

    stored = user.client.get(f"/v1/ai/conversations/{conversation['id']}").json()

    assert stored["messages"] == [] and stored["answer_pending"] is False
    assert run_sql("SELECT count(*) FROM ai_message")[0][0] == 0


def test_stream_keeps_a_silent_connection_open(make_user, ollama, monkeypatch):
    user = make_user()
    conversation = create_conversation(user)
    monkeypatch.setattr(ai_service, "HEARTBEAT_SECONDS", 0.05)
    ollama.release.clear()

    stream = in_thread(user.client.post, f"/v1/ai/conversations/{conversation['id']}/messages/stream", json={"content": "hi"})
    assert ollama.started.wait(10)
    threading.Event().wait(0.3)
    ollama.release.set()

    response = stream.result(10)
    assert ": ping\n\n" in response.text
    assert read_events(response)[-1][0] == "done"
