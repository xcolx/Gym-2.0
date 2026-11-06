"use client";

import { Hand, Plus } from "lucide-react";
import { useRef } from "react";

import { Spinner } from "@/components/ui/controls";
import { MessageField } from "@/components/chat/messages";

/**
 * The bar below the messages of ChatView: the photo button and the rounded field with the send button, or why nothing
 * can be sent to the chat (e.g. a blocked or removed friend)
 */
export function ChatComposer({
  blockedReason,
  text,
  onChangeText,
  isPending,
  canSend,
  isSending,
  isSendingPhoto,
  onSend,
  onPickPhoto,
}: {
  blockedReason: string | null;
  text: string;
  onChangeText: (text: string) => void;
  isPending: boolean;
  canSend: boolean;
  isSending: boolean;
  isSendingPhoto: boolean;
  onSend: () => void;
  onPickPhoto: (file: File) => void;
}) {
  const photoInput = useRef<HTMLInputElement>(null);

  if (blockedReason) {
    return (
      <p className="flex shrink-0 items-center justify-center gap-1.5 border-t border-separator/60 bg-bar p-4 text-center text-footnote text-secondary-label backdrop-blur-xl">
        <Hand size={14} className="shrink-0 fill-current" aria-hidden />
        {blockedReason}
      </p>
    );
  }
  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-separator/60 bg-bar px-4 py-2 backdrop-blur-xl">
      <button
        type="button"
        aria-label="Send photo"
        disabled={isSendingPhoto}
        onClick={() => photoInput.current?.click()}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cell text-app transition-[scale,opacity] active:scale-90 active:opacity-70"
      >
        {isSendingPhoto ? <Spinner size={18} /> : <Plus size={20} strokeWidth={2.5} aria-hidden />}
      </button>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPickPhoto(file);
        }}
      />
      <MessageField
        value={text}
        placeholder="Message"
        aria-label="Message"
        // Not while it's being sent: a disabled field loses the focus, which closes the keyboard on every send
        disabled={isPending && !isSending}
        onChange={(event) => onChangeText(event.target.value)}
        canSend={canSend}
        isSending={isSending}
        onSend={onSend}
      />
    </div>
  );
}
