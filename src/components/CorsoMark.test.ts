import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CorsoMark } from "./CorsoMark";

describe("Corso's mark", () => {
  it("is a white peak on the navy rounded square, at the size asked", () => {
    const html = renderToStaticMarkup(createElement(CorsoMark, { size: 72 }));
    for (const part of ['width="72"', 'height="72"', 'rx="9"', 'fill="#16233F"', 'fill="white"']) expect(html).toContain(part);
  });

  it("is decoration: the words beside it say the name", () => {
    expect(renderToStaticMarkup(createElement(CorsoMark, { size: 24 }))).toContain('aria-hidden="true"');
  });
});
