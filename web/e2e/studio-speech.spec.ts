import { exportYaml } from "./helpers";
import { parse } from "yaml";
import { expect, test } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";
const source = readFileSync(
  path.resolve("src/studio/fixtures/intake.yaml"),
  "utf8",
);
async function speechPage(page: any, rows = 0) {
  const pronunciations = Array.from(
    { length: rows },
    (_, n) => `    - {word: Term${n}, say_as: spoken${n}}`,
  ).join("\n");
  await page.goto("/studio");
  await page.getByLabel("Open workflow files").setInputFiles({
    name: "speech.yaml",
    mimeType: "application/yaml",
    buffer: Buffer.from(
      source +
        `\nspeech:\n  engine: livekit\n  credential_mode: inference\n  stt: {provider: assemblyai, model: universal-streaming}\n  tts: {provider: cartesia, model: sonic-3, voice: 9626c31c-bec5-4cca-baa8-f8ba9e84c8bc}\n  pronunciations: ${rows ? "\n" + pronunciations : "[]"}\n`,
    ),
  });
  await page.getByRole("tab", { name: "Agent", exact: true }).click();
  await page.getByRole("button", { name: "Speech", exact: true }).click();
}
test("speech separates recognition vocabulary and synthesis pronunciations in real YAML", async ({
  page,
}, info) => {
  await speechPage(page);
  await expect(
    page.getByRole("heading", { name: "Speech recognition STT" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voice output TTS" }),
  ).toBeVisible();
  const terms = page.getByRole("textbox", {
    name: "Add recognition term",
    exact: true,
  });
  await terms.fill("Libretto");
  await terms.press("Enter");
  await expect(
    page.getByRole("button", { name: "Remove recognition term Libretto" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add pronunciation", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "New pronunciation word", exact: true })
    .fill("Libretto");
  await page
    .getByRole("textbox", { name: "New pronunciation say as", exact: true })
    .fill("lih-BRET-oh");
  await page
    .getByRole("button", { name: "Save pronunciation", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Pronunciation word 1", exact: true }),
  ).toHaveValue("Libretto");
  await expect(
    page.getByRole("button", { name: "Choose voice", exact: true }),
  ).toContainText("Jacqueline");
  await page.screenshot({ path: info.outputPath("speech-panes-1440.png") });
  const exported = await exportYaml(page, "speech.yaml");
  expect(parse(exported).speech.pronunciations).toEqual([
    { word: "Libretto", say_as: "lih-BRET-oh" },
  ]);
  expect(parse(exported).speech.hints).toEqual(["Libretto"]);
  const validation = await page.request.post("/api/workflow/validate", {
    data: { source: exported },
  });
  expect(validation.ok()).toBe(true);
});
for (const width of [1440, 1024])
  test(`TTS owns its scroll and voice picker stays anchored at ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await speechPage(page, 28);
    const tts = page.getByRole("region", { name: "Voice output settings" });
    const stt = page.getByRole("region", {
      name: "Speech recognition settings",
    });
    const before = await page.evaluate(() => ({
      root: document.scrollingElement!.scrollTop,
      settings: document.querySelector(".settings-content")!.scrollTop,
    }));
    await tts.hover();
    await page.mouse.wheel(0, 10000);
    await expect
      .poll(() => tts.evaluate((el: any) => el.scrollTop))
      .toBeGreaterThan(500);
    await expect(
      page.getByRole("textbox", { name: "Pronunciation word 28", exact: true }),
    ).toBeInViewport();
    expect(await stt.evaluate((el) => el.scrollTop)).toBe(0);
    expect(
      await page.evaluate(() => ({
        root: document.scrollingElement!.scrollTop,
        settings: document.querySelector(".settings-content")!.scrollTop,
      })),
    ).toEqual(before);
    await tts.evaluate((el) => (el.scrollTop = 0));
    const trigger = page.getByRole("button", {
      name: "Choose voice",
      exact: true,
    });
    await trigger.click();
    const popup = page.getByRole("dialog", {
      name: "Choose voice",
      exact: true,
    });
    await expect(
      popup.getByRole("button", { name: /Jacqueline/ }),
    ).toBeVisible();
    const b = await popup.boundingBox();
    const t = await trigger.boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(width);
    expect(
      Math.min(
        Math.abs(b!.y - (t!.y + t!.height)),
        Math.abs(b!.y + b!.height - t!.y),
      ),
    ).toBeLessThan(14);
    await tts.evaluate((el) => (el.scrollTop = 35));
    await expect
      .poll(async () => {
        const moved = await popup.boundingBox(),
          anchor = await trigger.boundingBox();
        return Math.min(
          Math.abs(moved!.y - (anchor!.y + anchor!.height)),
          Math.abs(moved!.y + moved!.height - anchor!.y),
        );
      })
      .toBeLessThan(14);
    await page.screenshot({
      path: info.outputPath(`voice-picker-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await popup.getByRole("button", { name: /Blake/ }).click();
    await expect(trigger).toContainText("Blake");
  });

test("account voices paginate in session memory and keys never enter saved YAML", async ({
  page,
}, info) => {
  const requests: any[] = [];
  await page.route("**/api/studio/voices", async (route) => {
    const request = route.request(),
      body = request.postDataJSON();
    requests.push({ body, key: request.headers()["x-cartesia-key"] });
    const account = !!request.headers()["x-cartesia-key"];
    const voices = account
      ? [
          {
            id: body.cursor ? "own-two" : "own-one",
            name: body.cursor ? "Second account voice" : "First account voice",
            language: "en",
          },
        ]
      : [{ id: "suggestion", name: "Suggested voice", language: "en" }];
    await route.fulfill({
      json: {
        kind: account ? "account" : "suggested",
        voices,
        nextCursor: account && !body.cursor ? "own-one" : null,
        source: "https://api.cartesia.ai/voices",
        guidance: "Account metadata only",
        checkedAt: "2026-11-12",
      },
    });
  });
  await speechPage(page);
  await page
    .getByRole("combobox", { name: "Speech credentials", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "Direct plugins · individual provider keys",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Configure test connection", exact: true })
    .click();
  await page
    .getByLabel("Cartesia API key", { exact: false })
    .fill("private-catalog-key");
  await page
    .getByRole("button", { name: "Close connection settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose voice", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Choose voice", exact: true });
  await expect(
    popup.getByRole("button", { name: /First account voice/ }),
  ).toBeVisible();
  await popup
    .getByRole("button", { name: "Load more voices", exact: true })
    .click();
  await popup.getByRole("button", { name: /Second account voice/ }).click();
  expect(
    requests.some(
      (r) => r.body.cursor === "own-one" && r.key === "private-catalog-key",
    ),
  ).toBe(true);
  expect(
    requests.every(
      (r) => !JSON.stringify(r.body).includes("private-catalog-key"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage })),
  ).not.toContain("private-catalog-key");
  const exported = await exportYaml(page, "speech.yaml");
  expect(parse(exported).speech.tts.voice).toBe("own-two");
  expect(exported).not.toContain("private-catalog-key");
});

test("voice search discards delayed results and preserves the configured custom ID", async ({
  page,
}) => {
  let release: () => void = () => {};
  let requested = false;
  const delayed = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/studio/voices", async (route) => {
    const { query } = route.request().postDataJSON();
    if (query === "old") {
      requested = true;
      await delayed;
    }
    await route
      .fulfill({
        json: {
          kind: "suggested",
          voices: query
            ? [{ id: query, name: `${query} voice`, language: "en" }]
            : [],
          nextCursor: null,
          guidance: "Suggestions",
          checkedAt: "2026-11-12",
        },
      })
      .catch(() => {});
  });
  await speechPage(page);
  const trigger = page.getByRole("button", {
    name: "Choose voice",
    exact: true,
  });
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "Choose voice", exact: true }),
    search = popup.getByRole("textbox", { name: "Search voices", exact: true });
  await expect(
    popup.getByText(
      "No voices match this search. Your current voice remains configured.",
      { exact: true },
    ),
  ).toBeVisible();
  await search.fill("old");
  expect(
    await popup
      .getByText(
        "No voices match this search. Your current voice remains configured.",
        { exact: true },
      )
      .count(),
  ).toBe(0);
  await expect.poll(() => requested).toBe(true);
  await search.fill("new");
  await expect(
    popup.getByRole("button", { name: "new voice · en", exact: true }),
  ).toBeVisible();
  release();
  await expect(
    popup.getByRole("button", { name: "old voice · en", exact: true }),
  ).toHaveCount(0);
  await popup
    .getByRole("button", { name: "Enter voice ID", exact: true })
    .click();
  await popup
    .getByRole("textbox", { name: "Custom voice ID", exact: true })
    .fill("kept-custom-voice");
  await popup
    .getByRole("button", { name: "Use voice ID", exact: true })
    .click();
  await expect(trigger).toContainText("kept-custom-voice");
});

for (const [width, height] of [
  [1280, 720],
  [1024, 640],
])
  test(`speech keyboard editing remains reachable in ${width}x${height} CSS space`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    await speechPage(page, 28);
    const field = page.getByRole("textbox", {
      name: "Pronunciation say as 28",
      exact: true,
    });
    await field.focus();
    await expect(field).toBeInViewport();
    await field.fill("updated pronunciation");
    await field.press("Tab");
    const tts = page.getByRole("region", { name: "Voice output settings" });
    await expect
      .poll(() => tts.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await page
        .getByRole("region", { name: "Speech recognition settings" })
        .evaluate((el) => el.scrollTop),
    ).toBe(0);
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollTop),
    ).toBe(0);
    await tts.evaluate((el) => (el.scrollTop = 0));
    await page
      .getByRole("button", { name: "Choose voice", exact: true })
      .click();
    const popup = page.getByRole("dialog", {
      name: "Choose voice",
      exact: true,
    });
    await expect(
      popup.getByRole("textbox", { name: "Search voices", exact: true }),
    ).toBeFocused();
    const bounds = await popup.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: info.outputPath(`speech-small-${width}-${height}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Choose voice", exact: true }),
    ).toBeFocused();
  });
