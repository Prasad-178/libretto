import { expect, test } from "@playwright/test";
import { exportYaml } from "./helpers";
import { parse } from "yaml";

test("action inputs and outcome destinations are source-backed without reordering existing results", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Attempt transfer", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Edit step",
    exact: true,
  });
  await expect(
    inspector.getByRole("heading", {
      name: "Outcome destinations",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector.getByText(/declared.*Python/)).toBeVisible();
  const destination = inspector.getByRole("combobox", {
    name: "Destination for unknown",
    exact: true,
  });
  await destination.click();
  await page.getByRole("option", { name: "Wrap up", exact: true }).click();
  await inspector
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("action-inspector-1440.png") });
  const exported = await exportYaml(page, "receptionist.yaml");
  const workflow = parse(exported);
  expect(
    workflow.nodes.transfer.edges.find((e: any) => e.result === "unknown").to,
  ).toBe("wrap_up");
  const validation = await page.request.post("/api/workflow/validate", {
    data: { source: exported },
  });
  expect(validation.ok()).toBe(true);
});

test("connections expose route identity and YAML order separately from labels", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByRole("button", { name: "Open Identify intent step", exact: true })
    .click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  const route = page.locator(".inspector-transition").first();
  await route.locator("button").first().click();
  const inspector = page.getByRole("complementary", {
    name: "Edit route",
    exact: true,
  });
  await inspector
    .getByText("Advanced connection settings", { exact: true })
    .click();
  const id = inspector.getByRole("textbox", { name: "Route ID", exact: true });
  await id.fill("renamed-route");
  await inspector
    .getByRole("button", { name: "Apply route ID", exact: true })
    .click();
  await expect(id).toHaveValue("renamed-route");
  await inspector
    .getByRole("button", { name: "Move connection later", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("connection-inspector-1440.png"),
  });
  const exported = await exportYaml(page, "receptionist.yaml");
  const workflow = parse(exported);
  expect(workflow.nodes.identify.edges[1].id).toBe("renamed-route");
});

test("removing an unused step stays staged until Save and can be undone", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "simple.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(
      "version: 1\nid: simple\nname: Simple\nstart: end\nshared_prompt: Help.\nnodes:\n  end: {kind: end, title: Finish}\n  spare: {kind: end, title: Spare}\n",
    ),
  });
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page.getByRole("option", { name: "Spare", exact: true }).click();
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
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await expect(dialog.getByText(/will be removed when you save/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Spare step", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  await dialog
    .getByText("More options · Knowledge, tools and advanced settings", {
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remove step", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Spare step", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open Spare step", exact: true }),
  ).toBeVisible();
});

test("state connections can be created visually and removed without losing existing routes", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "connections.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(
      "version: 1\nid: connections\nname: Connections\nstart: ask\nshared_prompt: Help.\nfields: {email: {type: string}}\nnodes:\n  ask:\n    kind: conversation\n    title: Ask\n    prompt: Ask for an email.\n    edges: [{id: done, to: end, condition: The caller is finished}]\n  end: {kind: end, title: Finish}\n",
    ),
  });
  await page
    .getByRole("button", { name: "Open Ask step", exact: true })
    .click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add connection", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Connection name", exact: true })
    .fill("Has email");
  await page.getByRole("combobox", { name: "Go to", exact: true }).click();
  await page.getByRole("option", { name: "Finish", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Continue when", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "Collected information · deterministic check",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Create connection", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Has email/ })
    .filter({ hasText: "Finish" })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Edit route",
    exact: true,
  });
  await inspector
    .getByRole("button", { name: "Delete connection", exact: true })
    .click();
  const exported = await exportYaml(page, "connections.yaml");
  expect(parse(exported).nodes.ask.edges).toEqual([
    { id: "done", to: "end", condition: "The caller is finished" },
  ]);
});

test("a terminal-only workflow can gain a first conversation through Add step", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "empty.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(
      "version: 1\nid: empty\nname: Empty\nstart: end\nshared_prompt: Help.\nnodes:\n  end: {kind: end, title: Finish}\n",
    ),
  });
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Add step",
    exact: true,
  });
  await panel
    .getByRole("textbox", { name: "Step title", exact: true })
    .fill("Ask");
  await panel
    .getByRole("textbox", { name: "Step prompt", exact: true })
    .fill("Ask what they need.");
  await panel
    .getByRole("textbox", { name: "Continue when", exact: true })
    .fill("The caller is finished");
  await panel
    .getByRole("combobox", { name: "Go to after this step", exact: true })
    .click();
  await page.getByRole("option", { name: "Finish", exact: true }).click();
  await panel
    .getByRole("checkbox", { name: "Make this the first step", exact: true })
    .check();
  await panel.getByRole("button", { name: "Add step →", exact: true }).click();
  const workflow = parse(await exportYaml(page, "empty.yaml"));
  expect(workflow.start).toBe("ask");
  expect(workflow.nodes.ask.edges[0].to).toBe("end");
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  expect(parse(await exportYaml(page, "empty.yaml")).nodes.ask).toBeUndefined();
});

test("the independent repair workflow has editable imported action bindings", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(".." + "/examples/repair_visit/agent.yaml");
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page.getByRole("option", { name: "Book visit", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Edit step",
    exact: true,
  });
  await expect(
    panel.getByRole("heading", { name: "Outcome destinations", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/no Python contract/i).first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("repair-action-1440.png") });
});
