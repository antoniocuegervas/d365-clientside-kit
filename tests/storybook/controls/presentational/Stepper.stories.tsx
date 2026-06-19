import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Observable } from "../../../../shared/reactivity/Observable";
import { Stepper, type IStepperStep } from "../../../../shared/controls/presentational/Stepper";

const meta: Meta<typeof Stepper> = {
  title: "Controls/Stepper",
  component: Stepper,
};
export default meta;
type Story = StoryObj<typeof Stepper>;

const steps: IStepperStep[] = [
  { key: "a", label: "Account" },
  { key: "b", label: "Primary contact" },
  { key: "c", label: "Review" },
];

/** The story plays the WizardViewModel: it owns the index, gating, and busy. */
const make = (start = 0, canAdvance = true) => {
  const currentIndex = new Observable<number>(start);
  const can = new Observable<boolean>(canAdvance);
  const isBusy = new Observable<boolean>(false);
  return {
    steps,
    currentIndex,
    canAdvance: can,
    isBusy,
    onBack: () => (currentIndex.value = Math.max(0, currentIndex.value - 1)),
    onNext: () => (currentIndex.value = Math.min(steps.length - 1, currentIndex.value + 1)),
    onFinish: () => {
      isBusy.value = true;
      setTimeout(() => (isBusy.value = false), 1200);
    },
  };
};

export const Interactive: Story = {
  render: () => (
    <Stepper {...make()}>
      <div>Step body goes here. Use Back / Next to move; Finish appears on the last step.</div>
    </Stepper>
  ),
};

export const MidFlow: Story = {
  render: () => (
    <Stepper {...make(1)}>
      <div>Second step body. The first step shows a completed check.</div>
    </Stepper>
  ),
};

export const Gated: Story = {
  name: "Next disabled until the step is valid",
  render: () => (
    <Stepper {...make(0, false)}>
      <div>This step's gate is closed, so Next is disabled.</div>
    </Stepper>
  ),
};

export const Busy: Story = {
  name: "Committing (navigation locked)",
  render: () => {
    const props = make(2);
    props.isBusy.value = true;
    return (
      <Stepper {...props}>
        <div>Final step while the commit runs.</div>
      </Stepper>
    );
  },
};
