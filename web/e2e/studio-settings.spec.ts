import { expect, test } from "@playwright/test";
import path from "node:path";
import { parse } from "yaml";
test("settings expose real field references and model roles", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("../examples/receptionist.yaml"));
  await expect(
    page.getByRole("button", {
      name: "Open Identify intent step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Model settings →", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose response model", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stage controller", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose controller model", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("models-1440.png") });
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
  await page.getByText("callback_number", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Capture message · argument/ }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("fields-1440.png") });
  await page
    .getByRole("button", { name: /Capture message · argument/ })
    .click();
  await expect(page.getByLabel("Step name")).toHaveValue("Capture message");
});
test("a scripted test runs the validated snapshot and freezes document edits until Stop", async ({
  page,
}) => {
  let started = "";
  await page.routeWebSocket("**/api/ws", (socket) => {
    socket.onMessage((message) => {
      const event = JSON.parse(String(message));
      if (event.type === "start") {
        started = event.workflow_yaml;
        socket.send(
          JSON.stringify({
            type: "ready",
            epoch: 0,
            at: 0,
            data: {
              workflow: parse(started),
              credentials: {},
              mode: "text",
              call_limit_seconds: 300,
            },
          }),
        );
        socket.send(
          JSON.stringify({
            type: "state",
            epoch: 0,
            at: 0,
            data: {
              active_stage: "collect",
              pending_stage: null,
              facts: {},
              receipts: [],
            },
          }),
        );
      }
    });
  });
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
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
  // Automatic validation temporarily changes the dialog button's label.
  // Scope this lookup so it cannot click the identically named button behind it.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start test", exact: true })
    .click();
  await expect(
    page.getByText(/Testing revision.*editing paused/),
  ).toBeVisible();
  expect(started).toContain("id: intake");
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Back to editor", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Open Collect request step", exact: true })
    .click();
  await expect(page.getByLabel("Step prompt", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Test agent", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeEnabled();
});

test("Settings keeps separate undo sessions and accepts multiline lists", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  const name = page.getByRole("textbox", {
    name: "Agent name",
    exact: true,
  });
  await name.fill("First name");
  await name.blur();
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await name.fill("Second name");
  await name.blur();
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(name).toHaveValue("First name");
  await page.getByRole("button", { name: "Speech", exact: true }).click();
  const hints = page.getByRole("textbox", {
    name: "Add recognition term",
    exact: true,
  });
  await hints.fill("first");
  await hints.press("Enter");
  await hints.fill("second");
  await hints.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Remove recognition term first",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Remove recognition term second",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Email field", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByText("Advanced · Choices and stable field ID", { exact: true })
    .click();
  const choices = page.getByRole("textbox", {
    name: "Add allowed choice",
    exact: true,
  });
  await choices.fill("one");
  await choices.press("Enter");
  await choices.fill("two");
  await choices.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Remove allowed choice one",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Remove allowed choice two",
      exact: true,
    }),
  ).toBeVisible();
});
