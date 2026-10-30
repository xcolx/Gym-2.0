"use client";

import { Ellipsis, UserRoundCheck } from "lucide-react";
import { useState } from "react";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { FormPage, FormRow, FormSection } from "@/components/ui/Form";
import { ProfileIcon } from "@/components/ui/ProfileIcon";
import { SETTINGS_BACK } from "@/components/settings/SaveButton";
import { ReportDialog, type ReportTarget } from "@/components/chat/ReportDialog";
import { MessageAlert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { errorMessage } from "@/lib/api";
import { useBlockedUsers } from "@/lib/repo/hooks";
import { unblockUser } from "@/lib/chat/actions";
import type { User } from "@/types/models";

/** Port of BlockedUsersView.swift. The context menu of iOS is the "…" button. */
export default function BlockedUsersPage() {
  const blockedUsers = useBlockedUsers();
  /** The IDs of the users an unblock is running for */
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<User | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const run = async (userId: number, action: () => Promise<void>) => {
    if (busyIds.has(userId)) return;
    setBusyIds((ids) => new Set(ids).add(userId));
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(userId);
        return next;
      });
    }
  };

  return (
    <FormPage title="Blocked Users" inline back={SETTINGS_BACK}>
      {blockedUsers && blockedUsers.length > 0 && (
        <FormSection>
          {blockedUsers.map((user) => (
            <FormRow key={user.serverId} className="gap-3 py-2">
              <ProfileIcon hash={user.profileIconUrl} size={40} color={user.schemeColor} imageHash={user.profileImageUrl} />
              <p className="min-w-0 flex-1 truncate">{user.username}</p>
              {busyIds.has(user.serverId) ? (
                <Spinner />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void run(user.serverId, () => unblockUser(user.serverId))}
                    className="rounded-full bg-app/15 px-3 py-1 text-[15px] text-app active:opacity-60"
                  >
                    Unblock
                  </button>
                  <button
                    type="button"
                    aria-label={`More for ${user.username}`}
                    onClick={() => setMenuTarget(user)}
                    className="-mr-1 p-1 text-app active:opacity-50"
                  >
                    <Ellipsis size={20} />
                  </button>
                </>
              )}
            </FormRow>
          ))}
        </FormSection>
      )}

      {blockedUsers?.length === 0 && (
        <div className="flex flex-col items-center gap-3 pt-[22dvh] text-center">
          <UserRoundCheck size={56} strokeWidth={1.5} className="text-secondary-label" aria-hidden />
          <p className="text-title2 font-bold">No Blocked Users</p>
        </div>
      )}

      <ActionSheet
        open={menuTarget !== null}
        title={menuTarget?.username ?? ""}
        onClose={() => setMenuTarget(null)}
        buttons={[
          {
            label: "Report…",
            destructive: true,
            onSelect: () =>
              menuTarget && setReportTarget({ kind: "user", id: menuTarget.serverId, username: menuTarget.username }),
          },
        ]}
      />

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />

      <MessageAlert title="Something went wrong" message={error} onClose={() => setError(null)} />
    </FormPage>
  );
}
