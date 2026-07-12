import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DegradedState } from "../../../../shared/controls/presentational/DegradedState";

const meta: Meta<typeof DegradedState> = {
  title: "Presentational Controls/DegradedState",
  component: DegradedState,
  parameters: {
    docs: {
      description: {
        component:
          "Friendly degraded-state banner for when a sample cannot run in the current " +
          "environment, for example a missing entity or field. Shown in place of raw SDK errors " +
          "so every sample degrades the same readable way; the host maps the failure to plain " +
          "wording before it reaches here.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof DegradedState>;

export const MissingEntity: Story = {
  render: () => (
    <DegradedState
      title="Opportunity Search is unavailable here"
      message="This sample needs the Opportunity entity, which is not in this environment. It ships with the Sales app."
    />
  ),
};

export const MessageOnly: Story = {
  render: () => (
    <DegradedState message="This view could not be loaded in this environment." />
  ),
};

export const LongMessage: Story = {
  render: () => (
    <DegradedState
      title="Counterparty Activities is unavailable here"
      message="This sample needs the activity and activity party tables, plus read access to the accounts and contacts behind each activity, none of which are present in this environment. Install the Sales or Service app, then reopen the sample to run it."
    />
  ),
};
