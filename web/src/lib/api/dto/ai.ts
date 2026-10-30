// Mirrors ios/Gym 2.0/Core/Networking/DTOs/AIDTOs.swift and backend/app/schemas/ai.py

import type { ISODateString } from "./common";

export interface AIConversationDTO {
  id: number;
  /** Null until it is set or the first message is sent, which then becomes the title (at most 50 characters). */
  title: string | null;
  createdAt: ISODateString;
  /** Date of the latest message or rename. */
  updatedAt: ISODateString;
  /** Ordered from oldest to newest. Empty in the list of conversations. */
  messages: AIMessageDTO[];
}

export type AIMessageRole = "user" | "assistant";

export interface AIMessageDTO {
  id: number;
  conversationId: number;
  role: AIMessageRole;
  content: string;
  createdAt: ISODateString;
}

export interface SendAIMessageResponseDTO {
  userMessage: AIMessageDTO;
  assistantMessage: AIMessageDTO;
}
