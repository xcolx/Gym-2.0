"use client";

import { useParams } from "next/navigation";

import { ChatInfoScreen } from "@/components/chat/info/ChatInfoScreen";

/** Port of ChatInfoView.swift */
export default function ChatInfoPage() {
  const params = useParams<{ chatId: string }>();
  return <ChatInfoScreen chatId={Number(params.chatId)} />;
}
