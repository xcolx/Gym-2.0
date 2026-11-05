"use client";

import Link from "next/link";
import { ChevronRight, MessagesSquare, Plus, SquarePen, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { ActionSheet, type ActionSheetButton } from "@/components/ui/ActionSheet";
import { Page, PageHeader } from "@/components/ui/Page";
import { AIWarning, useAcceptedAIWarning } from "@/components/chat/ai-messages";
import { ContentUnavailable, PLAIN_BUTTON } from "@/components/chat/chat-controls";
import { primaryButtonClass } from "@/components/ui/PrimaryButton";
import { MessageAlert, PromptAlert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/controls";
import { aiApi, parseServerDate, type AIConversationDTO } from "@/lib/api";
import { AIConversationsModel, MAX_AI_TITLE_LENGTH } from "@/lib/domain/ai-chat";
import { prefixCharacters } from "@/lib/domain/format";
import { formatRelativeNamed } from "@/lib/domain/relative-date";
import { useStore } from "@/lib/store";
import { useOnline } from "@/lib/use-online";

/**
 * Port of AIConversationsView.swift: the past conversations with the Gym-AI, from which they can be opened again or a
 * new one can be started. A long press (or right click) on one renames or deletes it.
 */
export default function AIConversationsPage() {
  const [acceptedAIWarning, setAcceptedAIWarning] = useAcceptedAIWarning();
  return (
    <Page className="bg-grouped">
      <PageHeader
        // the warning has its own heading
        inline={!acceptedAIWarning}
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
    <div className="flex flex-1 flex-col gap-5 px-4 pb-6">
      {!online && hasLoaded && (
        <p role="status" className="flex items-center gap-2 px-1 text-footnote text-secondary-label">
          <WifiOff size={15} aria-hidden />
          You&apos;re offline. Gym-AI needs a connection.
        </p>
      )}
      {conversations.length > 0 && (
        <>
          <Link href="/chat/ai/new" className="card flex items-center gap-3 px-4 py-3 hover:opacity-90 active:opacity-70">
            <ConversationIcon icon={Plus} />
            <span className="font-medium text-app">New conversation</span>
          </Link>

          <section className="flex flex-col gap-2">
            <h2 className="px-4 text-footnote font-semibold text-secondary-label">
              {conversations.length === 1 ? "1 conversation" : `${conversations.length} conversations`}
            </h2>
            <ul className="card overflow-hidden">
              {conversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className="group/row relative select-none [-webkit-touch-callout:none]"
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ title: conversation.title ?? "New conversation", buttons: actions(conversation) });
                  }}
                >
                  <Link
                    href={`/chat/ai/${conversation.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-field/15 active:bg-field/40"
                  >
                    <ConversationIcon icon={MessagesSquare} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{conversation.title ?? "New conversation"}</span>
                      <span className="text-subheadline text-secondary-label">
                        Updated {formatRelativeNamed(parseServerDate(conversation.updatedAt))}
                      </span>
                    </span>
                    <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
                  </Link>
                  <span className="absolute bottom-0 left-[68px] right-0 h-px bg-separator group-last/row:hidden" aria-hidden />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

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
            <Link href="/chat/ai/new" className={`${primaryButtonClass} rounded-full px-6`}>
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
    </div>
  );
}

/** ConversationIcon of AIConversationsView.swift: the icon of a row, in the app color */
function ConversationIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-app/15 text-app" aria-hidden>
      <Icon size={18} strokeWidth={2.5} />
    </span>
  );
}
