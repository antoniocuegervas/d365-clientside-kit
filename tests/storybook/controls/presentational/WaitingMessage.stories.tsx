import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WaitingMessage } from "../../../../shared/controls/presentational/WaitingMessage";

const meta: Meta<typeof WaitingMessage> = {
  title: "Presentational Controls/WaitingMessage",
  component: WaitingMessage,
  parameters: {
    docs: {
      description: {
        component:
          "Standard loading presentation. Smart wrappers and RecordReady show this while " +
          "metadata or the record loads, so the kit has one loading look instead of per-app " +
          "spinners. A compact inline variant suits field-sized placeholders.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof WaitingMessage>;

export const Default: Story = {
  render: () => <WaitingMessage />,
};
export const CustomMessage: Story = {
  render: () => <WaitingMessage message="Waiting for the record to load…" />,
};
export const Inline: Story = {
  render: () => <WaitingMessage inline message="Loading metadata…" />,
};
