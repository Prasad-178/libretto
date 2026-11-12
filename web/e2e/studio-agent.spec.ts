import { expect, test } from "@playwright/test";
import path from "node:path";

test("Agent navigation edits the same YAML and expanded instructions return focus", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  const navigation = page.getByRole("navigation", { name: "Studio sections" });
  await navigation.getByRole("tab", { name: "Agent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversation", exact: true }),
  ).toBeVisible();
  const name = page.getByRole("textbox", { name: "Agent name", exact: true });
  await name.fill("Community support");
  await name.blur();
  await expect(
    page.getByRole("button", { name: "Rename workflow" }),
  ).toContainText("Community support");
  const expand = page.getByRole("button", {
    name: "Expand instructions",
    exact: true,
  });
  await expand.click();
  const expanded = page.getByRole("textbox", {
    name: "Expanded shared instructions",
    exact: true,
  });
  await expect(expanded).toBeFocused();
  await expanded.fill("Help the caller.\n\nKeep the answer concise.");
  await page.screenshot({ path: info.outputPath("expanded-instructions.png") });
  await page.keyboard.press("Escape");
  await expect(expanded).toBeHidden();
  await expect(expand).toBeFocused();
  await expect(
    page.getByLabel("Shared instructions", { exact: true }),
  ).toHaveValue("Help the caller.\n\nKeep the answer concise.");
  await page.screenshot({ path: info.outputPath("conversation.png") });
  await navigation.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("Community support");
  await expect(page.locator(".cm-content")).toContainText(
    "Keep the answer concise.",
  );
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await navigation.getByRole("tab", { name: "Agent", exact: true }).click();
  await expect(
    page.getByLabel("Shared instructions", { exact: true }),
  ).toHaveValue("Help the caller without inventing details.");
});

test("sidebar destinations are real views and support arrow-key navigation", async ({
  page,
}) => {
  await page.goto("/studio");
  const navigation = page.getByRole("navigation", { name: "Studio sections" });
  await navigation.getByRole("tab", { name: "Tools", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tools", exact: true }),
  ).toBeVisible();
  await navigation
    .getByRole("tab", { name: "Collected data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Collected data", exact: true }),
  ).toBeVisible();
  const agent = navigation.getByRole("tab", { name: "Agent", exact: true });
  await agent.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    navigation.getByRole("tab", { name: "Workflow", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Workflow visualization" }),
  ).toBeVisible();
});

test("controller guidance and Default reasoning serialize without replacing workflow instructions", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Stage controller", exact: true })
    .click();
  await page
    .getByLabel("Controller instructions", { exact: true })
    .fill("Treat a request for a person as a transfer request.");
  await page
    .getByRole("button", { name: "Model settings →", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Response reasoning", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Default", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "Default", exact: true }).click();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "evaluation_prompt: Treat a request for a person as a transfer request.",
  );
  await expect(page.locator(".cm-content")).toContainText("reasoning: default");
  await expect(page.locator(".cm-content")).toContainText(
    "shared_prompt: Help the caller without inventing details.",
  );
});

for (const width of [1440, 1280, 1024]) {
  test(`Conversation fits at ${width} with reachable instructions and first message`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/studio");
    await page
      .getByRole("navigation", { name: "Studio sections" })
      .getByRole("tab", { name: "Agent", exact: true })
      .click();
    await expect(
      page.getByLabel("Shared instructions", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("First message", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByLabel("First message", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: info.outputPath(`conversation-${width}.png`),
    });
  });
}
