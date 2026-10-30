"use client";

import { useState } from "react";

import { errorMessage, type UserDTO } from "@/lib/api";
import { report } from "@/lib/chat/actions";
import { MAX_REPORT_REASON_LENGTH, reportMessage, reportReason, reportTitle, type ReportTarget } from "@/lib/domain/chat-feature";
import { MessageAlert, PromptAlert } from "@/components/ui/Alert";

export type { ReportTarget };

/**
 * Port of ReportAlert.swift. For a user with `blocks`, `block` is called first, so the screen can update itself like
 * after a plain block.
 */
export function ReportDialog({
  target,
  onClose,
  block,
}: {
  target: ReportTarget | null;
  onClose: () => void;
  block?: (id: number, profile: UserDTO | null) => Promise<void>;
}) {
  const [result, setResult] = useState<{ title: string; message: string } | null>(null);

  const send = async (target: ReportTarget, reason: string) => {
    try {
      await report(target, reason, block);
      setResult({ title: "Report Sent", message: "Thank you. The report is reviewed within 24 hours." });
    } catch (caught) {
      setResult({ title: "Could not report", message: errorMessage(caught) });
    }
  };

  return (
    <>
      <PromptAlert
        open={target !== null}
        title={target ? reportTitle(target) : ""}
        message={target ? reportMessage(target) : undefined}
        placeholder="Reason"
        confirmLabel="Report"
        destructive
        maxLength={MAX_REPORT_REASON_LENGTH}
        canConfirm={(text) => reportReason(text) !== null}
        onClose={onClose}
        onConfirm={(text) => {
          const reason = reportReason(text);
          if (target && reason !== null) void send(target, reason);
        }}
      />
      <MessageAlert title={result?.title ?? ""} message={result?.message ?? null} onClose={() => setResult(null)} />
    </>
  );
}
