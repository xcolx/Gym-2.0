"use client";

import { HighlightedBody } from "@/components/ui/HighlightedBody";
import { useNow } from "@/lib/use-now";
import { ListOfNotTrainedMuscles, ProfileBanner, ProgressBar, StatCard } from "@/components/home/HomeSections";
import { notTrainedMuscles, progressPercentage, timeWorkedOutShort } from "@/lib/domain/home";
import { summaryOfWorkouts } from "@/lib/domain/stats";
import { isRecent, musclesTrained, RECENT_DAYS } from "@/lib/domain/workout";
import {
  useCurrentUser,
  useFinishedWorkouts,
  useMuscles,
  useReferenceData,
  useUserSettings,
} from "@/lib/repo/hooks";

/** Port of HomeView.swift */
export default function HomePage() {
  const user = useCurrentUser();
  const settings = useUserSettings();
  const workouts = useFinishedWorkouts();
  const muscles = useMuscles();
  const reference = useReferenceData();

  // Checked every minute, so the days move on while the page stays open
  const now = useNow(60_000);

  if (user === undefined || !settings || !workouts || !muscles || !reference) return null;

  const recentWorkouts = workouts.filter((workout) => isRecent(workout, new Date(now)));
  const trained = musclesTrained(recentWorkouts, reference);
  const percentage = progressPercentage(trained, muscles);

  return (
    <main className="screen mx-auto flex w-full max-w-3xl flex-col md:px-6 md:pt-6">
      <ProfileBanner user={user} schemeColor={settings.schemeColor} />

      <div className="flex justify-evenly py-5">
        <StatCard value={String(workouts.length)} label="Workouts" />
        <StatCard value={timeWorkedOutShort(workouts)} label="trained" />
        <StatCard value={String(summaryOfWorkouts(workouts).sets)} label="Sets" />
      </div>

      <div className="flex-1" />

      <div className="flex items-stretch">
        <section className="min-w-0 flex-1">
          <p className="pl-2.5">Muscles worked out the last {RECENT_DAYS} days:</p>
          <HighlightedBody
            primaryMuscles={trained[0]}
            secondaryMuscles={trained[1]}
            className="mx-auto max-h-[52dvh] max-w-full md:max-h-[480px]"
          />
        </section>
        {percentage < 100 && <ListOfNotTrainedMuscles muscles={notTrainedMuscles(trained, muscles)} />}
      </div>

      <ProgressBar percentage={percentage} />

      <div className="flex-1" />
    </main>
  );
}
