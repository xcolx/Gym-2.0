"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { SETTINGS_BACK } from "@/components/settings/SaveButton";
import { SyncStatusText } from "@/components/settings/SettingsSections";
import { ButtonRow, FormPage, FormRow, FormSection, LabeledRow, LinkRow } from "@/components/ui/Form";
import { formatRelativeNamed } from "@/lib/domain/relative-date";
import { resync, syncStore, useSyncProblems, useSyncState } from "@/lib/sync";
import { useNow } from "@/lib/use-now";

/** Port of SyncView (SettingsView.swift): the state of the sync, the manual resync and what is out of sync */
export default function SyncPage() {
  const status = useSyncState();
  const problems = useSyncProblems();
  // The time since the last sync moves on while the page is open
  const now = useNow(30_000);
  const [isResyncing, setIsResyncing] = useState(false);
  const [didFinish, setDidFinish] = useState(false);
  /** The failure of the resync, null if it succeeded */
  const [failure, setFailure] = useState<string | null>(null);

  const start = async () => {
    setIsResyncing(true);
    setDidFinish(false);
    await resync();
    const after = syncStore.get();
    setFailure(after.state === "failed" ? after.failureMessage : null);
    setIsResyncing(false);
    setDidFinish(true);
  };

  return (
    <FormPage title="Sync" inline back={SETTINGS_BACK}>
      <FormSection>
        <LabeledRow label="Status" value={<SyncStatusText />} />
        {status.lastSyncDate && <LabeledRow label="Last synced" value={formatRelativeNamed(status.lastSyncDate, new Date(now))} />}
        {status.state === "failed" && status.failureMessage && (
          <FormRow>
            <span className="text-footnote text-[#ff3b30]">{status.failureMessage}</span>
          </FormRow>
        )}
      </FormSection>

      {problems.length > 0 && (
        <FormSection>
          <LinkRow
            href="/settings/sync/problems"
            label={
              <span className="flex items-center gap-3 text-[#ff3b30]">
                <TriangleAlert size={20} className="w-6 shrink-0" fill="currentColor" stroke="var(--cell-bg)" aria-hidden />
                Sync problems
              </span>
            }
            value={<span className="text-[#ff3b30]">{problems.length}</span>}
          />
        </FormSection>
      )}

      <FormSection
        footer={
          didFinish && failure !== null ? (
            <span className="text-[#ff3b30]">The resync failed: {failure}</span>
          ) : didFinish ? (
            "Everything was reloaded from the server."
          ) : (
            "Uploads all changes that are not on the server yet and then loads everything again. Use it if something seems out of sync."
          )
        }
      >
        <ButtonRow onClick={() => void start()} disabled={isResyncing} isLoading={isResyncing}>
          Resync everything
        </ButtonRow>
      </FormSection>
    </FormPage>
  );
}
