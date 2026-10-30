import { devices, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import { BACKEND_URL, MAIL_URL, WEB_URL } from "./env";

export const PASSWORD = "E2e-Passw0rd";

export interface TestUser {
  username: string;
  email: string;
  id: number;
}

/** A new name for every user, the database keeps the users of earlier runs */
export function newUsername(prefix = "e2e"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);
}

/** The link of the newest verification email the backend sent to the address */
export async function verificationLink(request: APIRequestContext, email: string): Promise<{ userId: number; token: string }> {
  let found: { user_id: number; token: string } | undefined;
  await expect
    .poll(async () => {
      const emails = await (await request.get(`${MAIL_URL}/emails`, { params: { email } })).json();
      found = emails.filter((mail: { kind: string }) => mail.kind === "verification").at(-1);
      return found;
    })
    .toBeTruthy();
  return { userId: found!.user_id, token: found!.token };
}

/** Opens the link of the verification email like the user would (the page posts the form) */
export async function verifyEmail(request: APIRequestContext, email: string): Promise<number> {
  const { userId, token } = await verificationLink(request, email);
  const response = await request.post(`${BACKEND_URL}/v1/auth/verify-email`, { form: { user_id: userId, token } });
  expect(response.ok()).toBe(true);
  return userId;
}

/** A verified account, created through the API */
export async function createUser(request: APIRequestContext, prefix?: string): Promise<TestUser> {
  const username = newUsername(prefix);
  const email = `${username}@e2e.gym2.app`;
  const response = await request.post(`${BACKEND_URL}/v1/auth/signup/email`, {
    data: { client: "web", email, password: PASSWORD, username },
  });
  expect(response.status()).toBe(201);
  const id = await verifyEmail(request, email);
  return { username, email, id };
}

export async function logIn(page: Page, user: TestUser): Promise<void> {
  await page.goto("/auth");
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A logged in page in a browser context of its own, like another device */
export async function deviceOf(browser: Browser, user: TestUser): Promise<Page> {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: WEB_URL });
  const page = await context.newPage();
  await logIn(page, user);
  return page;
}

/** Calls the API with the session of the page (through the proxy of the web app) */
export async function api<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  expect(response.ok()).toBe(true);
  return response.json();
}
