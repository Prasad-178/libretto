import { test, expect } from "@playwright/test";
import path from "node:path";
test("instructions use the settings width and select arrows remain centered", async ({ page }, info) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  const instructions = page.getByLabel("Shared instructions", { exact: true });
  await expect(instructions).toBeVisible();
  const editor = await instructions.boundingBox();
  const section = await instructions.locator("..").boundingBox();
  expect(editor!.width).toBeGreaterThan(section!.width - 3);
  await page.screenshot({ path: info.outputPath("shared-instructions.png") });
  await page.getByRole("button", { name: "Model settings →", exact: true }).click();
  const selects = page.locator(".settings-content .studio-select-trigger");
  for (const select of await selects.all()) {
    if (!(await select.isVisible())) continue;
    const box = (await select.boundingBox())!;
    const arrow = (await select.locator(".studio-select-chevron").boundingBox())!;
    expect(Math.abs(arrow.y + arrow.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: info.outputPath("settings-controls.png") });
});

test("selecting cards keeps the viewport still", async ({ page }) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  const card = page.getByRole("button", {
    name: "Open Collect request step",
    exact: true,
  });
  await expect(card).toBeVisible();
  const transform = () =>
    page.locator(".react-flow__viewport").getAttribute("style");
  const before = await transform();
  await card.click();
  await expect(page.getByLabel("Step prompt", { exact: true })).toBeVisible();
  await expect.poll(transform).toBe(before);
});
test("dropdowns have a styled keyboard accessible option menu", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await expect(
    page.getByRole("button", {
      name: "Open Identify intent step",
      exact: true,
    }),
  ).toBeVisible();
  const trigger = page.getByRole("combobox", {
    name: "Canvas view",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "All routes", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("custom-select.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
test("custom selects support keyboard changes and dialog menus", async ({
  page,
}, info) => {
  await page.goto("/studio");
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
  const reasoning = page.getByRole("combobox", {
    name: "Response reasoning",
    exact: true,
  });
  await reasoning.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", {name:"high",exact:true})).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(reasoning).toContainText("high");
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("reasoning: high");
  await page
    .getByRole("button", { name: "Test connection settings", exact: true })
    .click();
  const outcome = page.locator(".connection-dialog [role=combobox]").last();
  await outcome.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.screenshot({ path: info.outputPath("dialog-select.png") });
  await page
    .getByRole("option", { name: "Transfer connected", exact: true })
    .click();
  await expect(outcome).toContainText("Transfer connected");
  await page.keyboard.press("Escape");
});
