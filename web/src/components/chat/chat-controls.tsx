"use client";

// The SwiftUI controls only the chat screens use, the shared ones are in components/ui

// MARK: - Colors (UIKit's grouped background colors)

/** `secondarySystemBackground`, e.g. the bubbles of the messages of others */
export const SECONDARY_BACKGROUND = "bg-[#f2f2f7] dark:bg-[#1c1c1e]";
export const DESTRUCTIVE_TEXT = "text-[#ff3b30] dark:text-[#ff453a]";

// MARK: - Buttons

/** `.buttonStyle(.bordered)` */
export const BORDERED_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-field/40 px-3 py-1 text-[15px] font-medium text-app active:opacity-60 disabled:opacity-40";
/** `.buttonStyle(.borderedProminent)` */
export const PROMINENT_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-app px-3 py-1 text-[15px] font-semibold text-white active:opacity-60 disabled:opacity-40";
/** A plain button in the app color, like the toolbar buttons */
export const PLAIN_BUTTON = "text-app active:opacity-50 disabled:text-tab-inactive disabled:active:opacity-100";

// Shared with the other tabs
export { ContentUnavailable } from "@/components/ui/ContentUnavailable";
export { Menu, type MenuItem } from "@/components/ui/Menu";
