import { expect, request as apiRequest, test } from "@playwright/test";

import { BACKEND_URL } from "./env";
import { createUser, deviceOf, logIn, PASSWORD, type TestUser } from "./helpers";

/** Makes the users friends and returns their direct chat, through the API */
async function directChat(alice: TestUser, bob: TestUser): Promise<number> {
  const login = async (user: TestUser) => {
    const context = await apiRequest.newContext({ baseURL: BACKEND_URL });
    const response = await context.post("/v1/auth/login/email", { data: { client: "web", email: user.email, password: PASSWORD } });
    expect(response.ok()).toBe(true);
    return context;
  };
  const [aliceApi, bobApi] = await Promise.all([login(alice), login(bob)]);
  expect((await aliceApi.post(`/v1/users/me/friend-requests/${bob.id}`)).status()).toBe(201);
  expect((await bobApi.patch(`/v1/users/me/friend-requests/${alice.id}`, { data: { status: true } })).ok()).toBe(true);
  const chat = await (await aliceApi.post("/v1/chats", { data: { user_id: bob.id } })).json();
  await Promise.all([aliceApi.dispose(), bobApi.dispose()]);
  return chat.id as number;
}

test("sends a message that the friend receives", async ({ page, browser, request }) => {
  const alice = await createUser(request, "alice");
  const bob = await createUser(request, "bob");
  const chatId = await directChat(alice, bob);
  await logIn(page, alice);
  const bobPage = await deviceOf(browser, bob);

  await page.goto(`/chat/${chatId}`);
  await page.getByLabel("Message").fill("Leg day tomorrow?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Leg day tomorrow?")).toBeVisible();
  await expect(page.getByLabel("Message")).toHaveValue("");

  await bobPage.goto(`/chat/${chatId}`);
  await expect(bobPage.getByText("Leg day tomorrow?")).toBeVisible();

  await bobPage.getByLabel("Message").fill("Sure");
  await bobPage.getByRole("button", { name: "Send", exact: true }).click();
  // Alice's open chat polls for new messages
  await expect(page.getByText("Sure", { exact: true })).toBeVisible({ timeout: 20_000 });
});
