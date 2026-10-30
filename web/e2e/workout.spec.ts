import { expect, test, type Page } from "@playwright/test";

import { api, createUser, deviceOf, logIn } from "./helpers";

interface ServerWorkouts {
  workouts: { name: string; in_progress: boolean; exercises: { reps: number[] | null; weights: number[] | null }[] }[];
}

/** Starts a free workout with Bench Press and opens it */
async function startBenchPress(page: Page, name: string) {
  await page.goto("/workout/free");
  await page.getByLabel("Name of the workout").fill(name);
  await page.getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Bench Press, verified" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: "Start Workout" }).click();
  await expect(page).toHaveURL(/\/workout\/active\//);
}

async function enterSet(page: Page, set: number, reps: string, kilograms: string) {
  await page.getByLabel(`Reps of set ${set}`).fill(reps);
  await page.getByLabel(`kg of set ${set}`).fill(kilograms);
}

async function endWorkout(page: Page) {
  await page.getByRole("tab", { name: "End Workout" }).click();
  await page.getByRole("button", { name: "End Workout" }).click();
  await expect(page).toHaveURL(/\/workout$/);
}

const serverWorkout = async (page: Page, name: string) =>
  (await api<ServerWorkouts>(page, "/workouts")).workouts.find((workout) => workout.name === name);

test("logs a workout that reaches the server and the user's other devices", async ({ page, browser, request }) => {
  const user = await createUser(request);
  await logIn(page, user);

  await startBenchPress(page, "Push Day");
  await enterSet(page, 1, "10", "60");
  await page.getByRole("button", { name: "add set" }).click();
  await enterSet(page, 2, "8", "62.5");
  await endWorkout(page);

  await expect.poll(() => serverWorkout(page, "Push Day")).toMatchObject({
    in_progress: false,
    exercises: [{ reps: [10, 8], weights: [60, 62.5] }],
  });

  // The other device loads it with its first sync
  const phone = await deviceOf(browser, user);
  await phone.goto("/stats");
  const stat = (term: string) => phone.getByRole("term").filter({ hasText: term }).locator("+ dd");
  await expect(stat("Number of Workouts")).toHaveText("1");
  await expect(stat("Total Reps")).toHaveText("18");
});

test("keeps the sets entered offline and uploads them once online", async ({ page, context, request }) => {
  const user = await createUser(request);
  await logIn(page, user);
  await startBenchPress(page, "Offline Day");

  await context.setOffline(true);
  const failedPush = page.waitForEvent("requestfailed", (request) => request.url().includes("/api/v1/workouts"));
  await enterSet(page, 1, "12", "50");
  await failedPush;
  // Nothing of the sets reached the server, maybe not even the workout
  expect((await serverWorkout(page, "Offline Day"))?.exercises[0]?.reps ?? []).toEqual([]);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect.poll(() => serverWorkout(page, "Offline Day")).toMatchObject({
    in_progress: true,
    exercises: [{ reps: [12], weights: [50] }],
  });
});

test("continues a workout after a reload", async ({ page, request }) => {
  const user = await createUser(request);
  await logIn(page, user);
  await startBenchPress(page, "Reload Day");
  await enterSet(page, 1, "5", "100");
  // Pushed before the reload, the page loads it from the device again
  await expect.poll(async () => (await serverWorkout(page, "Reload Day"))?.exercises[0]?.reps).toEqual([5]);

  await page.reload();

  await expect(page.getByLabel("Reps of set 1")).toHaveValue("5");
  await expect(page.getByLabel("kg of set 1")).toHaveValue("100");
});
