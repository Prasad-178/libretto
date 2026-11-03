import { expect, test } from "@playwright/test";
import path from "node:path";
const fixture = path.resolve("src/studio/fixtures/intake.yaml");
for (const width of [1440, 1280, 1024])
  test(`shell and prompt inspector fit at ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/studio");
    await expect(
      page.getByRole("tab", { name: "Flow", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".studio-small-screen")).toBeHidden();
    await page.getByLabel("Open workflow files").setInputFiles(fixture);
    await expect(
      page.getByRole("button", {
        name: "Open Collect request step",
        exact: true,
      }),
    ).toBeVisible();
    const bounds = await page.locator(".workflow-canvas").boundingBox();
    expect(bounds!.height).toBeGreaterThan(500);
    expect(bounds!.width).toBeGreaterThan(width - 100);
    await page.screenshot({ path: testInfo.outputPath(`flow-${width}.png`) });
    await page
      .getByRole("button", { name: "Open Collect request step", exact: true })
      .click();
    await expect(page.getByLabel("Step prompt", { exact: true })).toBeVisible();
    const inspector = await page
      .getByLabel("Edit step", { exact: true })
      .boundingBox();
    expect(inspector!.width).toBe(
      width === 1440 ? 400 : width === 1280 ? 360 : 380,
    );
    expect(inspector!.x + inspector!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`inspector-${width}.png`),
    });
    await page.getByLabel("Expand prompt editor").click();
    await expect(page.getByLabel("Expanded step prompt")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Expanded step prompt")).toBeHidden();
    await page.getByLabel("Step prompt", { exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Edit step", { exact: true })).toBeHidden();
    expect(errors).toEqual([]);
  });

test("prompt edits group Undo and configured insertion creates a real continuation", async ({
  page,
}, testInfo) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(fixture);
  await page
    .getByRole("button", { name: "Open Collect request step", exact: true })
    .click();
  const prompt = page.getByLabel("Step prompt", { exact: true });
  const original = await prompt.inputValue();
  await prompt.fill("Ask the caller’s email.\n\nWait for their answer.");
  await prompt.pressSequentially(" Keep it brief.");
  await prompt.blur();
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(prompt).toHaveValue(original);
  await page
    .getByRole("button", { name: "+ Insert step", exact: true })
    .click();
  await page.getByLabel("Step title", { exact: true }).fill("Clarify request");
  await page
    .getByLabel("Step prompt", { exact: true })
    .fill("Ask for clarification.");
  await page
    .getByLabel("Continue when", { exact: true })
    .fill("The caller clarifies their request.");
  await page.getByRole("button", { name: "Add step →", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Clarify request step",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Step prompt", { exact: true })).toHaveValue(
    "Ask for clarification.",
  );
  await page
    .getByRole("button", { name: "Continue", exact: false })
    .filter({ hasText: "Acknowledge" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Language condition", exact: true }),
  ).toHaveValue("The caller clarifies their request.");
  await page.screenshot({ path: testInfo.outputPath("configured-route.png") });
});
