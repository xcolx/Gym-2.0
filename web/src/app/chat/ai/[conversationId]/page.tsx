"use client";

import { useParams } from "next/navigation";

import { AIChat } from "@/components/chat/AIChat";

/** Port of AIChatView.swift */
export default function AIConversationPage() {
  const params = useParams<{ conversationId: string }>();
  const id = Number(params.conversationId);
  // A new model for every conversation
  return <AIChat key={params.conversationId} conversationId={Number.isInteger(id) ? id : null} />;
}
