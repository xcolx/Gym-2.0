"use client";

import { CircleAlert, Cpu, HardDrive, Hourglass, TriangleAlert, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { BottomActionBar, PrimaryButton } from "@/components/ui/PrimaryButton";
import type { AIChatMessage } from "@/lib/domain/ai-chat";
import { formatAIMessageDate } from "@/lib/domain/chat-feature";
import { parseInlineMarkdown, type InlineNode } from "@/lib/domain/inline-markdown";
import { useLocalStorage } from "@/lib/use-local-storage";
import { DESTRUCTIVE_TEXT } from "./chat-controls";

/** `@AppStorage("acceptedAIWarning")` */
export function useAcceptedAIWarning(): [boolean, (accepted: boolean) => void] {
  const [value, setValue] = useLocalStorage("acceptedAIWarning", "false");
  return [value === "true", (accepted) => setValue(accepted ? "true" : "false")];
}

export function GymAIImage({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static image
  return <img src="/images/gym-ai.jpg" alt="" className="shrink-0 rounded-full" style={{ width: size, height: size }} />;
}

/** Inline Markdown as React elements, see lib/domain/inline-markdown. Links are in `linkClassName`. */
function InlineMarkdown({ source, linkClassName }: { source: string; linkClassName: string }) {
  return <>{renderNodes(parseInlineMarkdown(source), linkClassName)}</>;
}

function renderNodes(nodes: InlineNode[], linkClassName: string): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node, linkClassName)}</Fragment>);
}

function renderNode(node: InlineNode, linkClassName: string): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return <code className="rounded bg-field/40 px-1 font-mono text-[0.9em]">{node.text}</code>;
    case "strong":
      return <strong className="font-bold">{renderNodes(node.children, linkClassName)}</strong>;
    case "emphasis":
      return <em>{renderNodes(node.children, linkClassName)}</em>;
    case "strikethrough":
      return <s>{renderNodes(node.children, linkClassName)}</s>;
    case "link":
      return (
        <a href={node.href} target="_blank" rel="noopener noreferrer" className={`underline ${linkClassName}`}>
          {renderNodes(node.children, linkClassName)}
        </a>
      );
  }
}

/**
 * Port of AIMessageView.swift: a message as a bubble like in the other chats, the user's on the right in the app color,
 * the answers on the left. A failed message has its error, Retry and Delete below it.
 */
export function AIMessage({ message, onRetry, onDiscard }: { message: AIChatMessage; onRetry: () => void; onDiscard: () => void }) {
  const isUser = message.role === "user";
  const failed = message.status.kind === "failed";
  return (
    <div className={`flex ${isUser ? "justify-end pl-12" : "justify-start pr-12"}`}>
      <div className={`flex min-w-0 flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        <p
          className={`max-w-full whitespace-pre-wrap break-words rounded-[18px] px-3 py-2 select-text [overflow-wrap:anywhere] ${
            isUser ? "bg-app text-app-foreground" : "bg-cell text-foreground"
          } ${failed ? "opacity-60" : ""}`}
        >
          <InlineMarkdown source={message.content} linkClassName={isUser ? "text-app-foreground" : "text-app"} />
        </p>
        {message.status.kind === "sent" ? (
          <span className="px-2 text-[11px] leading-[13px] text-secondary-label">{formatAIMessageDate(message.date)}</span>
        ) : (
          <div className="flex flex-col items-end gap-1 px-1.5 text-caption1">
            <span className={`flex items-start gap-1 text-right ${DESTRUCTIVE_TEXT}`}>
              <CircleAlert size={14} className="mt-px shrink-0 fill-[#ff3b30] text-background dark:fill-[#ff453a]" aria-hidden />
              {message.status.error}
            </span>
            <div className="flex gap-4">
              <button type="button" className={`${DESTRUCTIVE_TEXT} active:opacity-50`} onClick={onDiscard}>
                Delete
              </button>
              <button type="button" className="font-semibold text-app active:opacity-50" onClick={onRetry}>
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** How long the AI answers before the note that it can take a while */
const WAIT_NOTE_DELAY_MS = 5000;

/**
 * AITypingIndicatorView of AIMessageView.swift: three dots in a bubble while the AI is answering, and after a few
 * seconds a note that it can take a while
 */
export function AITypingIndicator() {
  const [showsWaitNote, setShowsWaitNote] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowsWaitNote(true), WAIT_NOTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-label="Gym-AI is thinking" className="flex flex-col items-start gap-1">
      <span className="flex gap-[5px] rounded-[18px] bg-cell px-3.5 py-[13px]" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-2 rounded-full bg-secondary-label"
            style={{ animation: `typing-dot 1.2s ease-in-out ${index * 0.2}s infinite` }}
          />
        ))}
      </span>
      {showsWaitNote && (
        <span className="animate-[fade-in_0.3s_ease-out_both] px-2 text-[11px] leading-[13px] text-secondary-label" aria-hidden>
          Thinking… this can take up to two minutes
        </span>
      )}
    </div>
  );
}

const WARNINGS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: TriangleAlert,
    title: "Wrong information",
    text: "The answers provided by Gym-AI might be wrong or incomplete and are not medical advice. Please do not rely on the AI for any important decisions and ask a doctor about injuries, pain or health problems.",
  },
  {
    icon: HardDrive,
    title: "Data storage",
    text: "Your conversations are processed and stored on the Gym 2.0 server together with your account, so you can continue them later. Please don't include any personal data such as your name in your questions.",
  },
  {
    icon: Hourglass,
    title: "Waiting time",
    text: "Since this AI runs on a rather slow server, it can take up to two minutes before the answer is displayed. Depending on the current load of the server, this may vary.",
  },
  { icon: Cpu, title: "Qwen", text: "The AI is based on the Qwen 3.5 model developed by Alibaba." },
];

/** Port of AIWarningView.swift: what to know about the Gym-AI before the first conversation, shown until it's accepted */
export function AIWarning({ onAccept }: { onAccept: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-6 px-4 pb-4 pt-2">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <span className="rounded-full shadow-[0_5px_10px_rgba(0,0,0,0.15)]">
            <GymAIImage size={80} />
          </span>
          <h2 className="text-title2 font-bold">Before you start</h2>
          <p className="text-subheadline text-secondary-label">A few things to know about Gym-AI.</p>
        </div>
        <ul className="card flex flex-col gap-5 p-5">
          {WARNINGS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3.5">
              <Icon size={22} className="w-7 shrink-0 text-app" aria-hidden />
              <div className="flex flex-col gap-1">
                <h3 className="text-headline font-semibold">{title}</h3>
                <p className="text-subheadline text-secondary-label">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <BottomActionBar>
        <PrimaryButton className="rounded-full" onClick={onAccept}>
          Accept and continue
        </PrimaryButton>
      </BottomActionBar>
    </>
  );
}
