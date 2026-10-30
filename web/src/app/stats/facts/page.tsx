"use client";

import { ShareTextButton } from "@/components/stats/ShareTextButton";
import { Page, PageHeader } from "@/components/ui/Page";
import { interestingFacts } from "@/lib/domain/interesting-facts";
import { interestingFactShareText } from "@/lib/domain/stats-screens";
import { useCurrentUser, useEquipment, useFinishedWorkouts, useMuscleGroups, useUserSettings } from "@/lib/repo/hooks";

/** Port of InterestingFactsView.swift */
export default function InterestingFactsPage() {
  const workouts = useFinishedWorkouts();
  const equipment = useEquipment();
  const muscleGroups = useMuscleGroups();
  const currentUser = useCurrentUser();
  const settings = useUserSettings();

  const facts =
    workouts && equipment && muscleGroups && currentUser !== undefined && settings
      ? interestingFacts({
          workouts,
          equipment,
          muscleGroups,
          memberSince: currentUser?.createdAt ?? null,
          weightUnit: settings.weightUnit,
          distanceUnit: settings.distanceUnit,
        })
      : null;

  return (
    <Page>
      <PageHeader title="Interesting Facts" back={{ href: "/stats", label: "Statistics" }} />
      {facts && (
        <div className="flex flex-col items-center pb-4">
          {facts.map((fact) => (
            <article
              key={fact.title}
              className="mx-[15px] my-[5px] w-[calc(100%-30px)] rounded-[20px] bg-my-white px-[15px] py-[10px] shadow-[5px_5px_5px_color-mix(in_srgb,var(--my-black)_50%,transparent)]"
            >
              <div className="mb-[5px] flex items-center gap-2">
                <h2 className="flex-1 text-headline font-semibold">{fact.title}</h2>
                <ShareTextButton
                  text={() => interestingFactShareText(fact.text)}
                  label={`Share ${fact.title}`}
                  className="text-my-black"
                />
              </div>
              <p>{fact.text}</p>
            </article>
          ))}
          <p className="mt-2 text-footnote">more coming in the future ...</p>
        </div>
      )}
    </Page>
  );
}
