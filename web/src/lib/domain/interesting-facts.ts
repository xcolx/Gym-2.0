// Port of ios/Gym 2.0/Core/Domain/InterestingFacts.swift

import type { Equipment, MuscleGroup, UnitSystem, WorkoutWithExercises } from "@/types/models";
import { BODYWEIGHT_EQUIPMENT_NAMES } from "./exercise";
import { appLocale, firstWeekday } from "./format";
import { formatDuration, summaryOfWorkouts } from "./stats";
import { formatDistance, formatNumber, formatVolume } from "./units";
import { totalReps, volume } from "./workout-exercise";

interface InterestingFact {
  /** Unique, can be used as key */
  title: string;
  text: string;
}

// Reference values the facts compare with
const TIKTOK_SECONDS = 42.7;
const ELEPHANT_KILOGRAMS = 6000;
const BLUE_WHALE_KILOGRAMS = 150_000;
const MARATHON_METERS = 42_195;
const TITANIC_MINUTES = 194; // 3 h 14 min
const RECOMMENDED_MINUTES_PER_WEEK = 150; // WHO, moderate activity
const LEGS_MUSCLE_GROUP_NAME = "Legs";

const DAY_MS = 24 * 60 * 60 * 1000;

interface InterestingFactsInput {
  /** The finished workouts */
  workouts: readonly WorkoutWithExercises[];
  /** All equipment, to find the bodyweight exercises (body and pull up bar) */
  equipment: readonly Equipment[];
  /** All muscle groups, to find the leg exercises */
  muscleGroups: readonly MuscleGroup[];
  /** When the user created the account, null if unknown */
  memberSince: Date | null;
  weightUnit: UnitSystem;
  distanceUnit: UnitSystem;
  now?: Date;
  /** First day of the week, 0 = Sunday. Defaults to the one of the locale. */
  weekStartsOn?: number;
  /** For the weekday names and the grouping separators, defaults to the browser's */
  locale?: string;
}

export function interestingFacts(input: InterestingFactsInput): InterestingFact[] {
  const { workouts, weightUnit, distanceUnit, locale } = input;
  const now = input.now ?? new Date();
  const weekStartsOn = input.weekStartsOn ?? firstWeekday(locale);
  const count = (value: number) => formatCount(value, locale);
  const countOf = (value: number, singular: string, plural: string) => formatCountOf(value, singular, plural, locale);

  const summary = summaryOfWorkouts(workouts);
  const workoutExercises = workouts.flatMap((workout) => workout.workoutExercises);

  const bodyEquipmentIds = new Set(
    input.equipment.filter((item) => BODYWEIGHT_EQUIPMENT_NAMES.has(item.name)).map((item) => item.serverId),
  );
  const legsMuscleGroupIds = new Set(
    input.muscleGroups.filter((group) => group.name === LEGS_MUSCLE_GROUP_NAME).map((group) => group.serverId),
  );
  const bodyExercises = workoutExercises.filter((we) => bodyEquipmentIds.has(we.exercise?.equipmentId ?? -1));
  const legExercises = workoutExercises.filter((we) => legsMuscleGroupIds.has(we.exercise?.muscleGroupId ?? -1));

  const facts: InterestingFact[] = [];

  // Let's watch Tik Tok
  const tikToks = (summary.duration * 60) / TIKTOK_SECONDS;
  facts.push({
    title: "Let's watch Tik Tok",
    text: `You have worked out a total time of ${formatDuration(summary.duration)}. The average TikTok video is 42.7 seconds long. That means if you had decided not to work out every single time, you could have watched about ${count(tikToks)} TikTok videos. But would these videos have made you stronger?`,
  });

  // Stay in Bed
  facts.push({
    title: "Stay in Bed",
    text: `Every day you can decide to get up and do something productive like a workout or just stay in bed. Till now you have decided a total of ${workouts.length} ${workouts.length === 1 ? "time" : "times"} that you want to do a workout. Keep up the good work!`,
  });

  // Move your body
  const bodyReps = bodyExercises.reduce((sum, we) => sum + totalReps(we), 0);
  const bodyVolume = bodyExercises.reduce((sum, we) => sum + volume(we), 0);
  if (bodyReps > 0) {
    let text = `No machine, no barbell, just you: with bodyweight exercises you have moved your own body ${countOf(bodyReps, "time", "times")}.`;
    if (bodyVolume > 0) {
      text += ` That adds up to ${formatVolume(bodyVolume, weightUnit)} of you.`;
    }
    text += " Your body is the only equipment you always have with you!";
    facts.push({ title: "Move your body", text });
  } else {
    facts.push({
      title: "Move your body",
      text: "You haven't moved your own bodyweight yet. Push ups, squats or pull ups need little to no equipment, so you can do them almost everywhere. Give them a try!",
    });
  }

  // Strong Legs
  const legVolume = legExercises.reduce((sum, we) => sum + volume(we), 0);
  if (legVolume > 0) {
    const elephants = legVolume / ELEPHANT_KILOGRAMS;
    facts.push({
      title: "Strong Legs",
      text: `With your legs you have pressed a total of ${formatVolume(legVolume, weightUnit)}. An elephant weighs about 6 tons on average, so you have pressed about ${countOf(elephants, "elephant", "elephants")}. Never skip leg day!`,
    });
  } else {
    facts.push({
      title: "Strong Legs",
      text: "An elephant weighs about 6 tons. You haven't pressed a single one with your legs yet, because there is no weighted leg exercise in your workouts. Time for leg day!",
    });
  }

  // Heavy Lifter
  if (summary.volume > 0) {
    const share = summary.volume / BLUE_WHALE_KILOGRAMS;
    const comparison =
      share < 1
        ? `That is ${count(share * 100)}% of a blue whale, the heaviest animal on earth, which weighs up to 150 tons.`
        : `A blue whale, the heaviest animal on earth, weighs up to 150 tons. You have lifted about ${count(share)} of them!`;
    facts.push({
      title: "Heavy Lifter",
      text: `In all your workouts together you have lifted ${formatVolume(summary.volume, weightUnit)}. ` + comparison,
    });
  }

  // Marathon
  if (summary.distance.total > 0) {
    const marathons = summary.distance.total / MARATHON_METERS;
    const comparison =
      marathons < 1
        ? `That is ${count(marathons * 100)}% of a marathon (42.195 km).`
        : `That is about ${countOf(marathons, "marathon", "marathons")} (42.195 km each).`;
    facts.push({
      title: "Marathon",
      text: `You have covered a distance of ${formatDistance(summary.distance.total, distanceUnit)} in your workouts. ` + comparison,
    });
  }

  // Movie Night
  const longest = workouts.length > 0 ? Math.max(...workouts.map((workout) => workout.duration)) : null;
  if (longest !== null && longest > 0) {
    const titanics = longest / TITANIC_MINUTES;
    const comparison =
      longest <= TITANIC_MINUTES
        ? `In that time you could have watched ${count(titanics * 100)}% of Titanic (3 h 14 min), one of the longest blockbusters.`
        : "That is even longer than Titanic (3 h 14 min), one of the longest blockbusters. Now that's dedication!";
    facts.push({
      title: "Movie Night",
      text: `Your longest workout lasted ${formatDuration(longest)}. ` + comparison,
    });
  }

  // Favorite Day
  if (workouts.length > 0) {
    const workoutsPerWeekday = new Array<number>(7).fill(0);
    for (const workout of workouts) {
      workoutsPerWeekday[workout.date.getDay()] += 1;
    }
    // first day of the week of the user first, so a tie picks the earlier day
    const weekdays = Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
    const most = Math.max(...workoutsPerWeekday);
    const favorite = weekdays.find((day) => workoutsPerWeekday[day] === most) ?? 0;
    const percent = (most / workouts.length) * 100;
    const dayName = weekdayName(favorite, locale);
    facts.push({
      title: "Favorite Day",
      text: `${dayName} seems to be your favorite day to work out: ${most} of your ${workouts.length} ${workouts.length === 1 ? "workout" : "workouts"} (${count(percent)}%) took place on a ${dayName}.`,
    });
  }

  // Early Bird / Night Owl
  const earlyWorkouts = workouts.filter((workout) => workout.date.getHours() < 8).length;
  const lateWorkouts = workouts.filter((workout) => workout.date.getHours() >= 21).length;
  if (earlyWorkouts > 0 && earlyWorkouts >= lateWorkouts) {
    facts.push({
      title: "Early Bird",
      text: `${earlyWorkouts} of your workouts started before 8 am, while most people were still asleep. The early bird catches the gains!`,
    });
  } else if (lateWorkouts > 0) {
    facts.push({
      title: "Night Owl",
      text: `${lateWorkouts} of your workouts started at 9 pm or later, when others were already on the couch. Who needs sleep anyway?`,
    });
  }

  // Weekly Average, only after a full week, otherwise a single workout would give a huge average
  const dates = [input.memberSince, ...workouts.map((workout) => workout.date)].filter((date): date is Date => !!date);
  if (dates.length > 0) {
    const firstDate = new Date(Math.min(...dates.map((date) => date.getTime())));
    const days = Math.floor((now.getTime() - firstDate.getTime()) / DAY_MS);
    if (days >= 7) {
      const minutesPerWeek = summary.duration / (days / 7);
      const average = `Since you started tracking with Gym 2.0 you have trained ${formatDuration(Math.round(minutesPerWeek))} per week on average. The WHO recommends at least 150 minutes of physical activity per week.`;
      if (minutesPerWeek >= RECOMMENDED_MINUTES_PER_WEEK) {
        facts.push({
          title: "Above the Recommendation",
          text: average + " You beat that with your workouts alone. Keep up the good work!",
        });
      } else {
        facts.push({
          title: "Room to Grow",
          text: average + " Every walk or bike ride counts too, so keep moving and stand out from the crowd!",
        });
      }
    }
  }

  return facts;
}

/** The name of a JS weekday (0 = Sunday), e.g. "Monday" */
function weekdayName(weekday: number, locale: string = appLocale()): string {
  // 4 January 1970 was a Sunday
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(1970, 0, 4 + weekday));
}

/** One decimal below 10 (without a trailing 0), rounded with grouping separators above, e.g. "0.4", "2", "1,234" */
export function formatCount(value: number, locale: string = appLocale()): string {
  if (!Number.isFinite(value) || value >= 1e15) return "0";
  if (value < 10) return formatNumber(value, 1);
  return Math.round(value).toLocaleString(locale);
}

/** e.g. "1 elephant" or "2.5 elephants", decided by the rounded number that is shown */
export function formatCountOf(value: number, singular: string, plural: string, locale?: string): string {
  const count = formatCount(value, locale);
  return `${count} ${count === "1" ? singular : plural}`;
}
