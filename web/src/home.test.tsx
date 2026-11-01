import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./Home";
it("links each studio call to action to the dedicated studio route", () => {
  const html = renderToStaticMarkup(<Home />);
  expect(html.match(/href="\/studio"/g) || []).toHaveLength(3);
  expect(html).toContain('id="how-it-works"');
  expect(html).toContain("Language is still probabilistic.");
  expect(html).toContain("Bring your own API keys.");
});
