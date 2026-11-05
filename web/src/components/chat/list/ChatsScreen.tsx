"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Globe, MessagesSquare, Search, SquarePen, UserPlus, Users, UsersRound } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader } from "@/components/ui/Page";
import { SearchField } from "@/components/ui/SearchField";
import { SecondaryButton } from "@/components/ui/PrimaryButton";
import { ContentUnavailable, Menu } from "@/components/chat/chat-controls";
import { NewGroupSheet } from "@/components/chat/NewGroupSheet";
import { chatTitle } from "@/lib/domain/chat";
import { fuzzyFilter } from "@/lib/domain/fuzzy-search";
import { useChatList, useCurrentUserId, useUsersById } from "@/lib/repo";

import { AIConversationsBanner } from "./AIConversationsBanner";
import { ChatRow } from "./ChatRow";
import { useFriendRequestCount } from "./use-friend-request-count";

/**
 * Port of ChatsView.swift: the Gym-AI, the pending friend requests and the direct and group chats of the user, newest
 * first, which can be searched by name
 */
export function ChatsScreen() {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const items = useChatList(currentUserId);
  const users = useUsersById();
  const [showsNewGroup, setShowsNewGroup] = useState(false);
  const [searchText, setSearchText] = useState("");
  const friendRequestCount = useFriendRequestCount();

  // The chats are polled by the SyncRunner of the AppShell on every /chat route (no push updates yet)

  const shownItems =
    items && users && searchText.trim() !== ""
      ? fuzzyFilter(items, searchText, ({ chat }) => [chatTitle(chat, users, currentUserId)])
      : items;

  return (
    <Page className="bg-grouped">
      <PageHeader
        title="Chats"
        leading={
          <Link
            href="/chat/friends"
            className="relative flex items-center text-app active:opacity-50"
            aria-label={friendRequestCount > 0 ? `Friends, ${friendRequestCount} requests` : "Friends"}
          >
            <Users size={24} fill="currentColor" strokeWidth={1.5} aria-hidden />
            {friendRequestCount > 0 && <span className="absolute -right-1 -top-0.5 h-[9px] w-[9px] rounded-full bg-[#ff3b30]" />}
          </Link>
        }
        trailing={
          <Menu
            label="New chat"
            items={[
              { label: "New group", icon: UsersRound, onSelect: () => setShowsNewGroup(true) },
              { label: "Public groups", icon: Globe, onSelect: () => router.push("/chat/groups") },
              { label: "Friends", icon: Users, onSelect: () => router.push("/chat/friends") },
            ]}
          >
            <SquarePen size={23} aria-hidden />
          </Menu>
        }
      />
      <SearchField value={searchText} onChange={setSearchText} label="Search chats" placeholder="Search chats" className="mx-4 mb-4" />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-6">
        {searchText === "" && (
          <div className="card overflow-hidden">
            <AIConversationsBanner />
            {friendRequestCount > 0 && (
              <>
                <div className="ml-[72px] border-t border-separator" />
                <FriendRequestsRow count={friendRequestCount} />
              </>
            )}
          </div>
        )}

        {shownItems !== undefined && users !== undefined && (
          <>
            {shownItems.length > 0 && (
              <ul className="card overflow-hidden" aria-label="Chats">
                {shownItems.map((item) => (
                  <ChatRow key={item.chat.serverId} item={item} users={users} currentUserId={currentUserId} />
                ))}
              </ul>
            )}
            {items?.length === 0 ? (
              <ContentUnavailable
                icon={MessagesSquare}
                title="No chats yet"
                description="Add friends to chat with them, or join a public group."
                className="flex-1"
              >
                <div className="flex w-56 flex-col gap-2.5">
                  <SecondaryButton onClick={() => router.push("/chat/friends")}>Friends</SecondaryButton>
                  <SecondaryButton onClick={() => router.push("/chat/groups")}>Public groups</SecondaryButton>
                </div>
              </ContentUnavailable>
            ) : (
              shownItems.length === 0 && (
                <ContentUnavailable
                  icon={Search}
                  title={`No results for “${searchText}”`}
                  description="Check the spelling or try a new search."
                  className="flex-1"
                />
              )
            )}
          </>
        )}
      </div>

      <NewGroupSheet
        open={showsNewGroup}
        onClose={() => setShowsNewGroup(false)}
        onCreate={(chatId) => router.push(`/chat/${chatId}`)}
      />
    </Page>
  );
}

/** Only while friend requests are pending */
function FriendRequestsRow({ count }: { count: number }) {
  return (
    <Link href="/chat/friends" className="flex items-center gap-3 px-4 py-3 hover:bg-field/15 active:bg-field/40">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-app/15 text-app" aria-hidden>
        <UserPlus size={21} />
      </span>
      <span className="flex-1 font-medium">{count === 1 ? "1 friend request" : `${count} friend requests`}</span>
      <span className="rounded-full bg-[#ff3b30] px-[7px] py-[2px] text-caption1 font-bold text-white">{count}</span>
      <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
    </Link>
  );
}
