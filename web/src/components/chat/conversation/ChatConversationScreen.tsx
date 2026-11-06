"use client";

import Link from "next/link";
import { MessageSquareWarning, MessagesSquare } from "lucide-react";
import { Fragment } from "react";

import { PhotoViewer } from "@/components/ui/PhotoViewer";
import { PageHeader } from "@/components/ui/Page";
import { BottomAnchoredScroll, ChatScreen } from "@/components/chat/ChatScreen";
import { ContentUnavailable } from "@/components/chat/chat-controls";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { MessageAlert } from "@/components/ui/Alert";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { ChatImage } from "@/components/chat/images";
import { DaySeparator, MessageBubble } from "@/components/chat/messages";
import { chatTitle, sendingBlockedReason } from "@/lib/domain/chat";
import { memberCountText, messageRows } from "@/lib/domain/chat-feature";
import { useChat } from "@/lib/repo";
import type { ChatWithMembers, User } from "@/types/models";

import { ChatComposer } from "./ChatComposer";
import { PendingMessage } from "./PendingMessage";
import { PhotoCompose } from "./PhotoCompose";
import { useChatConversation } from "./use-chat-conversation";

/** Port of ChatView.swift */
export function ChatConversationScreen({ chatId }: { chatId: number }) {
  const chat = useChat(Number.isInteger(chatId) ? chatId : null);

  if (chat === undefined) return <ChatScreen>{null}</ChatScreen>;
  // Removed by a sync, e.g. after the user was removed from the group
  if (chat === null) {
    return (
      <ChatScreen>
        <PageHeader inline title="" back={{ href: "/chat", label: "Chats" }} />
        <ContentUnavailable
          icon={MessageSquareWarning}
          title="Chat not available"
          description="You're no longer a member of this chat."
          className="flex-1"
        />
      </ChatScreen>
    );
  }
  return <ChatConversation chat={chat} />;
}

function ChatConversation({ chat }: { chat: ChatWithMembers }) {
  const conversation = useChatConversation(chat);
  const { messages, users, currentUserId, isPending, isSending, photoToSend, viewedPhoto, menuMessage } = conversation;

  if (messages === undefined || users === undefined) return <ChatScreen>{null}</ChatScreen>;

  const rows = messageRows(messages, chat, users, currentUserId, isPending);
  const blockedReason = sendingBlockedReason(chat, users, currentUserId);
  const title = chatTitle(chat, users, currentUserId);

  return (
    <ChatScreen>
      <PageHeader
        inline
        title={title}
        back={{ href: "/chat", label: "Chats" }}
        principal={<TitleButton chat={chat} users={users} currentUserId={currentUserId} title={title} />}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <BottomAnchoredScroll scrollRef={conversation.scrollRef}>
          <div className="flex flex-col px-4 py-2">
            {rows.map(({ message, daySeparator, isOwn, senderName, startsRun, endsRun }) => (
              <Fragment key={message.serverId}>
                {daySeparator && <DaySeparator date={daySeparator} />}
                <div className={startsRun ? "pt-2.5" : "pt-0.5"}>
                  <MessageBubble
                    message={message}
                    isOwn={isOwn}
                    senderName={senderName}
                    startsRun={startsRun}
                    endsRun={endsRun}
                    onTapPhoto={conversation.setViewedPhoto}
                    onOpenMenu={() => conversation.openMenu(message)}
                  />
                </div>
              </Fragment>
            ))}
            {isPending && <PendingMessage text={chat.input} isSending={isSending} onRetry={() => void conversation.retry()} />}
          </div>
        </BottomAnchoredScroll>
        {messages.length === 0 && !isPending && (
          <ContentUnavailable
            icon={MessagesSquare}
            title="No messages yet"
            description="Say hi!"
            className="pointer-events-none absolute inset-0"
          />
        )}
      </div>

      <ChatComposer
        blockedReason={blockedReason}
        text={conversation.text}
        onChangeText={conversation.setDraft}
        isPending={isPending}
        canSend={conversation.canSend}
        isSending={isSending}
        isSendingPhoto={conversation.isSendingPhoto}
        onSend={() => void conversation.send()}
        onPickPhoto={(file) => void conversation.pickPhoto(file)}
      />

      {viewedPhoto && <PhotoViewer hash={viewedPhoto} onClose={() => conversation.setViewedPhoto(null)} />}
      {photoToSend && (
        <PhotoCompose url={photoToSend.url} onCancel={conversation.closePhotoCompose} onSend={conversation.sendComposedPhoto} />
      )}
      <MessageAlert title="Not sent" message={conversation.error} onClose={conversation.clearError} />
      <ActionSheet
        open={menuMessage !== null}
        title="Message"
        message={menuMessage?.senderId === currentUserId ? "Deleting removes it for everyone in this chat." : undefined}
        buttons={menuMessage ? conversation.menuButtons(menuMessage) : []}
        onClose={conversation.closeMenu}
      />
      <MessageAlert title="Not deleted" message={conversation.deleteError} onClose={conversation.clearDeleteError} />
      <ReportDialog target={conversation.reportTarget} onClose={conversation.closeReport} />
    </ChatScreen>
  );
}

/** The image and the name of the chat in the middle of the bar, which open the chat info */
function TitleButton({
  chat,
  users,
  currentUserId,
  title,
}: {
  chat: ChatWithMembers;
  users: Map<number, User>;
  currentUserId: number | null;
  title: string;
}) {
  return (
    <Link
      href={`/chat/${chat.serverId}/info`}
      aria-label={`${title}, chat info`}
      className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-field/20 active:opacity-60"
    >
      {/* A tap opens the chat info, not the photo */}
      <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={30} opensPhotoViewer={false} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-subheadline font-semibold">{title}</span>
        {chat.groupChat && (
          <span className="truncate text-[11px] leading-[13px] text-secondary-label">{memberCountText(chat.members.length)}</span>
        )}
      </span>
    </Link>
  );
}
