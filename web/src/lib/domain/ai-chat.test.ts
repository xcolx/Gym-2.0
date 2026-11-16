import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { AIAnswerEvent, AIConversationDTO, AIMessageDTO, SendAIMessageResponseDTO } from "@/lib/api/dto";
import { AIChatModel, AIConversationsModel, type AIChatService } from "./ai-chat";

const conversation = (
  id: number,
  title: string | null,
  messages: AIConversationDTO["messages"] = [],
  answerPending = false,
): AIConversationDTO => ({
  id,
  title,
  createdAt: "2026-10-15T08:00:00+00:00",
  updatedAt: "2026-10-15T08:00:00+00:00",
  messages,
  answerPending,
});

const userMessage = (conversationId: number, content: string, clientUuid: string | null = null): AIMessageDTO => ({
  id: 1,
  conversationId,
  clientUuid,
  role: "user",
  content,
  createdAt: "2026-10-15T08:01:00+00:00",
});

const answerMessage = (conversationId: number, content = "Answer"): AIMessageDTO => ({
  id: 2,
  conversationId,
  clientUuid: null,
  role: "assistant",
  content,
  createdAt: "2026-10-15T08:02:00+00:00",
});

function response(conversationId: number, content: string, clientUuid: string | null = null): SendAIMessageResponseDTO {
  return { userMessage: userMessage(conversationId, content, clientUuid), assistantMessage: answerMessage(conversationId) };
}

/** Streams "Answer" in two parts like the server */
async function* answer(content: string, conversationId: number, clientUuid: string): AsyncGenerator<AIAnswerEvent> {
  yield { type: "start", userMessage: userMessage(conversationId, content, clientUuid) };
  yield { type: "delta", content: "Ans" };
  yield { type: "delta", content: "wer" };
  yield { type: "done", response: response(conversationId, content, clientUuid) };
}

/** Fails with the error, after the given events */
function failing(error: unknown, events: AIAnswerEvent[] = []) {
  return async function* (): AsyncGenerator<AIAnswerEvent> {
    yield* events;
    throw error;
  };
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

const noWait = async () => {};

describe("AIChatModel", () => {
  it("creates the conversation with the first message and takes it as title", async () => {
    const service: AIChatService = {
      conversation: vi.fn(),
      createConversation: vi.fn(async () => conversation(7, null)),
      sendStreaming: vi.fn(answer),
    };
    const model = new AIChatModel(null, service, ids());
    await model.send("  How many sets?  ");

    expect(service.sendStreaming).toHaveBeenCalledWith("How many sets?", 7, "id-1");
    expect(model.state.conversationId).toBe(7);
    expect(model.state.title).toBe("How many sets?");
    expect(model.state.messages.map((m) => [m.role, m.content, m.status.kind])).toEqual([
      ["user", "How many sets?", "sent"],
      ["assistant", "Answer", "sent"],
    ]);
    expect(model.state.isWaitingForAnswer).toBe(false);
    expect(model.state.streamingAnswer).toBeNull();
  });

  it("shows the answer while it is written", async () => {
    const model = new AIChatModel({ id: 3, title: "Old" }, { conversation: vi.fn(), createConversation: vi.fn(), sendStreaming: answer }, ids());
    const shown: [boolean, string | null, number][] = [];
    model.store.subscribe(() => shown.push([model.state.isWaitingForAnswer, model.state.streamingAnswer, model.state.messages.length]));

    await model.send("Hi");

    // The typing indicator first, then the growing answer, which the stored answer replaces
    expect(shown).toContainEqual([true, null, 1]);
    expect(shown).toContainEqual([true, "Ans", 1]);
    expect(shown).toContainEqual([true, "Answer", 1]);
    expect(shown.at(-1)).toEqual([false, null, 2]);
  });

  it("marks a message as failed and sends it again with the same UUID", async () => {
    const sendStreaming = vi
      .fn<AIChatService["sendStreaming"]>()
      .mockImplementationOnce(
        failing(new ApiError("server", { status: 503, code: "AIServiceUnavailableError", message: "Gym-AI is unavailable." }), [
          { type: "delta", content: "Ans" },
        ]),
      )
      .mockImplementation(answer);
    const conversationOf = vi.fn();
    const model = new AIChatModel({ id: 3, title: "Old" }, { conversation: conversationOf, createConversation: vi.fn(), sendStreaming }, ids());

    await model.send("Hi");
    expect(model.state.messages[0].status).toEqual({ kind: "failed", error: "Gym-AI is unavailable." });
    expect(model.state.streamingAnswer).toBeNull();
    expect(AIChatModel.canSend(model.state)).toBe(false);
    // The AI failed, so there is no answer to wait for
    expect(conversationOf).not.toHaveBeenCalled();

    await model.retry("id-1");
    expect(sendStreaming).toHaveBeenLastCalledWith("Hi", 3, "id-1");
    expect(model.state.messages).toHaveLength(2);
    expect(model.state.title).toBe("Old");
    expect(AIChatModel.canSend(model.state)).toBe(true);
  });

  it("loads the conversation until it has the answer after the connection was lost", async () => {
    const lost = failing(new ApiError("transport"), [{ type: "delta", content: "Ans" }]);
    const conversationOf = vi
      .fn()
      .mockResolvedValueOnce(conversation(3, null, [userMessage(3, "Hi", "id-1")], true))
      .mockResolvedValueOnce(conversation(3, "Hi", [userMessage(3, "Hi", "id-1"), answerMessage(3)]));
    const wait = vi.fn(noWait);
    const model = new AIChatModel({ id: 3, title: null }, { conversation: conversationOf, createConversation: vi.fn(), sendStreaming: lost }, ids(), wait);

    await model.send("Hi");

    expect(conversationOf).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(model.state.messages.map((m) => [m.id, m.content, m.status.kind])).toEqual([
      ["id-1", "Hi", "sent"],
      ["id-2", "Answer", "sent"],
    ]);
    expect(model.state.title).toBe("Hi");
    expect(model.state.isWaitingForAnswer).toBe(false);
  });

  it("marks the message as failed if the server doesn't have it after the connection was lost", async () => {
    const sendStreaming = vi.fn<AIChatService["sendStreaming"]>(failing(new ApiError("transport")));
    const conversationOf = vi.fn(async () => conversation(3, null));
    const model = new AIChatModel({ id: 3, title: null }, { conversation: conversationOf, createConversation: vi.fn(), sendStreaming }, ids(), noWait);

    await model.send("Hi");

    expect(model.state.messages.map((m) => m.status)).toEqual([
      { kind: "failed", error: "Could not reach the server. Please check your internet connection." },
    ]);
  });

  it("waits for the answer of an earlier try instead of failing", async () => {
    const pending = failing(new ApiError("server", { status: 409, code: "AIAnswerPendingError", message: "Still answering." }));
    const conversationOf = vi.fn(async () => conversation(3, "Hi", [userMessage(3, "Hi", "ID-1"), answerMessage(3)]));
    const model = new AIChatModel({ id: 3, title: null }, { conversation: conversationOf, createConversation: vi.fn(), sendStreaming: pending }, ids(), noWait);

    await model.send("Hi");

    expect(model.state.messages.map((m) => [m.content, m.status.kind])).toEqual([
      ["Hi", "sent"],
      ["Answer", "sent"],
    ]);
  });

  it("discards a failed message", async () => {
    const sendStreaming = failing(new ApiError("transport"));
    const conversationOf = vi.fn().mockRejectedValue(new ApiError("transport"));
    const model = new AIChatModel({ id: 3, title: null }, { conversation: conversationOf, createConversation: vi.fn(), sendStreaming }, ids());
    await model.send("Hi");
    expect(model.state.messages[0].status.kind).toBe("failed");
    model.discard("id-1");
    expect(model.state.messages).toEqual([]);
  });

  it("loads the messages of a conversation once", async () => {
    const service: AIChatService = {
      conversation: vi.fn(async () => conversation(4, "Legs", [userMessage(4, "Q", "uuid-q"), answerMessage(4)])),
      createConversation: vi.fn(),
      sendStreaming: vi.fn(),
    };
    const model = new AIChatModel({ id: 4, title: null }, service, ids());
    await model.load();
    await model.load();
    expect(service.conversation).toHaveBeenCalledTimes(1);
    expect(model.state.title).toBe("Legs");
    expect(model.state.messages.map((m) => [m.id, m.content])).toEqual([
      ["uuid-q", "Q"],
      ["id-1", "Answer"],
    ]);
    expect(model.state.isWaitingForAnswer).toBe(false);
  });

  it("loads a conversation again until the pending answer is there", async () => {
    const conversationOf = vi
      .fn()
      .mockResolvedValueOnce(conversation(4, null, [userMessage(4, "Q")], true))
      .mockResolvedValueOnce(conversation(4, null, [userMessage(4, "Q")], true))
      .mockResolvedValueOnce(conversation(4, "Q", [userMessage(4, "Q"), answerMessage(4)]));
    const waiting: boolean[] = [];
    const model: AIChatModel = new AIChatModel(
      { id: 4, title: null },
      { conversation: conversationOf, createConversation: vi.fn(), sendStreaming: vi.fn() },
      ids(),
      async () => void waiting.push(model.state.isWaitingForAnswer),
    );

    await model.load();

    expect(waiting).toEqual([true, true]);
    expect(conversationOf).toHaveBeenCalledTimes(3);
    expect(model.state.messages.map((m) => m.content)).toEqual(["Q", "Answer"]);
    expect(model.state.title).toBe("Q");
    expect(model.state.isWaitingForAnswer).toBe(false);
    expect(AIChatModel.canSend(model.state)).toBe(true);
  });

  it("stops loading for the pending answer when the chat is closed", async () => {
    const conversationOf = vi.fn(async () => conversation(4, null, [userMessage(4, "Q")], true));
    const model: AIChatModel = new AIChatModel(
      { id: 4, title: null },
      { conversation: conversationOf, createConversation: vi.fn(), sendStreaming: vi.fn() },
      ids(),
      async () => model.close(),
    );

    await model.load();

    expect(conversationOf).toHaveBeenCalledTimes(1);
    expect(model.state.isWaitingForAnswer).toBe(false);
  });

  it("keeps the load error", async () => {
    const model = new AIChatModel(
      { id: 4, title: null },
      { conversation: vi.fn().mockRejectedValue(new ApiError("transport")), createConversation: vi.fn(), sendStreaming: vi.fn() },
    );
    await model.load();
    expect(model.state.loadError).toBe("Could not reach the server. Please check your internet connection.");
    expect(AIChatModel.canSendText(model.state, "Hi")).toBe(false);
  });
});

describe("AIConversationsModel", () => {
  it("puts a deleted conversation back if the server fails", async () => {
    const model = new AIConversationsModel({
      conversations: vi.fn(async () => [conversation(1, "A"), conversation(2, "B")]),
      deleteConversation: vi.fn().mockRejectedValue(new ApiError("transport")),
      renameConversation: vi.fn(),
    });
    await model.load();
    await model.delete(model.state.conversations[0]);
    expect(model.state.conversations.map((c) => c.id)).toEqual([1, 2]);
    expect(model.state.actionError).not.toBeNull();
  });

  it("moves a renamed conversation to the top", async () => {
    const model = new AIConversationsModel({
      conversations: vi.fn(async () => [conversation(1, "A"), conversation(2, "B")]),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(async (id: number, title: string) => conversation(id, title)),
    });
    await model.load();
    await model.rename(model.state.conversations[1], "  New  ");
    expect(model.state.conversations.map((c) => c.title)).toEqual(["New", "A"]);
  });
});
