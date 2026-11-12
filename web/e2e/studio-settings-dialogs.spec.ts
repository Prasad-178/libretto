import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { exportYaml } from "./helpers";
import { parse } from "yaml";

test("workflow settings save one undoable edit and Cancel discards staged changes", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Workflow settings",
    exact: true,
  });
  await dialog
    .getByLabel("Workflow name", { exact: true })
    .fill("Support workflow");
  await dialog
    .getByLabel("What does it help with?", { exact: true })
    .fill("Answers member questions.");
  await page.screenshot({ path: info.outputPath("workflow-settings.png") });
  await dialog
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Rename workflow" }),
  ).toContainText("Support workflow");
  const exported = await exportYaml(page, "intake.yaml");
  const validated = await page.request.post("/api/workflow/validate", {
    data: { source: exported },
  });
  expect(validated.ok()).toBe(true);
  expect((await validated.json()).workflow.description).toBe(
    "Answers member questions.",
  );
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rename workflow" }),
  ).toContainText("Intake");
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  await expect(
    dialog.getByLabel("What does it help with?", { exact: true }),
  ).toHaveValue("");
  await dialog
    .getByLabel("Workflow name", { exact: true })
    .fill("Discard this name");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Rename workflow" }),
  ).toContainText("Intake");
});

test("confirmation step settings explain delivery and reject incomplete readbacks", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("../examples/repair_visit/agent.yaml"));
  await page
    .getByRole("button", { name: "Open Confirm visit step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Step settings",
    exact: true,
  });
  await expect(
    dialog.getByRole("radio", { name: "Wait for the caller", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("radio", { name: "Speak first", exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("textbox", { name: "Read these details back", exact: true })
    .fill("Visit for {customer_name}. Is that right?");
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("address");
  await dialog
    .getByRole("textbox", { name: "Read these details back", exact: true })
    .fill(
      "Visit for {customer_name} at {address}, about {issue}, during {window}. Is that correct?",
    );
  await dialog.getByRole("button", { name: "Edit rule", exact: true }).click();
  await expect(dialog.getByText(/Shared with.*Book visit/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("confirmation-settings.png") });
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "confirmation: booking",
  );
  await expect(page.locator(".cm-content")).toContainText("Is that correct?");
});

test("task ID renames must be applied explicitly and save their references in one Undo entry", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("../examples/repair_visit/agent.yaml"));
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Workflow settings",
    exact: true,
  });
  await dialog
    .getByText("Advanced · IDs, available tools and task memory", {
      exact: true,
    })
    .click();
  await dialog
    .locator("summary")
    .filter({ hasText: /^Visit · 6 fields$/ })
    .click();
  await dialog
    .getByRole("textbox", { name: "New ID", exact: true })
    .fill("repair_task");
  await dialog
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(/Apply|apply/);
  await dialog.getByRole("button", { name: "Rename ID", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "begin_request: repair_task",
  );
  await expect(page.locator(".cm-content")).toContainText(
    "request: repair_task",
  );
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "begin_request: visit",
  );
});

test("field settings include task/rule references in type safety and rename readback bindings", async ({
  page,
}) => {
  const repair = (
    await readFile(path.resolve("../examples/repair_visit/agent.yaml"))
  )
    .toString()
    .replace(
      "predicate: {op: equals, field: accepted, value: true}",
      "condition: The caller approved the readback",
    )
    .replace(
      "requires: [customer_name, address, issue, window, consent, accepted]",
      "requires: [customer_name, address, issue, window, consent]",
    );
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "repair.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(repair),
  });
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Accepted field", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit Customer name field", exact: true })
    .click();
  await page
    .getByText("Advanced · Choices and stable field ID", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New ID", exact: true })
    .fill("caller_name");
  await page.getByRole("button", { name: "Rename ID", exact: true }).click();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("{caller_name}");
  const exported = parse(await exportYaml(page, "repair.yaml"));
  expect(exported.nodes.book.arguments.customer_name).toBe("caller_name");
});

test("stale settings cannot overwrite an Undo made while the dialog is open", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page
    .getByLabel("Agent name", { exact: true })
    .fill("Changed before opening");
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await page
    .getByRole("button", { name: "Workflow settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Workflow settings",
    exact: true,
  });
  const save = dialog.getByRole("button", {
    name: "Save workflow",
    exact: true,
  });
  await save.focus();
  await page.keyboard.press("Meta+z");
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("document changed");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rename workflow" }),
  ).toContainText("Intake");
});

for (const width of [1280, 1024])
  test(`settings keep footer controls reachable at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/studio");
    const trigger = page.getByRole("button", {
      name: "Workflow settings",
      exact: true,
    });
    await expect(trigger).toBeInViewport();
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Workflow settings",
      exact: true,
    });
    await dialog
      .getByText("Advanced · IDs, available tools and task memory", {
        exact: true,
      })
      .click();
    await dialog
      .getByRole("textbox", { name: "New rule ID", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      dialog.getByRole("button", { name: "Save workflow", exact: true }),
    ).toBeInViewport();
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`settings-${width}.png`) });
  });

test("fresh conversions author action contracts and first connections before a single Save", async ({
  page,
}, info) => {
  const input =
    "version: 1\nid: convert\nname: Convert\nstart: ask\nshared_prompt: Help.\nfields: {recipient: {type: string}}\ntools: [transfer_call]\nnodes:\n  ask: {kind: conversation, title: Ask, prompt: Ask., edges: [{id: done, to: end, condition: Finished}]}\n  end: {kind: end, title: Finish}\n";
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "convert.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(input),
  });
  await page
    .getByRole("button", { name: "Open Ask step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Step settings",
    exact: true,
  });
  await dialog
    .getByText("More options · Knowledge, tools and advanced settings", {
      exact: true,
    })
    .click();
  await dialog
    .getByRole("combobox", { name: "Step kind", exact: true })
    .click();
  await page.getByRole("option", { name: "action", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Registered action", exact: true })
    .click();
  await page
    .getByRole("option", { name: "transfer_call", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Input for recipient", exact: true })
    .click();
  await page.getByRole("option", { name: "Recipient", exact: true }).click();
  for (const result of [
    "connected",
    "unavailable",
    "failed",
    "timeout",
    "unknown",
  ]) {
    await dialog
      .getByRole("combobox", { name: `Destination for ${result}`, exact: true })
      .click();
    await page.getByRole("option", { name: "Finish", exact: true }).click();
  }
  await dialog
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(
    dialog.getByRole("button", { name: "Save step", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("conversion-action-1024.png"),
  });
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  let exported = parse(await exportYaml(page, "convert.yaml"));
  expect(exported.nodes.ask.kind).toBe("action");
  expect(exported.nodes.ask.tool).toBe("transfer_call");
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  exported = parse(await exportYaml(page, "convert.yaml"));
  expect(exported.nodes.ask.kind).toBe("conversation");
  expect(exported.nodes.ask.tool).toBeUndefined();
  await page
    .getByRole("button", { name: "Open Finish step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  await dialog
    .getByText("More options · Knowledge, tools and advanced settings", {
      exact: true,
    })
    .click();
  await dialog
    .getByRole("combobox", { name: "Step kind", exact: true })
    .click();
  await page.getByRole("option", { name: "conversation", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Step prompt", exact: true })
    .fill("Ask if anything else is needed.");
  await dialog
    .getByRole("button", { name: "+ Add connection", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Connection name", exact: true })
    .fill("Another request");
  await dialog.getByRole("combobox", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Ask", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Language condition", exact: true })
    .fill("The caller has another request");
  await dialog
    .getByRole("button", { name: "Create connection", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  exported = parse(await exportYaml(page, "convert.yaml"));
  expect(exported.nodes.end.kind).toBe("conversation");
  expect(exported.nodes.end.edges[0].to).toBe("ask");
});

test("conversion reuses editable retained action settings and never loses unapplied mappings on Save", async ({
  page,
}) => {
  const source =
    "version: 1\nid: retained\nname: Retained\nstart: ask\nshared_prompt: Help.\nfields: {recipient: {type: string}, backup: {type: string}}\ntools: [transfer_call]\nnodes:\n  ask:\n    kind: conversation\n    title: Ask\n    prompt: Ask.\n    tool: transfer_call\n    requires: [recipient]\n    arguments: {recipient: recipient}\n    edges: [{id: done, to: end, condition: Finished}]\n  end: {kind: end, title: Finish}\n";
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "retained.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(source),
  });
  await page
    .getByRole("button", { name: "Open Ask step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Step settings",
    exact: true,
  });
  await dialog.getByText("Retained action settings", { exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Retained input recipient", exact: true })
    .click();
  await page.getByRole("option", { name: "backup", exact: true }).click();
  await dialog
    .getByRole("group", { name: "Retained required fields", exact: true })
    .getByRole("checkbox", { name: "Backup backup", exact: true })
    .check();
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  let exported = parse(await exportYaml(page, "retained.yaml"));
  expect(exported.nodes.ask.arguments.recipient).toBe("backup");
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  await dialog
    .getByText("More options · Knowledge, tools and advanced settings", {
      exact: true,
    })
    .click();
  await dialog
    .getByRole("combobox", { name: "Step kind", exact: true })
    .click();
  await page.getByRole("option", { name: "action", exact: true }).click();
  for (const result of [
    "connected",
    "unavailable",
    "failed",
    "timeout",
    "unknown",
  ]) {
    await dialog
      .getByRole("combobox", { name: `Destination for ${result}`, exact: true })
      .click();
    await page.getByRole("option", { name: "Finish", exact: true }).click();
  }
  await dialog
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Input for recipient", exact: true })
    .click();
  await page.getByRole("option", { name: "Recipient", exact: true }).click();
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(/apply/i);
  await dialog
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save step", exact: true }).click();
  const output = await exportYaml(page, "retained.yaml");
  exported = parse(output);
  expect(exported.nodes.ask.edges).toHaveLength(5);
  expect(exported.nodes.ask.arguments.recipient).toBe("recipient");
  expect(
    (
      await page.request.post("/api/workflow/validate", {
        data: { source: output },
      })
    ).ok(),
  ).toBe(true);
});
