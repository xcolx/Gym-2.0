"use client";

import Link from "next/link";
import { MessageCircle, MessageSquareWarning } from "lucide-react";
import { Fragment } from "react";

import { PhotoViewer } from "@/components/ui/PhotoViewer";
import { PageHeader } from "@/components/ui/Page";
import { BottomAnchoredScroll, ChatScreen } from "@/components/chat/ChatScreen";
import { ContentUnavailable } from "@/components/chat/chat-controls";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { MessageAlert } from "@/components/ui/Alert";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { ChatImage } from "@/components/chat/images";
import { MessageBubble } from "@/components/chat/messages";
import { chatTitle, sendingBlockedReason } from "@/lib/domain/chat";
import { formatDaySeparator, messageRows } from "@/lib/domain/chat-feature";
import { useChat } from "@/lib/repo";
import type { ChatWithMembers } from "@/types/models";

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
          title="Chat Not Available"
          description="You're no longer a member of this chat."
          className="flex-1"
        />
      </ChatScreen>
    );
  }
  return <ChatConversation chat={chat} />;
}

function ChatConversation({ chat }: { chat: ChatWithMembers }) {
  const chatId = chat.serverId;
  const conversation = useChatConversation(chat);
  const { messages, users, currentUserId, isPending, isSending, photoToSend, viewedPhoto, menuMessage } = conversation;

  if (messages === undefined || users === undefined) return <ChatScreen>{null}</ChatScreen>;

  const rows = messageRows(messages, chat, users, currentUserId);
  const blockedReason = sendingBlockedReason(chat, users, currentUserId);
  const title = chatTitle(chat, users, currentUserId);

  return (
    <ChatScreen>
      <PageHeader inline
        title={title}
        back={{ href: "/chat", label: "Chats" }}
        trailing={
          // A tap opens the chat info, not the photo
          <Link href={`/chat/${chatId}/info`} aria-label="Chat info" className="active:opacity-60">
            <ChatImage chat={chat} users={users} currentUserId={currentUserId} size={32} opensPhotoViewer={false} />
          </Link>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col border-t border-separator">
        <BottomAnchoredScroll scrollRef={conversation.scrollRef}>
          <div className="flex flex-col gap-1.5 p-4">
            {rows.map(({ message, daySeparator, isOwn, senderName }) => (
              <Fragment key={message.serverId}>
                {daySeparator && (
                  <p className="py-1.5 text-center text-[12px] text-secondary-label">{formatDaySeparator(daySeparator)}</p>
                )}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  senderName={senderName}
                  onTapPhoto={conversation.setViewedPhoto}
                  onOpenMenu={() => conversation.openMenu(message)}
                />
              </Fragment>
            ))}
            {isPending && <PendingMessage text={chat.input} isSending={isSending} onRetry={() => void conversation.retry()} />}
          </div>
        </BottomAnchoredScroll>
        {messages.length === 0 && !isPending && (
          <ContentUnavailable
            icon={MessageCircle}
            title="No Messages"
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
