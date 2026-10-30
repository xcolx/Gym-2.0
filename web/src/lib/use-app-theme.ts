"use client";

import { useEffect } from "react";

import { APP_THEME_KEY, applyAppTheme, parseAppTheme, type AppTheme } from "./theme";
import { useLocalStorage } from "./use-local-storage";

/** The theme of this device and a setter (`@AppStorage(AppTheme.storageKey)` on iOS) */
export function useAppTheme(): [AppTheme, (theme: AppTheme) => void] {
  const [value, setValue] = useLocalStorage(APP_THEME_KEY, "system");
  return [parseAppTheme(value), setValue];
}

/** Keeps the page in the stored theme, also when it is changed in another tab. Called once by the AppShell. */
export function useApplyAppTheme(): void {
  const [theme] = useAppTheme();
  useEffect(() => applyAppTheme(theme), [theme]);
}
