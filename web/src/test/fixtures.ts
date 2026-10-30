import type { ChatDTO, MessageDTO, UserDTO } from "@/lib/api";
import type {
  Chat,
  ChatMember,
  Equipment,
  Exercise,
  Muscle,
  MuscleGroup,
  ReferenceData,
  User,
  Workout,
  WorkoutExercise,
  WorkoutExerciseWithExercise,
  WorkoutWithExercises,
} from "@/types/models";

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: nextId("exercise"),
    serverId: null,
    syncState: "created",
    clientUUID: nextId("uuid"),
    name: "Bench Press",
    aliases: [],
    exerciseDescription: null,
    imageUrls: [],
    pendingImages: [],
    muscleGroupId: 1,
    equipmentId: 1,
    primaryMuscleIds: [],
    secondaryMuscleIds: [],
    verified: false,
    tracksReps: true,
    tracksWeights: true,
    tracksTime: false,
    tracksIntensity: false,
    tracksDistance: false,
    ...overrides,
  };
}

export function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: nextId("workout"),
    serverId: null,
    syncState: "created",
    clientUUID: nextId("uuid"),
    name: "Push",
    date: new Date(2026, 9, 12, 18, 0),
    duration: 60,
    inProgress: false,
    ...overrides,
  };
}

export function makeWorkoutExercise(overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    id: nextId("workoutExercise"),
    serverId: null,
    syncState: "created",
    clientUUID: nextId("uuid"),
    workoutId: "workout",
    exerciseId: null,
    unilateral: false,
    index: 0,
    reps: [],
    weights: [],
    time: null,
    intensity: null,
    distance: null,
    ...overrides,
  };
}

/** A workout with its exercises, each `[exercise, sets]` */
export function makeWorkoutWithExercises(
  workout: Partial<Workout>,
  exercises: [Exercise, Partial<WorkoutExercise>][],
): WorkoutWithExercises {
  const base = makeWorkout(workout);
  const workoutExercises: WorkoutExerciseWithExercise[] = exercises.map(([exercise, sets], index) => ({
    ...makeWorkoutExercise({
      workoutId: base.id,
      exerciseId: exercise.id,
      index,
      reps: exercise.tracksReps ? [] : null,
      weights: exercise.tracksWeights ? [] : null,
      time: exercise.tracksTime ? [] : null,
      intensity: exercise.tracksIntensity ? [] : null,
      distance: exercise.tracksDistance ? [] : null,
      ...sets,
    }),
    exercise,
  }));
  return { ...base, workoutExercises };
}

export const muscles: Muscle[] = [
  { serverId: 1, name: "Chest", imageUrl: "" },
  { serverId: 2, name: "Triceps", imageUrl: "" },
  { serverId: 3, name: "Front Deltoid", imageUrl: "" },
  { serverId: 4, name: "Quads", imageUrl: "" },
];

export const muscleGroups: MuscleGroup[] = [
  { serverId: 1, name: "Chest" },
  { serverId: 2, name: "Legs" },
];

export const equipment: Equipment[] = [
  { serverId: 1, name: "Barbell" },
  { serverId: 2, name: "Body" },
  { serverId: 3, name: "Pull Up Bar" },
];

export const reference: ReferenceData = {
  muscles: new Map(muscles.map((m) => [m.serverId, m])),
  muscleGroups: new Map(muscleGroups.map((g) => [g.serverId, g])),
  equipment: new Map(equipment.map((e) => [e.serverId, e])),
};

// MARK: - Users and chats

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    serverId: 9,
    syncState: "synced",
    username: "friend",
    profileImageUrl: "",
    profileIconUrl: "",
    language: null,
    email: null,
    createdAt: null,
    bodyweight: null,
    schemeColor: null,
    weightUnit: null,
    distanceUnit: null,
    isCurrentUser: false,
    isFriend: false,
    isBlocked: false,
    ...overrides,
  };
}

/** A user as the server returns it (GET /users/{id}) */
export function makeUserDTO(overrides: Partial<UserDTO> = {}): UserDTO {
  return {
    id: 9,
    username: "friend",
    email: null,
    profileImageUrl: "",
    profileIconUrl: "",
    bodyweight: null,
    schemeColor: "#00FF00",
    weightUnit: 0,
    distanceUnit: 0,
    language: "en",
    createdAt: "2026-10-01T10:00:00+00:00",
    ...overrides,
  };
}

export function makeMessageDTO(overrides: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 1,
    chatId: 7,
    senderId: 9,
    createdAt: "2026-10-15T08:00:00+00:00",
    content: "Hi",
    imageUrl: null,
    ...overrides,
  };
}

/** A chat as the server returns it, by default the group 7 of the users 42 and 9 without messages */
export function makeChatDTO(overrides: Partial<ChatDTO> = {}): ChatDTO {
  return {
    id: 7,
    groupChat: true,
    name: "Gym",
    imageUrl: null,
    createdAt: "2026-10-01T10:00:00+00:00",
    createdBy: 42,
    public: false,
    latestMessageTimestamp: null,
    latestMessagePreview: null,
    latestMessageSenderId: null,
    members: [
      { userId: 42, lastReadMessageId: 0, admin: null },
      { userId: 9, lastReadMessageId: 0, admin: null },
    ],
    messages: [],
    ...overrides,
  };
}

/** A stored chat, by default a direct chat */
export function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    serverId: 7,
    groupChat: false,
    name: null,
    imageUrl: null,
    createdAt: new Date(2026, 9, 1, 12, 0),
    createdById: 42,
    isPublic: false,
    latestMessageTimestamp: null,
    latestMessagePreview: null,
    latestMessageSenderId: null,
    input: "",
    inputUUID: null,
    ...overrides,
  };
}

export function makeMembers(chatId: number, userIds: number[]): ChatMember[] {
  return userIds.map((userId) => ({ chatId, userId, lastReadMessageId: 0, admin: null }));
}
