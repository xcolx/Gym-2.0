"use client";

import { MessageSquareWarning } from "lucide-react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { ButtonRow, FormPage, FormSection } from "@/components/ui/Form";
import { ContentUnavailable } from "@/components/chat/chat-controls";
import { MessageAlert } from "@/components/ui/Alert";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { useChat, useUsersById } from "@/lib/repo";
import type { ChatWithMembers, User } from "@/types/models";

import { AddMembersSheet } from "./AddMembersSheet";
import { GroupSection } from "./GroupSection";
import { MembersSection } from "./MembersSection";
import { useChatInfo } from "./use-chat-info";

/** Port of ChatInfoView.swift. All changes need a connection. */
export function ChatInfoScreen({ chatId }: { chatId: number }) {
  const chat = useChat(Number.isInteger(chatId) ? chatId : null);
  const users = useUsersById();

  if (chat === undefined || users === undefined) return null;
  if (chat === null) {
    return (
      <FormPage title="" inline back={{ href: "/chat", label: "Chats" }}>
        <ContentUnavailable
          icon={MessageSquareWarning}
          title="Chat Not Available"
          description="You're no longer a member of this chat."
          className="pt-24"
        />
      </FormPage>
    );
  }
  return <ChatInfo chat={chat} users={users} />;
}

function ChatInfo({ chat, users }: { chat: ChatWithMembers; users: Map<number, User> }) {
  const info = useChatInfo(chat, users);
  const chatId = chat.serverId;
  const { isAdmin, title, confirmationDialog, isLeaving, isDeleting } = info;

  return (
    <FormPage title={title} inline back={{ href: `/chat/${chatId}`, label: title }}>
      {chat.groupChat && <GroupSection chat={chat} isAdmin={isAdmin} onError={info.setError} />}

      <MembersSection
        chat={chat}
        members={info.members}
        users={users}
        currentUserId={info.currentUserId}
        busyIds={info.busyIds}
        footer={info.message}
        canAddMembers={isAdmin && !chat.isPublic}
        onAddMembers={info.showAddMembers}
        memberActions={info.memberActions}
      />

      <FormSection>
        {chat.groupChat && (
          <ButtonRow destructive onClick={() => info.report({ kind: "chat", id: chatId, name: chat.name ?? "Group" })}>
            Report Group…
          </ButtonRow>
        )}
        {chat.groupChat && (
          <ButtonRow
            destructive
            isLoading={isLeaving}
            disabled={isLeaving || isDeleting}
            onClick={() => info.askToConfirm({ kind: "leave" })}
          >
            Leave Group
          </ButtonRow>
        )}
        {(!chat.groupChat || isAdmin) && (
          <ButtonRow
            destructive
            isLoading={isDeleting}
            disabled={isLeaving || isDeleting}
            onClick={() => info.askToConfirm({ kind: "delete" })}
          >
            {chat.groupChat ? "Delete Group" : "Delete Chat"}
          </ButtonRow>
        )}
      </FormSection>

      <ActionSheet
        open={confirmationDialog !== null}
        title={confirmationDialog?.title ?? ""}
        message={confirmationDialog?.message}
        buttons={confirmationDialog?.buttons ?? []}
        onClose={info.closeConfirmation}
      />
      <ReportDialog target={info.reportTarget} onClose={info.closeReport} block={info.blockFromReport} />
      {info.showsAddMembers && <AddMembersSheet chat={chat} onClose={info.closeAddMembers} />}
      <MessageAlert title="Something went wrong" message={info.error} onClose={info.clearError} />
    </FormPage>
  );
}
