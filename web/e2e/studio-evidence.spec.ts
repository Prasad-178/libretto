import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { parse, stringify } from "yaml";

let folder: string, evidence: string, diagnosticWorkflow: string;
const root = resolve(process.cwd(), "..");
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "libretto-evidence-browser-"));
  const scenario = parse(
    readFileSync(
      join(root, "examples/scenarios/repair-interrupted.scenario.yaml"),
      "utf8",
    ),
  );
  scenario.workflow = join(root, "examples/repair_visit/agent.yaml");
  scenario.sensitive_fields = ["address"];
  const source = join(folder, "test.scenario.yaml");
  evidence = join(folder, "evidence.json");
  writeFileSync(source, stringify(scenario, { schema: "yaml-1.1" }));
  const booking = parse(
    readFileSync(
      join(root, "examples/scenarios/repair-booking.scenario.yaml"),
      "utf8",
    ),
  );
  booking.workflow = scenario.workflow;
  booking.sensitive_fields = ["address"];
  writeFileSync(
    join(folder, "z-booking.scenario.yaml"),
    stringify(booking, { schema: "yaml-1.1" }),
  );
  const workflow = parse(readFileSync(scenario.workflow, "utf8"));
  workflow.knowledge = {};
  workflow.common_knowledge = [];
  workflow.nodes.collect.edges.push({
    id: "premature",
    to: "book",
    condition: "Try without details",
  });
  diagnosticWorkflow = join(folder, "diagnostic.yaml");
  writeFileSync(
    diagnosticWorkflow,
    stringify(workflow, { schema: "yaml-1.1" }),
  );
  const missing = {
    ...scenario,
    name: "Repair: missing details",
    workflow: diagnosticWorkflow,
    steps: [
      {
        kind: "turn",
        id: "attempt",
        text: "try",
        evaluation: { matches: ["premature"] },
      },
      { kind: "expect", action_count: 0 },
    ],
    expected_stages: ["collect"],
    expected_codes: ["missing_facts"],
  };
  writeFileSync(
    join(folder, "zz-missing.scenario.yaml"),
    stringify(missing, { schema: "yaml-1.1" }),
  );
  execFileSync(
    "uv",
    ["run", "libretto", "test", folder, "--output", evidence],
    { cwd: root },
  );
});
test.afterAll(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
});

for (const width of [1440, 1024]) {
  test(`saved evidence stays read-only and navigable at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    let sockets = 0;
    page.on("websocket", (socket) => {
      if (socket.url().includes("/api/")) sockets += 1;
    });
    await page.goto("/studio");
    await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
    const button = page.getByRole("button", {
      name: "Open saved test",
      exact: true,
    });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Saved test evidence" });
    await dialog.getByLabel("Evidence JSON file").setInputFiles(evidence);
    await expect(
      dialog.getByText("Replay · saved scripted test", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("The open YAML differs from this saved test."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Show step in workflow" }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "Next event", exact: true })
      .click();
    await dialog.getByRole("button", { name: /Confirmation withheld/ }).click();
    await expect(
      dialog.getByText("missing_readback", { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator('nav button[aria-current="step"]')).toHaveCount(
      1,
    );
    await expect(
      dialog.getByRole("button", { name: /Confirmation withheld/ }),
    ).toHaveAttribute("aria-current", "step");
    await expect(dialog.getByText("7 Test St", { exact: true })).toHaveCount(0);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(800);
    await page.screenshot({
      path: info.outputPath(`saved-evidence-${width}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    expect(sockets).toBe(0);
  });
}

test("invalid saved files preserve recovery and matching YAML enables explicit navigation", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved test", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Saved test evidence" });
  await dialog.getByLabel("Evidence JSON file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Evidence JSON file").setInputFiles(evidence);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open YAML", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(join(root, "examples/repair_visit/agent.yaml"));
  await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved test", exact: true })
    .click();
  await dialog.getByLabel("Evidence JSON file").setInputFiles(evidence);
  await expect(
    dialog.getByText("Matches the open YAML", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /Confirmation withheld/ }).click();
  await dialog
    .getByRole("button", { name: "Show step in workflow", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Edit step", exact: true }),
  ).toContainText("Confirm visit");
});

test("switching saved scenarios resets the replay position and outcome", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved test", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Saved test evidence" });
  await dialog.getByLabel("Evidence JSON file").setInputFiles(evidence);
  await dialog.getByRole("button", { name: /Confirmation withheld/ }).click();
  await dialog.getByRole("combobox", { name: "Saved scenario" }).click();
  await page
    .getByRole("option", {
      name: "Repair: delivered and approved",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Previous event", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByText(
      "1 simulated action receipt · Conversation not completed",
      { exact: true },
    ),
  ).toBeVisible();
  await dialog.getByRole("combobox", { name: "Saved scenario" }).click();
  await page
    .getByRole("option", {
      name: "Repair: interrupted readback blocks booking",
      exact: true,
    })
    .click();
  await expect(
    dialog.getByText(
      "0 simulated action receipts · Conversation not completed",
      { exact: true },
    ),
  ).toBeVisible();
});

test("saved diagnostics open the exact connection without editing source", async ({
  page,
}) => {
  await page.goto("/studio");
  await page.getByRole("button", { name: "Open YAML", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(diagnosticWorkflow);
  await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
  await page
    .getByRole("button", { name: "Open saved test", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Saved test evidence" });
  await dialog.getByLabel("Evidence JSON file").setInputFiles(evidence);
  await dialog.getByRole("combobox", { name: "Saved scenario" }).click();
  await page
    .getByRole("option", { name: "Repair: missing details", exact: true })
    .click();
  await dialog.getByRole("button", { name: /Action blocked/ }).click();
  await expect(dialog.getByText(/Needs:.*Address/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Inspect connection", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Edit route",
    exact: true,
  });
  await expect(
    inspector.getByRole("textbox", { name: "Language condition", exact: true }),
  ).toHaveValue("Try without details");
});

test("saved policy navigation opens the rule directly, cancels cleanly and can be repeated", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/studio");
  await page.getByRole("button", { name: "Open YAML", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(join(root, "examples/repair_visit/agent.yaml"));
  const expectedSource = readFileSync(join(root, "examples/repair_visit/agent.yaml"), "utf8");
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("libretto.studio.draft.v1") || "{}").source)).toBe(expectedSource);
  const sourceBefore = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("libretto.studio.draft.v1") || "{}")
        .source,
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("tab", { name: "Test & debug", exact: true }).click();
    await page
      .getByRole("button", { name: "Open saved test", exact: true })
      .click();
    const evidenceDialog = page.getByRole("dialog", {
      name: "Saved test evidence",
    });
    await evidenceDialog
      .getByLabel("Evidence JSON file")
      .setInputFiles(evidence);
    await evidenceDialog
      .getByRole("button", { name: /Confirmation withheld/ })
      .click();
    await evidenceDialog
      .getByRole("button", { name: "Inspect confirmation rule", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "Step settings",
      exact: true,
    });
    await expect(
      settings.getByRole("region", { name: "Confirmation rule booking" }),
    ).toBeVisible();
    if (!attempt)
      await page.screenshot({
        path: info.outputPath("direct-rule-1024.png"),
        animations: "disabled",
      });
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings).not.toBeVisible();
  }
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("libretto.studio.draft.v1") || "{}")
          .source,
    ),
  ).toBe(sourceBefore);
});
