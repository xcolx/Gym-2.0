import { expect, test } from "@playwright/test";

import { PASSWORD, createUser, logIn, newUsername, verifyEmail } from "./helpers";

test("signs up, verifies the email and logs in", async ({ page, request }) => {
  const username = newUsername("signup");
  const email = `${username}@e2e.gym2.app`;

  await page.goto("/auth");
  await page.getByRole("button", { name: "Don't have an account? Create one" }).click();
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Username").fill(username);
  await page.getByPlaceholder("Password", { exact: true }).fill(PASSWORD);
  await page.getByPlaceholder("Repeat password").fill(PASSWORD);
  await page.getByRole("switch", { name: "I'm at least 16 years old and accept the Terms of Use" }).click();
  await page.getByRole("switch", { name: "I accept the Privacy Policy" }).click();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("heading", { name: "Check your emails" })).toBeVisible();

  // Logging in before the email is verified is refused
  await page.getByRole("button", { name: "Go to Login" }).click();
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();

  await verifyEmail(request, email);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText(username)).toBeVisible();
});

test("refuses a wrong password", async ({ page, request }) => {
  const user = await createUser(request);

  await page.goto("/auth");
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill("Wrong-Passw0rd");
  await page.getByRole("button", { name: "Log In" }).click();

  await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
});

test("logs out", async ({ page, request }) => {
  await logIn(page, await createUser(request));

  await page.goto("/settings");
  await page.getByRole("button", { name: "Log Out" }).click();
  await page.getByRole("dialog", { name: "Log out?" }).getByRole("button", { name: "Log Out" }).click();
  await expect(page).not.toHaveURL(/\/settings$/);

  // The pages of the app lead to the login again
  await page.goto("/home");
  await expect(page).not.toHaveURL(/\/home$/);
});
