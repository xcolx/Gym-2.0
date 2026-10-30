import { afterEach, describe, expect, it, vi } from "vitest";

import { goBack } from "./navigation";

const origin = "http://fix.localhost:3111";

/** A tab whose history has these paths, the last one is shown */
function history(...paths: string[]) {
  const entries = paths.map((path, index) => ({ url: `${origin}${path}`, key: String(index), index }));
  vi.stubGlobal("window", {
    location: { origin },
    navigation: { currentEntry: entries[entries.length - 1], entries: () => entries, traverseTo: vi.fn() },
  });
}

const router = () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() });

afterEach(() => vi.unstubAllGlobals());

describe("goBack", () => {
  it("pops the screen when the previous entry is its parent", () => {
    history("/chat", "/chat/6", "/chat/6/info");
    const r = router();
    goBack(r, "/chat/6");
    expect(r.back).toHaveBeenCalled();
    expect(r.replace).not.toHaveBeenCalled();
  });

  it("opens the parent of a screen opened directly, also after another screen of the tab", () => {
    history("/chat", "/chat/6/info");
    const r = router();
    goBack(r, "/chat/6");
    expect(r.back).not.toHaveBeenCalled();
    expect(r.replace).toHaveBeenCalledWith("/chat/6");

    history("/chat/6/info");
    goBack(r, "/chat/6");
    expect(r.replace).toHaveBeenCalledTimes(2);
  });

  it("compares the paths without the query", () => {
    history("/stats/past-workouts/abc?x=1", "/stats/past-workouts/abc/edit");
    const r = router();
    goBack(r, "/stats/past-workouts/abc");
    expect(r.back).toHaveBeenCalled();
  });

  it("never goes back to another site", () => {
    vi.stubGlobal("window", {
      location: { origin },
      navigation: {
        currentEntry: { url: `${origin}/chat/6/info`, key: "1", index: 1 },
        entries: () => [
          { url: "https://example.com/chat/6", key: "0", index: 0 },
          { url: `${origin}/chat/6/info`, key: "1", index: 1 },
        ],
        traverseTo: vi.fn(),
      },
    });
    const r = router();
    goBack(r, "/chat/6");
    expect(r.replace).toHaveBeenCalledWith("/chat/6");
  });

  it("opens the parent without the Navigation API", () => {
    vi.stubGlobal("window", { location: { origin } });
    const r = router();
    goBack(r, "/chat/6");
    expect(r.replace).toHaveBeenCalledWith("/chat/6");
  });
});
