"use client";

import { FormRow, FormSection } from "@/components/ui/Form";
import { BORDERED_BUTTON, PROMINENT_BUTTON } from "@/components/chat/chat-controls";
import { Spinner } from "@/components/ui/controls";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { parseServerDate, type FriendRequestDTO } from "@/lib/api";
import { formatRelativeNamed } from "@/lib/domain/relative-date";

import type { OpenContextMenu } from "./use-context-menu";

/** The received friend requests of FriendsView, accepted or declined, shown when there are any or they failed to load */
export function FriendRequestsSection({
  requests,
  requestsError,
  busyIds,
  onAnswer,
  onReport,
  onBlock,
  openContextMenu,
}: {
  requests: FriendRequestDTO[];
  requestsError: string | null;
  busyIds: ReadonlySet<number>;
  onAnswer: (request: FriendRequestDTO, accept: boolean) => void;
  onReport: (request: FriendRequestDTO) => void;
  onBlock: (request: FriendRequestDTO) => void;
  openContextMenu: OpenContextMenu;
}) {
  if (requests.length === 0 && !requestsError) return null;
  return (
    <FormSection header="Friend Requests">
      {requestsError && <FormRow className="text-footnote text-secondary-label">{requestsError}</FormRow>}
      {requests.map((request) => (
        <FormRow
          key={request.sender.id}
          rowClassName="select-none [-webkit-touch-callout:none]"
          onContextMenu={openContextMenu(request.sender.username, [
            { label: "Report…", onSelect: () => onReport(request) },
            { label: "Block", destructive: true, onSelect: () => onBlock(request) },
          ])}
        >
          <ProfileIcon
            hash={request.sender.profileIconUrl}
            size={40}
            color={request.sender.schemeColor}
            imageHash={request.sender.profileImageUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate">{request.sender.username}</p>
            <p className="text-[12px] text-secondary-label">{formatRelativeNamed(parseServerDate(request.timestamp))}</p>
          </div>
          {busyIds.has(request.sender.id) ? (
            <Spinner />
          ) : (
            <div className="flex shrink-0 gap-2">
              <button type="button" className={PROMINENT_BUTTON} onClick={() => onAnswer(request, true)}>
                Accept
              </button>
              <button type="button" className={BORDERED_BUTTON} onClick={() => onAnswer(request, false)}>
                Decline
              </button>
            </div>
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}
