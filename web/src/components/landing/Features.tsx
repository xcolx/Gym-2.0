import { Activity, ChartColumn, Dumbbell, Sparkles, Users, WifiOff, type LucideIcon } from "lucide-react";

import { BRAND_GRADIENT } from "./brand";
import { SectionTitle } from "./SectionTitle";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Dumbbell,
    title: "Log every set",
    text: "Reps, weight, time, intensity and distance, one side at a time for unilateral exercises, with a stopwatch and the history of every exercise right next to it.",
  },
  {
    icon: Activity,
    title: "See your muscles",
    text: "A body map shows what you trained in the last days and what you skipped, so no muscle is forgotten.",
  },
  {
    icon: Sparkles,
    title: "Suggested workouts",
    text: "Tell it how much time and which equipment you have, it picks exercises for the muscles you haven't trained this week.",
  },
  {
    icon: ChartColumn,
    title: "Stats and records",
    text: "Personal records, volume, the distribution over your muscle groups and a few facts you didn't know about your training.",
  },
  {
    icon: Users,
    title: "Train with friends",
    text: "Chat with friends, create groups or join public ones, and ask Gym-AI when you need an idea for your next session.",
  },
  {
    icon: WifiOff,
    title: "Works offline",
    text: "Everything is stored on your device first and synced in the background, between your iPhone and the web app.",
  },
];

export function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-24 md:px-6 md:pt-32">
      <SectionTitle eyebrow="Features" title="Everything a training log needs. Nothing it doesn't." />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li
            key={title}
            className="group rounded-3xl border border-separator bg-grouped/60 p-6 transition-colors hover:border-[#ff1f1f]/40"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white ${BRAND_GRADIENT}`}>
              <Icon size={22} aria-hidden />
            </span>
            <h3 className="mt-4 text-[19px] font-bold">{title}</h3>
            <p className="mt-2 text-[15px] leading-6 text-secondary-label">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
