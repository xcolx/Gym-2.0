import { afterEach, describe, expect, it, vi } from "vitest";

import { canShareFile, shareOrDownloadFile, shareText } from "./share";

const abort = () => new DOMException("The user cancelled", "AbortError");
const file = new File(["{}"], "workouts.json", { type: "application/json" });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stubDownload() {
  const link = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: () => "blob:1", revokeObjectURL });
  return { link, revokeObjectURL };
}

describe("shareText", () => {
  it("uses the share sheet of the system", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share });
    expect(await shareText("PR!")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ text: "PR!" });
  });

  it("knows when the user cancelled", async () => {
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abort()), clipboard: { writeText: vi.fn() } });
    expect(await shareText("PR!")).toBe("cancelled");
  });

  it("copies the text without a share sheet or if sharing isn't allowed", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await shareText("PR!")).toBe("copied");

    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("No gesture", "NotAllowedError")), clipboard: { writeText } });
    expect(await shareText("PR!")).toBe("copied");
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("fails without a clipboard", async () => {
    vi.stubGlobal("navigator", {});
    expect(await shareText("PR!")).toBe("failed");
  });
});

describe("files", () => {
  it("can share a file only if the browser can share files", () => {
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => true });
    expect(canShareFile(file)).toBe(true);
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: () => false });
    expect(canShareFile(file)).toBe(false);
    vi.stubGlobal("navigator", { share: vi.fn() });
    expect(canShareFile(file)).toBe(false);
  });

  it("shares the file with its name", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    expect(await shareOrDownloadFile(file)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files: [file], title: "workouts.json" });
  });

  it("downloads the file without a share sheet and revokes its URL later", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {});
    const { link, revokeObjectURL } = stubDownload();
    expect(await shareOrDownloadFile(file)).toBe("downloaded");
    expect(link).toMatchObject({ href: "blob:1", download: "workouts.json" });
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("downloads it if sharing failed, but not if the user cancelled", async () => {
    stubDownload();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new TypeError("too large")), canShare: () => true });
    expect(await shareOrDownloadFile(file)).toBe("downloaded");
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abort()), canShare: () => true });
    expect(await shareOrDownloadFile(file)).toBe("cancelled");
  });
});
