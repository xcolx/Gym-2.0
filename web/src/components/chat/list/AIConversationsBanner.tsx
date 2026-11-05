import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { GymAIImage } from "@/components/chat/ai-messages";

/** AIConversationsBannerView of AIConversationsView.swift: the row at the top of the chats that opens the Gym-AI */
export function AIConversationsBanner() {
  return (
    <Link href="/chat/ai" className="flex items-center gap-3 px-4 py-3 hover:bg-field/15 active:bg-field/40">
      <GymAIImage size={44} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="font-semibold">Gym-AI</span>
        <span className="truncate text-subheadline text-secondary-label">Ask about your training</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.5} className="-mr-1 shrink-0 text-tab-inactive/70" aria-hidden />
    </Link>
  );
}
