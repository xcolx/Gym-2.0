"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { Alert } from "@/components/ui/Alert";
import { canSync, useSession } from "@/lib/auth/session";
import { useDb } from "@/lib/db";
import { pollsChats } from "@/lib/domain/chat-feature";
import { CHAT_LIST_POLL_INTERVAL_MS, useChatPolling } from "./chat-polling";
import { dismissRejectedChanges, startSyncEngine } from "./engine";
import { useRejectedChanges } from "./state";

/**
 * Runs the sync while the session is confirmed and the database of the user is open (the SyncService of MainView.swift),
 * polls the chats on the chat routes and shows the changes the server rejected ("Not saved" alert of MainView).
 * Mounted once by the AppShell.
 */
export function SyncRunner() {
  const session = useSession();
  const db = useDb();
  const pathname = usePathname();
  // Only once GET /users/me confirmed the user of the cookie, and not the database of another user that is still open
  // while the session switches
  const active = canSync(session, db?.name);

  useEffect(() => {
    if (!active || !db) return;
    return startSyncEngine(db);
  }, [active, db]);

  // Not on the AI chats: their conversations are server-only, the polls would only use the rate limits
  useChatPolling(CHAT_LIST_POLL_INTERVAL_MS, { enabled: active && pollsChats(pathname) });

  return <RejectedChangesAlert />;
}

/** `.alert("Not saved", ...) { Button("OK", role: .cancel) }` of MainView.swift */
function RejectedChangesAlert() {
  const messages = useRejectedChanges();
  return (
    <Alert
      open={messages.length > 0}
      title="Not saved"
      message={messages.join("\n\n")}
      buttons={[{ label: "OK", role: "cancel" }]}
      onClose={dismissRejectedChanges}
    />
  );
}
