import { expect, test } from "@playwright/test";
import path from "node:path";
const catalog = {
  status: "fresh",
  fetchedAt: "2026-11-12T12:00:00Z",
  source: "https://openrouter.ai/api/v1/models",
  currency: "USD",
  priceBasis:
    "Catalog base token rates; additional provider charges may apply.",
  models: [
    {
      id: "google/gemini-3.5-flash",
      name: "Google: Gemini Flash",
      pricing: { inputPerMillion: "1.5", outputPerMillion: "9", request: null },
      reasoning: {
        supported_efforts: ["high", "medium", "low", "minimal"],
        default_effort: "medium",
        mandatory: true,
      },
    },
    {
      id: "anthropic/test-model",
      name: "Anthropic: Test Model",
      pricing: {
        inputPerMillion: "0",
        outputPerMillion: null,
        request: "0.001",
      },
      reasoning: { supported_efforts: ["high", "low"] },
    },
    {
      id: "custom/no-effort",
      name: "No effort metadata",
      pricing: { inputPerMillion: null, outputPerMillion: null, request: null },
    },
  ],
};
test("catalog selection, reasoning reset and controller model retain source-backed edits", async ({
  page,
}, info) => {
  await page.route("**/api/studio/models", (r) => r.fulfill({ json: catalog }));
  await page.goto("/studio");
  await page
    .getByLabel("Open workflow files")
    .setInputFiles(path.resolve("src/studio/fixtures/intake.yaml"));
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Model settings →", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose response model", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Choose response model",
    exact: true,
  });
  await expect(dialog.getByText("$1.5 / $9", { exact: true })).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Search models", exact: true })
    .fill("Test Model");
  await dialog.getByRole("radio", { name: /Anthropic: Test Model/ }).check();
  await page.screenshot({ path: info.outputPath("model-picker.png") });
  await dialog.getByRole("button", { name: "Use model", exact: true }).click();
  const slider = page.getByRole("slider", {
    name: "Response reasoning",
    exact: true,
  });
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "Minimal (retained override)",
  );
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "High");
  await page.getByRole("button", { name: "Default", exact: true }).click();
  await expect(page.getByText("Model default", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("reasoning-compact.png") });
  await page
    .getByRole("button", { name: "Stage controller", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose controller model", exact: true })
    .click();
  await page.getByRole("radio", { name: /No effort metadata/ }).check();
  await page.getByRole("button", { name: "Use model", exact: true }).click();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText(
    "speaker: anthropic/test-model",
  );
  await expect(page.locator(".cm-content")).toContainText(
    "evaluator: custom/no-effort",
  );
  await expect(page.locator(".cm-content")).toContainText("reasoning: default");
});
test("offline catalog keeps custom IDs and Escape returns focus without changing the model", async ({
  page,
}, info) => {
  await page.route("**/api/studio/models", (r) =>
    r.fulfill({ status: 503, json: { detail: "Offline" } }),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page
    .getByRole("button", { name: "Model settings →", exact: true })
    .click();
  const trigger = page.getByRole("button", {
    name: "Choose response model",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Choose response model",
    exact: true,
  });
  await expect(dialog.getByText(/Catalog unavailable/)).toBeVisible();
  await dialog.getByRole("button", { name: "Custom ID", exact: true }).click();
  await dialog
    .getByRole("textbox", { name: "Custom model ID" })
    .fill("my-provider/exact-id");
  await dialog.getByRole("button", { name: "Use model", exact: true }).click();
  await expect(trigger).toContainText("my-provider/exact-id");
  await trigger.click();
  await page.screenshot({ path: info.outputPath("models-offline-1024.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText("my-provider/exact-id");
  await expect(
    page.getByRole("slider", { name: "Response reasoning" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Stage controller", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand controller instructions" })
    .click();
  const expanded = page.getByRole("textbox", {
    name: "Expanded controller instructions",
  });
  await expect(expanded).toBeFocused();
  await expanded.fill("Use only explicitly stated caller facts.");
  await page.screenshot({
    path: info.outputPath("controller-expanded-1024.png"),
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Expand controller instructions" }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Controller instructions", { exact: true }),
  ).toHaveValue("Use only explicitly stated caller facts.");
});

for (const width of [1280, 1024]) {
  test(`catalog scroll and reported defaults work at ${width}`, async ({
    page,
  }, info) => {
    const many = {
      ...catalog,
      status: "stale",
      models: [
        ...catalog.models,
        ...Array.from({ length: 80 }, (_, n) => ({
          id: `provider/model-${n}`,
          name: `Model ${n}`,
          pricing: {
            inputPerMillion: "0.01",
            outputPerMillion: "0.02",
            request: null,
          },
        })),
      ],
    };
    await page.route("**/api/studio/models", (r) => r.fulfill({ json: many }));
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/studio");
    await page.getByRole("tab", { name: "Agent", exact: true }).click();
    await page
      .getByRole("button", { name: "Model settings →", exact: true })
      .click();
    await page.getByRole("button", { name: "Default", exact: true }).click();
    await expect(
      page.getByText("Default · Medium", { exact: true }),
    ).toBeVisible();
    const slider = page.getByRole("slider", {
      name: "Response reasoning",
      exact: true,
    });
    await slider.focus();
    await slider.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", "Minimal");
    await page
      .getByRole("button", { name: "Choose response model", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Choose response model",
      exact: true,
    });
    await expect(dialog.getByText(/Stale catalog/)).toBeVisible();
    await dialog
      .getByRole("radio", { name: /Model 79 provider\/model-79/ })
      .scrollIntoViewIfNeeded();
    await dialog
      .getByRole("radio", { name: /Model 79 provider\/model-79/ })
      .check();
    await expect(
      dialog.getByRole("button", { name: "Use model", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: info.outputPath(`model-scroll-${width}.png`),
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Choose response model", exact: true }),
    ).toContainText("Gemini Flash");
  });
}
