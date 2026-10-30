"use client";

import type { ReactNode } from "react";

import { FormRow, FormSection } from "@/components/ui/Form";
import { BORDERED_BUTTON, PLAIN_BUTTON, PROMINENT_BUTTON } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { parseServerDate, type SentFriendRequestDTO, type UserDTO } from "@/lib/api";
import type { FoundUserStatus } from "@/lib/domain/chat-screens";
import { formatRelativeNamed } from "@/lib/domain/relative-date";

import type { OpenContextMenu } from "./use-context-menu";

/** The "Add Friend" section of FriendsView: the search by the exact username, the found user and the sent requests */
export function AddFriendSection({
  searchText,
  onChangeSearchText,
  isSearching,
  onSearch,
  foundUser,
  foundUserStatus,
  searchMessage,
  sentRequests,
  busyIds,
  onAdd,
  onCancelRequest,
  onReport,
  openContextMenu,
}: {
  searchText: string;
  onChangeSearchText: (text: string) => void;
  isSearching: boolean;
  onSearch: () => void;
  foundUser: UserDTO | null;
  foundUserStatus: (user: UserDTO) => FoundUserStatus;
  searchMessage: string | null;
  sentRequests: SentFriendRequestDTO[];
  busyIds: ReadonlySet<number>;
  onAdd: (userId: number) => void;
  onCancelRequest: (userId: number) => void;
  onReport: (user: UserDTO) => void;
  openContextMenu: OpenContextMenu;
}) {
  return (
    <FormSection header="Add Friend" footer="Usernames are case-sensitive.">
      <FormRow rowClassName="focus-ring-within rounded-[10px]">
        <form
          className="flex min-w-0 flex-1 items-center gap-3"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          {/* A search field, not a login field: keeps the browser and password managers from filling in the signed-in user's username or email */}
          <input
            type="search"
            name="friend-search"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            value={searchText}
            onChange={(event) => onChangeSearchText(event.target.value)}
            placeholder="Exact username"
            aria-label="Exact username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tab-inactive"
          />
          {isSearching ? (
            <Spinner />
          ) : (
            <button type="submit" className={PLAIN_BUTTON} disabled={searchText.trim() === ""}>
              Search
            </button>
          )}
        </form>
      </FormRow>
      {foundUser && (
        <FormRow
          rowClassName="select-none [-webkit-touch-callout:none]"
          onContextMenu={openContextMenu(foundUser.username, [
            { label: "Report…", destructive: true, onSelect: () => onReport(foundUser) },
          ])}
        >
          <ProfileIcon hash={foundUser.profileIconUrl} size={40} color={foundUser.schemeColor} imageHash={foundUser.profileImageUrl} />
          <span className="min-w-0 flex-1 truncate">{foundUser.username}</span>
          <FoundUserAction
            status={foundUserStatus(foundUser)}
            onAdd={() => onAdd(foundUser.id)}
            onCancelRequest={() => onCancelRequest(foundUser.id)}
          />
        </FormRow>
      )}
      {searchMessage && <FormRow className="text-footnote text-secondary-label">{searchMessage}</FormRow>}
      {sentRequests.map((request) => (
        <FormRow key={request.receiver.id}>
          <ProfileIcon
            hash={request.receiver.profileIconUrl}
            size={40}
            color={request.receiver.schemeColor}
            imageHash={request.receiver.profileImageUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate">{request.receiver.username}</p>
            <p className="text-[12px] text-secondary-label">Sent {formatRelativeNamed(parseServerDate(request.timestamp))}</p>
          </div>
          {busyIds.has(request.receiver.id) ? (
            <Spinner />
          ) : (
            <button type="button" className={BORDERED_BUTTON} onClick={() => onCancelRequest(request.receiver.id)}>
              Cancel
            </button>
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}

/** The trailing part of the row of the found user: its relation to the user or the button to add it */
function FoundUserAction({
  status,
  onAdd,
  onCancelRequest,
}: {
  status: FoundUserStatus;
  onAdd: () => void;
  onCancelRequest: () => void;
}): ReactNode {
  switch (status) {
    case "you":
      return <span className="text-secondary-label">That&apos;s you</span>;
    case "friends":
      return <span className="text-secondary-label">Friends</span>;
    case "blocked":
      return <span className="text-secondary-label">Blocked</span>;
    case "busy":
      return <Spinner />;
    case "requested":
      return (
        <button type="button" className={BORDERED_BUTTON} onClick={onCancelRequest}>
          Cancel Request
        </button>
      );
    case "add":
      return (
        <button type="button" className={PROMINENT_BUTTON} onClick={onAdd}>
          Add
        </button>
      );
  }
}
