"use client";

import { useRouter } from "next/navigation";
import {
  Hand,
  MessageCircle,
  MessageSquareWarning,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  UserPlus,
  UserRoundX,
} from "lucide-react";
import { useState } from "react";

import type { MenuItem } from "@/components/chat/chat-controls";
import type { ReportTarget } from "@/components/chat/ReportDialog";
import { errorMessage } from "@/lib/api";
import {
  addGroupMembers,
  blockUser,
  deleteChat,
  leaveGroup,
  openDirectChat,
  removeFriend,
  removeGroupMember,
  sendFriendRequest,
  setGroupAdmin,
} from "@/lib/chat/actions";
import { chatTitle } from "@/lib/domain/chat";
import { chatInfoConfirmation, type ChatInfoConfirmation } from "@/lib/domain/chat-confirmations";
import { adminChange, canRemoveMember, isChatAdmin, sortedChatMembers } from "@/lib/domain/chat-feature";
import { addableFriends, selectedIdsInOrder } from "@/lib/domain/chat-screens";
import { toggledId, withId } from "@/lib/domain/id-set";
import { popTo } from "@/lib/navigation";
import { useCurrentUserId, useFriends } from "@/lib/repo";
import type { ChatMember, ChatWithMembers, User } from "@/types/models";

/**
 * The state and actions of ChatInfoView.swift: the friend actions for the members, leaving and deleting the chat and
 * the confirmation, report and add members dialogs. All changes need a connection.
 */
export function useChatInfo(chat: ChatWithMembers, users: Map<number, User>) {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const chatId = chat.serverId;
  const isAdmin = isChatAdmin(chat, currentUserId);
  const title = chatTitle(chat, users, currentUserId);

  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ChatInfoConfirmation | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [showsAddMembers, setShowsAddMembers] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const setBusy = (id: number, busy: boolean) => setBusyIds((ids) => withId(ids, id, busy));

  /** Runs an action for a member, shows the error if it fails */
  const run = async (userId: number, action: () => Promise<void>) => {
    if (busyIds.has(userId)) return;
    setBusy(userId, true);
    setMessage(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(userId, false);
    }
  };

  const didBlock = () => {
    // The direct chat with a blocked user is hidden
    if (!chat.groupChat) popTo(router, "/chat");
  };

  const block = (id: number) =>
    run(id, async () => {
      await blockUser(id);
      didBlock();
    });

  /** Blocks from the report dialog ("Block and Report…") */
  const blockFromReport = async (id: number) => {
    await blockUser(id);
    didBlock();
  };

  const leave = async () => {
    if (currentUserId === null) return;
    setIsLeaving(true);
    try {
      await leaveGroup(chatId, currentUserId);
      popTo(router, "/chat");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLeaving(false);
    }
  };

  const remove = async () => {
    setIsDeleting(true);
    try {
      await deleteChat(chatId);
      popTo(router, "/chat");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmationDialog = chatInfoConfirmation(confirmation, chat, currentUserId, {
    removeFriend: (id) => void run(id, () => removeFriend(id)),
    removeFromGroup: (id) => void run(id, () => removeGroupMember(chatId, id)),
    leave: () => void leave(),
    delete: () => void remove(),
    block: (id) => void block(id),
    blockAndReport: (id, username) => setReportTarget({ kind: "user", id, username, blocks: true }),
  });

  /** The items of the menu of a member, empty for none */
  const memberActions = (member: ChatMember, user: User | undefined, username: string): MenuItem[] => {
    const { userId } = member;
    const items: MenuItem[] = [];
    if (userId !== currentUserId && user && !user.isBlocked) {
      if (user.isFriend) {
        if (chat.groupChat) {
          items.push({
            label: "Message",
            icon: MessageCircle,
            onSelect: () =>
              void run(userId, async () => {
                router.push(`/chat/${await openDirectChat(userId)}`);
              }),
          });
        }
        items.push({
          label: "Remove Friend",
          icon: UserMinus,
          destructive: true,
          onSelect: () => setConfirmation({ kind: "remove", id: userId, username }),
        });
      } else {
        items.push({
          label: "Add Friend",
          icon: UserPlus,
          onSelect: () =>
            void run(userId, async () => {
              setMessage(await sendFriendRequest(userId));
            }),
        });
      }
      items.push({
        label: "Block",
        icon: Hand,
        destructive: true,
        onSelect: () => setConfirmation({ kind: "block", id: userId, username }),
      });
    }
    if (userId !== currentUserId && user) {
      items.push({
        label: "Report…",
        icon: MessageSquareWarning,
        destructive: true,
        onSelect: () => setReportTarget({ kind: "user", id: userId, username }),
      });
    }
    const makesAdmin = adminChange(chat, member, isAdmin, currentUserId);
    if (makesAdmin !== null) {
      items.push({
        label: makesAdmin ? "Make Admin" : "Remove Admin",
        icon: makesAdmin ? ShieldCheck : ShieldOff,
        onSelect: () => void run(userId, () => setGroupAdmin(chatId, userId, makesAdmin)),
      });
    }
    if (canRemoveMember(chat, userId, isAdmin, currentUserId)) {
      items.push({
        label: "Remove from Group",
        icon: UserRoundX,
        destructive: true,
        onSelect: () => setConfirmation({ kind: "removeFromGroup", id: userId, username }),
      });
    }
    return items;
  };

  return {
    currentUserId,
    isAdmin,
    title,
    members: sortedChatMembers(chat, users, currentUserId),
    busyIds,
    message,
    error,
    setError,
    clearError: () => setError(null),
    confirmationDialog,
    askToConfirm: setConfirmation,
    closeConfirmation: () => setConfirmation(null),
    reportTarget,
    report: setReportTarget,
    closeReport: () => setReportTarget(null),
    blockFromReport,
    showsAddMembers,
    showAddMembers: () => setShowsAddMembers(true),
    closeAddMembers: () => setShowsAddMembers(false),
    isLeaving,
    isDeleting,
    memberActions,
  };
}

/** AddMembersView of ChatInfoView.swift: the friends that aren't members yet, the selected ones and adding them */
export function useAddMembers(chat: ChatWithMembers, onClose: () => void) {
  const friends = useFriends();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = addableFriends(chat, friends ?? []);

  const add = async () => {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    try {
      await addGroupMembers(chat.serverId, selectedIdsInOrder(candidates, selectedIds));
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsAdding(false);
    }
  };

  return {
    isLoaded: friends !== undefined,
    candidates,
    selectedIds,
    toggle: (id: number) => setSelectedIds((ids) => toggledId(ids, id)),
    isAdding,
    add,
    error,
    clearError: () => setError(null),
  };
}
