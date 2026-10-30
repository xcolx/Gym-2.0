"use client";

import Link from "next/link";
import { MessagesSquare, SquarePen, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { ActionSheet, type ActionSheetButton } from "@/components/ui/ActionSheet";
import { Page, PageHeader } from "@/components/ui/Page";
import { AIWarning, useAcceptedAIWarning } from "@/components/chat/ai-messages";
import { ContentUnavailable, PLAIN_BUTTON, PROMINENT_BUTTON } from "@/components/chat/chat-controls";
import { MessageAlert, PromptAlert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { aiApi, parseServerDate, type AIConversationDTO } from "@/lib/api";
import { AIConversationsModel, MAX_AI_TITLE_LENGTH } from "@/lib/domain/ai-chat";
import { prefixCharacters } from "@/lib/domain/format";
import { formatRelativeNamed } from "@/lib/domain/relative-date";
import { useStore } from "@/lib/store";
import { useOnline } from "@/lib/use-online";

/** Port of AIConversationsView.swift */
export default function AIConversationsPage() {
  const [acceptedAIWarning, setAcceptedAIWarning] = useAcceptedAIWarning();
  return (
    <Page>
      <PageHeader inline
        title="Gym-AI"
        back={{ href: "/chat", label: "Chats" }}
        trailing={
          acceptedAIWarning && (
            <Link href="/chat/ai/new" aria-label="New conversation" className="active:opacity-50">
              <SquarePen size={23} aria-hidden />
            </Link>
          )
        }
      />
      {acceptedAIWarning ? <ConversationList /> : <AIWarning onAccept={() => setAcceptedAIWarning(true)} />}
    </Page>
  );
}

function ConversationList() {
  const [model] = useState(() => new AIConversationsModel(aiApi));
  const { conversations, hasLoaded, loadError, actionError } = useStore(model.store);
  const online = useOnline();
  const [renamed, setRenamed] = useState<AIConversationDTO | null>(null);
  const [menu, setMenu] = useState<{ title: string; buttons: ActionSheetButton[] } | null>(null);

  // Also reloads when coming back from a conversation (which may have a new message or title) and when the
  // connection is back
  useEffect(() => {
    if (online) void model.load();
  }, [model, online]);

  const actions = (conversation: AIConversationDTO): ActionSheetButton[] => [
    { label: "Rename", onSelect: () => setRenamed(conversation) },
    { label: "Delete", destructive: true, onSelect: () => void model.delete(conversation) },
  ];

  return (
    <>
      {!online && hasLoaded && (
        <p role="status" className="flex items-center gap-2 bg-field/30 px-4 py-2 text-footnote text-secondary-label">
          <WifiOff size={15} aria-hidden />
          You&apos;re offline. Gym-AI needs a connection.
        </p>
      )}
      <ul>
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            className="relative select-none [-webkit-touch-callout:none]"
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ title: conversation.title ?? "New conversation", buttons: actions(conversation) });
            }}
          >
            <Link href={`/chat/ai/${conversation.id}`} className="flex flex-col gap-0.5 px-4 py-2.5 active:bg-field/30">
              <span className="truncate">{conversation.title ?? "New conversation"}</span>
              <span className="text-footnote text-secondary-label">{formatRelativeNamed(parseServerDate(conversation.updatedAt))}</span>
            </Link>
            <span className="absolute bottom-0 left-4 right-0 h-px bg-separator" aria-hidden />
          </li>
        ))}
      </ul>

      {!hasLoaded ? (
        loadError !== null ? (
          <ContentUnavailable icon={WifiOff} title="Gym-AI is unreachable" description={loadError} className="flex-1">
            <button type="button" className={PLAIN_BUTTON} onClick={() => void model.load()}>
              Try again
            </button>
          </ContentUnavailable>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )
      ) : (
        conversations.length === 0 && (
          <ContentUnavailable
            icon={MessagesSquare}
            title="No conversations yet"
            description="Ask Gym-AI about training, exercises, workout plans, recovery or nutrition."
            className="flex-1"
          >
            <Link href="/chat/ai/new" className={`${PROMINENT_BUTTON} px-4 py-2`}>
              New conversation
            </Link>
          </ContentUnavailable>
        )
      )}

      <ActionSheet open={menu !== null} title={menu?.title ?? ""} buttons={menu?.buttons ?? []} onClose={() => setMenu(null)} />
      <PromptAlert
        open={renamed !== null}
        title="Rename conversation"
        placeholder="Title"
        initialValue={renamed?.title ?? ""}
        confirmLabel="Save"
        onClose={() => setRenamed(null)}
        onConfirm={(title) => {
          if (renamed) void model.rename(renamed, prefixCharacters(title, MAX_AI_TITLE_LENGTH));
        }}
      />
      <MessageAlert title="Error" message={actionError} onClose={() => model.dismissActionError()} />
    </>
  );
}
