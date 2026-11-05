"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { aiApi } from "@/lib/api";
import { AIChatModel } from "@/lib/domain/ai-chat";
import { useStore } from "@/lib/store";
import { useOnline } from "@/lib/use-online";
import { AIMessage, AITypingIndicator, GymAIImage } from "./ai-messages";
import { BottomAnchoredScroll, ChatScreen, scrollToBottom } from "./ChatScreen";
import { Spinner } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/Page";
import { ContentUnavailable, PLAIN_BUTTON } from "./chat-controls";
import { MessageField } from "./messages";

/** Tapped in an empty conversation, they fill the field */
const EXAMPLES = ["How many sets per week for chest?", "What should I eat after training?", "Give me a 3-day full body plan"];

/** Port of AIChatView.swift. Without a conversation, a new one is started with the first message. */
export function AIChat({ conversationId }: { conversationId: number | null }) {
  const [model] = useState(() => new AIChatModel(conversationId === null ? null : { id: conversationId, title: null }, aiApi));
  const state = useStore(model.store);
  const online = useOnline();
  const [userInput, setUserInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <BottomAnchoredScroll scrollRef={scrollRef}>
          <div className="flex flex-col gap-3 px-4 py-3">
            {state.messages.map((message) => (
              <AIMessage
                key={message.id}
                message={message}
                onRetry={() => void model.retry(message.id)}
                onDiscard={() => model.discard(message.id)}
              />
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
            className="absolute inset-0 bg-grouped"
          >
            <button type="button" className={PLAIN_BUTTON} onClick={() => void model.load()}>
              Try again
            </button>
          </ContentUnavailable>
        ) : (
          state.messages.length === 0 &&
          !state.isWaitingForAnswer && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto px-8 text-center">
              <span className="rounded-full shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
                <GymAIImage size={72} />
              </span>
              <h2 className="text-title2 font-bold">Ask Gym-AI</h2>
              <p className="text-subheadline text-secondary-label">
                Questions about training, exercises, workout plans, recovery or nutrition.
              </p>
              <div className="flex w-full max-w-sm flex-col gap-2 pt-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="rounded-[14px] bg-cell px-3.5 py-2.5 text-subheadline transition-[scale,opacity] hover:opacity-80 active:scale-[0.98] active:opacity-70"
                    onClick={() => {
                      setUserInput(example);
                      inputRef.current?.focus();
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {!online && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-footnote text-secondary-label">
          <WifiOff size={15} aria-hidden />
          You&apos;re offline. Gym-AI needs a connection.
        </p>
      )}
      <div className="flex shrink-0 border-t border-separator/60 bg-bar px-4 py-2 backdrop-blur-xl">
        <MessageField
          ref={inputRef}
          value={userInput}
          placeholder="Ask Gym-AI…"
          aria-label="Ask Gym-AI"
          autoCorrect="off"
          onChange={(event) => setUserInput(event.target.value)}
          canSend={canSend}
          isSending={state.isWaitingForAnswer}
          onSend={send}
        />
      </div>
    </ChatScreen>
  );
}
