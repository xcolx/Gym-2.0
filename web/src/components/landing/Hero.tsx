import { Flame, ListChecks, MessageCircle, Sparkles, Trophy, WifiOff, type LucideIcon } from "lucide-react";

import { AppStoreButton } from "./AppStoreButton";
import { BRAND_GRADIENT, BRAND_TEXT } from "./brand";
import { StartButton } from "./StartButton";

/** The cards floating around the start button, like the screens of the app */
const ORBIT: { icon: LucideIcon; title: string; detail: string; position: string; delay: string }[] = [
  { icon: Trophy, title: "New record", detail: "Bench Press · 8x 85.0 kg", position: "left-0 top-6", delay: "0s" },
  { icon: Flame, title: "This week", detail: "4 workouts · 5.2 h trained", position: "right-0 top-2", delay: "1.2s" },
  { icon: Sparkles, title: "Gym-AI", detail: "“How about a pull day?”", position: "left-0 bottom-28", delay: "2.1s" },
  { icon: MessageCircle, title: "Leg Day Crew", detail: "Anna: Squats at 6?", position: "right-0 bottom-32", delay: "0.6s" },
  { icon: WifiOff, title: "Offline", detail: "Synced when you're back", position: "left-[18%] bottom-2", delay: "1.7s" },
  { icon: ListChecks, title: "Push Day", detail: "6 exercises · scheme", position: "right-[17%] bottom-0", delay: "2.6s" },
];

export function Hero() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 pt-8 text-center md:px-6 md:pt-14">
      <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-separator px-3.5 py-1 text-footnote text-secondary-label">
        <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" aria-hidden />
        Free · Open source · No ads
      </p>
      <h1 className="mx-auto mt-5 max-w-4xl text-[44px] leading-[1.02] font-black tracking-tight sm:text-6xl md:text-7xl">
        Every set logged.
        <br />
        <span className={BRAND_TEXT}>Every muscle seen.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-7 text-secondary-label md:text-[19px]">
        Gym 2.0 is the workout tracker that shows you which muscles you trained, suggests what to train next and
        keeps working in the basement gym without signal. On your iPhone and in the browser.
      </p>

      <div className="relative mx-auto mt-10 flex h-[300px] w-full max-w-4xl items-center justify-center md:mt-6 md:h-[460px]">
        {/* The glow behind the button */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff1f1f]/25 blur-3xl md:h-[440px] md:w-[440px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ff1f1f]/20 md:h-[360px] md:w-[360px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-separator md:block"
          aria-hidden
        />

        {ORBIT.map(({ icon: Icon, title, detail, position, delay }) => (
          <div
            key={title}
            className={`absolute ${position} hidden w-[220px] items-center gap-3 rounded-2xl border border-separator bg-background/80 p-3 text-left shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md motion-safe:animate-[landing-float_7s_ease-in-out_infinite] md:flex`}
            style={{ animationDelay: delay }}
            aria-hidden
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${BRAND_GRADIENT}`}>
              <Icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{title}</span>
              <span className="block truncate text-[12px] text-secondary-label">{detail}</span>
            </span>
          </div>
        ))}

        <StartButton size="large" />
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 md:mt-10">
        <AppStoreButton />
        <p className="mx-auto max-w-md text-footnote text-secondary-label">
          Or create a free account and start right away in the browser. On Android, install it from the browser like
          an app.
        </p>
      </div>

      {/* The orbit cards as a list on small screens */}
      <ul className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-2.5 text-left md:hidden">
        {ORBIT.slice(0, 4).map(({ icon: Icon, title, detail }) => (
          <li key={title} className="flex flex-col gap-1.5 rounded-2xl border border-separator p-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${BRAND_GRADIENT}`}>
              <Icon size={16} aria-hidden />
            </span>
            <span className="text-[13px] font-semibold">{title}</span>
            <span className="text-[12px] leading-4 text-secondary-label">{detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
