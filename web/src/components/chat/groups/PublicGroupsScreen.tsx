"use client";

import { Globe, Search, WifiOff } from "lucide-react";

import { Page, PageHeader } from "@/components/ui/Page";
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
    <Page>
      <PageHeader inline title="Public Groups" back={{ href: "/chat", label: "Chats" }} />
      <div className="px-4 pb-2">
        <label className="focus-ring-within flex items-center gap-1.5 rounded-[10px] bg-field/40 px-2 py-[7px] text-secondary-label">
          <Search size={17} aria-hidden />
          <input
            type="search"
            value={screen.searchText}
            onChange={(event) => screen.setSearchText(event.target.value)}
            placeholder="Search"
            aria-label="Search"
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-secondary-label"
          />
        </label>
      </div>

      <ul>
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
        filtered.length === 0 && (
          <ContentUnavailable
            icon={Globe}
            title="No Public Groups"
            description="Create a group and make it public so others can join."
            className="flex-1"
          />
        )
      )}

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
