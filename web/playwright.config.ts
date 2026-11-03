import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "uv run libretto serve --port 8000",
      cwd: "..",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "uv run libretto serve examples/receptionist.yaml --project-root examples --port 8002",
      cwd: "..",
      url: "http://127.0.0.1:8002/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174/studio",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
