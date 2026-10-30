// The web counterparts of SwiftUI's ShareLink, with a download or the clipboard where the browser can't share

type ShareResult = "shared" | "copied" | "downloaded" | "cancelled" | "failed";

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Shares a text, or copies it to the clipboard without a share sheet */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
      // e.g. NotAllowedError without a user gesture: fall back to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Whether the system share sheet can share the file (Android Chrome, Safari) */
export function canShareFile(file: File): boolean {
  return (
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare({ files: [file] })
  );
}

/** Saves the file with the download of the browser (to the Downloads folder on Android) */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // After the download started
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the share sheet with the file if the browser can share files, otherwise downloads it */
export async function shareOrDownloadFile(file: File): Promise<ShareResult> {
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  try {
    downloadFile(file);
    return "downloaded";
  } catch {
    return "failed";
  }
}
