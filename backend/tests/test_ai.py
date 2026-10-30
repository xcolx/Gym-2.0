import httpx
import pytest
from conftest import new_uuid, run_sql


class FakeOllama:
    """Answers the calls of ai_service instead of the Ollama server."""

    def __init__(self, answer="Do squats.", fail=False):
        self.answer = answer
        self.fail = fail
        self.requests = []

    def __call__(self, url, json=None, timeout=None, **kwargs):
        self.requests.append({"url": url, "json": json})
        if self.fail:
            raise httpx.ConnectError("connection refused")
        return httpx.Response(200, json={"message": {"content": self.answer}}, request=httpx.Request("POST", url))


@pytest.fixture
def ollama(monkeypatch):
    fake = FakeOllama()
    monkeypatch.setattr(httpx, "post", fake)
    return fake


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
