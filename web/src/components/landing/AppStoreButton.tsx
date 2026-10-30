import { APP_STORE_URL } from "@/lib/site";

/** The iOS app on the App Store, in the look of the "Download on the App Store" badge of Apple */
export function AppStoreButton() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download on the App Store"
      className="inline-flex h-14 items-center gap-2.5 rounded-[14px] border border-[#a6a6a6] bg-black pr-5 pl-4 text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
    >
      <svg viewBox="0 0 24 24" width={28} height={28} fill="currentColor" aria-hidden>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
      <span className="flex flex-col items-start leading-none" aria-hidden>
        <span className="text-[11px] font-medium">Download on the</span>
        <span className="mt-0.5 text-[22px] font-semibold tracking-tight">App Store</span>
      </span>
    </a>
  );
}
