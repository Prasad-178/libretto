import { expect, test } from "@playwright/test";
import { parse, stringify } from "yaml";

for (const width of [1440, 1024])
  test(`inspector tabs reset scroll and connection cards have inset content at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/studio");
    await page
      .getByRole("button", { name: "Open Identify intent step", exact: true })
      .click();
    const inspector = page.getByRole("complementary", {
      name: "Edit step",
      exact: true,
    });
    const scroll = inspector.locator(".studio-inspector-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await inspector
      .getByRole("button", { name: "Connections", exact: true })
      .click();
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
    const card = inspector.locator(".inspector-transition").first();
    const cardBox = (await card.boundingBox())!,
      buttonBox = (await card.locator("button").first().boundingBox())!;
    expect(buttonBox.x - cardBox.x).toBeGreaterThanOrEqual(12);
    const tabs = inspector.locator(".inspector-main-tabs");
    expect((await tabs.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: info.outputPath(`connections-${width}.png`),
    });
  });

test("knowledge issues use separate labelled rows and invalid status has no repeated Draft prefix", async ({
  page,
}, info) => {
  await page.goto("/studio");
  const source = parse(
    await (await page.request.get("/api/workflow.yaml")).text(),
  );
  for (const id of ["transfer", "save_message"])
    source.nodes[id].edges = source.nodes[id].edges.filter(
      (edge: any) => edge.result !== "unknown",
    );
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "issues.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(stringify(source)),
  });
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.locator(".document-status")).toHaveText("Invalid draft");
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  const list = page.getByRole("list", { name: "Workflow issues", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list).toContainText("Attempt transfer");
  await expect(list).toContainText("Capture message");
  const rows = await list.getByRole("listitem").all();
  expect((await rows[1].boundingBox())!.y).toBeGreaterThanOrEqual(
    (await rows[0].boundingBox())!.y + (await rows[0].boundingBox())!.height,
  );
  await expect(page.locator(".passages-list > button").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("knowledge-issues.png") });
  await list.getByRole("button").first().click();
  await expect(
    page.getByRole("textbox", { name: "Step name", exact: true }),
  ).toHaveValue("Attempt transfer");
});

for (const width of [1440, 1024])
  test(`grouped result menus stay above graph cards and close on Escape at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/studio");
    await page
      .getByRole("combobox", { name: "Jump to step", exact: true })
      .click();
    await page
      .getByRole("option", { name: "Attempt transfer", exact: true })
      .click();
    const trigger = page
      .getByRole("button", {
        name: /^View \d+ result connections$/,
      })
      .first();
    await trigger.click();
    const menu = page.getByRole("dialog", {
      name: "Result connections",
      exact: true,
    });
    await expect(menu).toBeVisible();
    const item = menu.getByRole("button").first();
    expect(
      await item.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
          ),
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`result-menu-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole("button").first().click();
    await expect(
      page.getByRole("complementary", { name: "Edit route", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close inspector", exact: true }),
    ).toBeFocused();
    const label = page
      .getByRole("button", {
        name: "Edit transition: Message instead",
        exact: true,
      })
      .first();
    await page
      .getByRole("button", { name: "Fit workflow", exact: true })
      .click();
    const geometry = await label.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const parent = el.parentElement!.getBoundingClientRect();
      return {
        label: box.x + box.width / 2,
        anchor: parent.x + parent.width / 2,
      };
    });
    expect(Math.abs(geometry.label - geometry.anchor)).toBeLessThan(1);
  });

test("required inputs, deletion controls and local-source instructions have clear layout", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Attempt transfer", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Edit step",
    exact: true,
  });
  const required = panel.locator(".action-required");
  await required.locator("summary").click();
  await expect(
    required.getByRole("checkbox", { name: "Recipient", exact: true }),
  ).toBeDisabled();
  await expect(
    required.getByRole("checkbox", { name: "Caller name", exact: true }),
  ).toBeEnabled();
  const row = required.locator(".inspector-check").first();
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await required.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("action-required.png") });
  await panel.getByRole("button", { name: "Connections", exact: true }).click();
  await panel
    .locator(".inspector-transition")
    .first()
    .locator("button")
    .first()
    .click();
  const route = page.getByRole("complementary", {
    name: "Edit route",
    exact: true,
  });
  const remove = route.getByRole("button", {
    name: "Delete connection",
    exact: true,
  });
  await remove.scrollIntoViewIfNeeded();
  expect(
    (await remove.boundingBox())!.x - (await route.boundingBox())!.x,
  ).toBeGreaterThanOrEqual(20);
  await route.locator(".studio-inspector-scroll").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.screenshot({ path: info.outputPath("connection-footer.png") });
  await page.getByRole("tab", { name: "Knowledge", exact: true }).click();
  await page.getByText("Use your own Markdown files", { exact: true }).click();
  expect(await page.locator(".source-local-help code").textContent()).toBe(
    "libretto serve workflow.yaml --project-root .",
  );
  await expect(page.locator(".passages-list > button").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("local-knowledge-help.png") });
});

test("an imported action with a missing required mapping can still be repaired visually", async ({
  page,
}) => {
  await page.goto("/studio");
  const draft = parse(
    await (await page.request.get("/api/workflow.yaml")).text(),
  );
  draft.nodes.transfer.requires = draft.nodes.transfer.requires.filter(
    (field: string) => field !== "recipient",
  );
  await page
    .getByLabel("Open workflow files")
    .setInputFiles({
      name: "repair-required.yaml",
      mimeType: "application/yaml",
      buffer: Buffer.from(stringify(draft)),
    });
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Attempt transfer", exact: true })
    .click();
  const panel = page.getByRole("complementary", {
    name: "Edit step",
    exact: true,
  });
  const required = panel.locator(".action-required");
  await required.locator("summary").click();
  const checkbox = required.getByRole("checkbox", {
    name: "Recipient",
    exact: true,
  });
  await expect(checkbox).toBeEnabled();
  await checkbox.check();
  await panel
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  await expect(checkbox).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Validated ✓", exact: true }),
  ).toBeVisible();
});
