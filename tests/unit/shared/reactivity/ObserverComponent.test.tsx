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
});
