import type { ReactNode } from "react";
import { Activity, ChartLine, Dumbbell, House, ListChecks, MessagesSquare, Settings, Smartphone, type LucideIcon } from "lucide-react";

import { SectionTitle } from "./SectionTitle";

const BODY_SRC = "/images/Highlighted%20Body";
const SHOWN_MUSCLES = ["Chest", "Front Deltoid", "Triceps", "Abs", "Quads"];
const NOT_TRAINED = ["Biceps", "Calves", "Glutes", "Lats"];
const TABS: { icon: LucideIcon; label: string }[] = [
  { icon: House, label: "Home" },
  { icon: MessagesSquare, label: "Chat" },
  { icon: Dumbbell, label: "Workout" },
  { icon: ChartLine, label: "Stats" },
  { icon: Settings, label: "Settings" },
];
/** The share of the muscles trained, the arc of the gauge around the body */
const COVERED = 0.62;

export function Showcase() {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-24 md:grid-cols-2 md:px-6 md:pt-32">
      <div className="order-2 flex justify-center md:order-1">
        <PhoneMockup />
      </div>
      <div className="order-1 md:order-2">
        <SectionTitle
          align="left"
          eyebrow="Your home screen"
          title="See what you trained. And what you didn't."
        />
        <ul className="mt-8 flex flex-col gap-5">
          <Point icon={Activity} title="The last three days at a glance">
            The trained muscles light up on the body, the ones you missed are listed below it.
          </Point>
          <Point icon={ListChecks} title="Your routines, one tap away">
            Save your push, pull and leg days and start them with one tap. A past workout can be repeated too.
          </Point>
          <Point icon={Smartphone} title="iPhone and browser">
            Start on your phone, check your stats on the laptop. Export and import your workouts as a file anytime.
          </Point>
        </ul>
      </div>
    </section>
  );
}

/** A phone with a simplified home screen of the app, always in the light appearance like a screenshot */
function PhoneMockup() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-[#ff1f1f]/15 blur-3xl" aria-hidden />
      <div
        className="relative h-[600px] w-[296px] rounded-[48px] border-[10px] border-[#111] bg-white text-black shadow-[0_40px_80px_-20px_rgba(0,0,0,0.45)]"
        role="img"
        aria-label="The home screen of Gym 2.0 with the trained muscles highlighted on a body"
      >
        <div className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-[#111]" aria-hidden />
        <div className="flex h-full flex-col overflow-hidden rounded-[38px] bg-[#f2f2f7]" aria-hidden>
          {/* the profile banner in the app color */}
          <div className="flex flex-col items-center bg-linear-to-b from-[#ff0000]/45 to-[#ff0000]/15 px-4 pt-9 pb-8">
            <span className="h-[60px] w-[60px] rounded-full border-[3px] border-[#ff0000] bg-[#8e8e93]" />
            <span className="mt-1.5 text-[17px] leading-5 font-bold">alex.lifts</span>
            <span className="text-[11px] text-[#3c3c43]/60">Training since January 2026</span>
          </div>
          <div className="relative mx-3 -mt-6 flex divide-x divide-[#3c3c43]/20 rounded-[16px] bg-white py-2 shadow-[0_4px_10px_rgba(0,0,0,0.06)]">
            {[
              ["42", "Workouts"],
              ["31 h", "Trained"],
              ["517", "Sets"],
            ].map(([value, label]) => (
              <span key={label} className="flex flex-1 flex-col items-center">
                <span className="font-rounded text-[16px] leading-5 font-bold">{value}</span>
                <span className="text-[10px] text-[#3c3c43]/60">{label}</span>
              </span>
            ))}
          </div>

          <div className="mx-3 mt-3 flex flex-col rounded-[16px] bg-white px-3 pt-2.5 pb-3 shadow-[0_4px_10px_rgba(0,0,0,0.06)]">
            <span className="text-[12px] font-bold">Muscles · last 3 days</span>
            <div className="relative mx-auto mt-1 h-[200px] w-[214px]">
              {/* the coverage gauge: an open ring around the body, filled by the trained share */}
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-[225deg]">
                <circle cx="50" cy="50" r="46" fill="none" stroke="#e5e5ea" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="75 100" />
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="#ff0000"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray={`${75 * COVERED} 100`}
                />
              </svg>
              <div className="absolute left-1/2 top-[14px] aspect-[1051/1261] w-[124px] -translate-x-1/2">
                {/* The muscle images contain the outline as well, multiplied they keep only the red parts on top of it */}
                {/* eslint-disable @next/next/no-img-element */}
                <img src={`${BODY_SRC}/highlighted_body_black.png`} alt="" className="absolute inset-0 h-full w-full" />
                {SHOWN_MUSCLES.map((muscle) => (
                  <img
                    key={muscle}
                    src={`${BODY_SRC}/Muscles/${encodeURIComponent(muscle)}.png`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full mix-blend-multiply"
                  />
                ))}
                {/* eslint-enable @next/next/no-img-element */}
              </div>
              <span className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                <span className="font-rounded text-[22px] leading-6 font-bold">{Math.round(COVERED * 100)}%</span>
                <span className="text-[9px] text-[#3c3c43]/60">covered</span>
              </span>
            </div>
            <span className="mt-1.5 text-[10px] text-[#3c3c43]/60">Not trained yet</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {NOT_TRAINED.map((muscle) => (
                <span key={muscle} className="rounded-full bg-[#ff0000]/12 px-2 py-0.5 text-[9px] text-[#d70015]">
                  {muscle}
                </span>
              ))}
            </span>
          </div>

          <div className="mt-auto flex justify-around border-t border-[#3c3c43]/20 bg-[#f9f9f9]/95 px-2 pt-1.5 pb-5 text-[#999]">
            {TABS.map(({ icon: Icon, label }, index) => (
              <span key={label} className={`flex flex-col items-center gap-0.5 ${index === 0 ? "text-[#ff0000]" : ""}`}>
                <Icon size={18} />
                <span className="text-[8px]">{label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Point({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff1f1f]/12 text-[#e00000] dark:text-[#ff5a4e]">
        <Icon size={20} aria-hidden />
      </span>
      <span>
        <span className="block text-[17px] font-bold">{title}</span>
        <span className="mt-1 block text-[15px] leading-6 text-secondary-label">{children}</span>
      </span>
    </li>
  );
}
