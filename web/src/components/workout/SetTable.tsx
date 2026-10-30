"use client";

// Port of ios/Gym 2.0/Features/Workout/Sets/NumberInsertView.swift

import { useState } from "react";

import {
  displaySetInput,
  setInputChange,
  setInputHeader,
  setInputMode,
  setInputPlaceholder,
  setLabel,
  toggleSign,
  type SetInputUnits,
} from "@/lib/domain/set-input";
import { formatStopwatch, isStopwatchRunning, stopwatchElapsed } from "@/lib/domain/stopwatch";
import { entryCount, trackedMetrics, valueOf } from "@/lib/domain/workout-exercise";
import { useUserSettings } from "@/lib/repo/hooks";
import { UnitSystem, type LocalId, type SetMetric, type WorkoutExercise } from "@/types/models";
import { storedSetActions, type SetActions } from "@/components/workout/set-actions";
import { useNow } from "@/lib/use-now";
import { AccessoryButton, KeyboardAccessory } from "@/components/workout/KeyboardAccessory";
import {
  pauseSetStopwatch,
  startSetStopwatch,
  stopSetStopwatch,
  useStopwatch,
  type StopwatchKey,
} from "@/components/workout/stopwatch-store";

interface Field {
  metric: SetMetric;
  entryIndex: number;
}

/** The text of the focused field while it is edited */
interface Draft extends Field {
  text: string;
}

const sameField = (a: Field | null, b: Field) => a !== null && a.metric === b.metric && a.entryIndex === b.entryIndex;

export function SetTable({
  workoutExercise,
  stopwatchWorkoutId,
  actions = storedSetActions,
}: {
  workoutExercise: WorkoutExercise;
  /** The workout in progress the stopwatches of the time fields belong to, no stopwatch without it */
  stopwatchWorkoutId?: LocalId;
  /** Where the values go, stored right away by default */
  actions?: SetActions;
}) {
  const settings = useUserSettings();
  const units: SetInputUnits = {
    weightUnit: settings?.weightUnit ?? UnitSystem.metric,
    distanceUnit: settings?.distanceUnit ?? UnitSystem.metric,
  };
  const [draft, setDraft] = useState<Draft | null>(null);

  const count = entryCount(workoutExercise);
  const metrics = trackedMetrics(workoutExercise);
  // Smaller fields when there are many columns
  const fieldFont = metrics.length <= 2 ? "text-title2" : "text-headline";
  const active = draft && draft.entryIndex < count && metrics.includes(draft.metric) ? draft : null;

  const stored = (field: Field) => valueOf(workoutExercise, field.metric, field.entryIndex);
  const shown = (field: Field) => displaySetInput(stored(field), field.metric, units);

  // Takes the text over if it is valid, otherwise the field shows the stored value again
  const textChanged = (field: Field, text: string) => {
    const change = setInputChange(text, field.metric, stored(field), units);
    if (change.kind === "revert") {
      setDraft({ ...field, text: shown(field) });
      return;
    }
    setDraft({ ...field, text });
    if (change.kind === "set") actions.setValue(workoutExercise.id, field.metric, field.entryIndex, change.value);
  };

  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-my-black/80 p-2.5">
      <div className="flex gap-2">
        <div className="flex shrink-0 flex-col items-stretch">
          <div className="flex h-[35px] items-center justify-center">Set</div>
          {Array.from({ length: count }, (_, entryIndex) => (
            <div
              key={entryIndex}
              className={`flex h-11 items-center whitespace-pre ${
                workoutExercise.unilateral && entryIndex % 2 === 1 ? "justify-end" : "justify-center"
              } ${entryIndex > 0 ? "mt-1.5" : ""}`}
            >
              {setLabel(entryIndex, workoutExercise.unilateral)}
            </div>
          ))}
        </div>

        {metrics.map((metric) => (
          <div key={metric} className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[35px] items-center justify-center truncate text-center">{setInputHeader(metric, units)}</div>
            {Array.from({ length: count }, (_, entryIndex) => {
              const field = { metric, entryIndex };
              return (
                <input
                  key={entryIndex}
                  type="text"
                  inputMode={setInputMode(metric)}
                  enterKeyHint="done"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={`${setInputHeader(metric, units)} of set ${setLabel(entryIndex, workoutExercise.unilateral).trim()}`}
                  placeholder={setInputPlaceholder(metric)}
                  value={sameField(active, field) ? active!.text : shown(field)}
                  onFocus={() => setDraft({ ...field, text: shown(field) })}
                  // The field shows the value formatted once it is left, e.g. "90" as "1:30" or "10000" as "10'000"
                  onBlur={() => setDraft((current) => (sameField(current, field) ? null : current))}
                  onChange={(event) => textChanged(field, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className={`h-11 w-full min-w-0 rounded-[10px] bg-field text-center outline-none placeholder:text-secondary-label focus:ring-2 focus:ring-app ${fieldFont} ${
                    entryIndex > 0 ? "mt-1.5" : ""
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* The decimal keyboard has no minus key on every device, only the intensity can be negative */}
      {active?.metric === "intensity" && (
        <KeyboardAccessory>
          <AccessoryButton aria-label="Change the sign" className="text-title2" onClick={() => textChanged(active, toggleSign(active.text))}>
            ±
          </AccessoryButton>
        </KeyboardAccessory>
      )}
      {active?.metric === "time" && stopwatchWorkoutId && (
        <KeyboardAccessory>
          <StopwatchBar
            stopwatchKey={{ workoutId: stopwatchWorkoutId, workoutExerciseId: workoutExercise.id, entryIndex: active.entryIndex }}
            fieldSeconds={stored(active) ?? 0}
            onStop={(seconds) => {
              actions.setValue(workoutExercise.id, "time", active.entryIndex, seconds);
              setDraft({ ...active, text: displaySetInput(seconds, "time", units) });
            }}
          />
        </KeyboardAccessory>
      )}
    </div>
  );
}

/** Start at 0, pause and stop while running, resume and stop while paused. Stop takes the measured time over. */
function StopwatchBar({
  stopwatchKey,
  fieldSeconds,
  onStop,
}: {
  stopwatchKey: StopwatchKey;
  fieldSeconds: number;
  onStop: (seconds: number) => void;
}) {
  const stopwatch = useStopwatch(stopwatchKey, fieldSeconds);
  const running = isStopwatchRunning(stopwatch);
  const now = useNow(100);
  const stop = () => onStop(stopSetStopwatch(stopwatchKey, fieldSeconds));

  return (
    <>
      <span className="flex-1 font-semibold tabular-nums">{formatStopwatch(stopwatchElapsed(stopwatch, running ? now : 0))}</span>
      {running ? (
        <>
          <AccessoryButton onClick={() => pauseSetStopwatch(stopwatchKey, fieldSeconds)}>Pause</AccessoryButton>
          <AccessoryButton onClick={stop}>Stop</AccessoryButton>
        </>
      ) : stopwatch.accumulated > 0 ? (
        <>
          <AccessoryButton onClick={() => startSetStopwatch(stopwatchKey, fieldSeconds)}>Resume</AccessoryButton>
          <AccessoryButton onClick={stop}>Stop</AccessoryButton>
        </>
      ) : (
        <AccessoryButton onClick={() => startSetStopwatch(stopwatchKey, fieldSeconds)}>Start</AccessoryButton>
      )}
    </>
  );
}
