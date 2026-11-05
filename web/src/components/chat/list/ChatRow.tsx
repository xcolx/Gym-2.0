import Link from "next/link";

import { ChatImage } from "@/components/chat/images";
import { chatTitle, chatLastActivity } from "@/lib/domain/chat";
import { chatPreview, formatChatListDate } from "@/lib/domain/chat-feature";
import type { ChatListItem } from "@/lib/repo";
import type { User } from "@/types/models";

/** ChatRowView of ChatsView.swift: image, name, preview of the latest message and the unread count */
export function ChatRow({
  item: { chat, unread },
  users,
  currentUserId,
}: {
  item: ChatListItem;
  users: Map<number, User>;
  currentUserId: number | null;
}) {
  const title = chatTitle(chat, users, currentUserId);
  const hasUnread = unread > 0;
  return (
    <li className="group/row relative flex items-center gap-3 px-4 py-2.5 hover:bg-field/15 active:bg-field/40">
      <Link href={`/chat/${chat.serverId}`} className="absolute inset-0" aria-label={title} />
      <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={52} />
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex items-baseline gap-2">
          <span className={`flex-1 truncate ${hasUnread ? "font-bold" : "font-semibold"}`}>{title}</span>
          <span className={`shrink-0 text-caption1 ${hasUnread ? "font-semibold text-app" : "text-secondary-label"}`}>
            {formatChatListDate(chatLastActivity(chat))}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span
            className={`line-clamp-2 flex-1 break-words text-subheadline ${hasUnread ? "font-medium text-foreground" : "text-secondary-label"}`}
          >
            {chatPreview(chat, users, currentUserId) ?? "No messages yet"}
          </span>
          {hasUnread && (
            <span className="shrink-0 rounded-full bg-app px-[7px] py-[2px] text-caption1 font-bold text-app-foreground">{unread}</span>
          )}
        </div>
      </div>
      <span className="absolute bottom-0 left-[80px] right-0 h-px bg-separator group-last/row:hidden" aria-hidden />
    </li>
  );
}
