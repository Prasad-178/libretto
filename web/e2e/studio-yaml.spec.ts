import { expect, test } from "@playwright/test";
import path from "node:path";
import { readFile } from "node:fs/promises";
const fixture = path.resolve("src/studio/fixtures/intake.yaml");
test("invalid YAML retains the validated graph and exports an explicitly labelled draft", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Validated ✓", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await page.locator(".cm-content").fill("name: [unterminated\n");
  await expect(
    page.getByRole("button", { name: "Test agent", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".yaml-problem").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("yaml-problems-1440.png") });
  await page.getByRole("tab", { name: "Flow", exact: true }).click();
  await expect(page.getByText(/Showing last valid graph/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export YAML", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Export workflow" }),
  ).toBeVisible();
  await expect(page.getByText(/unvalidated draft/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("draft-export.png") });
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(page.getByText(/Showing last valid graph/)).toBeHidden();
});
test("export names match selected files and preserve imported bytes", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export YAML", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Download intake.yaml", exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /intake.studio.json/ }).check();
  await expect(
    page.getByRole("button", { name: "Download 2 files", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("export-review.png") });
  const downloads: any[] = [];
  page.on("download", (download) => downloads.push(download));
  await page
    .getByRole("button", { name: "Download 2 files", exact: true })
    .click();
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.map((d) => d.suggestedFilename())).toEqual([
    "intake.yaml",
    "intake.studio.json",
  ]);
  expect(await readFile(await downloads[0].path())).toEqual(
    await readFile(fixture),
  );
  await expect(page.getByText(/Exported · unchanged/)).toBeVisible();
});

test("YAML Problems stays a 200px strip at 1024", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await expect(
    page.getByRole("button", {
      name: "Open Collect request step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  const panel = await page.locator(".yaml-review-panel").boundingBox();
  expect(panel!.height).toBe(200);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(1024);
  await page.screenshot({ path: info.outputPath("yaml-1024.png") });
});
