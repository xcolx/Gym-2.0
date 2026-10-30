// Port of ios/Gym 2.0/Core/Services/ReportService.swift

import { sendVoid } from "../client";

/** Exactly one of the IDs is set */
interface ReportedIds {
  reportedUserId?: number;
  reportedChatId?: number;
  reportedMessageId?: number;
}

export const reportApi = {
  /** Fails with 400 if the user already reported the same user, chat or message. */
  report: (ids: ReportedIds, reason: string) =>
    sendVoid({ method: "POST", path: "/reports", json: { ...ids, reason } }),
};
