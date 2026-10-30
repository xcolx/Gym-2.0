import Link from "next/link";

import { LICENSES_ROUTE, PRIVACY_ROUTE, TERMS_ROUTE } from "@/lib/auth/routes";
import { APP_STORE_URL } from "@/lib/site";

import { DEVELOPER_URL, SOURCE_CODE_URL } from "./brand";

export function LandingFooter() {
  return (
    <footer className="mx-auto mt-20 w-full max-w-6xl border-t border-separator px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+32px)] md:px-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static icon */}
          <img src="/icon.png" alt="" width={28} height={28} className="rounded-[7px]" />
          <span className="text-[15px] text-secondary-label">
            Made by{" "}
            <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground hover:underline">
              Colin Rüegg
            </a>{" "}
            in Switzerland
          </span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-secondary-label">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            iPhone App
          </a>
          <Link href={PRIVACY_ROUTE} className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href={TERMS_ROUTE} className="hover:text-foreground">
            Terms of Use
          </Link>
          <Link href={LICENSES_ROUTE} className="hover:text-foreground">
            Licenses
          </Link>
          <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Source Code
          </a>
          <a href={DEVELOPER_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            colinrueegg.com
          </a>
        </nav>
      </div>
    </footer>
  );
}
