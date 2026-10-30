"use client";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { FormPage } from "@/components/ui/Form";
import { MessageAlert } from "@/components/ui/Alert";
import { ReportDialog } from "@/components/chat/ReportDialog";

import { AddFriendSection } from "./AddFriendSection";
import { FriendRequestsSection } from "./FriendRequestsSection";
import { FriendsListSection } from "./FriendsListSection";
import { useContextMenu } from "./use-context-menu";
import { useFriendsScreen } from "./use-friends-screen";

/** Port of FriendsView.swift */
export function FriendsScreen() {
  const screen = useFriendsScreen();
  const contextMenu = useContextMenu();
  const { busyIds, confirmationDialog, askToConfirm, report } = screen;

  return (
    <FormPage title="Friends" inline back={{ href: "/chat", label: "Chats" }}>
      <AddFriendSection
        searchText={screen.searchText}
        onChangeSearchText={screen.changeSearchText}
        isSearching={screen.isSearching}
        onSearch={() => void screen.search()}
        foundUser={screen.foundUser}
        foundUserStatus={screen.statusOf}
        searchMessage={screen.searchMessage}
        sentRequests={screen.sentRequests}
        busyIds={busyIds}
        onAdd={(userId) => void screen.sendRequest(userId)}
        onCancelRequest={(userId) => void screen.cancelRequest(userId)}
        onReport={(user) => report({ kind: "user", id: user.id, username: user.username })}
        openContextMenu={contextMenu.open}
      />

      <FriendRequestsSection
        requests={screen.requests}
        requestsError={screen.requestsError}
        busyIds={busyIds}
        onAnswer={(request, accept) => void screen.answer(request, accept)}
        onReport={({ sender }) => report({ kind: "user", id: sender.id, username: sender.username })}
        onBlock={({ sender }) => askToConfirm({ kind: "block", id: sender.id, username: sender.username, profile: sender })}
        openContextMenu={contextMenu.open}
      />

      <FriendsListSection
        friends={screen.friends}
        busyIds={busyIds}
        onMessage={(friend) => void screen.openChat(friend.serverId)}
        onRemove={(friend) => askToConfirm({ kind: "remove", id: friend.serverId, username: friend.username })}
        onReport={(friend) => report({ kind: "user", id: friend.serverId, username: friend.username })}
        onBlock={(friend) => askToConfirm({ kind: "block", id: friend.serverId, username: friend.username, profile: null })}
        openContextMenu={contextMenu.open}
      />

      {contextMenu.sheet}
      <ActionSheet
        open={confirmationDialog !== null}
        title={confirmationDialog?.title ?? ""}
        message={confirmationDialog?.message}
        buttons={confirmationDialog?.buttons ?? []}
        onClose={screen.closeConfirmation}
      />
      <ReportDialog target={screen.reportTarget} onClose={screen.closeReport} block={screen.blockAndRemoveRequest} />
      <MessageAlert title="Something went wrong" message={screen.error} onClose={screen.clearError} />
    </FormPage>
  );
}
