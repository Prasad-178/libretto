import { expect, test } from "vitest";
import { effortOptions, priceLabel, modelChoices } from "./model-catalog";

test("efforts follow advertised capabilities without inventing defaults", () => {
  expect(effortOptions(undefined)).toEqual([]);
  expect(effortOptions({})).toEqual([]);
  expect(
    effortOptions({
      supported_efforts: ["high", "low", "none"],
      mandatory: true,
    }),
  ).toEqual(["low", "high"]);
  expect(effortOptions({ supported_efforts: null })).toEqual([
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
});
test("zero, tiny and unknown prices remain distinguishable", () => {
  expect(priceLabel("0")).toBe("$0");
  expect(priceLabel(null)).toBe("Unknown");
  expect(priceLabel("0.000000001")).not.toBe("$0");
  expect(priceLabel("1.5")).toBe("$1.5");
});
test("custom/current IDs survive discovery failure and search matches names or IDs", () => {
  const models = [
    {
      id: "google/example",
      name: "Example Flash",
      pricing: { inputPerMillion: null, outputPerMillion: null, request: null },
    },
  ];
  expect(modelChoices(models, "custom/kept", "kept").map((m) => m.id)).toEqual([
    "custom/kept",
  ]);
  expect(modelChoices(models, "custom/kept", "FLASH").map((m) => m.id)).toEqual(
    ["google/example"],
  );
  expect(modelChoices([], "custom/kept", "")[0].id).toBe("custom/kept");
});
