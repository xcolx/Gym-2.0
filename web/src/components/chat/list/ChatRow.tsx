import Link from "next/link";

import { ChatImage } from "@/components/chat/images";
import { chatTitle, chatLastActivity } from "@/lib/domain/chat";
import { chatPreview, formatChatListDate } from "@/lib/domain/chat-feature";
import type { ChatListItem } from "@/lib/repo";
import type { User } from "@/types/models";

/** ChatRowView: image, name, preview of the latest message and the unread count */
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
  return (
    <li className="relative flex items-center gap-3 px-4 py-2 active:bg-field/30">
      <Link href={`/chat/${chat.serverId}`} className="absolute inset-0" aria-label={title} />
      <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={50} />
      <div className="pointer-events-none min-w-0 flex-1 py-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-1 truncate text-headline font-semibold">{title}</span>
          <span className={`shrink-0 text-[12px] ${unread > 0 ? "text-app" : "text-secondary-label"}`}>
            {formatChatListDate(chatLastActivity(chat))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-[15px] leading-5 text-secondary-label">
            {chatPreview(chat, users, currentUserId) ?? "No messages yet"}
          </span>
          {unread > 0 && (
            <span className="shrink-0 rounded-full bg-app px-[7px] py-[2px] text-[12px] font-bold leading-4 text-white">
              {unread}
            </span>
          )}
        </div>
      </div>
      <span className="absolute bottom-0 left-[78px] right-0 h-px bg-separator" aria-hidden />
    </li>
  );
}
