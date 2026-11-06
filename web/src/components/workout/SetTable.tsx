"use client";

// Port of ios/Gym 2.0/Features/Workout/Sets/NumberInsertView.swift

import { useLayoutEffect, useRef, useState } from "react";

import {
  displaySetInput,
  setInputChange,
  setInputHeader,
  setInputMode,
  setInputPlaceholder,
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

const ROW_HEIGHT = 40;
const ROW_SPACING = 6;
// between the sets of a unilateral exercise, more than between its two sides
const PAIR_SPACING = 12;
const MAX_VISIBLE_ROWS = 4;
const SET_COLUMN = 36;
const SET_COLUMN_UNILATERAL = 52;

/** Four rows, or two sets of a unilateral exercise with both sides */
function rowsHeight(count: number, unilateral: boolean): number {
  const rows = Math.max(1, Math.min(count, MAX_VISIBLE_ROWS));
  if (unilateral) {
    const pairs = Math.max(1, Math.trunc((rows + 1) / 2));
    return pairs * (2 * ROW_HEIGHT + ROW_SPACING) + (pairs - 1) * PAIR_SPACING;
  }
  return rows * ROW_HEIGHT + (rows - 1) * ROW_SPACING;
}

export function SetTable({
  workoutExercise,
  stopwatchWorkoutId,
  limitsRows = true,
  actions = storedSetActions,
}: {
  workoutExercise: WorkoutExercise;
  /** In the workout in progress: at most four rows, more scroll. Editing a past workout shows all of them. */
  limitsRows?: boolean;
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
  const fieldFont = metrics.length <= 2 ? "text-title3 font-semibold" : "text-headline font-semibold";
  const active = draft && draft.entryIndex < count && metrics.includes(draft.metric) ? draft : null;

  // The last sets are shown, and an added set scrolls into view
  const scroller = useRef<HTMLDivElement>(null);
  const previousCount = useRef(count);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && count >= previousCount.current) element.scrollTop = element.scrollHeight;
    previousCount.current = count;
  }, [count]);

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

  const fieldLabel = (field: Field) => {
    const header = setInputHeader(field.metric, units);
    if (!workoutExercise.unilateral) return `${header} of set ${field.entryIndex + 1}`;
    return `${header} of set ${Math.trunc(field.entryIndex / 2) + 1}, ${field.entryIndex % 2 === 0 ? "right" : "left"}`;
  };

  const input = (field: Field) => (
    <input
      key={field.metric}
      type="text"
      inputMode={setInputMode(field.metric)}
      enterKeyHint="done"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      aria-label={fieldLabel(field)}
      placeholder={setInputPlaceholder(field.metric)}
      value={sameField(active, field) ? active!.text : shown(field)}
      onFocus={() => setDraft({ ...field, text: shown(field) })}
      // The field shows the value formatted once it is left, e.g. "90" as "1:30" or "10000" as "10'000"
      onBlur={() => setDraft((current) => (sameField(current, field) ? null : current))}
      onChange={(event) => textChanged(field, event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={`h-10 w-full min-w-0 rounded-[10px] bg-field/40 text-center font-rounded tabular-nums outline-none placeholder:text-[15px] placeholder:font-normal placeholder:text-secondary-label focus:ring-2 focus:ring-inset focus:ring-app ${fieldFont}`}
    />
  );

  const fields = (entryIndex: number) => (
    <div className="flex min-w-0 flex-1 gap-2">{metrics.map((metric) => input({ metric, entryIndex }))}</div>
  );

  const rows = workoutExercise.unilateral ? (
    <div className="flex flex-col gap-3">
      {Array.from({ length: Math.trunc(count / 2) }, (_, pair) => (
        // One number for both sides, the sides next to their fields
        <div key={pair} className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1" style={{ width: SET_COLUMN_UNILATERAL }}>
            <SetNumber number={pair + 1} />
            <div className="flex flex-col gap-1.5 text-caption1 font-bold text-secondary-label" aria-hidden>
              <span className="flex h-10 w-4 items-center justify-center">R</span>
              <span className="flex h-10 w-4 items-center justify-center">L</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {fields(pair * 2)}
            {fields(pair * 2 + 1)}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: count }, (_, entryIndex) => (
        <div key={entryIndex} className="flex items-center gap-2">
          <div className="flex shrink-0 justify-center" style={{ width: SET_COLUMN }}>
            <SetNumber number={entryIndex + 1} />
          </div>
          {fields(entryIndex)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-5 items-center gap-2 text-caption1 font-semibold text-secondary-label">
        <span className="shrink-0 text-center" style={{ width: workoutExercise.unilateral ? SET_COLUMN_UNILATERAL : SET_COLUMN }}>
          Set
        </span>
        {metrics.map((metric) => (
          <span key={metric} className="min-w-0 flex-1 truncate text-center">
            {setInputHeader(metric, units)}
          </span>
        ))}
      </div>

      {limitsRows ? (
        // At most four rows are shown, more scroll, so that the buttons below stay in place
        <div ref={scroller} className="overflow-y-auto overscroll-y-contain" style={{ height: rowsHeight(count, workoutExercise.unilateral) }}>
          {rows}
        </div>
      ) : (
        rows
      )}

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

function SetNumber({ number }: { number: number }) {
  return (
    <span
      className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-app/15 text-subheadline font-semibold tabular-nums text-app"
      aria-label={`Set ${number}`}
    >
      {number}
    </span>
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
