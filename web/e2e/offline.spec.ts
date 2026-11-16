import { expect, test, type Page } from "@playwright/test";

import { createUser, logIn } from "./helpers";

/** The service worker precached this build and controls the page */
async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
}

// Only the production build has a service worker (CI), `next dev` has none
test.skip(!process.env.CI, "needs the service worker of the production build");

test("opens the pages of a workout offline", async ({ page, context, request }) => {
  const user = await createUser(request);
  await logIn(page, user);
  await serviceWorkerReady(page);

  await page.goto("/workout/free");
  await page.getByLabel("Name of the workout").fill("Offline Day");
  await page.getByRole("button", { name: "Add exercises" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Add Bench Press, verified" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add 1 exercise" }).click();

  await context.setOffline(true);
  // The dynamic routes are answered from their precached templates, static ones from their precached pages
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page).toHaveURL(/\/workout\/active\//);
  await expect(page.getByLabel("Reps of set 1")).toBeVisible();
  await page.getByLabel("Reps of set 1").fill("10");
  await page.getByLabel("kg of set 1").fill("60");
  await page.reload();
  await expect(page.getByLabel("Reps of set 1")).toHaveValue("10");
  await page.getByRole("tab", { name: "Finish" }).click();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);

  await page.goto("/stats/past-workouts");
  await page.getByText("Offline Day").first().click();
  await expect(page).toHaveURL(/\/stats\/past-workouts\/[0-9a-f-]+$/);
  await expect(page.getByText("Bench Press").first()).toBeVisible();

  await page.goto("/stats/exercises");
  await page.getByText("Bench Press").first().click();
  await expect(page).toHaveURL(/\/stats\/exercises\/[0-9a-f-]+$/);
  await expect(page.getByText("History")).toBeVisible();
});
