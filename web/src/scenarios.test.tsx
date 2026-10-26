import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as scenarios from "./TestScenarios";
import fixture from "../../examples/test-scenarios.json";

it("prepares a selected scripted line without creating a conversation", () => {
  const data = fixture[0] as scenarios.TestScenario;
  expect(scenarios.prepareScenario(data, 1)).toEqual({
    input: data.steps[1].say,
    transferOutcome: data.transfer_outcome,
    step: 1,
  });
  expect(() => scenarios.prepareScenario(data, 99)).toThrow(/step/i);
});

it("renders fictional test steps, expectations and source documents", () => {
  const html = renderToStaticMarkup(
    <scenarios.TestScenarios
      scenarios={fixture as scenarios.TestScenario[]}
      connected={false}
      connecting={false}
      onPrepare={() => {
        throw new Error("Rendering must not initiate a test");
      }}
      activeId={null}
    />,
  );
  expect(html).toContain("Fictional test data");
  expect(html).toContain("Expected behavior");
  expect(html).toContain("memberships.md");
  expect(html).toContain("Prepare scenario");
  expect(html).not.toContain("All tests passed");
});

it("prevents changing the simulated outcome in a running test", () => {
  const html = renderToStaticMarkup(
    <scenarios.TestScenarios
      scenarios={[fixture[0] as scenarios.TestScenario]}
      connected={true}
      connecting={false}
      onPrepare={() => {}}
      activeId={null}
    />,
  );
  expect(html).toContain("disabled");
  expect(html).toContain("End the current test");
});
