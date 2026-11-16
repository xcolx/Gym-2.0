// Mirrors ios/Gym 2.0/Core/Networking/DTOs/AIDTOs.swift and backend/app/schemas/ai.py

import type { ISODateString, UUIDString } from "./common";

export interface AIConversationDTO {
  id: number;
  /** Null until it is set or the first message is sent, which then becomes the title (at most 50 characters). */
  title: string | null;
  createdAt: ISODateString;
  /** Date of the latest message or rename. */
  updatedAt: ISODateString;
  /** Ordered from oldest to newest. Empty in the list of conversations. */
  messages: AIMessageDTO[];
  /**
   * Whether the AI is still answering the last message, which is the user's then. Loading the conversation again a few
   * seconds later has the answer, or neither of them if the AI failed. Always false in the list of conversations.
   */
  answerPending: boolean;
}

export type AIMessageRole = "user" | "assistant";

export interface AIMessageDTO {
  id: number;
  conversationId: number;
  /** The client UUID the message was sent with, null for the answers of the AI */
  clientUuid: UUIDString | null;
  role: AIMessageRole;
  content: string;
  createdAt: ISODateString;
}

export interface SendAIMessageResponseDTO {
  userMessage: AIMessageDTO;
  assistantMessage: AIMessageDTO;
}

/** What the server sends while the AI answers a message (POST /ai/conversations/{id}/messages/stream) */
export type AIAnswerEvent =
  /** The message is stored, the answer is written from now on also without this connection */
  | { type: "start"; userMessage: AIMessageDTO }
  /** The next part of the answer */
  | { type: "delta"; content: string }
  /** The stored message and answer, whose content replaces the parts */
  | { type: "done"; response: SendAIMessageResponseDTO };
