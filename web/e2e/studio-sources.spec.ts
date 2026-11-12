import { expect, test } from "@playwright/test";
import path from "node:path";
import { parse, stringify } from "yaml";
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
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByLabel("Preview for step").click();
  await page
    .getByRole("option", { name: "Answer questions", exact: true })
    .click();
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
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
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
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add collection", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Project folder", exact: true })
    .click();
  await page.getByRole("option", { name: "knowledge", exact: true }).click();
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

test("a failed refresh labels the last inspected collections and disables draft-sensitive actions", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await page.locator(".cm-content").fill("name: [broken\n");
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(
    page.getByText(/Last valid knowledge configuration/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit usage", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".sources-library")).not.toContainText(
    "0 collections",
  );
  await page.screenshot({ path: info.outputPath("knowledge-stale.png") });
});

test("selecting another collection discards in-flight retrieval", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  let ready!: () => void;
  const fetched = new Promise<void>((r) => (ready = r));
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  await page.route("**/api/studio/retrieval", async (route) => {
    const response = await route.fetch();
    ready();
    await pending;
    await route.fulfill({ response }).catch(() => {});
    done();
  });
  await page.goto("/studio");
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  const source = await (await page.request.get("/api/workflow.yaml")).text();
  const draft = parse(source);
  draft.knowledge.duplicate = "knowledge";
  await page.locator(".cm-content").fill(stringify(draft));
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByLabel("Test retrieval", { exact: true }).fill("Dock room");
  await page
    .getByRole("button", { name: "Search passages", exact: true })
    .click();
  await fetched;
  await page
    .locator(".sources-library nav")
    .getByRole("button", { name: /^Duplicate/ })
    .click();
  release();
  await finished;
  await expect(page.locator(".retrieval-summary")).toBeHidden();
});

test("collection names stay consistent and ID edits update scope and Undo", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await expect(page.locator(".passages-list>button").first()).toBeVisible();
  await page.getByText("Collection details", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Collection name", exact: true })
    .fill("Help library");
  await page
    .getByRole("button", { name: "Edit folder and ID", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Collection settings",
    exact: true,
  });
  await dialog.getByText("Advanced · Collection ID", { exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Collection ID", exact: true })
    .fill("help_docs");
  await dialog
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    page.locator(".sources-library nav button").first(),
  ).toContainText("Help library");
  await expect(
    page.getByRole("heading", { name: "Help library", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit usage", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Collection usage" }),
  ).toContainText("Help library");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("company: knowledge");
  await expect(page.locator(".cm-content")).not.toContainText("help_docs");
});
