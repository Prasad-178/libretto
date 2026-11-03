import { expect, test } from "@playwright/test";
import path from "node:path";
test("Sources previews real retrieval and opens complete passage evidence", async ({
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
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByLabel("Preview for step").selectOption("faq");
  await page.getByLabel("Test retrieval").fill("Dock room");
  await page
    .getByRole("button", { name: "Search passages", exact: true })
    .click();
  await expect(page.locator(".retrieval-summary")).toContainText(
    "ranked results",
  );
  await page.locator(".passages-list>button").first().click();
  await expect(page.locator(".source-details")).toContainText("Content hash");
  await page.screenshot({ path: info.outputPath("source-retrieval-1440.png") });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: info.outputPath("source-retrieval-1024.png") });
  await page.getByRole("button", { name: "Close passage" }).click();
  await page.getByRole("button", { name: "Edit usage" }).click();
  await expect(
    page.getByRole("dialog", { name: "Collection usage" }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Selected steps", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Answer questions", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply usage", exact: true }).click();
  await expect(page.locator(".source-scope")).toContainText("Answer questions");
});

test("changing the query discards an in-flight retrieval response", async ({
  page,
}) => {
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/studio/retrieval", async (route) => {
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response }).catch(() => {});
  });
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
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByLabel("Test retrieval").fill("Dock room");
  const request = page.waitForRequest("**/api/studio/retrieval");
  await page
    .getByRole("button", { name: "Search passages", exact: true })
    .click();
  await request;
  await page.getByLabel("Test retrieval").fill("membership");
  release();
  await expect(page.locator(".retrieval-summary")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Search passages", exact: true }),
  ).toBeEnabled();
});
