import { test, expect } from "@playwright/test";

test("rename updates the header, export, Undo and the restored draft", async ({
  page,
}, info) => {
  await page.goto("/studio");
  const rename = page.getByRole("button", {
    name: "Rename workflow",
    exact: true,
  });
  await expect(rename).toBeVisible();
  await expect(rename).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: "Open Identify intent step",
      exact: true,
    }),
  ).toBeVisible();
  const original = await rename.innerText();
  await rename.click();
  await page
    .getByRole("textbox", { name: "Workflow name", exact: true })
    .fill("Support desk");
  await page
    .getByRole("textbox", { name: "YAML filename", exact: true })
    .fill("support-desk.yaml");
  await page.screenshot({ path: info.outputPath("rename.png") });
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(rename).toContainText("support-desk.yaml");
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(rename).toHaveText(original);
  await page.getByRole("button", { name: "Redo (⇧⌘Z)", exact: true }).click();
  await page.reload();
  await expect(rename).toContainText("support-desk.yaml");
  await page.getByRole("button", { name: "Export YAML", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download support-desk.yaml", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("support-desk.yaml");
});

test("the default flow shows incoming connections to the message branch", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await expect(
    page.locator(`.react-flow__edge[data-id='["identify","leave_message"]']`),
  ).toHaveCount(1);
  await expect(
    page.locator(`.react-flow__edge[data-id='["save_message","captured"]']`),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Fit workflow", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page
          .getByRole("button", {
            name: "Open Identify intent step",
            exact: true,
          })
          .boundingBox())!.width,
    )
    .toBeLessThan(264);
  await page.screenshot({ path: info.outputPath("connected-workflow.png") });
});
