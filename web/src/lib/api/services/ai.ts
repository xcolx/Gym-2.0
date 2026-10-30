// Port of ios/Gym 2.0/Core/Services/AIService.swift

import { send, sendVoid } from "../client";
import type { AIConversationDTO, SendAIMessageResponseDTO, UUIDString } from "../dto";

/**
 * The server waits up to 90 seconds for the AI, so the default timeout of 30 seconds is too short. 100 seconds: Cloudflare
 * gives up on gym2.app after that anyway.
 */
const SEND_TIMEOUT_MS = 100_000;

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

  /**
   * Sends a message and waits for the answer of the AI, which can take a while. If the AI is unavailable (503),
   * nothing is stored and the message can be sent again. Sending again with the same client UUID returns the stored
   * message and answer instead of asking the AI again.
   */
  send: (content: string, conversationId: number, clientUuid?: UUIDString | null) =>
    send<SendAIMessageResponseDTO>({
      method: "POST",
      path: `/ai/conversations/${conversationId}/messages`,
      json: { content, clientUuid },
      timeoutMs: SEND_TIMEOUT_MS,
    }),
};
