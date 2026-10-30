// Back navigation like a NavigationStack: the back button of a screen pops it (history.back) when the entry before it
// in the history is its parent, so the back button of Android goes the same way. Otherwise (opened by a link from
// outside, a reload, typed into the address bar, or no Navigation API to look at the previous entry) it opens the
// parent in place of the screen, so back never leaves the app or lands on an unrelated screen.

type AppRouter = { back(): void; push(href: string): void; replace(href: string): void };

interface NavigationEntry {
  url: string | null;
  key: string;
  index: number;
}

interface NavigationApi {
  currentEntry: NavigationEntry | null;
  entries(): NavigationEntry[];
  traverseTo(key: string): unknown;
}

function navigationApi(): NavigationApi | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as unknown as { navigation?: NavigationApi }).navigation;
  return navigation && typeof navigation.entries === "function" ? navigation : null;
}

function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin === window.location.origin ? parsed.pathname : null;
  } catch {
    return null;
  }
}

/** The path of the entry before the current one, null if unknown or not in the app */
function previousPath(): string | null {
  const navigation = navigationApi();
  const current = navigation?.currentEntry;
  if (!navigation || !current) return null;
  const previous = navigation.entries()[current.index - 1];
  return previous ? pathOf(previous.url) : null;
}

/** The path of an href of the app (without query and hash) */
function hrefPath(href: string): string {
  return new URL(href, "http://app.invalid").pathname;
}

/**
 * The back button of a screen whose parent is `parentHref`: pops the screen if the previous history entry is the
 * parent, otherwise replaces it with the parent (e.g. a chat info opened directly goes to its chat, not to whatever
 * the tab showed before).
 */
export function goBack(router: AppRouter, parentHref: string): void {
  if (previousPath() === hrefPath(parentHref)) router.back();
  else router.replace(parentHref);
}

/**
 * Pops back to the screen with the path (`path = NavigationPath()` on iOS), e.g. to the chat list after leaving a
 * group, so the back button doesn't lead to the chat that is gone. Replaces the current screen if it isn't in the
 * history.
 */
export function popTo(router: AppRouter, href: string): void {
  const navigation = navigationApi();
  const current = navigation?.currentEntry;
  if (navigation && current) {
    const entries = navigation.entries();
    for (let index = current.index - 1; index >= 0; index -= 1) {
      if (pathOf(entries[index].url) === href) {
        navigation.traverseTo(entries[index].key);
        return;
      }
    }
  }
  router.replace(href);
}
