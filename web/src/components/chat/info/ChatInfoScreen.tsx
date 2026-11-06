"use client";

import { LogOut, MessageSquareWarning, Trash2 } from "lucide-react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { ButtonRow, FormPage, FormSection } from "@/components/ui/Form";
import { ContentUnavailable } from "@/components/chat/chat-controls";
import { MessageAlert } from "@/components/ui/Alert";
import { ReportDialog } from "@/components/chat/ReportDialog";
import { otherMemberId } from "@/lib/domain/chat";
import { chatInfoSubtitle } from "@/lib/domain/chat-feature";
import { useChat, useUsersById } from "@/lib/repo";
import type { ChatWithMembers, User } from "@/types/models";

import { AddMembersSheet } from "./AddMembersSheet";
import { ChatInfoHeader } from "./ChatInfoHeader";
import { DirectChatActions } from "./DirectChatActions";
import { GroupSection } from "./GroupSection";
import { MembersSection } from "./MembersSection";
import { useChatInfo } from "./use-chat-info";
import { useGroupSection } from "./use-group-section";

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
          title="Chat not available"
          description="You're no longer a member of this chat."
          className="pt-24"
        />
      </FormPage>
    );
  }
  return <ChatInfo chat={chat} users={users} />;
}

/**
 * The members of a chat with the friend actions for them, and the name and image of a group. Only the admins of a group
 * can change it, add and remove members of a private group and delete it. Both members of a direct chat can delete it.
 */
function ChatInfo({ chat, users }: { chat: ChatWithMembers; users: Map<number, User> }) {
  const info = useChatInfo(chat, users);
  const group = useGroupSection(chat, info.setError);
  const chatId = chat.serverId;
  const { isAdmin, title, confirmationDialog, isLeaving, isDeleting, currentUserId } = info;
  const otherId = chat.groupChat ? null : otherMemberId(chat, currentUserId);
  const other = otherId === null ? undefined : users.get(otherId);
  const otherMember = chat.members.find((member) => member.userId === otherId);

  return (
    <FormPage title={title} inline back={{ href: `/chat/${chatId}`, label: title }}>
      <FormSection plain>
        <ChatInfoHeader
          chat={chat}
          users={users}
          currentUserId={currentUserId}
          title={title}
          subtitle={chatInfoSubtitle(chat, users, currentUserId)}
          canChangeImage={chat.groupChat && isAdmin}
          isSaving={group.isSaving}
          onPickImage={(file) => void group.pick(file)}
        />
      </FormSection>

      {chat.groupChat ? (
        <>
          {isAdmin && <GroupSection chat={chat} group={group} />}
          <MembersSection
            chat={chat}
            members={info.members}
            users={users}
            currentUserId={currentUserId}
            busyIds={info.busyIds}
            footer={info.message}
            canAddMembers={isAdmin && !chat.isPublic}
            onAddMembers={info.showAddMembers}
            memberActions={info.memberActions}
          />
        </>
      ) : (
        other &&
        otherMember && (
          <FormSection plain footer={info.message && <p className="text-center">{info.message}</p>}>
            <DirectChatActions
              actions={info.memberActions(otherMember, other, other.username)}
              isBusy={info.busyIds.has(other.serverId)}
            />
          </FormSection>
        )
      )}

      <FormSection>
        {chat.groupChat && (
          <ButtonRow destructive onClick={() => info.report({ kind: "chat", id: chatId, name: chat.name ?? "Group" })}>
            <MessageSquareWarning size={20} className="w-6" aria-hidden />
            Report group…
          </ButtonRow>
        )}
        {chat.groupChat && (
          <ButtonRow
            destructive
            isLoading={isLeaving}
            disabled={isLeaving || isDeleting}
            onClick={() => info.askToConfirm({ kind: "leave" })}
          >
            <LogOut size={20} className="w-6" aria-hidden />
            Leave group
          </ButtonRow>
        )}
        {(!chat.groupChat || isAdmin) && (
          <ButtonRow
            destructive
            isLoading={isDeleting}
            disabled={isLeaving || isDeleting}
            onClick={() => info.askToConfirm({ kind: "delete" })}
          >
            <Trash2 size={20} className="w-6" aria-hidden />
            {chat.groupChat ? "Delete group" : "Delete chat"}
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
