// Installing the web app on Android (Chrome's `beforeinstallprompt`): the browser offers the install once the app has
// a manifest and a service worker, the settings show an "Install App" row while it can be installed.

import { createStore, useStore } from "@/lib/store";

/** Not in the TypeScript DOM types, only Chromium browsers fire it */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptState {
  /** The browser offers the installation, `promptInstall()` shows its dialog */
  canInstall: boolean;
}

const installPromptStore = createStore<InstallPromptState>({ canInstall: false });

export function useInstallPrompt(): InstallPromptState {
  return useStore(installPromptStore);
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;

/** Called once by the AppShell, as early as possible: the event can come right after the page loaded */
export function listenForInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Shown from the settings instead of the browser's mini info bar
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    installPromptStore.set({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installPromptStore.set({ canInstall: false });
  });
}

/** Shows the install dialog of the browser. Resolves to true if the user installed the app. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  // The event can only be used once
  deferredPrompt = null;
  installPromptStore.set({ canInstall: false });
  await prompt.prompt();
  return (await prompt.userChoice).outcome === "accepted";
}
