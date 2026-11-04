import { expect, test } from "@playwright/test";
import path from "node:path";
for (const width of [1280, 1024]) {
  test(`Routes and Settings remain usable at ${width} with reduced motion`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
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
    await page
      .getByRole("button", { name: "Routes index", exact: true })
      .click();
    await expect(page.locator(".routes-page tbody tr")).toHaveCount(2);
    await page.getByLabel("Search routes").fill("Details complete");
    await expect(page.locator(".routes-page tbody tr")).toHaveCount(1);
    await page.screenshot({ path: info.outputPath(`routes-${width}.png`) });
    await page.locator(".route-reveal").click();
    await expect(page.getByLabel("Edit route", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    if (width === 1024) {
      await page.getByLabel("Settings section").click();
      await page
        .getByRole("option", { name: "Models & speech", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "Models & speech", exact: true })
        .click();
    const model = page.getByRole("combobox", {
      name: "Response model",
      exact: true,
    });
    await expect(model).toBeVisible();
    const box = await model.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`settings-${width}.png`) });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}
test("small screens explain the editor requirement and retain file controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto("/studio");
  await expect(page.locator(".studio-small-screen")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open YAML", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export YAML", exact: true }),
  ).toBeVisible();
});

test("the initially served workflow retains its runtime filename", async ({
  page,
}) => {
  await page.goto("/studio");
  await expect(
    page.getByRole("button", {
      name: "Open Identify intent step",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export YAML", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Download receptionist.yaml",
      exact: true,
    }),
  ).toBeVisible();
});

test("named views hide connectors without removing routes from the index", async ({
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
  await page.locator(".view-editor summary").click();
  await page
    .getByRole("textbox", { name: "View name", exact: true })
    .fill("Intake only");
  await page
    .getByRole("checkbox", { name: "Acknowledge · Spoken", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save named view", exact: true })
    .click();
  await expect(page.getByLabel("Canvas view")).toContainText("Intake only");
  await page.getByRole("button", { name: "Routes index", exact: true }).click();
  await expect(page.locator(".routes-page tbody tr")).toHaveCount(2);
  await page.getByLabel("Canvas visibility").click();
  await page.getByRole("option", { name: "Hidden", exact: true }).click();
  await expect(page.locator(".routes-page tbody tr")).toHaveCount(1);
  await expect(page.locator(".routes-page tbody tr")).toContainText("Spoken");
  await page.locator(".route-reveal").click();
  await expect(page.getByLabel("Edit route", { exact: true })).toBeVisible();
});
