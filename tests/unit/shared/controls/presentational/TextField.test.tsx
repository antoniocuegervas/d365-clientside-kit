import * as React from "react";
import { render } from "@testing-library/react";
import { Input } from "@fluentui/react-components";
import { TextField } from "../../../../../shared/controls/presentational/TextField";
import { Observable } from "../../../../../shared/reactivity/Observable";

/**
 * TextField (and every kit field control) defaults to Fluent's `filled-darker`
 * appearance so it reads native beside the model-driven New Look fields. Fluent
 * applies the appearance as atomic classes on the Input root, so this pins that
 * TextField renders the filled appearance rather than the plain outline one,
 * without depending on the hashed class names themselves.
 */
describe("TextField appearance", () => {
  const rootOf = (node: HTMLElement): HTMLElement => {
    const root = node.querySelector<HTMLElement>(".fui-Input");
    if (!root) {
      throw new Error("no .fui-Input root rendered");
    }
    return root;
  };

  it("defaults to the filled New Look appearance, distinct from outline", () => {
    // The atomic classes Fluent adds for filled-darker but not for outline.
    const filledRoot = rootOf(render(<Input appearance="filled-darker" />).container);
    const outlineRoot = rootOf(render(<Input appearance="outline" />).container);
    const filledOnly = filledRoot.className
      .split(/\s+/)
      .filter((cls) => cls && !outlineRoot.classList.contains(cls));
    // The appearance really does change the class list (guards the whole premise).
    expect(filledOnly.length).toBeGreaterThan(0);

    const fieldRoot = rootOf(
      render(<TextField label="Account Name" value={new Observable<string | null>("Contoso Ltd")} />).container
    );
    // The element exists and is not rendered with the outline class list.
    expect(fieldRoot.className).not.toBe(outlineRoot.className);
    // And it carries the filled-only class(es), so a revert to outline fails here.
    expect(filledOnly.some((cls) => fieldRoot.classList.contains(cls))).toBe(true);
  });
});
