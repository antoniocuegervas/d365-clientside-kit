import { scheduleRender } from "../../../../shared/reactivity/RenderBatch";

/**
 * Lets exactly one queued repaint pass run. Deliberately not an async
 * function: awaiting one of those burns extra turns, which would let a
 * follow-up pass sneak in before the test looks.
 */
function nextPass(): Promise<void> {
  return Promise.resolve();
}

describe("scheduleRender", () => {
  it("collapses repeated requests for the same render into one call", async () => {
    const render = jest.fn();
    scheduleRender(render);
    scheduleRender(render);
    scheduleRender(render);
    expect(render).not.toHaveBeenCalled();
    await nextPass();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("runs each distinct render once in the same pass", async () => {
    const order: string[] = [];
    const first = jest.fn(() => order.push("first"));
    const second = jest.fn(() => order.push("second"));
    scheduleRender(first);
    scheduleRender(second);
    scheduleRender(first);
    await nextPass();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["first", "second"]);
  });

  it("defers a request made during a pass to the next pass", async () => {
    const second = jest.fn();
    const first = jest.fn(() => scheduleRender(second));
    scheduleRender(first);
    await nextPass();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    await nextPass();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a throwing render does not starve the rest of the pass", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const boom = jest.fn(() => {
        throw new Error("render blew up");
      });
      const second = jest.fn();
      scheduleRender(boom);
      scheduleRender(second);
      await nextPass();
      // Both were already off the queue; the second must still repaint, and
      // the failure must leave a trace instead of a silently stale view.
      expect(boom).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "RenderBatch: a queued render threw",
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("runs synchronously while a DOM event is being delivered", () => {
    // Typing and clicking must repaint before the handler returns: React puts
    // a controlled input's shown text back to the last rendered value when
    // the handler ends, so a late render would make the caret jump. React
    // merges updates inside handlers itself, on every version, so running
    // immediately here still paints once.
    const render = jest.fn();
    const target = document.createElement("button");
    document.body.appendChild(target);
    try {
      target.addEventListener("click", () => {
        scheduleRender(render);
        expect(render).toHaveBeenCalledTimes(1);
      });
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      target.remove();
    }
  });
});
