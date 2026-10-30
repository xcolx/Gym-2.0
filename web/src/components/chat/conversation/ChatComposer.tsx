"use client";

import { Image as ImageIcon } from "lucide-react";
import { useRef } from "react";

import { Spinner } from "@/components/ui/controls";
import { GrowingTextarea, SendButton } from "@/components/chat/messages";

/**
 * The bar below the messages of ChatView: the photo button, the text field and the send button, or why nothing can be
 * sent to the chat (e.g. a blocked or removed friend)
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

  return (
    <div className="shrink-0 border-t border-separator">
      {blockedReason ? (
        <p className="p-4 text-center text-footnote text-secondary-label">{blockedReason}</p>
      ) : (
        <div className="flex items-end gap-2.5 px-4 py-2">
          <button
            type="button"
            aria-label="Send photo"
            disabled={isSendingPhoto}
            onClick={() => photoInput.current?.click()}
            className="flex h-[36px] w-[28px] shrink-0 items-center justify-center text-app active:opacity-50"
          >
            {isSendingPhoto ? <Spinner /> : <ImageIcon size={24} aria-hidden />}
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
          <GrowingTextarea
            value={text}
            placeholder="Message"
            aria-label="Message"
            disabled={isPending}
            onChange={(event) => onChangeText(event.target.value)}
            className="min-w-0 flex-1"
          />
          <SendButton enabled={canSend} busy={isSending} onSend={onSend} />
        </div>
      )}
    </div>
  );
}
