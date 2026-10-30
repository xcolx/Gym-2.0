"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { aiApi } from "@/lib/api";
import { AIChatModel } from "@/lib/domain/ai-chat";
import { useCurrentUser } from "@/lib/repo";
import { useStore } from "@/lib/store";
import { useOnline } from "@/lib/use-online";
import { AIMessage, AITypingIndicator, GymAIImage } from "./ai-messages";
import { BottomAnchoredScroll, ChatScreen, scrollToBottom } from "./ChatScreen";
import { Spinner } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/Page";
import { ContentUnavailable, PLAIN_BUTTON } from "./chat-controls";
import { GrowingTextarea } from "./messages";

/** Port of AIChatView.swift. Without a conversation, a new one is started with the first message. */
export function AIChat({ conversationId }: { conversationId: number | null }) {
  const [model] = useState(() => new AIChatModel(conversationId === null ? null : { id: conversationId, title: null }, aiApi));
  const state = useStore(model.store);
  const online = useOnline();
  const profileIcon = useCurrentUser()?.profileIconUrl || null;
  const [userInput, setUserInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = online && AIChatModel.canSendText(state, userInput);

  useEffect(() => {
    void model.load();
  }, [model]);

  useEffect(() => {
    scrollToBottom(scrollRef.current);
  }, [state.messages.length, state.isWaitingForAnswer]);

  const send = () => {
    if (!canSend) return;
    const text = userInput;
    setUserInput("");
    void model.send(text);
  };

  const title = state.title ?? (state.conversationId !== null && state.messages.length === 0 && !state.loadError ? "" : "New conversation");

  return (
    <ChatScreen>
      <PageHeader inline title={title} back={{ href: "/chat/ai", label: "Gym-AI" }} />

      <div className="relative flex min-h-0 flex-1 flex-col border-t border-separator">
        <BottomAnchoredScroll scrollRef={scrollRef}>
          <div className="flex flex-col items-stretch gap-2.5 p-4">
            {state.messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end pl-10" : "justify-start pr-10"}`}>
                <AIMessage
                  message={message}
                  profileIconHash={profileIcon}
                  onRetry={() => void model.retry(message.id)}
                  onDiscard={() => model.discard(message.id)}
                />
              </div>
            ))}
            {state.isWaitingForAnswer && <AITypingIndicator />}
          </div>
        </BottomAnchoredScroll>

        {state.isLoading && state.messages.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        ) : state.loadError !== null ? (
          <ContentUnavailable
            icon={WifiOff}
            title="Could not load the conversation"
            description={state.loadError}
            className="absolute inset-0 bg-background"
          >
            <button type="button" className={PLAIN_BUTTON} onClick={() => void model.load()}>
              Try again
            </button>
          </ContentUnavailable>
        ) : (
          state.messages.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center">
              <GymAIImage size={70} />
              <h2 className="text-title2 font-bold">Ask Gym-AI</h2>
              <p className="text-[15px] leading-5 text-secondary-label">
                Questions about training, exercises, workout plans, recovery or nutrition.
              </p>
            </div>
          )
        )}
      </div>

      {!online && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-2 border-t border-separator px-4 py-2 text-footnote text-secondary-label">
          <WifiOff size={15} aria-hidden />
          You&apos;re offline. Gym-AI needs a connection.
        </p>
      )}
      <div className="flex shrink-0 items-end gap-2 border-t border-separator p-4">
        <GrowingTextarea
          value={userInput}
          placeholder="Ask Gym-AI..."
          aria-label="Ask Gym-AI"
          autoCorrect="off"
          onChange={(event) => setUserInput(event.target.value)}
          className="min-w-0 flex-1"
        />
        {state.isWaitingForAnswer ? (
          <span className="flex h-[36px] items-center px-[7px]">
            <Spinner />
          </span>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onPointerDown={(event) => event.preventDefault()}
            onClick={send}
            className={`shrink-0 rounded-[10px] p-[7px] text-white ${canSend ? "bg-app active:opacity-60" : "bg-[#8e8e93]"}`}
          >
            Send
          </button>
        )}
      </div>
    </ChatScreen>
  );
}

