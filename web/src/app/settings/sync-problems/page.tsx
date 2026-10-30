"use client";

import { CloudCheck, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { FormPage, FormSection } from "@/components/ui/Form";
import { SETTINGS_BACK } from "@/components/settings/SaveButton";
import { Spinner } from "@/components/ui/controls";
import { appLocale } from "@/lib/domain/format";
import { sync, useSyncProblems } from "@/lib/sync";


/** Port of SyncProblemsView.swift */
export default function SyncProblemsPage() {
  const problems = useSyncProblems();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncAgain = async () => {
    setIsSyncing(true);
    await sync();
    setIsSyncing(false);
  };

  return (
    <FormPage
      title="Sync Problems"
      inline
      back={SETTINGS_BACK}
      trailing={
        isSyncing ? (
          <Spinner size={22} />
        ) : (
          <button type="button" onClick={() => void syncAgain()} aria-label="Sync Again" title="Sync Again" className="active:opacity-50">
            <RotateCw size={22} />
          </button>
        )
      }
    >
      {problems.length === 0 ? (
        // ContentUnavailableView
        <div className="flex flex-col items-center gap-2 pt-[22dvh] text-center">
          <CloudCheck size={48} className="mb-2 text-secondary-label" aria-hidden />
          <h2 className="text-title2 font-bold">No Sync Problems</h2>
          <p className="text-secondary-label">Everything is in sync with the server.</p>
        </div>
      ) : (
        problems.map((problem) => (
          <FormSection key={problem.id}>
            <div className="flex flex-col gap-1.5 px-4 py-3">
              <p className="flex items-start gap-2 text-headline font-semibold text-[#ff3b30]">
                <TriangleAlert size={20} className="mt-0.5 shrink-0" fill="currentColor" stroke="var(--cell-bg)" aria-hidden />
                {problem.title}
              </p>
              <p className="whitespace-pre-line">{problem.message}</p>
              <p className="text-[12px] text-secondary-label">{problem.date.toLocaleString(appLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </FormSection>
        ))
      )}
    </FormPage>
  );
}
