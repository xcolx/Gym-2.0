import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserDb, openUserDb, type GymDB } from "@/lib/db";
import { makeUser } from "@/test/fixtures";
import { changeUsername, removeProfileImage, uploadProfileImage } from "./settings-feature";

const USER_ID = 42;
let db: GymDB;

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(body === null ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  db = (await openUserDb(USER_ID))!;
  await db.users.put(makeUser({ serverId: USER_ID, isCurrentUser: true, username: "old", profileImageUrl: "img", profileIconUrl: "icon" }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await deleteUserDb(USER_ID);
});

const image = { data: new Blob(["x"]), filename: "image.jpg", mimeType: "image/jpeg" };

describe("account settings", () => {
  it("stores the hashes of an uploaded profile image", async () => {
    const fetchMock = respond(200, { image_url: "new-img", icon_url: "new-icon" });
    await uploadProfileImage(USER_ID, image);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/users/me/profile-image");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
    expect(await db.users.get(USER_ID)).toMatchObject({ profileImageUrl: "new-img", profileIconUrl: "new-icon", syncState: "synced" });
  });

  it("keeps the stored image if the server returned no hashes", async () => {
    respond(200, { image_url: null, icon_url: null });
    await uploadProfileImage(USER_ID, image);
    expect(await db.users.get(USER_ID)).toMatchObject({ profileImageUrl: "img", profileIconUrl: "icon" });
  });

  it("clears the hashes after removing the profile image", async () => {
    const fetchMock = respond(204, null);
    await removeProfileImage(USER_ID);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    expect(await db.users.get(USER_ID)).toMatchObject({ profileImageUrl: "", profileIconUrl: "" });
  });

  it("stores a new username only after the server accepted it", async () => {
    const fetchMock = respond(200, { success: true, message: "Updated" });
    await changeUsername(USER_ID, "new");
    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"username":"new"}');
    expect((await db.users.get(USER_ID))?.username).toBe("new");

    respond(400, { error: "UsernameTakenError", detail: "The username is taken." });
    await expect(changeUsername(USER_ID, "taken")).rejects.toMatchObject({ status: 400 });
    expect((await db.users.get(USER_ID))?.username).toBe("new");
  });
});
