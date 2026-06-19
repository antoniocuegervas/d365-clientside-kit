import * as React from "react";
import { act, render } from "@testing-library/react";
import { Observable } from "../../../../shared/reactivity/Observable";
import { ObserverComponent } from "../../../../shared/reactivity/ObserverComponent";

describe("ObserverComponent", () => {
  it("re-renders when an observed value changes", () => {
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
    act(() => {
      obs.value = "b";
    });
    expect(container.textContent).toBe("b");
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
