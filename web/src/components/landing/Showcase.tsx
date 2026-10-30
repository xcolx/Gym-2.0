import type { ReactNode } from "react";
import { Activity, ChartColumn, Dumbbell, ListChecks, MessageCircle, Smartphone, Users, type LucideIcon } from "lucide-react";

import { SectionTitle } from "./SectionTitle";

const BODY_SRC = "/images/Highlighted%20Body";
const SHOWN_MUSCLES = ["Chest", "Front Deltoid", "Triceps", "Abs", "Quads"];

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
          <Point icon={Activity} title="The last four days at a glance">
            The trained muscles light up on the body, the ones you missed are listed next to it.
          </Point>
          <Point icon={ListChecks} title="Your routines as schemes">
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
        <div className="flex h-full flex-col overflow-hidden rounded-[38px]" aria-hidden>
          <div className="flex items-center gap-3 bg-[#ff0000]/50 px-4 pt-12 pb-4">
            <span className="h-12 w-12 rounded-full border-[3px] border-[#ff0000] bg-black" />
            <span>
              <span className="block text-[22px] leading-6">alex.lifts</span>
              <span className="block text-[10px] text-[#666]">Tracking with Gym 2.0 since: 03.01.26</span>
            </span>
          </div>
          <div className="flex justify-evenly px-2 py-3">
            {[
              ["42", "Workouts"],
              ["31 h", "trained"],
              ["517", "Sets"],
            ].map(([value, label]) => (
              <span key={label} className="flex h-[58px] w-[78px] flex-col items-center justify-center rounded-[10px] bg-black text-white">
                <span className="text-[20px] leading-6">{value}</span>
                <span className="text-[11px] font-semibold">{label}</span>
              </span>
            ))}
          </div>
          <p className="px-3 text-[11px]">Muscles worked out the last 3 days:</p>
          <div className="relative mx-auto aspect-[1051/1261] w-[250px]">
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
          <div className="mt-auto flex items-center gap-2 px-3 pb-3">
            <span className="relative h-2 flex-1 rounded-full bg-[#ddd]">
              <span className="absolute inset-y-0 left-0 w-[62%] rounded-full bg-[#ff0000]" />
            </span>
            <span className="text-[11px] font-semibold">62%</span>
          </div>
          <div className="flex justify-around border-t border-[#ddd] bg-[#f9f9f9] px-2 pt-2 pb-5 text-[#999]">
            <Dumbbell size={20} className="text-[#ff0000]" />
            <MessageCircle size={20} />
            <ListChecks size={20} />
            <ChartColumn size={20} />
            <Users size={20} />
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
