"use client";

import { useState } from "react";

import { ProfileBanner, RecentMuscles, Totals } from "@/components/home/HomeSections";
import { useNow } from "@/lib/use-now";
import { timeWorkedOutShort } from "@/lib/domain/home";
import { summaryOfWorkouts } from "@/lib/domain/stats";
import { isRecent, musclesTrained } from "@/lib/domain/workout";
import {
  useCurrentUser,
  useFinishedWorkouts,
  useMuscles,
  useReferenceData,
  useUserSettings,
} from "@/lib/repo/hooks";
import type { Muscle } from "@/types/models";

/** Port of HomeView.swift */
export default function HomePage() {
  const user = useCurrentUser();
  const settings = useUserSettings();
  const workouts = useFinishedWorkouts();
  const muscles = useMuscles();
  const reference = useReferenceData();
  // The muscle that is shown alone on the body, until something else is tapped or Home is left
  const [selectedMuscle, setSelectedMuscle] = useState<Muscle | null>(null);

  // Checked every minute, so the days move on while the page stays open
  const now = useNow(60_000);

  if (user === undefined || !settings || !workouts || !muscles || !reference) return null;

  const recentWorkouts = workouts.filter((workout) => isRecent(workout, new Date(now)));

  return (
    <main className="screen bg-grouped" onClick={() => setSelectedMuscle(null)}>
      <div className="mx-auto w-full max-w-3xl md:px-6 md:pt-6">
        <ProfileBanner user={user} schemeColor={settings.schemeColor} />
        <Totals
          totals={[
            { value: String(workouts.length), label: "Workouts" },
            { value: timeWorkedOutShort(workouts), label: "Trained" },
            { value: String(summaryOfWorkouts(workouts).sets), label: "Sets" },
          ]}
        />
        <RecentMuscles
          trained={musclesTrained(recentWorkouts, reference)}
          muscles={muscles}
          appColor={settings.schemeColor}
          selectedMuscle={selectedMuscle}
          onSelectMuscle={setSelectedMuscle}
        />
      </div>
    </main>
  );
}
