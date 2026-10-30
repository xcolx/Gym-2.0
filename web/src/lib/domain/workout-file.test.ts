import { describe, expect, it } from "vitest";

import { makeExercise, makeWorkout, makeWorkoutWithExercises } from "@/test/fixtures";
import {
  DECODING_FORMAT_MESSAGE,
  DECODING_MISSING_MESSAGE,
  exportFileName,
  iso8601String,
  NOT_A_WORKOUT_FILE_MESSAGE,
  parseCsv,
  parseIso8601,
  planWorkoutImport,
  printfFixed,
  readWorkoutFile,
  swiftDoubleJson,
  swiftNumber,
  workoutFileFromCsv,
  workoutFileFromJson,
  workoutFileFromWorkouts,
  workoutFileToCsv,
  workoutFileToJson,
  type WorkoutFile,
} from "./workout-file";

// Exercises of the account the file is imported into
const bench = makeExercise({ id: "bench", name: "Bench Press", verified: true });
const splitSquat = makeExercise({ id: "split", name: "Bulgarian Split Squat", verified: true });
const rowing = makeExercise({
  id: "rowing",
  name: "Rowing",
  verified: true,
  tracksReps: false,
  tracksWeights: false,
  tracksTime: true,
  tracksIntensity: true,
  tracksDistance: true,
});

/**
 * A file as the iOS app writes it (WorkoutFile.json(): JSONEncoder with .prettyPrinted, .sortedKeys,
 * .convertToSnakeCase and .iso8601): " : " between key and value, sorted keys, nil values left out, doubles without
 * ".0", the slash escaped, uppercase UUIDs and dates in UTC without fractional seconds.
 */
const IOS_JSON = `{
  "format" : "gym2-workouts",
  "units" : {
    "distance" : "m",
    "duration" : "min",
    "time" : "s",
    "weight" : "kg"
  },
  "version" : 1,
  "workouts" : [
    {
      "date" : "2026-10-12T16:00:00Z",
      "duration_minutes" : 62,
      "exercises" : [
        {
          "exercise" : "Bench Press",
          "sets" : [
            {
              "reps" : 10,
              "weight" : 60
            },
            {
              "reps" : 8,
              "weight" : 62.5
            }
          ],
          "unilateral" : false
        },
        {
          "exercise" : "Bulgarian Split Squat",
          "sets" : [
            {
              "reps" : 12,
              "side" : "R",
              "weight" : 22.6796185
            },
            {
              "reps" : 11,
              "side" : "L",
              "weight" : 22.6796185
            }
          ],
          "unilateral" : true
        },
        {
          "exercise" : "Rowing",
          "sets" : [
            {
              "distance" : 2000,
              "intensity" : 7.5,
              "time" : 480
            }
          ],
          "unilateral" : false
        }
      ],
      "id" : "E621E1F8-C36C-495A-93FC-0C247A3E6E5F",
      "name" : "Push\\/Pull \\"A\\""
    },
    {
      "date" : "2026-10-14T05:30:00Z",
      "duration_minutes" : 30,
      "exercises" : [
        {
          "exercise" : "Rowing",
          "sets" : [
            {
              "distance" : 0.00001,
              "intensity" : -2,
              "time" : 0
            }
          ],
          "unilateral" : false
        }
      ],
      "id" : "0A1B2C3D-4E5F-4A6B-8C7D-8E9F0A1B2C3D",
      "name" : "Cardio"
    }
  ]
}`.replace('"distance" : 0.00001', '"distance" : 1e-05');

/** The same workouts as WorkoutFile.csv() writes them */
const IOS_CSV = [
  "Workout ID;Workout;Date;Duration (min);Exercise No.;Exercise;Unilateral;Set;Side;Reps;Weight (kg);Time (s);Intensity;Distance (m)",
  'E621E1F8-C36C-495A-93FC-0C247A3E6E5F;"Push/Pull ""A""";2026-10-12T16:00:00Z;62;1;Bench Press;false;1;;10;60;;;',
  'E621E1F8-C36C-495A-93FC-0C247A3E6E5F;"Push/Pull ""A""";2026-10-12T16:00:00Z;62;1;Bench Press;false;2;;8;62.5;;;',
  'E621E1F8-C36C-495A-93FC-0C247A3E6E5F;"Push/Pull ""A""";2026-10-12T16:00:00Z;62;2;Bulgarian Split Squat;true;1;R;12;22.68;;;',
  'E621E1F8-C36C-495A-93FC-0C247A3E6E5F;"Push/Pull ""A""";2026-10-12T16:00:00Z;62;2;Bulgarian Split Squat;true;1;L;11;22.68;;;',
  'E621E1F8-C36C-495A-93FC-0C247A3E6E5F;"Push/Pull ""A""";2026-10-12T16:00:00Z;62;3;Rowing;false;1;;;;480;7.5;2000',
  "0A1B2C3D-4E5F-4A6B-8C7D-8E9F0A1B2C3D;Cardio;2026-10-14T05:30:00Z;30;1;Rowing;false;1;;;;0;-2;0",
  "",
].join("\n");

/** The local workouts the files were exported from */
function localWorkouts() {
  return [
    // Newest first, like the past workouts list passes them: the file is sorted by date
    makeWorkoutWithExercises(
      {
        clientUUID: "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
        name: "Cardio",
        date: new Date(Date.UTC(2026, 9, 14, 5, 30, 0, 999)),
        duration: 30,
      },
      [[rowing, { time: [0], intensity: [-2], distance: [0.00001] }]],
    ),
    makeWorkoutWithExercises(
      {
        clientUUID: "e621e1f8-c36c-495a-93fc-0c247a3e6e5f",
        name: 'Push/Pull "A"',
        date: new Date(Date.UTC(2026, 9, 12, 16, 0, 0, 345)),
        duration: 62,
      },
      [
        [bench, { reps: [10, 8], weights: [60, 62.5] }],
        [splitSquat, { unilateral: true, reps: [12, 11], weights: [22.6796185, 22.6796185] }],
        [rowing, { time: [480], intensity: [7.5], distance: [2000] }],
      ],
    ),
  ];
}

describe("export", () => {
  it("writes the JSON byte for byte like the iOS app", () => {
    expect(workoutFileToJson(workoutFileFromWorkouts(localWorkouts()))).toBe(IOS_JSON);
  });

  it("writes the CSV byte for byte like the iOS app", () => {
    expect(workoutFileToCsv(workoutFileFromWorkouts(localWorkouts()))).toBe(IOS_CSV);
  });

  it("writes empty lists like JSONEncoder", () => {
    const json = workoutFileToJson(workoutFileFromWorkouts([]));
    expect(json).toContain('"workouts" : [\n\n  ]');
  });

  it("names the file with the date in UTC", () => {
    expect(exportFileName("csv", new Date(Date.UTC(2026, 9, 15, 23, 30)))).toBe("Gym 2.0 Workouts 2026-10-15.csv");
    expect(exportFileName("json", new Date(Date.UTC(2026, 0, 2)))).toBe("Gym 2.0 Workouts 2026-01-02.json");
  });
});

describe("numbers and dates like Foundation", () => {
  it("formats doubles like Double.description without .0", () => {
    expect(swiftDoubleJson(60)).toBe("60");
    expect(swiftDoubleJson(62.5)).toBe("62.5");
    expect(swiftDoubleJson(0.1)).toBe("0.1");
    expect(swiftDoubleJson(0.0001)).toBe("0.0001");
    expect(swiftDoubleJson(0.00001)).toBe("1e-05");
    expect(swiftDoubleJson(-1.5e-7)).toBe("-1.5e-07");
    expect(swiftDoubleJson(999999.999)).toBe("999999.999");
    expect(swiftDoubleJson(-0)).toBe("-0");
  });

  it("rounds like printf: exact ties to even", () => {
    expect(printfFixed(0.125, 2)).toBe("0.12");
    expect(printfFixed(0.375, 2)).toBe("0.38");
    expect(printfFixed(2.5, 0)).toBe("2");
    expect(printfFixed(-1.125, 2)).toBe("-1.12");
    // Not exact ties: 1.005 is 1.00499999999999989... in binary
    expect(printfFixed(1.005, 2)).toBe("1.00");
    expect(printfFixed(22.6796185, 2)).toBe("22.68");
    expect(printfFixed(-0.001, 2)).toBe("-0.00");
    expect(swiftNumber(-0.001, 2)).toBe("-0");
    expect(swiftNumber(2000, 3)).toBe("2000");
    expect(swiftNumber(7.5, 2)).toBe("7.5");
  });

  it("writes and reads ISO 8601 dates", () => {
    expect(iso8601String(new Date(Date.UTC(2026, 9, 12, 16, 0, 0, 999)))).toBe("2026-10-12T16:00:00Z");
    expect(parseIso8601("2026-10-12T16:00:00Z")?.getTime()).toBe(Date.UTC(2026, 9, 12, 16));
    expect(parseIso8601("2026-10-12T18:00:00+02:00")?.getTime()).toBe(Date.UTC(2026, 9, 12, 16));
    expect(parseIso8601("2026-10-12T16:00:00.250Z")?.getTime()).toBe(Date.UTC(2026, 9, 12, 16, 0, 0, 250));
    expect(parseIso8601("2026-02-31T16:00:00Z")).toBeNull();
    expect(parseIso8601("12.10.26")).toBeNull();
  });
});

describe("JSON import", () => {
  it("reads the file of the iOS app", () => {
    const file = workoutFileFromJson(IOS_JSON);
    expect(file.format).toBe("gym2-workouts");
    expect(file.units).toEqual({ weight: "kg", distance: "m", time: "s", duration: "min" });
    expect(file.workouts).toHaveLength(2);
    const [push, cardio] = file.workouts;
    expect(push).toMatchObject({
      id: "E621E1F8-C36C-495A-93FC-0C247A3E6E5F",
      name: 'Push/Pull "A"',
      durationMinutes: 62,
    });
    expect(push.date.getTime()).toBe(Date.UTC(2026, 9, 12, 16));
    expect(push.exercises[1]).toEqual({
      exercise: "Bulgarian Split Squat",
      unilateral: true,
      sets: [
        { side: "R", reps: 12, weight: 22.6796185, time: null, intensity: null, distance: null },
        { side: "L", reps: 11, weight: 22.6796185, time: null, intensity: null, distance: null },
      ],
    });
    expect(cardio.exercises[0].sets[0]).toMatchObject({ distance: 0.00001, intensity: -2, time: 0, reps: null });
  });

  it("round-trips the export", () => {
    const file = workoutFileFromWorkouts(localWorkouts());
    expect(workoutFileToJson(workoutFileFromJson(workoutFileToJson(file)))).toBe(IOS_JSON);
  });

  it("fails like JSONDecoder", () => {
    expect(() => workoutFileFromJson("not json")).toThrow(DECODING_FORMAT_MESSAGE);
    expect(() => workoutFileFromJson('{"format": "gym2-workouts"}')).toThrow(DECODING_MISSING_MESSAGE);
    const withReps = (reps: string) => IOS_JSON.replace('"reps" : 10', `"reps" : ${reps}`);
    expect(() => workoutFileFromJson(withReps("10.5"))).toThrow(DECODING_FORMAT_MESSAGE);
    expect(workoutFileFromJson(withReps("10.0")).workouts[0].exercises[0].sets[0].reps).toBe(10);
    expect(workoutFileFromJson(withReps("null")).workouts[0].exercises[0].sets[0].reps).toBeNull();
    expect(() => workoutFileFromJson(IOS_JSON.replace("E621E1F8-", "nope-"))).toThrow(DECODING_FORMAT_MESSAGE);
    expect(() => workoutFileFromJson(IOS_JSON.replace("gym2-workouts", "other"))).toThrow(NOT_A_WORKOUT_FILE_MESSAGE);
  });
});

describe("CSV import", () => {
  it("reads the file of the iOS app", () => {
    const fromCsv = workoutFileFromCsv(IOS_CSV);
    // The CSV has 2 decimals for weights, otherwise it is the same file
    const fromJson = workoutFileFromJson(IOS_JSON);
    fromJson.workouts[0].exercises[1].sets.forEach((set) => (set.weight = 22.68));
    fromJson.workouts[1].exercises[0].sets[0].distance = 0;
    expect(fromCsv).toEqual(fromJson);
  });

  it("reads quoted fields, CRLF line breaks and blank lines", () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n\r\n"f\ng";h')).toEqual([["a", "b;c", 'd "e"'], [""], ["f\ng", "h"]]);
    const windows = IOS_CSV.replaceAll("\n", "\r\n");
    expect(workoutFileFromCsv(windows).workouts).toHaveLength(2);
  });

  it("fails with the messages of the iOS app", () => {
    expect(() => workoutFileFromCsv("\n \n")).toThrow("The file is empty.");
    expect(() => workoutFileFromCsv("a;b\n1;2\n")).toThrow(NOT_A_WORKOUT_FILE_MESSAGE);
    const lines = IOS_CSV.split("\n");
    expect(() => workoutFileFromCsv([lines[0], "x;y"].join("\n"))).toThrow("Row 2 doesn't have 14 columns.");
    expect(() =>
      workoutFileFromCsv([lines[0], lines[1], lines[2].replace("2026-10-12T16:00:00Z", "yesterday")].join("\n")),
    ).toThrow("Row 3 has an invalid workout id or date.");
  });

  it("reads the CSV of earlier versions", () => {
    const legacy = [
      "ID;Name;Date;Time;Exercise;Unilateral;Reps;Weight;Index",
      "E621E1F8-C36C-495A-93FC-0C247A3E6E5F;Legs;2024-09-10 18:30:00 +0000;45;Squat;false;[10, 8];[100.0, 110.5];1",
      "E621E1F8-C36C-495A-93FC-0C247A3E6E5F;Legs;2024-09-10 18:30:00 +0000;45;Lunge;true;[12, 12, 10];[20.0];0",
    ].join("\n");
    const [workout] = workoutFileFromCsv(legacy).workouts;
    expect(workout.date.getTime()).toBe(Date.UTC(2024, 8, 10, 18, 30));
    expect(workout.durationMinutes).toBe(45);
    // Sorted by the index column
    expect(workout.exercises.map((exercise) => exercise.exercise)).toEqual(["Lunge", "Squat"]);
    expect(workout.exercises[0].sets).toEqual([
      { side: "R", reps: 12, weight: 20, time: null, intensity: null, distance: null },
      { side: "L", reps: 12, weight: null, time: null, intensity: null, distance: null },
      { side: "R", reps: 10, weight: null, time: null, intensity: null, distance: null },
    ]);
    expect(workout.exercises[1].sets.map((set) => [set.reps, set.weight])).toEqual([
      [10, 100],
      [8, 110.5],
    ]);
  });
});

describe("readWorkoutFile", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("detects JSON by the extension or the first character", () => {
    expect(readWorkoutFile("export.json", bytes(IOS_JSON)).workouts).toHaveLength(2);
    expect(readWorkoutFile("export.txt", bytes(`\n  ${IOS_JSON}`)).workouts).toHaveLength(2);
    expect(readWorkoutFile("export.csv", bytes(IOS_CSV)).workouts).toHaveLength(2);
    expect(readWorkoutFile("export", bytes(`\uFEFF${IOS_CSV}`)).workouts).toHaveLength(2);
  });

  it("refuses files that aren't UTF-8", () => {
    expect(() => readWorkoutFile("export.csv", new Uint8Array([0x57, 0xff, 0xfe]))).toThrow("Could not read the file.");
  });
});

describe("planWorkoutImport", () => {
  const file = (): WorkoutFile => workoutFileFromJson(IOS_JSON);

  it("creates the workouts with the metrics the exercises track", () => {
    const plan = planWorkoutImport(file(), [bench, splitSquat, rowing], []);
    expect(plan.existingCount).toBe(0);
    expect(plan.missingExerciseNames).toEqual([]);
    expect(plan.invalidWorkouts).toEqual([]);
    expect(plan.workouts).toHaveLength(2);
    const [push] = plan.workouts;
    expect(push.name).toBe('Push/Pull "A"');
    expect(push.duration).toBe(62);
    expect(push.exercises).toEqual([
      {
        exerciseId: "bench",
        unilateral: false,
        sets: { reps: [10, 8], weights: [60, 62.5], time: null, intensity: null, distance: null },
      },
      {
        exerciseId: "split",
        unilateral: true,
        sets: { reps: [12, 11], weights: [22.6796185, 22.6796185], time: null, intensity: null, distance: null },
      },
      {
        exerciseId: "rowing",
        unilateral: false,
        sets: { reps: null, weights: null, time: [480], intensity: [7.5], distance: [2000] },
      },
    ]);
  });

  it("leaves out missing exercises, and values the exercise doesn't track are dropped or 0", () => {
    const timedBench = makeExercise({ id: "timed", name: "Bench Press", tracksTime: true });
    const plan = planWorkoutImport(file(), [timedBench], []);
    expect(plan.missingExerciseNames).toEqual(["Bulgarian Split Squat", "Rowing"]);
    // The cardio workout has no exercise left
    expect(plan.workouts).toHaveLength(1);
    expect(plan.workouts[0].exercises).toEqual([
      {
        exerciseId: "timed",
        unilateral: false,
        sets: { reps: [10, 8], weights: [60, 62.5], time: [0, 0], intensity: null, distance: null },
      },
    ]);
  });

  it("prefers verified exercises with the same name", () => {
    const custom = makeExercise({ id: "custom", name: "Bench Press", verified: false });
    const plan = planWorkoutImport(file(), [custom, bench, splitSquat, rowing], []);
    expect(plan.workouts[0].exercises[0].exerciseId).toBe("bench");
  });

  it("skips workouts that exist by UUID or by name and start", () => {
    const sameUUID = makeWorkout({ clientUUID: "e621e1f8-c36c-495a-93fc-0c247a3e6e5f", name: "Renamed" });
    const imported = makeWorkout({ name: "Cardio", date: new Date(Date.UTC(2026, 9, 14, 5, 30, 0, 600)) });
    const plan = planWorkoutImport(file(), [bench, splitSquat, rowing], [sameUUID, imported]);
    expect(plan.existingCount).toBe(2);
    expect(plan.workouts).toEqual([]);
  });

  it("refuses workouts with values the server doesn't accept", () => {
    const tooHeavy = file();
    tooHeavy.workouts[0].exercises[0].sets[0].weight = 10_000;
    const plan = planWorkoutImport(tooHeavy, [bench, splitSquat, rowing], [], "en-US");
    expect(plan.invalidWorkouts).toEqual(['Push/Pull "A" (Oct 12, 2026)']);
    expect(plan.workouts.map((workout) => workout.name)).toEqual(["Cardio"]);

    const tooManySets = file();
    tooManySets.workouts[1].exercises[0].sets = Array.from({ length: 101 }, () => ({
      ...tooManySets.workouts[1].exercises[0].sets[0],
    }));
    expect(planWorkoutImport(tooManySets, [bench, splitSquat, rowing], [], "en-US").invalidWorkouts).toEqual([
      "Cardio (Oct 14, 2026)",
    ]);
  });

  it("completes unilateral sets, shortens names and clamps the duration", () => {
    const changed = file();
    const push = changed.workouts[0];
    push.name = "A very long workout name that the server refuses";
    push.durationMinutes = 2000;
    push.exercises[1].sets.pop();
    const plan = planWorkoutImport(changed, [bench, splitSquat, rowing], []);
    expect(plan.workouts[0].name).toBe("A very long workout name ");
    expect(plan.workouts[0].duration).toBe(1440);
    expect(plan.workouts[0].exercises[1].sets.reps).toEqual([12, 0]);
    expect(plan.workouts[0].exercises[1].sets.weights).toEqual([22.6796185, 0]);
  });
});
