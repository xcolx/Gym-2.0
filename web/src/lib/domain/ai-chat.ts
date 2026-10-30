// Port of ios/Gym 2.0/Features/Chat/AI/AIChatViewModel.swift. The models hold their state in a store
// (`useStore(model.store)` in a component) and get the service passed in.

import type { AIConversationDTO, AIMessageDTO, AIMessageRole, SendAIMessageResponseDTO } from "@/lib/api/dto";
import { parseServerDate } from "@/lib/api/mapping";
import { createStore, type Store } from "@/lib/store";
import { newUUID } from "@/lib/uuid";
import { characterCount, prefixCharacters } from "./format";

/** AIChatViewModel.maxMessageLength, like the backend */
const MAX_AI_MESSAGE_LENGTH = 10_000;
/** The backend's limit of a conversation title */
export const MAX_AI_TITLE_LENGTH = 50;

export type AIChatMessageStatus =
  | { kind: "sent" }
  /** Sending failed with the error message. The message can be sent again or discarded. */
  | { kind: "failed"; error: string };

/**
 * A message shown in the AI chat. The user's messages are shown as sent right away, the typing indicator shows that
 * the answer is still coming. The server only stores a message together with its answer, so if that fails, the
 * message is marked as failed.
 */
export interface AIChatMessage {
  /**
   * Stays the same while the message is sent. For messages sent from this device it is also the client UUID, so
   * sending again after a lost response returns the stored answer instead of asking the AI a second time.
   */
  id: string;
  role: AIMessageRole;
  content: string;
  date: Date;
  status: AIChatMessageStatus;
}

function aiChatMessageFromDTO(dto: AIMessageDTO, id: string = newUUID()): AIChatMessage {
  return { id, role: dto.role, content: dto.content, date: parseServerDate(dto.createdAt), status: { kind: "sent" } };
}

export interface AIChatService {
  conversation(id: number): Promise<AIConversationDTO>;
  createConversation(): Promise<AIConversationDTO>;
  send(content: string, conversationId: number, clientUuid: string): Promise<SendAIMessageResponseDTO>;
}

interface AIChatState {
  conversationId: number | null;
  title: string | null;
  messages: AIChatMessage[];
  isLoading: boolean;
  isWaitingForAnswer: boolean;
  loadError: string | null;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * One conversation with the Gym-AI. A new conversation is only created on the server when its first message is sent,
 * so opening and leaving a new chat doesn't leave an empty conversation behind.
 */
export class AIChatModel {
  readonly store: Store<AIChatState>;
  private readonly service: AIChatService;
  private readonly makeId: () => string;

  constructor(
    conversation: { id: number; title: string | null } | null,
    service: AIChatService,
    makeId: () => string = newUUID,
  ) {
    this.service = service;
    this.makeId = makeId;
    this.store = createStore<AIChatState>({
      conversationId: conversation?.id ?? null,
      title: conversation?.title ?? null,
      messages: [],
      isLoading: false,
      isWaitingForAnswer: false,
      loadError: null,
    });
  }

  get state(): AIChatState {
    return this.store.get();
  }

  /** A failed message has to be sent again or discarded first, so the messages reach the AI in the order they are shown */
  static canSend(state: AIChatState): boolean {
    return (
      !state.isLoading &&
      !state.isWaitingForAnswer &&
      state.loadError === null &&
      !state.messages.some((message) => message.status.kind === "failed")
    );
  }

  static canSendText(state: AIChatState, text: string): boolean {
    const content = text.trim();
    return AIChatModel.canSend(state) && content !== "" && characterCount(content) <= MAX_AI_MESSAGE_LENGTH;
  }

  private update(change: Partial<AIChatState> | ((state: AIChatState) => Partial<AIChatState>)) {
    this.store.set((state) => ({ ...state, ...(typeof change === "function" ? change(state) : change) }));
  }

  private updateMessage(id: string, change: (message: AIChatMessage) => AIChatMessage) {
    this.update((state) => ({ messages: state.messages.map((message) => (message.id === id ? change(message) : message)) }));
  }

  async load(): Promise<void> {
    const { conversationId, messages, isLoading } = this.state;
    if (conversationId === null || messages.length > 0 || isLoading) return;
    this.update({ isLoading: true });
    try {
      const conversation = await this.service.conversation(conversationId);
      this.update({
        title: conversation.title,
        messages: conversation.messages.map((message) => aiChatMessageFromDTO(message, this.makeId())),
        loadError: null,
      });
    } catch (error) {
      this.update({ loadError: errorText(error) });
    } finally {
      this.update({ isLoading: false });
    }
  }

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!AIChatModel.canSendText(this.state, content)) return;
    const message: AIChatMessage = { id: this.makeId(), role: "user", content, date: new Date(), status: { kind: "sent" } };
    this.update((state) => ({ messages: [...state.messages, message] }));
    await this.deliver(message);
  }

  async retry(id: string): Promise<void> {
    if (this.state.isWaitingForAnswer) return;
    const message = this.state.messages.find((m) => m.id === id);
    if (!message) return;
    const retried: AIChatMessage = { ...message, status: { kind: "sent" }, date: new Date() };
    this.updateMessage(id, () => retried);
    await this.deliver(retried);
  }

  discard(id: string): void {
    this.update((state) => ({ messages: state.messages.filter((message) => message.id !== id) }));
  }

  private async deliver(message: AIChatMessage): Promise<void> {
    this.update({ isWaitingForAnswer: true });
    try {
      const conversationId = await this.ensureConversation();
      const response = await this.service.send(message.content, conversationId, message.id);
      this.updateMessage(message.id, (m) => ({
        ...m,
        status: { kind: "sent" },
        date: parseServerDate(response.userMessage.createdAt),
      }));
      this.update((state) => ({
        messages: [...state.messages, aiChatMessageFromDTO(response.assistantMessage, this.makeId())],
        // The server makes the first message the title of a conversation without one
        title: state.title ?? prefixCharacters(message.content, MAX_AI_TITLE_LENGTH).trim(),
      }));
    } catch (error) {
      this.updateMessage(message.id, (m) => ({ ...m, status: { kind: "failed", error: errorText(error) } }));
    } finally {
      this.update({ isWaitingForAnswer: false });
    }
  }

  private async ensureConversation(): Promise<number> {
    const { conversationId } = this.state;
    if (conversationId !== null) return conversationId;
    const conversation = await this.service.createConversation();
    this.update({ conversationId: conversation.id });
    return conversation.id;
  }
}

// MARK: - Conversations

interface AIConversationsService {
  conversations(): Promise<AIConversationDTO[]>;
  deleteConversation(id: number): Promise<void>;
  renameConversation(id: number, title: string): Promise<AIConversationDTO>;
}

interface AIConversationsState {
  conversations: AIConversationDTO[];
  hasLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  actionError: string | null;
}

/** The list of the user's conversations with the Gym-AI (AIConversationsViewModel) */
export class AIConversationsModel {
  readonly store: Store<AIConversationsState>;
  private readonly service: AIConversationsService;

  constructor(service: AIConversationsService) {
    this.service = service;
    this.store = createStore<AIConversationsState>({
      conversations: [],
      hasLoaded: false,
      isLoading: false,
      loadError: null,
      actionError: null,
    });
  }

  get state(): AIConversationsState {
    return this.store.get();
  }

  private update(change: Partial<AIConversationsState> | ((state: AIConversationsState) => Partial<AIConversationsState>)) {
    this.store.set((state) => ({ ...state, ...(typeof change === "function" ? change(state) : change) }));
  }

  async load(): Promise<void> {
    if (this.state.isLoading) return;
    this.update({ isLoading: true });
    try {
      const conversations = await this.service.conversations();
      this.update({ conversations, loadError: null, hasLoaded: true });
    } catch (error) {
      this.update({ loadError: errorText(error) });
    } finally {
      this.update({ isLoading: false });
    }
  }

  async delete(conversation: AIConversationDTO): Promise<void> {
    const index = this.state.conversations.findIndex((c) => c.id === conversation.id);
    if (index === -1) return;
    this.update((state) => ({ conversations: state.conversations.filter((c) => c.id !== conversation.id) }));
    try {
      await this.service.deleteConversation(conversation.id);
    } catch (error) {
      this.update((state) => {
        const conversations = [...state.conversations];
        conversations.splice(Math.min(index, conversations.length), 0, conversation);
        return { conversations, actionError: errorText(error) };
      });
    }
  }

  async rename(conversation: AIConversationDTO, title: string): Promise<void> {
    const trimmed = title.trim();
    if (trimmed === "" || trimmed === conversation.title) return;
    try {
      const renamed = await this.service.renameConversation(conversation.id, trimmed);
      this.update((state) => ({ conversations: [renamed, ...state.conversations.filter((c) => c.id !== renamed.id)] }));
    } catch (error) {
      this.update({ actionError: errorText(error) });
    }
  }

  dismissActionError(): void {
    this.update({ actionError: null });
  }
}
