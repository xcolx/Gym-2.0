// Port of ios/Gym 2.0/Core/Services/AppUpdateService.swift. For the web app "updating" means loading the newest
// version of the page.

import { createStore, useStore } from "@/lib/store";

interface AppUpdateState {
  isUpdateRequired: boolean;
  showsUpdateNotice: boolean;
}

export const appUpdateStore = createStore<AppUpdateState>({ isUpdateRequired: false, showsUpdateNotice: false });

const NOTICE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_NOTICE_KEY = "gym2.lastUpdateNoticeDate";

/** Called by the API client for a 410 response */
export function updateRequired(): void {
  appUpdateStore.set((state) => (state.isUpdateRequired ? state : { ...state, isUpdateRequired: true }));
}

/** Called by the API client for every response with a `Deprecation` header */
export function updateAvailable(now: Date = new Date()): void {
  const state = appUpdateStore.get();
  if (state.isUpdateRequired || state.showsUpdateNotice) return;
  try {
    const lastNotice = Number(localStorage.getItem(LAST_NOTICE_KEY));
    if (lastNotice && now.getTime() - lastNotice < NOTICE_INTERVAL_MS) return;
    localStorage.setItem(LAST_NOTICE_KEY, String(now.getTime()));
  } catch {
    // No storage (e.g. blocked): shown again after every reload
  }
  appUpdateStore.set({ ...state, showsUpdateNotice: true });
}

export function dismissUpdateNotice(): void {
  appUpdateStore.set((state) => ({ ...state, showsUpdateNotice: false }));
}

export function useAppUpdate(): AppUpdateState {
  return useStore(appUpdateStore);
}
