"use client";

import { CircleArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, type ComponentProps, type PointerEvent } from "react";

import { ServerImage } from "@/components/ui/ServerImage";
import { formatMessageTime } from "@/lib/domain/chat-feature";
import type { Message } from "@/types/models";
import { Spinner } from "@/components/ui/controls";
import { SECONDARY_BACKGROUND } from "./chat-controls";

/** MessageBubbleView of ChatView.swift: a message as a bubble, the own ones on the right in the app color */
export function MessageBubble({
  message,
  isOwn,
  senderName,
  onTapPhoto,
  onOpenMenu,
}: {
  message: Message;
  isOwn: boolean;
  /** Shown above the bubble, for the messages of others in groups */
  senderName: string | null;
  onTapPhoto: (hash: string) => void;
  /** The context menu of the message (`.contextMenu` on iOS): a long press, or a right click with a mouse */
  onOpenMenu: () => void;
}) {
  const menu = useLongPressMenu(onOpenMenu);
  return (
    <div className={`flex ${isOwn ? "justify-end pl-[60px]" : "justify-start pr-[60px]"}`}>
      <div className={`flex min-w-0 flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}>
        {senderName && <span className="px-1 text-[12px] font-bold text-secondary-label">{senderName}</span>}
        <div
          {...menu}
          // No text selection or iOS callout on the long press, the menu has "Copy"
          className={`flex min-w-0 max-w-full select-none flex-col gap-1.5 rounded-2xl px-3 py-2 [-webkit-touch-callout:none] ${
            isOwn ? "bg-app text-white" : `${SECONDARY_BACKGROUND} text-foreground`
          }`}
        >
          {message.imageUrl && (
            <button
              type="button"
              aria-label="Photo"
              className="block overflow-hidden rounded-xl active:opacity-80"
              onClick={() => onTapPhoto(message.imageUrl!)}
            >
              <ServerImage
                hash={message.imageUrl}
                intrinsic
                imageClassName="max-h-[320px] max-w-[min(240px,100%)] rounded-xl object-contain"
                placeholder={
                  <span className="flex h-[200px] w-[200px] items-center justify-center rounded-xl bg-[#8e8e93]/30">
                    <Spinner />
                  </span>
                }
              />
            </button>
          )}
          {message.content !== null && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
          )}
          <span className="self-end text-[11px] leading-[13px] opacity-70">{formatMessageTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

const LONG_PRESS_MS = 500;
/** A finger that moves further scrolls the list instead */
const LONG_PRESS_TOLERANCE_PX = 10;

/**
 * Opens a menu with a long press or the context menu event. Android's Chrome fires `contextmenu` on a long press,
 * Safari on iOS doesn't, so touches also get a timer; the menu opens once per press. A tap right after the long
 * press (the photo) is ignored.
 */
function useLongPressMenu(open: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const opened = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const openOnce = () => {
    if (opened.current) return;
    opened.current = true;
    cancel();
    open();
  };

  return {
    onPointerDown: (event: PointerEvent) => {
      opened.current = false;
      cancel();
      if (event.pointerType === "mouse") return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(openOnce, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > LONG_PRESS_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      openOnce();
    },
    onClickCapture: (event: React.MouseEvent) => {
      if (!opened.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** A TextField with `axis: .vertical` and `lineLimit(1...5)`: grows with the text up to five lines */
export function GrowingTextarea({ value, className = "", ...props }: ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      {...props}
      className={`max-h-[126px] min-h-[36px] resize-none overflow-y-auto rounded-[8px] border border-separator bg-background px-2.5 py-[6px] text-body outline-none focus:border-app disabled:opacity-60 ${className}`}
    />
  );
}

/** The send button of the input bars (`arrow.up.circle.fill`) */
export function SendButton({
  enabled,
  busy,
  onSend,
  label = "Send",
}: {
  enabled: boolean;
  busy: boolean;
  onSend: () => void;
  label?: string;
}) {
  if (busy) {
    return (
      <span className="flex h-[36px] w-[34px] items-center justify-center">
        <Spinner />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!enabled}
      // Keeps the keyboard open: the text field doesn't lose the focus
      onPointerDown={(event) => event.preventDefault()}
      onClick={onSend}
      className={`flex h-[36px] w-[34px] shrink-0 items-center justify-center ${enabled ? "text-app" : "text-tab-inactive"}`}
    >
      <CircleArrowUp size={32} fill="currentColor" strokeWidth={2} className="[&>path]:fill-none [&>path]:stroke-white" aria-hidden />
    </button>
  );
}
