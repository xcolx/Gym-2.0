"use client";

import { CircleEllipsis, UserPlus } from "lucide-react";

import { ButtonRow, FormRow, FormSection } from "@/components/ui/Form";
import { Menu, type MenuItem } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { memberStatus } from "@/lib/domain/chat-feature";
import type { ChatMember, ChatWithMembers, User } from "@/types/models";

/** The members of a chat with the menu of the actions for each, and "Add Members" for the admins of a private group */
export function MembersSection({
  chat,
  members,
  users,
  currentUserId,
  busyIds,
  footer,
  canAddMembers,
  onAddMembers,
  memberActions,
}: {
  chat: ChatWithMembers;
  members: ChatMember[];
  users: Map<number, User>;
  currentUserId: number | null;
  busyIds: ReadonlySet<number>;
  footer: string | null;
  canAddMembers: boolean;
  onAddMembers: () => void;
  memberActions: (member: ChatMember, user: User | undefined, username: string) => MenuItem[];
}) {
  return (
    <FormSection header={chat.groupChat ? `${chat.members.length} Members` : "Member"} footer={footer}>
      {canAddMembers && (
        <ButtonRow onClick={onAddMembers}>
          <UserPlus size={20} aria-hidden />
          Add Members
        </ButtonRow>
      )}
      {members.map((member) => {
        const { userId } = member;
        const user = users.get(userId);
        const username = user?.username ?? "Unknown user";
        const status = memberStatus(chat, member, user);
        const actions = memberActions(member, user, username);
        return (
          <FormRow key={userId}>
            <ProfileIcon hash={user?.profileIconUrl} size={40} color={user?.schemeColor} imageHash={user?.profileImageUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate">{userId === currentUserId ? `${username} (You)` : username}</p>
              {status && <p className="text-[12px] text-secondary-label">{status}</p>}
            </div>
            {busyIds.has(userId) ? (
              <Spinner />
            ) : (
              actions.length > 0 && (
                <Menu label={`Actions for ${username}`} items={actions}>
                  <CircleEllipsis size={24} aria-hidden />
                </Menu>
              )
            )}
          </FormRow>
        );
      })}
    </FormSection>
  );
}
