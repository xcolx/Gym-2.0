// Registers the service worker (public/sw.js) and knows whether a new version of the web app is waiting. Only in
// production builds: `next dev` changes its chunks all the time and has no generated worker.

import { updateAvailable } from "@/lib/api/app-update";
import { createStore } from "@/lib/store";

interface ServiceWorkerState {
  /** A new version was installed and waits until the page asks it to take over (`applyUpdate()`) */
  isUpdateWaiting: boolean;
}

const serviceWorkerStore = createStore<ServiceWorkerState>({ isUpdateWaiting: false });

const SERVICE_WORKER_URL = "/sw.js";
/** How often a long open app (e.g. an installed one in the background) checks for a new version */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let registered = false;
let isReloading = false;

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production";
}

/** Called once by the AppShell. Returns a cleanup function. */
export function registerServiceWorker(): () => void {
  if (!isSupported() || registered) return () => {};
  registered = true;

  // A page that was controlled before reloads when another worker takes over (the user updated in another tab):
  // the chunks of its version are gone from the cache. Not on the first install, which takes over without a reload.
  const hadController = navigator.serviceWorker.controller !== null;
  const onControllerChange = () => {
    if (hadController) reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  let lastCheck = Date.now();
  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    void checkForUpdate();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  void (async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
      watch(registration);
      // The large files that aren't needed to start (the images of the body)
      (await navigator.serviceWorker.ready).active?.postMessage({ type: "CACHE_LAZY_ASSETS" });
    } catch (error) {
      console.error("Registering the service worker failed", error);
    }
  })();

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/**
 * Marks the update as waiting once a new worker is installed next to the active one, and shows the update notice
 * (at most once a day, like for a deprecated API version). Without an update the worker takes over by itself once
 * every tab of the app is closed.
 */
function watch(registration: ServiceWorkerRegistration): void {
  const check = () => {
    if (!registration.waiting || !navigator.serviceWorker.controller) return;
    serviceWorkerStore.set({ isUpdateWaiting: true });
    updateAvailable();
  };
  check();
  registration.addEventListener("updatefound", () => {
    registration.installing?.addEventListener("statechange", check);
  });
}

/** Asks the server for a new version, e.g. when the app comes back to the foreground */
async function checkForUpdate(): Promise<void> {
  if (!isSupported()) return;
  try {
    await (await navigator.serviceWorker.getRegistration())?.update();
  } catch {
    // Offline
  }
}

/**
 * Updates the web app: looks for a new version, lets it take over and reloads the page. Without a new version the
 * page is reloaded from the server. Used by the update screens (410, Deprecation header, new deployment).
 */
export async function applyUpdate(): Promise<void> {
  const registration = isSupported() ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
  if (!registration) return reload();
  try {
    await registration.update();
  } catch {
    // Offline: maybe a worker is waiting already
  }
  const worker = registration.waiting ?? (await installed(registration.installing));
  if (!worker || !navigator.serviceWorker.controller) return reload();
  navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
  worker.postMessage({ type: "SKIP_WAITING" });
  // In case the worker never takes over
  setTimeout(reload, 5000);
}

/** Resolves with the worker once it is installed, null if there is none or it failed */
function installed(worker: ServiceWorker | null): Promise<ServiceWorker | null> {
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const onChange = () => {
      if (worker.state === "installed") resolve(worker);
      else if (worker.state === "redundant" || worker.state === "activated") resolve(null);
    };
    worker.addEventListener("statechange", onChange);
    onChange();
    // Precaching takes a while on a slow connection
    setTimeout(() => resolve(null), 60_000);
  });
}

function reload(): void {
  if (isReloading) return;
  isReloading = true;
  window.location.reload();
}
