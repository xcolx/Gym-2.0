import Link from "next/link";
import { ArrowRight, Dumbbell } from "lucide-react";

import { HOME_ROUTE } from "@/lib/auth/routes";

import { BRAND_GRADIENT } from "./brand";

/** The big round button into the app: /home, which sends signed-out visitors to the login */
export function StartButton({ size }: { size: "large" | "small" }) {
  if (size === "small") {
    return (
      <Link
        href={HOME_ROUTE}
        className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-headline font-bold text-[#d10000] shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
      >
        Start training
        <ArrowRight size={20} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    );
  }
  return (
    <Link
      href={HOME_ROUTE}
      aria-label="Start your workout"
      className={`group relative z-10 flex h-[188px] w-[188px] flex-col items-center justify-center rounded-full text-white shadow-[0_24px_60px_-12px_rgba(255,31,31,0.65)] ring-8 ring-[#ff1f1f]/15 transition-transform duration-300 hover:scale-[1.04] active:scale-95 md:h-[232px] md:w-[232px] ${BRAND_GRADIENT}`}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-full bg-[#ff1f1f]/40 motion-safe:animate-[landing-pulse_2.8s_ease-out_infinite]"
        aria-hidden
      />
      <Dumbbell size={40} strokeWidth={2.25} className="relative md:size-12" aria-hidden />
      <span className="relative mt-2 text-[30px] leading-none font-black tracking-tight md:text-[38px]">Start</span>
      <span className="relative mt-1.5 flex items-center gap-1 text-[15px] font-semibold text-white/85">
        your workout
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
