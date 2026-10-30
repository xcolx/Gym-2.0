import { useSyncExternalStore } from "react";

// A minimal observable value, the web counterpart of the @Observable services of the iOS app (AuthService,
// AppUpdateService, ...). Components read it with `useStore(store)`, everything else with `store.get()`.

export interface Store<T> {
  get(): T;
  /** Notifies the listeners only if the value changed (Object.is). */
  set(value: T | ((previous: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (previous: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Re-renders when the store changes. During SSR the initial value is used. */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
