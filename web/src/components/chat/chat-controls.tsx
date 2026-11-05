"use client";

// The SwiftUI controls only the chat screens use, the shared ones are in components/ui

// MARK: - Colors

export const DESTRUCTIVE_TEXT = "text-[#ff3b30] dark:text-[#ff453a]";

// MARK: - Buttons

/** A plain button in the app color, like the toolbar buttons */
export const PLAIN_BUTTON = "text-app active:opacity-50 disabled:text-tab-inactive disabled:active:opacity-100";

// Shared with the other tabs
export { ContentUnavailable } from "@/components/ui/ContentUnavailable";
export { Menu, type MenuItem } from "@/components/ui/Menu";
