import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };
// Dates in the tests are local times, a fixed zone keeps them independent of the machine
const env = { TZ: "Europe/Zurich" };

// Tests that need IndexedDB import "fake-indexeddb/auto" first. Component tests (*.test.tsx) run in jsdom.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["src/**/*.test.ts"], environment: "node", env },
      },
      {
        resolve: { alias },
        test: {
          name: "components",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/test/setup-components.ts"],
          env,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/lib/sync/testing/**"],
      reporter: ["text-summary", "html"],
      // npm run test:coverage fails below these, raise them when the coverage grows
      thresholds: { lines: 55, functions: 52, branches: 54, statements: 55 },
    },
  },
});
