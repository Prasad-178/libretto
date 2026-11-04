import { expect, test } from "@playwright/test";
import path from "node:path";
const fixture = path.resolve("src/studio/fixtures/intake.yaml");
test("failed startup releases the snapshot and connecting can be cancelled", async ({
  page,
}) => {
  let fail = true;
  await page.routeWebSocket("**/api/ws", (socket) =>
    socket.onMessage((message) => {
      if (JSON.parse(String(message)).type === "start" && fail)
        socket.send(
          JSON.stringify({
            type: "error",
            epoch: 0,
            at: 0,
            data: { code: "missing_openrouter_key", message: "Add a key" },
          }),
        );
    }),
  );
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Test agent", exact: true }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("button", { name: "Connection settings", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start test", exact: true })
    .click();
  await expect(
    page.getByText("Add a key", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/Testing revision.*editing paused/)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  fail = false;
  await page
    .getByRole("button", { name: "Connection settings", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start test", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel connection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeEnabled();
});
test("empty and malformed drafts retain a working editor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  const editor = page.locator(".cm-content");
  const original = await editor.innerText();
  await editor.fill("");
  await expect(editor).toBeVisible();
  await editor.fill(
    original.replace("fields:", "fields: {broken: null}\nunused_fields:"),
  );
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/Fix.*YAML/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("imported pins restore connectors and a usable entry", async ({
  page,
}, info) => {
  const { readFile } = await import("node:fs/promises");
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles([
    {
      name: "intake.yaml",
      mimeType: "application/yaml",
      buffer: await readFile(fixture),
    },
    {
      name: "intake.studio.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          version: 1,
          positions: { collect: { x: 650, y: 600 } },
        }),
      ),
    },
  ]);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fit workflow", exact: true }).click();
  await page.screenshot({ path: info.outputPath("pinned-layout.png") });
  await expect(
    page.getByText("Workflow preview unavailable", { exact: true }),
  ).toBeHidden();
});
