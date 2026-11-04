import { expect, test } from "@playwright/test";
test("default voice credentials use LiveKit and stay out of drafts", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page
    .getByRole("button", { name: "Test connection settings", exact: true })
    .click();
  await expect(
    page.getByLabel("LiveKit API key", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("LiveKit API secret", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Deepgram API key", { exact: true }),
  ).toBeHidden();
  await page
    .getByLabel("LiveKit API secret", { exact: false })
    .fill("test-private-livekit-secret");
  await page.screenshot({ path: info.outputPath("livekit-connection.png") });
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("test-private-livekit-secret");
  await page
    .getByRole("button", { name: "Close connection settings", exact: true })
    .click();
  await page.getByRole("tab", { name: "YAML", exact: true }).click();
  await expect(page.locator(".cm-content")).not.toContainText(
    "test-private-livekit-secret",
  );
});
test("voice integration and credential route are separate settings", async ({
  page,
}, info) => {
  await page.goto("/studio");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Models & speech", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Voice integration", exact: true }),
  ).toContainText("LiveKit");
  await page
    .getByRole("combobox", { name: "Speech credentials", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "Direct plugins · individual provider keys",
      exact: true,
    })
    .click();
  await page.screenshot({
    path: info.outputPath("livekit-model-settings.png"),
  });
  await page
    .getByRole("button", { name: "Test connection settings", exact: true })
    .click();
  await expect(
    page.getByLabel("AssemblyAI API key", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Cartesia API key", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("LiveKit API secret", { exact: true }),
  ).toBeHidden();
});
