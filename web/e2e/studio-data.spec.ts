import { expect, test } from "@playwright/test";
import { exportYaml } from "./helpers";
import { parse } from "yaml";
test("Collected data edits the selected field and keeps Boolean choices available as inactive values", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Recipient field", exact: true })
    .click();
  const details = page.getByRole("region", {
    name: "Field details",
    exact: true,
  });
  await details
    .getByRole("textbox", {
      name: "What should the agent collect?",
      exact: true,
    })
    .fill("The person the caller wants to speak with.");
  await details
    .getByText("Advanced · Choices and stable field ID", { exact: true })
    .click();
  await details
    .getByRole("textbox", { name: "Add allowed choice", exact: true })
    .fill("Sam");
  await details
    .getByRole("textbox", { name: "Add allowed choice", exact: true })
    .press("Enter");
  const workflow = parse(await exportYaml(page, "receptionist.yaml"));
  expect(workflow.fields.recipient.description).toBe(
    "The person the caller wants to speak with.",
  );
  expect(workflow.fields.recipient.choices).toContain("Sam");
  await details.evaluate((element) => (element.scrollTop = 0));
  await page.screenshot({ path: info.outputPath("collected-data-1440.png") });
  await page
    .getByRole("button", {
      name: "Edit Destination confirmed field",
      exact: true,
    })
    .click();
  await expect(
    details.getByText(/choices do not restrict yes\/no/i),
  ).toBeVisible();
});
test("Tools keeps Python contracts read-only and links to actual action steps", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect transfer_call tool", exact: true })
    .click();
  const details = page.getByRole("region", {
    name: "Tool details",
    exact: true,
  });
  await expect(details).toContainText("Tool result contract");
  await expect(details.getByText("unknown", { exact: true })).toBeVisible();
  await details
    .getByRole("button", { name: "Open Attempt transfer", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Step name", exact: true }),
  ).toHaveValue("Attempt transfer");
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: info.outputPath("tools-1024.png") });
});

test("an omitted task field list keeps Collected data and raw YAML recovery available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles({
      name: "empty-task.yaml",
      mimeType: "application/yaml",
      buffer: Buffer.from(
        "version: 1\nid: task\nname: Task\nstart: end\nshared_prompt: Help.\nfields: {name: {type: string}}\nrequests: {empty: {}}\nnodes: {end: {kind: end}}\n",
      ),
    });
  await page.getByRole("tab", { name: "Collected data", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit Name field", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
  expect(errors).toEqual([]);
});
