import * as React from "react";
import { render } from "@testing-library/react";
import { createViewApp, type IAppHost } from "../../../clientui/AppContract";

// createViewApp only forwards the host to the props factory; our factories ignore it.
const host = {} as IAppHost;

describe("createViewApp", () => {
  it("renders the view and disposes the view model on unmount", () => {
    const dispose = jest.fn();
    const View: React.FC<{ viewModel: { dispose: () => void } }> = () => <div>healthy app</div>;
    const app = createViewApp("Healthy", View, () => ({ viewModel: { dispose } }));

    const { container, unmount } = render(<>{app.render(host)}</>);
    expect(container.textContent).toContain("healthy app");
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("contains a view mount throw and still disposes the view model", () => {
    // React logs the caught error; silence it so the run stays clean.
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const dispose = jest.fn();
    const Boom: React.FC = () => {
      throw new Error("view boom");
    };
    const app = createViewApp("Boom", Boom, () => ({ viewModel: { dispose } }));

    // The boundary (below the disposer) catches the throw, so render does not crash
    // and the disposer still commits.
    const { container, unmount } = render(<>{app.render(host)}</>);
    expect(container.textContent).toContain("could not be displayed");

    // Because the disposer stayed mounted, unmount disposes the already-built view model.
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
