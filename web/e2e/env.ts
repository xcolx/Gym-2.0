import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const WEB_URL = "http://localhost:3100";
export const BACKEND_URL = "http://localhost:5100";
export const MAIL_URL = "http://localhost:5103";

const localPython = resolve(__dirname, "../../backend/.venv/bin/python");
/** The Python with the backend's requirements: E2E_PYTHON, the backend's .venv or python3 */
export const python = process.env.E2E_PYTHON ?? (existsSync(localPython) ? localPython : "python3");

export const backendEnv = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://admin:dev_password@localhost:5432/gym2_e2e",
  ENVIRONMENT: "development",
  MAILSERVER_URL: MAIL_URL,
  IMAGE_STORAGE_PATH: join(tmpdir(), "gym2-e2e-images"),
  // Off: every test signs up and logs in, and the uploads aren't checked for nudity
  RATELIMIT_ENABLED: "false",
  NUDITY_FILTER_MODEL_PATH: "",
  PYTHONPATH: ".",
};
