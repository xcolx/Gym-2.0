"use client";

import { ClipboardList, Cpu, Hourglass, Info, UserRound, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { ServerImage } from "@/components/ui/ServerImage";
import type { AIChatMessage } from "@/lib/domain/ai-chat";
import { formatAIMessageDate } from "@/lib/domain/chat-feature";
import { parseInlineMarkdown, type InlineNode } from "@/lib/domain/inline-markdown";
import { useLocalStorage } from "@/lib/use-local-storage";
import { Spinner } from "@/components/ui/controls";
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

/** Inline Markdown as React elements, see lib/domain/inline-markdown */
function InlineMarkdown({ source }: { source: string }) {
  return <>{renderNodes(parseInlineMarkdown(source))}</>;
}

function renderNodes(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>);
}

function renderNode(node: InlineNode): ReactNode {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return <code className="rounded bg-field/40 px-1 font-mono text-[0.9em]">{node.text}</code>;
    case "strong":
      return <strong className="font-bold">{renderNodes(node.children)}</strong>;
    case "emphasis":
      return <em>{renderNodes(node.children)}</em>;
    case "strikethrough":
      return <s>{renderNodes(node.children)}</s>;
    case "link":
      return (
        <a href={node.href} target="_blank" rel="noopener noreferrer" className="text-app underline">
          {renderNodes(node.children)}
        </a>
      );
  }
}

/** Port of AIMessageView.swift */
export function AIMessage({
  message,
  profileIconHash,
  onRetry,
  onDiscard,
}: {
  message: AIChatMessage;
  /** The current user's profile icon, the person icon without one */
  profileIconHash: string | null;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-lg p-2 pr-[38px] ${isUser ? "bg-[#34c759]/20" : "bg-[#ff3b30]/20"}`}
    >
      <div className="flex items-center gap-2">
        {isUser ? (
          <span className="block h-[25px] w-[25px] shrink-0 overflow-hidden rounded-full bg-foreground">
            <ServerImage
              hash={profileIconHash}
              fit="cover"
              className="h-full w-full"
              placeholder={
                <span className="flex h-full w-full items-center justify-center">
                  <UserRound size={18} fill="#ff3b30" strokeWidth={0} aria-hidden />
                </span>
              }
            />
          </span>
        ) : (
          <GymAIImage size={25} />
        )}
        <span className="font-bold">{isUser ? "You" : "Gym-AI"}</span>
      </div>
      <div className="flex flex-col gap-1 pl-[30px]">
        <p className="whitespace-pre-wrap break-words select-text [overflow-wrap:anywhere]">
          <InlineMarkdown source={message.content} />
        </p>
        {message.status.kind === "sent" ? (
          <span className="text-footnote text-[#8e8e93]">{formatAIMessageDate(message.date)}</span>
        ) : (
          <>
            <span className={`text-footnote ${DESTRUCTIVE_TEXT}`}>{message.status.error}</span>
            <div className="flex gap-4 text-footnote font-bold">
              <button type="button" className="text-app active:opacity-50" onClick={onRetry}>
                Retry
              </button>
              <button type="button" className={`${DESTRUCTIVE_TEXT} active:opacity-50`} onClick={onDiscard}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** AITypingIndicatorView of AIMessageView.swift */
export function AITypingIndicator() {
  return (
    <div className="flex w-fit items-center gap-2 rounded-lg bg-[#ff3b30]/20 p-2">
      <GymAIImage size={25} />
      <Spinner />
      <span className="text-footnote text-[#8e8e93]">Gym-AI is thinking...</span>
    </div>
  );
}

const WARNINGS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Info,
    title: "Wrong Information",
    text: "The Answers provided by the Gym-AI might be wrong or incomplete and are not medical advice. Please do not rely on the AI for any important decisions and ask a doctor about injuries, pain or health problems.",
  },
  {
    icon: ClipboardList,
    title: "Data Storage",
    text: "Your conversations are processed and stored on the Gym 2.0 server together with your account, so you can continue them later. Please don't include any personal data such as your name in your questions.",
  },
  {
    icon: Hourglass,
    title: "Waiting time",
    text: "Since this AI runs on a rather slow server, it can take up to two minutes before the answer is displayed. Depending on the current load of the server, this may vary.",
  },
  { icon: Cpu, title: "Qwen", text: "The AI is based on the Qwen 3.5 model developed by Alibaba." },
];

/** Port of AIWarningView.swift */
export function AIWarning({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="flex flex-col gap-2.5 p-2.5">
      {WARNINGS.map(({ icon: Icon, title, text }) => (
        <div key={title} className="flex items-start gap-2.5">
          <Icon size={18} strokeWidth={2.25} className="mt-0.5 w-5 shrink-0" aria-hidden />
          <div>
            <h2 className="text-headline font-semibold">{title}</h2>
            <p>{text}</p>
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button type="button" className="rounded-[10px] bg-app p-[5px] text-white active:opacity-60" onClick={onAccept}>
          Accept
        </button>
      </div>
    </div>
  );
}
