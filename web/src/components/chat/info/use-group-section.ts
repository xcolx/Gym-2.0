"use client";

import { useState } from "react";

import { groupImageUpload } from "@/components/chat/image-upload";
import { errorMessage, type ImageUpload } from "@/lib/api";
import { removeGroupChatImage, setGroupPublic, updateGroupChat } from "@/lib/chat/actions";
import { isValidGroupName } from "@/lib/domain/chat-feature";
import type { ChatWithMembers } from "@/types/models";

/** The editing of the name, image and public switch of a group (groupSection of ChatInfoView.swift) */
export function useGroupSection(chat: ChatWithMembers, onError: (message: string) => void) {
  /** The edited name, null while it's the stored one */
  const [name, setName] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPublic, setIsChangingPublic] = useState(false);
  const shownName = name ?? chat.name ?? "";
  const trimmed = shownName.trim();
  const changed = trimmed !== (chat.name ?? "");

  const update = async (newName: string | null, image: ImageUpload | null) => {
    setIsSaving(true);
    try {
      const dto = await updateGroupChat(chat.serverId, newName, image);
      setName(dto.name ?? "");
    } catch (caught) {
      onError(errorMessage(caught));
      setName(null);
    } finally {
      setIsSaving(false);
    }
  };

  const removeImage = async () => {
    setIsSaving(true);
    try {
      await removeGroupChatImage(chat.serverId);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const saveName = () => {
    if (!isValidGroupName(shownName) || !changed) return;
    void update(trimmed, null);
  };

  const pick = async (file: File) => {
    const upload = await groupImageUpload(file);
    if (!upload) {
      onError("The image could not be loaded.");
      return;
    }
    await update(null, upload);
  };

  const setPublic = async (isPublic: boolean) => {
    setIsChangingPublic(true);
    try {
      await setGroupPublic(chat.serverId, isPublic);
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      setIsChangingPublic(false);
    }
  };

  return {
    shownName,
    setName,
    changed,
    isValidName: isValidGroupName(shownName),
    isSaving,
    isChangingPublic,
    saveName,
    pick,
    removeImage,
    setPublic,
  };
}
