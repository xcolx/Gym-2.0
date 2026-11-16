// Port of ios/Gym 2.0/Core/Services/AIService.swift

import { keysToCamelCase } from "../case";
import { send, sendForEvents, sendVoid } from "../client";
import type { AIAnswerEvent, AIConversationDTO, AIMessageDTO, SendAIMessageResponseDTO, UUIDString } from "../dto";
import { ApiError } from "../errors";

/**
 * Until the answer starts: the server answers as soon as it has stored the message. The answer itself can take minutes,
 * a connection that is lost meanwhile is noticed by the missing events (see sendForEvents).
 */
const STREAM_START_TIMEOUT_MS = 30_000;

/**
 * Sends a message and yields the answer of the AI while it is written: `start` once the message is stored, a `delta`
 * for each part of the answer and `done` with the stored message and answer.
 *
 * Throws a `server` error with the code "AIServiceUnavailableError" if the AI fails: nothing is stored then and the
 * message can be sent again. A lost connection (`transport` error) doesn't stop the answer: it is written and stored
 * anyway, the conversation has it later (`answerPending`). Sending again with the same client UUID follows the answer
 * that is being written or returns the stored one, instead of asking the AI again.
 */
async function* sendStreaming(content: string, conversationId: number, clientUuid?: UUIDString | null): AsyncGenerator<AIAnswerEvent> {
  const events = sendForEvents({
    method: "POST",
    path: `/ai/conversations/${conversationId}/messages/stream`,
    json: { content, clientUuid },
    timeoutMs: STREAM_START_TIMEOUT_MS,
  });
  for await (const { event, data } of events) {
    let payload: unknown;
    try {
      payload = keysToCamelCase(JSON.parse(data));
    } catch (error) {
      throw new ApiError("decoding", { cause: error });
    }
    if (event === "start") {
      yield { type: "start", userMessage: (payload as { userMessage: AIMessageDTO }).userMessage };
    } else if (event === "delta") {
      yield { type: "delta", content: (payload as { content: string }).content };
    } else if (event === "done") {
      yield { type: "done", response: payload as SendAIMessageResponseDTO };
      return;
    } else if (event === "error") {
      const { error, detail } = payload as { error?: string; detail?: string };
      throw new ApiError("server", { status: 503, code: error, message: detail });
    }
  }
  // Ended without the answer, e.g. because the backend was stopped
  throw new ApiError("transport");
}

export const aiApi = {
  /** All conversations without their messages, the most recently updated first. */
  conversations: () => send<AIConversationDTO[]>({ method: "GET", path: "/ai/conversations" }),

  conversation: (id: number) => send<AIConversationDTO>({ method: "GET", path: `/ai/conversations/${id}` }),

  /** Creates an empty conversation. Without a title, the beginning of the first message becomes the title. */
  createConversation: (title?: string | null) =>
    send<AIConversationDTO>({ method: "POST", path: "/ai/conversations", json: { title } }),

  renameConversation: (id: number, title: string) =>
    send<AIConversationDTO>({ method: "PATCH", path: `/ai/conversations/${id}`, json: { title } }),

  deleteConversation: (id: number) => sendVoid({ method: "DELETE", path: `/ai/conversations/${id}` }),

  sendStreaming,
};
