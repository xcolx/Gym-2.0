"use client";

import { FormRow, FormSection } from "@/components/ui/Form";
import { Spinner } from "@/components/ui/controls";
import { parseServerDate, type FriendRequestDTO, type SentFriendRequestDTO } from "@/lib/api";
import { formatRelativeNamed } from "@/lib/domain/relative-date";

import { capsuleButtonClass } from "./AddFriendSection";
import { PersonRow } from "./PersonRow";
import type { OpenContextMenu } from "./use-context-menu";

/**
 * requestsSection of FriendsView: the requests sent to the user, accepted or declined, shown when there are any or they
 * failed to load. First, since they wait for an answer.
 */
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
  // without a count if only the error is shown
  const header =
    requests.length === 0 ? "Friend requests" : requests.length === 1 ? "1 friend request" : `${requests.length} friend requests`;
  return (
    <FormSection header={header}>
      {requestsError && <FormRow className="text-footnote text-secondary-label">{requestsError}</FormRow>}
      {requests.map((request) => (
        <FormRow
          key={request.sender.id}
          className="flex-col items-stretch gap-3 py-3"
          rowClassName="select-none [-webkit-touch-callout:none]"
          onContextMenu={openContextMenu(request.sender.username, [
            { label: "Report…", onSelect: () => onReport(request) },
            { label: "Block", destructive: true, onSelect: () => onBlock(request) },
          ])}
        >
          <PersonRow user={request.sender} detail={formatRelativeNamed(parseServerDate(request.timestamp))} />
          {busyIds.has(request.sender.id) ? (
            <span className="flex min-h-[34px] items-center justify-center">
              <Spinner />
            </span>
          ) : (
            <div className="flex gap-2.5">
              <button
                type="button"
                className="min-h-[34px] flex-1 rounded-[10px] bg-app font-semibold text-app-foreground transition-[scale,opacity] active:scale-[0.98] active:opacity-70"
                onClick={() => onAnswer(request, true)}
              >
                Accept
              </button>
              <button
                type="button"
                className="min-h-[34px] flex-1 rounded-[10px] bg-field/40 font-medium transition-[scale,opacity] active:scale-[0.98] active:opacity-70"
                onClick={() => onAnswer(request, false)}
              >
                Decline
              </button>
            </div>
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}

/** sentSection of FriendsView: the requests the user sent that weren't answered yet */
export function SentRequestsSection({
  sentRequests,
  busyIds,
  onCancel,
}: {
  sentRequests: SentFriendRequestDTO[];
  busyIds: ReadonlySet<number>;
  onCancel: (userId: number) => void;
}) {
  if (sentRequests.length === 0) return null;
  return (
    <FormSection header="Sent">
      {sentRequests.map((request) => (
        <FormRow key={request.receiver.id}>
          <PersonRow
            user={request.receiver}
            detail={`Waiting · sent ${formatRelativeNamed(parseServerDate(request.timestamp))}`}
          />
          {busyIds.has(request.receiver.id) ? (
            <Spinner />
          ) : (
            <button type="button" className={capsuleButtonClass(false)} onClick={() => onCancel(request.receiver.id)}>
              Cancel
            </button>
          )}
        </FormRow>
      ))}
    </FormSection>
  );
}
