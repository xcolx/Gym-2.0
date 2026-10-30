// useChatPolling without rendering: React's useEffect is replaced by one that runs the effect right away and keeps
// its cleanup, the sync engine by a mock.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { syncChats, refreshChatMembers, effects } = vi.hoisted(() => ({
  syncChats: vi.fn(async () => {}),
  refreshChatMembers: vi.fn(async (chatId: number) => void chatId),
  effects: { cleanups: [] as (() => void)[] },
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));
vi.mock("./engine", () => ({ refreshChatMembers, syncChats }));

import {
  CHAT_LIST_POLL_INTERVAL_MS,
  CHAT_MEMBERS_REFRESH_INTERVAL_MS,
  OPEN_CHAT_POLL_INTERVAL_MS,
  useChatMembersRefresh,
  useChatPolling,
} from "./chat-polling";

let visibilityState: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibilityState = "visible";
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibilityState;
    },
  });
  syncChats.mockClear();
  refreshChatMembers.mockClear();
});

afterEach(() => {
  effects.cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useChatPolling", () => {
  it("polls right away and then every interval", async () => {
    useChatPolling(CHAT_LIST_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);
    expect(syncChats).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHAT_LIST_POLL_INTERVAL_MS * 3);
    expect(syncChats).toHaveBeenCalledTimes(4);
  });

  it("waits one interval first when not immediate", async () => {
    useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS, { immediate: false });
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS - 1);
    expect(syncChats).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(syncChats).toHaveBeenCalledTimes(1);
  });

  it("doesn't poll while disabled", async () => {
    useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS, { enabled: false });
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS * 5);
    expect(syncChats).not.toHaveBeenCalled();
    expect(effects.cleanups).toHaveLength(0);
  });

  it("skips the polls while the page is hidden and goes on once it is visible", async () => {
    visibilityState = "hidden";
    useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS * 5);
    expect(syncChats).not.toHaveBeenCalled();
    visibilityState = "visible";
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS);
    expect(syncChats).toHaveBeenCalledTimes(1);
  });

  it("starts the next interval only after a slow poll finished", async () => {
    let finish!: () => void;
    syncChats.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS * 10);
    expect(syncChats).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS);
    expect(syncChats).toHaveBeenCalledTimes(2);
  });

  it("stops polling on cleanup, also when a poll is running", async () => {
    let finish!: () => void;
    syncChats.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    useChatPolling(OPEN_CHAT_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(0);
    effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    finish();
    await vi.advanceTimersByTimeAsync(OPEN_CHAT_POLL_INTERVAL_MS * 5);
    expect(syncChats).toHaveBeenCalledTimes(1);
  });
});

describe("useChatMembersRefresh", () => {
  it("loads the members of the chat right away and then every interval while the page is visible", async () => {
    useChatMembersRefresh(7);
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshChatMembers).toHaveBeenCalledExactlyOnceWith(7);
    await vi.advanceTimersByTimeAsync(CHAT_MEMBERS_REFRESH_INTERVAL_MS * 2);
    expect(refreshChatMembers).toHaveBeenCalledTimes(3);

    visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(CHAT_MEMBERS_REFRESH_INTERVAL_MS * 3);
    expect(refreshChatMembers).toHaveBeenCalledTimes(3);
  });

  it("stops on cleanup", async () => {
    useChatMembersRefresh(7);
    await vi.advanceTimersByTimeAsync(0);
    effects.cleanups.splice(0).forEach((cleanup) => cleanup());
    await vi.advanceTimersByTimeAsync(CHAT_MEMBERS_REFRESH_INTERVAL_MS * 3);
    expect(refreshChatMembers).toHaveBeenCalledTimes(1);
  });
});
