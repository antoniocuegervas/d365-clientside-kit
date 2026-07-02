import * as React from "react";
import { render, screen } from "@testing-library/react";
import {
  SmartComponent,
  ViewModelContextProvider,
} from "../../../../shared/context/ViewModelContextProvider";
import { Observable } from "../../../../shared/reactivity/Observable";
import { createFakeViewModelContext } from "../../../mocks/fakeViewModelContext";

class WhoAmI extends SmartComponent {
  override render(): React.ReactNode {
    return <div data-testid="user">{this.vmContext.user.name}</div>;
  }
}

class BrokenOutsideProvider extends SmartComponent {
  override render(): React.ReactNode {
    return <div>{this.vmContext.user.name}</div>;
  }
}

class ObservingConsumer extends SmartComponent<{ label: Observable<string> }> {
  constructor(props: { label: Observable<string> }) {
    super(props);
    this.observe(props.label);
  }

  override render(): React.ReactNode {
    return <div data-testid="label">{this.props.label.value}</div>;
  }
}

describe("ViewModelContextProvider (React bridge)", () => {
  it("provides the context to class consumers via contextType", () => {
    const { context } = createFakeViewModelContext();
    render(
      <ViewModelContextProvider context={context}>
        <WhoAmI />
      </ViewModelContextProvider>
    );
    expect(screen.getByTestId("user").textContent).toBe("Fake User");
  });

  it("throws a developer-readable error outside a provider", () => {
    // React logs the error boundary noise; silence for the assertion.
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BrokenOutsideProvider />)).toThrow(
      /requires a ViewModelContextProvider/
    );
    consoleError.mockRestore();
  });

  it("SmartComponent inherits ObserverComponent re-rendering", async () => {
    const { context } = createFakeViewModelContext();
    const label = new Observable<string>("before");
    render(
      <ViewModelContextProvider context={context}>
        <ObservingConsumer label={label} />
      </ViewModelContextProvider>
    );
    expect(screen.getByTestId("label").textContent).toBe("before");
    await React.act(async () => {
      label.value = "after";
    });
    expect(screen.getByTestId("label").textContent).toBe("after");
  });

  it("unsubscribes on unmount (no leak, no dead re-render)", () => {
    const { context } = createFakeViewModelContext();
    const label = new Observable<string>("x");
    const { unmount } = render(
      <ViewModelContextProvider context={context}>
        <ObservingConsumer label={label} />
      </ViewModelContextProvider>
    );
    expect(label.subscriberCount).toBe(1);
    unmount();
    expect(label.subscriberCount).toBe(0);
    expect(() => {
      label.value = "y";
    }).not.toThrow();
  });
});
