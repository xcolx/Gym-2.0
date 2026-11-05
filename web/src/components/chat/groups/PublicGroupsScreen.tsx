"use client";

import { Globe, Search, WifiOff } from "lucide-react";

import { Page, PageHeader } from "@/components/ui/Page";
import { SearchField } from "@/components/ui/SearchField";
import { ContentUnavailable, PLAIN_BUTTON } from "@/components/chat/chat-controls";
import { Alert, MessageAlert } from "@/components/ui/Alert";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { Spinner } from "@/components/ui/controls";

import { PublicGroupRow } from "./PublicGroupRow";
import { usePublicGroups } from "./use-public-groups";

/** Port of PublicGroupsView.swift */
export function PublicGroupsScreen() {
  const screen = usePublicGroups();
  const { filtered, loadError, joiningId, menuGroup, pendingJoin } = screen;

  return (
    <Page className="bg-grouped">
      <PageHeader inline title="Public groups" back={{ href: "/chat", label: "Chats" }} />
      <SearchField
        value={screen.searchText}
        onChange={screen.setSearchText}
        label="Search public groups"
        className="mx-4 mb-4"
      />

      <div className="flex flex-1 flex-col px-4 pb-6">
        {filtered.length > 0 && (
          <ul className="card overflow-hidden">
            {filtered.map((group) => (
              <PublicGroupRow
                key={group.id}
                group={group}
                joined={screen.isJoined(group)}
                isJoining={joiningId === group.id}
                disabled={joiningId !== null}
                onOpen={() => void screen.open(group)}
                onOpenMenu={() => screen.openMenu(group)}
              />
            ))}
          </ul>
        )}

        {screen.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : loadError !== null ? (
          <ContentUnavailable icon={WifiOff} title="Could not load the groups" description={loadError} className="flex-1">
            <button type="button" className={PLAIN_BUTTON} onClick={() => void screen.reload()}>
              Try again
            </button>
          </ContentUnavailable>
        ) : (
          filtered.length === 0 &&
          (screen.searchText.trim() === "" ? (
            <ContentUnavailable
              icon={Globe}
              title="No public groups yet"
              description="Create a group and make it public so others can join."
              className="flex-1"
            />
          ) : (
            <ContentUnavailable
              icon={Search}
              title={`No results for “${screen.searchText}”`}
              description="Check the spelling or try a new search."
              className="flex-1"
            />
          ))
        )}
      </div>

      <Alert
        open={pendingJoin !== null}
        title="Join the group?"
        message={pendingJoin?.warning}
        buttons={[
          { label: "Cancel", role: "cancel" },
          { label: "Join", onSelect: screen.joinPending },
        ]}
        onClose={screen.closePendingJoin}
      />
      <ActionSheet
        open={menuGroup !== null}
        title={menuGroup?.name ?? "Group"}
        buttons={[{ label: "Report…", destructive: true, onSelect: screen.reportMenuGroup }]}
        onClose={screen.closeMenu}
      />
      <ReportDialog target={screen.reportTarget} onClose={screen.closeReport} />
      <MessageAlert title="Could not join" message={screen.error} onClose={screen.clearError} />
    </Page>
  );
}
