import * as React from "react";
import { act, render } from "@testing-library/react";
import { Observable } from "../../../../../shared/reactivity/Observable";
import { Stepper, type IStepperStep } from "../../../../../shared/controls/presentational/Stepper";

const steps: IStepperStep[] = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
];

let mountCount = 0;
class Probe extends React.Component {
  override componentDidMount(): void {
    mountCount += 1;
  }
  override render(): React.ReactNode {
    return <div>body</div>;
  }
}

describe("Stepper", () => {
  it("remounts the step body when the step changes", () => {
    // Smart controls load metadata and bind their value Observable on mount, so
    // the body MUST be a fresh mount per step rather than a reused instance.
    mountCount = 0;
    const currentIndex = new Observable<number>(0);
    const canAdvance = new Observable<boolean>(true);
    render(
      <Stepper
        steps={steps}
        currentIndex={currentIndex}
        canAdvance={canAdvance}
        onBack={() => {}}
        onNext={() => {}}
        onFinish={() => {}}
      >
        <Probe />
      </Stepper>
    );
    expect(mountCount).toBe(1);

    act(() => {
      currentIndex.value = 1;
    });
    expect(mountCount).toBe(2); // body remounted, not reused
  });
});
