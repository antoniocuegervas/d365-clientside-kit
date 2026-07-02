import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { Observable } from "../../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../../shared/reactivity/ObserverComponent";

describe("ObserverComponent", () => {
  it("re-renders when an observed value changes", async () => {
    const obs = new Observable<string>("a");
    class Probe extends ObserverComponent {
      constructor(props: object) {
        super(props);
        this.observe(obs);
      }
      override render(): React.ReactNode {
        return <span>{obs.value}</span>;
      }
    }

    const { container } = render(<Probe />);
    expect(container.textContent).toBe("a");
    // A write outside a DOM event repaints on the next pass, so await it.
    await act(async () => {
      obs.value = "b";
    });
    expect(container.textContent).toBe("b");
  });

  it("warns once, in development, when a render reads an Observable it does not observe", () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const observed = new Observable<string>("seen");
      const unobserved = new Observable<string>("missed");
      class Probe extends ObserverComponent {
        constructor(props: object) {
          super(props);
          this.observe(observed);
        }
        override render(): React.ReactNode {
          return (
            <span>
              {observed.value}
              {unobserved.value}
            </span>
          );
        }
      }
      const { rerender } = render(<Probe />);
      // The unobserved render read warns, naming the component and the fix.
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      expect(String(consoleWarn.mock.calls[0][0])).toContain("Probe");
      expect(String(consoleWarn.mock.calls[0][0])).toContain("observe(");
      // Once per component + observable pair, not once per render.
      rerender(<Probe />);
      expect(consoleWarn).toHaveBeenCalledTimes(1);
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("does not warn for reads outside a render (ViewModels, handlers, async code)", () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const observed = new Observable<string>("seen");
      const outside = new Observable<string>("fine");
      class Probe extends ObserverComponent {
        constructor(props: object) {
          super(props);
          this.observe(observed);
        }
        override render(): React.ReactNode {
          return <span>{observed.value}</span>;
        }
      }
      render(<Probe />);
      // A plain read with no render in flight is the ViewModel pattern; silent.
      expect(outside.value).toBe("fine");
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("does not warn when a child function component reads a parent-observed value", () => {
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      // The documented Body pattern: the observer observes, a plain function
      // component it renders does the reading. The function body runs outside
      // the observer's render() call, so the check must stay quiet.
      const observed = new Observable<string>("shared");
      const Body: React.FC = () => <span>{observed.value}</span>;
      class Probe extends ObserverComponent {
        constructor(props: object) {
          super(props);
          this.observe(observed);
        }
        override render(): React.ReactNode {
          return <Body />;
        }
      }
      const { container } = render(<Probe />);
      expect(container.textContent).toBe("shared");
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("paints once for a burst of writes to several observed values", async () => {
    const first = new Observable<number>(0);
    const second = new Observable<number>(0);
    const third = new Observable<number>(0);
    let renders = 0;
    class Probe extends ObserverComponent {
      constructor(props: object) {
        super(props);
        this.observe(first, second, third);
      }
      override render(): React.ReactNode {
        renders += 1;
        return <span>{first.value + second.value + third.value}</span>;
      }
    }

    const { container } = render(<Probe />);
    expect(renders).toBe(1);
    // The ViewModel pattern this protects: an async continuation (a finished
    // data load) writes several observables in a row. The queue hands React
    // ONE render request, so even a React without automatic merging paints once.
    await act(async () => {
      first.value = 1;
      second.value = 2;
      third.value = 3;
    });
    expect(renders).toBe(2);
    expect(container.textContent).toBe("6");
  });

  it("re-renders before an event handler returns, so typing stays intact", () => {
    const obs = new Observable<string>("");
    class Probe extends ObserverComponent {
      constructor(props: object) {
        super(props);
        this.observe(obs);
      }
      override render(): React.ReactNode {
        return (
          <input
            value={obs.value}
            onChange={(event) => {
              obs.value = event.target.value;
            }}
          />
        );
      }
    }

    const { container } = render(<Probe />);
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "typed" } });
    // No await: during event delivery the repaint is synchronous.
    expect(input.value).toBe("typed");
  });

  it("skips the queued repaint when the component unmounted first", async () => {
    const obs = new Observable<number>(0);
    let renders = 0;
    class Probe extends ObserverComponent {
      constructor(props: object) {
        super(props);
        this.observe(obs);
      }
      override render(): React.ReactNode {
        renders += 1;
        return null;
      }
    }

    const { unmount } = render(<Probe />);
    expect(renders).toBe(1);
    obs.value = 1;
    unmount();
    await act(async () => {});
    expect(renders).toBe(1);
  });

  it("disposes observer subscriptions and runs onUnmount on unmount", () => {
    const obs = new Observable<number>(0);
    const onUnmount = jest.fn();
    class Probe extends ObserverComponent {
      constructor(props: object) {
        super(props);
        this.observe(obs);
      }
      protected override onUnmount(): void {
        // Subclass teardown runs after the base has dropped the subscriptions.
        expect(obs.subscriberCount).toBe(0);
        onUnmount();
      }
      override render(): React.ReactNode {
        return null;
      }
    }

    const { unmount } = render(<Probe />);
    expect(obs.subscriberCount).toBe(1);
    unmount();
    expect(obs.subscriberCount).toBe(0);
    expect(onUnmount).toHaveBeenCalledTimes(1);
  });

  it("reobserve drops the old subscriptions and renders from the new sources", async () => {
    const first = new Observable<string>("first");
    const second = new Observable<string>("second");
    class Probe extends ObserverComponent<{ source: Observable<string> }> {
      constructor(props: { source: Observable<string> }) {
        super(props);
        this.observe(props.source);
      }
      override componentDidUpdate(prevProps: { source: Observable<string> }): void {
        if (prevProps.source !== this.props.source) {
          this.reobserve(this.props.source);
        }
      }
      override render(): React.ReactNode {
        return <span>{this.props.source.value}</span>;
      }
    }

    const { container, rerender } = render(<Probe source={first} />);
    expect(container.textContent).toBe("first");

    rerender(<Probe source={second} />);
    // The old source is fully released; the new one drives renders.
    expect(first.subscriberCount).toBe(0);
    expect(second.subscriberCount).toBe(1);
    await act(async () => {
      second.value = "updated";
    });
    expect(container.textContent).toBe("updated");
    // Writes to the abandoned source no longer reach the component.
    await act(async () => {
      first.value = "stale";
    });
    expect(container.textContent).toBe("updated");
  });

  it("observe after unmount does not subscribe (nothing left to dispose it)", () => {
    const obs = new Observable<number>(0);
    class Probe extends ObserverComponent {
      observeLate(): void {
        this.observe(obs);
      }
      override render(): React.ReactNode {
        return null;
      }
    }
    const ref = React.createRef<Probe>();
    const { unmount } = render(<Probe ref={ref} />);
    const probe = ref.current!;
    unmount();
    // An async continuation landing after unmount must not leak a subscription
    // that keeps the component alive from the observable's listener set.
    probe.observeLate();
    expect(obs.subscriberCount).toBe(0);
  });

  it("one throwing unsubscribe does not leak the remaining subscriptions", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const healthy = new Observable<number>(0);
      const broken = {
        subscribe: () => () => {
          throw new Error("teardown burst");
        },
      };
      class Probe extends ObserverComponent {
        constructor(props: object) {
          super(props);
          this.observe(broken, healthy);
        }
        override render(): React.ReactNode {
          return null;
        }
      }
      const { unmount } = render(<Probe />);
      expect(healthy.subscriberCount).toBe(1);
      unmount();
      expect(healthy.subscriberCount).toBe(0);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
