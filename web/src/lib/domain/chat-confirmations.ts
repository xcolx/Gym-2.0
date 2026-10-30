// The confirmation dialogs of ChatInfoView.swift and FriendsView.swift

import type { UserDTO } from "@/lib/api/dto";
import type { ChatWithMembers } from "@/types/models";
import { leaveGroupConfirmation } from "./chat-feature";

export interface ConfirmationButton {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

export interface ConfirmationDialog {
  title: string;
  message: string;
  buttons: ConfirmationButton[];
}

// MARK: - Chat info

export type ChatInfoConfirmation =
  | { kind: "remove"; id: number; username: string }
  | { kind: "block"; id: number; username: string }
  | { kind: "removeFromGroup"; id: number; username: string }
  | { kind: "leave" }
  | { kind: "delete" };

export interface ChatInfoConfirmationActions {
  removeFriend: (id: number) => void;
  removeFromGroup: (id: number) => void;
  leave: () => void;
  delete: () => void;
  block: (id: number) => void;
  blockAndReport: (id: number, username: string) => void;
}

/** The title, message and buttons of the confirmation dialog of the chat info, null while none is shown */
export function chatInfoConfirmation(
  confirmation: ChatInfoConfirmation | null,
  chat: ChatWithMembers,
  currentUserId: number | null,
  actions: ChatInfoConfirmationActions,
): ConfirmationDialog | null {
  switch (confirmation?.kind) {
    case undefined:
      return null;
    case "remove":
      return {
        title: `Remove ${confirmation.username} as a friend?`,
        message: "You can't send each other messages in your direct chat anymore until you're friends again.",
        buttons: [{ label: "Remove Friend", destructive: true, onSelect: () => actions.removeFriend(confirmation.id) }],
      };
    case "block":
      return {
        title: `Block ${confirmation.username}?`,
        message:
          "They can't send you friend requests or direct messages anymore, and your direct chat with them is hidden. You can unblock them in the settings.",
        buttons: [
          { label: "Block", destructive: true, onSelect: () => actions.block(confirmation.id) },
          {
            label: "Block and Report…",
            destructive: true,
            onSelect: () => actions.blockAndReport(confirmation.id, confirmation.username),
          },
        ],
      };
    case "removeFromGroup":
      return {
        title: `Remove ${confirmation.username} from the group?`,
        message: "They can't see the group anymore. An admin can add them again.",
        buttons: [{ label: "Remove from Group", destructive: true, onSelect: () => actions.removeFromGroup(confirmation.id) }],
      };
    case "leave": {
      const { title, message } = leaveGroupConfirmation(chat, currentUserId);
      return { title, message, buttons: [{ label: "Leave Group", destructive: true, onSelect: actions.leave }] };
    }
    case "delete":
      return {
        title: chat.groupChat ? "Delete the group?" : "Delete the chat?",
        message: chat.groupChat
          ? "The group and all its messages are deleted for all members."
          : "The chat and all its messages are deleted for both of you.",
        buttons: [{ label: chat.groupChat ? "Delete Group" : "Delete Chat", destructive: true, onSelect: actions.delete }],
      };
  }
}

// MARK: - Friends

export type FriendsConfirmation =
  | { kind: "remove"; id: number; username: string }
  | { kind: "block"; id: number; username: string; profile: UserDTO | null };

export interface FriendsConfirmationActions {
  removeFriend: (id: number) => void;
  block: (id: number, profile: UserDTO | null) => void;
  blockAndReport: (id: number, username: string, profile: UserDTO | null) => void;
}

/** The title, message and buttons of the confirmation dialog of the friends screen, null while none is shown */
export function friendsConfirmation(
  confirmation: FriendsConfirmation | null,
  actions: FriendsConfirmationActions,
): ConfirmationDialog | null {
  switch (confirmation?.kind) {
    case undefined:
      return null;
    case "remove":
      return {
        title: `Remove ${confirmation.username} as a friend?`,
        message: "You can't send each other messages in your direct chat anymore until you're friends again.",
        buttons: [{ label: "Remove Friend", destructive: true, onSelect: () => actions.removeFriend(confirmation.id) }],
      };
    case "block":
      return {
        title: `Block ${confirmation.username}?`,
        message:
          "They can't send you friend requests or messages anymore, and your chat with them is hidden. You can unblock them in the settings.",
        buttons: [
          { label: "Block", destructive: true, onSelect: () => actions.block(confirmation.id, confirmation.profile) },
          {
            label: "Block and Report…",
            destructive: true,
            onSelect: () => actions.blockAndReport(confirmation.id, confirmation.username, confirmation.profile),
          },
        ],
      };
  }
}
