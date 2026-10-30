import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { AIConversationDTO, SendAIMessageResponseDTO } from "@/lib/api/dto";
import { AIChatModel, AIConversationsModel, type AIChatService } from "./ai-chat";

const conversation = (id: number, title: string | null, messages: AIConversationDTO["messages"] = []): AIConversationDTO => ({
  id,
  title,
  createdAt: "2026-10-15T08:00:00+00:00",
  updatedAt: "2026-10-15T08:00:00+00:00",
  messages,
});

function response(conversationId: number, content: string): SendAIMessageResponseDTO {
  return {
    userMessage: { id: 1, conversationId, role: "user", content, createdAt: "2026-10-15T08:01:00+00:00" },
    assistantMessage: { id: 2, conversationId, role: "assistant", content: "Answer", createdAt: "2026-10-15T08:02:00+00:00" },
  };
}

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("AIChatModel", () => {
  it("creates the conversation with the first message and takes it as title", async () => {
    const service: AIChatService = {
      conversation: vi.fn(),
      createConversation: vi.fn(async () => conversation(7, null)),
      send: vi.fn(async (content: string, conversationId: number) => response(conversationId, content)),
    };
    const model = new AIChatModel(null, service, ids());
    await model.send("  How many sets?  ");

    expect(service.send).toHaveBeenCalledWith("How many sets?", 7, "id-1");
    expect(model.state.conversationId).toBe(7);
    expect(model.state.title).toBe("How many sets?");
    expect(model.state.messages.map((m) => [m.role, m.content, m.status.kind])).toEqual([
      ["user", "How many sets?", "sent"],
      ["assistant", "Answer", "sent"],
    ]);
    expect(model.state.isWaitingForAnswer).toBe(false);
  });

  it("marks a message as failed and sends it again with the same UUID", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("server", { status: 503, message: "Gym-AI is unavailable." }))
      .mockImplementation(async (content: string, conversationId: number) => response(conversationId, content));
    const model = new AIChatModel({ id: 3, title: "Old" }, { conversation: vi.fn(), createConversation: vi.fn(), send }, ids());

    await model.send("Hi");
    expect(model.state.messages[0].status).toEqual({ kind: "failed", error: "Gym-AI is unavailable." });
    expect(AIChatModel.canSend(model.state)).toBe(false);

    await model.retry("id-1");
    expect(send).toHaveBeenLastCalledWith("Hi", 3, "id-1");
    expect(model.state.messages).toHaveLength(2);
    expect(model.state.title).toBe("Old");
    expect(AIChatModel.canSend(model.state)).toBe(true);
  });

  it("discards a failed message", async () => {
    const send = vi.fn().mockRejectedValue(new ApiError("transport"));
    const model = new AIChatModel({ id: 3, title: null }, { conversation: vi.fn(), createConversation: vi.fn(), send }, ids());
    await model.send("Hi");
    model.discard("id-1");
    expect(model.state.messages).toEqual([]);
  });

  it("loads the messages of a conversation once", async () => {
    const service: AIChatService = {
      conversation: vi.fn(async () =>
        conversation(4, "Legs", [{ id: 1, conversationId: 4, role: "user", content: "Q", createdAt: "2026-10-15T08:00:00+00:00" }]),
      ),
      createConversation: vi.fn(),
      send: vi.fn(),
    };
    const model = new AIChatModel({ id: 4, title: null }, service, ids());
    await model.load();
    await model.load();
    expect(service.conversation).toHaveBeenCalledTimes(1);
    expect(model.state.title).toBe("Legs");
    expect(model.state.messages[0].content).toBe("Q");
  });

  it("keeps the load error", async () => {
    const model = new AIChatModel(
      { id: 4, title: null },
      { conversation: vi.fn().mockRejectedValue(new ApiError("transport")), createConversation: vi.fn(), send: vi.fn() },
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
