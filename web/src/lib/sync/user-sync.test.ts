import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { makeMembers, makeUser, makeUserDTO } from "@/test/fixtures";
import { FakeServer, offline, rejected } from "./testing/fake-server";
import { UserSync } from "./user-sync";

const USER_ID = 42;
let db: GymDB;
let server: FakeServer;
let userSync: UserSync;

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  db = (await openUserDb(USER_ID))!;
  server = new FakeServer();
  userSync = new UserSync(db, server.api);
});

afterEach(async () => {
  await deleteUserDb(USER_ID);
  vi.restoreAllMocks();
});

describe("pull", () => {
  it("stores the current user, the friends and the blocked users with their flags", async () => {
    server.friends = [makeUserDTO({ id: 9, username: "friend" })];
    server.blocked = [makeUserDTO({ id: 10, username: "blocked" })];
    await userSync.pull();
    expect(await db.users.get(USER_ID)).toMatchObject({ username: "agent", isCurrentUser: true, bodyweight: 80, syncState: "synced" });
    expect(await db.users.get(9)).toMatchObject({ isFriend: true, isBlocked: false, isCurrentUser: false });
    expect(await db.users.get(10)).toMatchObject({ isFriend: false, isBlocked: true });
  });

  it("removes users that are none of them anymore, but keeps chat members with reset flags", async () => {
    server.friends = [makeUserDTO({ id: 9 }), makeUserDTO({ id: 11, username: "member" })];
    await userSync.pull();
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 11]));

    server.friends = [];
    await userSync.pull();
    expect(await db.users.get(9)).toBeUndefined();
    expect(await db.users.get(11)).toMatchObject({ isFriend: false, username: "member" });
  });

  it("loads the profiles of chat members it doesn't know yet, only once", async () => {
    server.otherUsers.set(12, makeUserDTO({ id: 12, username: "stranger" }));
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 12]));
    await userSync.pull();
    expect(await db.users.get(12)).toMatchObject({ username: "stranger", isFriend: false });
    expect(server.api.users.user).toHaveBeenCalledWith(12);

    await userSync.pull();
    expect(server.api.users.user).toHaveBeenCalledTimes(1);
  });

  it("asks for an unavailable member again only with the next full pull", async () => {
    // 13 deleted their account: GET /users/13 is a 404
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 13]));
    await userSync.pull();
    expect(await db.users.get(13)).toBeUndefined();
    expect(server.api.users.user).toHaveBeenCalledTimes(1);

    // the polls of the chats
    await userSync.loadMissingMembers();
    await userSync.loadMissingMembers();
    expect(server.api.users.user).toHaveBeenCalledTimes(1);

    server.otherUsers.set(13, makeUserDTO({ id: 13, username: "back" }));
    await userSync.pull();
    expect(server.api.users.user).toHaveBeenCalledTimes(2);
    expect(await db.users.get(13)).toMatchObject({ username: "back" });
  });

  it("fails without storing anything if a member couldn't be loaded because of the network", async () => {
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 12]));
    vi.mocked(server.api.users.user).mockRejectedValueOnce(offline());
    await expect(userSync.pull()).rejects.toMatchObject({ kind: "transport" });
    expect(await db.users.count()).toBe(0);
  });

  it("keeps the settings changed offline until they are pushed, but takes the rest of the profile", async () => {
    await userSync.pull();
    await db.users.update(USER_ID, { bodyweight: 70, syncState: "updated" });
    server.me = { ...server.me, bodyweight: 90, username: "renamed" };
    await userSync.pull();
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 70, username: "renamed", syncState: "updated", isCurrentUser: true });
  });

  it("writes only the users that changed", async () => {
    server.friends = [makeUserDTO({ id: 9 })];
    await userSync.pull();
    const bulkPut = vi.spyOn(db.users, "bulkPut");
    await userSync.pull();
    expect(bulkPut).not.toHaveBeenCalled();

    server.friends = [makeUserDTO({ id: 9, username: "new name" })];
    await userSync.pull();
    expect(bulkPut).toHaveBeenCalledTimes(1);
    expect(bulkPut.mock.calls[0][0].map((user) => user.serverId)).toEqual([9]);
  });

  it("moves the current user flag when the stored current user is another one", async () => {
    await db.users.put(makeUser({ serverId: 5, isCurrentUser: true }));
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 5]));
    await userSync.pull();
    expect(await db.users.get(5)).toMatchObject({ isCurrentUser: false });
    expect(await db.users.get(USER_ID)).toMatchObject({ isCurrentUser: true });
  });
});

describe("pullCurrentUser", () => {
  it("stores the current user, keeping unpushed settings", async () => {
    await userSync.pullCurrentUser();
    expect(await db.users.get(USER_ID)).toMatchObject({ isCurrentUser: true, bodyweight: 80 });

    await db.users.update(USER_ID, { bodyweight: 70, syncState: "updated" });
    server.me = { ...server.me, bodyweight: 90, username: "renamed" };
    await userSync.pullCurrentUser();
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 70, username: "renamed" });
  });

  it("doesn't write an unchanged user", async () => {
    await userSync.pullCurrentUser();
    const put = vi.spyOn(db.users, "put");
    await userSync.pullCurrentUser();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("loadMissingMembers", () => {
  it("does nothing without unknown members", async () => {
    await userSync.loadMissingMembers();
    expect(server.api.users.user).not.toHaveBeenCalled();
  });

  it("stores new members", async () => {
    server.otherUsers.set(12, makeUserDTO({ id: 12, username: "joined" }));
    await db.chatMembers.bulkPut(makeMembers(7, [12]));
    await userSync.loadMissingMembers();
    expect(await db.users.get(12)).toMatchObject({ username: "joined", isFriend: false, isCurrentUser: false });
  });
});

describe("refreshMembers", () => {
  it("loads the profiles of the chat's other members again and whether they are friends", async () => {
    server.friends = [makeUserDTO({ id: 9, username: "friend", profileImageUrl: "old" })];
    server.otherUsers.set(12, makeUserDTO({ id: 12, username: "stranger", profileImageUrl: "old" }));
    await userSync.pull();
    await db.chatMembers.bulkPut([...makeMembers(7, [USER_ID, 9, 12]), ...makeMembers(8, [USER_ID, 13])]);
    await userSync.loadMissingMembers();

    // 9 changed the image and isn't a friend anymore, 12 changed the image and became a friend
    server.friends = [makeUserDTO({ id: 12, username: "stranger", profileImageUrl: "new" })];
    server.otherUsers.set(9, makeUserDTO({ id: 9, username: "friend", profileImageUrl: "new" }));
    vi.mocked(server.api.users.user).mockClear();
    await userSync.refreshMembers(7);
    expect(await db.users.get(9)).toMatchObject({ profileImageUrl: "new", isFriend: false });
    expect(await db.users.get(12)).toMatchObject({ profileImageUrl: "new", isFriend: true });
    // only the members that aren't friends one by one, not the current user or the members of other chats
    expect(server.api.users.user).toHaveBeenCalledTimes(1);
    expect(server.api.users.user).toHaveBeenCalledWith(9);
  });

  it("keeps a member the server doesn't return and doesn't ask for it again until the next full pull", async () => {
    server.friends = [makeUserDTO({ id: 9, username: "friend" })];
    await userSync.pull();
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID, 9]));

    // 9 removed the friendship and blocked the current user: GET /users/9 is a 404
    server.friends = [];
    await userSync.refreshMembers(7);
    await userSync.refreshMembers(7);
    expect(await db.users.get(9)).toMatchObject({ username: "friend", isFriend: false });
    expect(server.api.users.user).toHaveBeenCalledTimes(1);
  });

  it("requests nothing without other members and throws when offline", async () => {
    await userSync.pull();
    vi.mocked(server.api.friends.friends).mockClear();
    await db.chatMembers.bulkPut(makeMembers(7, [USER_ID]));
    await userSync.refreshMembers(7);
    expect(server.api.friends.friends).not.toHaveBeenCalled();

    await db.chatMembers.bulkPut(makeMembers(7, [9]));
    vi.mocked(server.api.friends.friends).mockRejectedValueOnce(offline());
    await expect(userSync.refreshMembers(7)).rejects.toBeDefined();
  });
});

describe("pushSettings", () => {
  beforeEach(() => userSync.pull());

  it("pushes nothing without a current user or changed settings", async () => {
    expect(await userSync.pushSettings()).toBeNull();
    await db.users.clear();
    expect(await userSync.pushSettings()).toBeNull();
    expect(server.api.users.updateProfile).not.toHaveBeenCalled();
  });

  it("sends the settings and marks them as synced", async () => {
    await db.users.update(USER_ID, { bodyweight: 72.5, schemeColor: "#00FF00", syncState: "updated" });
    expect(await userSync.pushSettings()).toBeNull();
    expect(server.api.users.updateProfile).toHaveBeenCalledWith({ bodyweight: 72.5, schemeColor: "#00FF00", weightUnit: 0, distanceUnit: 0 });
    expect((await db.users.get(USER_ID))?.syncState).toBe("synced");
  });

  it("stays updated if the settings changed again while they were pushed", async () => {
    await db.users.update(USER_ID, { bodyweight: 72, syncState: "updated" });
    const update = vi.mocked(server.api.users.updateProfile);
    const original = update.getMockImplementation()!;
    update.mockImplementationOnce(async (sent) => {
      await db.users.update(USER_ID, { bodyweight: 73 });
      return original(sent);
    });
    await userSync.pushSettings();
    expect(await db.users.get(USER_ID)).toMatchObject({ bodyweight: 73, syncState: "updated" });
  });

  it("throws when offline and keeps the settings for the next push", async () => {
    await db.users.update(USER_ID, { bodyweight: 72, syncState: "updated" });
    vi.mocked(server.api.users.updateProfile).mockRejectedValueOnce(offline());
    await expect(userSync.pushSettings()).rejects.toMatchObject({ kind: "transport" });
    expect((await db.users.get(USER_ID))?.syncState).toBe("updated");
  });

  it("returns the message of rejected settings and stops pushing them", async () => {
    await db.users.update(USER_ID, { bodyweight: -1, syncState: "updated" });
    vi.mocked(server.api.users.updateProfile).mockRejectedValueOnce(rejected(422, "Invalid bodyweight"));
    expect(await userSync.pushSettings()).toBe("Your settings could not be saved: Invalid bodyweight");
    expect((await db.users.get(USER_ID))?.syncState).toBe("synced");
  });
});
