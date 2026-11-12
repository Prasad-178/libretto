import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { exportYaml } from "./helpers";

test("repair field, confirmation, action and outcome edits compile together and survive reopening", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("../examples/repair_visit/agent.yaml"));
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
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
  await page.getByRole("tab", { name: "Workflow", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Confirm visit step", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Step settings", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Step settings",
    exact: true,
  });
  await settings
    .getByRole("button", { name: "Edit rule", exact: true })
    .click();
  await settings
    .getByRole("checkbox", {
      name: "Wait until the full message has played",
      exact: true,
    })
    .uncheck();
  await settings
    .getByRole("button", { name: "Save step", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page.getByRole("option", { name: "Book visit", exact: true }).click();
  const action = page.getByRole("complementary", {
    name: "Edit step",
    exact: true,
  });
  await action
    .getByRole("combobox", { name: "Input for issue", exact: true })
    .click();
  await page.getByRole("option", { name: "Address", exact: true }).click();
  await action
    .getByRole("combobox", { name: "Destination for unknown", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Collect visit details", exact: true })
    .click();
  await action
    .getByRole("button", { name: "Apply action configuration", exact: true })
    .click();
  const source = await exportYaml(page, "agent.yaml"),
    workflow = parse(source);
  expect(workflow.nodes.book.arguments.customer_name).toBe("caller_name");
  expect(workflow.nodes.book.arguments.issue).toBe("address");
  expect(workflow.confirmations.booking.require_delivery).toBe(false);
  expect(
    workflow.nodes.book.edges.find((edge: any) => edge.result === "unknown").to,
  ).toBe("collect");
  const compiled = spawnSync(
    "uv",
    [
      "run",
      "python",
      "-c",
      'import sys; from pathlib import Path; from libretto import compile_workflow; from examples.repair_visit.tools import create_tools; compile_workflow(sys.stdin.read(),tools=create_tools(),project_root=Path("examples/repair_visit"))',
    ],
    { cwd: path.resolve(".."), input: source, encoding: "utf8" },
  );
  expect(compiled.status, compiled.stderr).toBe(0);
  await page.getByRole("button", { name: "Undo (⌘Z)", exact: true }).click();
  const undone = parse(await exportYaml(page, "agent.yaml"));
  expect(undone.nodes.book.arguments.issue).toBe("issue");
  expect(undone.confirmations.booking.require_delivery).toBe(false);
  await page.getByRole("button", { name: "Redo (⇧⌘Z)", exact: true }).click();
  expect(
    parse(await exportYaml(page, "agent.yaml")).nodes.book.arguments.issue,
  ).toBe("address");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "agent.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(source),
  });
  await page
    .getByRole("combobox", { name: "Jump to step", exact: true })
    .click();
  await page.getByRole("option", { name: "Book visit", exact: true }).click();
  await expect(
    action.getByRole("combobox", { name: "Input for issue", exact: true }),
  ).toContainText("Address");
  await expect(
    action.getByRole("combobox", {
      name: "Destination for unknown",
      exact: true,
    }),
  ).toContainText("Collect visit details");
});
