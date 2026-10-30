"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ReportTarget } from "@/components/chat/ReportDialog";
import {
  errorMessage,
  errorStatus,
  friendApi,
  userApi,
  type FriendRequestDTO,
  type SentFriendRequestDTO,
  type UserDTO,
} from "@/lib/api";
import {
  answerFriendRequest,
  blockUser,
  cancelFriendRequest,
  openDirectChat,
  removeFriend,
  sendFriendRequest,
} from "@/lib/chat/actions";
import { friendsConfirmation, type FriendsConfirmation } from "@/lib/domain/chat-confirmations";
import { FRIEND_REQUESTS_REFRESH_MS, sentRequestsAnswered } from "@/lib/domain/chat-feature";
import { foundUserStatus, friendSearchFailure } from "@/lib/domain/chat-screens";
import { withId } from "@/lib/domain/id-set";
import { useFriends, useUsersById } from "@/lib/repo";
import { sync, useSyncState } from "@/lib/sync";

/**
 * The state and actions of FriendsView.swift: the friend requests (loaded online), the user search, the friend
 * actions and the confirmation and report dialogs.
 */
export function useFriendsScreen() {
  const router = useRouter();
  const friends = useFriends();
  const users = useUsersById();

  const [requests, setRequests] = useState<FriendRequestDTO[]>([]);
  const [sentRequests, setSentRequests] = useState<SentFriendRequestDTO[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [foundUser, setFoundUser] = useState<UserDTO | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  /** The ids of the users an action is running for */
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<FriendsConfirmation | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  /** The receivers of the sent requests of the last load, to notice when one was answered */
  const sentReceiverIds = useRef<number[] | null>(null);

  const loadRequests = useCallback(async () => {
    try {
      const [received, sent] = await Promise.all([friendApi.friendRequests(), friendApi.sentFriendRequests()]);
      setRequests(received);
      setSentRequests(sent);
      setRequestsError(null);
      const receiverIds = sent.map((request) => request.receiver.id);
      const previous = sentReceiverIds.current;
      sentReceiverIds.current = receiverIds;
      // Accepted (or declined) on the other device: the new friend comes with the sync
      if (previous && sentRequestsAnswered(previous, receiverIds)) void sync();
    } catch (caught) {
      setRequestsError(`Friend requests could not be loaded: ${errorMessage(caught)}`);
    }
  }, []);

  useEffect(() => {
    // Loaded when the screen opens (`.task`). There is no pull to refresh, so the friends are synced as well.
    void sync();
  }, []);

  // Loaded again after every sync (the friends changed on the server) and every 15 s while the screen is visible, so
  // a request answered on the other device doesn't stay until the screen is opened again
  const { lastSyncDate } = useSyncState();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is only set after the request's await
    void loadRequests();
  }, [lastSyncDate, loadRequests]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadRequests();
    }, FRIEND_REQUESTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadRequests]);

  const setBusy = (id: number, busy: boolean) => setBusyIds((ids) => withId(ids, id, busy));

  const run = async (userId: number, action: () => Promise<void>) => {
    if (busyIds.has(userId)) return;
    setBusy(userId, true);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(userId, false);
    }
  };

  const blockAndRemoveRequest = async (id: number, profile: UserDTO | null) => {
    await blockUser(id, { profile });
    setRequests((list) => list.filter((request) => request.sender.id !== id));
  };

  const block = (id: number, profile: UserDTO | null) => run(id, () => blockAndRemoveRequest(id, profile));

  const cancelRequest = (userId: number) =>
    run(userId, async () => {
      await cancelFriendRequest(userId);
      setSentRequests((list) => list.filter((request) => request.receiver.id !== userId));
      sentReceiverIds.current = sentReceiverIds.current?.filter((id) => id !== userId) ?? null;
      setSearchMessage(null);
    });

  const answer = (request: FriendRequestDTO, accept: boolean) =>
    run(request.sender.id, async () => {
      try {
        await answerFriendRequest(request.sender, accept);
      } catch (caught) {
        // Already answered or cancelled, e.g. on another device
        if (errorStatus(caught) !== 404) throw caught;
      }
      setRequests((list) => list.filter((r) => r.sender.id !== request.sender.id));
    });

  const openChat = (friendId: number) =>
    run(friendId, async () => {
      router.push(`/chat/${await openDirectChat(friendId)}`);
    });

  const sendRequest = (userId: number) =>
    run(userId, async () => {
      setSearchMessage(await sendFriendRequest(userId));
      await loadRequests();
    });

  const search = async () => {
    const username = searchText.trim();
    if (!username) return;
    setIsSearching(true);
    setFoundUser(null);
    setSearchMessage(null);
    try {
      setFoundUser(await userApi.lookup(username));
    } catch (caught) {
      setSearchMessage(friendSearchFailure(errorStatus(caught), errorMessage(caught)));
    } finally {
      setIsSearching(false);
    }
  };

  /** A new search text hides the result of the last search */
  const changeSearchText = (text: string) => {
    setSearchText(text);
    setFoundUser(null);
    setSearchMessage(null);
  };

  const statusOf = (user: UserDTO) =>
    foundUserStatus(
      users?.get(user.id),
      busyIds.has(user.id),
      sentRequests.some((request) => request.receiver.id === user.id),
    );

  const confirmationDialog = friendsConfirmation(confirmation, {
    removeFriend: (id) => void run(id, () => removeFriend(id)),
    block: (id, profile) => void block(id, profile),
    blockAndReport: (id, username, profile) => setReportTarget({ kind: "user", id, username, profile, blocks: true }),
  });

  return {
    friends,
    requests,
    sentRequests,
    requestsError,
    searchText,
    changeSearchText,
    foundUser,
    searchMessage,
    isSearching,
    search,
    statusOf,
    busyIds,
    cancelRequest,
    sendRequest,
    answer,
    openChat,
    error,
    clearError: () => setError(null),
    confirmationDialog,
    askToConfirm: setConfirmation,
    closeConfirmation: () => setConfirmation(null),
    reportTarget,
    report: setReportTarget,
    closeReport: () => setReportTarget(null),
    blockAndRemoveRequest,
  };
}
