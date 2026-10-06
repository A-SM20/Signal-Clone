import { defineConfig } from "@playwright/test";

// E2E_BASE_URL runs the suite against a deployed site; otherwise it boots a fresh,
// freshly seeded backend and the static frontend build on side ports.
const remote = process.env.E2E_BASE_URL;
const python = process.platform === "win32" ? String.raw`.venv\Scripts\python.exe` : ".venv/bin/python";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: remote ?? "http://localhost:3100", trace: "retain-on-failure" },
  webServer: remote
    ? undefined
    : [
        {
          command: `${python} -m app.seed --reset && ${python} -m uvicorn app.main:app --port 8100`,
          cwd: "../backend",
          url: "http://localhost:8100/api/health",
          env: { DATABASE_PATH: "./data/e2e.db", UPLOAD_DIR: "./data/e2e-uploads", CORS_ORIGINS: "http://localhost:3100" },
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: "npm run build && npx serve out -l 3100",
          env: { NEXT_PUBLIC_API_URL: "http://localhost:8100" },
          url: "http://localhost:3100",
          reuseExistingServer: false,
          timeout: 300_000,
        },
      ],
});
