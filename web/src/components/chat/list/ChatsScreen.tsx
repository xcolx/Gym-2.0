"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, MessagesSquare, SquarePen, Users, UsersRound } from "lucide-react";
import { useState } from "react";

import { Page, PageHeader } from "@/components/ui/Page";
import { ContentUnavailable, Menu, PLAIN_BUTTON } from "@/components/chat/chat-controls";
import { NewGroupSheet } from "@/components/chat/NewGroupSheet";
import { useChatList, useCurrentUserId, useUsersById } from "@/lib/repo";

import { AIConversationsBanner } from "./AIConversationsBanner";
import { ChatRow } from "./ChatRow";
import { useFriendRequestCount } from "./use-friend-request-count";

/** Port of ChatsView.swift */
export function ChatsScreen() {
  const router = useRouter();
  const currentUserId = useCurrentUserId();
  const items = useChatList(currentUserId);
  const users = useUsersById();
  const [showsNewGroup, setShowsNewGroup] = useState(false);
  const friendRequestCount = useFriendRequestCount();

  // The chats are polled by the SyncRunner of the AppShell on every /chat route (no push updates yet)

  return (
    <Page>
      <PageHeader inline
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
              { label: "New Group", icon: UsersRound, onSelect: () => setShowsNewGroup(true) },
              { label: "Public Groups", icon: Globe, onSelect: () => router.push("/chat/groups") },
            ]}
          >
            <SquarePen size={23} aria-hidden />
          </Menu>
        }
      />

      <AIConversationsBanner />

      {items !== undefined && users !== undefined && (
        <>
          <ul>
            {items.map((item) => (
              <ChatRow key={item.chat.serverId} item={item} users={users} currentUserId={currentUserId} />
            ))}
          </ul>
          {items.length === 0 && (
            <ContentUnavailable
              icon={MessagesSquare}
              title="No Chats"
              description="Add friends to chat with them, or join a public group."
              className="flex-1"
            >
              <Link href="/chat/friends" className={PLAIN_BUTTON}>
                Friends
              </Link>
              <Link href="/chat/groups" className={PLAIN_BUTTON}>
                Public Groups
              </Link>
            </ContentUnavailable>
          )}
        </>
      )}

      <NewGroupSheet
        open={showsNewGroup}
        onClose={() => setShowsNewGroup(false)}
        onCreate={(chatId) => router.push(`/chat/${chatId}`)}
      />
    </Page>
  );
}
