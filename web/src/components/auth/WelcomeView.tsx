"use client";

import { ChartLine, MessagesSquare, PersonStanding, type LucideIcon } from "lucide-react";

import { PrimaryButton, SecondaryButton } from "@/components/ui/PrimaryButton";

import { AppMark } from "./AuthParts";

/** The start of AuthView.swift (WelcomeView), from which the login and creating an account are opened */
export function WelcomeView({ showSignUp, showLogin }: { showSignUp: () => void; showLogin: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col bg-grouped pb-[calc(8px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-[500px] flex-1 flex-col items-center px-6">
        <div className="flex-1" />

        <AppMark size={88} />
        <h1 className="mt-4 text-large-title font-bold">Gym 2.0</h1>
        <p className="mt-1 text-center text-title3 text-secondary-label">Track every set. See every muscle.</p>

        <ul className="mt-10 flex flex-col gap-[18px] self-stretch px-2">
          <FeatureRow icon={ChartLine} title="Stats on every exercise" subtitle="See how your weights and sets develop." />
          <FeatureRow icon={PersonStanding} title="See which muscles you hit" subtitle="Spot the ones you haven't trained lately." />
          <FeatureRow icon={MessagesSquare} title="Train with your friends" subtitle="Chat and share your workouts." />
        </ul>

        <div className="flex-[2]" />

        <div className="flex w-full flex-col gap-3 pt-6">
          <PrimaryButton onClick={showSignUp}>Create account</PrimaryButton>
          <SecondaryButton onClick={showLogin}>Log in</SecondaryButton>
        </div>
      </div>
    </main>
  );
}

function FeatureRow({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <li className="flex items-center gap-3.5">
      <Icon size={24} className="w-8 shrink-0 text-app" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <span className="text-headline font-semibold">{title}</span>
        <span className="text-subheadline text-secondary-label">{subtitle}</span>
      </div>
    </li>
  );
}
