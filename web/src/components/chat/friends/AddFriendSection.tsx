"use client";

import { CircleX, Clock, Search, UserRoundSearch, X } from "lucide-react";
import type { ReactNode } from "react";

import { FormRow, FormSection } from "@/components/ui/Form";
import { Menu } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import type { UserDTO } from "@/lib/api";
import type { FoundUserStatus } from "@/lib/domain/chat-screens";

import type { OpenContextMenu } from "./use-context-menu";

/** A small capsule button, filled in the app color or gray (`.borderedProminent` / `.bordered` with `.capsule`) */
export function capsuleButtonClass(prominent: boolean) {
  return `inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-3.5 py-1.5 text-subheadline transition-[scale,opacity] active:scale-95 active:opacity-70 disabled:opacity-40 ${
    prominent ? "bg-app font-semibold text-app-foreground" : "bg-field/40 font-medium text-foreground"
  }`;
}

/** searchSection of FriendsView: the search by the exact username and the user found with it */
export function AddFriendSection({
  searchText,
  onChangeSearchText,
  isSearching,
  onSearch,
  foundUser,
  foundUserStatus,
  searchMessage,
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
  onAdd: (userId: number) => void;
  onCancelRequest: (userId: number) => void;
  onReport: (user: UserDTO) => void;
  openContextMenu: OpenContextMenu;
}) {
  const canSearch = searchText.trim() !== "";
  return (
    <FormSection footer="Usernames are case-sensitive.">
      <FormRow rowClassName="focus-ring-within rounded-[20px]" className="py-0">
        <form
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <Search size={18} className="shrink-0 text-secondary-label" aria-hidden />
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
            placeholder="Add by username"
            aria-label="Add by username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-tab-inactive [&::-webkit-search-cancel-button]:hidden"
          />
          {isSearching ? (
            <Spinner />
          ) : (
            canSearch && (
              <>
                <button
                  type="button"
                  aria-label="Clear"
                  className="shrink-0 text-tab-inactive active:opacity-50"
                  onClick={() => onChangeSearchText("")}
                >
                  <CircleX size={18} className="fill-current text-tab-inactive [&>path]:stroke-cell" aria-hidden />
                </button>
                <button type="submit" className="shrink-0 font-semibold text-app active:opacity-50">
                  Search
                </button>
              </>
            )
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
          <ProfileIcon hash={foundUser.profileIconUrl} size={44} color={foundUser.schemeColor} imageHash={foundUser.profileImageUrl} />
          <span className="min-w-0 flex-1 truncate font-medium">{foundUser.username}</span>
          <FoundUserAction
            status={foundUserStatus(foundUser)}
            username={foundUser.username}
            onAdd={() => onAdd(foundUser.id)}
            onCancelRequest={() => onCancelRequest(foundUser.id)}
          />
        </FormRow>
      )}
      {searchMessage && (
        <FormRow className="text-subheadline text-secondary-label">
          <UserRoundSearch size={18} className="shrink-0" aria-hidden />
          {searchMessage}
        </FormRow>
      )}
    </FormSection>
  );
}

/** The trailing part of the row of the found user: its relation to the user or the button to add it */
function FoundUserAction({
  status,
  username,
  onAdd,
  onCancelRequest,
}: {
  status: FoundUserStatus;
  username: string;
  onAdd: () => void;
  onCancelRequest: () => void;
}): ReactNode {
  switch (status) {
    case "you":
      return <span className="text-subheadline text-secondary-label">That&apos;s you</span>;
    case "friends":
      return <span className="text-subheadline text-secondary-label">Friends</span>;
    case "blocked":
      return <span className="text-subheadline text-secondary-label">Blocked</span>;
    case "busy":
      return <Spinner />;
    case "requested":
      return (
        <Menu
          label={`Request to ${username}`}
          items={[{ label: "Cancel request", icon: X, destructive: true, onSelect: onCancelRequest }]}
        >
          <span className={capsuleButtonClass(false)}>
            <Clock size={14} aria-hidden />
            Requested
          </span>
        </Menu>
      );
    case "add":
      return (
        <button type="button" className={`${capsuleButtonClass(true)} px-5`} onClick={onAdd}>
          Add
        </button>
      );
  }
}
