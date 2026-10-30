import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** AIConversationsBannerView of AIConversationsView.swift: a thin banner that opens the conversations with the Gym-AI */
export function AIConversationsBanner() {
  return (
    <Link
      href="/chat/ai"
      className="flex shrink-0 items-center gap-2.5 bg-app/15 px-4 py-2 active:opacity-70"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small static image */}
      <img src="/images/gym-ai.jpg" alt="" className="h-7 w-7 rounded-full" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold leading-5">Gym-AI</span>
        <span className="text-[12px] leading-4 text-secondary-label">Open your AI conversations</span>
      </span>
      <ChevronRight size={16} strokeWidth={2.5} className="text-secondary-label" aria-hidden />
    </Link>
  );
}
