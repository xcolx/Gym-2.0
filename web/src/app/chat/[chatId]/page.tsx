"use client";

import { useParams } from "next/navigation";

import { ChatConversationScreen } from "@/components/chat/conversation/ChatConversationScreen";

/** Port of ChatView.swift */
export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  return <ChatConversationScreen chatId={Number(params.chatId)} />;
}
