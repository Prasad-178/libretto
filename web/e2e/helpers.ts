import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** Read the actual download; CodeMirror only renders its visible lines. */
export async function exportYaml(
  page: Page,
  filename: string,
): Promise<string> {
  await page.getByRole("button", { name: "Export YAML", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `Download ${filename}`, exact: true })
    .click();
  const file = await (await downloaded).path();
  if (!file) throw new Error("The YAML download did not complete.");
  return (await readFile(file)).toString();
}
