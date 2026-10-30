"use client";

import { useState } from "react";

import { Sheet, SheetButton } from "@/components/ui/overlay";
import { GrowingTextarea, SendButton } from "@/components/chat/messages";
import { MAX_MESSAGE_LENGTH } from "@/lib/domain/chat-feature";
import { characterCount } from "@/lib/domain/format";

/** PhotoComposeView of ChatView.swift: the picked photo before it's sent, with an optional caption */
export function PhotoCompose({ url, onCancel, onSend }: { url: string; onCancel: () => void; onSend: (caption: string | null) => void }) {
  const [caption, setCaption] = useState("");
  const trimmed = caption.trim();
  const valid = characterCount(trimmed) <= MAX_MESSAGE_LENGTH;
  return (
    <Sheet open onClose={onCancel} title="Send Photo" leading={<SheetButton onClick={onCancel}>Cancel</SheetButton>}>
      <div className="flex h-full min-h-[60dvh] flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL of the picked photo */}
          <img src={url} alt="" className="max-h-[60dvh] max-w-full object-contain" />
        </div>
        <div className="flex shrink-0 items-end gap-2.5 px-4 py-2">
          <GrowingTextarea
            value={caption}
            autoFocus
            placeholder="Add a message"
            aria-label="Add a message"
            onChange={(event) => setCaption(event.target.value)}
            className="min-w-0 flex-1"
          />
          <SendButton label="Send photo" enabled={valid} busy={false} onSend={() => onSend(trimmed === "" ? null : trimmed)} />
        </div>
      </div>
    </Sheet>
  );
}
