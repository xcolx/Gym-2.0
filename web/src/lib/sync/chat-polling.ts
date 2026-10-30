// There are no push updates yet, so the chats are polled while the page is visible

import { useEffect } from "react";

import { refreshChatMembers, syncChats } from "./engine";

/** The chat list polls this often (ChatsView.pollInterval) */
export const CHAT_LIST_POLL_INTERVAL_MS = 3_000;
/** An open chat polls this often (ChatView.pollInterval) */
export const OPEN_CHAT_POLL_INTERVAL_MS = 1_000;
/** An open chat loads the profiles of its members again this often (ChatView.membersRefreshInterval) */
export const CHAT_MEMBERS_REFRESH_INTERVAL_MS = 10_000;

/**
 * Calls `syncChats()` every `intervalMs` while the component is mounted, `enabled` and the page is visible: sends
 * the queued messages, pulls the chats and loads new members. `immediate`: the first poll right away (the chat list)
 * instead of after the first interval (an open chat, which marks the chat as read first).
 * The AppShell already polls with CHAT_LIST_POLL_INTERVAL_MS on every /chat route, an open chat calls
 * `useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS, { immediate: false })`.
 */
export function useChatPolling(intervalMs: number, { enabled = true, immediate = true } = {}): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") await syncChats();
      if (!cancelled) timer = setTimeout(poll, intervalMs);
    };
    if (immediate) void poll();
    else timer = setTimeout(poll, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, immediate, intervalMs]);
}

/**
 * Loads the profiles of the members of the chat (profile image, username) and whether they are friends right away
 * and then every CHAT_MEMBERS_REFRESH_INTERVAL_MS while the component is mounted and the page is visible. The polls
 * of `useChatPolling` only load members that aren't stored yet.
 */
export function useChatMembersRefresh(chatId: number): void {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") await refreshChatMembers(chatId);
      if (!cancelled) timer = setTimeout(refresh, CHAT_MEMBERS_REFRESH_INTERVAL_MS);
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId]);
}
