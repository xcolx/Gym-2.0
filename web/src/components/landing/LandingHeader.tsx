import Link from "next/link";

import { HOME_ROUTE } from "@/lib/auth/routes";

import { SOURCE_CODE_URL } from "./brand";

export function LandingHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-4 md:px-6">
      <Link href="/" className="flex items-center gap-2.5" aria-label="Gym 2.0">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static icon */}
        <img src="/icon.png" alt="" width={36} height={36} className="rounded-[9px]" />
        <span className="text-headline font-bold">Gym 2.0</span>
      </Link>
      <nav className="flex items-center gap-1 text-[15px] sm:gap-3">
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden rounded-full px-3 py-1.5 text-secondary-label transition-colors hover:text-foreground sm:inline-flex"
        >
          Source code
        </a>
        <Link
          href={HOME_ROUTE}
          className="rounded-full border border-separator px-4 py-1.5 font-semibold transition-colors hover:bg-field/40"
        >
          Log in
        </Link>
      </nav>
    </header>
  );
}
