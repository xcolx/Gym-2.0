"use client";

import { ArrowUp } from "lucide-react";
import { useLayoutEffect, useRef, type ComponentProps, type PointerEvent } from "react";

import { ServerImage } from "@/components/ui/ServerImage";
import { formatDaySeparator, formatMessageTime } from "@/lib/domain/chat-feature";
import type { Message } from "@/types/models";
import { Spinner } from "@/components/ui/controls";

const ROUND = 18;
/** The corners where the bubbles of a run meet */
const JOINED = 5;

/**
 * MessageBubbleView of ChatView.swift: a message as a bubble, the own ones on the right in the app color. The messages
 * a sender sent in a row are grouped: their bubbles are close together, with the time below the last one.
 */
export function MessageBubble({
  message,
  isOwn,
  senderName,
  startsRun = true,
  endsRun = true,
  onTapPhoto,
  onOpenMenu,
}: {
  message: Message;
  isOwn: boolean;
  /** Shown above the bubble, for the messages of others in groups */
  senderName: string | null;
  /** The first message of the sender's run, with a round corner at the top */
  startsRun?: boolean;
  /** The last message of the sender's run, with a round corner at the bottom and the time below it */
  endsRun?: boolean;
  onTapPhoto: (hash: string) => void;
  /** The context menu of the message (`.contextMenu` on iOS): a long press, or a right click with a mouse */
  onOpenMenu: () => void;
}) {
  const menu = useLongPressMenu(onOpenMenu);
  const top = startsRun ? ROUND : JOINED;
  const bottom = endsRun ? ROUND : JOINED;
  // top left, top right, bottom right, bottom left
  const radius = isOwn ? `${ROUND}px ${top}px ${bottom}px ${ROUND}px` : `${top}px ${ROUND}px ${ROUND}px ${bottom}px`;
  return (
    <div className={`flex ${isOwn ? "justify-end pl-[60px]" : "justify-start pr-[60px]"}`}>
      <div className={`flex min-w-0 flex-col gap-[3px] ${isOwn ? "items-end" : "items-start"}`}>
        {senderName && <span className="px-3 text-caption1 font-semibold text-secondary-label">{senderName}</span>}
        <div
          {...menu}
          style={{ borderRadius: radius }}
          // No text selection or iOS callout on the long press, the menu has "Copy"
          className={`flex min-w-0 max-w-full select-none flex-col [-webkit-touch-callout:none] ${
            isOwn ? "bg-app text-app-foreground" : "bg-cell text-foreground"
          }`}
        >
          {message.imageUrl && (
            <button
              type="button"
              aria-label="Photo"
              className="m-1 block overflow-hidden rounded-[14px] active:opacity-80"
              onClick={() => onTapPhoto(message.imageUrl!)}
            >
              <ServerImage
                hash={message.imageUrl}
                intrinsic
                imageClassName="max-h-[320px] max-w-[min(240px,100%)] rounded-[14px] object-contain"
                placeholder={
                  <span className="flex h-[200px] w-[200px] items-center justify-center rounded-[14px] bg-[#8e8e93]/30">
                    <Spinner />
                  </span>
                }
              />
            </button>
          )}
          {message.content !== null && (
            <p
              className={`whitespace-pre-wrap break-words px-3 pb-2 [overflow-wrap:anywhere] ${message.imageUrl ? "pt-1" : "pt-2"}`}
            >
              {message.content}
            </p>
          )}
        </div>
        {endsRun && (
          <span className="px-2 text-[11px] leading-[13px] text-secondary-label">{formatMessageTime(message.createdAt)}</span>
        )}
      </div>
    </div>
  );
}

/** DaySeparator of ChatView.swift: the day above its first message, as a small capsule */
export function DaySeparator({ date }: { date: Date }) {
  return (
    <p className="flex justify-center pb-1 pt-4">
      <span className="rounded-full bg-field/40 px-2.5 py-1 text-caption1 font-medium text-secondary-label">
        {formatDaySeparator(date)}
      </span>
    </p>
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
export function GrowingTextarea({ value, className = "", ref: outerRef, ...props }: ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const setRef = (element: HTMLTextAreaElement | null) => {
    ref.current = element;
    if (typeof outerRef === "function") outerRef(element);
    else if (outerRef) outerRef.current = element;
  };
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={setRef}
      rows={1}
      value={value}
      {...props}
      className={`max-h-[136px] resize-none overflow-y-auto bg-transparent text-body outline-none placeholder:text-tab-inactive disabled:opacity-60 ${className}`}
    />
  );
}

/**
 * The rounded field of a message with its send button inside (`messageFieldBackground()` and SendButton of
 * MessageComposer.swift), for the chats, the Gym-AI and the caption of a photo
 */
export function MessageField({
  canSend,
  isSending,
  onSend,
  sendLabel = "Send",
  ...props
}: ComponentProps<"textarea"> & {
  value: string;
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
  sendLabel?: string;
}) {
  return (
    <div className="focus-ring-within flex min-w-0 flex-1 items-end gap-1 rounded-[18px] border border-separator/50 bg-cell">
      <GrowingTextarea
        {...props}
        onKeyDown={(event) => {
          // Enter sends with a keyboard, Shift+Enter adds a line. Not on phones, where Enter is the line break.
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        className="min-w-0 flex-1 py-[7px] pl-3.5"
      />
      <SendButton canSend={canSend} isSending={isSending} onSend={onSend} label={sendLabel} />
    </div>
  );
}

/** SendButton of MessageComposer.swift: the round send button in the app color, gray while nothing can be sent */
export function SendButton({
  canSend,
  isSending,
  onSend,
  label = "Send",
}: {
  canSend: boolean;
  isSending: boolean;
  onSend: () => void;
  label?: string;
}) {
  if (isSending) {
    return (
      <span className="m-[3px] flex size-[30px] shrink-0 items-center justify-center" role="status" aria-label="Sending">
        <Spinner size={18} />
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={!canSend}
      // Keeps the keyboard open: the text field doesn't lose the focus
      onPointerDown={(event) => event.preventDefault()}
      onClick={onSend}
      className={`m-[3px] flex size-[30px] shrink-0 items-center justify-center rounded-full transition-[background-color,scale] duration-200 active:scale-90 ${
        canSend ? "bg-app text-app-foreground" : "bg-[#c7c7cc] text-background dark:bg-[#48484a]"
      }`}
    >
      <ArrowUp size={17} strokeWidth={3} aria-hidden />
    </button>
  );
}
