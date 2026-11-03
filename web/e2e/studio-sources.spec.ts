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
  let fetched: () => void = () => {},
    finished: () => void = () => {};
  const responseReady = new Promise<void>((resolve) => (fetched = resolve));
  const handlerFinished = new Promise<void>((resolve) => (finished = resolve));
  await page.route("**/api/studio/retrieval", async (route) => {
    const response = await route.fetch();
    fetched();
    await pending;
    await route.fulfill({ response }).catch(() => {});
    finished();
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
  await responseReady;
  await page.getByLabel("Test retrieval").fill("membership");
  release();
  await handlerFinished;
  await expect(page.locator(".retrieval-summary")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Search passages", exact: true }),
  ).toBeEnabled();
});

test("local project folders attach as references and Undo removes the attachment", async ({
  page,
}, info) => {
  await page.route("**/api/studio/**", async (route) => {
    const url = new URL(route.request().url());
    url.port = "8002";
    const response = await route.fetch({ url: url.toString() });
    await route.fulfill({ response });
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
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add collection", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project folder", exact: true })
    .selectOption("knowledge");
  await page
    .getByRole("textbox", { name: "Collection ID", exact: true })
    .fill("policies");
  await expect(page.getByText(/Found .* Markdown files/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("local-add-collection.png") });
  await page.getByRole("button", { name: "Add to draft", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByLabel("Test retrieval").fill("zzxxyyqqnomatch");
  await page
    .getByRole("button", { name: "Search passages", exact: true })
    .click();
  await expect(page.locator(".passages-list>button")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(page.locator(".passages-list>button")).toHaveCount(0);
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).not.toContainText("policies");
});
