import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExerciseDraft } from "../dto";
import { aiApi } from "./ai";
import { authApi } from "./auth";
import { chatApi } from "./chat";
import { exerciseApi } from "./exercises";
import { reportApi } from "./reports";
import { friendApi, userApi } from "./users";
import { workoutSchemeApi } from "./workout-schemes";
import { workoutApi } from "./workouts";

let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const request = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index];
  return { url, method: init?.method, body: init?.body };
};
const json = (index = 0) => JSON.parse(request(index).body as string) as unknown;
const form = (index = 0) => request(index).body as FormData;

const image = { data: new Blob(["x"]), filename: "image.jpg", mimeType: "image/jpeg" };

describe("paths and methods", () => {
  it.each([
    ["chats", () => chatApi.all(), "GET", "/api/v1/chats"],
    ["chat delta", () => chatApi.changes("5"), "GET", "/api/v1/chats/delta?last_sync_time=5"],
    ["public chats", () => chatApi.publicChats(), "GET", "/api/v1/chats/public"],
    ["direct chat", () => chatApi.createDirectChat(9), "POST", "/api/v1/chats"],
    ["group chat", () => chatApi.createGroupChat("Crew", [9]), "POST", "/api/v1/chats/groups"],
    ["update group", () => chatApi.updateGroupChat(7, "Crew"), "PATCH", "/api/v1/chats/7"],
    ["delete group image", () => chatApi.deleteGroupChatImage(7), "DELETE", "/api/v1/chats/7/image"],
    ["delete chat", () => chatApi.deleteChat(7), "DELETE", "/api/v1/chats/7"],
    ["visibility", () => chatApi.setPublic(true, 7), "PATCH", "/api/v1/chats/7/visibility"],
    ["add members", () => chatApi.addMembers(7, [9]), "POST", "/api/v1/chats/7/members"],
    ["remove member", () => chatApi.removeMember(9, 7), "DELETE", "/api/v1/chats/7/members/9"],
    ["admin", () => chatApi.setAdmin(true, 9, 7), "PATCH", "/api/v1/chats/7/members/9"],
    ["join", () => chatApi.join(7), "POST", "/api/v1/chats/7/members/me"],
    ["send message", () => chatApi.sendMessage(7, { text: "Hi" }), "POST", "/api/v1/chats/7/messages"],
    ["delete message", () => chatApi.deleteMessage(3), "DELETE", "/api/v1/chats/messages/3"],
    ["mark read", () => chatApi.markRead(7, 3), "PUT", "/api/v1/chats/7/read-marker"],
    ["me", () => userApi.me(), "GET", "/api/v1/users/me"],
    ["user", () => userApi.user(9), "GET", "/api/v1/users/9"],
    ["lookup", () => userApi.lookup("anna b"), "GET", "/api/v1/users?username=anna+b"],
    ["profile image", () => userApi.updateProfileImage(image), "PUT", "/api/v1/users/me/profile-image"],
    ["delete profile image", () => userApi.deleteProfileImage(), "DELETE", "/api/v1/users/me/profile-image"],
    ["takeout", () => userApi.dataTakeout(), "GET", "/api/v1/users/me/takeout"],
    ["friends", () => friendApi.friends(), "GET", "/api/v1/users/me/friends"],
    ["remove friend", () => friendApi.removeFriend(9), "DELETE", "/api/v1/users/me/friends/9"],
    ["requests", () => friendApi.friendRequests(), "GET", "/api/v1/users/me/friend-requests"],
    ["sent requests", () => friendApi.sentFriendRequests(), "GET", "/api/v1/users/me/friend-requests/sent"],
    ["send request", () => friendApi.sendFriendRequest(9), "POST", "/api/v1/users/me/friend-requests/9"],
    ["answer request", () => friendApi.answerFriendRequest(9, true), "PATCH", "/api/v1/users/me/friend-requests/9"],
    ["delete request", () => friendApi.deleteFriendRequest(9), "DELETE", "/api/v1/users/me/friend-requests/9"],
    ["blocked", () => friendApi.blockedUsers(), "GET", "/api/v1/users/me/blocked-users"],
    ["block", () => friendApi.block(9), "PUT", "/api/v1/users/me/blocked-users/9"],
    ["unblock", () => friendApi.unblock(9), "DELETE", "/api/v1/users/me/blocked-users/9"],
    ["exercises", () => exerciseApi.all(), "GET", "/api/v1/exercises"],
    ["exercise delta", () => exerciseApi.changes("t"), "GET", "/api/v1/exercises/delta?last_sync_time=t"],
    ["delete exercise", () => exerciseApi.delete(4), "DELETE", "/api/v1/exercises/4"],
    ["equipment", () => exerciseApi.equipment(), "GET", "/api/v1/exercises/equipment"],
    ["muscle groups", () => exerciseApi.muscleGroups(), "GET", "/api/v1/exercises/muscle-groups"],
    ["muscles", () => exerciseApi.muscles(), "GET", "/api/v1/exercises/muscles"],
    ["workouts", () => workoutApi.all(), "GET", "/api/v1/workouts"],
    ["workout delta", () => workoutApi.changes("t"), "GET", "/api/v1/workouts/delta?last_sync_time=t"],
    ["update workout", () => workoutApi.update(3, { name: "Legs" }), "PATCH", "/api/v1/workouts/3"],
    ["delete workout", () => workoutApi.delete(3), "DELETE", "/api/v1/workouts/3"],
    ["delete workout exercise", () => workoutApi.deleteExercise(8), "DELETE", "/api/v1/workout-exercises/8"],
    ["schemes", () => workoutSchemeApi.all(), "GET", "/api/v1/workout-schemes"],
    ["scheme delta", () => workoutSchemeApi.changes("t"), "GET", "/api/v1/workout-schemes/delta?last_sync_time=t"],
    ["update scheme", () => workoutSchemeApi.update(2, { name: "Push" }), "PATCH", "/api/v1/workout-schemes/2"],
    ["scheme performed", () => workoutSchemeApi.markPerformed(2), "POST", "/api/v1/workout-schemes/2/performances"],
    ["delete scheme", () => workoutSchemeApi.delete(2), "DELETE", "/api/v1/workout-schemes/2"],
    ["ai conversations", () => aiApi.conversations(), "GET", "/api/v1/ai/conversations"],
    ["ai conversation", () => aiApi.conversation(1), "GET", "/api/v1/ai/conversations/1"],
    ["new ai conversation", () => aiApi.createConversation(), "POST", "/api/v1/ai/conversations"],
    ["rename ai conversation", () => aiApi.renameConversation(1, "Plan"), "PATCH", "/api/v1/ai/conversations/1"],
    ["delete ai conversation", () => aiApi.deleteConversation(1), "DELETE", "/api/v1/ai/conversations/1"],
    ["report", () => reportApi.report({ reportedUserId: 9 }, "Spam"), "POST", "/api/v1/reports"],
    ["logout", () => authApi.logout(), "POST", "/api/v1/auth/logout"],
  ] as const)("%s", async (_name, call, method, url) => {
    await call();
    expect(request()).toMatchObject({ method, url });
  });
});

describe("JSON bodies", () => {
  it("sends snake_case keys and leaves out unset fields", async () => {
    await chatApi.markRead(7, 12);
    expect(json()).toEqual({ message_id: 12 });

    await chatApi.addMembers(7, [1, 2]);
    expect(json(1)).toEqual({ user_ids: [1, 2] });

    await friendApi.answerFriendRequest(9, false);
    expect(json(2)).toEqual({ status: false });

    await userApi.changePassword("old", "new");
    expect(json(3)).toEqual({ current_password: "old", new_password: "new" });

    await workoutApi.update(3, { name: "Legs", duration: undefined });
    expect(json(4)).toEqual({ name: "Legs" });
  });

  it("sends the changes of the workout exercises with the workout in one request", async () => {
    await workoutApi.update(3, {
      inProgress: false,
      exerciseChanges: [
        { op: "create", clientUuid: "u", exerciseId: 1, unilateral: false, index: 0, reps: [5], weights: null, time: null, intensity: null, distance: null },
        { op: "update", id: 8, index: 1, reps: [8, 8] },
      ],
    });
    expect(request()).toMatchObject({ url: "/api/v1/workouts/3", method: "PATCH" });
    expect(json()).toEqual({
      in_progress: false,
      exercise_changes: [
        { op: "create", client_uuid: "u", exercise_id: 1, unilateral: false, index: 0, reps: [5] },
        { op: "update", id: 8, index: 1, reps: [8, 8] },
      ],
    });
  });

  it("logs in and signs up as the web client", async () => {
    await authApi.loginWithEmail("a@example.com", "pw");
    expect(json()).toEqual({ client: "web", email: "a@example.com", password: "pw" });
    await authApi.signUpWithEmail("a@example.com", "pw", "anna");
    expect(json(1)).toEqual({ client: "web", email: "a@example.com", password: "pw", username: "anna" });
  });

  it("sends the AI message with its client UUID, a new conversation without title", async () => {
    await aiApi.send("Hi", 4, "uuid");
    expect(request()).toMatchObject({ url: "/api/v1/ai/conversations/4/messages", method: "POST" });
    expect(json()).toEqual({ content: "Hi", client_uuid: "uuid" });
    await aiApi.createConversation();
    expect(json(1)).toEqual({});
  });

  it("reports only the given ids", async () => {
    await reportApi.report({ reportedMessageId: 3 }, "Spam");
    expect(json()).toEqual({ reported_message_id: 3, reason: "Spam" });
  });
});

describe("form bodies", () => {
  it("sends a chat message with its client UUID and the photo, without empty fields", async () => {
    await chatApi.sendMessage(7, { text: "Hi", clientUuid: "uuid" });
    expect(request()).toMatchObject({ url: "/api/v1/chats/7/messages", method: "POST" });
    expect([...form().keys()]).toEqual(["client_uuid", "content"]);
    expect(form().get("content")).toBe("Hi");

    await chatApi.sendMessage(7, { text: null, image, clientUuid: "uuid2" });
    expect([...form(1).keys()]).toEqual(["client_uuid", "image"]);
    expect((form(1).get("image") as File).name).toBe("image.jpg");
  });

  it("creates a group with repeated member ids and the public flag", async () => {
    await chatApi.createGroupChat("Crew", [1, 2]);
    expect(form().getAll("user_ids")).toEqual(["1", "2"]);
    expect(form().get("public")).toBe("false");
    expect(form().has("image")).toBe(false);
  });

  const draft: ExerciseDraft = {
    clientUuid: "uuid",
    name: "Fly",
    aliases: ["A", "B"],
    description: null,
    imageUrls: ["kept"],
    muscleGroupId: 1,
    equipmentId: 2,
    primaryMuscleIds: [1, 2],
    secondaryMuscleIds: [],
    reps: true,
    weights: false,
    time: false,
    intensity: false,
    distance: false,
  };

  it("sends the kept images of an exercise only with an update", async () => {
    await exerciseApi.create(draft, [image, image]);
    expect(request()).toMatchObject({ url: "/api/v1/exercises", method: "POST" });
    expect(form().has("image_urls")).toBe(false);
    expect(form().has("description")).toBe(false);
    expect(form().getAll("aliases")).toEqual(["A", "B"]);
    expect(form().getAll("images")).toHaveLength(2);
    expect(form().get("weights")).toBe("false");

    await exerciseApi.update(4, draft);
    expect(request(1)).toMatchObject({ url: "/api/v1/exercises/4", method: "PUT" });
    expect(form(1).getAll("image_urls")).toEqual(["kept"]);
    expect(form(1).has("images")).toBe(false);
  });

  it("uploads the profile image as file", async () => {
    await userApi.updateProfileImage(image);
    expect((form().get("file") as File).type).toBe("image/jpeg");
  });
});
