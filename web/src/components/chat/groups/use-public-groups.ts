"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { ReportTarget } from "@/components/chat/ReportDialog";
import { chatApi, errorMessage, type ChatDTO } from "@/lib/api";
import { joinPublicGroup } from "@/lib/chat/actions";
import { blockedMembersWarning, filterPublicGroups } from "@/lib/domain/chat-feature";
import { useBlockedUsers, useChatIds } from "@/lib/repo";

/**
 * The state and actions of PublicGroupsView.swift: the public groups (loaded online), the search, joining a group
 * (after a warning about blocked members) and reporting one.
 */
export function usePublicGroups() {
  const router = useRouter();
  const joinedIds = useChatIds();
  const blockedUsers = useBlockedUsers();
  const [groups, setGroups] = useState<ChatDTO[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A group with blocked members, joined only once the user confirmed the warning */
  const [pendingJoin, setPendingJoin] = useState<{ group: ChatDTO; warning: string } | null>(null);
  /** The group whose context menu (right click, long press on Android) is open */
  const [menuGroup, setMenuGroup] = useState<ChatDTO | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await chatApi.publicChats());
      setLoadError(null);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state is only set after the request's await
    void load();
  }, [load]);

  const open = async (group: ChatDTO) => {
    if (joinedIds?.has(group.id)) {
      router.push(`/chat/${group.id}`);
      return;
    }
    const warning = blockedMembersWarning(group, blockedUsers ?? []);
    if (warning) {
      setPendingJoin({ group, warning });
      return;
    }
    await join(group);
  };

  const join = async (group: ChatDTO) => {
    setJoiningId(group.id);
    try {
      router.push(`/chat/${await joinPublicGroup(group.id)}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setJoiningId(null);
    }
  };

  return {
    isLoading: groups === null && loadError === null,
    loadError,
    reload: load,
    filtered: filterPublicGroups(groups ?? [], searchText),
    isJoined: (group: ChatDTO) => joinedIds?.has(group.id) ?? false,
    searchText,
    setSearchText,
    joiningId,
    open,
    pendingJoin,
    joinPending: () => {
      if (pendingJoin) void join(pendingJoin.group);
    },
    closePendingJoin: () => setPendingJoin(null),
    menuGroup,
    openMenu: setMenuGroup,
    closeMenu: () => setMenuGroup(null),
    reportMenuGroup: () => {
      if (menuGroup) setReportTarget({ kind: "chat", id: menuGroup.id, name: menuGroup.name ?? "Group" });
    },
    reportTarget,
    closeReport: () => setReportTarget(null),
    error,
    clearError: () => setError(null),
  };
}
