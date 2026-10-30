"use client";

import { useEffect, useRef, useState } from "react";

import { scrollToBottom } from "@/components/chat/ChatScreen";
import { photoUpload } from "@/components/chat/image-upload";
import type { ReportTarget } from "@/components/chat/ReportDialog";
import type { ActionSheetButton } from "@/components/ui/ActionSheet";
import { errorMessage, type ImageUpload } from "@/lib/api";
import { deleteMessage } from "@/lib/chat/actions";
import { canSendText, isChatAdmin } from "@/lib/domain/chat-feature";
import { messageMenuActions } from "@/lib/domain/chat-screens";
import { setChatInput, useChatMessages, useCurrentUserId, useUsersById } from "@/lib/repo";
import { markChatRead, OPEN_CHAT_POLL_INTERVAL_MS, sendChatMessage, sendChatPhoto, useChatMembersRefresh, useChatPolling } from "@/lib/sync";
import type { ChatWithMembers, Message } from "@/types/models";

/** The draft is stored a moment after the last change, not for every character */
const DRAFT_SAVE_DELAY_MS = 500;

/**
 * The state and actions of ChatView.swift: the messages, the draft (stored in `Chat.input`), sending text and photos,
 * the menu of a message and polling while the chat is open.
 */
export function useChatConversation(chat: ChatWithMembers) {
  const chatId = chat.serverId;
  const messages = useChatMessages(chatId);
  const users = useUsersById();
  const currentUserId = useCurrentUserId();
  const isAdmin = isChatAdmin(chat, currentUserId);

  /** What the user typed, null until they changed it: the stored input is shown then */
  const [draft, setDraft] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSendingPhoto, setIsSendingPhoto] = useState(false);
  /** The picked photo, shown with a caption field before it's sent */
  const [photoToSend, setPhotoToSend] = useState<{ upload: ImageUpload; url: string } | null>(null);
  /** The hash of the photo shown in full screen */
  const [viewedPhoto, setViewedPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The message whose menu is open (long press or right click) */
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /** The text that was sent but not accepted by the server yet */
  const isPending = chat.inputUUID !== null;
  const text = draft ?? (isPending ? "" : chat.input);
  const canSend = canSendText(text, { isSending, isPending });

  // The draft is stored shortly after typing and when leaving, so it's still there after a reload
  const latest = useRef({ draft, isPending });
  useEffect(() => {
    latest.current = { draft, isPending };
  });
  useEffect(() => {
    if (draft === null || isPending) return;
    const timer = setTimeout(() => void setChatInput(chatId, draft).catch(() => {}), DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [chatId, draft, isPending]);
  useEffect(() => {
    const save = () => {
      const { draft, isPending } = latest.current;
      if (draft !== null && !isPending) void setChatInput(chatId, draft).catch(() => {});
    };
    const onVisibility = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      save();
    };
  }, [chatId]);

  // No push updates yet, so an open chat polls for new messages. It's marked as read first, the first poll follows.
  useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS, { immediate: false });
  // The polls don't load known members again, so a changed profile image or friendship would only show after a sync
  useChatMembersRefresh(chatId);

  // A new message: scrolled to and marked as read (failures are ignored, it's tried again the next time)
  const lastMessageId = messages?.at(-1)?.serverId;
  useEffect(() => {
    void markChatRead(chatId);
    scrollToBottom(scrollRef.current);
  }, [chatId, lastMessageId]);
  useEffect(() => {
    scrollToBottom(scrollRef.current);
  }, [isPending]);

  // If the server can't be reached, the message stays queued and is sent by the next sync. One the server rejects is
  // shown in the "Not saved" alert of the sync.
  const retry = async () => {
    setIsSending(true);
    try {
      const sent = await sendChatMessage(chatId);
      // A rejected message stays in the input field, without its UUID
      if (sent && sent.inputUUID === null && sent.input !== "") {
        setDraft((current) => (current === null || current === "" ? sent.input : current));
      }
    } catch (caught) {
      console.error("Sending a message failed", caught);
    } finally {
      setIsSending(false);
    }
  };

  const send = async () => {
    if (!canSend) return;
    await setChatInput(chatId, text.trim());
    setDraft("");
    await retry();
  };

  const pickPhoto = async (file: File) => {
    const upload = await photoUpload(file);
    if (!upload) {
      setError("The photo could not be loaded.");
      return;
    }
    setPhotoToSend({ upload, url: URL.createObjectURL(upload.data) });
  };

  const sendPhoto = async (upload: ImageUpload, caption: string | null) => {
    setIsSendingPhoto(true);
    try {
      await sendChatPhoto(chatId, upload, caption);
    } catch (caught) {
      setError(`The photo could not be sent: ${errorMessage(caught)}`);
    } finally {
      setIsSendingPhoto(false);
    }
  };

  const removeMessage = async (message: Message) => {
    try {
      await deleteMessage(message.serverId);
    } catch (caught) {
      setDeleteError(errorMessage(caught));
    }
  };

  /** The buttons of the menu of a message, see `messageMenuActions` */
  const menuButtons = (message: Message): ActionSheetButton[] => {
    const report = (deletes: boolean) =>
      setReportTarget({
        kind: "message",
        id: message.serverId,
        senderName: (message.senderId !== null && users?.get(message.senderId)?.username) || null,
        deletes,
      });
    return messageMenuActions(message, currentUserId, isAdmin).map((action): ActionSheetButton => {
      switch (action) {
        case "copy":
          return { label: "Copy", onSelect: () => void navigator.clipboard?.writeText(message.content ?? "").catch(() => {}) };
        case "delete":
          return { label: "Delete for Everyone", destructive: true, onSelect: () => void removeMessage(message) };
        case "deleteAndReport":
          return { label: "Delete and Report…", destructive: true, onSelect: () => report(true) };
        case "report":
          return { label: "Report…", destructive: true, onSelect: () => report(false) };
      }
    });
  };

  const openMenu = (message: Message) => {
    if (menuButtons(message).length > 0) setMenuMessage(message);
  };

  const closePhotoCompose = () => {
    if (photoToSend) URL.revokeObjectURL(photoToSend.url);
    setPhotoToSend(null);
  };

  /** Sends the picked photo with the caption of the compose sheet */
  const sendComposedPhoto = (caption: string | null) => {
    if (!photoToSend) return;
    const { upload } = photoToSend;
    closePhotoCompose();
    void sendPhoto(upload, caption);
  };

  return {
    messages,
    users,
    currentUserId,
    scrollRef,
    isPending,
    text,
    setDraft,
    canSend,
    isSending,
    isSendingPhoto,
    send,
    retry,
    pickPhoto,
    photoToSend,
    closePhotoCompose,
    sendComposedPhoto,
    viewedPhoto,
    setViewedPhoto,
    error,
    clearError: () => setError(null),
    deleteError,
    clearDeleteError: () => setDeleteError(null),
    menuMessage,
    menuButtons,
    openMenu,
    closeMenu: () => setMenuMessage(null),
    reportTarget,
    closeReport: () => setReportTarget(null),
  };
}
